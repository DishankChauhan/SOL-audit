import { collection, getDocs, getDoc, doc, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

// Export type definitions
export interface ISubmission {
  id: string;
  bountyId: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'approved' | 'rejected';
  auditor: {
    id: string;
    displayName: string;
    photoURL?: string;
  };
  createdAt: string | Date;
  bountyTitle?: string;
  amount?: number;
}

/**
 * Fetch a user's submissions
 */
export async function getSubmissionsByAuditor(auditorId: string, options?: { limit?: number }) {
  try {
    const submissionsRef = collection(db, 'submissions');
    let q = query(
      submissionsRef, 
      where('auditor.id', '==', auditorId),
      orderBy('createdAt', 'desc')
    );
    
    if (options?.limit) {
      q = query(q, limit(options.limit));
    }
    
    const querySnapshot = await getDocs(q);
    
    const submissions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return submissions as ISubmission[];
  } catch (error) {
    console.error(`Error fetching submissions for auditor ${auditorId}:`, error);
    throw error;
  }
}

/**
 * Get submission statistics for an auditor
 */
export async function getSubmissionStats(params: { auditor: string }) {
  try {
    const submissionsRef = collection(db, 'submissions');
    
    // Query for all submissions by this auditor
    const allSubmissionsQuery = query(
      submissionsRef,
      where('auditor.id', '==', params.auditor)
    );
    
    // Query for approved submissions by this auditor
    const approvedSubmissionsQuery = query(
      submissionsRef,
      where('auditor.id', '==', params.auditor),
      where('status', '==', 'approved')
    );
    
    // Execute queries
    const [allSubmissionsSnapshot, approvedSubmissionsSnapshot] = await Promise.all([
      getDocs(allSubmissionsQuery),
      getDocs(approvedSubmissionsQuery)
    ]);
    
    // Calculate total count and approved count
    const totalCount = allSubmissionsSnapshot.size;
    const approvedCount = approvedSubmissionsSnapshot.size;
    
    // Calculate total earned
    let totalEarned = 0;
    approvedSubmissionsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.payoutAmount) {
        totalEarned += parseFloat(data.payoutAmount) || 0;
      }
    });
    
    return {
      totalCount,
      approvedCount,
      totalEarned
    };
  } catch (error) {
    console.error('Error getting submission stats:', error);
    return {
      totalCount: 0,
      approvedCount: 0,
      totalEarned: 0
    };
  }
}

// Class version of SubmissionService for legacy code support
export class Submission {
  static async getByAuditor(auditorId: string, options?: { limit?: number }) {
    return getSubmissionsByAuditor(auditorId, options);
  }
  
  static async getStats(params: { auditor: string }) {
    return getSubmissionStats(params);
  }
}

// Export service object
export const SubmissionService = {
  getSubmissionsByAuditor,
  getSubmissionStats
}; 