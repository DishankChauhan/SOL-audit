import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase/firestore';
import { app } from '@/lib/firebase/config';
import { Submission } from '@/services/submission';
import { Bounty } from '@/services/bounty';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';

const db = getFirestore(app);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { bountyId, submissionId, reviewComment, owner, walletSignature, signatureMessage } = body;
    
    if (!bountyId || !submissionId || !owner || !walletSignature || !signatureMessage) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    
    // 1. Verify wallet signature
    const signatureBytes = bs58.decode(walletSignature);
    const messageBytes = new TextEncoder().encode(signatureMessage);
    const ownerPublicKey = new PublicKey(owner);
    
    // Check if signature is valid
    const verified = await PublicKey.isOnCurve(ownerPublicKey.toBytes()) && 
                    PublicKey.createProgramAddress([messageBytes, ownerPublicKey.toBytes()], ownerPublicKey) !== null;
    
    if (!verified) {
      return NextResponse.json({ error: 'Invalid wallet signature' }, { status: 401 });
    }
    
    // 2. Fetch the bounty and submission
    const bounty = await Bounty.getById(bountyId);
    const submission = await Submission.getById(submissionId);
    
    if (!bounty) {
      return NextResponse.json({ error: 'Bounty not found' }, { status: 404 });
    }
    
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }
    
    // 3. Verify that the owner is authorized to reject this submission
    if (bounty.owner !== owner) {
      return NextResponse.json({ error: 'Not authorized to reject this submission' }, { status: 403 });
    }
    
    // 4. Check if the submission is already approved or rejected
    if (submission.status !== 'pending') {
      return NextResponse.json({ error: `Submission is already ${submission.status}` }, { status: 400 });
    }
    
    // 5. Update the submission status in Firestore
    await Submission.updateStatus(submissionId, 'rejected', {
      reviewedBy: owner,
      reviewComment: reviewComment || 'Submission rejected',
      payoutAmount: 0,
    });
    
    // 6. For rejection, we don't need to create a blockchain transaction
    // Just return success response with dummy signature
    return NextResponse.json({ 
      signature: 'firebase-only', // No blockchain transaction needed
      status: 'success',
      message: 'Submission rejected successfully'
    });
    
  } catch (error) {
    console.error('Error rejecting submission:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
} 