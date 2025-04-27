import { Router } from 'express';
import { Response, Request } from 'express';
import { db } from '../config/firebase';
import { DocumentData } from 'firebase-admin/firestore';

const router = Router();

/**
 * @route GET /api/stats
 * @desc Get overall platform statistics
 * @access Public
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Get bounty stats
    const bountySnapshot = await db.collection('bounties').get();
    const submissionSnapshot = await db.collection('submissions').get();
    const userSnapshot = await db.collection('users').orderBy('reputation', 'desc').limit(5).get();
    
    // Get bounties for average calculation
    const bounties = bountySnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    }));
    
    // Define a type for bounties to include status and bountyAmount
    type Bounty = {
      id: string;
      status?: string;
      bountyAmount?: number;
    };

    // Count active and completed bounties
    const activeBounties = bounties.filter((b: Bounty) => b.status === 'active').length;
    const completedBounties = bounties.filter((b: Bounty) => b.status === 'completed').length;
    
    // Calculate total amounts
    const totalAmount = bounties.reduce((sum: number, b: Bounty) => sum + (b.bountyAmount || 0), 0);
    const totalActiveAmount = bounties
      .filter((b: Bounty) => b.status === 'active')
      .reduce((sum: number, b: Bounty) => sum + (b.bountyAmount || 0), 0);
    
    // Average bounty amount
    const avgBountyAmount = bounties.length > 0
      ? bounties.reduce((sum: number, b: any) => sum + (b.bountyAmount || 0), 0) / bounties.length
      : 0;
    
    // Get submissions data
    const submissions = submissionSnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    }));
    
    // Define a type for submissions to include status
    type Submission = {
      id: string;
      status?: string;
      severity?: string;
    };

    // Count submissions by status
    const approvedSubmissions = submissions.filter((s: Submission) => s.status === 'approved').length;
    const rejectedSubmissions = submissions.filter((s: Submission) => s.status === 'rejected').length;
    const disputedSubmissions = submissions.filter((s: Submission) => s.status === 'disputed').length;
    const topAuditors = userSnapshot.docs.map(doc => ({
      id: doc.id,
      displayName: doc.data().displayName,
      reputation: doc.data().reputation,
      approvedSubmissions: doc.data().approvedSubmissions,
      photoURL: doc.data().photoURL
    }));
    
    // Create response with all stats
    const stats = {
      overview: {
        activeBounties,
        completedBounties,
        totalBounties: bounties.length,
        totalAmount,
        totalActiveAmount,
        totalSubmissions: submissions.length,
        avgBountyAmount
      },
      submissions: {
        byStatus: {
          approved: approvedSubmissions,
          rejected: rejectedSubmissions,
          disputed: disputedSubmissions
        },
        bySeverity: {
          low: submissions.filter((s: Submission) => s.severity === 'low').length,
          medium: submissions.filter((s: Submission) => s.severity === 'medium').length,
          high: submissions.filter((s: Submission) => s.severity === 'high').length
        }
      },
      topAuditors
    };
    
    res.status(200).json({ 
      success: true, 
      stats 
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get stats', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route GET /api/stats/bounties
 * @desc Get detailed bounty statistics
 * @access Public
 */
router.get('/bounties', async (req: Request, res: Response) => {
  try {
    // Get bounties
    const bountySnapshot = await db.collection('bounties').get();
    const bounties = bountySnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    }));
    
    // Define a type for bounties to include status and bountyAmount
    type Bounty = {
      id: string;
      status?: string;
      bountyAmount?: number;
      createdAt?: any;
    };
    
    // Count active and completed bounties
    const activeBounties = bounties.filter((b: Bounty) => b.status === 'active').length;
    const completedBounties = bounties.filter((b: Bounty) => b.status === 'completed').length;
    
    // Get recent bounties for trend analysis (last 30)
    const recentBounties = bounties.slice(0, 30);
    
    // Group bounties by creation date (by day)
    const bountyTrends = recentBounties.reduce((acc: Record<string, { count: number, amount: number }>, bounty: any) => {
      const date = new Date(bounty.createdAt).toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!acc[date]) {
        acc[date] = {
          count: 0,
          amount: 0
        };
      }
      acc[date].count += 1;
      acc[date].amount += bounty.bountyAmount || 0;
      
      return acc;
    }, {} as Record<string, { count: number, amount: number }>);
    
    // Convert to array for easier consumption by frontend
    const trends = Object.entries(bountyTrends).map(([date, stats]) => {
      const { count, amount } = stats as { count: number, amount: number };
      return {
        date,
        count,
        amount
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
    
    res.status(200).json({ 
      success: true, 
      stats: {
        totalBounties: bounties.length,
        activeBounties,
        completedBounties,
        trends
      }
    });
  } catch (error) {
    console.error('Get bounty stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get bounty stats', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route GET /api/stats/submissions
 * @desc Get detailed submission statistics
 * @access Public
 */
router.get('/submissions', async (req: Request, res: Response) => {
  try {
    // Get submissions
    const submissionSnapshot = await db.collection('submissions').get();
    const submissions = submissionSnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    }));
    
    // Define a type for submissions to include status
    type Submission = {
      id: string;
      status?: string;
      severity?: string;
    };
    
    // Count submissions by status
    const approvedSubmissions = submissions.filter((s: Submission) => s.status === 'approved').length;
    const rejectedSubmissions = submissions.filter((s: Submission) => s.status === 'rejected').length;
    const disputedSubmissions = submissions.filter((s: Submission) => s.status === 'disputed').length;
    
    // Calculate approval rate
    const approvalRate = submissions.length > 0
      ? (approvedSubmissions / submissions.length) * 100
      : 0;
    
    // Calculate rejection rate
    const rejectionRate = submissions.length > 0
      ? (rejectedSubmissions / submissions.length) * 100
      : 0;
    
    // Calculate dispute rate
    const disputeRate = submissions.length > 0
      ? (disputedSubmissions / submissions.length) * 100
      : 0;
    
    res.status(200).json({ 
      success: true, 
      stats: {
        total: submissions.length,
        byStatus: {
          approved: approvedSubmissions,
          rejected: rejectedSubmissions,
          disputed: disputedSubmissions
        },
        rates: {
          approval: approvalRate,
          rejection: rejectionRate,
          dispute: disputeRate
        }
      }
    });
  } catch (error) {
    console.error('Get submission stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get submission stats', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route GET /api/stats/users
 * @desc Get user statistics
 * @access Public
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    // Get top auditors
    const userSnapshot = await db.collection('users').orderBy('reputation', 'desc').limit(10).get();
    
    // Map to simplified format for response
    const auditors = userSnapshot.docs.map(doc => ({
      id: doc.id,
      displayName: doc.data().displayName,
      reputation: doc.data().reputation,
      approvedSubmissions: doc.data().approvedSubmissions,
      photoURL: doc.data().photoURL
    }));
    
    res.status(200).json({ 
      success: true, 
      stats: {
        topAuditors: auditors
      }
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get user stats', 
      error: (error as Error).message 
    });
  }
});

export default router; 