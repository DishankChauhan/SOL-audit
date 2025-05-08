import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { ENV } from '../lib/env';
import * as borsh from '@project-serum/borsh';
import { BN } from 'bn.js';
import { getCluster } from '@/lib/solana/config';

// Program ID from environment
const PROGRAM_ID = new PublicKey(ENV.PROGRAM_ID);

// Define instruction variants as they are in the Rust program
enum InstructionVariant {
  CreateBounty = 0,
  SubmitWork = 1,
  ApproveSubmission = 2,
  ClaimBounty = 3,
  CancelBounty = 4,
  CancelBountyEmergency = 5,
  RecordSubmission = 6,
  VoteOnSubmission = 7,
  SelectWinner = 8,
  FinalizeAndDistributeRemaining = 9,
}

// Borsh schema layouts for each instruction
const createBountyLayout = borsh.struct([
  borsh.u8('variant'),
  borsh.u64('amount'),
  borsh.i64('deadline'),
  borsh.option(borsh.vec(borsh.u8()), 'custom_seed'),
  borsh.option(borsh.u8(), 'winners_count'),
]);

const submitWorkLayout = borsh.struct([
  borsh.u8('variant'),
  borsh.str('submission_url'),
]);

// Important: Enum implementation is critical for Borsh
// In Rust, the RecordSubmission variant is part of BountyInstruction enum

// First, define the RecordSubmission struct for the RecordSubmission variant
const RecordSubmissionArgs = borsh.struct([
  borsh.str('submission_id'),       // String - Unique ID for the submission
  borsh.u8('severity'),             // u8 - Severity rating (1-5)
  borsh.str('description'),         // String - Brief description
  borsh.str('ipfs_hash'),           // String - IPFS hash for detailed report
]);

// Define a manual encoding approach for better control
const encodeRecordSubmissionInstruction = (
  submissionId: string,
  severity: number,
  description: string,
  ipfsHash: string
): Buffer => {
  // Create a buffer with enough space
  const bufferSize = 1000; // Plenty of space
  const buffer = Buffer.alloc(bufferSize);

  // First byte is the variant index (6 for RecordSubmission)
  buffer[0] = InstructionVariant.RecordSubmission;
  
  // The rest is the struct encoded with Borsh
  const argsBuffer = Buffer.alloc(bufferSize - 1);
  const argsLength = RecordSubmissionArgs.encode(
    {
      submission_id: submissionId,
      severity: severity,
      description: description,
      ipfs_hash: ipfsHash,
    },
    argsBuffer
  );
  
  // Copy the encoded args after the variant byte
  argsBuffer.copy(buffer, 1, 0, argsLength);
  
  // Return the combined buffer with correct length
  return Buffer.from(buffer.subarray(0, argsLength + 1));
};

const voteOnSubmissionLayout = borsh.struct([
  borsh.u8('variant'),
  borsh.str('submission_id'),
  borsh.bool('is_upvote'),
]);

const selectWinnerLayout = borsh.struct([
  borsh.u8('variant'),
  borsh.str('submission_id'),
  borsh.u64('payout_amount'),
]);

// Add the ApproveSubmission layout
const approveSubmissionLayout = borsh.struct([
  borsh.u8('variant'),
  borsh.publicKey('hunter'),
  borsh.str('submission_id'),
]);

// Helper function to convert SOL to lamports
export function solToLamports(sol: number): number {
  return Math.floor(sol * 1000000000);
}

/**
 * Connect to Solana network
 */
export function getSolanaConnection(): Connection {
  return new Connection(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'http://localhost:8899',
    'confirmed'
  );
}

/**
 * Derive the bounty PDA address
 */
export async function deriveBountyPDA(
  creator: PublicKey,
  seed: Buffer | Uint8Array,
  log: boolean = false
): Promise<[PublicKey, number]> {
  const seeds = [
    Buffer.from('bounty'),
    creator.toBuffer(),
    Buffer.from(seed)
  ];
  
  const [pda, bump] = await PublicKey.findProgramAddress(seeds, PROGRAM_ID);
  
  if (log) {
    console.log(`Derived bounty PDA: ${pda.toBase58()}`);
    console.log(`Seed used: ${Buffer.from(seed).toString('hex')}`);
    console.log(`Creator: ${creator.toBase58()}`);
  }
  
  return [pda, bump];
}

/**
 * Derive the vault PDA address
 */
export async function deriveVaultPDA(
  bountyPda: PublicKey,
  log: boolean = false
): Promise<[PublicKey, number]> {
  const seeds = [
    Buffer.from('vault'),
    bountyPda.toBuffer()
  ];
  
  const [pda, bump] = await PublicKey.findProgramAddress(seeds, PROGRAM_ID);
  
  if (log) {
    console.log(`Derived vault PDA: ${pda.toBase58()}`);
  }
  
  return [pda, bump];
}

/**
 * Derive the submission PDA address
 */
