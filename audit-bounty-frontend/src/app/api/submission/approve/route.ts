import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { BountyStatusFirebase } from '@/services/bounty';
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  sendAndConfirmTransaction, 
  ComputeBudgetProgram 
} from '@solana/web3.js';
import { approveSubmission as createApproveSubmissionTx } from '@/lib/solana/transactions';
import { getSolanaConnection, programId } from '@/lib/solana/config';
import bs58 from 'bs58';

// Environment variables for the server keypair (NEVER expose this in client code)
const SOLANA_SERVER_KEYPAIR = process.env.SOLANA_SERVER_KEYPAIR || '';
// This is just a fallback for development - in production use a secure environment variable
const FALLBACK_KEYPAIR = [149,31,245,54,232,80,83,197,135,10,191,67,95,75,79,136,147,219,182,130,140,80,185,0,183,209,55,10,147,164,72,106,36,45,168,170,153,196,229,132,29,85,242,216,44,3,3,22,20,233,13,159,227,37,98,35,111,93,238,188,146,63,181,210];

export async function POST(request: Request): Promise<Response> {
  try {
    // Parse the request body
    const body = await request.json();
    const { bountyId, submissionId, hunterAddress } = body;

    // Validate the inputs
    if (!bountyId || !submissionId || !hunterAddress) {
      return Response.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log('Processing approval request:', {
      bountyId,
      submissionId,
      hunterAddress
    });

    // Fetch the bounty and submission from Firebase
    const bountyRef = doc(db, 'bounties', bountyId);
    const bountySnapshot = await getDoc(bountyRef);
    
    if (!bountySnapshot.exists()) {
      return Response.json(
        { success: false, message: 'Bounty not found' },
        { status: 404 }
      );
    }

    const submissionRef = doc(db, 'submissions', submissionId);
    const submissionSnapshot = await getDoc(submissionRef);
    
    if (!submissionSnapshot.exists()) {
      return Response.json(
        { success: false, message: 'Submission not found' },
        { status: 404 }
      );
    }

    // Get Solana connection
    const connection = getSolanaConnection();
    
    // Initialize the server keypair for signing transactions
    let serverKeypair: Keypair;
    try {
      // Use the environment variable if available
      if (SOLANA_SERVER_KEYPAIR) {
        const secretKey = bs58.decode(SOLANA_SERVER_KEYPAIR);
        serverKeypair = Keypair.fromSecretKey(secretKey);
      } else {
        // Fallback for development only
        serverKeypair = Keypair.fromSecretKey(new Uint8Array(FALLBACK_KEYPAIR));
      }
      
      console.log('Server keypair initialized:', serverKeypair.publicKey.toString());
    } catch (error) {
      console.error('Failed to initialize server keypair:', error);
      return Response.json(
        { success: false, message: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Create the approve submission transaction
    try {
      const bountyData = bountySnapshot.data();
      
      // Create a transaction to approve the submission
      const transaction = await createApproveSubmissionTx(
        connection,
        serverKeypair.publicKey,  // Use server keypair as authority
        new PublicKey(bountyId),  // Bounty PDA
        new PublicKey(hunterAddress)  // Hunter's public key
      );
      
      // Add compute budget instruction to avoid insufficient compute budget errors
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 200000,
        })
      );
      
      // Set the fee payer to the server keypair
      transaction.feePayer = serverKeypair.publicKey;
      
      // Send and confirm the transaction
      console.log('Sending approve submission transaction...');
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [serverKeypair],
        {
          commitment: 'confirmed',
          preflightCommitment: 'confirmed',
        }
      );
      
      console.log('Transaction confirmed with signature:', signature);
      
      // Update submission status to approved
      await updateDoc(submissionRef, {
        status: 'approved',
        reviewedAt: new Date().getTime(),
        updatedAt: new Date().getTime(),
        transactionHash: signature
      });
      
      // Update bounty in Firebase to mark as approved with hunter address
      await updateDoc(bountyRef, {
        approvedCount: (bountyData.approvedCount || 0) + 1,
        status: BountyStatusFirebase.APPROVED,
        approvedHunter: hunterAddress,
        updatedAt: new Date().getTime(),
        transactionHash: signature
      });
      
      // Return success with the transaction signature
      return Response.json({
        success: true,
        message: 'Submission approved successfully on Solana blockchain',
        data: {
          transactionHash: signature,
          bountyId,
          submissionId,
          hunterAddress
        }
      });
      
    } catch (error) {
      console.error('Error processing transaction on Solana blockchain:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown blockchain error';
      
      return Response.json(
        { success: false, message: `Blockchain error: ${errorMessage}` },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Error in submission approval process:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return Response.json(
      { success: false, message: `Server error: ${errorMessage}` },
      { status: 500 }
    );
  }
} 