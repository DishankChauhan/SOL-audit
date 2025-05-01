'use client';

import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletVerifier } from '@/components/wallet/WalletVerifier';
import { SolanaService } from '@/services/solana';
import { TransactionStatus } from '@/components/transaction/TransactionStatus';
import { TokenService, USDC_MINT } from '@/services/token';
import { Transaction, PublicKey } from '@solana/web3.js';
import { getConnection, getCluster } from '@/lib/solana/config';
import { sendSignedTransactionToLocalnet } from '@/lib/solana/local-sender';
import { debugTransactionInstruction } from '@/lib/solana/debug-utils';

// Hard-coded program ID for reference
const PROGRAM_ID = "3K6VQ96CqESYiVT5kqPy6BU7ZDQbkZhVU4K5Bas7r9eh";

type FormData = {
  title: string;
  description: string;
  repoUrl: string;
  amount: string;
  tokenType: 'SOL' | 'USDC';
  deadline: string;
  severityWeights: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  tags: string[];
};

export default function CreateBountyPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string | undefined>>({});
  const wallet = useWallet();
  const [walletVerified, setWalletVerified] = useState(false);
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  
  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    repoUrl: '',
    amount: '',
    tokenType: 'USDC',
    deadline: '',
    severityWeights: {
      critical: 50,
      high: 30,
      medium: 15,
      low: 5
    },
    tags: [''] // Start with one empty tag
  });

  // Redirect if not logged in
  if (!loading && !user) {
    router.push('/login');
    return null;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
    
    // Clear error for this field when user types
    if (formErrors[name]) {
      setFormErrors({
        ...formErrors,
        [name]: undefined
      });
    }
  };

  const handleSeverityChange = (severity: string, value: string) => {
    const numValue = parseInt(value, 10) || 0;
    setFormData({
      ...formData,
      severityWeights: {
        ...formData.severityWeights,
        [severity]: numValue
      }
    });
  };

  const addTag = () => {
    setFormData({
      ...formData,
      tags: [...formData.tags, '']
    });
  };

  const removeTag = (index: number) => {
    const newTags = [...formData.tags];
    newTags.splice(index, 1);
    setFormData({
      ...formData,
      tags: newTags
    });
  };

  const handleTagChange = (index: number, value: string) => {
    const newTags = [...formData.tags];
    newTags[index] = value;
    setFormData({
      ...formData,
      tags: newTags
    });
  };

  const validateForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    
    if (!formData.title.trim()) {
      errors.title = 'Title is required';
    }
    
    if (!formData.description.trim()) {
      errors.description = 'Description is required';
    }
    
    if (!formData.repoUrl.trim()) {
      errors.repoUrl = 'Repository URL is required';
    } else if (!/^https?:\/\/github\.com\/[\w-]+\/[\w-]+/.test(formData.repoUrl)) {
      errors.repoUrl = 'Please enter a valid GitHub repository URL';
    }
    
    if (!formData.amount) {
      errors.amount = 'Bounty amount is required';
    } else if (parseFloat(formData.amount) <= 0) {
      errors.amount = 'Bounty amount must be greater than 0';
    }
    
    if (!formData.deadline) {
      errors.deadline = 'Deadline is required';
    } else if (new Date(formData.deadline) <= new Date()) {
      errors.deadline = 'Deadline must be in the future';
    }
    
    // Check if the severity weights add up to 100
    const totalWeight = Object.values(formData.severityWeights).reduce((a, b) => a + b, 0);
    if (totalWeight !== 100) {
      errors.severityWeights = `Severity weights must add up to 100 (currently ${totalWeight})`;
    }
    
    // Filter out empty tags
    const validTags = formData.tags.filter(tag => tag.trim().length > 0);
    if (validTags.length === 0) {
      errors.tags = 'At least one tag is required';
    }
    
    return errors;
  };

  const handleCreateBounty = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (submitting) {
      return;
    }

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    setTransactionStatus('processing');
    setTransactionSignature(null);

    try {
      if (!user || !wallet.publicKey) {
        throw new Error('Please connect your wallet and sign in to create a bounty');
      }

      // Parse amount as a number
      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Invalid amount');
      }

      console.log('Creating bounty with amount:', amount, formData.tokenType);

      // Validate tags again (safeguard)
      const validTags = formData.tags.filter(tag => tag.trim() !== '');
      if (validTags.length === 0) {
        validTags.push('security');
      }

      // STEP 1: Initialize a new bounty transaction
      console.log('Initializing bounty transaction...');
      console.log('Using program ID:', PROGRAM_ID);
      
      try {
        // First, initialize the transaction
        const initResponse = await fetch('/api/bounty/initialize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: formData.title,
            description: formData.description,
            repoUrl: formData.repoUrl,
            amount: amount,
            deadline: new Date(formData.deadline),
            tags: validTags,
            creatorWallet: wallet.publicKey.toString(),
            severityWeights: {
              critical: formData.severityWeights.critical,
              high: formData.severityWeights.high,
              medium: formData.severityWeights.medium,
              low: formData.severityWeights.low,
              informational: 2, // Default value
            },
            winnersCount: 1
          })
        });
        
        if (!initResponse.ok) {
          let errorData;
          try {
            errorData = await initResponse.json();
          } catch (e) {
            errorData = { error: `HTTP error ${initResponse.status}: ${initResponse.statusText}` };
          }
          console.error("API error:", errorData);
          throw new Error(errorData.error || 'Failed to initialize bounty transaction');
        }
        
        const initData = await initResponse.json();
        console.log('Transaction initialized:', initData);
        
        const { transaction, bountyAddress, vaultAddress, metadata } = initData;
        
        if (!transaction) {
          throw new Error('No transaction data was returned from the server');
        }
        
        // STEP 2: Sign the transaction with the wallet
        console.log('Signing transaction...');
        const transactionBuffer = Buffer.from(transaction, 'base64');
        
        // Debug transaction buffer
        console.log('Transaction buffer length:', transactionBuffer.length);
        console.log('First 32 bytes:', Buffer.from(transactionBuffer.slice(0, 32)).toString('hex'));
        
        // Deserialize and sign the transaction
        const tx = Transaction.from(transactionBuffer);
        
        // Verify the transaction is correctly formed
        console.log('Transaction details:');
        console.log(' - Program ID:', tx.instructions[0]?.programId.toString());
        console.log(' - Has recent blockhash:', !!tx.recentBlockhash);
        console.log(' - Fee payer:', tx.feePayer?.toString());
        console.log(' - Instruction data length:', tx.instructions[0]?.data.length);
        
        // Use our detailed debug utility to analyze the instruction
        if (tx.instructions.length > 0) {
          debugTransactionInstruction(tx.instructions[0]);
        }
        
        let signedTransaction;
        
        try {
          if (!wallet.signTransaction) {
            throw new Error('Wallet does not support transaction signing');
          }
          
          signedTransaction = await wallet.signTransaction(tx);
          console.log('Transaction signed successfully');
        } catch (signingError) {
          console.error('Transaction signing error:', signingError);
          throw new Error(`Failed to sign transaction: ${signingError instanceof Error ? signingError.message : String(signingError)}`);
        }
        
        // STEP 3: Send the signed transaction to the blockchain
        console.log('Sending signed transaction to the blockchain...');
        let sendResponse;
        let sendData;
        
        // Check if we're on localnet - if so, use our direct sender
        const cluster = getCluster();
        if (cluster === 'localnet') {
          try {
            console.log('Detected localnet, using direct transaction sender');
            // Send directly to localnet (bypassing Phantom's RPC limitations)
            const signature = await sendSignedTransactionToLocalnet(signedTransaction);
            
            sendData = {
              signature,
              success: true
            };
          } catch (error) {
            console.error("Transaction error:", error);
            throw new Error(`Failed to send transaction to localnet: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else {
          // For devnet/mainnet, use our regular API endpoint
          sendResponse = await fetch('/api/solana/transaction/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              signedTransaction: Buffer.from(signedTransaction.serialize()).toString('base64')
            })
          });
          
          if (!sendResponse.ok) {
            let errorData;
            try {
              errorData = await sendResponse.json();
              console.error("Transaction error:", errorData);
              
              // Check for simulation logs
              if (errorData.simulationLogs || errorData.logs) {
                const logs = errorData.simulationLogs || errorData.logs;
                console.log("Transaction simulation logs:");
                logs.forEach((log: string, i: number) => {
                  console.log(`  ${i}: ${log}`);
                });
              }
              
              // Provide a better error message if available
              let errorMessage = errorData.error || 'Failed to send transaction to the blockchain';
              if (errorData.details) {
                errorMessage += `: ${JSON.stringify(errorData.details)}`;
              }
              throw new Error(errorMessage);
            } catch (e) {
              if (e instanceof Error && e.message.includes('Failed to send transaction')) {
                throw e;
              }
              throw new Error(`HTTP error ${sendResponse.status}: ${sendResponse.statusText}`);
            }
          }
          
          sendData = await sendResponse.json();
        }
        
        console.log('Transaction sent:', sendData);
        
        setTransactionSignature(sendData.signature);
        
        // STEP 4: Store metadata in Firebase
        console.log('Storing bounty metadata...');
        const metadataResponse = await fetch('/api/bounty/metadata', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            bountyAddress,
            metadata: {
              ...metadata,
              createdBy: user.uid,
              creatorName: user.displayName || 'Anonymous',
              owner: user.uid,
              ownerName: user.displayName || 'Anonymous',
              ownerWallet: wallet.publicKey?.toString(),
              status: 'active',
              transactionSignature: sendData.signature
            }
          })
        });
        
        if (!metadataResponse.ok) {
          const errorData = await metadataResponse.json();
          console.error("Metadata error:", errorData);
          // Don't throw here - the blockchain transaction is already confirmed
          console.warn('Failed to store metadata, but transaction was successful');
        } else {
          console.log('Metadata stored successfully');
        }
        
        // STEP 5: Success! Redirect to the bounty page
        setTransactionStatus('success');
        
        // Wait a moment for the user to see the success message
        setTimeout(() => {
          router.push(`/bounty/${bountyAddress}`);
        }, 2000);
        
      } catch (error) {
        console.error("Error creating bounty metadata:", error);
        setTransactionStatus('error');
        throw new Error(`Failed to create bounty metadata: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      console.error("Error creating bounty:", error);
      setTransactionStatus('error');
      setFormErrors({
        submit: `Failed to create bounty: ${error instanceof Error ? error.message : String(error)}`
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="md:flex md:items-center md:justify-between mb-6">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
              Create New Bounty
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Create a security audit bounty to find vulnerabilities in your smart contract.
            </p>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            <Link
              href="/bounties"
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Back to Bounties
            </Link>
          </div>
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <form onSubmit={handleCreateBounty}>
            <div className="px-4 py-5 sm:p-6">
              <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                {/* Title */}
                <div className="sm:col-span-6">
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                    Title *
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      name="title"
                      id="title"
                      value={formData.title}
                      onChange={handleInputChange}
                      className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md text-gray-900 ${
                        formErrors.title ? 'border-red-300' : ''
                      }`}
                      placeholder="e.g., Security Audit for Token Swap Contract"
                    />
                    {formErrors.title && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.title}</p>
                    )}
                  </div>
                </div>

                {/* Description */}
                <div className="sm:col-span-6">
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                    Description *
                  </label>
                  <div className="mt-1">
                    <textarea
                      id="description"
                      name="description"
                      rows={4}
                      value={formData.description}
                      onChange={handleInputChange}
                      className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md text-gray-900 ${
                        formErrors.description ? 'border-red-300' : ''
                      }`}
                      placeholder="Describe the contract and what kind of vulnerabilities you're looking for"
                    />
                    {formErrors.description && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.description}</p>
                    )}
                  </div>
                </div>

                {/* Repository URL */}
                <div className="sm:col-span-6">
                  <label htmlFor="repoUrl" className="block text-sm font-medium text-gray-700">
                    GitHub Repository URL *
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      name="repoUrl"
                      id="repoUrl"
                      value={formData.repoUrl}
                      onChange={handleInputChange}
                      className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md text-gray-900 ${
                        formErrors.repoUrl ? 'border-red-300' : ''
                      }`}
                      placeholder="https://github.com/yourusername/your-repo"
                    />
                    {formErrors.repoUrl && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.repoUrl}</p>
                    )}
                  </div>
                </div>

                {/* Token Type Selection */}
                <div className="sm:col-span-6">
                  <label className="block text-sm font-medium text-gray-700">
                    Payment Token *
                  </label>
                  <div className="mt-1">
                    <div className="flex space-x-4">
                      <label className="inline-flex items-center">
                        <input
                          type="radio"
                          name="tokenType"
                          value="USDC"
                          checked={formData.tokenType === 'USDC'}
                          onChange={() => setFormData({...formData, tokenType: 'USDC'})}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                        />
                        <span className="ml-2 text-sm text-gray-700">USDC</span>
                      </label>
                      <label className="inline-flex items-center">
                        <input
                          type="radio"
                          name="tokenType"
                          value="SOL"
                          checked={formData.tokenType === 'SOL'}
                          onChange={() => setFormData({...formData, tokenType: 'SOL'})}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                        />
                        <span className="ml-2 text-sm text-gray-700">SOL</span>
                      </label>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Select the token you will use to fund this bounty
                    </p>
                  </div>
                </div>

                {/* Bounty Amount */}
                <div className="sm:col-span-3">
                  <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
                    Bounty Amount ({formData.tokenType}) *
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      id="amount"
                      name="amount"
                      value={formData.amount}
                      onChange={handleInputChange}
                      className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md text-gray-900 ${
                        formErrors.amount ? 'border-red-300' : ''
                      }`}
                      placeholder="e.g., 1000"
                    />
                  </div>
                  {formErrors.amount && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.amount}</p>
                  )}
                </div>

                {/* Deadline */}
                <div className="sm:col-span-3">
                  <label htmlFor="deadline" className="block text-sm font-medium text-gray-700">
                    Deadline *
                  </label>
                  <div className="mt-1">
                    <input
                      type="date"
                      name="deadline"
                      id="deadline"
                      value={formData.deadline}
                      onChange={handleInputChange}
                      className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md text-gray-900 ${
                        formErrors.deadline ? 'border-red-300' : ''
                      }`}
                      min={new Date().toISOString().split('T')[0]}
                    />
                    {formErrors.deadline && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.deadline}</p>
                    )}
                  </div>
                </div>

                {/* Severity Weights */}
                <div className="sm:col-span-6">
                  <fieldset>
                    <legend className="block text-sm font-medium text-gray-700">
                      Severity Weights (must add up to 100%) *
                    </legend>
                    {formErrors.severityWeights && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.severityWeights}</p>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div>
                        <label htmlFor="critical-weight" className="block text-sm font-medium text-gray-700">
                          Critical
                        </label>
                        <div className="mt-1">
                          <input
                            type="number"
                            id="critical-weight"
                            value={formData.severityWeights.critical}
                            onChange={(e) => handleSeverityChange('critical', e.target.value)}
                            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md text-gray-900"
                            min="0"
                            max="100"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="high-weight" className="block text-sm font-medium text-gray-700">
                          High
                        </label>
                        <div className="mt-1">
                          <input
                            type="number"
                            id="high-weight"
                            value={formData.severityWeights.high}
                            onChange={(e) => handleSeverityChange('high', e.target.value)}
                            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md text-gray-900"
                            min="0"
                            max="100"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="medium-weight" className="block text-sm font-medium text-gray-700">
                          Medium
                        </label>
                        <div className="mt-1">
                          <input
                            type="number"
                            id="medium-weight"
                            value={formData.severityWeights.medium}
                            onChange={(e) => handleSeverityChange('medium', e.target.value)}
                            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md text-gray-900"
                            min="0"
                            max="100"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="low-weight" className="block text-sm font-medium text-gray-700">
                          Low
                        </label>
                        <div className="mt-1">
                          <input
                            type="number"
                            id="low-weight"
                            value={formData.severityWeights.low}
                            onChange={(e) => handleSeverityChange('low', e.target.value)}
                            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md text-gray-900"
                            min="0"
                            max="100"
                          />
                        </div>
                      </div>
                    </div>
                  </fieldset>
                </div>

                {/* Tags */}
                <div className="sm:col-span-6">
                  <fieldset>
                    <legend className="block text-sm font-medium text-gray-700">
                      Tags *
                    </legend>
                    {formErrors.tags && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.tags}</p>
                    )}
                    <div className="mt-2 space-y-2">
                      {formData.tags.map((tag, index) => (
                        <div key={index} className="flex items-center">
                          <input
                            type="text"
                            value={tag}
                            onChange={(e) => handleTagChange(index, e.target.value)}
                            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md text-gray-900"
                            placeholder="e.g., defi, token, nft"
                          />
                          <button
                            type="button"
                            onClick={() => removeTag(index)}
                            className="ml-2 inline-flex items-center p-1 border border-transparent rounded-full shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                            disabled={formData.tags.length === 1}
                          >
                            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addTag}
                        className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Add Tag
                      </button>
                    </div>
                  </fieldset>
                </div>

                {/* Submit error message */}
                {formErrors.submit && (
                  <div className="sm:col-span-6">
                    <p className="text-sm text-red-600">{formErrors.submit}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="px-4 py-3 bg-gray-50 text-right sm:px-6">
              <button
                type="submit"
                disabled={submitting}
                className={`inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                  submitting ? 'opacity-75 cursor-not-allowed' : ''
                }`}
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating...
                  </>
                ) : (
                  'Create Bounty'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </MainLayout>
  );
} 