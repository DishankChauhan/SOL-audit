import * as admin from 'firebase-admin';
import path from 'path';
import { config } from 'dotenv';

// Load environment variables
config();

// Path to service account file
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 
  path.join(__dirname, '../../../firebase-service-account.json');

// Initialize Firebase Admin
let firebaseApp: admin.app.App;

// Check if Firebase app is already initialized
if (!admin.apps.length) {
  try {
    // Try to initialize with service account file
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath)
    });
  } catch (error) {
    // If file not found or invalid, try environment variables
    try {
      const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      };
      
      // Only proceed if all required env vars are available
      if (serviceAccount.projectId && serviceAccount.clientEmail && serviceAccount.privateKey) {
        firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount as admin.ServiceAccount)
        });
      } else {
        // Last resort: initialize without credentials (for dev/test only)
        console.warn('Missing Firebase credentials. Initializing without authentication.');
        firebaseApp = admin.initializeApp({
          projectId: 'mock-project-id'
        });
      }
    } catch (envError) {
      console.error('Failed to initialize Firebase:', envError);
      throw envError;
    }
  }
} else {
  // Use existing app
  firebaseApp = admin.app();
}

// Export Firebase instances
const db = firebaseApp.firestore();
const auth = firebaseApp.auth();
const storage = firebaseApp.storage();

export { firebaseApp, db, auth, storage, admin }; 