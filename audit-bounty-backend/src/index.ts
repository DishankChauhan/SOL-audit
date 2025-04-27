import * as functions from 'firebase-functions';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Create Express app
const app = express();

// Apply middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON

// Get configuration from Firebase Functions config
const config = functions.config();
const PROGRAM_ID = config?.solana?.program_id || '5Bb4BGBkViCPnyRcSevAggmLXNLTCHTR27yzLkjCRdJY';
const RPC_URL = config?.solana?.rpc_url || 'https://api.devnet.solana.com';

// Main API endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Sol Audit API is running',
    developer: 'Dishank Chauhan'
  });
});

// Contract info endpoint
app.get('/contract', (req, res) => {
  res.status(200).json({
    programId: PROGRAM_ID,
    network: 'devnet',
    rpcUrl: RPC_URL,
    explorer: `https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Export the Express app as a Firebase Cloud Function
exports.api = functions.https.onRequest(app);

console.log('Sol Audit backend functions initialized'); 