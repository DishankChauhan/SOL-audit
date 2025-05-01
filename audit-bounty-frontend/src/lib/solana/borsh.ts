import { Buffer } from 'buffer';

/**
 * Serializes a BountyInstruction.CreateBounty to match the Rust contract's Borsh format
 */
export function serializeCreateBountyInstruction(
  amount: number,
  deadline: number,
  customSeed: Uint8Array,
  winnersCount: number
): Buffer {
  // Calculate buffer size
  let bufferSize = 1 + 8 + 8; // discriminator + amount + deadline
  
  // Add space for custom_seed
  bufferSize += 1; // Option discriminator
  if (customSeed && customSeed.length > 0) {
    bufferSize += 4; // Vec length
    bufferSize += customSeed.length; // Vec content
  }
  
  // Add space for winners_count
  bufferSize += 1; // Option discriminator
  if (winnersCount > 0) {
    bufferSize += 1; // u8 value
  }

  // Allocate the buffer
  const buffer = Buffer.alloc(bufferSize);
  let offset = 0;
  
  // Write instruction discriminator (0 = CreateBounty)
  buffer.writeUInt8(0, offset);
  offset += 1;
  
  // Write amount as u64 (little-endian)
  buffer.writeBigUInt64LE(BigInt(Math.floor(amount)), offset);
  offset += 8;
  
  // Write deadline as i64 (little-endian)
  buffer.writeBigInt64LE(BigInt(Math.floor(deadline)), offset);
  offset += 8;
  
  // Write custom_seed as Option<Vec<u8>>
  if (customSeed && customSeed.length > 0) {
    // Some variant (1)
    buffer.writeUInt8(1, offset);
    offset += 1;
    
    // Vec length as u32 (little-endian)
    buffer.writeUInt32LE(customSeed.length, offset);
    offset += 4;
    
    // Write the seed bytes
    for (let i = 0; i < customSeed.length; i++) {
      buffer[offset + i] = customSeed[i];
    }
    offset += customSeed.length;
  } else {
    // None variant (0)
    buffer.writeUInt8(0, offset);
    offset += 1;
  }
  
  // Write winners_count as Option<u8>
  if (winnersCount > 0) {
    // Some variant (1)
    buffer.writeUInt8(1, offset);
    offset += 1;
    
    // u8 value
    buffer.writeUInt8(winnersCount, offset);
    offset += 1;
  } else {
    // None variant (0)
    buffer.writeUInt8(0, offset);
    offset += 1;
  }
  
  // Return only the used part of the buffer
  return buffer.slice(0, offset);
} 