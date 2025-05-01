'use client';

import { useState, useEffect } from 'react';
import { PublicKey, Connection, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { getCluster } from '@/lib/solana/config';
import { sendSignedTransactionToLocalnet } from '@/lib/solana/local-sender';

export default function LocalnetChecker() {
  const [isLocalnetRunning, setIsLocalnetRunning] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [genesisHash, setGenesisHash] = useState<string | null>(null);
  const [programInfo, setProgramInfo] = useState<any>(null);
  const [testAccountInfo, setTestAccountInfo] = useState<any>(null);
  const [testTxSignature, setTestTxSignature] = useState<string | null>(null);
  const [testTxSuccess, setTestTxSuccess] = useState<boolean>(false);
  const wallet = useWallet();
  const cluster = getCluster();
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'http://127.0.0.1:8899';
  
  // Program ID from your contract
  const PROGRAM_ID = "Gd2hEeEPdvPN7bPdbkthPZHxsaRNTJWxcpp2pwRWBw4R";

  useEffect(() => {
    async function checkLocalnet() {
      try {
        const connection = new Connection(rpcUrl, 'confirmed');
        
        // Check if the cluster is responding
        const version = await connection.getVersion();
        console.log('Solana version:', version);
        
        // Get the genesis hash to identify the cluster
        const genesisHashInfo = await connection.getGenesisHash();
        setGenesisHash(genesisHashInfo);
        
        // Check if our program exists
        try {
          const programInfo = await connection.getAccountInfo(new PublicKey(PROGRAM_ID));
          setProgramInfo({
            exists: !!programInfo,
            executable: programInfo?.executable,
            owner: programInfo?.owner?.toString(),
            dataSize: programInfo?.data.length,
          });
        } catch (err) {
          setProgramInfo({ error: 'Failed to fetch program info' });
        }
        
        setIsLocalnetRunning(true);
      } catch (err) {
        console.error('Failed to connect to localnet:', err);
        setError(`Failed to connect to localnet: ${err instanceof Error ? err.message : String(err)}`);
        setIsLocalnetRunning(false);
      }
    }
    
    checkLocalnet();
  }, [rpcUrl]);
  
  async function createTestAccount() {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError('Please connect your wallet first');
      return;
    }
    
    try {
      // For simplicity, we'll just check the connected wallet account
      const connection = new Connection(rpcUrl, 'confirmed');
      const accountInfo = await connection.getAccountInfo(wallet.publicKey);
      
      setTestAccountInfo({
        address: wallet.publicKey.toString(),
        exists: !!accountInfo,
        lamports: accountInfo?.lamports || 0,
        solBalance: (accountInfo?.lamports || 0) / 1_000_000_000,
        owner: accountInfo?.owner?.toString(),
        executable: accountInfo?.executable,
        rentEpoch: accountInfo?.rentEpoch,
        space: accountInfo?.data.length,
      });
    } catch (err) {
      console.error('Failed to check account:', err);
      setError(`Failed to check account: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleAirdrop() {
    if (!wallet.publicKey) {
      setError('Please connect your wallet first');
      return;
    }
    
    try {
      setError(null);
      
      // Call our airdrop API
      const response = await fetch('/api/solana/airdrop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: wallet.publicKey.toString(),
          amount: 2, // Airdrop 2 SOL
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      
      // Refresh account info
      createTestAccount();
      
      return data;
    } catch (err) {
      console.error('Failed to airdrop:', err);
      setError(`Failed to airdrop: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function testLocalnetTransfer() {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError('Please connect your wallet with signing capability');
      return;
    }

    try {
      setError(null);
      
      // Amount to send (0.001 SOL)
      const amount = 0.001 * LAMPORTS_PER_SOL;
      
      // Create a simple transfer to ourselves (just to test the flow)
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: wallet.publicKey, // sending to self for testing
          lamports: amount,
        })
      );
      
      // Get blockhash directly from localnet
      const connection = new Connection(rpcUrl, 'confirmed');
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;
      
      // Sign the transaction with Phantom (which might be connected to any network)
      console.log('Signing transaction with wallet...');
      const signedTransaction = await wallet.signTransaction(transaction);
      
      // Send and confirm using our localnet sender
      console.log('Sending transaction directly to localnet...');
      const signature = await sendSignedTransactionToLocalnet(signedTransaction);
      
      // Refresh account info
      await createTestAccount();
      
      setTestTxSignature(signature);
      setTestTxSuccess(true);
      
      return {
        signature,
        success: true,
        message: 'Test transaction sent successfully to localnet!',
      };
    } catch (err) {
      console.error('Failed to send test transaction:', err);
      setError(`Failed to send test transaction: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Solana Localnet Checker</h1>
      
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Connection Info</h2>
        <div className="space-y-2">
          <p><strong>RPC URL:</strong> {rpcUrl}</p>
          <p><strong>Detected Cluster:</strong> {cluster}</p>
          <p>
            <strong>Status:</strong>{' '}
            {isLocalnetRunning === null ? (
              <span className="text-yellow-500">Checking...</span>
            ) : isLocalnetRunning ? (
              <span className="text-green-500">Running</span>
            ) : (
              <span className="text-red-500">Not Running</span>
            )}
          </p>
          {genesisHash && <p><strong>Genesis Hash:</strong> {genesisHash}</p>}
          {error && <p className="text-red-500">{error}</p>}
        </div>
      </div>
      
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Program Info</h2>
        <p><strong>Program ID:</strong> {PROGRAM_ID}</p>
        
        {programInfo ? (
          <div className="mt-2">
            {programInfo.error ? (
              <p className="text-red-500">{programInfo.error}</p>
            ) : (
              <div className="space-y-2">
                <p><strong>Exists:</strong> {programInfo.exists ? 'Yes' : 'No'}</p>
                {programInfo.exists && (
                  <>
                    <p><strong>Executable:</strong> {programInfo.executable ? 'Yes' : 'No'}</p>
                    <p><strong>Owner:</strong> {programInfo.owner}</p>
                    <p><strong>Data Size:</strong> {programInfo.dataSize} bytes</p>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500 mt-2">Loading program info...</p>
        )}
      </div>
      
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Wallet</h2>
        <div className="mb-4">
          <WalletMultiButton className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded" />
        </div>
        
        {wallet.connected ? (
          <div>
            <p><strong>Connected Address:</strong> {wallet.publicKey?.toString()}</p>
            <div className="flex space-x-3 mt-4">
              <button 
                onClick={createTestAccount} 
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Check Account Info
              </button>
              
              <button 
                onClick={handleAirdrop} 
                className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
              >
                Airdrop 2 SOL
              </button>
              
              <button 
                onClick={testLocalnetTransfer} 
                className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded"
              >
                Test Localnet Transfer
              </button>
            </div>
            
            {testAccountInfo && (
              <div className="mt-4 p-4 bg-gray-50 rounded-md">
                <h3 className="font-medium mb-2">Account Info:</h3>
                <div className="mb-2">
                  <p><strong>Balance:</strong> {testAccountInfo.solBalance?.toFixed(6)} SOL</p>
                </div>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto">
                  {JSON.stringify(testAccountInfo, null, 2)}
                </pre>
              </div>
            )}
            
            {testTxSuccess && testTxSignature && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
                <h3 className="font-medium text-green-800 mb-2">Transaction Successful!</h3>
                <p className="text-green-700 mb-1">
                  Successfully sent transaction to localnet using the Phantom + Local RPC workaround.
                </p>
                <p className="font-mono text-xs break-all">{testTxSignature}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500">Please connect your wallet</p>
        )}
      </div>
      
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Testing Steps</h2>
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-100 rounded">
          <h3 className="font-medium text-amber-800 mb-2">Phantom Wallet with Localnet</h3>
          <p className="text-amber-700 mb-3">
            Phantom doesn't support direct connections to localhost/localnet, but we've implemented a workaround:
          </p>
          <ol className="list-decimal list-inside space-y-1 text-amber-800">
            <li>Keep Phantom connected to Devnet/Testnet</li>
            <li>Use Phantom <strong>only for signing</strong> transactions</li>
            <li>Our code will send the signed transactions directly to your localnet</li>
            <li>This bypasses Phantom's RPC restrictions while still using its signing capabilities</li>
          </ol>
        </div>
        
        <ol className="list-decimal list-inside space-y-2">
          <li>Ensure your local validator is running: <code className="bg-gray-100 px-2 py-1 rounded">solana-test-validator</code></li>
          <li>Keep Phantom on Devnet or Testnet (no need to change to custom RPC)</li>
          <li>Connect your wallet using the button above</li>
          <li>Click "Airdrop 2 SOL" to fund your wallet on localnet</li>
          <li>Click "Test Localnet Transfer" to verify the workaround functions</li>
          <li>Try creating a bounty once everything is set up</li>
        </ol>
      </div>
    </div>
  );
} 