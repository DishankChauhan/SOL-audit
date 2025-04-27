import { NextResponse } from 'next/server';
import { Transaction } from '@solana/web3.js';
import { getFirestore, doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { app } from '@/lib/firebase/config';
import { Submission } from '@/services/submission';
import { Bounty } from '@/services/bounty';

// Get firestore instance
const db = getFirestore(app);

export async function POST(request: Request) {
  try {
    const {
      bountyId,
      submissionId,
      recipient,
      recipientTokenAccount,
      tokenMint,
      walletSignature,
      signatureMessage
    } = await request.json();

    // Validate required fields
    if (!bountyId || !submissionId || !recipient || !recipientTokenAccount || !tokenMint) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate wallet signature
    if (!walletSignature || !signatureMessage) {
      return NextResponse.json({ error: 'Wallet verification failed' }, { status: 400 });
    }

    try {
      // Fetch the submission to verify it's approved and not already claimed
      const submission = await Submission.getById(submissionId);
      
      if (!submission) {
        return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
      }
      
      if (submission.status !== 'approved') {
        return NextResponse.json({ error: 'Submission is not approved' }, { status: 400 });
      }
      
      if (submission.claimed) {
        return NextResponse.json({ error: 'Reward already claimed' }, { status: 400 });
      }
      
      // Verify the claimer is the auditor who submitted the finding
      if (submission.auditor !== recipient) {
        return NextResponse.json({ error: 'Only the auditor can claim the reward' }, { status: 403 });
      }
      
      // Fetch the bounty to get necessary info
      const bounty = await Bounty.getById(bountyId);
      
      if (!bounty) {
        return NextResponse.json({ error: 'Bounty not found' }, { status: 404 });
      }

      // Verify the bounty uses the correct token mint
      if (bounty.tokenMint !== tokenMint) {
        return NextResponse.json(
          { error: 'Token mint mismatch' }, 
          { status: 400 }
        );
      }
      
      // Calculate payout amount based on severity and weights
      const payoutAmount = calculatePayout(submission.severity, bounty);
      
      // Convert to token units (USDC has 6 decimals)
      const tokenPayoutAmount = Math.floor(payoutAmount * 1_000_000);
      
      // Call Solana backend service to create a transaction for transferring tokens
      const solanaResponse = await fetch(`${process.env.SOLANA_SERVICE_URL || 'http://localhost:3001'}/api/solana/token/claim-reward`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SOLANA_SERVICE_KEY || ''}`
        },
        body: JSON.stringify({
          bountyId: bountyId,
          submissionId: submissionId,
          recipient: recipient,
          recipientTokenAccount: recipientTokenAccount,
          tokenMint: tokenMint,
          amount: tokenPayoutAmount,
          severity: submission.severity
        })
      });

      if (!solanaResponse.ok) {
        const errorData = await solanaResponse.json();
        throw new Error(errorData.message || 'Failed to create token claim transaction');
      }
      
      const { transaction: transactionBase64 } = await solanaResponse.json();
      
      // Mark the submission as claimed
      await Submission.update(submissionId, {
        claimed: true,
        claimedAt: Timestamp.now(),
        claimedBy: recipient,
        payoutAmount
      });
      
      // Store token mint in metadata or log for reference
      console.log(`Token mint for submission ${submissionId}: ${tokenMint}`);
      
      return NextResponse.json({
        success: true,
        transactionBase64,
        payoutAmount: tokenPayoutAmount,
        message: 'Token claim request processed successfully'
      });
    } catch (error) {
      console.error('Error processing token claim:', error);
      return NextResponse.json(
        { error: (error as Error).message || 'Failed to claim token reward' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { error: 'Invalid request data' },
      { status: 400 }
    );
  }
}

/**
 * Calculate payout amount based on severity and bounty weights
 */
function calculatePayout(severity: string, bounty: any): number {
  const weights = bounty.severityWeights || {
    critical: 40,
    high: 30,
    medium: 20,
    low: 8,
    informational: 2
  };
  
  const weight = weights[severity.toLowerCase()] || 0;
  const percentage = weight / 100;
  
  return bounty.amount * percentage;
} 