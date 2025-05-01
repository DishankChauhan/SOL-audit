import { Connection, Cluster } from '@solana/web3.js';
import { ENV } from '../env';

/**
 * Get a connection to the Solana network
 */
export function getConnection(): Connection {
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'http://127.0.0.1:8899';
  return new Connection(rpcUrl, 'confirmed');
}

/**
 * Get the current Solana cluster based on RPC URL
 */
export function getCluster(): string {
  // Check the RPC URL to determine if it's a localnet connection
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'http://127.0.0.1:8899';
  if (rpcUrl.includes('127.0.0.1') || rpcUrl.includes('localhost')) {
    return 'localnet';
  }
  
  // For non-localnet, use the configured cluster
  return ENV.SOLANA_NETWORK || 'devnet';
}
