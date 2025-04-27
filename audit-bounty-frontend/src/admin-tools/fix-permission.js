// Admin tool to fix permission issues with bounty approvals
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, updateDoc, Timestamp } = require('firebase/firestore');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

// Initialize Firebase (replace these values with your Firebase config)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Function to directly update a submission status
async function approveSubmission(email, password, bountyId, submissionId) {
  try {
    // Sign in with admin credentials
    console.log('Signing in...');
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log('Signed in as:', user.email);

    // Get the bounty details
    console.log(`Getting bounty ${bountyId}...`);
    const bountyRef = doc(db, 'bounties', bountyId);
    const bountySnap = await getDoc(bountyRef);
    
    if (!bountySnap.exists()) {
      console.error('Bounty not found');
      return;
    }
    
    const bountyData = bountySnap.data();
    console.log('Bounty owner:', bountyData.owner);
    console.log('Current user:', user.uid);
    
    // Get the submission details
    console.log(`Getting submission ${submissionId}...`);
    const submissionRef = doc(db, 'submissions', submissionId);
    const submissionSnap = await getDoc(submissionRef);
    
    if (!submissionSnap.exists()) {
      console.error('Submission not found');
      return;
    }
    
    // Update the submission status
    console.log('Updating submission status...');
    await updateDoc(submissionRef, {
      status: 'approved',
      updatedAt: Timestamp.now(),
      reviewedAt: Timestamp.now(),
      reviewedBy: user.uid
    });
    
    // Update the bounty status
    console.log('Updating bounty status...');
    await updateDoc(bountyRef, {
      status: 'completed',
      updatedAt: Timestamp.now(),
      completedAt: Timestamp.now(),
      completedBy: user.uid
    });
    
    console.log('Successfully approved submission');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Usage: Pass your admin email, password, bounty ID, and submission ID
// Example: node fix-permission.js admin@example.com password123 bountyId123 submissionId123

const email = process.argv[2];
const password = process.argv[3];
const bountyId = process.argv[4];
const submissionId = process.argv[5];

if (!email || !password || !bountyId || !submissionId) {
  console.log('Usage: node fix-permission.js <email> <password> <bountyId> <submissionId>');
} else {
  approveSubmission(email, password, bountyId, submissionId);
} 