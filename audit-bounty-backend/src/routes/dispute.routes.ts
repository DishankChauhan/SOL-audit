import { Router } from 'express';
import { AuthRequest, verifyFirebaseToken, requireModerator } from '../middleware/auth.middleware';
import { Response } from 'express';
import { AppError } from '../middleware/error.middleware';
import { db } from '../config/firebase';
import { Query, DocumentData } from 'firebase-admin/firestore';

// Import Solana integration service (will need to be created)
import * as solanaService from '../services/solana.service';

// Define types for Firestore documents
interface Submission {
  id: string;
  bountyId: string;
  auditor: string;
  description: string;
  severity: string;
  pocUrl: string;
  fixUrl: string;
  status: string;
  payoutAmount: number;
  solanaAddress?: string;
  createdAt: Date;
}

interface Bounty {
  id: string;
  owner: string;
  title: string;
  description: string;
  repoUrl: string;
  bountyAmount: number;
  deadline: Date;
  status: string;
  solanaAddress?: string;
  createdAt: Date;
}

interface Dispute {
  id: string;
  submissionId: string;
  auditorId: string;
  bountyId: string;
  reason: string;
  status: string;
  resolution?: string;
  feedback?: string;
  resolvedById?: string;
  resolvedAt?: Date;
  createdAt: Date;
}

const router = Router();

/**
 * @route POST /api/dispute/initiate
 * @desc Initiate a dispute for a submission
 * @access Private (submission owner or bounty owner)
 */
