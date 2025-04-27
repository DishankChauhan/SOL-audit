import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

/**
 * Verify that a message was signed by the owner of the given public key
 */
export async function verifyMessageSignature(
  signature: string,
  message: string
): Promise<boolean> {
  try {
    // Extract the public key from the message
    const publicKey = extractPublicKeyFromMessage(message);
    if (!publicKey) {
      console.error('Could not extract public key from message');
      return false;
    }

    // Convert the signature from base58 to Uint8Array
    const signatureUint8 = bs58.decode(signature);
    
    // Create a message buffer from the message
    const messageBuffer = new TextEncoder().encode(message);
    
    // Convert the public key to a Uint8Array
    const publicKeyUint8 = new PublicKey(publicKey).toBytes();
    
    // Verify the signature
    return nacl.sign.detached.verify(
      messageBuffer,
      signatureUint8,
      publicKeyUint8
    );
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

/**
 * Extract the public key from a signed message
 */
export function extractPublicKeyFromMessage(message: string): string | null {
  try {
    // Look for a pattern like "wallet: ABC123..."
    const walletMatch = message.match(/wallet:\s*([A-Za-z0-9]+)/);
    if (walletMatch && walletMatch[1]) {
      return walletMatch[1];
    }
    
    // Alternative pattern: Public key at the end of the message
    const pubKeyRegex = /([1-9A-HJ-NP-Za-km-z]{32,44})$/;
    const match = message.match(pubKeyRegex);
    if (match && match[1]) {
      // Validate that this is a valid public key
      try {
        new PublicKey(match[1]);
        return match[1];
      } catch {
        return null;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting public key from message:', error);
    return null;
  }
} 