'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/context/AuthContext';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { TransactionStatus } from '@/components/transaction/TransactionStatus';
import { SubmissionVerificationDialog } from '@/components/submission/SubmissionVerificationDialog';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Timestamp } from 'firebase/firestore';
import { SolanaService } from '@/services/solana';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { BountyService } from '@/services/bounty';
import { getSolanaConnection } from '@/lib/solana/config';
import { Transaction } from '@solana/web3.js';
import { ComputeBudgetProgram, TransactionInstruction } from '@solana/web3.js';

interface IBounty {
  id: string;
  title: string;
  status: 'open' | 'closed' | 'cancelled';
  owner: {
    id: string;
    displayName: string;
  };
}

interface ISubmission {
  id: string;
  bountyId: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'approved' | 'rejected' | 'approving';
  auditor: {
    id: string;
    displayName: string;
    photoURL?: string;
    walletAddress?: string;
  };
  auditorWalletAddress?: string;
  createdAt: string;
  pocUrl?: string;
  fixUrl?: string;
  reviewerComments?: string;
  payoutAmount?: number;
  claimed?: boolean;
  claimedAt?: string;
  tokenMint?: string;
  transactionSignature?: string;
  transactionConfirmed?: boolean;
  transactionConfirmedAt?: string;
}

const DEBUG = true;

async function fetchUserWalletAddress(userId: string): Promise<string | null> {
  console.log('Directly fetching wallet address for user:', userId);
  try {
    // First try the new API endpoint with query params
    const response = await fetch(`/api/wallet-address?userId=${encodeURIComponent(userId)}`, {
      method: 'GET',
      cache: 'no-store'
    });
    
    if (response.ok) {
      const data = await response.json();
      const walletAddress = data.walletAddress;
      
      if (walletAddress) {
        console.log('Successfully retrieved wallet address via API:', walletAddress);
        return walletAddress;
      }
    } else {
      console.warn(`API error (${response.status}), falling back to direct Firestore access`);
    }
    
    // Fallback to direct Firestore access
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const walletAddress = userData.walletAddress || null;
      
      if (walletAddress) {
        console.log('Successfully retrieved wallet address from Firestore:', walletAddress);
        return walletAddress;
      } else {
        console.warn('User exists but has no wallet address');
        return null;
      }
    } else {
      console.warn('User document not found in Firestore');
      return null;
    }
  } catch (error) {
    console.error('Error directly fetching user wallet address:', error);
    return null;
  }
}

