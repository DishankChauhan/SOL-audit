import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  SystemProgram,
  sendAndConfirmTransaction,
  TransactionInstruction
} from '@solana/web3.js';
import { struct, u8, str, u64, array, bool } from '@coral-xyz/borsh';
import { Buffer } from 'buffer';
import fs from 'fs';
import path from 'path';
import { AppError } from '../middleware/error.middleware';

// Load environment variables
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SOLANA_KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH || path.join(__dirname, '../../keypair.json');
const PROGRAM_ID = process.env.PROGRAM_ID || '5Bb4BGBkViCPnyRcSevAggmLXNLTCHTR27yzLkjCRdJY';

// Initialize Solana connection
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Load wallet from file system (should be secured in production)
let feePayer: Keypair;
try {
  const secretKeyString = fs.readFileSync(SOLANA_KEYPAIR_PATH, { encoding: 'utf8' });
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  feePayer = Keypair.fromSecretKey(secretKey);
} catch (error) {
  console.error('Failed to load Solana keypair:', error);
  // Generate a new keypair if none exists (for development only)
  feePayer = Keypair.generate();
  
  // In a real app, we would want to handle this differently
  console.warn('Generated temporary keypair - this should not happen in production!');
}

// Program ID
const programId = new PublicKey(PROGRAM_ID);

// Instruction variants
enum InstructionVariant {
  InitializeBounty = 0,
  SubmitFinding = 1,
  ApproveFinding = 2,
  RejectFinding = 3,
  InitiateDispute = 4,
  ResolveDispute = 5,
  ClaimReward = 6,
  CancelBounty = 7
}

// Borsh class definitions for serialization
class InitializeBountyArgs {
  repoUrl: string;
  bountyAmount: number;
  deadline: number;
  severityWeights: { critical: number; high: number; medium: number; low: number };

  constructor(args: {
    repoUrl: string;
    bountyAmount: number;
    deadline: number;
    severityWeights: { critical: number; high: number; medium: number; low: number };
  }) {
    this.repoUrl = args.repoUrl;
    this.bountyAmount = args.bountyAmount;
    this.deadline = args.deadline;
    this.severityWeights = args.severityWeights;
  }
}

class SubmitFindingArgs {
  description: string;
  severity: number; // 0: Critical, 1: High, 2: Medium, 3: Low
  pocUrl: string;
  fixUrl: string;

  constructor(args: {
    description: string;
    severity: string;
    pocUrl: string;
    fixUrl: string;
  }) {
    this.description = args.description;
    
    // Convert severity string to number
    switch (args.severity.toLowerCase()) {
      case 'critical':
        this.severity = 0;
        break;
      case 'high':
        this.severity = 1;
        break;
      case 'medium':
        this.severity = 2;
        break;
      case 'low':
        this.severity = 3;
        break;
      default:
        this.severity = 3; // Default to low
    }
    
    this.pocUrl = args.pocUrl || '';
    this.fixUrl = args.fixUrl || '';
  }
}

class InitiateDisputeArgs {
  reason: string;

  constructor(args: { reason: string }) {
    this.reason = args.reason;
  }
}

class ResolveDisputeArgs {
  inFavorOfAuditor: boolean;

  constructor(args: { inFavorOfAuditor: boolean }) {
    this.inFavorOfAuditor = args.inFavorOfAuditor;
  }
}

// Borsh schema definitions for serialization
const SeverityWeightsSchema = struct({
  critical: u8('critical'),
  high: u8('high'),
  medium: u8('medium'),
  low: u8('low')
});

const InitializeBountySchema = struct({
  repoUrl: str('repoUrl'),
  bountyAmount: u64('bountyAmount'),
  deadline: u64('deadline'),
  severityWeights: SeverityWeightsSchema
});

const SubmitFindingSchema = struct({
  description: str('description'),
  severity: u8('severity'),
  pocUrl: str('pocUrl'),
  fixUrl: str('fixUrl')
});

const InitiateDisputeSchema = struct({
  reason: str('reason')
});

const ResolveDisputeSchema = struct({
  inFavorOfAuditor: bool('inFavorOfAuditor')
});

/**
 * Initialize a bounty on the Solana blockchain
 * @param bountyAddress Bounty account address
 * @param amount Bounty amount in lamports (or smallest unit of the token)
 * @param tokenMint Token mint address (if not SOL)
 * @param deadline ISO date string of the deadline
 * @returns Transaction signature
 */
