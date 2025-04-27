import { Router } from 'express';
import { AuthRequest, verifyFirebaseToken } from '../middleware/auth.middleware';
import { Response } from 'express';
import { AppError } from '../middleware/error.middleware';
import { db } from '../config/firebase';
import { Query, DocumentData, FieldValue } from 'firebase-admin/firestore';

// Define types for Firestore documents
interface Submission {
  id: string;
  bountyId: string;
  auditor: string;
  description: string;
  severity: string;
  pocUrl: string;
  fixUrl?: string;
  status: string;
  payoutAmount?: number;
  solanaAddress?: string;
  comments?: Array<{userId: string, text: string, timestamp: Date}>;
  createdAt: Date;
}

interface Bounty {
  id: string;
  owner: string;
  title: string;
  status: string;
  bountyAmount: number;
  severityWeights: Record<string, number>;
  solanaAddress?: string;
  createdAt: Date;
}

// Import Solana integration service (will need to be created)
import * as solanaService from '../services/solana.service';

const router = Router();

/**
 * @route POST /api/submission
 * @desc Create a new submission for a bounty
 * @access Private
 */
router.post('/', verifyFirebaseToken, async (req: AuthRequest, res: Response) => {
  try {
    const { uid } = req.user;
    const submissionData = req.body;
    
    // Validate required fields
    const requiredFields = ['bountyId', 'description', 'severity', 'pocUrl'];
    for (const field of requiredFields) {
      if (!submissionData[field]) {
        throw new AppError(`Missing required field: ${field}`, 400);
      }
    }
    
    // Verify that bounty exists and is active
    const bountyRef = db.collection('bounties').doc(submissionData.bountyId);
    const bountySnap = await bountyRef.get();
    
    if (!bountySnap.exists) {
      throw new AppError('Bounty not found', 404);
    }
    
    const bounty = { id: submissionData.bountyId, ...bountySnap.data() } as Bounty;
    
    if (bounty.status !== 'active') {
      throw new AppError('Cannot submit to a bounty that is not active', 400);
    }
    
    // Set auditor to current user and default status
    const newSubmission = {
      ...submissionData,
      auditor: uid,
      status: 'pending',
      createdAt: new Date()
    };
    
    // Create submission
    const submissionRef = await db.collection('submissions').add(newSubmission);
    const submission = { id: submissionRef.id, ...newSubmission } as Submission;
    
    // If Solana address is provided, call Solana contract to submit finding
    if (bounty.solanaAddress && submissionData.solanaAddress) {
      try {
        await solanaService.submitFinding(
          bounty.solanaAddress,
          submissionData.solanaAddress,
          submissionData.severity,
          submissionData.description
        );
      } catch (error) {
        console.error('Solana contract error:', error);
        // Continue even if Solana contract call failed
      }
    }
    
    res.status(201).json({ 
      success: true, 
      submission 
    });
  } catch (error) {
    console.error('Create submission error:', error);
    const statusCode = (error as AppError).statusCode || 500;
    res.status(statusCode).json({ 
      success: false, 
      message: 'Failed to create submission', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route GET /api/submission/:bountyId
 * @desc Get submissions for a bounty
 * @access Public (basic info) / Private (full details)
 */
router.get('/bounty/:bountyId', async (req, res: Response) => {
  try {
    const { bountyId } = req.params;
    const { status, severity, sortBy = 'createdAt', sortOrder = 'desc', limit = 20, startAfter } = req.query;
    
    let query: Query<DocumentData> = db.collection('submissions').where('bountyId', '==', bountyId);
    
    // Apply filters
    if (status) query = query.where('status', '==', status);
    if (severity) query = query.where('severity', '==', severity);
    
    // Apply sorting
    query = query.orderBy(sortBy as string, sortOrder === 'asc' ? 'asc' : 'desc');
    
    // Apply pagination
    if (startAfter) {
      const startAfterDoc = await db.collection('submissions').doc(startAfter as string).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }
    
    // Apply limit
    query = query.limit(Number(limit));
    
    // Execute query
    const submissionsSnap = await query.get();
    
    // Process results
    const submissions: Submission[] = [];
    const lastDoc = submissionsSnap.docs[submissionsSnap.docs.length - 1];
    
    submissionsSnap.forEach(doc => {
      submissions.push({ id: doc.id, ...doc.data() } as Submission);
    });
    
    res.status(200).json({ 
      success: true, 
      submissions,
      lastDoc: lastDoc ? lastDoc.id : null,
      count: submissions.length
    });
  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get submissions', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route GET /api/submission/:id
 * @desc Get a submission by ID
 * @access Public (basic info) / Private (full details)
 */
router.get('/:id', async (req, res: Response) => {
  try {
    const { id } = req.params;
    
    const submissionRef = db.collection('submissions').doc(id);
    const submissionSnap = await submissionRef.get();
    
    if (!submissionSnap.exists) {
      return res.status(404).json({ 
        success: false, 
        message: 'Submission not found' 
      });
    }
    
    const submission = { id, ...submissionSnap.data() } as Submission;
    
    res.status(200).json({ 
      success: true, 
      submission 
    });
  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get submission', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route PUT /api/submission/:id/approve
 * @desc Approve a submission
 * @access Private (bounty owner only)
 */
router.put('/:id/approve', verifyFirebaseToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { uid } = req.user;
    const { payoutAmount, reviewNotes } = req.body;
    
    // Get submission
    const submissionRef = db.collection('submissions').doc(id);
    const submissionSnap = await submissionRef.get();
    
    if (!submissionSnap.exists) {
      throw new AppError('Submission not found', 404);
    }
    
    const submission = { id, ...submissionSnap.data() } as Submission;
    
    // Get bounty to verify ownership
    const bountyRef = db.collection('bounties').doc(submission.bountyId);
    const bountySnap = await bountyRef.get();
    
    if (!bountySnap.exists) {
      throw new AppError('Bounty not found', 404);
    }
    
    const bounty = { id: submission.bountyId, ...bountySnap.data() } as Bounty;
    
    // Check if user is the bounty owner
    if (bounty.owner !== uid) {
      throw new AppError('Not authorized to approve this submission', 403);
    }
    
    // Check if submission can be approved
    if (submission.status !== 'pending') {
      throw new AppError(`Cannot approve a submission with status: ${submission.status}`, 400);
    }
    
    // Calculate payout if not provided
    let finalPayoutAmount = payoutAmount;
    if (!finalPayoutAmount) {
      // Use severity weights from bounty to calculate
      const severityWeight = bounty.severityWeights[submission.severity] || 0;
      finalPayoutAmount = (bounty.bountyAmount * severityWeight) / 100;
    }
    
    // Approve submission - update the document
    const updateData = {
      status: 'approved',
      payoutAmount: finalPayoutAmount,
      reviewNotes: reviewNotes || '',
      approvedAt: new Date(),
      approvedBy: uid
    };
    
    await submissionRef.update(updateData);
    
    // Get updated submission data
    const updatedSubmissionSnap = await submissionRef.get();
    const approvedSubmission = { id, ...updatedSubmissionSnap.data() } as Submission;
    
    // If Solana addresses exist, trigger payout on Solana
    if (bounty.solanaAddress && submission.solanaAddress) {
      try {
        await solanaService.approveFinding(
          bounty.solanaAddress,
          submission.solanaAddress,
          finalPayoutAmount
        );
      } catch (error) {
        console.error('Solana contract error:', error);
        // Continue even if Solana contract call failed
      }
    }
    
    res.status(200).json({ 
      success: true, 
      submission: approvedSubmission 
    });
  } catch (error) {
    console.error('Approve submission error:', error);
    const statusCode = (error as AppError).statusCode || 500;
    res.status(statusCode).json({ 
      success: false, 
      message: 'Failed to approve submission', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route PUT /api/submission/:id/reject
 * @desc Reject a submission
 * @access Private (bounty owner only)
 */
router.put('/:id/reject', verifyFirebaseToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { uid } = req.user;
    const { rejectionReason } = req.body;
    
    if (!rejectionReason) {
      throw new AppError('Rejection reason is required', 400);
    }
    
    // Get submission
    const submissionRef = db.collection('submissions').doc(id);
    const submissionSnap = await submissionRef.get();
    
    if (!submissionSnap.exists) {
      throw new AppError('Submission not found', 404);
    }
    
    const submission = { id, ...submissionSnap.data() } as Submission;
    
    // Get bounty to verify ownership
    const bountyRef = db.collection('bounties').doc(submission.bountyId);
    const bountySnap = await bountyRef.get();
    
    if (!bountySnap.exists) {
      throw new AppError('Bounty not found', 404);
    }
    
    const bounty = { id: submission.bountyId, ...bountySnap.data() } as Bounty;
    
    // Check if user is the bounty owner
    if (bounty.owner !== uid) {
      throw new AppError('Not authorized to reject this submission', 403);
    }
    
    // Check if submission can be rejected
    if (submission.status !== 'pending') {
      throw new AppError(`Cannot reject a submission with status: ${submission.status}`, 400);
    }
    
    // Reject submission - update the document
    const updateData = {
      status: 'rejected',
      rejectionReason,
      rejectedAt: new Date(),
      rejectedBy: uid
    };
    
    await submissionRef.update(updateData);
    
    // Get updated submission data
    const updatedSubmissionSnap = await submissionRef.get();
    const rejectedSubmission = { id, ...updatedSubmissionSnap.data() } as Submission;
    
    // If Solana addresses exist, update on Solana
    if (bounty.solanaAddress && submission.solanaAddress) {
      try {
        await solanaService.rejectFinding(
          bounty.solanaAddress,
          submission.solanaAddress
        );
      } catch (error) {
        console.error('Solana contract error:', error);
        // Continue even if Solana contract call failed
      }
    }
    
    res.status(200).json({ 
      success: true, 
      submission: rejectedSubmission 
    });
  } catch (error) {
    console.error('Reject submission error:', error);
    const statusCode = (error as AppError).statusCode || 500;
    res.status(statusCode).json({ 
      success: false, 
      message: 'Failed to reject submission', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route GET /api/submission/user/:auditorId
 * @desc Get submissions by auditor
 * @access Public (for the auditor profile) / Private (full details for the auditor)
 */
router.get('/user/:auditorId', async (req, res: Response) => {
  try {
    const { auditorId } = req.params;
    const { status, sortBy = 'createdAt', sortOrder = 'desc', limit = 20, startAfter } = req.query;
    
    let query: Query<DocumentData> = db.collection('submissions').where('auditor', '==', auditorId);
    
    // Apply filters
    if (status) query = query.where('status', '==', status);
    
    // Apply sorting
    query = query.orderBy(sortBy as string, sortOrder === 'asc' ? 'asc' : 'desc');
    
    // Apply pagination
    if (startAfter) {
      const startAfterDoc = await db.collection('submissions').doc(startAfter as string).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }
    
    // Apply limit
    query = query.limit(Number(limit));
    
    // Execute query
    const submissionsSnap = await query.get();
    
    // Process results
    const submissions: Submission[] = [];
    const lastDoc = submissionsSnap.docs[submissionsSnap.docs.length - 1];
    
    submissionsSnap.forEach(doc => {
      submissions.push({ id: doc.id, ...doc.data() } as Submission);
    });
    
    res.status(200).json({ 
      success: true, 
      submissions,
      lastDoc: lastDoc ? lastDoc.id : null,
      count: submissions.length
    });
  } catch (error) {
    console.error('Get auditor submissions error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get auditor submissions', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route PUT /api/submission/:id/comment
 * @desc Add comment to a submission
 * @access Private
 */
router.post('/:id/comment', verifyFirebaseToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { uid } = req.user;
    const { text } = req.body;
    
    if (!text) {
      throw new AppError('Comment text is required', 400);
    }
    
    // Check if submission exists
    const submissionRef = db.collection('submissions').doc(id);
    const submissionSnap = await submissionRef.get();
    
    if (!submissionSnap.exists) {
      throw new AppError('Submission not found', 404);
    }
    
    const submission = { id, ...submissionSnap.data() } as Submission;
    
    // Add comment
    const comment = {
      userId: uid,
      text,
      timestamp: new Date()
    };
    
    // Update the document - add to comments array
    await submissionRef.update({
      comments: FieldValue.arrayUnion(comment)
    });
    
    // Get updated submission data
    const updatedSubmissionSnap = await submissionRef.get();
    const updatedSubmission = { id, ...updatedSubmissionSnap.data() } as Submission;
    
    res.status(200).json({ 
      success: true, 
      submission: updatedSubmission 
    });
  } catch (error) {
    console.error('Add comment error:', error);
    const statusCode = (error as AppError).statusCode || 500;
    res.status(statusCode).json({ 
      success: false, 
      message: 'Failed to add comment', 
      error: (error as Error).message 
    });
  }
});

export default router; 