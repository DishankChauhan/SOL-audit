import { NextRequest, NextResponse } from 'next/server';
import { Connection, Commitment } from '@solana/web3.js';
import { getServerConfig } from '@/lib/server-config';

export async function GET(
  request: NextRequest,
  context: { params: { signature: string } }
) {
  try {
    const signature = context.params.signature;
    
    if (!signature) {
      return NextResponse.json({ error: 'Missing transaction signature' }, { status: 400 });
    }
    
    const config = getServerConfig();
    
    if (!config || !config.RPC_ENDPOINT) {
      console.error('Missing RPC endpoint configuration');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    
    console.log('Creating Solana connection with endpoint:', config.RPC_ENDPOINT);
    const connection = new Connection(config.RPC_ENDPOINT, config.CONNECTION_OPTIONS);
    
    console.log('Checking transaction status for:', signature);
    
    // Get transaction status with retries
    let status;
    let retries = 3;
    
    while (retries > 0) {
      try {
        status = await connection.getSignatureStatus(signature);
        break; // Exit loop if successful
      } catch (err) {
        console.warn(`Error fetching signature status (retries left: ${retries}):`, err);
        retries--;
        if (retries === 0) throw err; // Rethrow if all retries failed
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
      }
    }
    
    if (!status || !status.value) {
      return NextResponse.json({ 
        confirmed: false, 
        error: 'Transaction not found or still processing',
        signature 
      });
    }
    
    // Check if there's an error in the transaction
    if (status.value.err) {
      console.error('Transaction error:', status.value.err);
      return NextResponse.json({ 
        confirmed: false, 
        error: `Transaction failed: ${JSON.stringify(status.value.err)}`,
        signature,
        details: status.value
      });
    }
    
    const confirmed = status.value.confirmationStatus === 'confirmed' || 
                     status.value.confirmationStatus === 'finalized';
    
    console.log('Transaction status:', {
      signature,
      status: status.value.confirmationStatus,
      confirmed
    });
    
    if (confirmed) {
      try {
        // Get transaction details to verify the transfer
        const tx = await connection.getTransaction(signature);
        console.log('Transaction details available:', !!tx);
        
        return NextResponse.json({
          confirmed: true,
          status: status.value.confirmationStatus,
          transaction: tx,
          signature
        });
      } catch (txError) {
        console.error('Error fetching transaction details:', txError);
        // Still return confirmed status even if we can't get details
        return NextResponse.json({
          confirmed: true,
          status: status.value.confirmationStatus,
          signature,
          txDetailsFailed: true
        });
      }
    }
    
    return NextResponse.json({
      confirmed: false,
      status: status.value.confirmationStatus,
      signature
    });
    
  } catch (error) {
    console.error('Error checking transaction status:', error);
    return NextResponse.json(
      { 
        error: `Failed to check transaction status: ${(error as Error).message}`,
        errorDetails: (error as Error).stack
      },
      { status: 500 }
    );
  }
} 