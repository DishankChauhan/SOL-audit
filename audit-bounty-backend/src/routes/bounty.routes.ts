import { Router } from 'express';
import { AuthRequest, verifyFirebaseToken } from '../middleware/auth.middleware';
import { Response, Request } from 'express';
import { AppError } from '../middleware/error.middleware';
import { db } from '../config/firebase';
import { DocumentData, QueryDocumentSnapshot, CollectionReference, Timestamp, Query, FieldValue } from 'firebase-admin/firestore';
import { ParsedQs } from 'qs';

// Import Solana integration service (assuming it exists)
import * as solanaService from '../services/solana.service';

const router = Router();

// Define interfaces for our document types
interface IBounty {
  id: string;
  owner: string;
  title: string;
  description: string;
  repoUrl: string;
  bountyAmount: number;
  bountyToken: string;
  tokenMint?: string;
  deadline: Timestamp | Date;
  status: string;
  submissionCount: number;
  approvedCount: number;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  solanaAddress?: string;
  tags?: string[];
}

// Helper function to convert document to typed bounty
function documentToBounty(doc: QueryDocumentSnapshot<DocumentData>): IBounty {
  const data = doc.data();
  return {
    id: doc.id,
    owner: data.owner || '',
    title: data.title || '',
    description: data.description || '',
    repoUrl: data.repoUrl || '',
    bountyAmount: data.bountyAmount || 0,
    bountyToken: data.bountyToken || '',
    tokenMint: data.tokenMint,
    deadline: data.deadline || Timestamp.now(),
    status: data.status || 'draft',
    submissionCount: data.submissionCount || 0,
    approvedCount: data.approvedCount || 0,
    createdAt: data.createdAt || Timestamp.now(),
    updatedAt: data.updatedAt || Timestamp.now(),
    solanaAddress: data.solanaAddress,
    tags: data.tags || []
  };
}

/**
 * @route POST /api/bounty/create
 * @desc Create a new bounty
 * @access Private
 */
