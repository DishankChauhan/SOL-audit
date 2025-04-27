'use client';

import React from 'react';
import EscrowFunder from '@/components/tools/EscrowFunder';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ENV } from '@/lib/env';

export default function TestEscrowPage() {
  const wallet = useWallet();

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Escrow Testing Page</h1>
      
      <div className="grid gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Connection Information</CardTitle>
            <CardDescription>Current connection and wallet status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 text-sm">
              <div><strong>Program ID:</strong> {ENV.PROGRAM_ID}</div>
              <div><strong>RPC URL:</strong> {ENV.SOLANA_RPC_URL}</div>
              <div><strong>Wallet Status:</strong> {wallet.connected ? 'Connected' : 'Disconnected'}</div>
              {wallet.publicKey && (
                <div><strong>Wallet Address:</strong> {wallet.publicKey.toString()}</div>
              )}
              <div className="mt-4">
                <WalletMultiButton />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-xl font-bold mb-4">Step 1: Fund the Escrow</h2>
            <p className="mb-4">First, fund your escrow account with SOL to test the functionality.</p>
            <EscrowFunder />
          </div>
          
          <div>
            <h2 className="text-xl font-bold mb-4">Step 2: Test Escrow Operations</h2>
            <p className="mb-4">
              After funding the escrow, go to a bounty submission that you want to approve
              and try the "Pay Auditor" functionality. The funds will be released from
              the escrow you just funded.
            </p>
            <Card>
              <CardContent className="p-6">
                <ol className="list-decimal list-inside space-y-2">
                  <li>Fund the escrow using the form on the left</li>
                  <li>Navigate to a bounty submission page</li>
                  <li>Click "Pay Auditor" to release funds from escrow</li>
                  <li>Confirm the transaction in your wallet</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
} 