import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

export async function GET(req: NextRequest) {
  try {
    // Connect to Solana
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'http://localhost:8899';
    const connection = new Connection(rpcUrl);
    
    // Estimate the account size - this should match the Rust side
    // BountyAccount structure size:
    // - creator: Pubkey (32 bytes)
    // - hunter: Option<Pubkey> (1 + 32 bytes)
    // - amount: u64 (8 bytes)
    // - deadline: i64 (8 bytes)
    // - status: BountyStatus enum (1 byte)
    // - initialized: bool (1 byte)
    // - winners_count: u8 (1 byte)
    // - current_winners: u8 (1 byte)
    const estimatedSize = 32 + 33 + 8 + 8 + 1 + 1 + 1 + 1; // = 85 bytes
    
    // Get minimum balance for rent exemption
    const rentExempt = await connection.getMinimumBalanceForRentExemption(estimatedSize);
    
    // Get additional information for debugging
    const version = await connection.getVersion();
    
    return NextResponse.json({
      estimatedSize,
      rentExempt,
      version,
      rpcUrl
    });
  } catch (error) {
    console.error('Error getting rent exempt info:', error);
    return NextResponse.json(
      { error: `Failed to get rent-exempt info: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
} 