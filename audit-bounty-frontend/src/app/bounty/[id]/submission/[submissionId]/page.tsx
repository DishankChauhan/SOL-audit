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
import { getConnection } from '@/lib/solana/config';
import { Transaction } from '@solana/web3.js';
import { ComputeBudgetProgram, TransactionInstruction } from '@solana/web3.js';
import { SystemProgram } from '@solana/web3.js';

interface IBounty {
  id: string;
  title: string;
  status: 'open' | 'closed' | 'cancelled';
  owner: {
    id: string;
    displayName: string;
  };
  amount?: number;
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

// Helper function to safely format dates
function safeFormatDistanceToNow(dateValue: string | Date | number | null | undefined): string {
  if (!dateValue) return 'some time ago';
  
  try {
    const date = new Date(dateValue);
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'some time ago';
    }
    return formatDistanceToNow(date, { addSuffix: true });
  } catch (error) {
    console.warn('Error formatting date:', error);
    return 'some time ago';
  }
}

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

// Helper function to convert SOL to lamports
function solToLamports(sol: number): number {
  return Math.floor(sol * 1000000000);
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
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [auditorWalletAddress, setAuditorWalletAddress] = useState<string | null>(null);

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
        console.log('Fetching submission data for ID:', submissionId);
        const submissionUrl = `/api/submission/${submissionId}`;
        console.log('Submission API URL:', submissionUrl);
        
        const submissionResponse = await fetch(submissionUrl);
        console.log('Submission API Response Status:', submissionResponse.status);
        
        if (!submissionResponse.ok) {
          // Handle non-200 responses
          const errorText = await submissionResponse.text();
          console.error(`Submission API error (${submissionResponse.status}):`, errorText);
          throw new Error(`Failed to fetch submission (${submissionResponse.status}): ${errorText}`);
        }
        
        const submissionData = await submissionResponse.json();
        console.log('Submission data received:', submissionData);
        
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
          try {
            const dateValue = new Date(bountyData.createdAt);
            if (!isNaN(dateValue.getTime())) {
              bountyData.createdAt = dateValue.toISOString();
            }
          } catch (err) {
            console.warn('Invalid createdAt date format:', bountyData.createdAt);
          }
        }
        
        if (bountyData.deadline) {
          try {
            const dateValue = new Date(bountyData.deadline);
            if (!isNaN(dateValue.getTime())) {
              bountyData.deadline = dateValue.toISOString();
            }
          } catch (err) {
            console.warn('Invalid deadline date format:', bountyData.deadline);
          }
        }
        
        if (submissionData.createdAt) {
          try {
            const dateValue = new Date(submissionData.createdAt);
            if (!isNaN(dateValue.getTime())) {
              submissionData.createdAt = dateValue.toISOString();
            }
          } catch (err) {
            console.warn('Invalid submission createdAt date format:', submissionData.createdAt);
          }
        }
        
        if (submissionData.claimedAt) {
          try {
            const dateValue = new Date(submissionData.claimedAt);
            if (!isNaN(dateValue.getTime())) {
              submissionData.claimedAt = dateValue.toISOString();
            }
          } catch (err) {
            console.warn('Invalid claimedAt date format:', submissionData.claimedAt);
          }
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

  useEffect(() => {
    if (submission) {
      // Extract auditor wallet address from submission
      const walletAddress = 
        submission.auditorWalletAddress || 
        (typeof submission.auditor === 'object' && submission.auditor?.walletAddress) ||
        null;
      
      setAuditorWalletAddress(walletAddress);
    }
  }, [submission]);

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
      console.log('Approving submission using contract flow...');
      
      // First, get the submission data
      if (!submission) {
        throw new Error('Submission data not found');
      }
      
      // Get the auditor wallet address from multiple possible sources
      const auditorWalletAddress = 
        submission.auditorWalletAddress || 
        (typeof submission.auditor === 'object' && submission.auditor?.walletAddress) ||
        (typeof submission.auditor === 'string' ? submission.auditor : null);
        
      if (!auditorWalletAddress) {
        throw new Error('Auditor wallet address not found. Please ensure the auditor has connected their wallet.');
      }
      
      // Determine the payout amount (use default if not specified)
      const payoutAmount = submission.payoutAmount || 0.1; // Default to 0.1 SOL for testing
      console.log(`Using payout amount: ${payoutAmount} SOL`);
      
      // 1. Update submission status to 'approving' first in Firebase
      const submissionDocRef = doc(db, 'submissions', submissionId as string);
      await updateDoc(submissionDocRef, {
        status: 'approving',
        reviewedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        payoutAmount: payoutAmount // Ensure payoutAmount is saved to the submission
      });
      
      // Set state to reflect the approving status
      setSubmission({
        ...submission,
        status: 'approving',
        payoutAmount: payoutAmount // Update local state with payout amount
      } as ISubmission);
      
      // 2. Execute on-chain ApproveSubmission instruction to set the auditor as the approved hunter
      console.log('Step 1: Executing ApproveSubmission instruction...');
      
      if (!wallet.connected || !wallet.publicKey) {
        throw new Error('Please connect your wallet first');
      }
      
      // Check if the submission has a valid ID
      const submissionIdValue = submission.id;
      if (!submissionIdValue) {
        throw new Error('Submission ID not found');
      }
      
      // First, approve the submission - this marks the auditor as the approved hunter
      const approvalResult = await SolanaService.approveSubmission(
        wallet,
        id as string,
        auditorWalletAddress,
        submissionIdValue
      );
      
      if (approvalResult.status === 'error') {
        throw new Error(`Failed to approve submission: ${approvalResult.message}`);
      }
      
      console.log('ApproveSubmission transaction successful:', approvalResult.txSignature);
      
      // 3. Optionally, also execute SelectWinner to set the payout amount
      console.log('Step 2: Executing SelectWinner instruction...');
      
      const submissionPda = new PublicKey(submissionIdValue); // This should be the actual submission PDA 
      
      const selectionResult = await SolanaService.selectWinner(
        wallet,
        id as string,
        submissionIdValue,
        submissionIdValue,
        payoutAmount
      );
      
      if (selectionResult.status === 'error') {
        console.warn(`SelectWinner step had an issue: ${selectionResult.message}`);
        // Continue anyway - the ApproveSubmission is the critical part
      } else {
        console.log('SelectWinner transaction successful:', selectionResult.txSignature);
      }
      
      // 4. Update Firestore with successful approval
      console.log('On-chain approval successful, updating Firestore');
      
      // Use the transaction signature from either step
      const txSignature = selectionResult.status === 'success' 
        ? selectionResult.txSignature 
        : approvalResult.txSignature;
      
      // Update the submission with approval status and transaction info
      await updateDoc(submissionDocRef, {
        status: 'approved',
        transactionSignature: txSignature,
        approvalSignature: txSignature,
        reviewedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        payoutAmount: payoutAmount, // Ensure payoutAmount is saved to the submission
        reviewerComments: reviewComment || 'Approved! You can now claim the bounty reward from the escrow.'
      });
      
      console.log('Submission approved successfully, both on-chain and in Firestore');
      
      // Update UI
      const updatedSubmission = {
        ...submission,
        status: 'approved',
        transactionSignature: txSignature,
        payoutAmount: payoutAmount, // Update local state with payout amount
        reviewerComments: reviewComment || 'Approved! You can now claim the bounty reward from the escrow.'
      };
      setSubmission(updatedSubmission as ISubmission);
      
      // Get auditor wallet for display purposes
      setAuditorWalletAddress(auditorWalletAddress);
      
      // Show success message explaining the escrow flow
      alert(`Submission approved successfully! 

The auditor's wallet (${auditorWalletAddress.slice(0, 6)}...${auditorWalletAddress.slice(-6)}) has been marked as the approved hunter in the blockchain.
The auditor can now claim the bounty reward of ${payoutAmount} SOL by using the "Claim Reward" button.

The funds will remain secure in the escrow until the auditor claims them.`);
      
    } catch (error) {
      console.error('Error approving submission:', error);
      setError(`Failed to approve submission: ${(error as Error).message}`);
      
      // Try to still mark as approved even if there was an error
      try {
        if (submission) {
          const submissionDocRef = doc(db, 'submissions', submissionId as string);
          await updateDoc(submissionDocRef, {
            status: 'approved',
            reviewedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            reviewerComments: `${reviewComment || ''}\n\nNote: Approved, but had technical issues with the on-chain approval: ${(error as Error).message}. The auditor will need to contact you to arrange payment.`
          });
          
          alert('Submission was marked as approved, but there were technical issues with the on-chain approval. The auditor will need to contact you to arrange payment.');
        }
      } catch (updateError) {
        console.error('Error updating submission after failure:', updateError);
      }
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
    if (!isAuditor || !submission) {
      console.log('Cannot claim: Not the auditor of this submission');
      return;
    }
    
    if (!wallet.connected || !wallet.publicKey) {
      alert('Please connect your wallet first');
      return;
    }
    
    try {
      setClaimProcessing(true);
      setClaimError(null);
      
      console.log("Claiming bounty reward for bounty:", id);
      console.log("Current submission data:", submission);
      console.log("Payout amount:", submission.payoutAmount || "Not specified");
      
      // Call the SolanaService.claimBounty method
      const result = await SolanaService.claimBounty(
        wallet,
        id as string
      );
      
      console.log("Claim result:", result);
      
      if (result.status === 'error') {
        setClaimError(result.message || 'Unknown error claiming bounty');
        
        // Provide more detailed error explanation
        let errorMessage = result.message || 'Unknown error';
        let userMessage = "Error claiming bounty: " + errorMessage;
        
        // Check for common errors and provide helpful messages
        if (errorMessage.includes("BountyNotApproved")) {
          userMessage += "\n\nThis usually means the bounty hasn't been properly marked as approved in the contract. The creator may need to approve it again.";
        } else if (errorMessage.includes("UnauthorizedHunter")) {
          userMessage += "\n\nThis usually means your wallet address doesn't match the one that was approved for this bounty. Make sure you're using the same wallet that submitted the work.";
        } else if (errorMessage.includes("InstructionError")) {
          userMessage += "\n\nThis is a contract instruction error. It might be due to incorrect PDAs, insufficient funds in the vault, or other contract-level issues.";
        }
        
        alert(userMessage);
        return;
      }
      
      // If we got here, the claim was successful - update Firestore
      const submissionDocRef = doc(db, 'submissions', submissionId as string);
      await updateDoc(submissionDocRef, {
        claimed: true,
        claimedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      
      // Update UI
      setSubmission({
        ...submission,
        claimed: true,
        claimedAt: new Date().toISOString()
      } as ISubmission);
      
      // Set the claim result for display
      setClaimResult(result);
      
      // Show success message
      alert('Congratulations! You have successfully claimed your bounty reward.');
      
    } catch (error) {
      console.error('Error claiming bounty:', error);
      setClaimError(error instanceof Error ? error.message : String(error));
      alert(`Error claiming bounty: ${error instanceof Error ? error.message : String(error)}`);
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

  // Simple handler for the claim button - used for the dialog
  const handleClaimButton = () => {
    if (!isAuditor) {
      console.log('Cannot claim: Not auditor');
      return;
    }
    setShowClaimDialog(true);
  };

  // Add a new function to verify transactions
  const verifyTransaction = async (signature: string) => {
    try {
      setProcessingAction(true);
      setError(null);

      if (!signature) {
        setError("No transaction signature provided");
        return;
      }

      console.log("Verifying transaction:", signature);
      
      // Get the transaction details
      const connection = getConnection();
      const tx = await connection.getParsedTransaction(signature, 'confirmed');
      
      if (!tx) {
        setError("Transaction not found on the blockchain");
        return;
      }

      // Log transaction details for debugging
      console.log("Transaction details:", JSON.stringify(tx, null, 2));

      // Find the transfer instructions
      let transferAmount = 0;
      let recipientAddress = "";
      
      if (tx.meta && tx.meta.postBalances && tx.meta.preBalances) {
        // Find account balance changes
        tx.transaction.message.accountKeys.forEach((account, index) => {
          if (account.pubkey.toString() === auditorWalletAddress) {
            const preBalance = tx.meta!.preBalances[index];
            const postBalance = tx.meta!.postBalances[index];
            const change = (postBalance - preBalance) / 1000000000; // Convert lamports to SOL
            
            if (change > 0) {
              transferAmount = change;
              recipientAddress = account.pubkey.toString();
            }
          }
        });
      }

      return {
        status: 'success',
        transferAmount,
        recipientAddress,
        timestamp: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null
      };
    } catch (error) {
      console.error("Error verifying transaction:", error);
      setError(`Error verifying transaction: ${error instanceof Error ? error.message : String(error)}`);
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      setProcessingAction(false);
    }
  };

  // Add handler for verification button
  const handleVerifyTransaction = async () => {
    if (!submission?.transactionSignature) {
      setError("No transaction signature available");
      return;
    }
    
    const result = await verifyTransaction(submission.transactionSignature);
    setVerificationResult(result);
  };

  // Update the submission API in page.tsx to ensure funds are released with approval
  const handleVerifyBountyPayment = async () => {
    if (!isOwner || !submission) return;
    if (!wallet.connected || !wallet.publicKey) {
      alert('Please connect your wallet first');
      return;
    }
    
    // Check if wallet supports signing transactions
    if (!wallet.signTransaction) {
      alert('Your wallet does not support transaction signing');
      return;
    }
    
    try {
      setPaymentProcessing(true);
      setError(null);
      
      // Get the auditor wallet address
      const auditorWalletAddress = 
        submission.auditorWalletAddress || 
        (typeof submission.auditor === 'object' && submission.auditor?.walletAddress);
        
      if (!auditorWalletAddress) {
        throw new Error('Auditor wallet address not found. Please ensure the auditor has connected their wallet.');
      }
      
      // Create a direct transaction from creator to auditor
      // This is a fallback method that bypasses the escrow account
      const connection = getConnection();
      const auditorPublicKey = new PublicKey(auditorWalletAddress);
      const payoutAmount = submission.payoutAmount || 0.1; // Default to 0.1 SOL if not specified
      
      // Create a direct transfer transaction
      const directTransferTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: auditorPublicKey,
          lamports: solToLamports(payoutAmount)
        })
      );
      
      directTransferTx.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
      directTransferTx.feePayer = wallet.publicKey;
      
      // Sign the transaction
      const signedTx = await wallet.signTransaction(directTransferTx);
      
      // Send the transaction
      console.log(`Sending direct payment of ${payoutAmount} SOL to auditor ${auditorWalletAddress}`);
      const transferSignature = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(transferSignature, 'confirmed');
      
      // Update submission with the transaction signature
      const submissionRef = doc(db, 'submissions', submissionId as string);
      await updateDoc(submissionRef, {
        transactionSignature: transferSignature,
        approvalSignature: transferSignature,
        claimed: true,
        claimedAt: Timestamp.now(),
        reviewerComments: (submission.reviewerComments || '') + 
          '\n\nNote: Payment was sent directly from creator to auditor on ' + 
          new Date().toLocaleString() + ', bypassing the escrow contract.'
      });
      
      // Update local state
      setSubmission({
        ...submission,
        transactionSignature: transferSignature,
        claimed: true,
        claimedAt: new Date().toISOString()
      } as ISubmission);
      
      setPaymentResult({
        success: true,
        message: `Payment of ${payoutAmount} SOL has been successfully transferred directly to the auditor.`,
        signature: transferSignature
      });
      
      // Show success message
      alert('Payment successfully sent directly to the auditor!');
      
    } catch (error) {
      console.error('Error releasing payment:', error);
      setPaymentResult({
        success: false,
        message: `Error sending direct payment: ${error instanceof Error ? error.message : String(error)}`
      });
    } finally {
      setPaymentProcessing(false);
    }
  };

  // Updated Manual Payment Release button component
  const ManualPaymentReleaseButton = () => {
    if (!isOwner) return null;
    
    // Show for approved submissions that don't have a transaction signature or have payment errors
    const showManualPayment = submission?.status === 'approved' && 
      (!submission.transactionSignature || 
       submission.reviewerComments?.includes('issue with the on-chain approval') || 
       submission.reviewerComments?.includes('technical issues'));
    
    if (!showManualPayment) return null;
    
    return (
      <div className="mt-4 bg-white shadow overflow-hidden sm:rounded-lg border-l-4 border-yellow-400">
        <div className="px-4 py-5 sm:px-6 bg-yellow-50">
          <h3 className="text-lg leading-6 font-medium text-yellow-800">
            Fallback Payment Option
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-yellow-600">
            There was an issue with the on-chain approval process. Use this option to directly transfer funds to the auditor, bypassing the escrow account.
          </p>
          <div className="mt-3 text-sm text-gray-600">
            <p>The normal flow is:</p>
            <ol className="list-decimal list-inside mt-2 space-y-1">
              <li>Approve submission (marks it as a winner in the contract)</li>
              <li>Auditor claims payment from the escrow account</li>
            </ol>
            <p className="mt-2">This button provides a fallback when that process fails by sending funds directly from your wallet to the auditor.</p>
          </div>
        </div>
        <div className="px-4 py-3 bg-yellow-50 text-right sm:px-6 border-t border-yellow-100">
          <button
            type="button"
            onClick={handleVerifyBountyPayment}
            disabled={paymentProcessing}
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
          >
            {paymentProcessing ? 'Processing Payment...' : 'Send Direct Payment to Auditor'}
          </button>
        </div>
        {paymentResult && (
          <div className={`px-4 py-3 ${paymentResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className={`text-sm ${paymentResult.success ? 'text-green-700' : 'text-red-700'}`}>
              {paymentResult.message}
            </p>
            {paymentResult.signature && (
              <p className="text-xs mt-1">
                Transaction signature: <code>{paymentResult.signature.slice(0, 10)}...{paymentResult.signature.slice(-10)}</code>
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  // Add the ClaimReward button component for auditors
  const ClaimRewardButton = () => {
    if (!isAuditor) return null;
    
    // Only show for approved submissions that haven't been claimed yet
    const showClaimButton = submission?.status === 'approved' && !submission.claimed;
    
    if (!showClaimButton) return null;
    
    return (
      <div className="mt-4 bg-white shadow overflow-hidden sm:rounded-lg border-l-4 border-green-400">
        <div className="px-4 py-5 sm:px-6 bg-green-50">
          <h3 className="text-lg leading-6 font-medium text-green-800">
            Claim Your Bounty Reward
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-green-600">
            Your submission has been approved! You can now claim your reward from the escrow account.
          </p>
          <div className="mt-3 text-sm text-gray-600">
            <p>The payment process works as follows:</p>
            <ol className="list-decimal list-inside mt-2 space-y-1">
              <li>Your submission has been marked as a winner by the bounty creator</li>
              <li>You can now claim the reward by clicking the button below</li>
              <li>The funds will be transferred directly from the escrow account to your wallet</li>
            </ol>
          </div>
        </div>
        <div className="px-4 py-3 bg-green-50 text-right sm:px-6 border-t border-green-100">
          {!wallet.connected ? (
            <div className="flex justify-between items-center">
              <p className="text-sm text-red-600">You need to connect your wallet to claim the reward</p>
              <WalletMultiButton />
            </div>
          ) : (
            <button
              type="button"
              onClick={handleClaimButton}
              disabled={claimProcessing}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              {claimProcessing ? 'Processing Claim...' : 'Claim Bounty Reward'}
            </button>
          )}
        </div>
        {claimResult && (
          <div className={`px-4 py-3 ${claimResult.status === 'success' ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className={`text-sm ${claimResult.status === 'success' ? 'text-green-700' : 'text-red-700'}`}>
              {claimResult.message}
            </p>
            {claimResult.signature && (
              <p className="text-xs mt-1">
                Transaction signature: <code>{claimResult.signature.slice(0, 10)}...{claimResult.signature.slice(-10)}</code>
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  // Fix the getPayoutAmountForDisplay function
  const getPayoutAmountForDisplay = () => {
    if (submission?.payoutAmount) {
      return submission.payoutAmount;
    }
    
    // Default value if not specified
    return bounty?.amount || 0;
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

  if (error) {
    return (
      <MainLayout>
        <main className="flex-1 py-6 px-4 sm:px-6 lg:px-8">
          <div className="bg-white shadow overflow-hidden sm:rounded-lg max-w-4xl mx-auto border border-red-300">
            <div className="px-4 py-5 sm:px-6 bg-red-50">
              <h3 className="text-lg leading-6 font-medium text-red-800">Error Loading Submission</h3>
              <p className="mt-1 text-sm text-red-500">{error}</p>
            </div>
            <div className="border-t border-gray-200 px-4 py-5 sm:p-6">
              <div className="text-center">
                <p className="text-sm text-gray-500 mb-4">There was a problem loading this submission. This might be because:</p>
                <ul className="text-sm text-gray-600 list-disc list-inside mb-6">
                  <li>The submission does not exist or has been deleted</li>
                  <li>You don't have permission to view this submission</li>
                  <li>There's a technical issue with retrieving the data</li>
                </ul>
                <div className="mt-6">
                  <Link
                    href={`/bounty/${id}`}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Return to Bounty
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </main>
      </MainLayout>
    );
  }

  if (!bounty || !submission) {
    return (
      <MainLayout>
        <main className="flex-1 py-6 px-4 sm:px-6 lg:px-8">
          <div className="bg-white shadow overflow-hidden sm:rounded-lg max-w-4xl mx-auto border border-yellow-300">
            <div className="px-4 py-5 sm:px-6 bg-yellow-50">
              <h3 className="text-lg leading-6 font-medium text-yellow-800">Loading Submission</h3>
              <p className="mt-1 text-sm text-yellow-600">Please wait while we load the data...</p>
            </div>
            <div className="border-t border-gray-200 px-4 py-5 sm:p-6">
              <div className="text-center">
                <p className="text-sm text-gray-500">If this takes too long, there might be an issue with the data retrieval.</p>
                <div className="mt-6">
                  <Link
                    href={`/bounty/${id}`}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Return to Bounty
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </main>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Submission Details</h1>
            <div className="mt-2">
              <Link href={`/bounty/${id}`} className="text-blue-600 hover:text-blue-800">
                ← Back to Bounty
              </Link>
            </div>
          </div>
          {!wallet.connected && (
            <div className="mt-4 md:mt-0 flex-shrink-0">
              <WalletMultiButton />
            </div>
          )}
        </div>

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
                    {safeFormatDistanceToNow(submission.createdAt)}
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
                      Claimed {safeFormatDistanceToNow(submission.claimedAt)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Add ClaimRewardButton for auditors */}
        <ClaimRewardButton />

        {/* Add ManualPaymentReleaseButton component right after the submission details */}
        <ManualPaymentReleaseButton />

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
            
            {isAuditor && submission.status === 'approved' && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4 mt-4">
                <p className="text-sm text-green-700">
                  You've approved this submission. The payment has been automatically transferred to the auditor's wallet.
                </p>
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
          description={`Are you sure you want to approve this submission? This will:

1. Mark the submission as a winner in the smart contract
2. Enable the auditor to claim the reward from the escrow account
3. Mark the submission as approved in the database

The funds will remain in the escrow account until the auditor claims them.`}
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
          title="Claim Bounty Reward"
          description={`You're about to claim your reward of ${getPayoutAmountForDisplay()} SOL from the escrow account.

This transaction will:
1. Transfer funds directly from the escrow vault to your wallet
2. Mark the bounty as claimed in the contract
3. Record the claim in the database

Your wallet must be the same one you used to submit the bounty work.`}
          action="claim"
          isProcessing={claimProcessing}
          error={claimError}
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

        {/* Verification UI section */}
        {submission.transactionSignature && (
          <div className="mt-6">
            <div className="bg-white shadow sm:rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Verify Fund Transfer
                </h3>
                <div className="mt-2 max-w-xl text-sm text-gray-500">
                  <p>
                    Click below to verify if funds were successfully transferred to the auditor's wallet.
                  </p>
                  {auditorWalletAddress && (
                    <p className="mt-1">
                      Auditor's wallet: <code className="text-xs bg-gray-100 p-1 rounded">{auditorWalletAddress.slice(0, 8)}...{auditorWalletAddress.slice(-8)}</code>
                    </p>
                  )}
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={handleVerifyTransaction}
                    disabled={processingAction}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    {processingAction ? 'Verifying...' : 'Verify Transaction'}
                  </button>
                </div>
                
                {verificationResult && (
                  <div className="mt-4 bg-gray-50 p-4 rounded-md">
                    <h4 className="text-sm font-medium text-gray-900">Verification Results</h4>
                    {verificationResult.status === 'success' ? (
                      <div className="mt-2">
                        {verificationResult.transferAmount > 0 ? (
                          <div>
                            <p className="text-sm text-green-700">
                              ✅ Confirmed: {verificationResult.transferAmount} SOL was transferred to the auditor's wallet
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              Recipient: {verificationResult.recipientAddress}
                            </p>
                            {verificationResult.timestamp && (
                              <p className="text-xs text-gray-500">
                                Time: {new Date(verificationResult.timestamp).toLocaleString()}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-yellow-700">
                            ⚠️ No funds were transferred to the auditor's wallet in this transaction
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-red-700">
                        ❌ Error: {verificationResult.error}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}