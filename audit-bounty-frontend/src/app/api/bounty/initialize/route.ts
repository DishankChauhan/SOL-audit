import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { Buffer } from 'buffer';
import { serializeCreateBountyInstruction } from "@/lib/solana/borsh";

// Program ID for the Solana contract
const PROGRAM_ID = new PublicKey("Gd2hEeEPdvPN7bPdbkthPZHxsaRNTJWxcpp2pwRWBw4R");

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { 
      amount, 
      deadline, 
      title, 
      description, 
      repoUrl, 
      tags, 
      creatorWallet,
      severityWeights,
      winnersCount = 1
    } = data;

    if (!amount || !deadline || !title || !description || !creatorWallet) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Convert to lamports (1 SOL = 1,000,000,000 lamports)
    const amountLamports = Math.floor(parseFloat(amount) * 1_000_000_000);
    const deadlineTimestamp = Math.floor(new Date(deadline).getTime() / 1000);

    // Generate a unique seed for this bounty from the title
    const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "");
    const seed = cleanTitle.substring(0, Math.min(cleanTitle.length, 8));
    const customSeed = new TextEncoder().encode(seed);
    
    console.log("Using custom seed for bounty:", seed);

    // Setup Solana connection
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'http://127.0.0.1:8899';
    const connection = new Connection(rpcUrl);

    // Derive the bounty account PDA address
    const [bountyPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("bounty"), new PublicKey(creatorWallet).toBuffer(), customSeed],
      PROGRAM_ID
    );

    // Derive the vault account PDA address
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), bountyPDA.toBuffer()],
      PROGRAM_ID
    );

    // Log the PDAs for debugging
    console.log("Bounty PDA:", bountyPDA.toString());
    console.log("Vault PDA:", vaultPDA.toString());

    // Serialize the CreateBounty instruction data using our helper
    const instructionData = serializeCreateBountyInstruction(
      amountLamports,
      deadlineTimestamp,
      customSeed,
      winnersCount
    );

    // Create the transaction instruction
    const createBountyIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: new PublicKey(creatorWallet), isSigner: true, isWritable: true }, // Creator
        { pubkey: bountyPDA, isSigner: false, isWritable: true }, // Bounty PDA
        { pubkey: vaultPDA, isSigner: false, isWritable: true }, // Vault PDA
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // System program
      ],
      data: instructionData
    });

    // Fetch the recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();

    // Create the transaction
    const transaction = new Transaction();
    transaction.add(createBountyIx);
    transaction.feePayer = new PublicKey(creatorWallet);
    transaction.recentBlockhash = blockhash;

    // Serialize the transaction for the client to sign
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    }).toString('base64');

    // Create metadata object for client
    const bountyMetadata = {
      bountyAddress: bountyPDA.toString(),
      vaultAddress: vaultPDA.toString(),
      creatorAddress: creatorWallet,
      amount,
      amountLamports: amountLamports.toString(),
      deadline: new Date(deadline).toISOString(),
      title,
      description,
      repoUrl,
      tags,
      severityWeights: severityWeights || {
        critical: 5,
        high: 3,
        medium: 2,
        low: 1,
        informational: 0.5
      },
      status: "pending", // Will be updated when transaction is confirmed
      createdAt: new Date().toISOString(),
      winnersCount,
      customSeed: seed
    };

    // Return the transaction for the client to sign
    return NextResponse.json({
      transaction: serializedTransaction,
      bountyAddress: bountyPDA.toString(),
      vaultAddress: vaultPDA.toString(),
      metadata: bountyMetadata
    });
  } catch (error: unknown) {
    console.error("Error creating bounty transaction:", error);
    return NextResponse.json(
      { error: `Failed to create bounty transaction: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
} 