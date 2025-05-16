import { config } from 'dotenv';
import { Cluster } from '@solana/web3.js';

// Load environment variables from .env.local
if (typeof window === 'undefined') {
  config({ path: '.env.local' });
}

// Export environment variables with proper fallbacks
export const ENV = {
  // For local development
  LOCAL_PROGRAM_ID: '3K6VQ96CqESYiVT5kqPy6BU7ZDQbkZhVU4K5Bas7r9eh',
  // Original devnet program ID
  DEVNET_PROGRAM_ID: '3K6VQ96CqESYiVT5kqPy6BU7ZDQbkZhVU4K5Bas7r9eh',
  // Use local program ID when in development/localhost mode, otherwise use devnet
  PROGRAM_ID: '3K6VQ96CqESYiVT5kqPy6BU7ZDQbkZhVU4K5Bas7r9eh',
  SOLANA_RPC_URL: 'http://127.0.0.1:8899',
  SOLANA_NETWORK: 'localnet',
  USDC_MINT: process.env.NEXT_PUBLIC_USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  ADMIN_WALLETS: process.env.ADMIN_WALLETS || '',
};

// Add function to get Solana cluster
export function getSolanaCluster(): Cluster {
  // Use environment variable or default to 'devnet'
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet';
  
  // Ensure it's a valid Cluster value
  if (['devnet', 'testnet', 'mainnet-beta'].includes(cluster)) {
    return cluster as Cluster;
  }
  
  // Default to devnet
  return 'devnet';
} 