import { PublicKey } from '@solana/web3.js';
import { BountyStatus, SolanaService } from './solana';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { lamportsToSol } from '@/lib/solana/config';

// Interface for bounty data stored in Firebase
export interface IBounty {
  bountyAmount: number;
  submissionsCount: number | undefined;
  id: string;
  title: string;
  description: string;
  repoUrl?: string;
  tags: string[];
  amount: number; // in SOL
  tokenMint?: string; // SOL or USDC
  deadline: number; // Unix timestamp
  createdAt: number; // Unix timestamp
  updatedAt?: number; // Unix timestamp
  createdBy: string; // creator's wallet address
  creatorUid: string; // creator's Firebase user ID
  bountyPda: string;
  vaultPda: string;
  status: string; // "open", "approved", "claimed", "cancelled"
  submissions?: string[]; // Array of submission IDs
  approvedHunter?: string; // Approved hunter's wallet address
  transactionHash?: string;
  severityWeights?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational?: number;
  };
  owner?: string; // For API compatibility
  ownerName?: string; // For API compatibility
  walletAddress?: string; // For API compatibility
  solanaAddress?: string; // For API compatibility
  submissionCount?: number; // For API compatibility
  approvedCount?: number; // For API compatibility
}

// Enum for bounty status in Firebase
export enum BountyStatusFirebase {
  OPEN = 'open',
  APPROVED = 'approved',
  CLAIMED = 'claimed',
  CANCELLED = 'cancelled',
}

// Map Solana status to Firebase status
function mapSolanaStatusToFirebase(status: BountyStatus): BountyStatusFirebase {
  switch (status) {
    case BountyStatus.Open:
      return BountyStatusFirebase.OPEN;
    case BountyStatus.Approved:
      return BountyStatusFirebase.APPROVED;
    case BountyStatus.Claimed:
      return BountyStatusFirebase.CLAIMED;
    case BountyStatus.Cancelled:
      return BountyStatusFirebase.CANCELLED;
    default:
      return BountyStatusFirebase.OPEN;
  }
}

// Map Firebase status to Solana status
function mapFirebaseStatusToSolana(status: BountyStatusFirebase): BountyStatus {
  switch (status) {
    case BountyStatusFirebase.OPEN:
      return BountyStatus.Open;
    case BountyStatusFirebase.APPROVED:
      return BountyStatus.Approved;
    case BountyStatusFirebase.CLAIMED:
      return BountyStatus.Claimed;
    case BountyStatusFirebase.CANCELLED:
      return BountyStatus.Cancelled;
    default:
      return BountyStatus.Open;
  }
}

export class Bounty {
  // Static methods for the dashboard
  static async getAll({ owner, limit }: { owner: string; limit: number }): Promise<IBounty[]> {
    const bountyCollection = collection(db, 'bounties');
    const q = query(bountyCollection, where("creatorUid", "==", owner), where("status", "!=", ""));
    const querySnapshot = await getDocs(q);
    const bounties = querySnapshot.docs.map(doc => doc.data() as IBounty);
    return bounties.slice(0, limit);
  }

  static async getStats({ owner }: { owner: string }): Promise<{
    totalCount: number;
    totalAmount: number;
  }> {
    const bountyCollection = collection(db, 'bounties');
    const q = query(bountyCollection, where("creatorUid", "==", owner));
    const querySnapshot = await getDocs(q);
    
    const bounties = querySnapshot.docs.map(doc => doc.data() as IBounty);
    const totalAmount = bounties.reduce((sum, bounty) => sum + bounty.amount, 0);
    
    return {
      totalCount: bounties.length,
      totalAmount
    };
  }

  static async create(bountyData: any): Promise<{ id: string }> {
    // Create a bounty document with a generated ID
    const bountyCollection = collection(db, 'bounties');
    
    // Use a custom ID if provided, otherwise generate one
    const docId = bountyData.id || doc(bountyCollection).id;
    const docRef = doc(bountyCollection, docId);
    
    // Ensure the ID is set in the bounty data
    const completeData = {
      ...bountyData,
      id: docId, // Make sure the ID is reflected in the stored data
      submissionsCount: bountyData.submissionsCount || 0, // Ensure submissionsCount is 0 not undefined
      submissionCount: bountyData.submissionCount || 0,   // Ensure submissionCount is 0 not undefined
      approvedCount: bountyData.approvedCount || 0,       // Ensure approvedCount is 0 not undefined
    };
    
    // Store document in Firestore
    await setDoc(docRef, completeData);
    console.log(`Bounty created with ID: ${docId}`);
    
    // Return the ID for reference
    return { id: docId };
  }

  static async updateStatus(id: string, status: string) {
    try {
      console.log(`Updating status for bounty ${id} to ${status}`);
      
      // Get the bounty document reference
      const bountyRef = doc(db, 'bounties', id);
      
      // Update the bounty status
      await updateDoc(bountyRef, {
        status: status,
        updatedAt: new Date().getTime()
      });
      
      console.log(`Successfully updated status for bounty ${id}`);
      return true;
    } catch (error) {
      console.error('Error updating bounty status:', error);
      throw error;
    }
  }

  static async approveSubmission(bountyId: string, submissionId: string) {
    try {
      console.log(`Approving submission ${submissionId} for bounty ${bountyId}`);
      
      // Get the submission document reference
      const submissionRef = doc(db, 'submissions', submissionId);
      
      // Update the submission status to approved
      await updateDoc(submissionRef, {
        status: 'approved',
        reviewedAt: new Date(),
        reviewerComments: 'Approved by bounty owner'
      });
      
      // Update the bounty document to increment approvedCount
      const bountyRef = doc(db, 'bounties', bountyId);
      const bountySnapshot = await getDoc(bountyRef);
      
      if (bountySnapshot.exists()) {
        const bountyData = bountySnapshot.data();
        await updateDoc(bountyRef, {
          approvedCount: (bountyData.approvedCount || 0) + 1,
          updatedAt: new Date().getTime()
        });
      }
      
      console.log(`Successfully approved submission ${submissionId}`);
      return true;
    } catch (error) {
      console.error('Error approving submission:', error);
      throw error;
    }
  }

