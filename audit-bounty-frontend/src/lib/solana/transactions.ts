import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  sendAndConfirmTransaction,
  Keypair,
  ComputeBudgetProgram
} from '@solana/web3.js';
import { Buffer } from 'buffer';
import { programId, deriveBountyPDA, deriveVaultPDA, solToLamports, getSolanaConnection } from './config';
import * as borsh from '@project-serum/borsh';
import BN from 'bn.js';

// Instruction variants matching the contract
enum InstructionVariant {
  CreateBounty = 0,
  SubmitWork = 1,
  ApproveSubmission = 2,
  ClaimBounty = 3,
  CancelBounty = 4,
}

// Borsh schema layouts for each instruction
const createBountyLayout = borsh.struct([
  borsh.u8('variant'),
  borsh.u64('amount'),
  borsh.i64('deadline'),
  borsh.option(borsh.vec(borsh.u8()), 'custom_seed'),
]);

const submitWorkLayout = borsh.struct([
  borsh.u8('variant'),
  borsh.str('submission_url'),
]);

const approveSubmissionLayout = borsh.struct([
  borsh.u8('variant'),
  borsh.publicKey('hunter'),
]);

const claimBountyLayout = borsh.struct([
  borsh.u8('variant'),
]);

const cancelBountyLayout = borsh.struct([
  borsh.u8('variant'),
]);

/**
 * Create a bounty with locked SOL
 */
export async function createBounty(
  connection: Connection,
  payer: PublicKey,
  amount: number,  // in SOL
  deadline: number,  // unix timestamp in seconds
  customSeed?: Uint8Array
): Promise<{ transaction: Transaction, bountyPda: PublicKey, vaultPda: PublicKey }> {
  // Calculate amount in lamports
  const amountLamports = solToLamports(amount);
  
  // Use current timestamp as seed
  const seed = customSeed || new Uint8Array(Buffer.from(Date.now().toString()));
  
  // Verify seed length is within Solana limits (max 32 bytes)
  if (seed.length > 32) {
    throw new Error(`Max seed length exceeded: ${seed.length} bytes. Max allowed is 32 bytes.`);
  }
  
  // Derive PDAs for bounty and vault accounts
  const seeds = [
    Buffer.from("bounty"),
    payer.toBuffer(),
    Buffer.from(seed)
  ];
  
  // Derive the PDA directly with findProgramAddress
  const [bountyPda, _bountyBump] = PublicKey.findProgramAddressSync(seeds, programId);
  const [vaultPda, _vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), bountyPda.toBuffer()],
    programId
  );
  
  console.log("Using seed for bounty:", Buffer.from(seed).toString());
  console.log("Derived bounty PDA:", bountyPda.toString());
  console.log("Derived vault PDA:", vaultPda.toString());
  
  // Create instruction data buffer
  const data = Buffer.alloc(1000); // allocate enough space
  const instructionData = {
    variant: InstructionVariant.CreateBounty,
    amount: new BN(amountLamports),
    deadline: new BN(deadline),
    custom_seed: seed,
  };
  
  const length = createBountyLayout.encode(instructionData, data);
  const instructionBuffer = data.slice(0, length);
  
  // Create the transaction instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: bountyPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data: instructionBuffer,
  });
  
  // Create and return transaction
  const transaction = new Transaction().add(instruction);
  return { transaction, bountyPda, vaultPda };
}

/**
 * Submit work for a bounty
 */
export async function submitWork(
  connection: Connection,
  submitter: PublicKey,
  bountyPda: PublicKey,
  submissionUrl: string
): Promise<Transaction> {
  // Create instruction data buffer
  const data = Buffer.alloc(1000); // allocate enough space
  const instructionData = {
    variant: InstructionVariant.SubmitWork,
    submission_url: submissionUrl,
  };
  
  const length = submitWorkLayout.encode(instructionData, data);
  const instructionBuffer = data.slice(0, length);
  
  // Create the transaction instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: submitter, isSigner: true, isWritable: false },
      { pubkey: bountyPda, isSigner: false, isWritable: true },
    ],
    programId,
    data: instructionBuffer,
  });
  
  // Create and return transaction
  return new Transaction().add(instruction);
}

/**
 * Creates a transaction for approving a submission
 */
