import { Connection, Transaction } from '@solana/web3.js';
import { Buffer } from 'buffer';

/**
 * Sends a signed transaction directly to the localnet
 * This bypasses Phantom's RPC endpoint selection
 */
export async function sendSignedTransactionToLocalnet(signedTransaction: Transaction): Promise<string> {
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  
  console.log('Sending signed transaction to localnet...');
  
  // Serialize the signed transaction
  const rawTransaction = signedTransaction.serialize();
  
  try {
    // Send the raw transaction
    const signature = await connection.sendRawTransaction(
      rawTransaction,
      {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      }
    );
    
    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    return signature;
  } catch (error) {
    // If we have an error with logs, try to extract them
    if (error instanceof Error && 'logs' in (error as any)) {
      console.error('Transaction failed with logs:', (error as any).logs);
    }
    throw error;
  }
} 