router.post('/initiate', verifyFirebaseToken, async (req: AuthRequest, res: Response) => {
  try {
    const { uid } = req.user;
    const { submissionId, reason } = req.body;
    
    if (!submissionId || !reason) {
      throw new AppError('Submission ID and reason are required', 400);
    }
    
    // Get submission
    const submissionRef = db.collection('submissions').doc(submissionId);
    const submissionSnap = await submissionRef.get();
    
    if (!submissionSnap.exists) {
      throw new AppError('Submission not found', 404);
    }
    
    const submission = { id: submissionId, ...submissionSnap.data() } as Submission;
    
    // Get bounty
    const bountyRef = db.collection('bounties').doc(submission.bountyId);
    const bountySnap = await bountyRef.get();
    
    if (!bountySnap.exists) {
      throw new AppError('Bounty not found', 404);
    }
    
    const bounty = { id: submission.bountyId, ...bountySnap.data() } as Bounty;
    
    // Check if user is the auditor or bounty owner
    const isAuditor = submission.auditor === uid;
    const isBountyOwner = bounty.owner === uid;
    
    if (!isAuditor && !isBountyOwner) {
      throw new AppError('Not authorized to initiate dispute for this submission', 403);
    }
    
    // Check if submission status allows dispute
    if (submission.status !== 'approved' && submission.status !== 'rejected') {
      throw new AppError(`Cannot dispute a submission with status: ${submission.status}`, 400);
    }
    
    // Check if already disputed
    if (submission.status === 'approved' || submission.status === 'rejected') {
      throw new AppError('Submission is already disputed', 400);
    }
    
    // Create dispute
    const disputeData = {
      submissionId,
      auditorId: submission.auditor,
      bountyId: submission.bountyId,
      reason,
      status: 'pending',
      createdAt: new Date()
    } as Dispute;
    
    const disputeRef = await db.collection('disputes').add(disputeData);
    const dispute = { ...disputeData, id: disputeRef.id };
    
    // If Solana addresses exist, initiate dispute on Solana
    if (bounty.solanaAddress && submission.solanaAddress) {
      try {
        await solanaService.initiateDispute(
          bounty.solanaAddress,
          submission.solanaAddress,
          reason
        );
      } catch (error) {
        console.error('Solana contract error:', error);
        // Continue even if Solana contract call failed
      }
    }
    
    res.status(201).json({ 
      success: true, 
      dispute 
    });
  } catch (error) {
    console.error('Initiate dispute error:', error);
    const statusCode = (error as AppError).statusCode || 500;
    res.status(statusCode).json({ 
      success: false, 
      message: 'Failed to initiate dispute', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route GET /api/dispute/list
 * @desc Get list of disputes with filters
 * @access Public/Private (filtered based on role)
 */
router.get('/list', async (req, res: Response) => {
  try {
    const { status, submissionId, auditorId, bountyId, limit = 20, startAfter } = req.query;
    
    let query: Query<DocumentData> = db.collection('disputes');
    
    // Apply filters
    if (status) query = query.where('status', '==', status);
    if (submissionId) query = query.where('submissionId', '==', submissionId);
    if (auditorId) query = query.where('auditorId', '==', auditorId);
    if (bountyId) query = query.where('bountyId', '==', bountyId);
    
    // Apply sorting
    query = query.orderBy('createdAt', 'desc');
    
    // Apply pagination
    if (startAfter) {
      const startAfterDoc = await db.collection('disputes').doc(startAfter as string).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }
    
    // Apply limit
    query = query.limit(Number(limit));
    
    // Execute query
    const disputesSnap = await query.get();
    
    // Process results
    const disputes: Dispute[] = [];
    const lastDoc = disputesSnap.docs[disputesSnap.docs.length - 1];
    
    disputesSnap.forEach(doc => {
      disputes.push({ id: doc.id, ...doc.data() } as Dispute);
    });
    
    res.status(200).json({ 
      success: true, 
      disputes,
      lastDoc: lastDoc ? lastDoc.id : null,
      count: disputes.length
    });
  } catch (error) {
    console.error('List disputes error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to list disputes', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route GET /api/dispute/:id
 * @desc Get a dispute by ID
 * @access Public/Private (filtered based on role)
 */
router.get('/:id', async (req, res: Response) => {
  try {
    const { id } = req.params;
    
    const disputeRef = db.collection('disputes').doc(id);
    const disputeSnap = await disputeRef.get();
    
    if (!disputeSnap.exists) {
      return res.status(404).json({ 
        success: false, 
        message: 'Dispute not found' 
      });
    }
    
    const dispute = { id, ...disputeSnap.data() } as Dispute;
    
    res.status(200).json({ 
      success: true, 
      dispute 
    });
  } catch (error) {
    console.error('Get dispute error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get dispute', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route PUT /api/dispute/:id/resolve
 * @desc Resolve a dispute
 * @access Private (moderators only)
 */
router.put('/:id/resolve', verifyFirebaseToken, requireModerator, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { uid } = req.user;
    const { resolution, feedback } = req.body;
    
    if (!resolution || !feedback) {
      throw new AppError('Resolution and feedback are required', 400);
    }
    
    // Validate resolution
    if (resolution !== 'auditor' && resolution !== 'owner') {
      throw new AppError('Resolution must be either "auditor" or "owner"', 400);
    }
    
    // Get dispute
    const disputeRef = db.collection('disputes').doc(id);
    const disputeSnap = await disputeRef.get();
    
    if (!disputeSnap.exists) {
      throw new AppError('Dispute not found', 404);
    }
    
    const dispute = { id, ...disputeSnap.data() } as Dispute;
    
    // Check if dispute can be resolved
    if (dispute.status !== 'pending') {
      throw new AppError('This dispute has already been resolved', 400);
    }
    
    // Resolve dispute - update the document
    const updateData = {
      status: 'resolved',
      resolution,
      feedback,
      resolvedById: uid,
      resolvedAt: new Date()
    };
    
    await disputeRef.update(updateData);
    
    // Get updated dispute data
    const updatedDisputeSnap = await disputeRef.get();
    const resolvedDispute = { id, ...updatedDisputeSnap.data() } as Dispute;
    
    // Get submission and bounty to update on Solana
    const submissionRef = db.collection('submissions').doc(dispute.submissionId);
    const submissionSnap = await submissionRef.get();
    const submission = submissionSnap.exists ? { id: dispute.submissionId, ...submissionSnap.data() } as Submission : null;
    
    const bountyRef = submission ? db.collection('bounties').doc(submission.bountyId) : null;
    const bountySnap = bountyRef ? await bountyRef.get() : null;
    const bounty = bountySnap && bountySnap.exists && submission ? 
      { id: submission.bountyId, ...bountySnap.data() } as Bounty : null;
    
    // If Solana addresses exist, resolve dispute on Solana
    if (bounty && bounty.solanaAddress && submission && submission.solanaAddress) {
      try {
        await solanaService.resolveDispute(
          bounty.solanaAddress,
          submission.solanaAddress,
          resolution === 'auditor'
        );
      } catch (error) {
        console.error('Solana contract error:', error);
        // Continue even if Solana contract call failed
      }
    }
    
    res.status(200).json({ 
      success: true, 
      dispute: resolvedDispute 
    });
  } catch (error) {
    console.error('Resolve dispute error:', error);
    const statusCode = (error as AppError).statusCode || 500;
    res.status(statusCode).json({ 
      success: false, 
      message: 'Failed to resolve dispute', 
      error: (error as Error).message 
    });
  }
});

export default router; 