export async function approveSubmission(
  connection: Connection,
  creator: PublicKey,
  bountyPda: PublicKey,
  hunter: string | PublicKey
): Promise<Transaction> {
  try {
    console.log("=== CREATING APPROVE SUBMISSION TRANSACTION ===");
    
    // Convert hunter string to PublicKey if needed
    const hunterPubkey = typeof hunter === 'string' ? new PublicKey(hunter) : hunter;
    
    // Log the key parameters
    console.log(`Creator: ${creator.toString()}`);
    console.log(`Bounty PDA: ${bountyPda.toString()}`);
    console.log(`Hunter: ${hunterPubkey.toString()}`);
    
    // Verify PDA derivation to ensure it matches the program's expectations
    console.log("Verifying PDA derivation...");
    
    // Try to recover the original seed used to create this bounty
    // This is a best-effort attempt since we don't know the exact seed that was used
    try {
      // Fetch the bounty account from Firebase to check if original seed was saved
      console.log("Looking for bounty creation details...");
    
      // If you can't find original seed, you can try possible seed patterns
      // For example, seeds using timestamp-based patterns
      let possibleSeeds = [
        Buffer.from("bounty"),
      ];
    
      console.log("Testing some common seed patterns:");
      let seedsFound = false;
      
      // Iterate through Firebase or other sources to find matching seeds
      // This is just a placeholder for actual implementation
      
      if (!seedsFound) {
        console.log("WARNING: Could not verify PDA derivation - original seed unknown");
      }
    } catch (pdaErr) {
      console.error("Error verifying PDA:", pdaErr);
    }
    
    // Fetch the bounty account to validate it
    console.log("Fetching bounty account...");
    const bountyAccount = await connection.getAccountInfo(bountyPda);
    if (!bountyAccount) {
      throw new Error(`Bounty account ${bountyPda.toString()} not found`);
    }
    console.log("Bounty account found, data length:", bountyAccount.data.length);
    
    // Check if account is owned by our program
    if (bountyAccount.owner.toString() !== programId.toString()) {
      console.error(`Account owner mismatch: ${bountyAccount.owner.toString()} vs expected ${programId.toString()}`);
      throw new Error(`Bounty account is not owned by our program`);
    }
    
    // Check if account has enough data for at least the minimum expected structure
    if (bountyAccount.data.length < 80) { // Minimum expected size, adjust as needed
      console.error(`Account data too small: ${bountyAccount.data.length} bytes`);
      throw new Error("Account data is too small to be a valid bounty account");
    }
    
    // Log raw account data in chunks for debugging
    console.log("Raw account data (hex):", Buffer.from(bountyAccount.data).toString('hex'));
    
    // Try to manually parse critical fields from account data
    try {
      // This is a simplified attempt to parse the raw data
      // Adjust offsets based on your exact account structure
      
      // Read creator public key (first 32 bytes of the account data)
      const creatorPubkeyBytes = bountyAccount.data.slice(0, 32);
      const parsedCreator = new PublicKey(creatorPubkeyBytes);
      console.log("Parsed creator from account data:", parsedCreator.toString());
      
      // Read hunter option flag (1 byte after creator)
      const hasHunter = bountyAccount.data[32] === 1;
      console.log("Has hunter assigned:", hasHunter);
      
      // If hunter is present, read hunter public key (next 32 bytes)
      if (hasHunter) {
        const hunterPubkeyBytes = bountyAccount.data.slice(33, 65);
        const parsedHunter = new PublicKey(hunterPubkeyBytes);
        console.log("Parsed hunter from account data:", parsedHunter.toString());
      }
      
      // Read status (should be at a specific offset depending on account structure)
      // This is an approximation - adjust based on your exact account layout
      const statusOffset = 73; // Example offset, adjust based on your struct
      const status = bountyAccount.data[statusOffset];
      console.log("Parsed status from account data:", status);
      
      // Check if the account is initialized
      const initializedOffset = 74; // Example offset, adjust based on your struct
      const initialized = bountyAccount.data[initializedOffset] === 1;
      console.log("Account initialized:", initialized);
      
      if (!initialized) {
        throw new Error("Bounty account is not initialized");
      }
    } catch (parseErr) {
      console.warn("Error parsing account data manually:", parseErr);
      console.warn("This might be due to account structure mismatch");
    }
    
    // Step 1: Create the instruction data
    // The data needs to match the BountyInstruction::ApproveSubmission { hunter } struct
    // in the Rust program - which expects Borsh serialization
    
    // Create a buffer for the instruction data
    // 1 byte for the variant + 32 bytes for the hunter's pubkey
    const dataBuffer = Buffer.alloc(33);
    
    // Write the instruction variant (2 for ApproveSubmission)
    dataBuffer.writeUInt8(InstructionVariant.ApproveSubmission, 0);
    
    // Write the hunter's pubkey
    const hunterBytes = hunterPubkey.toBuffer();
    hunterBytes.copy(dataBuffer, 1);
    
    console.log(`Instruction data length: ${dataBuffer.length} bytes`);
    console.log(`Hex instruction data: ${dataBuffer.toString('hex')}`);
    
    // Step 2: Set up the accounts exactly as expected by the program
    // The Rust code accesses these accounts in this EXACT order:
    const accounts = [
      { pubkey: creator, isSigner: true, isWritable: true },      // Creator (signer)
      { pubkey: bountyPda, isSigner: false, isWritable: true },   // Bounty account
      { pubkey: hunterPubkey, isSigner: false, isWritable: false } // Hunter account
    ];
    
    console.log("Accounts:");
    accounts.forEach((acct, i) => {
      console.log(`  ${i}: ${acct.pubkey.toString()}`);
    });
    
    // Step 3: Create the transaction instruction
    const instruction = new TransactionInstruction({
      programId,
      keys: accounts,
      data: dataBuffer
    });
    
    // Step 4: Create the transaction and add the instruction
    const transaction = new Transaction();
    transaction.add(instruction);
    transaction.feePayer = creator;
    
    // Step 5: Get and set a recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    
    // Simulate the transaction to catch any errors
    try {
      console.log("Simulating transaction...");
      const simulation = await connection.simulateTransaction(transaction);
      if (simulation.value.err) {
        console.error("Simulation failed:", simulation.value.err);
        console.error("Simulation logs:", simulation.value.logs);
        
        // Extract more detailed error information if available
        if (simulation.value.logs && simulation.value.logs.length > 0) {
          // Look for program log messages that might have more details
          for (const log of simulation.value.logs) {
            if (log.includes("Program log:")) {
              console.error("Program log message:", log);
            }
          }
        }
        
        // Check if it's a specific type of error
        if (JSON.stringify(simulation.value.err).includes("BorshIoError")) {
          console.error("DETECTED BORSH SERIALIZATION ERROR:");
          console.error("This usually means the account data structure doesn't match what the program expects");
          console.error("Possible causes:");
          console.error("1. Program was updated with a new account structure");
          console.error("2. Account was created with old version of the program");
          console.error("3. Accounts need to be migrated to the new structure");
        }
        
        throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }
      console.log("Simulation successful");
    } catch (err) {
      console.error("Error simulating transaction:", err);
      throw err;
    }
    
    console.log("=== APPROVE SUBMISSION TRANSACTION CREATED ===");
    return transaction;
  } catch (error) {
    console.error('Error creating ApproveSubmission transaction:', error);
    throw error;
  }
}

