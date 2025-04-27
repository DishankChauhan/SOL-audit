import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { SolanaService } from './solana';
import { IBounty, BountyStatusFirebase } from './bounty';

// Interface for submission data stored in Firebase
export interface ISubmission {
  id: string;
  bountyId: string; // ID of the bounty this submission is for
  submittedBy: string; // wallet address of the submitter
  submitterUid: string; // Firebase UID of the submitter
  submissionUrl: string; // URL to the submission (e.g., GitHub PR, docs)
  description: string; // Description of the submission
  submittedAt: number; // Unix timestamp
  status: SubmissionStatus; // Status of the submission
  transactionHash?: string; // Solana transaction hash
}

// Enum for submission status
export enum SubmissionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

export class Submission {
  // Static methods for the dashboard
  static async getByAuditor(uid: string, { limit }: { limit: number }): Promise<ISubmission[]> {
    const submissionCollection = collection(db, 'submissions');
    const q = query(submissionCollection, where("submitterUid", "==", uid));
    const querySnapshot = await getDocs(q);
    const submissions = querySnapshot.docs.map(doc => doc.data() as ISubmission);
    return submissions.slice(0, limit);
  }

  static async getStats({ auditor }: { auditor: string }): Promise<{
    totalCount: number;
    approvedCount: number;
    totalEarned: number;
  }> {
    const submissionCollection = collection(db, 'submissions');
    const q = query(submissionCollection, where("submitterUid", "==", auditor));
    const querySnapshot = await getDocs(q);
    
    const submissions = querySnapshot.docs.map(doc => doc.data() as ISubmission);
    const approvedSubmissions = submissions.filter(sub => sub.status === SubmissionStatus.APPROVED);
    
    // In a real implementation, would calculate earnings from approved submissions
    // For now just use a placeholder value
    const totalEarned = approvedSubmissions.length * 100; // Placeholder: 100 per approved submission
    
    return {
      totalCount: submissions.length,
      approvedCount: approvedSubmissions.length,
      totalEarned
    };
  }

  private solanaService: SolanaService | null = null;
  private submissionCollection = collection(db, 'submissions');
  private bountyCollection = collection(db, 'bounties');

  // Set the Solana service instance
  setSolanaService(service: SolanaService) {
    this.solanaService = service;
  }

  // Create a new submission
  async createSubmission(
    submissionData: Omit<ISubmission, 'id' | 'status' | 'submittedAt' | 'transactionHash'>,
    wallet: string,
    uid: string
  ): Promise<ISubmission> {
    if (!this.solanaService) {
      throw new Error('Solana service is not initialized');
    }

    // Submit work on-chain
    const signature = await this.solanaService.submitWork(
      submissionData.bountyId,
      submissionData.submissionUrl
    );

    // Create a new submission document in Firebase
    const submissionId = `${submissionData.bountyId}-${wallet}-${Date.now()}`;
    
    const newSubmission: ISubmission = {
      ...submissionData,
      id: submissionId,
      submittedBy: wallet,
      submitterUid: uid,
      submittedAt: Date.now(),
      status: SubmissionStatus.PENDING,
      transactionHash: signature
    };

    // Store in Firebase
    await setDoc(doc(this.submissionCollection, submissionId), newSubmission);

    // Add submission ID to the bounty's submissions array
    const bountyRef = doc(this.bountyCollection, submissionData.bountyId);
    const bountySnap = await getDoc(bountyRef);
    
    if (bountySnap.exists()) {
      const bounty = bountySnap.data() as IBounty;
      const submissions = bounty.submissions || [];
      
      await updateDoc(bountyRef, {
        submissions: [...submissions, submissionId]
      });
    }

    return newSubmission;
  }

  // Get all submissions
  async getAllSubmissions(): Promise<ISubmission[]> {
    const querySnapshot = await getDocs(this.submissionCollection);
    return querySnapshot.docs.map(doc => doc.data() as ISubmission);
  }

  // Get submissions for a specific bounty
  async getSubmissionsByBounty(bountyId: string): Promise<ISubmission[]> {
    const q = query(this.submissionCollection, where("bountyId", "==", bountyId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as ISubmission);
  }

  // Get submissions by a specific user
  async getSubmissionsByUser(walletAddress: string): Promise<ISubmission[]> {
    const q = query(this.submissionCollection, where("submittedBy", "==", walletAddress));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as ISubmission);
  }

  // Get submissions by submitter UID
  async getSubmissionsBySubmitterUid(uid: string): Promise<ISubmission[]> {
    const q = query(this.submissionCollection, where("submitterUid", "==", uid));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as ISubmission);
  }

  // Get a single submission by ID
  async getSubmissionById(id: string): Promise<ISubmission | null> {
    const docRef = doc(this.submissionCollection, id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() as ISubmission : null;
  }

  // Approve a submission
  async approveSubmission(
    submissionId: string,
    bountyId: string,
    hunterAddress: string
  ): Promise<string> {
    if (!this.solanaService) {
      throw new Error('Solana service is not initialized');
    }

    // Approve submission on-chain
    const signature = await this.solanaService.approveSubmission(bountyId, hunterAddress);

    // Update submission status in Firebase
    await updateDoc(doc(this.submissionCollection, submissionId), {
      status: SubmissionStatus.APPROVED,
      transactionHash: signature
    });

    // Update the bounty status to approved
    await updateDoc(doc(this.bountyCollection, bountyId), {
      status: BountyStatusFirebase.APPROVED,
      approvedHunter: hunterAddress
    });

    return signature;
  }

  // Reject a submission
  async rejectSubmission(submissionId: string): Promise<void> {
    // Update submission status in Firebase (no on-chain action needed)
    await updateDoc(doc(this.submissionCollection, submissionId), {
      status: SubmissionStatus.REJECTED
    });
  }

  // Delete a submission
  async deleteSubmission(submissionId: string, bountyId: string): Promise<void> {
    // Delete the submission document
    await deleteDoc(doc(this.submissionCollection, submissionId));

    // Remove submission ID from the bounty's submissions array
    const bountyRef = doc(this.bountyCollection, bountyId);
    const bountySnap = await getDoc(bountyRef);
    
    if (bountySnap.exists()) {
      const bounty = bountySnap.data() as IBounty;
      const submissions = bounty.submissions || [];
      
      await updateDoc(bountyRef, {
        submissions: submissions.filter(id => id !== submissionId)
      });
    }
  }
} 