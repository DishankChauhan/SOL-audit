import { WalletContextState } from '@solana/wallet-adapter-react';

// Global store for wallet context
let globalWalletContext: WalletContextState | null = null;

/**
 * Set the wallet context state for use outside of React components
 */
export function setWalletContextState(wallet: WalletContextState): void {
  globalWalletContext = wallet;
}

/**
 * Get the wallet context state for use outside of React components
 * @throws Error if the wallet context is not initialized
 */
export function getWalletContextState(): WalletContextState {
  if (!globalWalletContext) {
    throw new Error('Wallet context not initialized. Use setWalletContextState first.');
  }
  return globalWalletContext;
}

/**
 * Reset the global wallet context
 */
export function resetWalletContextState(): void {
  globalWalletContext = null;
} 