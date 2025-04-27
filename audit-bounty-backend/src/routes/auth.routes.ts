import { Router } from 'express';
import { AuthRequest, verifyFirebaseToken } from '../middleware/auth.middleware';
import { Response } from 'express';
import { db, auth } from '../config/firebase';

const router = Router();

/**
 * @route POST /api/auth/login
 * @desc Verify user token and return user data
 * @access Public
 */
router.post('/login', verifyFirebaseToken, async (req: AuthRequest, res: Response) => {
  try {
    const { uid, email, name, picture } = req.user;

    // Get or create user in Firestore
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();

    let userData;
    if (userSnap.exists) {
      // Update existing user
      const updateData = {
        email: email || '',
        displayName: name || '',
        photoURL: picture || '',
        lastLogin: new Date()
      };
      
      await userRef.update(updateData);
      userData = { id: uid, ...userSnap.data(), ...updateData };
    } else {
      // Create new user
      const newUser = {
        email: email || '',
        displayName: name || '',
        photoURL: picture || '',
        role: 'contributor', // Default role
        createdAt: new Date(),
        lastLogin: new Date()
      };
      
      await userRef.set(newUser);
      userData = { id: uid, ...newUser };
    }

    res.status(200).json({ 
      success: true, 
      user: userData
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to login', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route GET /api/auth/me
 * @desc Get current authenticated user
 * @access Private
 */
router.get('/me', verifyFirebaseToken, async (req: AuthRequest, res: Response) => {
  try {
    const { uid } = req.user;
    
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
      return;
    }
    
    const userData = { id: uid, ...userSnap.data() };
    
    res.status(200).json({ 
      success: true, 
      user: userData
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get user', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route PUT /api/auth/profile
 * @desc Update user profile
 * @access Private
 */
router.put('/profile', verifyFirebaseToken, async (req: AuthRequest, res: Response) => {
  try {
    const { uid } = req.user;
    const profileData = req.body;
    
    // Prevent updating sensitive fields
    delete profileData.role;
    delete profileData.createdAt;
    
    // Add updated timestamp
    profileData.updatedAt = new Date();
    
    const userRef = db.collection('users').doc(uid);
    await userRef.update(profileData);
    
    // Get updated user data
    const userSnap = await userRef.get();
    const userData = { id: uid, ...userSnap.data() };
    
    res.status(200).json({ 
      success: true, 
      user: userData
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update profile', 
      error: (error as Error).message 
    });
  }
});

/**
 * @route PUT /api/auth/wallet
 * @desc Link wallet address to user
 * @access Private
 */
router.put('/wallet', verifyFirebaseToken, async (req: AuthRequest, res: Response) => {
  try {
    const { uid } = req.user;
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
      res.status(400).json({ 
        success: false, 
        message: 'Wallet address is required' 
      });
      return;
    }
    
    // Update user with wallet address
    const userRef = db.collection('users').doc(uid);
    await userRef.update({ 
      walletAddress,
      updatedAt: new Date()
    });
    
    // Get updated user data
    const userSnap = await userRef.get();
    const userData = { id: uid, ...userSnap.data() };
    
    res.status(200).json({ 
      success: true, 
      user: userData
    });
  } catch (error) {
    console.error('Link wallet error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to link wallet', 
      error: (error as Error).message 
    });
  }
});

export default router; 