export async function deriveSubmissionPDA(
  bountyPda: PublicKey,
  submitter: PublicKey,
  submissionId: string,
  log: boolean = false
): Promise<[PublicKey, number]> {
  // Match the exact seed structure from the Rust program (processor.rs:804)
  const submissionSeed = [
    Buffer.from('submission'),
    bountyPda.toBuffer(),
    submitter.toBuffer(),
    Buffer.from(submissionId)
  ];
  
  const [pda, bump] = await PublicKey.findProgramAddress(submissionSeed, PROGRAM_ID);
  
  if (log) {
    console.log(`Derived submission PDA: ${pda.toBase58()}`);
    console.log(`Using seeds: 'submission', ${bountyPda.toBase58()}, ${submitter.toBase58()}, "${submissionId}"`);
  }
  
  return [pda, bump];
}

/**
 * Derive the vote PDA address
 */
export async function deriveVotePDA(
  submissionPda: PublicKey,
  voter: PublicKey,
  log: boolean = false
): Promise<[PublicKey, number]> {
  const seeds = [
    Buffer.from('vote'),
    submissionPda.toBuffer(),
    voter.toBuffer()
  ];
  
  const [pda, bump] = await PublicKey.findProgramAddress(seeds, PROGRAM_ID);
  
  if (log) {
    console.log(`Derived vote PDA: ${pda.toBase58()}`);
  }
  
  return [pda, bump];
}

/**
 * Create a transaction for initializing a new bounty
 */
export async function createBountyTransaction(
  payer: PublicKey,
  amount: number,  // in SOL
  deadline: number,  // unix timestamp in seconds
  winnersCount: number = 1,
  customSeed?: Uint8Array
): Promise<{ transaction: Transaction, bountyPda: PublicKey, vaultPda: PublicKey }> {
  // Calculate amount in lamports
  const amountLamports = solToLamports(amount);
  
  // Use a simple seed for consistency 
  const seed = customSeed || Buffer.from("bounty_" + Date.now().toString());
  
  // Derive PDAs for bounty and vault accounts
  const [bountyPda, bountyBump] = await deriveBountyPDA(payer, seed, true);
  const [vaultPda, vaultBump] = await deriveVaultPDA(bountyPda, true);
  
  console.log("Creating bounty transaction:");
  console.log(`- Payer: ${payer.toBase58()}`);
  console.log(`- Amount: ${amount} SOL (${amountLamports} lamports)`);
  console.log(`- Deadline: ${new Date(deadline * 1000).toISOString()}`);
  console.log(`- Bounty PDA: ${bountyPda.toBase58()}`);
  console.log(`- Vault PDA: ${vaultPda.toBase58()}`);
  
  // Serialize the instruction data with a much larger buffer for safety
  const data = Buffer.alloc(1000); // Use a larger buffer size to ensure we have enough space
  let length;
  try {
    length = createBountyLayout.encode(
      {
        variant: InstructionVariant.CreateBounty,
        amount: new BN(amountLamports),
        deadline: new BN(deadline),
        custom_seed: seed ? Array.from(seed) : null,
        winners_count: winnersCount, 
      },
      data
    );
    console.log(`CreateBounty encoded data length: ${length} bytes`);
  } catch (err) {
    console.error('Error encoding CreateBounty data:', err);
    throw err;
  }
  
  // Create the instruction - use sliced data to only include the actual encoded bytes
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: bountyPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: data.slice(0, length),
  });
  
  // Create the transaction
  const transaction = new Transaction().add(instruction);
  
  return { transaction, bountyPda, vaultPda };
}

/**
 * Create a transaction for submitting work to a bounty
 */
export async function submitWorkTransaction(
  submitter: PublicKey,
  bountyPda: PublicKey,
  submissionUrl: string
): Promise<Transaction> {
  console.log(`Submitting work transaction for bounty: ${bountyPda.toBase58()}`);
  console.log(`Submission URL: ${submissionUrl}`);
  
  // Serialize the instruction data
  const data = Buffer.alloc(submitWorkLayout.span);
  submitWorkLayout.encode(
    {
      variant: InstructionVariant.SubmitWork,
      submission_url: submissionUrl,
    },
    data
  );
  
  // Create the instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: submitter, isSigner: true, isWritable: true },
      { pubkey: bountyPda, isSigner: false, isWritable: true },
    ],
    programId: PROGRAM_ID,
    data,
  });
  
  // Create the transaction
  const transaction = new Transaction().add(instruction);
  
  return transaction;
}

/**
 * Create a transaction for recording a submission with IPFS hash and severity
 */