export async function initializeBounty(
  bountyAddress: string,
  amount: number,
  tokenMint: string,
  deadline: string
): Promise<string> {
  try {
    const bountyPubkey = new PublicKey(bountyAddress);
    
    // Convert deadline string to unix timestamp
    const deadlineTimestamp = Math.floor(new Date(deadline).getTime() / 1000);
    
    // Create initialization args
    const args = {
      repoUrl: 'https://github.com/example/repo', // Should be stored off-chain with fixed size on-chain
      bountyAmount: amount,
      deadline: deadlineTimestamp,
      severityWeights: {
        critical: 40,
        high: 30,
        medium: 20,
        low: 10
      }
    };
    
    // Serialize the instruction data
    const instructionData = Buffer.concat([
      Buffer.from([InstructionVariant.InitializeBounty]),
      Buffer.from(InitializeBountySchema.encode(args))
    ]);
    
    // Create the transaction instruction
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: bountyPubkey, isSigner: false, isWritable: true },
        { pubkey: feePayer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ],
      programId,
      data: instructionData
    });
    
    // Create and send the transaction
    const transaction = new Transaction().add(instruction);
    transaction.feePayer = feePayer.publicKey;
    
    const signature = await sendAndConfirmTransaction(connection, transaction, [feePayer]);
    
    return signature;
  } catch (error) {
    console.error('Error initializing bounty on Solana:', error);
    throw new AppError(`Failed to initialize bounty on Solana: ${(error as Error).message}`, 500);
  }
}

/**
 * Submit a finding to a bounty on the Solana blockchain
 * @param bountyAddress Bounty account address
 * @param submissionAddress Submission account address
 * @param severity Severity of the finding
 * @param description Description of the finding
 * @param pocUrl Proof of concept URL
 * @param fixUrl Fix URL (optional)
 * @returns Transaction signature
 */
export async function submitFinding(
  bountyAddress: string,
  submissionAddress: string,
  severity: string,
  description: string,
  pocUrl?: string,
  fixUrl?: string
): Promise<string> {
  try {
    const bountyPubkey = new PublicKey(bountyAddress);
    const submissionPubkey = new PublicKey(submissionAddress);
    
    // Convert severity string to number
    let severityValue = 3; // Default to low
    switch (severity.toLowerCase()) {
      case 'critical':
        severityValue = 0;
        break;
      case 'high':
        severityValue = 1;
        break;
      case 'medium':
        severityValue = 2;
        break;
      case 'low':
        severityValue = 3;
        break;
    }
    
    // Create submission args
    const args = {
      description,
      severity: severityValue,
      pocUrl: pocUrl || '',
      fixUrl: fixUrl || ''
    };
    
    // Serialize the instruction data
    const instructionData = Buffer.concat([
      Buffer.from([InstructionVariant.SubmitFinding]),
      Buffer.from(SubmitFindingSchema.encode(args))
    ]);
    
    // Create the transaction instruction
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: bountyPubkey, isSigner: false, isWritable: true },
        { pubkey: submissionPubkey, isSigner: false, isWritable: true },
        { pubkey: feePayer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ],
      programId,
      data: instructionData
    });
    
    // Create and send the transaction
    const transaction = new Transaction().add(instruction);
    transaction.feePayer = feePayer.publicKey;
    
    const signature = await sendAndConfirmTransaction(connection, transaction, [feePayer]);
    
    return signature;
  } catch (error) {
    console.error('Error submitting finding on Solana:', error);
    throw new AppError(`Failed to submit finding on Solana: ${(error as Error).message}`, 500);
  }
}

/**
 * Approve a finding on the Solana blockchain
 * @param bountyAddress Bounty account address
 * @param submissionAddress Submission account address
 * @param payoutAmount Amount to pay out for the finding
 * @returns Transaction signature
 */
export async function approveFinding(
  bountyAddress: string,
  submissionAddress: string,
  payoutAmount: number
): Promise<string> {
  try {
    const bountyPubkey = new PublicKey(bountyAddress);
    const submissionPubkey = new PublicKey(submissionAddress);
    
    // No args needed for approval, but we could add payout amount as an arg if needed
    
    // Create the transaction instruction
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: bountyPubkey, isSigner: false, isWritable: true },
        { pubkey: submissionPubkey, isSigner: false, isWritable: true },
        { pubkey: feePayer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ],
      programId,
      data: Buffer.from([InstructionVariant.ApproveFinding])
    });
    
    // Create and send the transaction
    const transaction = new Transaction().add(instruction);
    transaction.feePayer = feePayer.publicKey;
    
    const signature = await sendAndConfirmTransaction(connection, transaction, [feePayer]);
    
    return signature;
  } catch (error) {
    console.error('Error approving finding on Solana:', error);
    throw new AppError(`Failed to approve finding on Solana: ${(error as Error).message}`, 500);
  }
}

