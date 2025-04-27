import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import * as functions from 'firebase-functions';

// Get configuration from Firebase Functions config or environment variables
const config = functions.config();

// Load environment variables
const SOLANA_RPC_URL = config?.solana?.rpc_url || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = config?.solana?.program_id || process.env.PROGRAM_ID || '5Bb4BGBkViCPnyRcSevAggmLXNLTCHTR27yzLkjCRdJY';
const SOLANA_KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH || path.join(__dirname, '../../keypair.json');

// Initialize Solana connection
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Program ID
const programId = new PublicKey(PROGRAM_ID);

// Load wallet from file system (should be secured in production)
let feePayer: Keypair;
try {
  const secretKeyString = fs.readFileSync(SOLANA_KEYPAIR_PATH, { encoding: 'utf8' });
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  feePayer = Keypair.fromSecretKey(secretKey);
  console.log(`Loaded Solana keypair with public key: ${feePayer.publicKey.toString()}`);
} catch (error) {
  console.error('Failed to load Solana keypair:', error);
  // Generate a new keypair if none exists (for development only)
  feePayer = Keypair.generate();
  
  // In a real app, we would want to handle this differently
  console.warn('Generated temporary keypair - this should not happen in production!');
}

export {
  connection,
  programId,
  feePayer,
  SOLANA_RPC_URL,
  PROGRAM_ID
}; 