router.post('/create', verifyFirebaseToken, async (req: AuthRequest, res: Response) => {
  try {
    const { uid } = req.user;
    const bountyData = req.body;
    
    // Validate required fields
    const requiredFields = ['title', 'description', 'repoUrl', 'bountyAmount', 'bountyToken', 'deadline'];
    for (const field of requiredFields) {
      if (!bountyData[field]) {
        throw new AppError(`Missing required field: ${field}`, 400);
      }
    }
    
    // Set owner to current user
    bountyData.owner = uid;
    bountyData.createdAt = new Date();
    bountyData.updatedAt = new Date();
    bountyData.status = bountyData.status || 'active';
    bountyData.submissionCount = 0;
    bountyData.approvedCount = 0;
    
    // Create bounty in Firestore
    const bountyRef = await db.collection('bounties').add(bountyData);
    const bounty = { id: bountyRef.id, ...bountyData } as IBounty;
    
    // If Solana address is provided, call Solana contract to initialize bounty
    if (bountyData.solanaAddress) {
      try {
        await solanaService.initializeBounty(
          bountyData.solanaAddress,
          bountyData.bountyAmount,
          bountyData.bountyToken,
          bountyData.deadline
        );
      } catch (error) {
        console.error('Solana contract error:', error);
        // Continue even if Solana contract call failed
        // We'll handle this separately
      }
    }
    
    res.status(201).json({ 
      success: true, 
      bounty 
    });
  } catch (error) {
    console.error('Create bounty error:', error);
    const statusCode = (error as AppError).statusCode || 500;
    res.status(statusCode).json({ 
      success: false, 
      message: 'Failed to create bounty', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route GET /api/bounty/list
 * @desc Get list of bounties with filters
 * @access Public
 */
router.get('/list', async (req, res: Response) => {
  try {
    const { 
      status, 
      owner, 
      minAmount, 
      maxAmount, 
      tags, 
      sortBy = 'createdAt', 
      sortOrder = 'desc', 
      limit = 10,
      startAfter = null
    } = req.query;
    
    // Build query
    let query: Query<DocumentData> = db.collection('bounties');
    
    // Apply filters
    if (status) query = query.where('status', '==', status);
    if (owner) query = query.where('owner', '==', owner);
    
    // Apply sorting
    query = query.orderBy(sortBy as string, sortOrder as any);
    
    // Apply pagination
    if (startAfter) {
      const startAfterDoc = await db.collection('bounties').doc(startAfter as string).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }
    
    // Apply limit
    query = query.limit(Number(limit));
    
    // Execute query
    const snapshot = await query.get();
    
    // Process results
    const bounties: IBounty[] = [];
    snapshot.forEach((doc: QueryDocumentSnapshot<DocumentData>) => {
      const data = doc.data();
      
      // Apply client-side filtering for complex filters
      if (minAmount && data.bountyAmount < Number(minAmount)) return;
      if (maxAmount && data.bountyAmount > Number(maxAmount)) return;
      if (tags) {
        const tagList = Array.isArray(tags) ? tags : typeof tags === 'string' ? [tags] : [];
        if (tagList.length > 0 && (!data.tags || !tagList.some(tag => data.tags.includes(tag)))) return;
      }
      
      bounties.push({
        id: doc.id,
        ...data
      } as IBounty);
    });
    
    // Get last document for pagination
    const lastVisible = snapshot.size > 0 ? snapshot.docs[snapshot.size - 1] : null;
    
    res.status(200).json({ 
      success: true, 
      bounties,
      pagination: {
        lastVisible: lastVisible ? lastVisible.id : null,
        hasMore: snapshot.size >= Number(limit)
      }
    });
  } catch (error) {
    console.error('List bounties error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to list bounties', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route GET /api/bounty/:id
 * @desc Get a bounty by ID
 * @access Public
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const bountyDoc = await db.collection('bounties').doc(id).get();
    
    if (!bountyDoc.exists) {
      res.status(404).json({ 
        success: false, 
        message: 'Bounty not found' 
      });
      return;
    }
    
    const bounty = {
      id: bountyDoc.id,
      ...bountyDoc.data()
    } as IBounty;
    
    res.status(200).json({ 
      success: true, 
      bounty 
    });
  } catch (error) {
    console.error('Get bounty error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get bounty', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route PUT /api/bounty/:id
 * @desc Update a bounty
 * @access Private
 */
router.put('/:id', verifyFirebaseToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { uid } = req.user;
    const updateData = req.body;
    
    // Check if bounty exists
    const bountyDoc = await db.collection('bounties').doc(id).get();
    
    if (!bountyDoc.exists) {
      res.status(404).json({ 
        success: false, 
        message: 'Bounty not found' 
      });
      return;
    }
    
    const bounty = {
      id: bountyDoc.id,
      ...bountyDoc.data()
    } as IBounty;
    
    // Check if user is the owner
    if (bounty.owner !== uid) {
      res.status(403).json({ 
        success: false, 
        message: 'Not authorized to update this bounty' 
      });
      return;
    }
    
    // Prevent updating certain fields
    delete updateData.owner;
    delete updateData.createdAt;
    delete updateData.submissionCount;
    delete updateData.approvedCount;
    
    // Add updated timestamp
    updateData.updatedAt = new Date();
    
    // Update bounty
    await db.collection('bounties').doc(id).update(updateData);
    
    // Get updated bounty
    const updatedBountyDoc = await db.collection('bounties').doc(id).get();
    const updatedBounty = {
      id: updatedBountyDoc.id,
      ...updatedBountyDoc.data()
    } as IBounty;
    
    // If status is being updated to 'completed' or 'cancelled', update on Solana too
    if (
      updateData.status && 
      (updateData.status === 'completed' || updateData.status === 'cancelled') && 
      bounty.solanaAddress
    ) {
      try {
        if (updateData.status === 'completed') {
          await solanaService.completeBounty(bounty.solanaAddress);
        } else if (updateData.status === 'cancelled') {
          await solanaService.cancelBounty(bounty.solanaAddress);
        }
      } catch (error) {
        console.error('Solana contract error:', error);
        // Continue even if Solana contract call failed
      }
    }
    
    res.status(200).json({ 
      success: true, 
      bounty: updatedBounty 
    });
  } catch (error) {
    console.error('Update bounty error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update bounty', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route DELETE /api/bounty/:id
 * @desc Delete a bounty
 * @access Private
 */
router.delete('/:id', verifyFirebaseToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { uid } = req.user;
    
    // Check if bounty exists
    const bountyDoc = await db.collection('bounties').doc(id).get();
    
    if (!bountyDoc.exists) {
      res.status(404).json({ 
        success: false, 
        message: 'Bounty not found' 
      });
      return;
    }
    
    const bounty = {
      id: bountyDoc.id,
      ...bountyDoc.data()
    };
    
    // Check if user is the owner
    if ((bounty as any).owner !== uid) {
      res.status(403).json({ 
        success: false, 
        message: 'Not authorized to delete this bounty' 
      });
      return;
    }
    
    // Check if can be deleted (only if status is not 'active')
    if ((bounty as any).status === 'active') {
      res.status(400).json({ 
        success: false, 
        message: 'Cannot delete an active bounty. Cancel it first.' 
      });
      return;
    }
    
    // Delete bounty
    await db.collection('bounties').doc(id).delete();
    
    res.status(200).json({ 
      success: true, 
      message: 'Bounty deleted successfully' 
    });
  } catch (error) {
    console.error('Delete bounty error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete bounty', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route PUT /api/bounty/:id/link-solana
 * @desc Link a Solana address to a bounty
 * @access Private
 */
router.put('/:id/link-solana', verifyFirebaseToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { uid } = req.user;
    const { solanaAddress } = req.body;
    
    if (!solanaAddress) {
      res.status(400).json({ 
        success: false, 
        message: 'Solana address is required' 
      });
      return;
    }
    
    // Check if bounty exists
    const bountyDoc = await db.collection('bounties').doc(id).get();
    
    if (!bountyDoc.exists) {
      res.status(404).json({ 
        success: false, 
        message: 'Bounty not found' 
      });
      return;
    }
    
    const bounty = {
      id: bountyDoc.id,
      ...bountyDoc.data()
    };
    
    // Check if user is the owner
    if ((bounty as any).owner !== uid) {
      res.status(403).json({ 
        success: false, 
        message: 'Not authorized to update this bounty' 
      });
      return;
    }
    
    // Link Solana address
    await db.collection('bounties').doc(id).update({
      solanaAddress,
      updatedAt: new Date()
    });
    
    // Get updated bounty
    const updatedBountyDoc = await db.collection('bounties').doc(id).get();
    const updatedBounty = {
      id: updatedBountyDoc.id,
      ...updatedBountyDoc.data()
    };
    
    res.status(200).json({ 
      success: true, 
      bounty: updatedBounty 
    });
  } catch (error) {
    console.error('Link Solana address error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to link Solana address', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route GET /api/bounty/
 * @desc Get list of bounties with filters
 * @access Public
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { 
      status, 
      owner, 
      minAmount, 
      maxAmount, 
      tags, 
      sort = 'createdAt', 
      order = 'desc',
      limit = 10,
      startAfter = null
    } = req.query;
    
    // Build query
    let query: Query<DocumentData> = db.collection('bounties');
    
    // Apply filters
    if (status) query = query.where('status', '==', status);
    if (owner) query = query.where('owner', '==', owner);
    
    // Apply sorting
    query = query.orderBy(sort as string, order as any);
    
    // Apply pagination
    if (startAfter) {
      const startAfterDoc = await db.collection('bounties').doc(startAfter as string).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }
    
    // Apply limit
    query = query.limit(Number(limit));
    
    // Execute query
    const snapshot = await query.get();
    
    // Process results
    const bounties: any[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Apply client-side filtering for complex filters
      if (minAmount && data.bountyAmount < Number(minAmount)) return;
      if (maxAmount && data.bountyAmount > Number(maxAmount)) return;
      if (tags) {
        const tagList = Array.isArray(tags) ? tags : typeof tags === 'string' ? [tags] : [];
        if (tagList.length > 0 && (!data.tags || !tagList.some(tag => data.tags.includes(tag)))) return;
      }
      
      bounties.push({
        id: doc.id,
        ...data
      });
    });
    
    // Get last document for pagination
    const lastVisible = snapshot.size > 0 ? snapshot.docs[snapshot.size - 1] : null;
    
    res.status(200).json({ 
      success: true, 
      bounties,
      pagination: {
        lastVisible: lastVisible ? lastVisible.id : null,
        hasMore: snapshot.size >= Number(limit)
      }
    });
  } catch (error) {
    console.error('Get all bounties error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch bounties', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route GET /api/bounty/search
 * @desc Search bounties by title or tags
 * @access Public
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { query, tags, limit = '10' } = req.query;
    const limitNum = parseInt(typeof limit === 'string' ? limit : '10', 10) || 10;
    
    // Get bounties collection reference with proper type
    const bountiesCollection = db.collection('bounties');
    
    // Initial query - only get active bounties
    const queryRef = bountiesCollection.where('status', '==', 'active')
      .limit(limitNum);
    
    const querySnapshot = await queryRef.get();
    
    // Filter results client-side based on search query or tags
    const searchQuery = typeof query === 'string' ? query.toLowerCase() : '';
    const tagList = Array.isArray(tags) 
      ? tags 
      : typeof tags === 'string' ? [tags] : [];
    
    const bounties: IBounty[] = [];
    querySnapshot.forEach((doc) => {
      const bounty = documentToBounty(doc);
      
      // Filter by search query (title or description)
      if (searchQuery && !(
        bounty.title.toLowerCase().includes(searchQuery) || 
        bounty.description.toLowerCase().includes(searchQuery)
      )) {
        return;
      }
      
      // Filter by tags
      if (tagList.length > 0 && (!bounty.tags || !tagList.some(tag => bounty.tags!.includes(tag as string)))) {
        return;
      }
      
      bounties.push(bounty);
    });
    
    res.status(200).json({ 
      success: true, 
      bounties 
    });
  } catch (error) {
    console.error('Search bounties error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to search bounties', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route GET /api/bounty/stats
 * @desc Get bounty statistics
 * @access Public
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Get bounties collection reference
    const bountiesCollection = db.collection('bounties');
    
    // Get active bounties
    const activeQuery = bountiesCollection.where('status', '==', 'active');
    const activeSnapshot = await activeQuery.get();
    
    // Get completed bounties
    const completedQuery = bountiesCollection.where('status', '==', 'completed');
    const completedSnapshot = await completedQuery.get();
    
    // Calculate total amounts
    let totalActiveAmount = 0;
    let totalCompletedAmount = 0;
    
    activeSnapshot.forEach((doc) => {
      const data = doc.data();
      totalActiveAmount += data.bountyAmount || 0;
    });
    
    completedSnapshot.forEach((doc) => {
      const data = doc.data();
      totalCompletedAmount += data.bountyAmount || 0;
    });
    
    res.status(200).json({ 
      success: true, 
      stats: {
        activeBounties: activeSnapshot.size,
        completedBounties: completedSnapshot.size,
        totalActiveAmount,
        totalCompletedAmount
      }
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
 * @route POST /api/bounty
 * @desc Create a new bounty
 * @access Private
 */
router.post('/', verifyFirebaseToken, async (req: AuthRequest, res: Response) => {
  try {
    const { uid } = req.user;
    const bountyData = {
      ...req.body,
      owner: uid,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active',
      submissionCount: 0,
      approvedCount: 0
    };
    
    // Validate required fields
    const requiredFields = ['title', 'description', 'repoUrl', 'bountyAmount', 'tokenMint', 'deadline'];
    for (const field of requiredFields) {
      if (!bountyData[field]) {
        res.status(400).json({ 
          success: false, 
          message: `Missing required field: ${field}` 
        });
        return;
      }
    }
    
    // Validate deadline is in the future
    const deadline = new Date(bountyData.deadline);
    if (deadline <= new Date()) {
      res.status(400).json({ 
        success: false, 
        message: 'Deadline must be in the future' 
      });
      return;
    }
    
    // Validate bounty amount
    if (bountyData.bountyAmount <= 0) {
      res.status(400).json({ 
        success: false, 
        message: 'Bounty amount must be greater than 0' 
      });
      return;
    }
    
    // Create bounty
    const bountyRef = await db.collection('bounties').add(bountyData);
    const newBounty = { id: bountyRef.id, ...bountyData };
    
    res.status(201).json({ 
      success: true, 
      bounty: newBounty 
    });
  } catch (error) {
    console.error('Create bounty error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create bounty', 
      error: (error as Error).message 
    });
  }
});

export default router; 