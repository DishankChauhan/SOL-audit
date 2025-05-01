import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";

export async function POST(req: NextRequest) {
  try {
    const { fromWallet, toWallet, amount } = await req.json();

    if (!fromWallet || !toWallet || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: fromWallet, toWallet, or amount" },
        { status: 400 }
      );
    }

    // Connect to Solana
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'http://localhost:8899';
    const connection = new Connection(rpcUrl);
    
    // Convert amount to lamports (1 SOL = 1,000,000,000 lamports)
    const lamports = Math.floor(parseFloat(amount) * 1_000_000_000);
    
    // Create a simple transfer instruction
    const transferIx = SystemProgram.transfer({
      fromPubkey: new PublicKey(fromWallet),
      toPubkey: new PublicKey(toWallet),
      lamports
    });
    
    // Create a transaction and add the transfer instruction
    const recentBlockhash = await connection.getLatestBlockhash();
    const transaction = new Transaction({
      feePayer: new PublicKey(fromWallet),
      recentBlockhash: recentBlockhash.blockhash,
    }).add(transferIx);
    
    // Serialize the transaction for client-side signing
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    }).toString('base64');
    
    return NextResponse.json({
      transaction: serializedTransaction,
      message: "Transfer transaction created successfully"
    });
    
  } catch (error) {
    console.error('Error creating transfer transaction:', error);
    return NextResponse.json(
      { error: `Failed to create transfer transaction: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
} 