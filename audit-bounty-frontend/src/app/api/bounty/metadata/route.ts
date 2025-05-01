import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { bountyAddress, metadata } = data;

    if (!bountyAddress || !metadata) {
      return NextResponse.json(
        { error: 'Missing required fields: bountyAddress or metadata' },
        { status: 400 }
      );
    }

    // Add metadata to Firestore
    const bountyRef = doc(db, 'bounties', bountyAddress);
    await setDoc(bountyRef, {
      ...metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: metadata.status || 'pending'
    });

    return NextResponse.json({
      success: true,
      bountyAddress,
      message: 'Bounty metadata stored successfully'
    });
  } catch (error: unknown) {
    console.error('Error storing bounty metadata:', error);
    return NextResponse.json(
      { error: `Failed to store bounty metadata: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
} 