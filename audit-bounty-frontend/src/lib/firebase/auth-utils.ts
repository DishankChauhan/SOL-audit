import { User, getAuth } from 'firebase/auth';
import { app } from './config';
import admin from 'firebase-admin';

/**
 * Gets the current authentication token for the user
 * This is useful for debugging permission issues with Firestore
 */
export async function getCurrentUserToken(): Promise<string | null> {
  try {
    const auth = getAuth(app);
    const user = auth.currentUser;
    
    if (!user) {
      console.warn('No authenticated user found');
      return null;
    }
    
    const token = await user.getIdToken();
    return token;
  } catch (error) {
    console.error('Error getting user token:', error);
    return null;
  }
}

/**
 * Gets user info for debugging purposes
 */
export function getUserDebugInfo(user: User | null): Record<string, unknown> {
  if (!user) {
    return { authenticated: false };
  }
  
  return {
    authenticated: true,
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    phoneNumber: user.phoneNumber,
    photoURL: user.photoURL,
    providerId: user.providerId,
    providerData: user.providerData.map(provider => ({
      providerId: provider.providerId,
      uid: provider.uid,
      displayName: provider.displayName,
      email: provider.email,
    })),
    metadata: {
      creationTime: user.metadata.creationTime,
      lastSignInTime: user.metadata.lastSignInTime
    }
  };
}

/**
 * Verifies a Firebase ID token using the Firebase Admin SDK
 * @param token The Firebase ID token to verify
 * @returns The decoded token if valid, otherwise null
 */
export async function verifyIdToken(token: string): Promise<admin.auth.DecodedIdToken | null> {
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying ID token:', error);
    return null;
  }
}
