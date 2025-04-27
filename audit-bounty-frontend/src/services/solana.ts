import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SendTransactionError,
  Commitment,
  ConfirmOptions,
  sendAndConfirmTransaction,
  Keypair,
  LAMPORTS_PER_SOL,
  TransactionSignature
} from '@solana/web3.js';
import * as borsh from '@project-serum/borsh';
import BN from 'bn.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import * as nacl from 'tweetnacl';
import { Buffer } from 'buffer';
import bs58 from 'bs58';

import { 
  getSolanaConnection, 
  getConnection,
  programId, 
  lamportsToSol, 
  solToLamports,
  deriveBountyPDA,
  deriveVaultPDA
} from '../lib/solana/config';

import {
  createBounty,
  submitWork,
  approveSubmission,
  claimBounty,
  cancelBounty,
  createInitializeBountyTransaction,
  confirmTransaction
} from '../lib/solana/transactions';

// Status enum to match the contract's BountyStatus
export enum BountyStatus {
  Open = 0,
  Approved = 1,
  Claimed = 2,
  Cancelled = 3,
}

// Interface for bounty data
export interface BountyData {
  creator: PublicKey;
  hunter: PublicKey | null;
  amount: number; // in lamports
  deadline: number; // unix timestamp
  status: BountyStatus;
  initialized: boolean;
}

// Borsh schema for reading bounty account data
const bountySchema = borsh.struct([
  borsh.publicKey('creator'),
  borsh.option(borsh.publicKey(), 'hunter'),
  borsh.u64('amount'),
  borsh.i64('deadline'),
  borsh.u8('status'),
  borsh.bool('initialized'),
]);

/**
 * Service class for interacting with the Solana contract
 */
