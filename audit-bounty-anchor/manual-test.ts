import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Connection, Keypair } from "@solana/web3.js";
import * as fs from 'fs';

// Program ID of the deployed contract
const PROGRAM_ID = "5BaoJvpZji9co7XTxHDxreSBNzKcJLgyPySzgXv6mKbz";
const BOUNTY_SEED = Buffer.from("bounty");
const ESCROW_SEED = Buffer.from("escrow");

// Function to load an Anchor program
async function loadProgram() {
    // Connect to local validator
    const connection = new Connection("http://localhost:8899", "confirmed");
    
    // Load the payer keypair
    const payerKeypair = Keypair.fromSecretKey(
        Buffer.from(JSON.parse(fs.readFileSync("deploy-keypair.json", "utf-8")))
    );

    // Create provider from connection and wallet
    const provider = new anchor.AnchorProvider(
        connection,
        new anchor.Wallet(payerKeypair),
        { commitment: "confirmed" }
    );

    // Load IDL from file
    const idl = JSON.parse(fs.readFileSync("./fixed-idl.json", "utf-8"));
    
    // Initialize program
    const program = new anchor.Program(idl, new PublicKey(PROGRAM_ID), provider);
    
    return { program, provider, payerKeypair };
}

// Test Function 1: Create a Bounty
async function testCreateBounty() {
    console.log("\n----- Testing Create Bounty -----");
    const { program, provider, payerKeypair } = await loadProgram();
    
    // Create a new keypair for creator
    const creatorKeypair = anchor.web3.Keypair.generate();
    
    // Airdrop some SOL to the creator
    const airdropSig = await provider.connection.requestAirdrop(
        creatorKeypair.publicKey,
        5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);
    console.log(`Airdropped 5 SOL to creator: ${creatorKeypair.publicKey.toString()}`);

    // Setup parameters for bounty creation
    const bountyAmount = new anchor.BN(1 * LAMPORTS_PER_SOL);
    const nonce = 1;
    
    try {
        // Derive the bounty PDA
        const [bountyPda, bountyBump] = await PublicKey.findProgramAddress(
            [BOUNTY_SEED, creatorKeypair.publicKey.toBuffer(), Buffer.from([nonce])],
            program.programId
        );
        console.log(`Bounty PDA: ${bountyPda.toString()}`);
        
        // Derive escrow PDA - looking at the smart contract, it's owned by the system program
        const [escrowPda, escrowBump] = await PublicKey.findProgramAddress(
            [ESCROW_SEED, bountyPda.toBuffer()],
            SystemProgram.programId
        );
        console.log(`Escrow PDA: ${escrowPda.toString()}`);

        // Execute the create bounty transaction
        const tx = await program.methods
            .createBounty(bountyAmount, nonce)
            .accounts({
                creator: creatorKeypair.publicKey,
                bounty: bountyPda,
                escrow: escrowPda,
                systemProgram: SystemProgram.programId,
            })
            .signers([creatorKeypair])
            .rpc();
            
        console.log("Bounty created successfully. Transaction signature:", tx);
        
        // Check escrow balance
        const escrowBalance = await provider.connection.getBalance(escrowPda);
        console.log(`Escrow balance: ${escrowBalance / LAMPORTS_PER_SOL} SOL`);
        
        // Return the data for next tests
        return { creatorKeypair, bountyPda, escrowPda, nonce };
    } catch (error) {
        console.error("Error creating bounty:", error);
        throw error;
    }
}

// Test Function 2: Submit a Report
async function testSubmitReport(creatorKeypair: Keypair, bountyPda: PublicKey) {
    console.log("\n----- Testing Submit Report -----");
    const { program, provider } = await loadProgram();
    
    // Create a new keypair for auditor
    const auditorKeypair = anchor.web3.Keypair.generate();
    
    // Airdrop some SOL to the auditor
    const airdropSig = await provider.connection.requestAirdrop(
        auditorKeypair.publicKey,
        2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);
    console.log(`Airdropped 2 SOL to auditor: ${auditorKeypair.publicKey.toString()}`);

    // Set report URI
    const reportUri = "ipfs://QmTestReportHash123456789";
    
    // Submit the report
    try {
        // First, fetch the bounty account to get its data
        const bountyAccount = await program.account.bounty.fetch(bountyPda);
        console.log("Bounty account data:", JSON.stringify(bountyAccount, null, 2));
        
        const tx = await program.methods
            .submitReport(reportUri)
            .accounts({
                auditor: auditorKeypair.publicKey,
                bounty: bountyPda,
            })
            .signers([auditorKeypair])
            .rpc();
            
        console.log("Report submitted successfully. Transaction signature:", tx);
        return { auditorKeypair };
    } catch (error) {
        console.error("Error submitting report:", error);
        throw error;
    }
}

// Test Function 3: Approve and Release Funds
async function testApproveAndRelease(
    creatorKeypair: Keypair, 
    bountyPda: PublicKey, 
    auditorKeypair: Keypair,
    escrowPda: PublicKey
) {
    console.log("\n----- Testing Approve and Release -----");
    const { program, provider } = await loadProgram();
    
    // Get auditor's balance before
    const balanceBefore = await provider.connection.getBalance(auditorKeypair.publicKey);
    console.log(`Auditor balance before: ${balanceBefore / LAMPORTS_PER_SOL} SOL`);
    
    // Approve and release funds
    try {
        const tx = await program.methods
            .approveAndRelease()
            .accounts({
                creator: creatorKeypair.publicKey,
                bounty: bountyPda,
                auditor: auditorKeypair.publicKey,
                escrow: escrowPda,
                systemProgram: SystemProgram.programId,
            })
            .signers([creatorKeypair])
            .rpc();
            
        console.log("Funds released successfully. Transaction signature:", tx);
        
        // Check auditor's balance after
        const balanceAfter = await provider.connection.getBalance(auditorKeypair.publicKey);
        console.log(`Auditor balance after: ${balanceAfter / LAMPORTS_PER_SOL} SOL`);
        console.log(`Difference: ${(balanceAfter - balanceBefore) / LAMPORTS_PER_SOL} SOL`);
    } catch (error) {
        console.error("Error releasing funds:", error);
        throw error;
    }
}

