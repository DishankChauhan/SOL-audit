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
 * Approve a hunter's submission
 */
export async function approveSubmission(
  connection: Connection,
  creator: PublicKey,
  bountyPda: PublicKey,
  hunter: PublicKey
): Promise<Transaction> {
  // Create instruction data buffer
  const data = Buffer.alloc(100); // allocate enough space
  const instructionData = {
    variant: InstructionVariant.ApproveSubmission,
    hunter,
  };
  
  const length = approveSubmissionLayout.encode(instructionData, data);
  const instructionBuffer = data.slice(0, length);
  
  // Create the transaction instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: creator, isSigner: true, isWritable: false },
      { pubkey: bountyPda, isSigner: false, isWritable: true },
      { pubkey: hunter, isSigner: false, isWritable: false },
    ],
    programId,
    data: instructionBuffer,
  });
  
  // Create and return transaction
  return new Transaction().add(instruction);
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