export class SolanaService {
  // Static methods for wallet verification and bounty initialization
  static async verifyWalletOwnership(wallet: WalletContextState): Promise<{
    verified: boolean;
    message?: string;
    signature?: string;
  }> {
    try {
      if (!wallet.publicKey || !wallet.signMessage) {
        return { verified: false, message: 'Wallet not connected or does not support signing' };
      }

      // Create a message to sign
      const message = `Verify wallet ownership: ${wallet.publicKey.toString()} at ${new Date().toISOString()}`;
      const messageBytes = new TextEncoder().encode(message);
      
      // Sign the message
      const signatureBytes = await wallet.signMessage(messageBytes);
      const signature = Buffer.from(signatureBytes).toString('base64');
      
      // Verify the signature
      const verified = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        wallet.publicKey.toBytes()
      );
      
      if (!verified) {
        return { verified: false, message: 'Signature verification failed' };
      }
      
      return { verified: true, message, signature };
    } catch (error) {
      console.error('Error verifying wallet ownership:', error);
      return { 
        verified: false, 
        message: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  static async initializeBounty(
    wallet: WalletContextState,
    bountyData: {
      title: string;
      description: string;
      repoUrl: string;
      amount: number;  // in SOL
      deadline: Date;
      tags: string[];
      severityWeights: {
        critical: number;
        high: number;
        medium: number;
        low: number;
        informational: number;
      };
    }
  ): Promise<{ 
    status: 'success' | 'error'; 
    signature?: string; 
    bountyId?: string;
    message?: string;
  }> {
    try {
      if (!wallet.publicKey || !wallet.signTransaction) {
        return { status: 'error', message: 'Wallet not connected or does not support signing' };
      }

      const connection = getSolanaConnection();
      
      // Convert deadline to unix timestamp
      const deadlineTimestamp = Math.floor(bountyData.deadline.getTime() / 1000);
      
      // Create a fixed seed that will be used for this bounty 
      // We need a shorter seed (max 32 bytes), so use a hash of the wallet + timestamp
      const timestamp = Date.now().toString();
      // Use just the last 6 chars of wallet address + timestamp to keep it short
      const customSeedStr = `${wallet.publicKey.toString().slice(-6)}_${timestamp}`;
      const customSeed = new Uint8Array(Buffer.from(customSeedStr));
      
      // Verify the seed is under 32 bytes
      if (customSeed.length > 32) {
        console.error("Seed too long:", customSeed.length, "bytes");
        return { status: 'error', message: 'Custom seed too long (max 32 bytes)' };
      }
      
      console.log("Creating bounty with custom seed:", customSeedStr, "length:", customSeed.length, "bytes");
      
      // Create the bounty transaction
      const { transaction, bountyPda, vaultPda } = await createBounty(
        connection,
        wallet.publicKey,
        bountyData.amount,
        deadlineTimestamp,
        customSeed
      );
      
      // Set recent blockhash and fee payer
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;
      
      // Sign and send transaction
      const signedTx = await wallet.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      
      console.log("Transaction sent with signature:", signature);

      // Use a more reliable method for confirmation that doesn't depend on WebSockets
      try {
        // First try with blocking confirmation
        console.log("Confirming transaction...");
        const confirmation = await connection.confirmTransaction(
          {
            signature,
            lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight,
            blockhash: transaction.recentBlockhash!
          },
          'confirmed'
        );
        
        if (confirmation.value.err) {
          console.error("Transaction confirmed with error:", confirmation.value.err);
          return {
            status: 'error',
            signature,
            message: `Transaction confirmed but failed: ${JSON.stringify(confirmation.value.err)}`
          };
        }
      } catch (confirmError) {
        console.warn("Confirmation via websocket failed, checking transaction status directly:", confirmError);
        
        // If WebSocket confirmation fails, check transaction status directly
        try {
          // Poll for transaction status as fallback
          let status = null;
          let retries = 10;
          
          while (retries > 0 && status === null) {
            try {
              status = await connection.getSignatureStatus(signature);
              if (status && status.value && status.value.confirmationStatus === 'confirmed') {
                break;
              }
              status = null; // Reset if not confirmed yet
            } catch (pollError) {
              console.warn("Error polling transaction status:", pollError);
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
            retries--;
          }
          
          if (!status || !status.value) {
            console.warn("Could not confirm transaction after polling");
          } else if (status.value.err) {
            console.error("Transaction failed:", status.value.err);
            return {
              status: 'error',
              signature,
              message: `Transaction failed: ${JSON.stringify(status.value.err)}`
            };
          }
        } catch (pollError) {
          console.error("Error checking transaction status:", pollError);
          // Continue as we don't want to fail the operation just because of confirmation issues
        }
      }

      // Transaction was confirmed successfully, now save to Firebase
      try {
        // Import Firebase SDK
        const { getFirestore, doc, setDoc } = await import('firebase/firestore');
        const { getAuth } = await import('firebase/auth');
        
        // Get current user
        const auth = getAuth();
        const user = auth.currentUser;
        
        if (!user) {
          console.warn("No authenticated user found when saving bounty to Firebase");
        }
        
        const db = getFirestore();
        
        // Get display name from auth.currentUser or fallback to a non-empty value
        const displayName = user?.displayName || user?.email?.split('@')[0] || wallet.publicKey.toString().slice(0, 6);
        console.log("Using display name for bounty:", displayName);
        
        // Prepare bounty data for Firebase
        const bountyDocData = {
          title: bountyData.title,
          description: bountyData.description,
          repoUrl: bountyData.repoUrl,
          amount: bountyData.amount,
          tokenMint: 'SOL', // Native SOL
          deadline: new Date(bountyData.deadline),
          severityWeights: bountyData.severityWeights,
          tags: bountyData.tags,
          status: 'open',
          owner: user?.uid,
          ownerName: displayName, // Use the properly resolved display name
          walletAddress: wallet.publicKey.toString(),
          createdAt: new Date(),
          updatedAt: new Date(),
          submissionCount: 0,
          approvedCount: 0,
          solanaAddress: wallet.publicKey.toString(),
          bountyPda: bountyPda.toString(),
          vaultPda: vaultPda.toString(),
          transactionHash: signature,
          createdBy: wallet.publicKey.toString(),
          creatorUid: user?.uid || '',
          id: bountyPda.toString()
        };
        
        // Save to Firebase using the bountyPda as document ID
        await setDoc(doc(db, 'bounties', bountyPda.toString()), bountyDocData);
        console.log("Bounty saved to Firebase with ID:", bountyPda.toString());
      } catch (firebaseError) {
        console.error("Error saving bounty to Firebase:", firebaseError);
        return { 
          status: 'success', 
          signature, 
          bountyId: bountyPda.toString(),
          message: 'Transaction confirmed but there was an error saving to the database. Please refresh in a few moments.'
        };
      }

      // Return success
      return { 
        status: 'success', 
        signature, 
        bountyId: bountyPda.toString() 
      };
    } catch (error) {
      console.error('Error initializing bounty:', error);
      return { 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private connection: Connection;
  
  constructor(
    private wallet: WalletContextState,
    endpoint?: string
  ) {
    this.connection = endpoint ? getConnection(endpoint) : getSolanaConnection();
  }
  
  /**
   * Create a new bounty
   */
  async createBounty(
    amount: number, // in SOL
    deadline: number, // unix timestamp
    customSeed?: Uint8Array
  ): Promise<{ signature: string, bountyPda: string, vaultPda: string }> {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }
    
    try {
      // Create the transaction
      const { transaction, bountyPda, vaultPda } = await createBounty(
        this.connection,
        this.wallet.publicKey,
        amount,
        deadline,
        customSeed
      );
      
      // Set the transaction fee payer
      transaction.feePayer = this.wallet.publicKey;
      
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      
      // Sign and send the transaction
      if (!this.wallet.signTransaction) {
        throw new Error('Wallet does not support transaction signing');
      }
      
      const signedTx = await this.wallet.signTransaction(transaction);
      const signature = await this.connection.sendRawTransaction(signedTx.serialize());
      
      // Confirm transaction
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      return {
        signature,
        bountyPda: bountyPda.toString(),
        vaultPda: vaultPda.toString()
      };
    } catch (error) {
      console.error('Error creating bounty:', error);
      throw error;
    }
  }
  
  /**
   * Submit work for a bounty
   */
  async submitWork(
    bountyPda: string,
    submissionUrl: string
  ): Promise<string> {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }
    
    try {
      // Create the transaction
      const transaction = await submitWork(
        this.connection,
        this.wallet.publicKey,
        new PublicKey(bountyPda),
        submissionUrl
      );
      
      // Set the transaction fee payer
      transaction.feePayer = this.wallet.publicKey;
      
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      
      // Sign and send the transaction
      if (!this.wallet.signTransaction) {
        throw new Error('Wallet does not support transaction signing');
      }
      
      const signedTx = await this.wallet.signTransaction(transaction);
      const signature = await this.connection.sendRawTransaction(signedTx.serialize());
      
      // Confirm transaction
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      return signature;
    } catch (error) {
      console.error('Error submitting work:', error);
      throw error;
    }
  }
  
  /**
   * Approve a hunter's submission
   */
  async approveSubmission(
    bountyPda: string,
    hunterPubkey: string
  ): Promise<string> {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }
    
    try {
      // Create the transaction
      const transaction = await approveSubmission(
        this.connection,
        this.wallet.publicKey,
        new PublicKey(bountyPda),
        new PublicKey(hunterPubkey)
      );
      
      // Set the transaction fee payer
      transaction.feePayer = this.wallet.publicKey;
      
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      
      // Sign and send the transaction
      if (!this.wallet.signTransaction) {
        throw new Error('Wallet does not support transaction signing');
      }
      
      const signedTx = await this.wallet.signTransaction(transaction);
      const signature = await this.connection.sendRawTransaction(signedTx.serialize());
      
      // Confirm transaction
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      return signature;
    } catch (error) {
      console.error('Error approving submission:', error);
      throw error;
    }
  }
  
  /**
   * Claim bounty reward
   */
  async claimBounty(
    bountyPda: string
  ): Promise<string> {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }
    
    try {
      // Create the transaction
      const transaction = await claimBounty(
        this.connection,
        this.wallet.publicKey,
        new PublicKey(bountyPda)
      );
      
      // Set the transaction fee payer
      transaction.feePayer = this.wallet.publicKey;
      
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      
      // Sign and send the transaction
      if (!this.wallet.signTransaction) {
        throw new Error('Wallet does not support transaction signing');
      }
      
      const signedTx = await this.wallet.signTransaction(transaction);
      const signature = await this.connection.sendRawTransaction(signedTx.serialize());
      
      // Confirm transaction
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      return signature;
    } catch (error) {
      console.error('Error claiming bounty:', error);
      throw error;
    }
  }
  
  /**
   * Cancel a bounty
   */
  async cancelBounty(
    bountyPda: string
  ): Promise<string> {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }
    
    try {
      // Create the transaction
      const transaction = await cancelBounty(
        this.connection,
        this.wallet.publicKey,
        new PublicKey(bountyPda)
      );
      
      // Set the transaction fee payer
      transaction.feePayer = this.wallet.publicKey;
      
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      
      // Sign and send the transaction
      if (!this.wallet.signTransaction) {
        throw new Error('Wallet does not support transaction signing');
      }
      
      const signedTx = await this.wallet.signTransaction(transaction);
      const signature = await this.connection.sendRawTransaction(signedTx.serialize());
      
      // Confirm transaction
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      return signature;
    } catch (error) {
      console.error('Error canceling bounty:', error);
      throw error;
    }
  }
  
  /**
   * Fetch bounty data from the blockchain
   */
  async getBountyData(bountyPda: string): Promise<BountyData | null> {
    try {
      const accountInfo = await this.connection.getAccountInfo(new PublicKey(bountyPda));
      
      if (!accountInfo || !accountInfo.data) {
        return null;
      }
      
      // Deserialize the account data
      const bountyData = bountySchema.decode(accountInfo.data);
      
      return {
        creator: bountyData.creator,
        hunter: bountyData.hunter,
        amount: Number(bountyData.amount),
        deadline: Number(bountyData.deadline),
        status: bountyData.status,
        initialized: bountyData.initialized,
      };
    } catch (error) {
      console.error('Error fetching bounty data:', error);
      return null;
    }
  }
  
  /**
   * Get SOL balance of a wallet
   */
  async getBalance(publicKey: string = this.wallet.publicKey?.toString() || ''): Promise<number> {
    try {
      const balance = await this.connection.getBalance(new PublicKey(publicKey));
      return lamportsToSol(balance);
    } catch (error) {
      console.error('Error getting balance:', error);
      return 0;
    }
  }
}

// Create a hook for using the SolanaService in components
export function useSolanaService(wallet: WalletContextState): SolanaService {
  return new SolanaService(wallet);
}

/**
 * Initialize a bounty with the given parameters
 */
export async function initializeBounty(
  walletAddress: string,
  bountyAmount: number,
  deadline: number,
  customSeed?: string
): Promise<{ transaction: string; message: string }> {
  console.log(`Creating bounty with custom seed: ${customSeed} length: ${customSeed?.length} bytes`);
  
  const connection = getSolanaConnection();
  const ownerPublicKey = new PublicKey(walletAddress);
  
  // Convert SOL to lamports
  const lamports = bountyAmount * LAMPORTS_PER_SOL;
  
  try {
    // Create a transaction for initializing the bounty
    const transaction = await createInitializeBountyTransaction(
      lamports,
      walletAddress,
      deadline,
      ''
    );
    
    // Serialize the transaction to base64
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });
    const base64Transaction = Buffer.from(serializedTransaction).toString('base64');
    
