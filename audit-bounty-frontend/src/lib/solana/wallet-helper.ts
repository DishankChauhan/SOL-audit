import { WalletContextState } from '@solana/wallet-adapter-react';

/**
 * Set global wallet context state for client-side use
 */
export const setWalletContextState = (wallet: WalletContextState): void => {
  if (typeof window !== 'undefined') {
    (window as any).solanaWalletContextState = wallet;
  }
};

/**
 * Get global wallet context state for client-side use
 */
export const getWalletContextState = (): WalletContextState | null => {
  if (typeof window !== 'undefined') {
    return (window as any).solanaWalletContextState || null;
  }
  return null;
}; 