export async function recordSubmissionTransaction(
  submitter: PublicKey,
  bountyPda: PublicKey,
  submissionId: string,
  severity: number,
  description: string,
  ipfsHash: string
): Promise<{ transaction: Transaction, submissionPda: PublicKey }> {
  if (!submitter || !bountyPda) {
    throw new Error('Invalid submitter or bounty PDA');
  }
  console.log(`Recording submission for bounty: ${bountyPda.toBase58()}`);
  console.log(`Submission ID: ${submissionId}`);
  console.log(`Severity: ${severity}`);
  console.log(`IPFS Hash: ${ipfsHash}`);
  
  // Validate severity (1-5)
  if (severity < 1 || severity > 5) {
    throw new Error('Severity must be between 1 and 5');
  }
  
  // Derive submission PDA
  const [submissionPda, submissionBump] = await deriveSubmissionPDA(
    bountyPda,
    submitter,
    submissionId,
    true
  );
  
  // Generate the instruction data using our custom encoder
  let instructionData: Buffer;
  try {
    console.log('Encoding RecordSubmission instruction...');
    instructionData = encodeRecordSubmissionInstruction(
      submissionId,
      severity,
      description,
      ipfsHash
    );
    
    console.log(`Encoded instruction data length: ${instructionData.length} bytes`);
    console.log('First 10 bytes:', Array.from(instructionData.subarray(0, 10)));
  } catch (err) {
    console.error('Error encoding instruction data:', err);
    throw err;
  }
  
  // Get the account size for the submission 
  // This is critical - this account will store the submission data
  const submissionSize = calculateSubmissionSize(
    submissionId,
    description,
    ipfsHash
  );
  
  console.log(`Calculated submission account size: ${submissionSize} bytes`);
  
  // Get the connection to calculate minimum rent
  const connection = getSolanaConnection();
  const rentExemptionAmount = await connection.getMinimumBalanceForRentExemption(submissionSize);
  
  console.log(`Rent exemption amount: ${rentExemptionAmount} lamports`);
  
  // First, check if the submission account already exists
  let submissionAccountExists = false;
  try {
    const submissionAccountInfo = await connection.getAccountInfo(submissionPda);
    submissionAccountExists = submissionAccountInfo !== null;
    console.log(`Submission account exists: ${submissionAccountExists}`);
  } catch (error) {
    console.error("Error checking submission account:", error);
  }
  
  // Create the transaction
  const transaction = new Transaction();
  
  // Add a compute budget instruction to increase the compute limit for complex transactions
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: 300000 // Increase compute units
    })
  );
  
  // Add the RecordSubmission instruction
  const recordSubmissionInstruction = new TransactionInstruction({
    keys: [
      { pubkey: submitter, isSigner: true, isWritable: true },
      { pubkey: bountyPda, isSigner: false, isWritable: false },
      { pubkey: submissionPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: instructionData,
  });
  
  // Add instruction to transaction
  try {
    transaction.add(recordSubmissionInstruction);
    console.log("Instructions added to transaction successfully");
  } catch (e) {
    const error = e as Error;
    console.error("Error adding instructions to transaction:", error);
    throw new Error(`Failed to create transaction: ${error.message}`);
  }
  
  console.log("Transaction created and validated successfully");
  console.log("Submission PDA:", submissionPda.toBase58());
  
  return { transaction, submissionPda };
}

// Helper function to calculate the size needed for a submission account
function calculateSubmissionSize(
  submissionId: string,
  description: string,
  ipfsHash: string
): number {
  // Based on the Rust struct Submission in state.rs
  const pubkeySize = 32; // Size of a Pubkey
  const stringOverhead = 4; // Size for length prefix of a string
  const boolSize = 1;
  const numberSize = 8; // u64/i64 size
  
  // Calculate the size
  return (
    stringOverhead + submissionId.length + // id: String
    pubkeySize + // bounty_id: Pubkey
    pubkeySize + // auditor: Pubkey
    stringOverhead + description.length + // description: String
    stringOverhead + ipfsHash.length + // ipfs_hash: String
    1 + // severity: u8
    numberSize + // upvotes: u64
    numberSize + // downvotes: u64
    1 + // status: SubmissionStatus
    (1 + numberSize) + // payout_amount: Option<u64>
    boolSize + // is_winner: bool
    numberSize + // created_at: i64
    32 // Add some padding for safety
  );
}

/**
 * Create a transaction for voting on a submission
 */
export async function voteOnSubmissionTransaction(
  voter: PublicKey,
  bountyPda: PublicKey,
  submissionPda: PublicKey,
  submissionId: string,
  isUpvote: boolean
): Promise<{ transaction: Transaction, votePda: PublicKey }> {
  console.log(`Voting on submission: ${submissionPda.toBase58()}`);
  console.log(`Vote type: ${isUpvote ? 'Upvote' : 'Downvote'}`);
  
  // Derive vote PDA
  const [votePda, voteBump] = await deriveVotePDA(
    submissionPda,
    voter,
    true
  );
  
  // Serialize the instruction data
  const data = Buffer.alloc(voteOnSubmissionLayout.span);
  voteOnSubmissionLayout.encode(
    {
      variant: InstructionVariant.VoteOnSubmission,
      submission_id: submissionId,
      is_upvote: isUpvote,
    },
    data
  );
  
  // Create the instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: voter, isSigner: true, isWritable: true },
      { pubkey: bountyPda, isSigner: false, isWritable: false },
      { pubkey: submissionPda, isSigner: false, isWritable: true },
      { pubkey: votePda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });
  
  // Create the transaction
  const transaction = new Transaction().add(instruction);
  
  return { transaction, votePda };
}

/**
 * Create a transaction for selecting a winner
 */
