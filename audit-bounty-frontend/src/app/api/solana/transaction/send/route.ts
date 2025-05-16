import { NextRequest, NextResponse } from "next/server";
import { Connection, Transaction, VersionedTransaction, SendOptions } from "@solana/web3.js";

// Use the environment variable for RPC URL with a fallback
const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'http://localhost:8899';

export async function POST(req: NextRequest) {
  try {
    const { signedTransaction } = await req.json();

    if (!signedTransaction) {
      return NextResponse.json(
        { error: "No signed transaction provided" },
        { status: 400 }
      );
    }

    console.log("Sending transaction to Solana...");
    
    // Setup Solana connection
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    console.log("Connected to Solana at:", SOLANA_RPC_URL);

    // Convert base64 string to transaction buffer
    const transactionBuffer = Buffer.from(signedTransaction, "base64");
    
    // Log transaction buffer details
    console.log("Transaction buffer length:", transactionBuffer.length);
    
    // Try to deserialize to debug any issues
    let transaction;
    let isVersioned = false;
    
    try {
      // First try as a versioned transaction
      transaction = VersionedTransaction.deserialize(transactionBuffer);
      isVersioned = true;
      console.log("Decoded as VersionedTransaction successfully");
    } catch (e) {
      // Then try as a legacy transaction
      console.log("Not a versioned transaction, trying legacy format...");
      try {
        transaction = Transaction.from(transactionBuffer);
        console.log("Decoded as legacy Transaction successfully");
        
        // Log important transaction details
        console.log("Transaction details:");
        console.log(" - Fee payer:", transaction.feePayer?.toString());
        console.log(" - Recent blockhash:", transaction.recentBlockhash);
        console.log(" - Signatures:", transaction.signatures.length);
        
        if (transaction.instructions.length > 0) {
          console.log("Instructions details:");
          transaction.instructions.forEach((instruction, i) => {
            console.log(`Instruction ${i}:`);
            console.log(` - Program ID: ${instruction.programId.toString()}`);
            console.log(` - Data length: ${instruction.data.length}`);
            console.log(` - Data hex: ${Buffer.from(instruction.data).toString('hex')}`);
          });
        }
      } catch (err) {
        console.error("Failed to decode transaction:", err);
        return NextResponse.json(
          { error: `Failed to decode transaction: ${err instanceof Error ? err.message : String(err)}` },
          { status: 400 }
        );
      }
    }

    // Try a transaction simulation first to catch any errors
    console.log("Simulating transaction first...");
    let simulationResult;
    
    try {
      if (isVersioned) {
        simulationResult = await connection.simulateTransaction(transaction as VersionedTransaction);
      } else {
        simulationResult = await connection.simulateTransaction(transaction as Transaction);
      }
      
      if (simulationResult.value.err) {
        console.error("Transaction simulation failed:", simulationResult.value.err);
        console.log("Simulation logs:", simulationResult.value.logs);
        
        return NextResponse.json(
          { 
            error: "Transaction simulation failed", 
            details: simulationResult.value.err,
            logs: simulationResult.value.logs 
          },
          { status: 400 }
        );
      }
      
      console.log("Simulation successful, proceeding with transaction...");
    } catch (simError) {
      console.error("Error simulating transaction:", simError);
      // Continue anyway to see if the actual transaction will work
    }

    // Send transaction options
    const options: SendOptions = {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 3
    };

    try {
      // Send the raw transaction
      console.log("Sending raw transaction...");
      const signature = await connection.sendRawTransaction(transactionBuffer, options);
      console.log("Transaction sent with signature:", signature);

      // Wait for confirmation
      console.log("Waiting for confirmation...");
      const confirmation = await connection.confirmTransaction(signature, "confirmed");
      
      if (confirmation.value.err) {
        console.error("Transaction error:", confirmation.value.err);
        return NextResponse.json(
          { 
            error: "Transaction failed to confirm", 
            details: confirmation.value.err,
            signature 
          },
          { status: 400 }
        );
      }

      // Transaction successful
      console.log("Transaction confirmed successfully!");
      return NextResponse.json({
        signature,
        success: true,
        message: "Transaction confirmed successfully"
      });
    } catch (err) {
      console.error("Send transaction error:", err);
      
      // Get detailed error information
      try {
        const response = {
          error: `Transaction failed: ${err instanceof Error ? err.message : String(err)}`,
          details: null as any
        };
        
        // Try to get logs from the error if available
        if (err instanceof Error && 'logs' in (err as any)) {
          response.details = { logs: (err as any).logs };
        }
        
        return NextResponse.json(response, { status: 400 });
      } catch (e) {
        return NextResponse.json(
          { error: `Failed to send transaction: ${err instanceof Error ? err.message : String(err)}` },
          { status: 400 }
        );
      }
    }
  } catch (error: unknown) {
    console.error("Error sending transaction:", error);
    return NextResponse.json(
      { error: `Failed to send transaction: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
} 