/**
 * Claim bounty reward after approval
 */
export async function claimBounty(
  connection: Connection,
  hunter: PublicKey,
  bountyPda: PublicKey
): Promise<Transaction> {
  // Derive vault PDA
  const [vaultPda, _vaultBump] = await deriveVaultPDA(bountyPda);
  
  // Create instruction data buffer
  const data = Buffer.alloc(10); // small buffer is enough
  const instructionData = {
    variant: InstructionVariant.ClaimBounty,
  };
  
  const length = claimBountyLayout.encode(instructionData, data);
  const instructionBuffer = data.slice(0, length);
  
  // Create the transaction instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: hunter, isSigner: true, isWritable: true },
      { pubkey: bountyPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data: instructionBuffer,
  });
  
  // Create and return transaction
  return new Transaction().add(instruction);
}

/**
 * Cancel a bounty and return funds to creator
 */
export async function cancelBounty(
  connection: Connection,
  creator: PublicKey,
  bountyPda: PublicKey
): Promise<Transaction> {
  // Derive vault PDA
  const [vaultPda, _vaultBump] = await deriveVaultPDA(bountyPda);
  
  // Create instruction data buffer
  const data = Buffer.alloc(10); // small buffer is enough
  const instructionData = {
    variant: InstructionVariant.CancelBounty,
  };
  
  const length = cancelBountyLayout.encode(instructionData, data);
  const instructionBuffer = data.slice(0, length);
  
  // Create the transaction instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: bountyPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data: instructionBuffer,
  });
  
  // Create and return transaction
  return new Transaction().add(instruction);
}

// Re-export solToLamports from config
export { solToLamports } from './config';

/**
 * Creates a transaction for initializing a bounty with a specific amount and deadline
 */
