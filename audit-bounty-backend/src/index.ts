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

// Get configuration from Firebase Functions config or environment variables
const config = functions.config();

// Load environment variables
const PORT = process.env.PORT || 3001;
const SOLANA_RPC_URL = config?.solana?.rpc_url || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = config?.solana?.program_id || 'Gd2hEeEPdvPN7bPdbkthPZHxsaRNTJWxcpp2pwRWBw4R';

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
    rpcUrl: SOLANA_RPC_URL,
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