import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase/firestore';
import { Bounty, IBounty } from '@/services/bounty';
import { rateLimit } from '@/lib/rate-limit';
import { createInitializeBountyTransaction, solToLamports } from '@/lib/solana/transactions';
import { serializeTransaction, debugWalletVerification } from '@/lib/solana/utils';
import { v4 as uuidv4 } from 'uuid';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { Keypair, Transaction, PublicKey } from '@solana/web3.js';
import { db } from '@/lib/firebase/config';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { SolanaService } from '@/services/solana';

export async function POST(request: Request) {
  try {
    // Generate request ID for tracing
    const requestId = uuidv4();
    
    // Apply rate limiting
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    
    try {
      const limiter = rateLimit({
        interval: 60 * 1000, // 1 minute
        uniqueTokenPerInterval: 500
      });
      // Use IP as rate limit key
      await limiter.check(ip, 5); // 5 requests per minute per IP
    } catch (error) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }
    
    const { 
      title, 
      description, 
      repoUrl, 
      amount, 
      tokenMint, 
      deadline, 
      tags, 
      severityWeights,
      walletAddress,
      walletSignature,
      signatureMessage,
      owner, // User ID passed directly from frontend
      ownerName
    } = await request.json();
    
    console.log(`[${requestId}] Creating bounty: ${title} for ${owner}`);
    
    // Validate required fields
    if (!title || !description || !repoUrl || !amount || !owner || !deadline || !walletAddress) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // User ID is passed directly from the client-side auth context
    const userId = owner;
    
    // Verify wallet signature to confirm owner identity
    if (walletSignature && signatureMessage) {
      try {
        console.log(`[${requestId}] Attempting to verify signature`);
        console.log(`[${requestId}] Wallet address: ${walletAddress}`);
        console.log(`[${requestId}] Signature format check: ${walletSignature.substring(0, 20)}...`);
        
        // Convert wallet address string to PublicKey
        const ownerPublicKey = new PublicKey(walletAddress);
        
        // Decode the signature from base64 (not base58)
        const signatureUint8 = Buffer.from(walletSignature, 'base64');
        const messageUint8 = new TextEncoder().encode(signatureMessage);
        
        console.log(`[${requestId}] Verifying signature for wallet: ${walletAddress}`);
        const isValid = nacl.sign.detached.verify(
          messageUint8,
          signatureUint8,
          ownerPublicKey.toBytes()
        );
        
        console.log(`[${requestId}] Signature verification result: ${isValid ? 'Valid' : 'Invalid'}`);
        
        if (!isValid) {
          return NextResponse.json(
            { error: 'Invalid wallet signature' },
            { status: 401 }
          );
        }
        
        // If valid, associate this wallet with the user for future reference
        try {
          const userRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userRef);
          
          if (userDoc.exists()) {
            // Update existing user document
            const userData = userDoc.data();
            const wallets = userData.wallets || [];
            
            if (!wallets.includes(walletAddress)) {
              // Add wallet if not already in the list
              await updateDoc(userRef, {
                wallets: [...wallets, walletAddress],
                updatedAt: Timestamp.now()
              });
              console.log(`[${requestId}] Added wallet ${walletAddress} to user ${userId}`);
            }
          } else {
            // Create new user document
            await setDoc(userRef, {
              uid: userId,
              wallets: [walletAddress],
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now()
            });
            console.log(`[${requestId}] Created user document for ${userId} with wallet ${walletAddress}`);
          }
        } catch (error) {
          // Non-blocking error - log but continue with bounty creation
          console.error(`[${requestId}] Error associating wallet with user:`, error);
        }
      } catch (error) {
        console.error(`[${requestId}] Error verifying wallet signature:`, error);
        return NextResponse.json(
          { error: 'Error verifying wallet signature: ' + (error as Error).message },
          { status: 401 }
        );
      }
    } else {
      console.error(`[${requestId}] Missing wallet signature or message`);
      return NextResponse.json(
        { error: 'Wallet signature required' },
        { status: 401 }
      );
    }

    try {
      // Generate a keypair for the bounty account - just for reference, we won't use it in the transaction
      const bountyKeypair = Keypair.generate();
      const bountyPublicKey = bountyKeypair.publicKey.toString();

      // Create the bounty in Firestore
      const bountyData: IBounty = {
        title,
        description,
        repoUrl,
        amount,
        tokenMint: tokenMint || 'SOL', // Provide default value for tokenMint
        deadline: new Date(deadline).getTime(), // Convert deadline to a Unix timestamp in milliseconds
        severityWeights: {
          critical: severityWeights.critical || 40,
          high: severityWeights.high || 30,
          medium: severityWeights.medium || 20,
          low: severityWeights.low || 8,
          informational: severityWeights.informational || 2
        },
        tags,
        status: 'draft' as const,
        owner: userId, // Store Firebase user ID as the owner
        ownerName: ownerName || 'User',
        walletAddress: walletAddress, // Store wallet address separately
        createdAt: Date.now(), // Use Date.now() to get a Unix timestamp in milliseconds
        updatedAt: Date.now(), // Use Date.now() to get a Unix timestamp in milliseconds
        submissionCount: 0,
        approvedCount: 0,
        solanaAddress: bountyPublicKey, // Store on-chain Solana address
        id: '',
        createdBy: '',
        creatorUid: '',
        bountyPda: '',
        vaultPda: '',
        bountyAmount: amount,
        submissionsCount: 0 // Ensure this is set to 0, not undefined
      };

      // Create the bounty in Firestore
      const bounty = await Bounty.create(bountyData);
      console.log(`[${requestId}] Bounty created in Firestore with ID: ${bounty.id}`);

      try {
        // Try to create the Solana transaction
        // Convert SOL amount to lamports for on-chain transaction
        const lamportAmount = solToLamports(amount);
        
        // Convert deadline to Unix timestamp in seconds
        const deadlineTimestamp = Math.floor(new Date(deadline).getTime() / 1000);
        
        console.log(`[${requestId}] Creating transaction for bounty: ${bounty.id}`);
        console.log(`[${requestId}] Wallet address: ${walletAddress}`);
        console.log(`[${requestId}] Bounty address: ${bountyPublicKey}`);
        
        // Create a simplified transaction that only requires the owner to sign
        const transaction = await createInitializeBountyTransaction(
          lamportAmount,
          walletAddress, // Use walletAddress instead of owner for Solana transaction
          deadlineTimestamp,
          bountyPublicKey // Use the bounty's Solana address as reference
        );
        
        // If we need to create a custom seed for the transaction, add it like this
        /*
        const customSeed = new Uint8Array(Buffer.from(`${walletAddress}_${Date.now()}`));
        // Pass customSeed as 5th parameter to createInitializeBountyTransaction if needed
        */
        
        // Serialize transaction for client-side signing
        const transactionBase64 = serializeTransaction(transaction);
        
        console.log(`[${requestId}] Transaction prepared for bounty: ${bounty.id}`);
        console.log(`[${requestId}] Using Solana account: ${bountyPublicKey}`);

        // Return the data to be processed by the frontend
        return NextResponse.json({
          success: true,
          bountyId: bounty.id,
          bountyPublicKey,
          transactionBase64,  // Don't include the secret key since we don't need it
          message: 'Bounty created successfully, additional signature required'
        });
      } catch (solanaError) {
        console.error(`[${requestId}] Error creating Solana transaction:`, solanaError);
        
        // Even if Solana transaction fails, return the bounty ID
        // The frontend can handle funding later
        return NextResponse.json({
          success: true,
          bountyId: bounty.id,
          error: 'Created bounty but failed to prepare transaction. Please try funding later.',
          solanaError: (solanaError as Error).message
        });
      }
    } catch (error) {
      console.error(`[${requestId}] Error creating bounty:`, error);
      // Log detailed error information to help debugging
      if (error instanceof Error) {
        console.error(`[${requestId}] Error type:`, error.constructor.name);
        console.error(`[${requestId}] Error message:`, error.message);
        console.error(`[${requestId}] Error stack:`, error.stack);
      }
      return NextResponse.json(
        { error: 'Failed to create bounty: ' + (error as Error).message },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error initializing bounty:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 