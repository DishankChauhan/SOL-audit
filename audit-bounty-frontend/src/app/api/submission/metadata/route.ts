import { NextRequest, NextResponse } from 'next/server';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export async function POST(req: NextRequest) {
  try {
    // Parse the request body
    const data = await req.json();
    
    // Validate required fields
    const requiredFields = ['submissionAddress', 'bountyAddress', 'auditor', 'description', 'ipfsHash', 'severity'];
    for (const field of requiredFields) {
      if (!data[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }
    
    // Add created timestamp and initial status
    const submissionData = {
      ...data,
      createdAt: Date.now(),
      status: 'pending',
      upvotes: 0,
      downvotes: 0,
      isWinner: false,
    };
    
    // Store in Firestore
    const submissionRef = doc(db, 'submissions', data.submissionAddress);
    await setDoc(submissionRef, submissionData);
    
    return NextResponse.json(
      { success: true, message: 'Submission metadata stored successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error storing submission metadata:', error);
    return NextResponse.json(
      { error: 'Failed to store submission metadata' },
      { status: 500 }
    );
  }
} 