/**
 * Reject a finding on the Solana blockchain
 * @param bountyAddress Bounty account address
 * @param submissionAddress Submission account address
 * @returns Transaction signature
 */
export async function rejectFinding(
  bountyAddress: string,
  submissionAddress: string
): Promise<string> {
  try {
    const bountyPubkey = new PublicKey(bountyAddress);
    const submissionPubkey = new PublicKey(submissionAddress);
    
    // Create the transaction instruction
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: bountyPubkey, isSigner: false, isWritable: true },
        { pubkey: submissionPubkey, isSigner: false, isWritable: true },
        { pubkey: feePayer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ],
      programId,
      data: Buffer.from([InstructionVariant.RejectFinding])
    });
    
    // Create and send the transaction
    const transaction = new Transaction().add(instruction);
    transaction.feePayer = feePayer.publicKey;
    
    const signature = await sendAndConfirmTransaction(connection, transaction, [feePayer]);
    
    return signature;
  } catch (error) {
    console.error('Error rejecting finding on Solana:', error);
    throw new AppError(`Failed to reject finding on Solana: ${(error as Error).message}`, 500);
  }
}

/**
 * Initiate a dispute for a submission on the Solana blockchain
 * @param bountyAddress Bounty account address
 * @param submissionAddress Submission account address
 * @param reason Reason for the dispute
 * @returns Transaction signature
 */
export async function initiateDispute(
  bountyAddress: string,
  submissionAddress: string,
  reason: string
): Promise<string> {
  try {
    const bountyPubkey = new PublicKey(bountyAddress);
    const submissionPubkey = new PublicKey(submissionAddress);
    
    // Create dispute args
    const args = { reason };
    
    // Serialize the instruction data
    const instructionData = Buffer.concat([
      Buffer.from([InstructionVariant.InitiateDispute]),
      Buffer.from(InitiateDisputeSchema.encode(args))
    ]);
    
    // Create the transaction instruction
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: bountyPubkey, isSigner: false, isWritable: true },
        { pubkey: submissionPubkey, isSigner: false, isWritable: true },
        { pubkey: feePayer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ],
      programId,
      data: instructionData
    });
    
    // Create and send the transaction
    const transaction = new Transaction().add(instruction);
    transaction.feePayer = feePayer.publicKey;
    
    const signature = await sendAndConfirmTransaction(connection, transaction, [feePayer]);
    
    return signature;
  } catch (error) {
    console.error('Error initiating dispute on Solana:', error);
    throw new AppError(`Failed to initiate dispute on Solana: ${(error as Error).message}`, 500);
  }
}

/**
 * Resolve a dispute on the Solana blockchain
 * @param bountyAddress Bounty account address
 * @param submissionAddress Submission account address
 * @param inFavorOfAuditor Whether the resolution is in favor of the auditor
 * @returns Transaction signature
 */
export async function resolveDispute(
  bountyAddress: string,
  submissionAddress: string,
  inFavorOfAuditor: boolean
): Promise<string> {
  try {
    const bountyPubkey = new PublicKey(bountyAddress);
    const submissionPubkey = new PublicKey(submissionAddress);
    
    // Create resolution args
    const args = { inFavorOfAuditor };
    
    // Serialize the instruction data
    const instructionData = Buffer.concat([
      Buffer.from([InstructionVariant.ResolveDispute]),
      Buffer.from(ResolveDisputeSchema.encode(args))
    ]);
    
    // Create the transaction instruction
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: bountyPubkey, isSigner: false, isWritable: true },
        { pubkey: submissionPubkey, isSigner: false, isWritable: true },
        { pubkey: feePayer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ],
      programId,
      data: instructionData
    });
    
    // Create and send the transaction
    const transaction = new Transaction().add(instruction);
    transaction.feePayer = feePayer.publicKey;
    
    const signature = await sendAndConfirmTransaction(connection, transaction, [feePayer]);
    
    return signature;
  } catch (error) {
    console.error('Error resolving dispute on Solana:', error);
    throw new AppError(`Failed to resolve dispute on Solana: ${(error as Error).message}`, 500);
  }
}

