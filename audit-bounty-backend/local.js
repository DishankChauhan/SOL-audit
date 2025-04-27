const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');

// Create Express app
const app = express();

// Apply middleware
app.use(cors({ origin: true }));
app.use(express.json());

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