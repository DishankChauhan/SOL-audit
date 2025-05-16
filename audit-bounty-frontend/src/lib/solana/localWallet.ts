import { Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { WalletReadyState, WalletName } from '@solana/wallet-adapter-base';
import nacl from 'tweetnacl';

// Create fixed keypairs with proper Base58 encoding
const CREATOR_KEYPAIR = Keypair.generate();
const AUDITOR_KEYPAIR = Keypair.generate();
const VALIDATOR_KEYPAIR = Keypair.generate();

// Store keypairs by role for easy access
const TEST_KEYPAIRS: Record<string, Keypair> = {
  creator: CREATOR_KEYPAIR,
  auditor: AUDITOR_KEYPAIR,
  validator: VALIDATOR_KEYPAIR,
};

// Create a mock wallet context state that simulates a real wallet
export function createLocalWallet(role: 'creator' | 'auditor' | 'validator' = 'creator'): WalletContextState {
  const keypair = TEST_KEYPAIRS[role];
  
  // Create a mock wallet context with type assertion
  return {
    publicKey: keypair.publicKey,
    connected: true,
    connecting: false,
    disconnect: async () => {},
    select: async () => {},
    wallet: {
      adapter: {
        publicKey: keypair.publicKey,
        connecting: false,
        connected: true,
        readyState: WalletReadyState.Installed,
        name: 'Local Test Wallet' as WalletName,
        icon: '',
        disconnect: async () => {},
        connect: async () => {},
        sendTransaction: async () => { return ''; },
        supportedTransactionVersions: null,
      } as any,
      readyState: WalletReadyState.Installed,
    },
    
    // This is the main method we need for signing transactions
    signTransaction: async <T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> => {
      if (transaction instanceof Transaction) {
        transaction.sign(keypair);
        return transaction as T;
      }
      throw new Error('VersionedTransaction not supported in local wallet');
    },
    
    // Other methods we might need
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> => {
      return transactions.map(tx => {
        if (tx instanceof Transaction) {
          tx.sign(keypair);
          return tx as T;
        }
        throw new Error('VersionedTransaction not supported in local wallet');
      });
    },
    
    signMessage: async (message: Uint8Array) => {
      return nacl.sign.detached(message, keypair.secretKey);
    }
  } as unknown as WalletContextState;
}

// Helper to get the specific test keypairs
export function getTestKeypair(role: 'creator' | 'auditor' | 'validator'): Keypair {
  return TEST_KEYPAIRS[role];
}

// Helper to get a wallet's address as string
export function getWalletAddress(role: 'creator' | 'auditor' | 'validator'): string {
  return TEST_KEYPAIRS[role].publicKey.toString();
}

// Helper to fund a test keypair
export async function fundTestWallet(
  role: 'creator' | 'auditor' | 'validator', 
  amountSol: number
): Promise<void> {
  const { getSolanaConnection } = await import('../../services/solana');
  const connection = getSolanaConnection();
  
  // Fund this address via airdrop (only works on localnet or devnet)
  const signature = await connection.requestAirdrop(
    TEST_KEYPAIRS[role].publicKey, 
    amountSol * 1000000000 // Convert SOL to lamports
  );
  
  await connection.confirmTransaction(signature);
  console.log(`Funded ${role} wallet with ${amountSol} SOL: ${TEST_KEYPAIRS[role].publicKey.toString()}`);
}

/**
 * Get the balance of a test wallet in SOL
 * @param role The role to check (creator, auditor, validator)
 * @returns The balance in SOL
 */
export async function getTestWalletBalance(
  role: 'creator' | 'auditor' | 'validator'
): Promise<number> {
  const { getSolanaConnection } = await import('../../services/solana');
  const connection = getSolanaConnection();
  
  const balance = await connection.getBalance(TEST_KEYPAIRS[role].publicKey);
  return balance / 1000000000; // Convert lamports to SOL
}

/**
 * Get information about all test wallets
 * @returns Object with wallet addresses and balances
 */
export async function getAllTestWalletInfo(): Promise<{
  [role in 'creator' | 'auditor' | 'validator']: {
    address: string;
    balance: number;
  }
}> {
  const { getSolanaConnection } = await import('../../services/solana');
  const connection = getSolanaConnection();
  
  // Get all balances in parallel
  const balancePromises = Object.keys(TEST_KEYPAIRS).map(async (role) => {
    const keypair = TEST_KEYPAIRS[role as keyof typeof TEST_KEYPAIRS];
    const balance = await connection.getBalance(keypair.publicKey);
    return {
      role,
      address: keypair.publicKey.toString(),
      balance: balance / 1000000000 // Convert lamports to SOL
    };
  });
  
  const results = await Promise.all(balancePromises);
  
  // Format as object keyed by role
  const walletInfo = {} as {
    [role in 'creator' | 'auditor' | 'validator']: {
      address: string;
      balance: number;
    }
  };
  
  // Populate the object manually instead of using reduce
  results.forEach(({ role, address, balance }) => {
    walletInfo[role as 'creator' | 'auditor' | 'validator'] = { address, balance };
  });
  
  return walletInfo;
}

// Log wallet addresses on load for convenience
console.log('Local testing wallets generated:');
console.log('Creator:', CREATOR_KEYPAIR.publicKey.toString());
console.log('Auditor:', AUDITOR_KEYPAIR.publicKey.toString());
console.log('Validator:', VALIDATOR_KEYPAIR.publicKey.toString()); 