export default function SubmissionDetailPage() {
  const { id, submissionId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [bounty, setBounty] = useState<IBounty | null>(null);
  const [submission, setSubmission] = useState<ISubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [processingAction, setProcessingAction] = useState(false);
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showClaimDialog, setShowClaimDialog] = useState(false);
  const wallet = useWallet();
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{ status?: string; success: boolean; message: string; signature?: string } | null>(null);
  const [repairingVault, setRepairingVault] = useState(false);
  const [repairResult, setRepairResult] = useState<{
    status: string;
    message?: string;
    vaultAddress?: string;
  } | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimProcessing, setClaimProcessing] = useState(false);
  const [claimResult, setClaimResult] = useState<{
    status: string;
    message?: string;
    signature?: string;
  } | null>(null);

  useEffect(() => {
    // Fetch bounty and submission data
    setLoading(true);
    
    const fetchData = async () => {
      if (DEBUG) console.log('Fetching data for submission:', submissionId);
      try {
        // Fetch the bounty data
        const bountyResponse = await fetch(`/api/bounty/${id}`);
        if (!bountyResponse.ok) {
          // Handle non-200 responses
          const errorText = await bountyResponse.text();
          console.error(`Bounty API error (${bountyResponse.status}):`, errorText);
          throw new Error(`Failed to fetch bounty (${bountyResponse.status}): ${errorText}`);
        }
        
        const bountyData = await bountyResponse.json();
        if (bountyData.error) {
          throw new Error(bountyData.error);
        }
        
        // Fetch the submission data
        const submissionResponse = await fetch(`/api/submission/${submissionId}`);
        if (!submissionResponse.ok) {
          // Handle non-200 responses
          const errorText = await submissionResponse.text();
          console.error(`Submission API error (${submissionResponse.status}):`, errorText);
          throw new Error(`Failed to fetch submission (${submissionResponse.status}): ${errorText}`);
        }
        
        const submissionData = await submissionResponse.json();
        if (submissionData.error) {
          throw new Error(submissionData.error);
        }
        
        // Transform auditor if it's a string ID into an object
        if (typeof submissionData.auditor === 'string') {
          console.log('Transforming auditor ID into object:', submissionData.auditor);
          const auditorId = submissionData.auditor;
          submissionData.auditor = {
            id: auditorId,
            displayName: submissionData.auditorName || 'Unknown Auditor',
            photoURL: submissionData.auditorPhotoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${auditorId}`
          };
          console.log('Transformed auditor object:', submissionData.auditor);
        }
        
        // First check for direct auditor wallet address in submission
        let auditorWalletAddress = submissionData.auditorWalletAddress;
        
        // If not found, check in the auditor object
        if (!auditorWalletAddress && submissionData.auditor?.walletAddress) {
          auditorWalletAddress = submissionData.auditor.walletAddress;
        }
        
        // If still not found and we have the auditor ID, try to fetch from user profile
        if (!auditorWalletAddress && submissionData.auditor.id) {
          console.log('Fetching auditor wallet address for user ID:', submissionData.auditor.id);
          
          try {
            // Try direct Firestore access
            auditorWalletAddress = await fetchUserWalletAddress(submissionData.auditor.id);
            
            if (auditorWalletAddress) {
              console.log('Successfully retrieved wallet address:', auditorWalletAddress);
              
              // Try to update the submission with the wallet address
              try {
                const submissionRef = doc(db, 'submissions', submissionId as string);
                await updateDoc(submissionRef, {
                  auditorWalletAddress: auditorWalletAddress
                });
                console.log('Updated submission with wallet address');
              } catch (updateErr) {
                console.error('Error updating submission with wallet address:', updateErr);
                // Continue even if update fails - we still have the address in memory
              }
            } else {
              console.warn('No wallet address found for user');
            }
          } catch (error) {
            console.error('Error fetching auditor wallet address:', error);
            // Continue without wallet address - user will need to provide it later
          }
        }
        
        // Update the submission data with the wallet address
        if (auditorWalletAddress) {
          submissionData.auditorWalletAddress = auditorWalletAddress;
          if (submissionData.auditor && typeof submissionData.auditor === 'object') {
            submissionData.auditor.walletAddress = auditorWalletAddress;
          }
        } else {
          console.warn('NO AUDITOR WALLET ADDRESS FOUND IN SUBMISSION DATA');
        }
        
        // Ensure dates are properly formatted
        if (bountyData.createdAt) {
          bountyData.createdAt = new Date(bountyData.createdAt).toISOString();
        }
        if (bountyData.deadline) {
          bountyData.deadline = new Date(bountyData.deadline).toISOString();
        }
        if (submissionData.createdAt) {
          submissionData.createdAt = new Date(submissionData.createdAt).toISOString();
        }
        if (submissionData.claimedAt) {
          submissionData.claimedAt = new Date(submissionData.claimedAt).toISOString();
        }
        
        setBounty(bountyData);
        setSubmission(submissionData);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [id, submissionId]);

  const isOwner = bounty && user && (
    // Handle both cases: owner as object with id or owner as string
    (typeof bounty.owner === 'object' && bounty.owner.id === user.uid) || 
    (typeof bounty.owner === 'string' && bounty.owner === user.uid)
  );
  const isAuditor = submission && user && (
    // Handle both possibilities: auditor as object with id or auditor as string
    (typeof submission.auditor === 'object' && submission.auditor.id === user.uid) ||
    (typeof submission.auditor === 'string' && submission.auditor === user.uid)
  );

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
    approving: {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      label: 'Approving'
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

  const handleApproveSubmission = async () => {
    if (!isOwner) {
      console.log('Cannot approve: Not owner');
      return;
    }
    
    try {
      setProcessingAction(true);
      console.log('Approving submission...');
      
      // First, get the hunter wallet address
      if (!submission) {
        throw new Error('Submission data not found');
      }
      
      // Get the auditor wallet address from multiple possible sources
      const auditorWalletAddress = 
        submission.auditorWalletAddress || 
        (typeof submission.auditor === 'object' && submission.auditor?.walletAddress) ||
        (typeof submission.auditor === 'string' ? submission.auditor : null);
        
      if (!auditorWalletAddress) {
        throw new Error('Hunter wallet address not found. Please ensure the auditor has connected their wallet.');
      }
      
      // 1. Update submission status to 'approving' first
      const submissionRef = doc(db, 'submissions', submissionId as string);
      await updateDoc(submissionRef, {
        status: 'approving',
        reviewedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      
      // Set state to reflect the approving status
      setSubmission({
        ...submission,
        status: 'approving'
      } as ISubmission);
      
      // 2. Execute on-chain approval transaction
      console.log('Executing on-chain approval...');
      
      if (!wallet.connected || !wallet.publicKey) {
        throw new Error('Please connect your wallet first');
      }
      
      // Use the SolanaService to release payment from escrow
      const approvalResult = await SolanaService.releasePaymentFromEscrow(
        wallet,
        id as string,
        auditorWalletAddress,
        submission.payoutAmount || 0 // Use payout amount if available
      );
      
      if (approvalResult.status === 'error') {
        console.error('On-chain approval failed:', approvalResult.message);
        
        // Still mark as approved in Firebase but with error note
        await updateDoc(submissionRef, {
          status: 'approved',
          reviewedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          reviewerComments: `Approved, but on-chain transaction had issues: ${approvalResult.message}`
        });
        
        // Throw error to be caught by catch block
        throw new Error(`On-chain approval failed: ${approvalResult.message}`);
      }
      
      // 3. Update Firestore with successful approval
      console.log('On-chain approval successful, updating Firestore');
      
      // Call the static method on Bounty class to approve the submission in Firebase
      await BountyService.approveSubmission(id as string, submissionId as string);
      
      // Update submission with transaction signature if available
      if (approvalResult.signature) {
        await updateDoc(submissionRef, {
          transactionSignature: approvalResult.signature,
          approvalSignature: approvalResult.signature
        });
      }
      
      console.log('Submission approved successfully, both on-chain and in Firestore');
      
      // Update UI
      const updatedSubmission = {
        ...submission,
        status: 'approved',
        transactionSignature: approvalResult.signature
      };
      setSubmission(updatedSubmission as ISubmission);
      
      // Show success message
      alert('Submission approved successfully! The auditor can now claim the bounty.');
      
      // Refresh the page to show the updated state
      window.location.reload();
      
    } catch (error) {
      console.error('Error approving submission:', error);
      setError(`Failed to approve submission: ${(error as Error).message}`);
    } finally {
      setProcessingAction(false);
      setShowApproveDialog(false);
    }
  };

  const handleReject = async () => {
    if (!isOwner) return;
    setProcessingAction(true);
    setError(null);
    
    try {
      console.log('Rejecting submission...');
      
      // Update submission to rejected status
      const submissionRef = doc(db, 'submissions', submissionId as string);
      await updateDoc(submissionRef, {
        status: 'rejected',
        reviewerComments: reviewComment || 'Rejected',
        updatedAt: Timestamp.now(),
        reviewedAt: Timestamp.now()
      });
      
      console.log('Submission rejected successfully');
      
      // Update UI
      const updatedSubmission = {
        ...submission!,
        status: 'rejected',
        reviewerComments: reviewComment || 'Rejected'
      };
      setSubmission(updatedSubmission as ISubmission);
      
      // Close dialog
      setShowRejectDialog(false);
      
      // Redirect after a short delay
      setTimeout(() => {
        router.push(`/bounty/${id}`);
      }, 2000);
    } catch (error) {
      console.error('Error rejecting submission:', error);
      setError(`Failed to reject submission: ${(error as Error).message}`);
    } finally {
      setProcessingAction(false);
    }
  };

  const handleRepairVault = async () => {
    if (!wallet || !wallet.publicKey || !bounty) {
      alert('Wallet must be connected to repair the vault');
      return;
    }
    
    try {
      setRepairingVault(true);
      
      const result = await SolanaService.repairVaultAccount(
        wallet,
        bounty.id
      );
      
      setRepairResult(result);
      
      if (result.status === 'success') {
        alert('Vault account repaired successfully! You can now try claiming the bounty again.');
      } else {
        alert(`Repair failed: ${result.message}`);
      }
    } catch (error) {
      console.error('Error repairing vault:', error);
      alert('Error repairing vault: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setRepairingVault(false);
    }
  };

  const handleClaimBountyReward = async () => {
    if (!wallet || !wallet.publicKey || !bounty) {
      alert('Wallet must be connected to claim the bounty');
      return;
    }
    
    try {
      setClaimProcessing(true);
      setClaimError(null); // Clear previous errors
      
      console.log("Claiming bounty with ID:", bounty.id);
      const result = await SolanaService.claimBounty(
        wallet,
        bounty.id
      );
      
      console.log("Claim failed:", result);
      
      if (result.status === 'error') {
        setClaimError(result.message || 'Unknown error claiming bounty');
      } else {
        setClaimResult(result);
      }
    } catch (error) {
      console.error('Error claiming bounty:', error);
      setClaimError(error instanceof Error ? error.message : String(error));
    } finally {
      setClaimProcessing(false);
    }
  };

  // Simple handler for the approve button click
  const handleApproveButton = () => {
    if (!isOwner) {
      console.log('Cannot approve: Not owner');
      return;
    }
    setShowApproveDialog(true);
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

  if (error || !bounty || !submission) {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900">Error Loading Submission</h2>
            <p className="mt-2 text-gray-600">{error || 'Submission not found'}</p>
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
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
              {submission.title}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              For bounty: <Link href={`/bounty/${bounty.id}`} className="font-medium text-indigo-600 hover:text-indigo-500">{bounty.title}</Link>
            </p>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            <Link
              href={`/bounty/${id}`}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Back to Bounty
            </Link>
          </div>
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
          <div className="border-b border-gray-200 px-4 py-5 sm:px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {submission.auditor.photoURL && (
                  <img
                    className="h-10 w-10 rounded-full mr-3"
                    src={submission.auditor.photoURL}
                    alt={submission.auditor.displayName}
                  />
                )}
                <div>
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    Submitted by {submission.auditor.displayName}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {formatDistanceToNow(new Date(submission.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
              <div className="flex space-x-2">
                <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${severityColors[submission.severity].bg} ${severityColors[submission.severity].text}`}>
                  {severityColors[submission.severity].label}
                </span>
                <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${submissionStatusColors[submission.status].bg} ${submissionStatusColors[submission.status].text}`}>
                  {submissionStatusColors[submission.status].label}
                </span>
              </div>
            </div>
          </div>
          
          <div className="px-4 py-5 sm:p-6">
            <div className="prose prose-indigo max-w-none">
              <h4 className="text-lg font-medium text-gray-900">Description</h4>
              <div className="mt-2 whitespace-pre-line text-gray-700">
                {submission.description}
              </div>
              
              <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                {submission.pocUrl && (
                  <div>
                    <h4 className="text-lg font-medium text-gray-900">Proof of Concept</h4>
                    <div className="mt-2">
                      <a
                        href={submission.pocUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        {submission.pocUrl}
                      </a>
                    </div>
                  </div>
                )}
                
                {submission.fixUrl && (
                  <div>
                    <h4 className="text-lg font-medium text-gray-900">Fix Implementation</h4>
                    <div className="mt-2">
                      <a
                        href={submission.fixUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        {submission.fixUrl}
                      </a>
                    </div>
                  </div>
                )}
              </div>
              
              {submission.reviewerComments && (
                <div className="mt-6">
                  <h4 className="text-lg font-medium text-gray-900">Reviewer Comments</h4>
                  <div className="mt-2 bg-gray-50 p-4 rounded-lg text-gray-700">
                    {submission.reviewerComments}
                  </div>
                </div>
              )}
              
              {submission.status === 'approved' && submission.payoutAmount && (
                <div className="mt-6">
                  <h4 className="text-lg font-medium text-gray-900">Payout Amount</h4>
                  <div className="mt-2 text-2xl font-bold text-gray-900">
                    {submission.payoutAmount} {submission.tokenMint ? 'USDC' : 'SOL'}
                    {submission.claimed && (
                      <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Claimed
                      </span>
                    )}
                  </div>
                  {submission.claimedAt && (
                    <p className="mt-1 text-sm text-gray-500">
                      Claimed {formatDistanceToNow(new Date(submission.claimedAt), { addSuffix: true })}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

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

        {/* Action Buttons */}
        <div className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
            {isOwner && submission.status === 'pending' && (
              <div>
                <div className="flex space-x-4">
                  <button
                    type="button"
                    onClick={handleApproveButton}
                    disabled={processingAction}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    {processingAction ? 'Processing...' : 'Approve Submission'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRejectDialog(true)}
                    disabled={processingAction}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    {processingAction ? 'Processing...' : 'Reject Submission'}
                  </button>
                </div>
              </div>
            )}
            
            {isAuditor && submission.status === 'approved' && !submission.claimed && !submission.transactionSignature && (
              <div className="mb-4">
                <div className="flex flex-col space-y-3">
                  {!wallet.connected ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-3">
                      <p className="text-sm text-yellow-700 mb-2">You need to connect your Solana wallet to claim the bounty.</p>
                      <div className="flex justify-start">
                        <WalletMultiButton />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="bg-green-50 border border-green-200 rounded-md p-3 mb-3">
                        <p className="text-sm text-green-700">
                          Wallet connected: {wallet.publicKey?.toString().slice(0, 6)}...{wallet.publicKey?.toString().slice(-4)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleClaimBountyReward}
                        disabled={paymentProcessing}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        {paymentProcessing ? (
                          <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Processing Claim...
                          </span>
                        ) : (
                          'Claim Bounty Reward'
                        )}
                      </button>
                    </>
                  )}
                  
                  {paymentResult && (
                    <div className={`p-3 rounded text-sm ${paymentResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      <p>{paymentResult.message}</p>
                      {paymentResult.signature && (
                        <a 
                          href={`https://explorer.solana.com/tx/${paymentResult.signature}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline text-blue-600 hover:text-blue-800 mt-1 inline-block"
                        >
                          View transaction on Solana Explorer
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {isOwner && submission.status === 'approved' && !submission.claimed && !submission.transactionSignature && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4 mt-4">
                <p className="text-sm text-green-700">
                  You've approved this submission. The auditor can now claim the bounty reward.
                </p>
              </div>
            )}
            
            {isAuditor && submission.status === 'approved' && submission.claimed && (
              <div>
                <button
                  type="button"
                  disabled={true}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gray-400 cursor-not-allowed"
                >
                  Bounty Claimed
                </button>
              </div>
            )}
            
            {submission.transactionSignature && (
              <div className="bg-gray-50 p-4 rounded-md">
                <h3 className="text-sm font-medium text-gray-900">Transaction</h3>
                {submission.transactionSignature === 'direct-firestore-update' ? (
                  <p className="mt-1 text-xs text-gray-500 break-all">
                    Payment processed directly
                  </p>
                ) : (
                  <div>
                    <p className="mt-1 text-xs text-gray-500 break-all">
                      {submission.transactionSignature}
                    </p>
                    <div className="mt-2">
                      <a 
                        href={`https://explorer.solana.com/tx/${submission.transactionSignature}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        View on Solana Explorer
                      </a>
                    </div>
                    <div className="mt-2">
                      <TransactionStatus signature={submission.transactionSignature} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Dialogs */}
        <SubmissionVerificationDialog
          isOpen={showApproveDialog}
          onClose={() => setShowApproveDialog(false)}
          onConfirm={handleApproveSubmission}
          title="Approve Submission"
          description={`Are you sure you want to approve this submission? This is a two-step process:

1. First, you will approve the submission (current step).
2. Then, you'll see a "Pay Auditor Now" button to actually release the funds.

No funds will be transferred until you complete the second step.`}
          action="approve"
          isProcessing={processingAction}
          error={error}
          reviewComment={reviewComment}
          onReviewCommentChange={setReviewComment}
        />

        <SubmissionVerificationDialog
          isOpen={showRejectDialog}
          onClose={() => setShowRejectDialog(false)}
          onConfirm={handleReject}
          title="Reject Submission"
          description="Are you sure you want to reject this submission? Please provide a detailed reason."
          action="reject"
          isProcessing={processingAction}
          error={error}
          reviewComment={reviewComment}
          onReviewCommentChange={setReviewComment}
        />

        <SubmissionVerificationDialog
          isOpen={showClaimDialog}
          onClose={() => setShowClaimDialog(false)}
          onConfirm={handleClaimBountyReward}
          title="Claim Reward"
          description={`You're about to claim a reward of ${submission?.payoutAmount || 0} ${submission?.tokenMint ? 'USDC' : 'SOL'}. The funds will be transferred to your connected wallet.`}
          action="claim"
          isProcessing={processingAction}
          error={error}
        />

        {/* Show transaction error message */}
        {claimError && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Transaction simulation failed: Unknown error</h3>
                <p className="text-sm text-red-700 mt-1">{claimError}</p>
                {claimError.includes('AccountNotFound') && (
                  <div className="mt-3">
                    <p className="text-sm text-red-700">This error typically occurs when the vault account doesn't exist.</p>
                    <button
                      onClick={handleRepairVault}
                      disabled={repairingVault}
                      className={`mt-2 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${repairingVault ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {repairingVault ? 'Repairing Vault...' : 'Repair Vault Account'}
                    </button>
                    {repairResult && (
                      <div className={`mt-2 text-sm ${repairResult.status === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                        {repairResult.message}
                        {repairResult.status === 'success' && (
                          <button
                            onClick={handleClaimBountyReward}
                            className="ml-2 inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-green-500"
                          >
                            Try Claim Again
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Add claim bounty button */}
        {submission && submission.status === 'approved' && isAuditor && (
          <div className="mt-6 flex flex-col space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">Submission Approved</h3>
                  <div className="mt-2 text-sm text-green-700">
                    <p>Your submission has been approved! You can now claim your bounty reward.</p>
                  </div>
                  
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleClaimBountyReward}
                      disabled={claimProcessing}
                      className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 ${claimProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {claimProcessing ? 'Claiming...' : 'Claim Bounty Reward'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            {claimResult && claimResult.status === 'success' && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">Bounty Claimed Successfully!</h3>
                    <div className="mt-2 text-sm text-green-700">
                      <p>{claimResult.message || "Your bounty reward has been claimed successfully."}</p>
                      {claimResult.signature && (
                        <a 
                          href={`https://explorer.solana.com/tx/${claimResult.signature}?cluster=devnet`}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-green-600 hover:underline mt-2 inline-block"
                        >
                          View transaction on Solana Explorer
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
}