/**
 * Claim a reward for an approved submission on the Solana blockchain
 * @param bountyAddress Bounty account address
 * @param submissionAddress Submission account address
 * @param recipientAddress The address that will receive the funds
 * @returns Transaction signature
 */
export async function claimReward(
  bountyAddress: string,
  submissionAddress: string,
  recipientAddress: string
): Promise<string> {
  try {
    const bountyPubkey = new PublicKey(bountyAddress);
    const submissionPubkey = new PublicKey(submissionAddress);
    const recipientPubkey = new PublicKey(recipientAddress);
    
    // Create the transaction instruction
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: bountyPubkey, isSigner: false, isWritable: true },
        { pubkey: submissionPubkey, isSigner: false, isWritable: true },
        { pubkey: recipientPubkey, isSigner: false, isWritable: true },
        { pubkey: feePayer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ],
      programId,
      data: Buffer.from([InstructionVariant.ClaimReward])
    });
    
    // Create and send the transaction
    const transaction = new Transaction().add(instruction);
    transaction.feePayer = feePayer.publicKey;
    
    const signature = await sendAndConfirmTransaction(connection, transaction, [feePayer]);
    
    return signature;
  } catch (error) {
    console.error('Error claiming reward on Solana:', error);
    throw new AppError(`Failed to claim reward on Solana: ${(error as Error).message}`, 500);
  }
}

/**
 * Cancel a bounty on the Solana blockchain
 * @param bountyAddress Bounty account address
 * @returns Transaction signature
 */
export async function cancelBounty(
  bountyAddress: string
): Promise<string> {
  try {
    const bountyPubkey = new PublicKey(bountyAddress);
    
    // Create the transaction instruction
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: bountyPubkey, isSigner: false, isWritable: true },
        { pubkey: feePayer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ],
      programId,
      data: Buffer.from([InstructionVariant.CancelBounty])
    });
    
    // Create and send the transaction
    const transaction = new Transaction().add(instruction);
    transaction.feePayer = feePayer.publicKey;
    
    const signature = await sendAndConfirmTransaction(connection, transaction, [feePayer]);
    
    return signature;
  } catch (error) {
    console.error('Error canceling bounty on Solana:', error);
    throw new AppError(`Failed to cancel bounty on Solana: ${(error as Error).message}`, 500);
  }
}

/**
 * Get the status of a bounty from the Solana blockchain
 * @param bountyAddress Bounty account address
 * @returns Bounty status from the blockchain
 */
export async function getBountyStatus(
  bountyAddress: string
): Promise<{ exists: boolean; status?: string; amount?: number }> {
  try {
    const bountyPubkey = new PublicKey(bountyAddress);
    
    // Get account info
    const accountInfo = await connection.getAccountInfo(bountyPubkey);
    
    if (!accountInfo) {
      return { exists: false };
    }
    
    // In a real implementation, we would deserialize the account data here
    // For this sample, we're just returning that it exists
    return { 
      exists: true,
      status: 'active', // This would come from deserializing the account data
      amount: 1000000000 // This would come from deserializing the account data
    };
  } catch (error) {
    console.error('Error getting bounty status from Solana:', error);
    throw new AppError(`Failed to get bounty status from Solana: ${(error as Error).message}`, 500);
  }
}

/**
 * Get the balance of a wallet on the Solana blockchain
 * @param walletAddress Wallet address
 * @returns Wallet balance in lamports
 */
export async function getWalletBalance(
  walletAddress: string
): Promise<number> {
  try {
    const wallet = new PublicKey(walletAddress);
    const balance = await connection.getBalance(wallet);
    return balance;
  } catch (error) {
    console.error('Error getting wallet balance from Solana:', error);
    throw new AppError(`Failed to get wallet balance from Solana: ${(error as Error).message}`, 500);
  }
}

/**
 * Complete the bounty on the Solana blockchain
 * @param bountyAddress Bounty account address
 * @returns Transaction signature
 */
export async function completeBounty(
  bountyAddress: string
): Promise<string> {
  // In a real implementation, we might have a specific instruction for this
  // For now, we'll reuse cancelBounty with a different status update in our database
  return cancelBounty(bountyAddress);
} 