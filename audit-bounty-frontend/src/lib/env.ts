import { config } from 'dotenv';

// Load environment variables from .env.local
if (typeof window === 'undefined') {
  config({ path: '.env.local' });
}

// Export environment variables with proper fallbacks
export const ENV = {
  // For local development
  LOCAL_PROGRAM_ID: '3SE4NFRETdK2tmfzH15pBLYatzzcT4EfALM1MRdL9RC5',
  // Original devnet program ID
  DEVNET_PROGRAM_ID: '3SE4NFRETdK2tmfzH15pBLYatzzcT4EfALM1MRdL9RC5',
  // Use local program ID when in development/localhost mode, otherwise use devnet
  PROGRAM_ID: '3SE4NFRETdK2tmfzH15pBLYatzzcT4EfALM1MRdL9RC5',
  SOLANA_RPC_URL: 'https://solana-devnet.g.alchemy.com/v2/h7esQF88WJnfEzX7BR9kR_s4LFhIB2P2',
  SOLANA_NETWORK: 'devnet',
  USDC_MINT: process.env.NEXT_PUBLIC_USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  ADMIN_WALLETS: process.env.ADMIN_WALLETS || '',
}; 