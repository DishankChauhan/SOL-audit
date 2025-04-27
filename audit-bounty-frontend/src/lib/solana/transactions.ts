import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  sendAndConfirmTransaction,
  Keypair
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
    // Validate input parameters
    if (!creator) {
      throw new Error('Creator public key is missing or undefined');
    }
    
    if (!bountyPda) {
      throw new Error('Bounty PDA is missing or undefined');
    }
    
    if (!hunter) {
      throw new Error('Hunter public key is missing or undefined');
    }
    
    // Convert hunter to PublicKey if it's a string
    let hunterPubkey: PublicKey;
    try {
      hunterPubkey = typeof hunter === 'string' ? new PublicKey(hunter) : hunter;
      console.log(`Creating approveSubmission transaction with hunter: ${hunterPubkey.toString()}`);
    } catch (err) {
      console.error('Failed to create PublicKey from hunter:', hunter);
      throw new Error(`Invalid hunter public key: ${typeof hunter === 'string' ? hunter : 'object'}`);
    }

    // Get accounts involved
    const systemProgram = SystemProgram.programId;

    console.log(`Program ID: ${programId.toString()}`);
    console.log(`Bounty PDA: ${bountyPda.toString()}`);
    console.log(`Hunter: ${hunterPubkey.toString()}`);

    // Create instruction data directly rather than using Borsh
    // This avoids BN.js issues when encoding the PublicKey
    const instructionData = Buffer.alloc(33); // 1 byte for variant + 32 bytes for PublicKey
    
    // Set variant to ApproveSubmission (2) - using the correct enum value
    instructionData.writeUInt8(InstructionVariant.ApproveSubmission, 0);
    
    // Copy hunter pubkey bytes to the buffer
    const hunterBuffer = hunterPubkey.toBuffer();
    if (hunterBuffer.length !== 32) {
      throw new Error(`Invalid hunter public key buffer length: ${hunterBuffer.length}`);
    }
    hunterBuffer.copy(instructionData, 1);
    
    console.log(`Created instruction data buffer with length: ${instructionData.length}`);
    console.log(`Instruction variant: ${instructionData[0]}`);

    const instruction = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: creator, isSigner: true, isWritable: true },
        { pubkey: bountyPda, isSigner: false, isWritable: true },
        { pubkey: hunterPubkey, isSigner: false, isWritable: false }, // Add hunter account as non-signer
        { pubkey: systemProgram, isSigner: false, isWritable: false },
      ],
      data: instructionData,
    });

    console.log("Transaction instruction created successfully");

    const transaction = new Transaction().add(instruction);
    transaction.feePayer = creator;

    // Get the latest blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;

    return transaction;
  } catch (error: unknown) {
    console.error('Error creating approve submission transaction:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create approve submission transaction: ${errorMessage}`);
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
  
  // Poll until timeout
  while (Date.now() - startTime < timeout) {
    try {
      const status = await connection.getSignatureStatus(signature);
      
      if (!status || !status.value) {
        // Transaction not found yet, wait and retry
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      // Check if transaction failed
      if (status.value.err) {
        console.error('Transaction failed:', status.value.err);
        return false;
      }
      
      // Check if confirmed or finalized
      if (
        status.value.confirmationStatus === 'confirmed' ||
        status.value.confirmationStatus === 'finalized'
      ) {
        console.log(`Transaction ${signature} confirmed with status: ${status.value.confirmationStatus}`);
        return true;
      }
      
      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.warn('Error checking transaction status:', error);
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.error(`Transaction confirmation timed out after ${timeout}ms`);
  return false;
} 