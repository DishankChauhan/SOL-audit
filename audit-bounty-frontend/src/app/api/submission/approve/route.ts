import { NextResponse } from 'next/server';
import { getFirestore, doc, getDoc, Timestamp, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { app } from '@/lib/firebase/config';

import bs58 from 'bs58';
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  ComputeBudgetProgram,
  AccountMeta
} from '@solana/web3.js';
import { getServerConfig } from '@/lib/server-config';
import { createHash } from 'crypto';
import { customAlphabet } from 'nanoid';
import nacl from 'tweetnacl';
import { rateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/firebase/admin';
import admin from '@/lib/firebase/admin';
import { DEFAULT_SEVERITY_WEIGHTS } from '@/lib/constants';
import { verifyMessageSignature, extractPublicKeyFromMessage } from '@/lib/solana/auth';
import { createNotification } from '@/lib/firebase/notifications';
import { LRUCache } from 'lru-cache';
import { checkIsAdmin } from '@/lib/auth';

// Create a unique request identifier for each approval
const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 16);

const dbFirestore = getFirestore(app);

// Define interface for transaction result
interface ApprovalResponse {
  transactionBase64?: string;
  message: string;
  payoutAmount?: number;
  requestId?: string;
  escrowAccount?: string;
  approvalAccount?: string;
  timestamp?: number;
}

// Rate limiting middleware - 20 requests per minute
const limiter = rateLimit({
  interval: 60 * 1000, // 60 seconds
  uniqueTokenPerInterval: 500, // Max 500 users per interval
});