  private solanaService: SolanaService | null = null;
  private bountyCollection = collection(db, 'bounties');

  // Set the Solana service instance
  setSolanaService(service: SolanaService) {
    this.solanaService = service;
  }

  // Create a new bounty
  async createBounty(
    bountyData: Omit<IBounty, 'id' | 'bountyPda' | 'vaultPda' | 'status' | 'submissions' | 'approvedHunter' | 'transactionHash'>,
    wallet: string,
    uid: string
  ): Promise<IBounty> {
    if (!this.solanaService) {
      throw new Error('Solana service is not initialized');
    }

    // Create the bounty on the blockchain
    const { signature, bountyPda, vaultPda } = await this.solanaService.createBounty(
      bountyData.amount,
      bountyData.deadline,
    );

    // Create a new bounty document in Firebase
    const newBounty: IBounty = {
      ...bountyData,
      id: bountyPda, // Use the bountyPda as the ID for easy lookup
      bountyPda,
      vaultPda,
      status: BountyStatusFirebase.OPEN,
      createdBy: wallet,
      creatorUid: uid,
      transactionHash: signature,
      submissions: [],
    };

    // Store in Firebase
    await setDoc(doc(this.bountyCollection, bountyPda), newBounty);

    return newBounty;
  }

  // Get all bounties
  async getAllBounties(): Promise<IBounty[]> {
    const querySnapshot = await getDocs(this.bountyCollection);
    return querySnapshot.docs.map(doc => doc.data() as IBounty);
  }

  // Get bounties by status
  async getBountiesByStatus(status: BountyStatusFirebase): Promise<IBounty[]> {
    const q = query(this.bountyCollection, where("status", "==", status));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as IBounty);
  }

  // Get bounties created by a specific user
  async getBountiesByCreator(creatorAddress: string): Promise<IBounty[]> {
    const q = query(this.bountyCollection, where("createdBy", "==", creatorAddress));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as IBounty);
  }

  // Get bounties by creator UID
  async getBountiesByCreatorUid(uid: string): Promise<IBounty[]> {
    const q = query(this.bountyCollection, where("creatorUid", "==", uid));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as IBounty);
  }

  // Get a single bounty by ID (bountyPda)
  async getBountyById(id: string): Promise<IBounty | null> {
    const docRef = doc(this.bountyCollection, id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() as IBounty : null;
  }

  // Sync a bounty's status with on-chain data
  async syncBountyStatus(bountyPda: string): Promise<IBounty | null> {
    if (!this.solanaService) {
      throw new Error('Solana service is not initialized');
    }

    // Get bounty data from chain
    const onChainData = await this.solanaService.getBountyData(bountyPda);
    if (!onChainData) {
      console.error('Bounty not found on-chain');
      return null;
    }

    // Get current bounty data from Firebase
    const bounty = await this.getBountyById(bountyPda);
    if (!bounty) {
      console.error('Bounty not found in Firebase');
      return null;
    }

    // Update status based on on-chain data
    const newStatus = mapSolanaStatusToFirebase(onChainData.status);
    
    // Update hunter if it exists
    const approvedHunter = onChainData.hunter ? onChainData.hunter.toString() : undefined;

    // Update bounty in Firebase
    const updatedBounty: IBounty = {
      ...bounty,
      status: newStatus,
      approvedHunter,
      amount: lamportsToSol(onChainData.amount),
    };

    await updateDoc(doc(this.bountyCollection, bountyPda), {
      status: newStatus,
      approvedHunter,
      amount: lamportsToSol(onChainData.amount),
    });

    return updatedBounty;
  }

  // Submit work for a bounty
  async submitWork(bountyPda: string, submissionUrl: string): Promise<string> {
    if (!this.solanaService) {
      throw new Error('Solana service is not initialized');
    }

    // Submit work on-chain
    const signature = await this.solanaService.submitWork(bountyPda, submissionUrl);
    return signature;
  }

  // Approve a bounty submission
  async approveBounty(bountyPda: string, hunterAddress: string): Promise<string> {
    if (!this.solanaService) {
      throw new Error('Solana service is not initialized');
    }

    // Approve submission on-chain
    const signature = await this.solanaService.approveSubmission(bountyPda, hunterAddress);

    // Update bounty status in Firebase
    await updateDoc(doc(this.bountyCollection, bountyPda), {
      status: BountyStatusFirebase.APPROVED,
      approvedHunter: hunterAddress,
    });

    return signature;
  }

  // Claim a bounty
  async claimBounty(bountyPda: string): Promise<string> {
    if (!this.solanaService) {
      throw new Error('Solana service is not initialized');
    }

    // Claim bounty on-chain
    const signature = await this.solanaService.claimBounty(bountyPda);

    // Update bounty status in Firebase
    await updateDoc(doc(this.bountyCollection, bountyPda), {
      status: BountyStatusFirebase.CLAIMED,
    });

    return signature;
  }

  // Cancel a bounty
  async cancelBounty(bountyPda: string): Promise<string> {
    if (!this.solanaService) {
      throw new Error('Solana service is not initialized');
    }

    // Cancel bounty on-chain
    const signature = await this.solanaService.cancelBounty(bountyPda);

    // Update bounty status in Firebase
    await updateDoc(doc(this.bountyCollection, bountyPda), {
      status: BountyStatusFirebase.CANCELLED,
    });

    return signature;
  }
} 