export async function createInitializeBountyTransaction(
  amount: number,
  ownerAddress: string,
  deadline: number,
  bountyAddress: string
): Promise<Transaction> {
  const ownerPublicKey = new PublicKey(ownerAddress);
  
  console.log("Creating bounty transaction for owner:", ownerAddress);
  console.log("Amount (lamports):", amount);
  console.log("Deadline:", new Date(deadline * 1000).toISOString());
  
  // Get the Solana connection - uses the connection with disabled WebSockets
  const connection = getSolanaConnection();
  
  // Create a deterministic custom seed
  const customSeed = Buffer.from("custom_seed_" + Date.now().toString());
  console.log("Using custom seed:", customSeed.toString());
  
  // Explicitly derive the PDA with our custom seed
  const seeds = [
    Buffer.from("bounty"),
    ownerPublicKey.toBuffer(),
    customSeed
  ];
  
  const [bountyPda, _bountyBump] = PublicKey.findProgramAddressSync(seeds, programId);
  console.log("Derived bounty PDA with custom seed:", bountyPda.toString());
  
  // Derive vault PDA
  const [vaultPda, _vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), bountyPda.toBuffer()],
    programId
  );
  
  // Create instruction data with our custom seed
  const dataBuffer = Buffer.alloc(1000);
  const instructionData = {
    variant: InstructionVariant.CreateBounty,
    amount: new BN(amount),
    deadline: new BN(deadline),
    custom_seed: customSeed,  // Use our custom seed
  };
  
  const length = createBountyLayout.encode(instructionData, dataBuffer);
  const instructionBuffer = dataBuffer.slice(0, length);
  
  // Create the transaction instruction with our derived bounty PDA
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: ownerPublicKey, isSigner: true, isWritable: true },
      { pubkey: bountyPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data: instructionBuffer,
  });
  
  // Create the transaction
  const transaction = new Transaction().add(instruction);
  
  // Get and set recent blockhash for the transaction
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  
  // Set the fee payer
  transaction.feePayer = ownerPublicKey;
  
  return transaction;
}

/**
 * Confirm a transaction using HTTP polling instead of WebSockets
 */
export async function confirmTransaction(
  connection: Connection,
  signature: string,
  timeout = 60000
): Promise<boolean> {
  console.log(`Confirming transaction ${signature} using HTTP polling...`);
  
  const startTime = Date.now();
  let attempts = 0;
  
  // Poll until timeout with exponential backoff
  while (Date.now() - startTime < timeout) {
    attempts++;
    try {
      // Get the transaction status
      const status = await connection.getSignatureStatus(signature);
      
      // Log each polling attempt
      console.log(`Polling attempt ${attempts}: Status = ${status?.value?.confirmationStatus || 'not found'}`);
      
      if (!status || !status.value) {
        // If we couldn't find the transaction after multiple attempts, it might have failed
        if (attempts > 10) {
          console.warn(`Transaction ${signature} not found after ${attempts} attempts`);
        }
        
        // Wait with exponential backoff (up to 5 seconds max)
        const backoff = Math.min(1000 * Math.pow(1.5, attempts - 1), 5000);
        console.log(`Waiting ${backoff}ms before retrying...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      
      // Check if transaction failed
      if (status.value.err) {
        console.error('Transaction failed:', status.value.err);
        // Return the full error details for debugging
        console.error('Full error details:', JSON.stringify(status.value.err, null, 2));
        return false;
      }
      
      // Check if confirmed or finalized
      if (
        status.value.confirmationStatus === 'confirmed' ||
        status.value.confirmationStatus === 'finalized'
      ) {
        console.log(`Transaction ${signature} confirmed with status: ${status.value.confirmationStatus}`);
        console.log(`Confirmation took ${(Date.now() - startTime) / 1000} seconds and ${attempts} attempts`);
        return true;
      }
      
      // Wait with exponential backoff (up to 5 seconds max)
      const backoff = Math.min(1000 * Math.pow(1.5, attempts - 1), 5000);
      console.log(`Waiting ${backoff}ms before retrying...`);
      await new Promise(resolve => setTimeout(resolve, backoff));
    } catch (error) {
      console.warn('Error checking transaction status:', error);
      
      // Wait with exponential backoff before retrying
      const backoff = Math.min(1000 * Math.pow(1.5, attempts - 1), 5000);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
  
  console.error(`Transaction confirmation timed out after ${timeout / 1000} seconds and ${attempts} attempts`);
  return false;
} 