import { NextResponse } from 'next/server';
import { Transaction } from '@solana/web3.js';
import { getFirestore, collection, addDoc, Timestamp, updateDoc, doc } from 'firebase/firestore';
import { app } from '@/lib/firebase/config';
import { Bounty } from '@/services/bounty';

// Get firestore instance
const db = getFirestore(app);

export async function POST(request: Request) {
  try {
    const { 
      bountyId, 
      tokenMint, 
      amount, 
      funder,
      walletSignature,
      signatureMessage
    } = await request.json();

    // Validate required fields
    if (!bountyId || !tokenMint || !amount || !funder) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate wallet signature
    if (!walletSignature || !signatureMessage) {
      return NextResponse.json({ error: 'Wallet verification failed' }, { status: 400 });
    }

    try {
      // Fetch the bounty to verify it exists
      const bounty = await Bounty.getById(bountyId);
      
      if (!bounty) {
        return NextResponse.json({ error: 'Bounty not found' }, { status: 404 });
      }
      
      // Check if the funder is the owner of the bounty
      if (bounty.owner !== funder) {
        return NextResponse.json({ error: 'Only the bounty owner can fund it' }, { status: 403 });
      }
      
      // Call the Solana backend service to prepare a token transaction
      const solanaResponse = await fetch(`${process.env.SOLANA_SERVICE_URL || 'http://localhost:3001'}/api/solana/token/fund-bounty`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SOLANA_SERVICE_KEY || ''}`
        },
        body: JSON.stringify({
          bountyId: bountyId,
          amount: amount,
          tokenMint: tokenMint,
          funder: funder
        })
      });

      if (!solanaResponse.ok) {
        const errorData = await solanaResponse.json();
        throw new Error(errorData.message || 'Failed to initialize token funding transaction');
      }
      
      const { transaction: transactionBase64, escrowAddress } = await solanaResponse.json();

      // Update the bounty with token information
      await Bounty.update(bountyId, {
        tokenMint: tokenMint,
        status: 'draft', // Changed from 'funding' to use a valid status
        updatedAt: Timestamp.now()
      });
      
      // Store escrow address in a separate collection or log it for reference
      console.log(`Escrow address for bounty ${bountyId}: ${escrowAddress}`);
      
      // Return the data to be processed by the frontend
      return NextResponse.json({
        success: true,
        transactionBase64,
        escrowAddress,
        message: 'Bounty token funding prepared successfully'
      });
    } catch (error) {
      console.error('Error funding bounty with token:', error);
      return NextResponse.json(
        { error: (error as Error).message || 'Failed to fund bounty with token' },
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