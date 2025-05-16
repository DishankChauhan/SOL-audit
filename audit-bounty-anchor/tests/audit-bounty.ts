import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

// Define BountyStatus enum to match Rust enum
enum BountyStatus {
  Open,
  Submitted,
  Approved,
  Cancelled
}

// Define types for our program accounts
interface BountyAccount {
  creator: PublicKey;
  auditor: PublicKey | null;
  amount: anchor.BN;
  status: BountyStatus;
  reportUri: string | null;
  createdAt: anchor.BN;
  nonce: number;
  bump: number;
}

describe("audit-bounty", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Use the deployed program ID
  const PROGRAM_ID = new PublicKey("BUPQa6bZdMcos6JnNmiaqwywPrBsS9iYVagH2TcBKSXi");
  
  // Load the program from the deployed program ID
  const program = new anchor.Program(
    require("../target/idl/audit_bounty.json"),
    PROGRAM_ID
  );
  
  // Test wallets
  const creator = anchor.web3.Keypair.generate();
  const auditor = anchor.web3.Keypair.generate();
  const randomUser = anchor.web3.Keypair.generate();
  
  // Bounty parameters
  const bountyAmount = new anchor.BN(1 * LAMPORTS_PER_SOL); // 1 SOL
  const nonce = 1;
  const reportUri = "ipfs://QmTest123456789";
  
  // PDA accounts
  let bountyPda: PublicKey;
  let escrowPda: PublicKey;
  let bountyBump: number;
  let escrowBump: number;

  // Seeds
  const BOUNTY_SEED = Buffer.from("bounty");
  const ESCROW_SEED = Buffer.from("escrow");

  before(async () => {
    // Airdrop SOL to creator wallet for tests
    const airdropSignature = await provider.connection.requestAirdrop(
      creator.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);
    
    // Airdrop SOL to auditor wallet as well for testing fees
    const auditorAirdropSignature = await provider.connection.requestAirdrop(
      auditor.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(auditorAirdropSignature);

    // Airdrop SOL to randomUser for auto-release test
    const randomUserAirdropSignature = await provider.connection.requestAirdrop(
      randomUser.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(randomUserAirdropSignature);

    // Derive PDA addresses for bounty and escrow
    [bountyPda, bountyBump] = await PublicKey.findProgramAddress(
      [BOUNTY_SEED, creator.publicKey.toBuffer(), Buffer.from([nonce])],
      program.programId
    );
    
    // Derive escrow PDA address
    [escrowPda, escrowBump] = await PublicKey.findProgramAddress(
      [ESCROW_SEED, bountyPda.toBuffer()],
      program.programId
    );
  });

  it("Creates a bounty with funds in escrow", async () => {
    try {
      // Create the bounty
      await program.methods
        .createBounty(bountyAmount, nonce)
        .accounts({
          creator: creator.publicKey,
          bounty: bountyPda,
          escrow: escrowPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
      
      // Fetch the bounty account to verify its data
      const bountyAccount = await program.account.bounty.fetch(bountyPda) as BountyAccount;
      
      // Verify the escrow has the correct SOL amount
      const escrowBalance = await provider.connection.getBalance(escrowPda);
      
      console.log("Bounty created with status:", bountyAccount.status);
      console.log("Escrow balance:", escrowBalance / LAMPORTS_PER_SOL, "SOL");
      
      // Check creator
      expect(bountyAccount.creator.toString()).to.equal(creator.publicKey.toString());
      
      // Check other bounty fields - adjusting for Anchor 0.29.0 enum representation
      expect(bountyAccount.auditor).to.equal(null);
      expect(bountyAccount.amount.toString()).to.equal(bountyAmount.toString());
      expect(bountyAccount.status === BountyStatus.Open).to.be.true;
      expect(bountyAccount.reportUri).to.equal(null);
      expect(bountyAccount.nonce).to.equal(nonce);
      expect(bountyAccount.bump).to.equal(bountyBump);
      
      // Verify escrow has the correct funds
      expect(escrowBalance.toString()).to.equal(bountyAmount.toString());
    } catch (error) {
      console.error("Error in create bounty test:", error);
      throw error;
    }
  });

  it("Allows auditor to submit a report", async () => {
    try {
      // Submit report
      await program.methods
        .submitReport(reportUri)
        .accounts({
          auditor: auditor.publicKey,
          bounty: bountyPda,
        })
        .signers([auditor])
        .rpc();
      
      // Fetch the bounty account to verify its data
      const bountyAccount = await program.account.bounty.fetch(bountyPda) as BountyAccount;
      
      console.log("Report submitted, bounty status:", bountyAccount.status);
      
      // Verify the bounty account has been updated correctly
      expect(bountyAccount.auditor).to.not.equal(null);
      if (bountyAccount.auditor) {
        expect(bountyAccount.auditor.toString()).to.equal(auditor.publicKey.toString());
      }
      expect(bountyAccount.reportUri).to.equal(reportUri);
      expect(bountyAccount.status === BountyStatus.Submitted).to.be.true;
    } catch (error) {
      console.error("Error in submit report test:", error);
      throw error;
    }
  });

  it("Allows creator to approve and release funds", async () => {
    try {
      // Get auditor's balance before release
      const auditorBalanceBefore = await provider.connection.getBalance(auditor.publicKey);
      
      // Approve and release funds
      await program.methods
        .approveAndRelease()
        .accounts({
          creator: creator.publicKey,
          bounty: bountyPda,
          auditor: auditor.publicKey,
          escrow: escrowPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
      
      // Fetch the bounty account to verify its data
      const bountyAccount = await program.account.bounty.fetch(bountyPda) as BountyAccount;
      
      // Get auditor's balance after release
      const auditorBalanceAfter = await provider.connection.getBalance(auditor.publicKey);
      
      // Get escrow's balance after release
      const escrowBalanceAfter = await provider.connection.getBalance(escrowPda);
      
      console.log("Funds released, bounty status:", bountyAccount.status);
      console.log("Auditor balance increase:", (auditorBalanceAfter - auditorBalanceBefore) / LAMPORTS_PER_SOL, "SOL");
      
      // Verify the bounty status is updated
      expect(bountyAccount.status === BountyStatus.Approved).to.be.true;
      
      // Verify the auditor received the funds (accounting for gas fees)
      expect(auditorBalanceAfter).to.be.greaterThan(auditorBalanceBefore);
      expect(auditorBalanceAfter - auditorBalanceBefore).to.be.closeTo(
        bountyAmount.toNumber(),
        0.01 * LAMPORTS_PER_SOL // Allow for small variance due to gas fees
      );
      
      // Verify the escrow is empty
      expect(escrowBalanceAfter).to.equal(0);
    } catch (error) {
      console.error("Error in approve and release test:", error);
      throw error;
    }
  });

  // Create a new bounty for testing the reject and cancel flows
  let bountyPda2: PublicKey;
  let escrowPda2: PublicKey;
  const nonce2 = 2;

  it("Creates a second bounty for testing reject/cancel flows", async () => {
    try {
      // Derive PDA addresses for second bounty
      [bountyPda2] = await PublicKey.findProgramAddress(
        [BOUNTY_SEED, creator.publicKey.toBuffer(), Buffer.from([nonce2])],
        program.programId
      );
      
      // Derive the escrow PDA for the second bounty
      [escrowPda2] = await PublicKey.findProgramAddress(
        [ESCROW_SEED, bountyPda2.toBuffer()],
        program.programId
      );
      
      // Create the second bounty
      await program.methods
        .createBounty(bountyAmount, nonce2)
        .accounts({
          creator: creator.publicKey,
          bounty: bountyPda2,
          escrow: escrowPda2,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
      
      // Fetch the bounty account to verify its data
      const bountyAccount = await program.account.bounty.fetch(bountyPda2) as BountyAccount;
      
      // Verify the escrow has the correct SOL amount
      const escrowBalance = await provider.connection.getBalance(escrowPda2);
      
      console.log("Second bounty created with status:", bountyAccount.status);
      
      // Verify the bounty account has the correct data
      expect(bountyAccount.creator.toString()).to.equal(creator.publicKey.toString());
      expect(bountyAccount.status === BountyStatus.Open).to.be.true;
      expect(escrowBalance.toString()).to.equal(bountyAmount.toString());
    } catch (error) {
      console.error("Error creating second bounty:", error);
      throw error;
    }
  });

  it("Allows auditor to submit a report on the second bounty", async () => {
    try {
      // Submit report
      await program.methods
        .submitReport(reportUri)
        .accounts({
          auditor: auditor.publicKey,
          bounty: bountyPda2,
        })
        .signers([auditor])
        .rpc();
      
      // Fetch the bounty account to verify its data
      const bountyAccount = await program.account.bounty.fetch(bountyPda2) as BountyAccount;
      
      console.log("Report submitted on second bounty, status:", bountyAccount.status);
      
      // Verify the bounty account has been updated correctly
      expect(bountyAccount.auditor).to.not.equal(null);
      if (bountyAccount.auditor) {
        expect(bountyAccount.auditor.toString()).to.equal(auditor.publicKey.toString());
      }
      expect(bountyAccount.reportUri).to.equal(reportUri);
      expect(bountyAccount.status === BountyStatus.Submitted).to.be.true;
    } catch (error) {
      console.error("Error submitting report on second bounty:", error);
      throw error;
    }
  });

  it("Allows creator to reject a report", async () => {
    try {
      // Reject the report
      await program.methods
        .rejectReport()
        .accounts({
          creator: creator.publicKey,
          bounty: bountyPda2,
        })
        .signers([creator])
        .rpc();
      
      // Fetch the bounty account to verify its data
      const bountyAccount = await program.account.bounty.fetch(bountyPda2) as BountyAccount;
      
      console.log("Report rejected, bounty status:", bountyAccount.status);
      
      // Verify the bounty account has been reset correctly
      expect(bountyAccount.auditor).to.equal(null);
      expect(bountyAccount.reportUri).to.equal(null);
      expect(bountyAccount.status === BountyStatus.Open).to.be.true;
    } catch (error) {
      console.error("Error rejecting report:", error);
      throw error;
    }
  });

  it("Allows creator to cancel a bounty", async () => {
    try {
      // Get creator's balance before cancellation
      const creatorBalanceBefore = await provider.connection.getBalance(creator.publicKey);
      
      // Cancel the bounty
      await program.methods
        .cancelBounty()
        .accounts({
          creator: creator.publicKey,
          bounty: bountyPda2,
          escrow: escrowPda2,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
      
      // Fetch the bounty account to verify its data
      const bountyAccount = await program.account.bounty.fetch(bountyPda2) as BountyAccount;
      
      // Get creator's balance after cancellation
      const creatorBalanceAfter = await provider.connection.getBalance(creator.publicKey);
      
      // Get escrow's balance after cancellation
      const escrowBalanceAfter = await provider.connection.getBalance(escrowPda2);
      
      console.log("Bounty cancelled, status:", bountyAccount.status);
      console.log("Creator balance increase:", (creatorBalanceAfter - creatorBalanceBefore) / LAMPORTS_PER_SOL, "SOL");
      
      // Verify the bounty status is updated
      expect(bountyAccount.status === BountyStatus.Cancelled).to.be.true;
      
      // Verify the creator received the funds back (accounting for gas fees)
      expect(creatorBalanceAfter).to.be.greaterThan(creatorBalanceBefore);
      expect(creatorBalanceAfter - creatorBalanceBefore).to.be.closeTo(
        bountyAmount.toNumber(),
        0.01 * LAMPORTS_PER_SOL // Allow for small variance due to gas fees
      );
      
      // Verify the escrow is empty
      expect(escrowBalanceAfter).to.equal(0);
    } catch (error) {
      console.error("Error cancelling bounty:", error);
      throw error;
    }
  });

  // For testing auto-release functionality, we would need to mock the clock
  // This is more complex and typically requires a specialized setup
  // Here's a simplified version that notes the test would typically be done
  it("Tests auto-release functionality (simplified)", () => {
    console.log("Note: Auto-release functionality would typically be tested by mocking the Solana Clock");
    console.log("This would verify that funds can be released after the 7-day deadline");
  });
}); 