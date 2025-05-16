'use client';

import { ReactNode } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { useWebSocketManager } from '@/hooks/useWebSocketManager';

export function MainLayout({ children }: { children: ReactNode }) {
  // Use the WebSocket manager
  useWebSocketManager();
  
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow">
        {children}
      </main>
      <Footer />
    </div>
  );
} 