import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    console.log('GET /api/user/[id] - Request received:', {
      params: context.params,
      url: request.url
    });

    // Properly await and extract the ID parameter
    const params = await context.params;
    const { id } = params;
    
    if (!id) {
      console.log('GET /api/user/[id] - Missing ID parameter');
      return NextResponse.json(
        { error: 'Missing ID parameter' },
        { status: 400 }
      );
    }

    console.log('Fetching user data for ID:', id);
    console.log('Attempting to fetch document:', `users/${id}`);

    // Use client SDK - this will work with limitations in API routes
    const userRef = doc(db, 'users', id);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      console.log('GET /api/user/[id] - User not found:', id);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    const userData = userSnap.data();
    
    // Only return necessary user data
    const sanitizedUserData = {
      id: userSnap.id,
      name: userData.name,
      email: userData.email,
      walletAddress: userData.walletAddress,
      // Add other fields as needed
    };

    console.log('GET /api/user/[id] - User data fetched successfully:', {
      id,
      hasWalletAddress: !!userData.walletAddress
    });

    return NextResponse.json(sanitizedUserData);

  } catch (error: any) {
    console.error('Error in GET /api/user/[id]:', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error,
      userId: (await context.params).id
    });
    
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
} 