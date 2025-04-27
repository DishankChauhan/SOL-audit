import { NextResponse } from 'next/server';
import { 
  doc, 
  getDoc, 
  runTransaction, 
  serverTimestamp, 
  Timestamp 
} from 'firebase/firestore';
import { db as firestore } from '@/lib/firebase/config';
import { Bounty } from '@/services/bounty';
import { rateLimit } from '@/lib/rate-limit';
import { v4 as uuidv4 } from 'uuid';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { createCancelBountyTransaction } from '@/lib/solana/transactions';
import { serializeTransaction } from '@/lib/solana/utils';

const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500
});

export async function POST(req: Request) {
  // Generate unique request ID for tracing
  const requestId = uuidv4();
  console.log(`[${requestId}] Processing bounty cancellation request`);

  try {
    // Apply rate limiting
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    await limiter.check(ip, 10); // 10 requests per minute per IP
  } catch (error) {
    console.error(`[${requestId}] Rate limit exceeded for IP: ${req.headers.get('x-forwarded-for')}`);
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  try {
    // Parse request body
    const body = await req.json();
    const { bountyId, owner, walletSignature, signatureMessage } = body;

    // Validate required fields
    if (!bountyId || !owner || !walletSignature || !signatureMessage) {
      console.error(`[${requestId}] Missing required fields in request`);
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify wallet signature
    try {
      const signatureUint8 = bs58.decode(walletSignature);
      const messageUint8 = new TextEncoder().encode(signatureMessage);
      const publicKeyUint8 = bs58.decode(owner);

      const isValid = nacl.sign.detached.verify(
        messageUint8,
        signatureUint8,
        publicKeyUint8
      );

      if (!isValid) {
        console.error(`[${requestId}] Invalid wallet signature`);
        return NextResponse.json(
          { error: 'Invalid wallet signature' },
          { status: 401 }
        );
      }
    } catch (error) {
      console.error(`[${requestId}] Error verifying wallet signature:`, error);
      return NextResponse.json(
        { error: 'Error verifying wallet signature' },
        { status: 401 }
      );
    }

    // Get bounty from database
    const bounty = await Bounty.getById(bountyId);
    if (!bounty) {
      console.error(`[${requestId}] Bounty not found: ${bountyId}`);
      return NextResponse.json(
        { error: 'Bounty not found' },
        { status: 404 }
      );
    }

    // Check if user is the bounty owner
    if (bounty.owner !== owner) {
      console.error(`[${requestId}] User ${owner} is not authorized to cancel bounty ${bountyId}`);
      return NextResponse.json(
        { error: 'You are not authorized to cancel this bounty' },
        { status: 403 }
      );
    }

    // Check if bounty status allows cancellation (only 'open' or 'draft' bounties can be cancelled)
    if (bounty.status !== 'open' && bounty.status !== 'draft') {
      console.error(`[${requestId}] Cannot cancel bounty with status: ${bounty.status}`);
      return NextResponse.json(
        { error: `Cannot cancel a bounty with status: ${bounty.status}` },
        { status: 400 }
      );
    }

    // Check if there are any approved submissions
    const bountyRef = doc(firestore, 'bounties', bountyId);
    
    let result;
    if (bounty.solanaAddress) {
      // If bounty has a Solana address, create a transaction to cancel on-chain
      console.log(`[${requestId}] Cancelling on-chain bounty: ${bounty.solanaAddress}`);
      
      try {
        // Create Solana transaction to cancel bounty
        const transaction = await createCancelBountyTransaction(
          bounty.solanaAddress
        );
        
        // Update bounty status to 'cancelling' in database
        await runTransaction(firestore, async (transaction) => {
          const bountyDoc = await transaction.get(bountyRef);
          if (!bountyDoc.exists()) {
            throw new Error('Bounty no longer exists');
          }
          
          const bountyData = bountyDoc.data();
          if (bountyData.status !== 'open' && bountyData.status !== 'draft') {
            throw new Error(`Cannot cancel bounty with status: ${bountyData.status}`);
          }
          
          transaction.update(bountyRef, {
            status: 'cancelling',
            cancelledBy: owner,
            cancelledAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        });
        
        // Serialize transaction for client-side signing
        const serializedTransaction = serializeTransaction(transaction);
        
        result = {
          success: true,
          message: 'Bounty cancellation initiated',
          transaction: serializedTransaction,
          bountyId
        };
      } catch (error) {
        console.error(`[${requestId}] Error creating cancel bounty transaction:`, error);
        return NextResponse.json(
          { error: 'Failed to create cancel transaction' },
          { status: 500 }
        );
      }
    } else {
      // If bounty does not have a Solana address, just update status in database
      console.log(`[${requestId}] Cancelling off-chain bounty: ${bountyId}`);
      
      try {
        await runTransaction(firestore, async (transaction) => {
          const bountyDoc = await transaction.get(bountyRef);
          if (!bountyDoc.exists()) {
            throw new Error('Bounty no longer exists');
          }
          
          const bountyData = bountyDoc.data();
          if (bountyData.status !== 'open' && bountyData.status !== 'draft') {
            throw new Error(`Cannot cancel bounty with status: ${bountyData.status}`);
          }
          
          transaction.update(bountyRef, {
            status: 'cancelled',
            cancelledBy: owner,
            cancelledAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        });
        
        result = {
          success: true,
          message: 'Bounty cancelled successfully',
          bountyId
        };
      } catch (error) {
        console.error(`[${requestId}] Error cancelling bounty:`, error);
        return NextResponse.json(
          { error: 'Failed to cancel bounty' },
          { status: 500 }
        );
      }
    }
    
    console.log(`[${requestId}] Bounty cancellation processed successfully`);
    return NextResponse.json(result);
    
  } catch (error) {
    console.error(`[${requestId}] Unexpected error:`, error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
} 