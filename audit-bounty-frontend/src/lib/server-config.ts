// Server-side configuration for Solana connections and contracts
import { Connection, PublicKey, Cluster, ConnectionConfig } from '@solana/web3.js';
import { ENV } from './env';

export function getServerConfig() {
  // Get the RPC endpoint
  const rpcEndpoint = process.env.SOLANA_RPC_ENDPOINT || ENV.SOLANA_RPC_URL;
  
  return {
    // Solana RPC endpoint - default to devnet for development
    RPC_ENDPOINT: rpcEndpoint,
    
    // Program ID for the audit bounty program
    PROGRAM_ID: process.env.PROGRAM_ID || ENV.PROGRAM_ID,
    
    // Seed for deriving PDA escrow accounts
    ESCROW_SEED: 'audit-bounty-escrow',
    
    // Confirmations required for transactions
    CONFIRMATIONS: Number(process.env.CONFIRMATIONS) || 1,
    
    // Solana connection options with WebSockets completely disabled
    CONNECTION_OPTIONS: {
      commitment: 'confirmed',
      disableRetryOnRateLimit: false,
      confirmTransactionInitialTimeout: 60000,
      wsEndpoint: undefined // Explicitly disable WebSockets
    } as ConnectionConfig
  };
} 