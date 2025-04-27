import { Transaction, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

/**
 * Serialize a transaction to base64 string
 */
export function serializeTransaction(transaction: Transaction): string {
  const serializedTransaction = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false
  });
  return Buffer.from(serializedTransaction).toString('base64');
}

/**
 * Debug wallet verification data
 */
export function debugWalletVerification(
  walletAddress: string,
  signatureBase64: string, 
  message: string
): { verified: boolean; error?: string } {
  try {
    // Convert signature from base64 to Uint8Array
    const signatureBytes = Buffer.from(signatureBase64, 'base64');
    
    // Convert message to Uint8Array
    const messageBytes = new TextEncoder().encode(message);
    
    // Use PublicKey class to handle the wallet address safely
    const publicKey = new PublicKey(walletAddress);
    
    // Verify signature
    const verified = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKey.toBytes()
    );
    
    return { verified };
  } catch (error) {
    console.error('Error verifying wallet signature:', error);
    return { 
      verified: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
} 