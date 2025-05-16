import { Connection, PublicKey } from '@solana/web3.js';
import { getSolanaConnection } from './solana';
import { collection, getDocs, getDoc, doc, query, where, orderBy, setDoc, updateDoc, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { ENV } from '@/lib/env';

// Program ID
const PROGRAM_ID = new PublicKey(ENV.PROGRAM_ID);

/**
 * Fetch all bounties from Firebase
 */
export async function getAllBounties() {
  try {
    const bountimesRef = collection(db, 'bounties');
    const q = query(bountimesRef, orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const bounties = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return bounties;
  } catch (error) {
    console.error('Error fetching bounties:', error);
    throw error;
  }
}

/**
 * Fetch a single bounty by address
 */
export async function getBountyByAddress(address: string) {
  try {
    const bountyRef = doc(db, 'bounties', address);
    const bountyDoc = await getDoc(bountyRef);
    
    if (!bountyDoc.exists()) {
      throw new Error('Bounty not found');
    }
    
    return {
      id: bountyDoc.id,
      ...bountyDoc.data()
    };
  } catch (error) {
    console.error(`Error fetching bounty ${address}:`, error);
    throw error;
  }
}

/**
 * Fetch submissions for a specific bounty
 */
export async function getSubmissionsForBounty(bountyAddress: string) {
  try {
    const submissionsRef = collection(db, 'submissions');
    const q = query(
      submissionsRef, 
      where('bountyAddress', '==', bountyAddress),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    
    const submissions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return submissions;
  } catch (error) {
    console.error(`Error fetching submissions for bounty ${bountyAddress}:`, error);
    throw error;
  }
}

/**
 * Fetch a user's submissions
 */
export async function getUserSubmissions(userAddress: string) {
  try {
    const submissionsRef = collection(db, 'submissions');
    const q = query(
      submissionsRef, 
      where('auditor', '==', userAddress),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    
    const submissions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return submissions;
  } catch (error) {
    console.error(`Error fetching submissions for user ${userAddress}:`, error);
    throw error;
  }
}

/**
 * Store submission metadata in Firebase
 */
export async function storeSubmissionMetadata(
  submissionData: {
    submissionAddress: string;
    bountyAddress: string;
    auditor: string;
    description: string;
    ipfsHash: string;
    severity: number;
  }
) {
  try {
    // Add created timestamp and initial status
    const data = {
      ...submissionData,
      createdAt: Date.now(),
      status: 'pending',
      upvotes: 0,
      downvotes: 0,
      isWinner: false,
    };
    
    // Store in Firestore
    const submissionRef = doc(db, 'submissions', submissionData.submissionAddress);
    await setDoc(submissionRef, data);
    
    return { success: true };
  } catch (error) {
    console.error('Error storing submission metadata:', error);
    throw error;
  }
}

/**
 * Approve a submission and update its status
 */
export async function approveSubmission(bountyAddress: string, submissionId: string) {
  try {
    const submissionRef = doc(db, 'submissions', submissionId);
    await updateDoc(submissionRef, {
      status: 'approved',
      updatedAt: Date.now()
    });
    
    return { success: true };
  } catch (error) {
    console.error(`Error approving submission ${submissionId}:`, error);
    throw error;
  }
}

/**
 * Update bounty status
 */
export async function updateStatus(bountyId: string, status: string) {
  try {
    const bountyRef = doc(db, 'bounties', bountyId);
    await updateDoc(bountyRef, {
      status: status,
      updatedAt: Date.now()
    });
    
    return { success: true };
  } catch (error) {
    console.error(`Error updating bounty status to ${status}:`, error);
    throw error;
  }
}

// Export type definitions
export interface IBounty {
  id: string;
  title: string;
  description: string;
  repoUrl: string;
  amount: number;
  bountyAmount?: number; // Alternative property name
  status: 'open' | 'closed' | 'cancelled' | 'draft' | 'cancelling' | 'completing' | 'completed';
  submissionCount?: number;
  submissionsCount?: number; // Alternative property name
  approvedCount?: number;
  owner: string;
  ownerName?: string;
  deadline: string | Date;
  createdAt: string | Date;
  tags: string[];
  solanaAddress?: string;
  transactionHash?: string;
  tokenMint?: string;
}

// Class version of BountyService for legacy code support
export class Bounty {
  static async getAll(options?: { owner?: string, limit?: number }) {
    try {
      const bountiesRef = collection(db, 'bounties');
      
      // Build query based on options
      let queryRef = query(bountiesRef, orderBy('createdAt', 'desc'));
      
      if (options?.owner) {
        queryRef = query(queryRef, where('owner', '==', options.owner));
      }
      
      if (options?.limit) {
        queryRef = query(queryRef, limit(options.limit));
      }
      
      // Execute query
      const querySnapshot = await getDocs(queryRef);
      
      // Transform data
      const bounties = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title || '',
          description: data.description || '',
          repoUrl: data.repoUrl || '',
          amount: data.amount || 0,
          status: data.status || 'open',
          submissionCount: data.submissionCount || 0,
          approvedCount: data.approvedCount || 0,
          owner: data.owner || '',
          ownerName: data.ownerName || 'Unknown',
          deadline: data.deadline 
            ? new Date(data.deadline.toDate ? data.deadline.toDate() : data.deadline) 
            : new Date(),
          createdAt: data.createdAt
            ? new Date(data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt)
            : new Date(),
          tags: data.tags || [],
          solanaAddress: data.solanaAddress || ''
        } as IBounty;
      });
      
      return bounties;
    } catch (error) {
      console.error('Error fetching bounties:', error);
      return [];
    }
  }

  static async getStats(options?: { owner?: string }) {
    try {
      // Get bounties for this owner
      const bounties = await this.getAll(options);
      
      // Calculate stats
      const totalCount = bounties.length;
      const totalAmount = bounties.reduce((sum, bounty) => sum + (bounty.amount || 0), 0);
      
      // Count submissions if needed
      let submissionCount = 0;
      let approvedCount = 0;
      
      // For more accurate stats, we would query the submissions collection
      // but for simplicity, we'll use the cached counts on the bounty objects
      submissionCount = bounties.reduce((sum, bounty) => sum + (bounty.submissionCount || 0), 0);
      approvedCount = bounties.reduce((sum, bounty) => sum + (bounty.approvedCount || 0), 0);
      
      return {
        totalCount,
        totalAmount,
        submissionCount,
        approvedCount
      };
    } catch (error) {
      console.error('Error fetching bounty stats:', error);
      return {
        totalCount: 0,
        totalAmount: 0,
        submissionCount: 0,
        approvedCount: 0
      };
    }
  }

  static async updateStatus(bountyId: string, status: string) {
    return updateStatus(bountyId, status);
  }

  static async approveSubmission(bountyId: string, submissionId: string) {
    return approveSubmission(bountyId, submissionId);
  }
}

// Export a BountyService object with all functions
export const BountyService = {
  getAllBounties,
  getBountyByAddress,
  getSubmissionsForBounty,
  getUserSubmissions,
  storeSubmissionMetadata,
  approveSubmission,
  updateStatus
}; 