export async function POST(request: Request): Promise<Response> {
  try {
    // 1. Rate limit requests from same IP
    const ip = request.headers.get('x-forwarded-for') || 'anonymous';
    await limiter.check(ip, 10);

    // 2. Parse the request body
    const body = await request.json();
    const { bountyId, submissionId, reviewComment, signature, walletMessage } = body;

    // Validate the inputs
    if (!bountyId || !submissionId || !signature || !walletMessage) {
      return Response.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log('Approve submission request:', {
      bountyId,
      submissionId,
      reviewComment: reviewComment ? 'Present' : 'Not provided',
      signatureLength: signature?.length || 0
    });

    // 3. Verify the wallet signature
    console.log('Verifying wallet signature...');
    const isValidSignature = await verifyMessageSignature(signature, walletMessage);
    if (!isValidSignature) {
      console.error('Invalid signature for wallet message');
      return Response.json(
        { success: false, message: 'Invalid signature' },
        { status: 401 }
      );
    }
    console.log('Signature verification successful');

    const walletAddress = extractPublicKeyFromMessage(walletMessage);
    if (!walletAddress) {
      console.error('Failed to extract wallet address from message');
      return Response.json(
        { success: false, message: 'Could not extract wallet address' },
        { status: 400 }
      );
    }
    console.log('Wallet address extracted:', walletAddress);

    // 4. Fetch the bounty and submission
    console.log('Fetching bounty and submission...');
    const bountySnap = await db.collection('bounties').doc(bountyId).get();
    const submissionSnap = await db
      .collection('bounties')
      .doc(bountyId)
      .collection('submissions')
      .doc(submissionId)
      .get();

    if (!bountySnap.exists || !submissionSnap.exists) {
      console.error('Bounty or submission not found');
      return Response.json(
        { success: false, message: 'Bounty or submission not found' },
        { status: 404 }
      );
    }

    const bounty = bountySnap.data() as any;
    const submission = submissionSnap.data() as any;

    // 5. Check that the caller is the owner of the bounty
    console.log('Checking authorization...');
    if (bounty.owner.id !== walletAddress && !checkIsAdmin(walletAddress)) {
      console.error('Unauthorized: Not the bounty owner or admin');
      return Response.json(
        { success: false, message: 'Unauthorized: Only the bounty owner can approve submissions' },
        { status: 401 }
      );
    }
    console.log('Authorization check passed');

    // 6. Make sure the submission is in pending status
    if (submission.status !== 'pending') {
      console.error('Invalid submission status:', submission.status);
      return Response.json(
        { success: false, message: `Submission is ${submission.status}, not pending` },
        { status: 400 }
      );
    }
    console.log('Submission status is pending');

    // 7. Check if there's enough balance in the escrow
    console.log('Checking escrow balance...');
    const config = getServerConfig();
    const connection = new Connection(config.RPC_ENDPOINT, config.CONNECTION_OPTIONS);
    
    try {
      const escrowAddress = new PublicKey(bounty.solanaAddress);
      const escrowBalance = await connection.getBalance(escrowAddress);
      console.log('Escrow balance:', escrowBalance / LAMPORTS_PER_SOL, 'SOL');

      // 8. Calculate the payout amount based on severity
      const severityWeights = bounty.severityWeights || DEFAULT_SEVERITY_WEIGHTS;
      const basePayout = bounty.prizeAmount;
      let payoutAmount: number;

      if (submission.severity === 'critical') {
        payoutAmount = basePayout * (severityWeights.critical / 100);
      } else if (submission.severity === 'high') {
        payoutAmount = basePayout * (severityWeights.high / 100);
      } else if (submission.severity === 'medium') {
        payoutAmount = basePayout * (severityWeights.medium / 100);
      } else if (submission.severity === 'low') {
        payoutAmount = basePayout * (severityWeights.low / 100);
      } else {
        payoutAmount = basePayout * (severityWeights.informational / 100);
      }

      console.log('Calculated payout amount:', payoutAmount, 'SOL');

      if (escrowBalance < payoutAmount * LAMPORTS_PER_SOL) {
        console.error('Insufficient funds in escrow');
        return Response.json(
          { 
            success: false, 
            message: `Insufficient funds in escrow. Required: ${payoutAmount} SOL, Available: ${escrowBalance / LAMPORTS_PER_SOL} SOL` 
          },
          { status: 400 }
        );
      }
      console.log('Sufficient funds available in escrow');

      // 9. Update the submission status in Firestore
      console.log('Updating submission in Firestore...');
      await db
        .collection('bounties')
        .doc(bountyId)
        .collection('submissions')
        .doc(submissionId)
        .update({
          status: 'approved',
          reviewComment: reviewComment || '',
          reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
          reviewedBy: walletAddress,
          payoutAmount: payoutAmount
        });
      console.log('Submission updated successfully');

      // Notify the auditor
      console.log('Sending notification to auditor...');
      if (submission.submittedBy) {
        await createNotification({
          userId: submission.submittedBy,
          type: 'submission_approved',
          title: 'Submission Approved',
          message: `Your submission for "${bounty.title}" has been approved!`,
          metadata: {
            bountyId,
            submissionId,
            payoutAmount: payoutAmount
          }
        });
        console.log('Notification sent to auditor');
      }

      return Response.json({
        success: true,
        message: 'Submission approved successfully',
        data: {
          payoutAmount,
          walletAddress: submission.walletAddress
        }
      });
    } catch (error) {
      console.error('Error in Solana transaction processing:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Check for specific Solana-related errors
      if (errorMessage.includes('blockhash')) {
        return Response.json(
          { success: false, message: 'Solana network error: Invalid blockhash. Please try again.' },
          { status: 500 }
        );
      }
      
      if (errorMessage.includes('account not found')) {
        return Response.json(
          { success: false, message: 'The escrow account could not be found on Solana network.' },
          { status: 400 }
        );
      }
      
      if (errorMessage.includes('insufficient funds')) {
        return Response.json(
          { success: false, message: 'Insufficient funds in the escrow account.' },
          { status: 400 }
        );
      }
      
      return Response.json(
        { success: false, message: `Error processing approval: ${errorMessage}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in approval process:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage === 'Rate limit exceeded') {
      return Response.json(
        { success: false, message: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }
    
    return Response.json(
      { success: false, message: `Server error: ${errorMessage}` },
      { status: 500 }
    );
  }
} 