'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { SolanaService } from '@/services/solana';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface WalletVerifierProps {
  onVerified: (address: string) => void;
  buttonText?: string;
  autoVerify?: boolean;
  className?: string;
}

export function WalletVerifier({
  onVerified,
  buttonText = 'Verify Wallet',
  autoVerify = false,
  className = '',
}: WalletVerifierProps) {
  const wallet = useWallet();
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  // Auto-verify on mount if requested
  useEffect(() => {
    if (autoVerify && wallet.connected && wallet.publicKey) {
      handleVerify();
    }
  }, [autoVerify, wallet.connected, wallet.publicKey]);

  // Check wallet balance when connected
  useEffect(() => {
    const checkBalance = async () => {
      if (wallet.connected && wallet.publicKey) {
        try {
          const balance = await SolanaService.getWalletBalance(wallet.publicKey.toString());
          setWalletBalance(balance);
        } catch (err) {
          console.error('Error checking wallet balance:', err);
        }
      } else {
        setWalletBalance(null);
      }
    };

    checkBalance();
  }, [wallet.connected, wallet.publicKey]);

  const handleVerify = async () => {
    if (!wallet.connected || !wallet.publicKey) {
      setError('Wallet not connected. Please connect your wallet first.');
      return;
    }

    // Check if the wallet has a minimum balance to prevent spam
    if (walletBalance !== null && walletBalance < 0.001) {
      setError('Your wallet must have a minimum balance of 0.001 SOL.');
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      const verification = await SolanaService.verifyWalletOwnership(wallet);
      
      if (verification.verified) {
        setVerified(true);
        onVerified(wallet.publicKey.toString());
      } else {
        setError(verification.message || 'Verification failed. Please try again.');
      }
    } catch (err) {
      setError(`Error verifying wallet: ${(err as Error).message}`);
    } finally {
      setVerifying(false);
    }
  };

  if (verified) {
    return (
      <div className={`flex items-center text-green-600 space-x-2 ${className}`}>
        <CheckCircle className="h-5 w-5" />
        <span>Wallet verified</span>
        {walletBalance !== null && (
          <span className="ml-2 text-xs text-gray-500">({walletBalance.toFixed(4)} SOL)</span>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <Button
        onClick={handleVerify}
        disabled={verifying || !wallet.connected}
        className="flex items-center space-x-2"
      >
        {verifying ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Verifying...</span>
          </>
        ) : (
          <>
            {wallet.connected ? (
              <span>{buttonText}</span>
            ) : (
              <span>Connect wallet first</span>
            )}
          </>
        )}
      </Button>

      {error && (
        <div className="mt-2 text-sm text-red-600 flex items-center">
          <XCircle className="h-4 w-4 mr-2" />
          <span>{error}</span>
        </div>
      )}
      
      {wallet.connected && walletBalance !== null && walletBalance < 0.1 && (
        <div className="mt-2 text-sm text-amber-600 flex items-center">
          <AlertCircle className="h-4 w-4 mr-2" />
          <span>Low balance: {walletBalance.toFixed(4)} SOL</span>
        </div>
      )}
    </div>
  );
} 