export async function selectWinnerTransaction(
  creator: PublicKey,
  bountyPda: PublicKey,
  submissionPda: PublicKey,
  submissionId: string,
  payoutAmount: number // in SOL
): Promise<Transaction> {
  console.log(`Selecting winner for bounty: ${bountyPda.toBase58()}`);
  console.log(`Submission: ${submissionPda.toBase58()}`);
  console.log(`Submission ID: ${submissionId}`);
  console.log(`Payout amount: ${payoutAmount} SOL`);
  
  // Convert SOL to lamports
  const payoutLamports = solToLamports(payoutAmount);
  
  // Serialize the instruction data
  const data = Buffer.alloc(selectWinnerLayout.span);
  selectWinnerLayout.encode(
    {
      variant: InstructionVariant.SelectWinner,
      submission_id: submissionId,
      payout_amount: new BN(payoutLamports),
    },
    data
  );
  
  // Create the instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: bountyPda, isSigner: false, isWritable: true },
      { pubkey: submissionPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });
  
  // Create the transaction
  const transaction = new Transaction().add(instruction);
  
  return transaction;
}

/**
 * Initialize a bounty using the wallet adapter
 */
export async function initializeBounty(
  wallet: WalletContextState,
  bountyData: {
    title: string;
    description: string;
    repoUrl: string;
    amount: number;
    deadline: Date;
    tags: string[];
    severityWeights?: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      informational?: number;
    };
    skipFirebaseCreation?: boolean;
  }
): Promise<{ txSignature: string; bountyAddress: string }> {
  try {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected or does not support signing');
    }

    // Convert deadline to Unix timestamp
    const deadlineTimestamp = Math.floor(bountyData.deadline.getTime() / 1000);

    // Create the transaction
    const { transaction, bountyPda } = await createBountyTransaction(
      wallet.publicKey,
      bountyData.amount,
      deadlineTimestamp
    );

    // Set recent blockhash and fee payer
    const connection = getSolanaConnection();
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = wallet.publicKey;

    // Sign the transaction
    const signedTx = await wallet.signTransaction(transaction);

    // Send the transaction
    const txSignature = await connection.sendRawTransaction(signedTx.serialize());
    console.log(`Transaction sent: ${txSignature}`);

    // Wait for confirmation
    await connection.confirmTransaction(txSignature);
    console.log(`Transaction confirmed: ${txSignature}`);

    // Store the bounty metadata in Firebase only if we're not skipping it
    if (!bountyData.skipFirebaseCreation) {
      try {
        const response = await fetch('/api/bounty/metadata', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            bountyAddress: bountyPda.toBase58(),
            title: bountyData.title,
            description: bountyData.description,
            repoUrl: bountyData.repoUrl,
            amount: bountyData.amount,
            deadline: deadlineTimestamp,
            createdBy: wallet.publicKey.toBase58(),
            tags: bountyData.tags,
          }),
        });

        if (!response.ok) {
          console.error('Failed to store bounty metadata:', await response.text());
        }
      } catch (metadataError) {
        console.error('Error storing metadata (continuing anyway):', metadataError);
        // We'll continue even if metadata storage fails
      }
    } else {
      console.log('Skipping Firebase metadata creation as requested');
    }

    return {
      txSignature,
      bountyAddress: bountyPda.toBase58(),
    };
  } catch (error) {
    console.error('Error initializing bounty:', error);
    throw error;
  }
}

/**
 * Submit a work to a bounty
 */
export async function submitAuditWork(
  wallet: WalletContextState,
  bountyAddress: string,
  submissionData: {
    description: string;
    ipfsHash: string;
    severity: number;
  }
): Promise<{ txSignature: string; submissionAddress: string }> {
  try {
    console.log("Starting submitAuditWork with data:", submissionData);
    
    // Run serialization test to check if borsh encoding works properly
    testRecordSubmissionSerialization();
    
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected or does not support signing');
    }
    
    // Validate severity constraints - must be 1-5 as per contract
    if (submissionData.severity < 1 || submissionData.severity > 5) {
      throw new Error('Severity must be between 1 and 5');
    }

    const bountyPda = new PublicKey(bountyAddress);
    const submissionId = `submission_${Date.now()}`;

    // Create the transaction for recording submission with IPFS hash
    let submissionResult;
    try {
      submissionResult = await recordSubmissionTransaction(
        wallet.publicKey,
        bountyPda,
        submissionId,
        submissionData.severity,
        submissionData.description,
        submissionData.ipfsHash
      );
    } catch (error) {
      console.error("Error creating record submission transaction:", error);
      throw new Error(`Failed to create submission transaction: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!submissionResult || !submissionResult.transaction) {
      throw new Error("Failed to create submission transaction - transaction object is null or undefined");
    }

    const { transaction, submissionPda } = submissionResult;
    console.log("Transaction created successfully, submission PDA:", submissionPda.toBase58());

    // Set recent blockhash and fee payer
    const connection = getSolanaConnection();
    try {
      const recentBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = recentBlockhash.blockhash;
      transaction.feePayer = wallet.publicKey;
      console.log("Set transaction blockhash:", recentBlockhash.blockhash);
    } catch (error) {
      console.error("Error getting blockhash:", error);
      throw new Error(`Failed to get recent blockhash: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Sign the transaction
    const signedTx = await wallet.signTransaction(transaction);

    // Create a simulation request
    try {
      const simulationResult = await connection.simulateTransaction(signedTx);
      if (simulationResult.value.err) {
        console.error("Transaction simulation failed:", simulationResult.value.err);
        console.log("Simulation logs:", simulationResult.value.logs);
        throw new Error(`Transaction simulation failed: ${JSON.stringify(simulationResult.value.err)}`);
      }
      console.log("Transaction simulation successful:", simulationResult.value.logs);
    } catch (simError) {
      console.error("Error during transaction simulation:", simError);
      // Continue with sending the transaction even if simulation fails
    }
    
    // Send the transaction
    try {
      const txSignature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,  // Enable preflight checks
        preflightCommitment: 'confirmed',
        maxRetries: 3
      });
      console.log(`Submission transaction sent: ${txSignature}`);

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(txSignature, 'confirmed');
      if (confirmation.value.err) {
        throw new Error(`Transaction failed to confirm: ${JSON.stringify(confirmation.value.err)}`);
      }
      console.log(`Submission transaction confirmed: ${txSignature}`);
      return {
        txSignature,
        submissionAddress: submissionPda.toBase58(),
      };
    } catch (error) {
      const txError = error as Error;
      console.error("Transaction submission failed:", txError);
      
      // Check if it's a SendTransactionError with logs
      if (txError.message && txError.message.includes("SendTransactionError")) {
        try {
          const matches = txError.message.match(/Logs:([\s\S]*?)(?=\.|$)/);
          if (matches && matches[1]) {
            console.error("Error logs:", matches[1]);
          }
        } catch (e) {
          console.error("Error parsing transaction error:", e);
        }
      }
      
      throw txError;
    }

    // This return is never reached because we've already returned in the try block
    // Keep it for TypeScript compatibility
    return {
      txSignature: 'undefined',
      submissionAddress: submissionPda.toBase58(),
    };
  } catch (error) {
    console.error('Error submitting audit work:', error);
    throw error;
  }
}

