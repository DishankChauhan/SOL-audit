'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWallet } from '@solana/wallet-adapter-react';
import { SolanaService } from '@/services/solana';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InfoIcon } from 'lucide-react';

/**
 * Component for initializing and funding an escrow account (for development/testing only)
 */
export default function EscrowFunder() {
  const wallet = useWallet();
  const [amount, setAmount] = useState('1');
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFundEscrow = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setStatus('Please connect your wallet');
      return;
    }

    setIsLoading(true);
    setStatus('Initializing and funding escrow...');

    try {
      const result = await SolanaService.initializeAndFundEscrow(
        wallet,
        parseFloat(amount)
      );

      if (result.status === 'success') {
        setStatus(`Escrow funded successfully with ${amount} SOL! Transaction: ${result.signature}`);
      } else {
        setStatus(`Error: ${result.message}`);
      }
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Test Escrow Funding</CardTitle>
        <CardDescription>Development testing tool - not needed for normal operation</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-4 bg-amber-50 border-amber-200">
          <InfoIcon className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-700">For Development/Testing Only</AlertTitle>
          <AlertDescription className="text-amber-700">
            In normal operation, the escrow is automatically funded when a bounty is created. 
            This tool is only for developers to test the escrow functionality without creating a new bounty.
          </AlertDescription>
        </Alert>
        
        <div className="grid gap-4">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount in SOL"
              step="0.1"
              min="0.1"
              className="flex-1"
            />
            <Button 
              onClick={handleFundEscrow} 
              disabled={isLoading || !wallet.publicKey}
            >
              {isLoading ? 'Processing...' : 'Fund Escrow'}
            </Button>
          </div>
          
          {status && (
            <div className={`p-2 text-sm rounded-md ${
              status.startsWith('Error') 
                ? 'bg-red-100 text-red-800' 
                : status.includes('success') 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-blue-100 text-blue-800'
            }`}>
              {status}
            </div>
          )}
          
          <div className="text-xs text-gray-500 mt-2">
            <p><strong>How it works:</strong> This creates and funds an escrow PDA (Program Derived Address) 
            that is used by the program to hold funds.</p>
            <p><strong>Normal flow:</strong> When creating a bounty, funds are automatically transferred from 
            your wallet to the escrow. This tool bypasses bounty creation for testing purposes.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 