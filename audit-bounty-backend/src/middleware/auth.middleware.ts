import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';

/**
 * Extended Request interface with user property
 */
export interface AuthRequest extends Request {
  user?: any;
}

/**
 * Verify Firebase ID token middleware
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 */
export const verifyFirebaseToken = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({ message: 'Unauthorized: No token provided' });
      return;
    }
    
    const token = authHeader.split('Bearer ')[1];
    
    if (!token) {
      res.status(401).json({ message: 'Unauthorized: Invalid token format' });
      return;
    }
    
    // Verify the ID token using Firebase Admin SDK
    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase token:', error);
    res.status(401).json({ message: 'Unauthorized: Invalid token', error: (error as Error).message });
  }
};

/**
 * Check if user has creator role
 * @param {AuthRequest} req - Express request object with user
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 */
export const requireCreator = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'creator') {
    res.status(403).json({ message: 'Forbidden: Creator role required' });
    return;
  }
  next();
};

/**
 * Check if user has contributor role
 * @param {AuthRequest} req - Express request object with user
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 */
export const requireContributor = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'contributor') {
    res.status(403).json({ message: 'Forbidden: Contributor role required' });
    return;
  }
  next();
};

/**
 * Check if user has moderator role
 * @param {AuthRequest} req - Express request object with user
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 */
export const requireModerator = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'moderator') {
    res.status(403).json({ message: 'Forbidden: Moderator role required' });
    return;
  }
  next();
};

/**
 * Check if user is authenticated (any role)
 * @param {AuthRequest} req - Express request object with user
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 */
export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ message: 'Unauthorized: Authentication required' });
    return;
  }
  next();
}; 