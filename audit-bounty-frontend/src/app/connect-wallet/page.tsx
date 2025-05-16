'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/context/AuthContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { WalletVerifier } from '@/components/wallet/WalletVerifier';
import { validateWalletAddress } from '@/lib/utils';

export default function ConnectWalletPage() {
  const { user, loading: authLoading, linkedWallet, linkWalletAddress } = useAuth();
  const { publicKey, connected, disconnect } = useWallet();
  const router = useRouter();
  const [linking, setLinking] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletVerified, setWalletVerified] = useState(false);
  const [verifiedAddress, setVerifiedAddress] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/connect-wallet');
    }
  }, [user, authLoading, router]);

  // Reset wallet verification state when wallet disconnects
  useEffect(() => {
    if (!connected || !publicKey) {
      setWalletVerified(false);
      setVerifiedAddress(null);
    }
  }, [connected, publicKey]);

  // Handle wallet verification completion
  const handleWalletVerified = (address: string) => {
    setWalletVerified(true);
    setVerifiedAddress(address);
    setError(null);
  };

  // Handle wallet linking
  const handleLinkWallet = async () => {
    if (!user || !publicKey) return;
    if (!walletVerified || !verifiedAddress) {
      setError('Please verify your wallet ownership first');
      return;
    }

    // Verify that the address being linked is the same as the verified one
    if (verifiedAddress !== publicKey.toString()) {
      setError('Wallet address mismatch. Please reconnect your wallet.');
      return;
    }

    try {
      setLinking(true);
      setError(null);
      
      // Validate the wallet address format
      if (!validateWalletAddress(publicKey.toString())) {
        throw new Error('Invalid wallet address format');
      }
      
      await linkWalletAddress(publicKey.toString());
      setSuccess(true);
      
      // Redirect to dashboard after a delay
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch (err) {
      setError(`Failed to link wallet: ${(err as Error).message}`);
    } finally {
      setLinking(false);
    }
  };

  // Handle wallet unlinking
  const handleUnlinkWallet = async () => {
    if (!user) return;
    
    if (!showConfirmation) {
      setShowConfirmation(true);
      return;
    }
    
    try {
      setLinking(true);
      setError(null);
      
      await linkWalletAddress('');
      await disconnect();
      setSuccess(false);
      setWalletVerified(false);
      setVerifiedAddress(null);
      setShowConfirmation(false);
    } catch (err) {
      setError(`Failed to unlink wallet: ${(err as Error).message}`);
    } finally {
      setLinking(false);
    }
  };

  const cancelUnlink = () => {
    setShowConfirmation(false);
  };

  if (authLoading) {
    return (
      <MainLayout>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-full mb-6"></div>
            <div className="h-64 bg-gray-200 rounded w-full mb-4"></div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!user) {
    return (
      <MainLayout>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">Authentication Required</h2>
            <p className="mt-2 text-gray-600">You need to be logged in to connect your wallet.</p>
            <div className="mt-6">
              <Link 
                href="/login?redirect=/connect-wallet"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Go to Login
              </Link>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <h2 className="text-lg leading-6 font-medium text-gray-900">
              Connect Wallet
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Link your Solana wallet to participate in bounties and receive rewards.
            </p>
          </div>
          
          <div className="border-t border-gray-200 px-4 py-5 sm:p-6">
            {error && (
              <div className="mb-4 rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">{error}</h3>
                  </div>
                </div>
              </div>
            )}
            
            {success && (
              <div className="mb-4 rounded-md bg-green-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">Wallet successfully linked!</h3>
                    <p className="mt-2 text-sm text-green-700">
                      Redirecting to dashboard...
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex flex-col items-center">
              <div className="mb-6 text-center">
                <p className="text-sm text-gray-600">
                  Current status: {linkedWallet ? (
                    <span className="font-medium text-green-600">Wallet connected</span>
                  ) : (
                    <span className="font-medium text-gray-700">No wallet connected</span>
                  )}
                </p>
                
                {linkedWallet && (
                  <div className="mt-1">
                    <p className="text-xs text-gray-500 break-all">
                      Address: {linkedWallet}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Connected: {new Date().toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
              
              <div className="flex flex-col items-center space-y-4">
                <WalletMultiButton />
                
                {connected && publicKey ? (
                  <div className="mt-4 flex flex-col items-center">
                    <p className="text-sm font-medium text-gray-700 mb-2">Verify wallet ownership</p>
                    
                    <div className="mb-4">
                      <WalletVerifier
                        onVerified={handleWalletVerified}
                        buttonText="Verify Wallet Ownership"
                      />
                    </div>
                    
                    {linkedWallet === publicKey.toString() ? (
                      <div>
                        {showConfirmation ? (
                          <div className="flex flex-col items-center">
                            <p className="text-sm text-red-600 mb-2">Are you sure you want to unlink your wallet?</p>
                            <div className="flex space-x-4">
                              <button
                                onClick={handleUnlinkWallet}
                                disabled={linking}
                                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                              >
                                {linking ? 'Unlinking...' : 'Confirm Unlink'}
                              </button>
                              <button
                                onClick={cancelUnlink}
                                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={handleUnlinkWallet}
                            disabled={linking}
                            className="inline-flex items-center px-4 py-2 border border-red-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                          >
                            {linking ? 'Unlinking...' : 'Unlink Wallet'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={handleLinkWallet}
                        disabled={linking || !walletVerified}
                        className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${!walletVerified ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
                      >
                        {linking ? 'Linking...' : linkedWallet ? 'Update Wallet' : 'Link Wallet'}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-500">
                    Please connect your wallet using the button above
                  </p>
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-gray-50 px-4 py-5 sm:p-6">
            <h3 className="text-sm font-medium text-gray-900">Why connect a wallet?</h3>
            <div className="mt-2 max-w-xl text-sm text-gray-500">
              <p>
                Connecting your Solana wallet allows you to:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Create bounties and fund them with SOL or USDC</li>
                <li>Claim rewards for approved security findings</li>
                <li>Participate in disputes and governance</li>
                <li>Manage your funds securely on-chain</li>
              </ul>
            </div>
            <div className="mt-5">
              <Link 
                href="/dashboard"
                className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
              >
                Back to Dashboard <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
} 