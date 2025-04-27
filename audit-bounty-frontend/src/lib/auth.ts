import { ENV } from './env';

// List of admin wallet addresses
const ADMIN_ADDRESSES: string[] = ENV.ADMIN_WALLETS ? ENV.ADMIN_WALLETS.split(',') : [];

/**
 * Check if a wallet address belongs to an admin
 * @param walletAddress Solana wallet address to check
 * @returns boolean indicating if address is an admin
 */
export function checkIsAdmin(walletAddress: string): boolean {
  if (!walletAddress) return false;
  
  // Normalize the wallet address
  const normalizedAddress = walletAddress.trim();
  
  return ADMIN_ADDRESSES.includes(normalizedAddress);
} 