    // Return the transaction for signing by the wallet
    return {
      transaction: base64Transaction,
      message: 'Please sign this transaction to initialize the bounty'
    };
  } catch (error) {
    console.error('Error in initializeBounty:', error);
    throw new Error(`Failed to initialize bounty: ${(error as Error).message}`);
  }
}

/**
 * Process a signed transaction and confirm it on the blockchain
 * using only HTTP polling (WebSockets completely disabled)
 */
export async function processSignedTransaction(
  signedTransaction: string
): Promise<{ signature: string; confirmed: boolean }> {
  try {
    const connection = getSolanaConnection();
    
    // Decode the signed transaction
    const transaction = Transaction.from(Buffer.from(signedTransaction, 'base64'));
    
    // Send the transaction to the network
    console.log('Sending transaction to the network...');
    const signature = await connection.sendRawTransaction(transaction.serialize());
    console.log('Transaction sent with signature:', signature);
    
    // Skip WebSocket attempt entirely and go straight to HTTP polling
    console.log('Using HTTP polling for transaction confirmation...');
    return await pollTransactionStatus(connection, signature);
  } catch (error) {
    console.error('Error processing signed transaction:', error);
    throw new Error(`Transaction failed: ${(error as Error).message}`);
  }
}

/**
 * Poll for transaction status using HTTP requests
 */
async function pollTransactionStatus(
  connection: Connection,
  signature: string,
  timeoutMs: number = 60000
): Promise<{ signature: string; confirmed: boolean }> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      // Get the transaction status
      const status = await connection.getSignatureStatus(signature);
      
      // Check if the transaction exists and has a status
      if (status && status.value) {
        // Check for errors
        if (status.value.err) {
          console.error('Transaction failed:', status.value.err);
          return { signature, confirmed: false };
        }
        
        // Check if confirmed or finalized
        if (
          status.value.confirmationStatus === 'confirmed' ||
          status.value.confirmationStatus === 'finalized'
        ) {
          console.log(`Transaction confirmed successfully via polling with status: ${status.value.confirmationStatus}`);
          return { signature, confirmed: true };
        }
      }
      
      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.warn('Error polling for transaction status:', error);
      // Continue polling despite errors
    }
  }
  
  console.error('Transaction confirmation timed out after', timeoutMs, 'ms');
  return { signature, confirmed: false };
} 