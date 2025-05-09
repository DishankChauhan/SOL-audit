import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import * as fs from 'fs';

async function main() {
  // Use the creator keypair that we already airdropped SOL to
  const creator = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync('./creator.json', 'utf-8')))
  );
  
  // Configure the provider with the creator's keypair as the wallet
  const provider = new anchor.AnchorProvider(
    anchor.getProvider().connection,
    new anchor.Wallet(creator),
    { commitment: "confirmed" }
  );
  
  // Program ID from our deployed contract
  const programId = new PublicKey("BUPQa6bZdMcos6JnNmiaqwywPrBsS9iYVagH2TcBKSXi");
  
  // Load the IDL
  const idl = JSON.parse(fs.readFileSync('./target/idl/audit_bounty.json', 'utf-8'));
  
  // Initialize the program
  const program = new anchor.Program(idl, programId, provider);
  
  // Get initial balance
  const creatorInitialBalance = await provider.connection.getBalance(creator.publicKey);
  console.log("Creator initial balance:", creatorInitialBalance / LAMPORTS_PER_SOL, "SOL");
  
  // Bounty parameters
  const bountyAmount = new anchor.BN(0.2 * LAMPORTS_PER_SOL);
  const nonce = 99; // Use a different nonce to create a new bounty
  
  // Define seeds
  const BOUNTY_SEED = Buffer.from("bounty");
  const ESCROW_SEED = Buffer.from("escrow");
  
  // Find the PDAs
  const [bountyPda, bountyBump] = await PublicKey.findProgramAddress(
    [BOUNTY_SEED, creator.publicKey.toBuffer(), Buffer.from([nonce])],
    program.programId
  );
  console.log("Bounty PDA:", bountyPda.toString());
  
  const [escrowPda, escrowBump] = await PublicKey.findProgramAddress(
    [ESCROW_SEED, bountyPda.toBuffer()],
    program.programId
  );
  console.log("Escrow PDA:", escrowPda.toString());
  
  try {
    // 1. Create a bounty
    console.log("Creating bounty...");
    const createTx = await program.methods
      .createBounty(bountyAmount, nonce)
      .accounts({
        creator: creator.publicKey,
        bounty: bountyPda,
        escrow: escrowPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();
    
    console.log("Bounty created successfully! Transaction:", createTx);
    
    // Check escrow balance
    const escrowBalance = await provider.connection.getBalance(escrowPda);
    console.log("Escrow balance after creation:", escrowBalance / LAMPORTS_PER_SOL, "SOL");
    
    // 2. Cancel the bounty
    console.log("Cancelling bounty...");
    const cancelTx = await program.methods
      .cancelBounty()
      .accounts({
        creator: creator.publicKey,
        bounty: bountyPda,
        escrow: escrowPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();
    
    console.log("Bounty cancelled successfully! Transaction:", cancelTx);
    
    // Check final balances
    const escrowFinalBalance = await provider.connection.getBalance(escrowPda);
    const creatorFinalBalance = await provider.connection.getBalance(creator.publicKey);
    
    console.log("Escrow final balance:", escrowFinalBalance / LAMPORTS_PER_SOL, "SOL");
    console.log("Creator final balance:", creatorFinalBalance / LAMPORTS_PER_SOL, "SOL");
    
    // Account for transaction fees in the difference
    const balanceDifference = creatorFinalBalance - creatorInitialBalance;
    console.log("Creator balance difference:", balanceDifference / LAMPORTS_PER_SOL, "SOL");
    console.log("Expected returned amount:", bountyAmount.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("Transaction fees:", (bountyAmount.toNumber() - balanceDifference) / LAMPORTS_PER_SOL, "SOL");
    
    console.log("Cancel test completed successfully!");
  } catch (error) {
    console.error("Error:", error);
  }
}

main().catch(err => console.error("Unhandled error:", err)); 