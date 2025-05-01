'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Transaction } from '@solana/web3.js';

export default function SolanaTransferTest() {
  const wallet = useWallet();
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('0.01');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [signature, setSignature] = useState('');

  const handleTransfer = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setStatus('error');
      setMessage('Please connect your wallet first');
      return;
    }

    if (!toAddress) {
      setStatus('error');
      setMessage('Please enter a valid recipient address');
      return;
    }

    try {
      setStatus('loading');
      setMessage('Creating transaction...');

      // 1. Create a transaction using our API
      const createResponse = await fetch('/api/solana/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fromWallet: wallet.publicKey.toString(),
          toWallet: toAddress,
          amount: amount,
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.error || 'Failed to create transaction');
      }

      const { transaction: serializedTransaction } = await createResponse.json();
      setMessage('Transaction created, signing...');

      // 2. Deserialize and sign the transaction
      const transactionBuffer = Buffer.from(serializedTransaction, 'base64');
      const transaction = Transaction.from(transactionBuffer);
      const signedTransaction = await wallet.signTransaction(transaction);

      setMessage('Transaction signed, sending to network...');

      // 3. Send the signed transaction
      const sendResponse = await fetch('/api/solana/transaction/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signedTransaction: Buffer.from(signedTransaction.serialize()).toString('base64'),
        }),
      });

      if (!sendResponse.ok) {
        const errorData = await sendResponse.json();
        throw new Error(errorData.error || 'Failed to send transaction');
      }

      const { signature: txSignature, success } = await sendResponse.json();
      setSignature(txSignature);

      if (success) {
        setStatus('success');
        setMessage(`Successfully transferred ${amount} SOL`);
      } else {
        setStatus('error');
        setMessage('Transaction sent but confirmation failed');
      }
    } catch (error) {
      console.error('Transfer error:', error);
      setStatus('error');
      setMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-md">
      <h1 className="text-2xl font-bold mb-4">Solana Transfer Test</h1>
      
      <div className="mb-4">
        <WalletMultiButton className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded" />
      </div>

      {wallet.connected && (
        <div className="bg-gray-100 p-4 rounded mb-4">
          <p>Connected as: <span className="font-mono">{wallet.publicKey?.toString()}</span></p>
        </div>
      )}

      <div className="mb-4">
        <label className="block text-gray-700 mb-2">
          Recipient Address:
          <input
            type="text"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter Solana address"
          />
        </label>
      </div>

      <div className="mb-4">
        <label className="block text-gray-700 mb-2">
          Amount (SOL):
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.001"
            min="0.001"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </label>
      </div>

      <button
        onClick={handleTransfer}
        disabled={status === 'loading' || !wallet.connected}
        className={`w-full py-2 px-4 rounded-md font-medium text-white ${
          status === 'loading'
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-indigo-600 hover:bg-indigo-700'
        }`}
      >
        {status === 'loading' ? 'Processing...' : 'Transfer SOL'}
      </button>

      {message && (
        <div
          className={`mt-4 p-3 rounded-md ${
            status === 'error'
              ? 'bg-red-100 text-red-700'
              : status === 'success'
              ? 'bg-green-100 text-green-700'
              : 'bg-blue-100 text-blue-700'
          }`}
        >
          <p>{message}</p>
          {signature && (
            <p className="mt-2 font-mono text-xs break-all">
              Signature: {signature}
            </p>
          )}
        </div>
      )}
    </div>
  );
} 