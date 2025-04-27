import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { app } from '@/lib/firebase/config';

const db = getFirestore(app);

export async function GET(request: NextRequest) {
  const id = request.url.split('/').pop();

  if (!id) {
    return NextResponse.json({ error: 'Missing bounty ID' }, { status: 400 });
  }

  try {
    console.log(`Fetching bounty with ID: ${id}`);
    const bountyRef = doc(db, 'bounties', id);
    const bountySnap = await getDoc(bountyRef);
    
    if (!bountySnap.exists()) {
      console.log(`Bounty not found: ${id}`);
      return NextResponse.json({ error: 'Bounty not found' }, { status: 404 });
    }
    
    const data = bountySnap.data();
    console.log(`Bounty data fetched successfully for ID: ${id}`);
    
    // Log raw data for debugging
    console.log('Raw bounty data:', JSON.stringify({
      id: bountySnap.id,
      ...data,
      createdAt: data.createdAt ? 'Date object exists' : 'No date',
      deadline: data.deadline ? 'Date object exists' : 'No date',
    }, null, 2));
    
    // Safely transform date fields with error handling
    let createdAtISO = null;
    let deadlineISO = null;
    
    try {
      createdAtISO = data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : null;
    } catch (dateError) {
      console.error('Error converting createdAt date:', dateError);
      createdAtISO = null;
    }
    
    try {
      deadlineISO = data.deadline?.toDate?.() ? data.deadline.toDate().toISOString() : null;
    } catch (dateError) {
      console.error('Error converting deadline date:', dateError);
      deadlineISO = null;
    }
    
    return NextResponse.json({
      id: bountySnap.id,
      ...data,
      createdAt: createdAtISO,
      deadline: deadlineISO,
    });
  } catch (error) {
    console.error(`Error fetching bounty with ID ${id}:`, error);
    // Include more details in error message for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to fetch bounty: ${errorMessage}` },
      { status: 500 }
    );
  }
} 