// Test Function 4: Create another bounty and test rejection
async function testRejectReport() {
    console.log("\n----- Testing Reject Report -----");
    const { program, provider } = await loadProgram();
    
    // Create new keypairs
    const creatorKeypair = anchor.web3.Keypair.generate();
    const auditorKeypair = anchor.web3.Keypair.generate();
    
    // Airdrop SOL to creator
    const airdropCreator = await provider.connection.requestAirdrop(
        creatorKeypair.publicKey,
        5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropCreator);
    
    // Airdrop SOL to auditor
    const airdropAuditor = await provider.connection.requestAirdrop(
        auditorKeypair.publicKey,
        2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropAuditor);
    
    // Setup bounty
    const bountyAmount = new anchor.BN(1 * LAMPORTS_PER_SOL);
    const nonce = 2; // Use a different nonce for this test
    
    // Derive the bounty PDA
    const [bountyPda, bountyBump] = await PublicKey.findProgramAddress(
        [BOUNTY_SEED, creatorKeypair.publicKey.toBuffer(), Buffer.from([nonce])],
        program.programId
    );
    
    // Derive escrow PDA
    const [escrowPda, escrowBump] = await PublicKey.findProgramAddress(
        [ESCROW_SEED, bountyPda.toBuffer()],
        SystemProgram.programId
    );
    
    // Create bounty
    try {
        const txCreate = await program.methods
            .createBounty(bountyAmount, nonce)
            .accounts({
                creator: creatorKeypair.publicKey,
                bounty: bountyPda,
                escrow: escrowPda,
                systemProgram: SystemProgram.programId,
            })
            .signers([creatorKeypair])
            .rpc();
        console.log("Created second bounty. Transaction signature:", txCreate);
        
        // Submit report
        const reportUri = "ipfs://QmTestReportToReject";
        const txSubmit = await program.methods
            .submitReport(reportUri)
            .accounts({
                auditor: auditorKeypair.publicKey,
                bounty: bountyPda,
            })
            .signers([auditorKeypair])
            .rpc();
        console.log("Submitted report for rejection. Transaction signature:", txSubmit);
        
        // Reject the report
        const txReject = await program.methods
            .rejectReport()
            .accounts({
                creator: creatorKeypair.publicKey,
                bounty: bountyPda,
            })
            .signers([creatorKeypair])
            .rpc();
        console.log("Report rejected successfully. Transaction signature:", txReject);
        
        return { creatorKeypair, bountyPda, escrowPda };
    } catch (error) {
        console.error("Error in reject report test:", error);
        throw error;
    }
}

// Test Function 5: Cancel a bounty
async function testCancelBounty(creatorKeypair: Keypair, bountyPda: PublicKey, escrowPda: PublicKey) {
    console.log("\n----- Testing Cancel Bounty -----");
    const { program, provider } = await loadProgram();
    
    // Get creator's balance before
    const balanceBefore = await provider.connection.getBalance(creatorKeypair.publicKey);
    console.log(`Creator balance before: ${balanceBefore / LAMPORTS_PER_SOL} SOL`);
    
    // Cancel the bounty
    try {
        const tx = await program.methods
            .cancelBounty()
            .accounts({
                creator: creatorKeypair.publicKey,
                bounty: bountyPda,
                escrow: escrowPda,
                systemProgram: SystemProgram.programId,
            })
            .signers([creatorKeypair])
            .rpc();
        console.log("Bounty cancelled successfully. Transaction signature:", tx);
        
        // Check creator's balance after
        const balanceAfter = await provider.connection.getBalance(creatorKeypair.publicKey);
        console.log(`Creator balance after: ${balanceAfter / LAMPORTS_PER_SOL} SOL`);
        console.log(`Difference: ${(balanceAfter - balanceBefore) / LAMPORTS_PER_SOL} SOL`);
    } catch (error) {
        console.error("Error cancelling bounty:", error);
        throw error;
    }
}

// Main function to run all tests
async function runAllTests() {
    console.log("Starting manual tests for Audit Bounty contract...");
    
    try {
        // Test 1: Create a bounty
        const { creatorKeypair, bountyPda, escrowPda } = await testCreateBounty();
        
        // Test 2: Submit a report
        const { auditorKeypair } = await testSubmitReport(creatorKeypair, bountyPda);
        
        // Test 3: Approve and release funds
        await testApproveAndRelease(creatorKeypair, bountyPda, auditorKeypair, escrowPda);
        
        // Test 4: Reject a report (creates another bounty)
        const { creatorKeypair: creator2, bountyPda: bounty2, escrowPda: escrow2 } = await testRejectReport();
        
        // Test 5: Cancel a bounty
        await testCancelBounty(creator2, bounty2, escrow2);
        
        console.log("\n✅ All tests completed successfully!");
    } catch (error) {
        console.error("\n❌ Tests failed:", error);
    }
}

// Run all tests
runAllTests(); 