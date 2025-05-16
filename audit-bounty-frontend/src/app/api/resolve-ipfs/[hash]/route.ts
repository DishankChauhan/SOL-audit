import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(
  req: NextRequest,
  { params }: { params: { hash: string } }
) {
  try {
    const hash = params.hash;
    
    if (!hash) {
      return NextResponse.json(
        { error: 'No IPFS hash provided' },
        { status: 400 }
      );
    }
    
    // Try to fetch from IPFS gateway
    const ipfsGatewayUrl = `https://${hash}.ipfs.w3s.link/`;
    const response = await axios.get(ipfsGatewayUrl, { 
      timeout: 10000, // 10 second timeout
      responseType: 'arraybuffer'
    });
    
    // Determine content type from response
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    
    // Return the content with proper content type
    return new NextResponse(response.data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error resolving IPFS content:', error);
    return NextResponse.json(
      { error: 'Failed to resolve IPFS content' },
      { status: 500 }
    );
  }
} 