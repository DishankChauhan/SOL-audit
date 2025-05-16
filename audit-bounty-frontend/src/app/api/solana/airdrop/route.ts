import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getCluster } from "@/lib/solana/config";

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, amount = 2 } = await req.json();

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Missing wallet address" },
        { status: 400 }
      );
    }

    // Check if we're on localnet - only allow airdrops on localnet
    const cluster = getCluster();
    if (cluster !== 'localnet') {
      return NextResponse.json(
        { error: "Airdrops are only allowed on localnet" },
        { status: 403 }
      );
    }

    // Setup Solana connection
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'http://localhost:8899';
    const connection = new Connection(rpcUrl, 'confirmed');

    // Request airdrop
    const lamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);
    console.log(`Requesting airdrop of ${lamports / LAMPORTS_PER_SOL} SOL (${lamports} lamports) to ${walletAddress}`);
    
    const signature = await connection.requestAirdrop(
      new PublicKey(walletAddress),
      lamports
    );

    // Wait for confirmation
    await connection.confirmTransaction(signature);

    // Get new balance
    const balance = await connection.getBalance(new PublicKey(walletAddress));

    return NextResponse.json({
      success: true,
      signature,
      message: `Airdropped ${amount} SOL to ${walletAddress}`,
      newBalance: balance / LAMPORTS_PER_SOL
    });
  } catch (error) {
    console.error('Error during airdrop:', error);
    return NextResponse.json(
      { error: `Failed to airdrop: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
} 