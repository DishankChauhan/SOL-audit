import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { app } from '@/lib/firebase/config';

const db = getFirestore(app);

export async function GET(request: NextRequest) {
  const id = request.url.split('/').pop();

  if (!id) {
    return NextResponse.json({ error: 'Missing submission ID' }, { status: 400 });
  }

  try {
    console.log(`Fetching submission with ID: ${id}`);
    const submissionRef = doc(db, 'submissions', id);
    const submissionSnap = await getDoc(submissionRef);
    
    if (!submissionSnap.exists()) {
      console.log(`Submission not found: ${id}`);
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }
    
    const data = submissionSnap.data();
    console.log(`Submission data fetched successfully for ID: ${id}`);
    
    // Log raw data for debugging
    console.log('Raw submission data:', JSON.stringify({
      id: submissionSnap.id,
      ...data,
      createdAt: data.createdAt ? 'Date object exists' : 'No date',
      claimedAt: data.claimedAt ? 'Date object exists' : 'No date',
    }, null, 2));
    
    // Safely transform date fields with error handling
    let createdAtISO = null;
    let claimedAtISO = null;
    
    try {
      createdAtISO = data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : null;
    } catch (dateError) {
      console.error('Error converting createdAt date:', dateError);
      createdAtISO = null;
    }
    
    try {
      claimedAtISO = data.claimedAt?.toDate?.() ? data.claimedAt.toDate().toISOString() : null;
    } catch (dateError) {
      console.error('Error converting claimedAt date:', dateError);
      claimedAtISO = null;
    }
    
    return NextResponse.json({
      id: submissionSnap.id,
      ...data,
      createdAt: createdAtISO,
      claimedAt: claimedAtISO,
    });
  } catch (error) {
    console.error(`Error fetching submission with ID ${id}:`, error);
    // Include more details in error message for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to fetch submission: ${errorMessage}` },
      { status: 500 }
    );
  }
} 