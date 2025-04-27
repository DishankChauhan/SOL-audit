import { PublicKey, Transaction } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction } from '@solana/spl-token';
import { getSolanaConnection } from '@/lib/solana/config';
import { ENV } from '@/lib/env';

// USDC token mint address (Devnet)
export const USDC_MINT = new PublicKey(ENV.USDC_MINT);

export class TokenService {
  /**
   * Fund a bounty with USDC tokens
   */
  static async fundBountyWithUSDC(
    wallet: WalletContextState,
    bountyId: string,
    amount: number
  ): Promise<{ status: 'success' | 'error'; signature?: string; message?: string }> {
    try {
      if (!wallet.publicKey || !wallet.signTransaction) {
        return { status: 'error', message: 'Wallet not connected or does not support signing' };
      }

      const connection = getSolanaConnection();
      const bountyEscrow = new PublicKey(bountyId);

      // Convert amount to token amount (USDC has 6 decimals)
      const tokenAmount = Math.floor(amount * 1_000_000);

      // Get the associated token account for the sender
      const senderTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        wallet.publicKey
      );

      // Get or create the associated token account for the bounty escrow
      const escrowTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        bountyEscrow,
        true // allowOwnerOffCurve = true for PDAs
      );

      // Check if the escrow token account exists
      const escrowAccountInfo = await connection.getAccountInfo(escrowTokenAccount);
      
      // Create transaction
      const transaction = new Transaction();

      // If the escrow token account doesn't exist, create it
      if (!escrowAccountInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey, // payer
            escrowTokenAccount, // associated token account address
            bountyEscrow, // owner
            USDC_MINT // mint
          )
        );
      }

      // Add transfer instruction
      transaction.add(
        createTransferInstruction(
          senderTokenAccount, // source
          escrowTokenAccount, // destination
          wallet.publicKey, // owner
          tokenAmount // amount
        )
      );

      // Set recent blockhash and fee payer
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;

      // Sign and send transaction
      const signedTx = await wallet.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');

      return { status: 'success', signature };
    } catch (error) {
      console.error('Error funding bounty with USDC:', error);
      return { 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
} 