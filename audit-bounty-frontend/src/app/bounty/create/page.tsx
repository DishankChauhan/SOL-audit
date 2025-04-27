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
import { Transaction } from '@solana/web3.js';

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
    setSubmitting(true);
    setFormErrors({});
    setTransactionStatus('processing');
    
    // Validate form
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors as Record<string, string | undefined>);
      setTransactionStatus('error');
      setSubmitting(false);
      return;
    }
    
    try {
      if (!wallet.connected || !wallet.publicKey) {
        throw new Error('Please connect your wallet first');
      }

      if (!user) {
        throw new Error('Please sign in first');
      }
      
      console.log("Verifying wallet ownership...");
      const verification = await SolanaService.verifyWalletOwnership(wallet);
      if (!verification.verified) {
        console.error("Wallet verification failed:", verification.message);
        throw new Error('Failed to verify wallet ownership: ' + verification.message);
      }
      console.log("Wallet verification successful, signature:", 
        verification.signature?.substring(0, 10) + "..." );
      
      // Format the data for API
      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        setFormErrors({...formErrors, amount: 'Please enter a valid amount'});
        setTransactionStatus('error');
        setSubmitting(false);
        return;
      }
      
      const validTags = formData.tags.filter(tag => tag.trim().length > 0);
      
      console.log("Initializing bounty with API...");
      console.log('Bounty amount from form data:', amount);
      
      // Create the bounty
      const response = await fetch('/api/bounty/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          repoUrl: formData.repoUrl,
          amount: amount,
          tokenMint: formData.tokenType === 'USDC' ? USDC_MINT.toString() : 'SOL',
          deadline: new Date(formData.deadline),
          tags: validTags,
          severityWeights: {
            critical: parseInt(formData.severityWeights.critical.toString()),
            high: parseInt(formData.severityWeights.high.toString()),
            medium: parseInt(formData.severityWeights.medium.toString()),
            low: parseInt(formData.severityWeights.low.toString()),
          },
          owner: user.uid,
          walletAddress: wallet.publicKey.toString(),
          ownerName: user.displayName || 'Anonymous',
          walletSignature: verification.signature,
          signatureMessage: verification.message
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error("API error:", errorData);
        throw new Error(errorData.error || 'Failed to create bounty');
      }
      
      const { bountyId: initialBountyId, transactionBase64, error: transactionError, solanaError } = await response.json();
      
      // Create a variable that can be reassigned
      let bountyId = initialBountyId;
      
      // Check if there was an error with the Solana transaction
      if (transactionError) {
        console.warn('Solana transaction error:', solanaError);
        setFormErrors({
          ...formErrors,
          submit: `Bounty created but transaction failed: ${solanaError}. Please try funding it later.`
        });
        setTransactionStatus('error');
        
        // Still allow navigation to the bounty page after a delay
        setTimeout(() => {
          router.push(`/bounty/${bountyId || 'my'}`);
        }, 5000);
        
        return;
      }
      
      // Fund the bounty with either SOL or USDC
      let txResult;
      
      if (formData.tokenType === 'USDC') {
        console.log("Funding bounty with USDC...");
        // Fund with USDC tokens
        txResult = await TokenService.fundBountyWithUSDC(
          wallet,
          bountyId,
          amount
        );
      } else {
        console.log('Funding bounty with SOL using initializeBounty...');
        console.log('Bounty amount passed to initializeBounty:', amount);
        
        // Fund with SOL
        txResult = await SolanaService.initializeBounty(wallet, {
          title: formData.title,
          description: formData.description,
          repoUrl: formData.repoUrl,
          amount: amount,
          deadline: new Date(formData.deadline),
          tags: validTags,
          severityWeights: {
            critical: parseInt(formData.severityWeights.critical.toString()),
            high: parseInt(formData.severityWeights.high.toString()),
            medium: parseInt(formData.severityWeights.medium.toString()),
            low: parseInt(formData.severityWeights.low.toString()),
            informational: 0 // Default value
          }
        });
        
        console.log('initializeBounty result:', txResult);
        
        if (txResult.status === 'error') {
          console.error('initializeBounty error:', txResult.message);
        }
        
        // Store the bountyId from the result if it's provided
        if (txResult.bountyId) {
          bountyId = txResult.bountyId;
        }
      }
      
      if (txResult.status === 'error') {
        throw new Error(txResult.message);
      }

      if (txResult.signature) {
        setTransactionSignature(txResult.signature);
      } else {
        setTransactionSignature(null);
      }
      setTransactionStatus('success');

      // Redirect to the bounty page after a delay
      setTimeout(() => {
        router.push(`/bounty/${bountyId || 'my'}`);
      }, 3000);
    } catch (err) {
      console.error('Error creating bounty:', err);
      setFormErrors({
        ...formErrors,
        submit: `Failed to create bounty: ${(err as Error).message}`
      });
      setTransactionStatus('error');
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