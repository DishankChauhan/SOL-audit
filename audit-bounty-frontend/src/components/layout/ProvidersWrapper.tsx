'use client';

import { ReactNode } from 'react';
import { WalletContextProvider } from '@/context/WalletContext';
import { AuthContextProvider } from '@/context/AuthContext';

export function ProvidersWrapper({ children }: { children: ReactNode }) {
  return (
    <WalletContextProvider>
      <AuthContextProvider>
        {children}
      </AuthContextProvider>
    </WalletContextProvider>
  );
} 