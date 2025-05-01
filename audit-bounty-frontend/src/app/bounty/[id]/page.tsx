'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/context/AuthContext';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { BountyService } from '@/services/bounty';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

import { getCurrentUserToken, getUserDebugInfo } from '@/lib/firebase/auth-utils';

interface IBounty {
  id: string;
  title: string;
  description: string;
  repoUrl: string;
  bountyAmount: number;
  status: 'open' | 'closed' | 'cancelled' | 'draft' | 'cancelling' | 'completing' | 'completed';
  submissionsCount: number;
  approvedCount: number;
  owner: string; // Firebase user ID
  ownerName: string;
  ownerPhotoURL?: string;
  deadline: string;
  createdAt: string;
  tags: string[];
  severityWeights: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  solanaAddress?: string;
  judgingCriteria?: string;
  transactionHash?: string;
}

interface ISubmission {
  id: string;
  bountyId: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'approved' | 'rejected';
  auditor: {
    id: string;
    displayName: string;
    photoURL?: string;
  };
  createdAt: string;
  pocUrl?: string;
  fixUrl?: string;
}

// Define type for status colors
type StatusColorType = {
  [key: string]: {
    bg: string;
    text: string;
    label: string;
  }
};

export default function BountyDetailPage() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [bounty, setBounty] = useState<IBounty | null>(null);
  const [submissions, setSubmissions] = useState<ISubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'submissions'>('details');
  const [publishing, setPublishing] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    // Fetch the actual bounty from Firestore
    const fetchBounty = async () => {
      try {
        setLoading(true);
        
        // Import Firestore modules
        const { doc, getDoc, collection, query, where, getDocs } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase/config');
        
        // Get the bounty document
        const bountyDocRef = doc(db, 'bounties', id as string);
        const bountySnapshot = await getDoc(bountyDocRef);
        
        if (!bountySnapshot.exists()) {
          setError('Bounty not found');
          setLoading(false);
          return;
        }
        
        // Convert Firestore document to IBounty
        const data = bountySnapshot.data();
        const bountyData: IBounty = {
          id: bountySnapshot.id,
          title: data.title || '',
          description: data.description || '',
          repoUrl: data.repoUrl || '',
          bountyAmount: data.amount || 0,
          status: data.status || 'open',
          submissionsCount: data.submissionCount || 0,
          approvedCount: data.approvedCount || 0,
          owner: data.owner || '',
          ownerName: data.ownerName || 'Unknown',
          ownerPhotoURL: data.ownerPhotoURL,
          deadline: data.deadline 
            ? (typeof data.deadline === 'object' && data.deadline.toDate 
                ? new Date(data.deadline.toDate()).toISOString() 
                : new Date(data.deadline).toISOString())
            : new Date().toISOString(),
          createdAt: data.createdAt 
            ? (typeof data.createdAt === 'object' && data.createdAt.toDate
                ? new Date(data.createdAt.toDate()).toISOString()
                : new Date(data.createdAt).toISOString())
            : new Date().toISOString(),
          tags: data.tags || [],
          severityWeights: data.severityWeights || {
            critical: 50,
            high: 30,
            medium: 15,
            low: 5
          },
          solanaAddress: data.solanaAddress,
          judgingCriteria: data.judgingCriteria,
          transactionHash: data.transactionHash
        };
        
        setBounty(bountyData);
        
        // Get submissions for this bounty
        const submissionsQuery = query(
          collection(db, 'submissions'),
          where('bountyId', '==', id)
        );
        
        const submissionsSnapshot = await getDocs(submissionsQuery);
        
        if (!submissionsSnapshot.empty) {
          const submissionsData = submissionsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              bountyId: data.bountyId,
              title: data.title,
              description: data.description,
              severity: data.severity,
              status: data.status,
              auditor: {
                id: data.auditorId,
                displayName: data.auditorName || 'Anonymous',
                photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.auditorId}`
              },
              createdAt: data.createdAt 
                ? (typeof data.createdAt === 'object' && data.createdAt.toDate
                    ? new Date(data.createdAt.toDate()).toISOString()
                    : new Date(data.createdAt).toISOString())
                : new Date().toISOString(),
              pocUrl: data.pocUrl,
              fixUrl: data.fixUrl
            };
          });
          
          setSubmissions(submissionsData);
        } else {
          setSubmissions([]);
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching bounty:', error);
        setError('Failed to load bounty details');
        setLoading(false);
      }
    };
    
    if (id) {
      fetchBounty();
    }
  }, [id]);

  // Check if the current user is the owner of the bounty
  const isOwner = bounty && user && String(bounty.owner) === String(user.uid);
  
  // Add additional debugging to diagnose ownership issues
  useEffect(() => {
    if (bounty && user) {
      console.log('=== DETAILED OWNERSHIP DEBUG ===');
      console.log('Bounty owner:', bounty.owner);
      console.log('User ID:', user.uid);
      console.log('Direct comparison (===):', String(bounty.owner) === String(user.uid));
      console.log('Types:', {
        bountyOwnerType: typeof bounty.owner,
        userIdType: typeof user.uid
      });
      console.log('String values for comparison:', {
        bountyOwnerString: String(bounty.owner),
        userIdString: String(user.uid)
      });
      console.log('String comparison:', String(bounty.owner) === String(user.uid));
      console.log('isOwner evaluation result:', isOwner);
      console.log('===========================');
    }
  }, [bounty, user, isOwner]);
  
  // Fix ownership if needed (either first time access or data migration)
  useEffect(() => {
    const fixOwnership = async () => {
      if (bounty && user && !isOwner && bounty.solanaAddress) {
        // If the bounty owner is actually a Solana address (not a Firebase UID),
        // and the current user created this bounty, fix the ownership
        try {
          // First, verify the user has access to this wallet by checking Firestore
          const { doc, getDoc } = await import('firebase/firestore');
          const { db } = await import('@/lib/firebase/config');
          
          // Get user document which should have their connected wallets
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const userWallets = userData.wallets || [];
            
            // Check if this user owns the wallet associated with the bounty
            if (userWallets.includes(bounty.owner) || userWallets.includes(bounty.solanaAddress)) {
              console.log("Fixing ownership: User verified as wallet owner");
              const bountyRef = doc(db, 'bounties', bounty.id);
              await updateDoc(bountyRef, {
                owner: user.uid,
                updatedAt: Timestamp.now()
              });
              console.log("Ownership fixed successfully");
              // Reload to reflect changes
              window.location.reload();
            }
          }
        } catch (error) {
          console.error("Error during ownership verification:", error);
        }
      }
    };
    
    if (!loading && bounty) {
      fixOwnership();
    }
  }, [bounty, user, loading, isOwner]);
  
  // Debug logs
  console.log('Current user ID:', user?.uid);
  console.log('Current user Auth:', user ? 'Authenticated' : 'Not authenticated');
  console.log('Current user Auth details:', user ? {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    isAnonymous: user.isAnonymous,
    emailVerified: user.emailVerified
  } : 'No user');
  console.log('Bounty owner ID:', bounty?.owner);
  console.log('Is owner check result:', isOwner);
  console.log('Owner check details:', {
    userExists: !!user,
    bountyExists: !!bounty,
    userId: user?.uid,
    bountyOwnerId: bounty?.owner,
    isMatch: user?.uid === bounty?.owner
  });

  const statusColors: StatusColorType = {
    open: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      label: 'Open'
    },
    closed: {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      label: 'Closed'
    },
    cancelled: {
      bg: 'bg-red-100',
      text: 'text-red-800',
      label: 'Cancelled'
    },
    draft: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      label: 'Draft'
    },
    cancelling: {
      bg: 'bg-orange-100',
      text: 'text-orange-800',
      label: 'Cancelling'
    },
    completing: {
      bg: 'bg-blue-100', 
      text: 'text-blue-800',
      label: 'Completing'
    },
    completed: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      label: 'Completed'
    }
  };

  // Helper function to get status colors with fallback
  const getStatusColors = (status: string) => {
    return statusColors[status] || {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      label: status.charAt(0).toUpperCase() + status.slice(1)
    };
  };

  const severityColors = {
    critical: {
      bg: 'bg-red-100',
      text: 'text-red-800',
      label: 'Critical'
    },
    high: {
      bg: 'bg-orange-100',
      text: 'text-orange-800',
      label: 'High'
    },
    medium: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      label: 'Medium'
    },
    low: {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      label: 'Low'
    }
  };

  const submissionStatusColors = {
    pending: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      label: 'Pending'
    },
    approved: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      label: 'Approved'
    },
    rejected: {
      bg: 'bg-red-100',
      text: 'text-red-800',
      label: 'Rejected'
    }
  };

  const handlePublishBounty = async () => {
    if (!bounty?.id) return;
    
    try {
      setPublishing(true);
      await BountyService.updateStatus(bounty.id, 'open');
      
      // Refresh the page to show the updated status
      window.location.reload();
    } catch (error) {
      console.error('Error publishing bounty:', error);
      alert('Failed to publish bounty. Please try again.');
    } finally {
      setPublishing(false);
    }
  };

  const handleApproveSubmission = async (submissionId: string) => {
    console.log('Approve submission debug info:', {
      submissionId,
      isOwner,
      currentUserId: user?.uid,
      bountyOwnerId: bounty?.owner,
      bountyOwner: bounty?.owner,
      userMatch: bounty?.owner === user?.uid
    });
    
    // Add safety check to prevent non-owners from approving submissions
    if (!isOwner) {
      console.error("Cannot approve: User is not the bounty owner");
      alert("Only the bounty owner can approve submissions");
      return;
    }
    
    if (!bounty?.id) {
      console.error("Cannot approve: Bounty ID is missing");
      return;
    }
    
    console.log("=== APPROVE SUBMISSION START ===");
    console.log("Bounty ID:", bounty.id);
    console.log("Submission ID:", submissionId);
    
    try {
      setProcessing(submissionId);
      
      // Call the Bounty class method to approve the submission
      await BountyService.approveSubmission(bounty.id, submissionId);
      
      // Show success message
      alert("Submission approved successfully!");
      
      // Reload the page to show updated state
      window.location.reload();
      
    } catch (error) {
      console.error('Error approving submission:', error);
      
      // Show proper error message to user
      if (error instanceof Error) {
        alert(`Failed to approve submission: ${error.message}`);
      } else {
        alert('Failed to approve submission. Please try again.');
      }
      
    } finally {
      setProcessing(null);
      console.log("=== APPROVE SUBMISSION END ===");
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900">Error Loading Bounty</h2>
            <p className="mt-2 text-gray-600">{error || 'Bounty not found'}</p>
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

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="md:flex md:items-center md:justify-between mb-6">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold leading-7 text-white sm:text-3xl sm:truncate">
              {bounty.title}
            </h2>
            <div className="mt-1 flex flex-col sm:flex-row sm:flex-wrap sm:mt-0 sm:space-x-6">
              <div className="mt-2 flex items-center text-sm text-gray-500">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColors(bounty.status).bg} ${getStatusColors(bounty.status).text}`}>
                  {getStatusColors(bounty.status).label}
                </span>
              </div>
              <div className="mt-2 flex items-center text-sm text-gray-500">
                <svg className="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                Deadline: {formatDistanceToNow(new Date(bounty.deadline), { addSuffix: true })}
              </div>
              <div className="mt-2 flex items-center text-sm text-gray-500">
                <svg className="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                Created: {formatDistanceToNow(new Date(bounty.createdAt), { addSuffix: true })}
              </div>
            </div>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            <Link
              href="/bounties"
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Back to Bounties
            </Link>
            {isOwner && bounty.status === 'draft' && (
              <button
                className="ml-3 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                onClick={handlePublishBounty}
                disabled={publishing}
              >
                {publishing ? 'Publishing...' : 'Publish Bounty'}
              </button>
            )}
            {bounty.status === 'open' && !isOwner && user && (
              <Link
                href={`/bounty/${bounty.id}/submit`}
                className="ml-3 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Submit Finding
              </Link>
            )}
            {isOwner && bounty.status === 'open' && (
              <button
                className="ml-3 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                onClick={() => {
                  // In a real app, this would call an API to cancel the bounty
                  alert('This would cancel the bounty in a real application');
                }}
              >
                Cancel Bounty
              </button>
            )}
          </div>
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex" aria-label="Tabs">
              <button
                className={`${
                  activeTab === 'details'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
                onClick={() => setActiveTab('details')}
              >
                Bounty Details
              </button>
              <button
                className={`${
                  activeTab === 'submissions'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
                onClick={() => setActiveTab('submissions')}
              >
                Submissions ({submissions.length})
              </button>
            </nav>
          </div>

          {activeTab === 'details' && (
            <div className="px-4 py-5 sm:p-6">
              <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                {/* Bounty Amount */}
                <div className="sm:col-span-3">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Bounty Amount</h3>
                  <div className="mt-2 text-3xl font-bold text-gray-900">
                    {bounty.bountyAmount} {bounty.solanaAddress ? 'USDC' : 'SOL'}
                  </div>
                  
                  {/* Submit Finding Button for Auditors */}
                  {user && !isOwner && bounty.status === 'open' && (
                    <div className="mt-4">
                      <Link
                        href={`/bounty/${bounty.id}/submit`}
                        className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                        </svg>
                        Submit Your Finding
                      </Link>
                    </div>
                  )}
                </div>

                {/* Repository */}
                <div className="sm:col-span-3">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Repository</h3>
                  <div className="mt-2">
                    <a
                      href={bounty.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      {bounty.repoUrl.replace('https://github.com/', '')}
                    </a>
                  </div>
                </div>

                {/* Owner */}
                <div className="sm:col-span-3">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Owner</h3>
                  <div className="mt-2 flex items-center">
                    {bounty.ownerPhotoURL && (
                      <img
                        className="h-8 w-8 rounded-full mr-2"
                        src={bounty.ownerPhotoURL}
                        alt={bounty.ownerName}
                      />
                    )}
                    <span>{bounty.ownerName}</span>
                  </div>
                </div>

                {/* Solana Address */}
                <div className="sm:col-span-3">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Solana Address</h3>
                  <div className="mt-2 flex flex-col">
                    <div className="flex items-center">
                      <span className="font-mono text-sm text-gray-600 break-all">{bounty.solanaAddress ? bounty.solanaAddress : 'Not available'}</span>
                      {bounty.solanaAddress && (
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(bounty.solanaAddress || '')}
                          className="ml-2 text-indigo-600 hover:text-indigo-900"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                            <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                          </svg>
                        </button>
                      )}
                    </div>
                    
                    {/* Add Solana Explorer Link */}
                    {bounty.transactionHash && (
                      <div className="mt-2">
                        <a
                          href={`https://explorer.solana.com/tx/${bounty.transactionHash}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-indigo-600 hover:text-indigo-900 flex items-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          View transaction on Solana Explorer
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Description */}
                <div className="sm:col-span-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Description</h3>
                  <div className="mt-2 prose prose-indigo text-gray-700">
                    <p>{bounty.description}</p>
                  </div>
                </div>

                {/* Severity Weights */}
                <div className="sm:col-span-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Severity Weights</h3>
                  <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="bg-red-50 p-4 rounded-lg">
                      <div className="font-medium text-red-800">Critical</div>
                      <div className="text-xl font-bold">{bounty.severityWeights.critical}%</div>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-lg">
                      <div className="font-medium text-orange-800">High</div>
                      <div className="text-xl font-bold">{bounty.severityWeights.high}%</div>
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-lg">
                      <div className="font-medium text-yellow-800">Medium</div>
                      <div className="text-xl font-bold">{bounty.severityWeights.medium}%</div>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="font-medium text-blue-800">Low</div>
                      <div className="text-xl font-bold">{bounty.severityWeights.low}%</div>
                    </div>
                  </div>
                </div>

                {/* Tags */}
                <div className="sm:col-span-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Tags</h3>
                  <div className="mt-2">
                    {bounty.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 mr-2"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Judging Criteria */}
                <div className="sm:col-span-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Judging Criteria</h3>
                  <div className="mt-2 text-sm text-gray-500">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      components={{
                        p: ({node, ...props}) => <p className="prose prose-indigo max-w-none" {...props} />
                      }}
                    >
                      {bounty.judgingCriteria || "No specific judging criteria provided for this bounty."}
                    </ReactMarkdown>
                  </div>
                  
                  {/* Submit findings button - only for non-owners when bounty is open */}
                  {user && bounty.status === 'open' && user.uid !== bounty.owner && (
                    <div className="mt-4">
                      <Link
                        href={`/bounty/${bounty.id}/submit`}
                        className="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      >
                        Submit Finding
                      </Link>
                    </div>
                  )}
                </div>

                {/* Login prompt for unauthenticated users */}
                {!user && bounty.status === 'open' && (
                  <div className="mt-4 p-4 border border-gray-200 rounded-md bg-gray-50">
                    <p className="text-sm text-gray-700 mb-2">
                      Login or create an account to submit findings for this bounty
                    </p>
                    <Link
                      href={`/login?redirect=/bounty/${bounty.id}`}
                      className="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      Login
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'submissions' && (
            <div className="px-4 py-5 sm:px-6">
              {submissions.length === 0 ? (
                <div className="text-center py-12">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">No Submissions Yet</h3>
                  <p className="mt-2 text-gray-500">
                    {isOwner ? 'No one has submitted any findings yet.' : 'Be the first to submit a finding!'}
                  </p>
                  {!isOwner && user && bounty.status === 'open' && (
                    <div className="mt-6">
                      <Link
                        href={`/bounty/${bounty.id}/submit`}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Submit Finding
                      </Link>
                    </div>
                  )}
                  {!user && !isOwner && bounty.status === 'open' && (
                    <div className="mt-6 border border-indigo-100 rounded-lg p-4 bg-indigo-50">
                      <p className="mb-3 text-sm text-indigo-600">Login or create an account to submit findings for this bounty</p>
                      <Link
                        href={`/login?redirect=/bounty/${bounty.id}`}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Log In / Sign Up
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                  <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Finding</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Auditor</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Severity</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                        <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {submissions.map((submission) => (
                        <tr key={submission.id}>
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
                            <div className="font-medium text-gray-900">{submission.title}</div>
                            <div className="text-gray-500 truncate max-w-xs">
                              {submission.description.substring(0, 60)}
                              {submission.description.length > 60 ? '...' : ''}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            <div className="flex items-center">
                              {submission.auditor.photoURL && (
                                <img
                                  className="h-8 w-8 rounded-full mr-2"
                                  src={submission.auditor.photoURL}
                                  alt={submission.auditor.displayName}
                                />
                              )}
                              <span>{submission.auditor.displayName}</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${severityColors[submission.severity]?.bg || 'bg-gray-100'} ${severityColors[submission.severity]?.text || 'text-gray-800'}`}>
                              {severityColors[submission.severity]?.label || submission.severity}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${submissionStatusColors[submission.status]?.bg || 'bg-gray-100'} ${submissionStatusColors[submission.status]?.text || 'text-gray-800'}`}>
                              {submissionStatusColors[submission.status]?.label || submission.status}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {isOwner && submission.status === 'pending' && (
                              <button
                                onClick={() => handleApproveSubmission(submission.id)}
                                className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-green-500"
                                disabled={processing === submission.id}
                              >
                                {processing === submission.id ? 'Processing...' : 'Approve'}
                              </button>
                            )}
                            <Link 
                              href={`/bounty/${bounty.id}/submission/${submission.id}`}
                              className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-indigo-500 ml-2"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}