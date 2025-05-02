import { NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const bountyId = params.id;
  
  if (!bountyId) {
    return NextResponse.json(
      { error: 'Bounty ID is required' },
      { status: 400 }
    );
  }

  try {
    // Fetch the bounty document from Firestore
    const bountyRef = doc(db, 'bounties', bountyId);
    const bountyDoc = await getDoc(bountyRef);

    if (!bountyDoc.exists()) {
      return NextResponse.json(
        { error: 'Bounty not found' },
        { status: 404 }
      );
    }

    // Return the bounty data
    const bountyData = {
      id: bountyDoc.id,
      ...bountyDoc.data()
    };

    return NextResponse.json(bountyData);
  } catch (error) {
    console.error('Error fetching bounty:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch bounty data' },
      { status: 500 }
    );
  }
} 