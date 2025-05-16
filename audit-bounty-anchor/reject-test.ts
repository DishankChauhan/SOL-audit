import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import * as fs from 'fs';

async function main() {
  // Use the creator keypair that we already airdropped SOL to
  const creator = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync('./creator.json', 'utf-8')))
  );
  
  // Create an auditor keypair
  const auditor = Keypair.generate();
  
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
  
  // Airdrop SOL to the auditor
  console.log("Airdropping SOL to auditor:", auditor.publicKey.toString());
  const airdropSig = await provider.connection.requestAirdrop(
    auditor.publicKey,
    LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(airdropSig);
  
  // Bounty parameters
  const bountyAmount = new anchor.BN(0.3 * LAMPORTS_PER_SOL);
  const nonce = 101; // Use a different nonce to create a new bounty
  
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
    
    // 2. Submit a report
    console.log("Submitting report...");
    const reportUri = "ipfs://QmTest123456789";
    const submitTx = await program.methods
      .submitReport(reportUri)
      .accounts({
        auditor: auditor.publicKey,
        bounty: bountyPda,
      })
      .signers([auditor])
      .rpc();
    
    console.log("Report submitted successfully! Transaction:", submitTx);
    
    // Fetch the bounty account to verify status
    const bountyAfterSubmit = await program.account.bounty.fetch(bountyPda);
    console.log("Bounty after submission:", bountyAfterSubmit);
    
    // 3. Reject the report
    console.log("Rejecting report...");
    const rejectTx = await program.methods
      .rejectReport()
      .accounts({
        creator: creator.publicKey,
        bounty: bountyPda,
      })
      .signers([creator])
      .rpc();
    
    console.log("Report rejected successfully! Transaction:", rejectTx);
    
    // Fetch the bounty account to verify status
    const bountyAfterReject = await program.account.bounty.fetch(bountyPda);
    console.log("Bounty after rejection:", bountyAfterReject);
    
    // 4. Cancel the bounty to return funds
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
    
    console.log("Reject test completed successfully!");
  } catch (error) {
    console.error("Error:", error);
  }
}

main().catch(err => console.error("Unhandled error:", err)); 