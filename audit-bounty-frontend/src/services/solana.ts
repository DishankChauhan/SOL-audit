import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { ENV } from '../lib/env';
import * as borsh from '@project-serum/borsh';
import { BN } from 'bn.js';

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

const recordSubmissionLayout = borsh.struct([
  borsh.u8('variant'),
  borsh.str('submission_id'),
  borsh.u8('severity'),
  borsh.str('description'),
  borsh.str('ipfs_hash'),
]);

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
  const seeds = [
    Buffer.from('submission'),
    bountyPda.toBuffer(),
    submitter.toBuffer(),
    Buffer.from(submissionId)
  ];
  
  const [pda, bump] = await PublicKey.findProgramAddress(seeds, PROGRAM_ID);
  
  if (log) {
    console.log(`Derived submission PDA: ${pda.toBase58()}`);
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
  
  // Serialize the instruction data
  const data = Buffer.alloc(createBountyLayout.span);
  createBountyLayout.encode(
    {
      variant: InstructionVariant.CreateBounty,
      amount: new BN(amountLamports),
      deadline: new BN(deadline),
      custom_seed: seed ? Array.from(seed) : null,
      winners_count: winnersCount, 
    },
    data
  );
  
  // Create the instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: bountyPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
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
  
  // Serialize the instruction data
  const data = Buffer.alloc(1000); // Allocate enough space for variable-sized strings
  const length = recordSubmissionLayout.encode(
    {
      variant: InstructionVariant.RecordSubmission,
      submission_id: submissionId,
      severity: severity,
      description: description,
      ipfs_hash: ipfsHash,
    },
    data
  );
  
  // Create the instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: submitter, isSigner: true, isWritable: true },
      { pubkey: bountyPda, isSigner: false, isWritable: false },
      { pubkey: submissionPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: data.slice(0, length),
  });
  
  // Create the transaction
  const transaction = new Transaction().add(instruction);
  
  return { transaction, submissionPda };
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

    // Store the bounty metadata in Firebase
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
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected or does not support signing');
    }

    const bountyPda = new PublicKey(bountyAddress);
    const submissionId = `submission_${Date.now()}`;

    // Create the transaction for recording submission with IPFS hash
    const { transaction, submissionPda } = await recordSubmissionTransaction(
      wallet.publicKey,
      bountyPda,
      submissionId,
      submissionData.severity,
      submissionData.description,
      submissionData.ipfsHash
    );

    // Set recent blockhash and fee payer
    const connection = getSolanaConnection();
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = wallet.publicKey;

    // Sign the transaction
    const signedTx = await wallet.signTransaction(transaction);

    // Send the transaction
    const txSignature = await connection.sendRawTransaction(signedTx.serialize());
    console.log(`Submission transaction sent: ${txSignature}`);

    // Wait for confirmation
    await connection.confirmTransaction(txSignature);
    console.log(`Submission transaction confirmed: ${txSignature}`);

    return {
      txSignature,
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
): Promise<{ txSignature: string }> {
  try {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected or does not support signing');
    }

    const bountyPda = new PublicKey(bountyAddress);
    const submissionPda = new PublicKey(submissionAddress);

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
    await connection.confirmTransaction(txSignature);
    console.log(`Select winner transaction confirmed: ${txSignature}`);

    return { txSignature };
  } catch (error) {
    console.error('Error selecting winner:', error);
    throw error;
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
    
    // Create a transaction for approving submission and releasing payment
    const transaction = await selectWinnerTransaction(
      wallet.publicKey,
      bountyPda,
      new PublicKey(auditorWalletAddress),
      auditorWalletAddress, // Using the wallet address as submission ID
      payoutAmount
    );
    
    // Set recent blockhash and sign transaction
    transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
    transaction.feePayer = wallet.publicKey;
    
    const signedTransaction = await wallet.signTransaction(transaction);
    
    // Send transaction
    const signature = await connection.sendRawTransaction(signedTransaction.serialize());
    await connection.confirmTransaction(signature, 'confirmed');
    
    return { status: 'success', message: 'Payment released successfully', signature };
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
    
    // Create the claim instruction
    const data = Buffer.alloc(1);
    data[0] = InstructionVariant.ClaimBounty;
    
    // Derive the vault PDA
    const [vaultPda, _] = await deriveVaultPDA(bountyPda);
    
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
    transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
    transaction.feePayer = wallet.publicKey;
    
    const signedTransaction = await wallet.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signedTransaction.serialize());
    await connection.confirmTransaction(signature, 'confirmed');
    
    return { status: 'success', message: 'Bounty claimed successfully', signature };
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
  verifyWalletOwnership
}; 