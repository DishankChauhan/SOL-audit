import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import { app } from '@/lib/firebase/config';

const db = getFirestore(app);

export async function PUT(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const bountyId = context.params.id;
    const { status, transactionSignature } = await request.json();
    
    console.log('Updating bounty status:', { bountyId, status, transactionSignature });
    
    // Update the bounty document
    const bountyRef = doc(db, 'bounties', bountyId);
    await updateDoc(bountyRef, {
      status,
      completedAt: new Date(),
      completionTxHash: transactionSignature
    });
    
    console.log('Bounty status updated successfully');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating bounty status:', error);
    return NextResponse.json(
      { error: 'Failed to update bounty status' },
      { status: 500 }
    );
  }
} 