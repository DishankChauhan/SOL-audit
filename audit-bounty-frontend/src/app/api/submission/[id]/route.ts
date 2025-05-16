import { NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const submissionId = params.id;
  
  if (!submissionId) {
    return NextResponse.json(
      { error: 'Submission ID is required' },
      { status: 400 }
    );
  }

  try {
    // Fetch the submission document from Firestore
    const submissionRef = doc(db, 'submissions', submissionId);
    const submissionDoc = await getDoc(submissionRef);

    if (!submissionDoc.exists()) {
      return NextResponse.json(
        { error: 'Submission not found' },
        { status: 404 }
      );
    }

    // Return the submission data
    const submissionData = {
      id: submissionDoc.id,
      ...submissionDoc.data()
    };

    return NextResponse.json(submissionData);
  } catch (error) {
    console.error('Error fetching submission:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch submission data' },
      { status: 500 }
    );
  }
} 