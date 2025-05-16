import { NextRequest, NextResponse } from 'next/server';
import { Web3Storage } from 'web3.storage';
import { v4 as uuidv4 } from 'uuid';

// Initialize Web3.Storage client
const client = new Web3Storage({ 
  token: process.env.WEB3_STORAGE_API_KEY || '',
});

export async function POST(req: NextRequest) {
  try {
    // Check if Web3.Storage API key is configured
    if (!process.env.WEB3_STORAGE_API_KEY) {
      return NextResponse.json(
        { error: 'Web3Storage API key not configured' },
        { status: 500 }
      );
    }

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Generate a unique filename
    const filename = `${uuidv4()}-${file.name}`;
    
    // Create a File object that Web3.Storage can use
    const fileToUpload = new File([await file.arrayBuffer()], filename, { 
      type: file.type 
    });
    
    // Upload to IPFS
    const cid = await client.put([fileToUpload], {
      name: filename,
      maxRetries: 3,
    });
    
    // Return the IPFS URL
    const ipfsUrl = `https://${cid}.ipfs.w3s.link/${filename}`;
    const ipfsHash = cid;
    
    return NextResponse.json({
      success: true,
      ipfsUrl,
      ipfsHash,
    });
  } catch (error) {
    console.error('Error uploading to IPFS:', error);
    return NextResponse.json(
      { error: 'Failed to upload to IPFS' },
      { status: 500 }
    );
  }
} 