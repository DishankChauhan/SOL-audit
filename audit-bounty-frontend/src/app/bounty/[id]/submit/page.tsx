'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/context/AuthContext';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

interface IBounty {
  id: string;
  title: string;
  description: string;
  repoUrl: string;
  status: 'open' | 'closed' | 'cancelled' | 'draft' | 'cancelling' | 'completing' | 'completed';
  owner: {
    id: string;
    displayName: string;
  };
}

export default function SubmitFindingPage() {
  const { id } = useParams();
  const { user, loading: authLoading, linkedWallet } = useAuth();
  const wallet = useWallet();
  const router = useRouter();
  
  const [bounty, setBounty] = useState<IBounty | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    severity: 'medium',
    pocUrl: '',
    fixUrl: '',
    walletAddress: ''
  });
  
  const [formErrors, setFormErrors] = useState({
    title: '',
    description: '',
    severity: '',
    pocUrl: '',
    fixUrl: '',
    walletAddress: ''
  });

  useEffect(() => {
    // Redirect if not logged in
    if (!authLoading && !user) {
      router.push(`/login?redirect=/bounty/${id}/submit`);
      return;
    }

    // Fetch bounty data from Firebase
    const fetchBounty = async () => {
      try {
        setLoading(true);
        
        // Import Firestore modules
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase/config');
        
        // Get the bounty document
        const bountyRef = doc(db, 'bounties', id as string);
        const bountySnapshot = await getDoc(bountyRef);
        
        if (!bountySnapshot.exists()) {
          setError('Bounty not found');
          setLoading(false);
          return;
        }
        
        const data = bountySnapshot.data();
        const bountyData: IBounty = {
          id: bountySnapshot.id,
          title: data.title || '',
          description: data.description || '',
          repoUrl: data.repoUrl || '',
          status: data.status || 'open',
          owner: {
            id: data.owner || '',
            displayName: data.ownerName || 'Unknown'
          }
        };
        
        // Check if user is the owner (owners can't submit to their own bounties)
        if (bountyData.owner.id === user?.uid) {
          setError("You can't submit findings for your own bounty");
          setLoading(false);
          return;
        }
        
        setBounty(bountyData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching bounty:', error);
        setError('Failed to load bounty details');
        setLoading(false);
      }
    };
    
    if (id && user) {
      fetchBounty();
    }
  }, [id, user, authLoading, router]);

  useEffect(() => {
    // Update wallet address in form when wallet connects or linkedWallet changes
    if (wallet.connected && wallet.publicKey) {
      setFormData(prev => ({ 
        ...prev, 
        walletAddress: wallet.publicKey?.toString() || '' 
      }));
    } else if (linkedWallet) {
      setFormData(prev => ({ 
        ...prev, 
        walletAddress: linkedWallet 
      }));
    }
  }, [wallet.connected, wallet.publicKey, linkedWallet]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
    
    // Clear error when user starts typing
    if (formErrors[name as keyof typeof formErrors]) {
      setFormErrors({
        ...formErrors,
        [name]: ''
      });
    }
  };

  const validateForm = () => {
    let isValid = true;
    const newErrors = { ...formErrors };
    
    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
      isValid = false;
    }
    
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
      isValid = false;
    } else if (formData.description.trim().length < 30) {
      newErrors.description = 'Description should be at least 30 characters';
      isValid = false;
    }
    
    if (formData.pocUrl && !isValidUrl(formData.pocUrl)) {
      newErrors.pocUrl = 'Please enter a valid URL';
      isValid = false;
    }
    
    if (formData.fixUrl && !isValidUrl(formData.fixUrl)) {
      newErrors.fixUrl = 'Please enter a valid URL';
      isValid = false;
    }

    // Validate wallet address
    if (!formData.walletAddress) {
      newErrors.walletAddress = 'A wallet address is required to receive payment';
      isValid = false;
    }
    
    setFormErrors(newErrors);
    return isValid;
  };
  
  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setSubmitting(true);
    setError(null);
    
    try {
      // Import Firestore modules
      const { collection, addDoc, serverTimestamp, updateDoc, increment, doc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase/config');
      
      // Create the submission in Firestore
      const submissionRef = await addDoc(collection(db, 'submissions'), {
        bountyId: id,
        title: formData.title,
        description: formData.description,
        severity: formData.severity,
        pocUrl: formData.pocUrl || null,
        fixUrl: formData.fixUrl || null,
        status: 'pending',
        auditor: user?.uid,
        auditorName: user?.displayName || 'Anonymous',
        auditorEmail: user?.email,
        auditorWalletAddress: formData.walletAddress,  // Add wallet address to submission
        createdAt: serverTimestamp()
      });
      
      // Update the bounty with the submission count
      const bountyRef = doc(db, 'bounties', id as string);
      await updateDoc(bountyRef, {
        submissionCount: increment(1)
      });
      
      // If user doesn't have a wallet address in their profile, update it
      if (user && formData.walletAddress && !linkedWallet) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          await updateDoc(userDocRef, {
            walletAddress: formData.walletAddress,
            walletLinkDate: serverTimestamp()
          });
        } catch (profileErr) {
          console.error('Error updating user wallet address:', profileErr);
          // Continue anyway since the submission has the address
        }
      }
      
      // Redirect to bounty page after successful submission
      router.push(`/bounty/${id}`);
    } catch (err) {
      console.error('Error submitting finding:', err);
      setError('Failed to submit finding. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-full mb-6"></div>
            <div className="h-64 bg-gray-200 rounded w-full mb-4"></div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !bounty) {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-white">Error Loading Bounty</h2>
            <p className="mt-2 text-gray-400">{error || 'Bounty not found'}</p>
            <div className="mt-6">
              <Link
                href="/bounties"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Back to Bounties
              </Link>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (bounty.status !== 'open') {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-white">Bounty is not open for submissions</h2>
            <p className="mt-2 text-gray-400">This bounty is currently {bounty.status} and not accepting new submissions.</p>
            <div className="mt-6">
              <Link
                href={`/bounty/${id}`}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Back to Bounty
              </Link>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="md:flex md:items-center md:justify-between mb-6">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold leading-7 text-white sm:text-3xl sm:truncate">
              Submit Finding
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              For bounty: <span className="font-medium">{bounty.title}</span>
            </p>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            <Link
              href={`/bounty/${id}`}
              className="inline-flex items-center px-4 py-2 border border-gray-700 rounded-md shadow-sm text-sm font-medium text-gray-200 bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Back to Bounty
            </Link>
          </div>
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            {error && (
              <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
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
                    className="text-black shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    placeholder="Brief title describing the finding"
                    disabled={submitting}
                  />
                  {formErrors.title && (
                    <p className="mt-2 text-sm text-red-600">{formErrors.title}</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                  Description *
                </label>
                <div className="mt-1">
                  <textarea
                    id="description"
                    name="description"
                    rows={5}
                    value={formData.description}
                    onChange={handleInputChange}
                    className="text-black shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    placeholder="Detailed explanation of the vulnerability, its impact, and how it can be exploited"
                    disabled={submitting}
                  ></textarea>
                  {formErrors.description && (
                    <p className="mt-2 text-sm text-red-600">{formErrors.description}</p>
                  )}
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Include clear details on the vulnerability, how it works, and the potential impact.
                </p>
              </div>

              <div>
                <label htmlFor="severity" className="block text-sm font-medium text-gray-700">
                  Severity *
                </label>
                <div className="mt-1">
                  <select
                    id="severity"
                    name="severity"
                    value={formData.severity}
                    onChange={handleInputChange}
                    className="text-black shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    disabled={submitting}
                  >
                    <option value="critical">Critical - Severe impact and easy to exploit</option>
                    <option value="high">High - Severe impact but difficult to exploit</option>
                    <option value="medium">Medium - Moderate impact and difficult to exploit</option>
                    <option value="low">Low - Minor impact or very difficult to exploit</option>
                  </select>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Select the severity level that best describes the vulnerability.
                </p>
              </div>

              <div>
                <label htmlFor="pocUrl" className="block text-sm font-medium text-gray-700">
                  Proof of Concept URL
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    name="pocUrl"
                    id="pocUrl"
                    value={formData.pocUrl}
                    onChange={handleInputChange}
                    className="text-black shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    placeholder="https://github.com/yourusername/poc-repository"
                    disabled={submitting}
                  />
                  {formErrors.pocUrl && (
                    <p className="mt-2 text-sm text-red-600">{formErrors.pocUrl}</p>
                  )}
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Link to a GitHub repository with code demonstrating the vulnerability (recommended).
                </p>
              </div>

              <div>
                <label htmlFor="fixUrl" className="block text-sm font-medium text-gray-700">
                  Fix Implementation URL
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    name="fixUrl"
                    id="fixUrl"
                    value={formData.fixUrl}
                    onChange={handleInputChange}
                    className="text-black shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    placeholder="https://github.com/yourusername/fix-repository"
                    disabled={submitting}
                  />
                  {formErrors.fixUrl && (
                    <p className="mt-2 text-sm text-red-600">{formErrors.fixUrl}</p>
                  )}
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Link to a GitHub repository with a proposed fix for the vulnerability (optional).
                </p>
              </div>

              <div className="mb-6">
                <label htmlFor="walletAddress" className="block text-sm font-medium text-gray-700 mb-1">
                  Wallet Address <span className="text-red-500">*</span>
                </label>
                <div className="text-sm text-gray-600 mb-2">
                  A Solana wallet address is required to receive payment if your submission is approved.
                </div>
                
                {wallet.connected && wallet.publicKey ? (
                  <div className="flex items-center">
                    <input
                      type="text"
                      id="walletAddress"
                      name="walletAddress"
                      value={formData.walletAddress}
                      onChange={handleInputChange}
                      className="text-black flex-1 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                      readOnly
                    />
                    <span className="ml-2 text-green-600 text-sm">Connected</span>
                  </div>
                ) : linkedWallet ? (
                  <div className="flex items-center">
                    <input
                      type="text"
                      id="walletAddress"
                      name="walletAddress"
                      value={formData.walletAddress || linkedWallet}
                      onChange={handleInputChange}
                      className="text-black flex-1 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                      readOnly
                    />
                    <span className="ml-2 text-green-600 text-sm">From profile</span>
                  </div>
                ) : (
                  <div>
                    <div className="mb-2">
                      <WalletMultiButton />
                    </div>
                    <div className="text-sm text-gray-600">
                      Please connect your wallet to proceed or enter your wallet address manually:
                    </div>
                    <input
                      type="text"
                      id="walletAddress"
                      name="walletAddress"
                      value={formData.walletAddress}
                      onChange={handleInputChange}
                      placeholder="Solana wallet address"
                      className="text-black mt-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>
                )}
                
                {formErrors.walletAddress && (
                  <p className="mt-2 text-sm text-red-600">{formErrors.walletAddress}</p>
                )}
              </div>

              <div className="pt-4">
                <div className="flex justify-end">
                  <Link
                    href={`/bounty/${id}`}
                    className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Cancel
                  </Link>
                  <button
                    type="submit"
                    disabled={submitting}
                    className={`ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {submitting ? 'Submitting...' : 'Submit Finding'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </MainLayout>
  );
} 