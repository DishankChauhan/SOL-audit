'use client';

import { ReactNode, useMemo, createContext, useContext, useEffect, useState } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { ENV } from '@/lib/env';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { getCluster } from '@/lib/solana/config';

// Import with a workaround to avoid PostCSS processing issues with Tailwind
require('@solana/wallet-adapter-react-ui/styles.css');

export const WalletContext = createContext({});

export function WalletContextProvider({ children }: { children: ReactNode }) {
  // Determine the network from the RPC URL
  const cluster = getCluster();
  
  // Set network based on the cluster
  const network = useMemo(() => {
    // WalletAdapterNetwork doesn't have localnet, default to Devnet for adapters
    if (cluster === 'localnet') return WalletAdapterNetwork.Devnet;
    if (cluster === 'mainnet-beta') return WalletAdapterNetwork.Mainnet;
    if (cluster === 'testnet') return WalletAdapterNetwork.Testnet;
    return WalletAdapterNetwork.Devnet;
  }, [cluster]);

  // You can also provide a custom RPC endpoint
  const endpoint = ENV.SOLANA_RPC_URL;
  
  // Log to make sure we're using the right network
  console.log(`Connecting to Solana ${cluster} at ${endpoint}`);

  // @solana/wallet-adapter-wallets includes all the adapters but supports tree shaking and lazy loading
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
    ],
    [network]
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletStateProvider>{children}</WalletStateProvider>
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}

// Separate component to handle wallet state
function WalletStateProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  // Instead of using useAuth, manage our own state for current user
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Listen for auth state changes directly
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    
    return () => unsubscribe();
  }, []);

  // Store wallet in global context for use outside of React components
  useEffect(() => {
    // Dynamically import to avoid SSR issues
    import('@/lib/solana/wallet-helper').then(({ setWalletContextState }) => {
      setWalletContextState(wallet);
    });
  }, [wallet]);

  useEffect(() => {
    const saveWalletAddress = async () => {
      if (wallet.connected && wallet.publicKey && currentUser) {
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          
          // Get current user data
          const userSnap = await getDoc(userRef);
          const userData = userSnap.exists() ? userSnap.data() : {};
          
          // Update user document with wallet address
          await setDoc(userRef, {
            ...userData,
            walletAddress: wallet.publicKey.toString(),
            lastUpdated: new Date()
          }, { merge: true });
          
          console.log('Wallet address saved to user profile');
        } catch (error) {
          console.error('Error saving wallet address:', error);
        }
      }
    };

    saveWalletAddress();
  }, [wallet.connected, wallet.publicKey, currentUser]);

  return (
    <WalletContext.Provider value={wallet}>
      {children}
    </WalletContext.Provider>
  );
} 