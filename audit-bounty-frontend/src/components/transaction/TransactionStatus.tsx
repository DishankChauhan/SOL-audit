'use client';

import { useState, useEffect } from 'react';
import { SolanaService, TransactionStatus as TxStatus } from '@/services/solana';
import { Loader2, CheckCircle, XCircle, ExternalLink, Clock } from 'lucide-react';
import Link from 'next/link';

interface TransactionStatusProps {
  signature: string;
  onConfirmed?: () => void;
  showExplorer?: boolean;
}

export function TransactionStatus({
  signature,
  onConfirmed,
  showExplorer = true,
}: TransactionStatusProps) {
  const [status, setStatus] = useState<TxStatus>({ status: 'processing' });
  const [intervalId, setIntervalId] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!signature || signature === 'firebase-only') return;

    // Initial status check
    const checkStatus = async () => {
      try {
        const txStatus = await SolanaService.checkTransactionStatus(signature);
        setStatus(txStatus);

        // If confirmed or finalized, trigger callback and stop polling
        if (txStatus.status === 'confirmed' || txStatus.status === 'finalized') {
          if (onConfirmed) {
            onConfirmed();
          }
          if (intervalId) {
            clearInterval(intervalId);
            setIntervalId(null);
          }
        } else if (txStatus.status === 'failed') {
          // If failed, stop polling
          if (intervalId) {
            clearInterval(intervalId);
            setIntervalId(null);
          }
        }
      } catch (error) {
        console.error('Error checking transaction status:', error);
      }
    };

    // Check immediately
    checkStatus();

    // Start polling every 2 seconds
    const id = setInterval(checkStatus, 2000);
    setIntervalId(id);

    // Cleanup on unmount
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [signature, onConfirmed]);

  // For firebase-only operations
  if (signature === 'firebase-only') {
    return (
      <div className="flex items-center text-green-600 space-x-2 my-2">
        <CheckCircle className="h-5 w-5" />
        <span>Operation completed successfully</span>
      </div>
    );
  }

  // For invalid signatures
  if (!signature) {
    return null;
  }

  // Generate explorer URL
  const explorerUrl = `https://explorer.solana.com/tx/${signature}${process.env.NEXT_PUBLIC_SOLANA_NETWORK !== 'mainnet' ? '?cluster=devnet' : ''}`;

  return (
    <div className="my-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center space-x-2">
        {status.status === 'processing' || status.status === 'processed' ? (
          <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
        ) : status.status === 'confirmed' || status.status === 'finalized' ? (
          <CheckCircle className="h-5 w-5 text-green-600" />
        ) : (
          <XCircle className="h-5 w-5 text-red-600" />
        )}

        <div className="flex-1">
          {status.status === 'processing' || status.status === 'processed' ? (
            <p className="text-sm font-medium text-blue-700">
              Processing transaction
              {status.confirmations !== undefined && ` (${status.confirmations} confirmation${status.confirmations !== 1 ? 's' : ''})`}
            </p>
          ) : status.status === 'confirmed' ? (
            <p className="text-sm font-medium text-green-700">Transaction confirmed!</p>
          ) : status.status === 'finalized' ? (
            <p className="text-sm font-medium text-green-700">Transaction finalized!</p>
          ) : (
            <p className="text-sm font-medium text-red-700">
              Transaction failed: {status.error || 'Unknown error'}
            </p>
          )}

          {showExplorer && (
            <div className="mt-1">
              <Link
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
              >
                <span>View on Solana Explorer</span>
                <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </div>
          )}
        </div>

        {status.status === 'processing' || status.status === 'processed' ? (
          <div className="text-xs text-gray-500 flex items-center">
            <Clock className="mr-1 h-3 w-3" />
            <span>Please wait</span>
          </div>
        ) : null}
      </div>

      {signature && (
        <div className="mt-1 text-xs text-gray-500">
          <span className="font-medium">Signature:</span>{' '}
          <span className="font-mono">{`${signature.slice(0, 8)}...${signature.slice(-8)}`}</span>
        </div>
      )}
    </div>
  );
} 