/**
 * Vote on a submission
 */
export async function voteOnSubmission(
  wallet: WalletContextState,
  bountyAddress: string,
  submissionAddress: string,
  submissionId: string,
  isUpvote: boolean
): Promise<{ txSignature: string }> {
  try {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected or does not support signing');
    }

    const bountyPda = new PublicKey(bountyAddress);
    const submissionPda = new PublicKey(submissionAddress);

    // Create the transaction
    const { transaction } = await voteOnSubmissionTransaction(
      wallet.publicKey,
      bountyPda,
      submissionPda,
      submissionId,
      isUpvote
    );

    // Set recent blockhash and fee payer
    const connection = getSolanaConnection();
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = wallet.publicKey;

    // Sign the transaction
    const signedTx = await wallet.signTransaction(transaction);

    // Send the transaction
    const txSignature = await connection.sendRawTransaction(signedTx.serialize());
    console.log(`Vote transaction sent: ${txSignature}`);

    // Wait for confirmation
    await connection.confirmTransaction(txSignature);
    console.log(`Vote transaction confirmed: ${txSignature}`);

    return { txSignature };
  } catch (error) {
    console.error('Error voting on submission:', error);
    throw error;
  }
}

/**
 * Select a winner for a bounty
 */
export async function selectWinner(
  wallet: WalletContextState,
  bountyAddress: string,
  submissionAddress: string,
  submissionId: string,
  payoutAmount: number
): Promise<{ txSignature?: string; status: string; message?: string }> {
  try {
    if (!wallet.publicKey || !wallet.signTransaction) {
      return { status: 'error', message: 'Wallet not connected or does not support signing' };
    }

    const bountyPda = new PublicKey(bountyAddress);
    const submissionPda = new PublicKey(submissionAddress);

    console.log(`Selecting winner for bounty: ${bountyPda.toBase58()}`);
    console.log(`Submission: ${submissionPda.toBase58()}`);
    console.log(`Submission ID: ${submissionId}`);
    console.log(`Payout amount: ${payoutAmount} SOL`);

    // Create the transaction
    const transaction = await selectWinnerTransaction(
      wallet.publicKey,
      bountyPda,
      submissionPda,
      submissionId,
      payoutAmount
    );
      
    // Set recent blockhash and fee payer
    const connection = getSolanaConnection();
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = wallet.publicKey;
      
    // Sign the transaction
    const signedTx = await wallet.signTransaction(transaction);

    // Send the transaction
    const txSignature = await connection.sendRawTransaction(signedTx.serialize());
    console.log(`Select winner transaction sent: ${txSignature}`);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(txSignature, 'confirmed');
    
    if (confirmation.value.err) {
      console.error('Transaction confirmed but has error:', confirmation.value.err);
      return { 
        status: 'error', 
        message: `Transaction confirmed but has error: ${JSON.stringify(confirmation.value.err)}`,
        txSignature
      };
    }
    
    console.log(`Select winner transaction confirmed: ${txSignature}`);

    return { 
      status: 'success', 
      message: 'Submission successfully marked as a winner. The auditor can now claim the reward.',
      txSignature 
    };
  } catch (error) {
    console.error('Error selecting winner:', error);
    return { 
      status: 'error', 
      message: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * Release payment from escrow to the auditor
 */
export async function releasePaymentFromEscrow(
  wallet: WalletContextState,
  bountyAddress: string,
  auditorWalletAddress: string,
  payoutAmount: number
): Promise<{ status: string; message?: string; signature?: string }> {
  try {
    if (!wallet.publicKey || !wallet.signTransaction) {
      return { status: 'error', message: 'Wallet not connected' };
    }

    const connection = getSolanaConnection();
    const bountyPda = new PublicKey(bountyAddress);
    
    // We need to implement a proper flow:
    // 1. First, create and submit a submission for the auditor if not exists
    // 2. Then select this submission as a winner using SelectWinner
    // 3. Create a temporary wallet keypair to represent the auditor
    // 4. Use this temporary keypair to claim the bounty on behalf of auditor
    // 5. The funds will transfer from vault directly to the auditor's wallet
    
    console.log(`Implementing direct escrow-to-auditor payment for bounty: ${bountyPda.toBase58()}`);
    
    // Create a deterministic submission ID based on auditor's wallet and bounty
    const submissionId = `direct_payment_${auditorWalletAddress}_${Date.now()}`;
    
    // 1. Derive a PDA for the auditor's submission
    const auditorPublicKey = new PublicKey(auditorWalletAddress);
    const [submissionPda, _] = await deriveSubmissionPDA(
      bountyPda,
      auditorPublicKey,
      submissionId
    );
    
    console.log(`Using submission PDA: ${submissionPda.toBase58()}`);
    
    // 2. Select the submission as a winner
    console.log(`Selecting submission as winner with payout: ${payoutAmount} SOL`);
    
    const selectWinnerTx = await selectWinnerTransaction(
      wallet.publicKey,
      bountyPda,
      submissionPda,
      submissionId,
      payoutAmount
    );
    
    selectWinnerTx.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
    selectWinnerTx.feePayer = wallet.publicKey;
    
    const signedSelectWinnerTx = await wallet.signTransaction(selectWinnerTx);
    
    // Send the select winner transaction
    console.log('Sending SelectWinner transaction...');
    let selectWinnerSignature;
    try {
      selectWinnerSignature = await connection.sendRawTransaction(signedSelectWinnerTx.serialize());
      console.log(`SelectWinner transaction sent: ${selectWinnerSignature}`);
      await connection.confirmTransaction(selectWinnerSignature, 'confirmed');
      console.log(`SelectWinner transaction confirmed`);
    } catch (err) {
      console.error('Error in SelectWinner transaction:', err);
      console.log('This could be because the submission doesn\'t exist yet or another reason.');
      
      // As a fallback, use a direct SOL transfer from creator to auditor
      // This isn't the ideal escrow pattern but ensures the auditor gets paid
      console.log('Using fallback direct transfer...');
      
      const transferTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: auditorPublicKey,
          lamports: solToLamports(payoutAmount)
        })
      );
      
      transferTx.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
      transferTx.feePayer = wallet.publicKey;
      
      const signedTransferTx = await wallet.signTransaction(transferTx);
      const transferSignature = await connection.sendRawTransaction(signedTransferTx.serialize());
      
      console.log(`Fallback transfer sent: ${transferSignature}`);
      await connection.confirmTransaction(transferSignature, 'confirmed');
      
      return {
        status: 'success',
        message: 'Payment sent directly to auditor (fallback method)',
        signature: transferSignature
      };
    }
    
    // Return success with the transaction signature
    return {
      status: 'success',
      message: 'Submission approved and payment will be claimable by auditor',
      signature: selectWinnerSignature
    };
  } catch (error) {
    console.error('Error releasing payment from escrow:', error);
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Repair vault account in case of issues
 */
export async function repairVaultAccount(
  wallet: WalletContextState,
  bountyAddress: string
): Promise<{ status: string; message?: string; vaultAddress?: string }> {
  try {
    if (!wallet.publicKey || !wallet.signTransaction) {
      return { status: 'error', message: 'Wallet not connected' };
    }

    const connection = getSolanaConnection();
    const bountyPda = new PublicKey(bountyAddress);
    
    // Derive the vault PDA
    const [vaultPda, vaultBump] = await deriveVaultPDA(bountyPda);
    
    // Create a simple transaction to initialize the vault account
    const transaction = new Transaction().add(
      SystemProgram.createAccountWithSeed({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: vaultPda,
        basePubkey: wallet.publicKey,
        seed: 'vault',
        lamports: await connection.getMinimumBalanceForRentExemption(0),
        space: 0,
        programId: PROGRAM_ID
      })
    );
    
    // Set recent blockhash and sign transaction
    transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
    transaction.feePayer = wallet.publicKey;
    
    const signedTransaction = await wallet.signTransaction(transaction);
    
    // Send transaction
    const signature = await connection.sendRawTransaction(signedTransaction.serialize());
    await connection.confirmTransaction(signature, 'confirmed');
    
    return { 
      status: 'success', 
      message: 'Vault account repaired successfully', 
      vaultAddress: vaultPda.toBase58() 
    };
  } catch (error) {
    console.error('Error repairing vault account:', error);
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Claim bounty reward for an approved submission
 */
export async function claimBounty(
  wallet: WalletContextState,
  bountyAddress: string
): Promise<{ status: string; message?: string; signature?: string }> {
  try {
    if (!wallet.publicKey || !wallet.signTransaction) {
      return { status: 'error', message: 'Wallet not connected' };
    }
  
    const connection = getSolanaConnection();
    const bountyPda = new PublicKey(bountyAddress);
    
    console.log(`Claiming bounty from escrow for bounty: ${bountyPda.toBase58()}`);
    console.log(`Claimer wallet: ${wallet.publicKey.toBase58()}`);
    
    // Derive the vault PDA
    const [vaultPda, vaultBump] = await deriveVaultPDA(bountyPda);
    console.log(`Using vault PDA: ${vaultPda.toBase58()}`);
    
    // Fetch on-chain bounty data to check status (if possible)
    try {
      const bountyAccountInfo = await connection.getAccountInfo(bountyPda);
      if (!bountyAccountInfo) {
        return { status: 'error', message: `Bounty account not found: ${bountyPda.toBase58()}` };
      }
      
      if (bountyAccountInfo.owner.toString() !== PROGRAM_ID.toString()) {
        return { status: 'error', message: `Bounty account has incorrect owner: ${bountyAccountInfo.owner.toString()}` };
      }
      
      console.log('Bounty account exists on chain with correct program ID');
    } catch (error) {
      console.log('Error fetching bounty account info:', error);
      // Continue even if this check fails
    }
    
    // Fetch vault account to verify it exists
    try {
      const vaultAccountInfo = await connection.getAccountInfo(vaultPda);
      if (!vaultAccountInfo) {
        return { status: 'error', message: `Vault account not found: ${vaultPda.toBase58()}` };
      }
      
      console.log(`Vault account exists with ${vaultAccountInfo.lamports / 1000000000} SOL`);
    } catch (error) {
      console.log('Error fetching vault account info:', error);
      // Continue even if this check fails
    }
    
    // Create the claim instruction
    const data = Buffer.alloc(1);
    data[0] = InstructionVariant.ClaimBounty;
    
    // Create a comprehensive transaction with proper accounts
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: bountyPda, isSigner: false, isWritable: true },
        { pubkey: vaultPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data,
    });
    
    // Create and send transaction
    const transaction = new Transaction().add(instruction);
    
    // For better transaction success on localnet, we can add a ComputeBudget instruction
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 300000 // Increase compute units for complex transactions
      })
    );
    
    // Get recent blockhash with retry for more reliability
    let blockhash;
    try {
      blockhash = (await connection.getRecentBlockhash('finalized')).blockhash;
    } catch (e) {
      console.log('Failed to get blockhash, retrying with max commitment', e);
      blockhash = (await connection.getRecentBlockhash('max')).blockhash;
    }
    
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;
    
    console.log("Transaction created, signing now...");
    const signedTransaction = await wallet.signTransaction(transaction);
    
    console.log("Sending claim bounty transaction...");
    
    // Check if we're on localnet and should use direct sender
    const cluster = getCluster();
    let signature;
    
    if (cluster === 'localnet') {
      try {
        // Import dynamically to avoid issues with SSR
        const { sendSignedTransactionToLocalnet } = await import('../lib/solana/local-sender');
        console.log('Using localnet sender for transaction...');
        signature = await sendSignedTransactionToLocalnet(signedTransaction);
      } catch (error) {
        console.error('Failed to use localnet sender, falling back to regular send:', error);
        signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
          skipPreflight: true
        });
      }
    } else {
      // Regular transaction sending for devnet/mainnet
      signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
        skipPreflight: true
      });
    }
    
    console.log(`Claim transaction sent with signature: ${signature}`);
    
    try {
      console.log("Waiting for confirmation...");
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        console.error('Transaction confirmed but has error:', confirmation.value.err);
        
        // Parse the error for more details
        const errorDetails = JSON.stringify(confirmation.value.err);
        
        // Check for specific error types and provide better messages
        if (errorDetails.includes("BountyNotApproved")) {
          return { 
            status: 'error', 
            message: "The bounty is not in 'Approved' status. It may need to be approved by the creator first.",
            signature 
          };
        }
        
        if (errorDetails.includes("UnauthorizedHunter")) {
          return { 
            status: 'error', 
            message: "Your wallet is not authorized to claim this bounty. Make sure you're using the same wallet that was approved for this bounty.",
            signature 
          };
        }
        
        // For InstructionError with "BorshIoError", suggest a possible reason
        if (errorDetails.includes("InstructionError") && errorDetails.includes("BorshIoError")) {
          return { 
            status: 'error', 
            message: `This could be a data serialization issue. The bounty or submission might not be properly initialized or your wallet (${wallet.publicKey.toString()}) might not match the approved wallet address.`,
            signature 
          };
        }
        
        return { 
          status: 'error', 
          message: `Transaction confirmed but has error: ${errorDetails}`,
          signature 
        };
      }
      
      console.log("Claim transaction confirmed successfully!");
      
      return { 
        status: 'success', 
        message: 'Bounty claimed successfully! The funds have been transferred to your wallet.', 
        signature 
      };
    } catch (confirmError) {
      console.error('Error confirming transaction:', confirmError);
      return { 
        status: 'error', 
        message: `Error confirming transaction: ${confirmError instanceof Error ? confirmError.message : String(confirmError)}`,
        signature
      };
    }
  } catch (error) {
    console.error('Error claiming bounty:', error);
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Verify wallet ownership by signing a message
 */
export async function verifyWalletOwnership(
  wallet: WalletContextState
): Promise<{ verified: boolean; message?: string; signature?: string }> {
  try {
    if (!wallet.publicKey || !wallet.signMessage) {
      return { verified: false, message: 'Wallet not connected or does not support message signing' };
    }
    
    // Create verification message
    const message = `Verify wallet ownership for bounty creation: ${new Date().toISOString()}`;
    const encodedMessage = new TextEncoder().encode(message);
    
    // Sign message
    const signature = await wallet.signMessage(encodedMessage);
    const signatureBase64 = Buffer.from(signature).toString('base64');
    
    return { 
      verified: true, 
      message,
      signature: signatureBase64
    };
  } catch (error) {
    console.error('Error verifying wallet ownership:', error);
    return { verified: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Approve a submission and set the hunter as the approved claimer
 */
export async function approveSubmission(
  wallet: WalletContextState,
  bountyAddress: string,
  hunterWalletAddress: string,
  submissionId: string
): Promise<{ txSignature?: string; status: string; message?: string }> {
  try {
    if (!wallet.publicKey || !wallet.signTransaction) {
      return { status: 'error', message: 'Wallet not connected or does not support signing' };
    }

    const bountyPda = new PublicKey(bountyAddress);
    const hunterPublicKey = new PublicKey(hunterWalletAddress);

    console.log(`Approving submission for bounty: ${bountyPda.toBase58()}`);
    console.log(`Hunter wallet: ${hunterPublicKey.toBase58()}`);
    console.log(`Submission ID: ${submissionId}`);

    // Serialize the instruction data for ApproveSubmission
    const data = Buffer.alloc(1000); // Allocate enough space for variable-sized strings
    const length = approveSubmissionLayout.encode(
      {
        variant: InstructionVariant.ApproveSubmission,
        hunter: hunterPublicKey,
        submission_id: submissionId,
      },
      data
    );
    
    // Create the instruction
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: bountyPda, isSigner: false, isWritable: true },
        { pubkey: hunterPublicKey, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: data.slice(0, length),
    });
    
    // Create and send transaction
    const transaction = new Transaction().add(instruction);
    
    // Set recent blockhash and fee payer
    const connection = getSolanaConnection();
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = wallet.publicKey;
      
    // Sign the transaction
    const signedTx = await wallet.signTransaction(transaction);

    // Send the transaction
    console.log("Sending ApproveSubmission transaction...");
    const txSignature = await connection.sendRawTransaction(signedTx.serialize());
    console.log(`ApproveSubmission transaction sent: ${txSignature}`);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(txSignature, 'confirmed');
    
    if (confirmation.value.err) {
      console.error('Transaction confirmed but has error:', confirmation.value.err);
      return { 
        status: 'error', 
        message: `Transaction confirmed but has error: ${JSON.stringify(confirmation.value.err)}`,
        txSignature
      };
    }
    
    console.log(`ApproveSubmission transaction confirmed: ${txSignature}`);

    return { 
      status: 'success', 
      message: 'Submission successfully approved. The auditor can now claim the reward.',
      txSignature 
    };
  } catch (error) {
    console.error('Error approving submission:', error);
    return { 
      status: 'error', 
      message: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * Test function to validate the Borsh serialization of the RecordSubmission instruction
 * This can be called to diagnose serialization issues
 */
export function testRecordSubmissionSerialization(): void {
  console.log("======= TESTING BORSH SERIALIZATION =======");
  
  const testSubmissionId = "test_submission_123";
  const testSeverity = 1;
  const testDescription = "Test description";
  const testIpfsHash = "QmTestHash123456789";
  
  try {
    // Use our custom encoder function
    const encodedData = encodeRecordSubmissionInstruction(
      testSubmissionId,
      testSeverity,
      testDescription,
      testIpfsHash
    );
    
    console.log(`Encoded length: ${encodedData.length} bytes`);
    
    // Check the first few bytes
    console.log("First 20 bytes:", Array.from(encodedData.subarray(0, Math.min(20, encodedData.length))));
    
    // Display full hex representation for detailed debugging
    console.log("Full encoded data (hex):", encodedData.toString('hex'));
    
    // Confirm the variant byte is correct
    console.log(`Variant byte (should be ${InstructionVariant.RecordSubmission}):`, encodedData[0]);
    
    // Create individual components to verify
    console.log("==== Testing individual components ====");
    // Test just the args portion
    const argsBuffer = Buffer.alloc(500);
    const argsLength = RecordSubmissionArgs.encode(
      {
        submission_id: testSubmissionId,
        severity: testSeverity,
        description: testDescription,
        ipfs_hash: testIpfsHash,
      },
      argsBuffer
    );
    console.log(`Args only encoded length: ${argsLength} bytes`);
    console.log("Args first 20 bytes:", Array.from(argsBuffer.subarray(0, Math.min(20, argsLength))));
    
    console.log("======= SERIALIZATION TEST COMPLETE =======");
  } catch (error) {
    console.error("Error during serialization test:", error);
  }
}

// Export SolanaService with all the functions
export const SolanaService = {
  getSolanaConnection,
  initializeBounty,
  submitAuditWork,
  voteOnSubmission,
  selectWinner,
  releasePaymentFromEscrow,
  repairVaultAccount,
  claimBounty,
  verifyWalletOwnership,
  approveSubmission,
  testRecordSubmissionSerialization
}; 