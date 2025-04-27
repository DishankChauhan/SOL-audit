import { Connection, PublicKey, Cluster, ConnectionConfig } from '@solana/web3.js';
import { ENV } from '../env';

// Program ID string for the sol-audit program
export const PROGRAM_ID_STRING = ENV.PROGRAM_ID;

// Create PublicKey from the program ID string
export const programId = new PublicKey(PROGRAM_ID_STRING);

// Force disable WebSockets for all connections
const connectionConfig: ConnectionConfig = {
  commitment: 'confirmed',
  disableRetryOnRateLimit: false,
  confirmTransactionInitialTimeout: 60000,
  wsEndpoint: undefined // Explicitly disable WebSockets
};

// Helper function to get a Solana connection with caching
let connectionCache: Record<string, Connection> = {};
export function getConnection(endpoint: string = ENV.SOLANA_RPC_URL): Connection {
  if (!connectionCache[endpoint]) {
    // Create a special connection that doesn't use WebSockets
    const connection = new Connection(endpoint, connectionConfig);
    
    // Override the confirmTransaction method to use HTTP polling only
    const originalConfirmTransaction = connection.confirmTransaction.bind(connection);
    connection.confirmTransaction = async (signature: any, commitment?: any) => {
      console.log('Using HTTP polling instead of WebSockets for transaction confirmation');
      return await pollForTransactionStatus(connection, signature);
    };
    
    connectionCache[endpoint] = connection;
    console.log(`Created new Solana connection to ${endpoint} with WebSockets disabled`);
  }
  return connectionCache[endpoint];
}

// Helper function to poll for transaction status
async function pollForTransactionStatus(connection: Connection, signatureOrConfig: any): Promise<any> {
  // Extract signature from config object if needed
  const signature = typeof signatureOrConfig === 'string' 
    ? signatureOrConfig 
    : signatureOrConfig.signature;
  
  console.log(`Polling for transaction status: ${signature}`);
  
  const MAX_ATTEMPTS = 30;
  const POLL_INTERVAL_MS = 2000;
  let attempts = 0;
  
  while (attempts < MAX_ATTEMPTS) {
    try {
      const status = await connection.getSignatureStatus(signature);
      
      if (status && status.value) {
        if (status.value.err) {
          console.error('Transaction failed:', status.value.err);
          return { value: { err: status.value.err } };
        }
        
        if (status.value.confirmationStatus === 'confirmed' || 
            status.value.confirmationStatus === 'finalized') {
          console.log(`Transaction confirmed with status: ${status.value.confirmationStatus}`);
          return { value: { err: null } };
        }
      }
      
      console.log(`Attempt ${attempts + 1}: Transaction not yet confirmed, polling again...`);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      attempts++;
    } catch (error) {
      console.warn(`Error polling for transaction status (attempt ${attempts + 1}):`, error);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      attempts++;
    }
  }
  
  console.error(`Transaction confirmation timed out after ${MAX_ATTEMPTS} attempts`);
  return { value: { err: new Error('Confirmation timeout') } };
}

// Get the default connection to the Solana network
export function getSolanaConnection(): Connection {
  // Use the Alchemy endpoint for reliability
  const alchemyRpcUrl = "https://solana-devnet.g.alchemy.com/v2/h7esQF88WJnfEzX7BR9kR_s4LFhIB2P2";
  return getConnection(alchemyRpcUrl);
}

// Seeds used for PDA derivation
export const BOUNTY_SEED_PREFIX = 'bounty';
export const VAULT_SEED_PREFIX = 'vault';

// Helper to derive the bounty account PDA
export async function deriveBountyPDA(creator: PublicKey, seed?: Uint8Array): Promise<[PublicKey, number]> {
  const seedsArray = seed 
    ? [Buffer.from(BOUNTY_SEED_PREFIX), creator.toBuffer(), Buffer.from(seed)]
    : [Buffer.from(BOUNTY_SEED_PREFIX), creator.toBuffer(), Buffer.from(Date.now().toString())];
  
  return PublicKey.findProgramAddressSync(seedsArray, programId);
}

// Helper to derive the vault account PDA
export async function deriveVaultPDA(bountyPda: PublicKey): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(VAULT_SEED_PREFIX), bountyPda.toBuffer()],
    programId
  );
}

// Function to convert lamports to SOL for display
export function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000;
}

// Function to convert SOL to lamports for transactions
export function solToLamports(sol: number): number {
  return Math.floor(sol * 1_000_000_000);
} 