import { Buffer } from 'buffer';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';

/**
 * For debugging instruction data from CreateBounty
 */
export function logCreateBountyInstruction(instructionData: Buffer) {
  try {
    console.log("--- CreateBounty Instruction Debug ---");
    
    if (instructionData.length < 18) {
      console.log("ERROR: Instruction data too short, expected at least 18 bytes (variant + amount + deadline)");
      return;
    }
    
    // Get instruction variant (first byte)
    const variant = instructionData.readUInt8(0);
    console.log("Instruction variant:", variant);
    
    // Get amount (next 8 bytes)
    const amount = instructionData.readBigUInt64LE(1);
    console.log("Amount:", amount.toString(), "lamports");
    
    // Get deadline (next 8 bytes)
    const deadline = instructionData.readBigInt64LE(9);
    console.log("Deadline timestamp:", deadline.toString());
    console.log("Deadline date:", new Date(Number(deadline) * 1000).toISOString());
    
    // Decode option for custom_seed
    let offset = 17;
    const hasSeed = instructionData.readUInt8(offset) === 1;
    offset += 1;
    
    if (hasSeed) {
      const seedLength = instructionData.readUInt32LE(offset);
      offset += 4;
      
      if (seedLength > 0 && offset + seedLength <= instructionData.length) {
        const seedBytes = instructionData.slice(offset, offset + seedLength);
        const seedString = new TextDecoder().decode(seedBytes);
        console.log("Custom seed length:", seedLength);
        console.log("Custom seed:", seedString);
        console.log("Custom seed bytes:", Buffer.from(seedBytes).toString('hex'));
        offset += seedLength;
      } else {
        console.log("WARNING: Seed length invalid or overruns buffer");
      }
    } else {
      console.log("No custom seed (None variant)");
    }
    
    // Decode option for winners_count
    if (offset < instructionData.length) {
      const hasWinnersCount = instructionData.readUInt8(offset) === 1;
      offset += 1;
      
      if (hasWinnersCount && offset < instructionData.length) {
        const winnersCount = instructionData.readUInt8(offset);
        console.log("Winners count:", winnersCount);
        offset += 1;
      } else {
        console.log("No winners count (None variant)");
      }
    }
    
    // Check if we've consumed all bytes
    if (offset < instructionData.length) {
      console.log("WARNING: Extra bytes in instruction data:", instructionData.slice(offset).toString('hex'));
    }
    
    console.log("--- End Debug ---");
  } catch (err) {
    console.error("Error debugging instruction data:", err);
  }
}

/**
 * Debug a transaction instruction 
 */
export function debugTransactionInstruction(instruction: TransactionInstruction) {
  try {
    console.log("=== Transaction Instruction Debug ===");
    console.log("Program ID:", instruction.programId.toString());
    
    console.log("Keys:");
    instruction.keys.forEach((key, i) => {
      console.log(`  ${i}: ${key.pubkey.toString()} (signer: ${key.isSigner}, writable: ${key.isWritable})`);
    });
    
    console.log("Data length:", instruction.data.length);
    
    // Try to guess the instruction type from the first byte
    if (instruction.data.length > 0) {
      const discriminator = instruction.data[0];
      
      // For our program's instructions
      if (instruction.programId.toString() === "3K6VQ96CqESYiVT5kqPy6BU7ZDQbkZhVU4K5Bas7r9eh") {
        const instructionTypes = [
          "CreateBounty",
          "SubmitWork",
          "ApproveSubmission",
          "ClaimBounty",
          "CancelBounty",
          "CancelBountyEmergency",
          "RecordSubmission",
          "VoteOnSubmission",
          "SelectWinner",
          "FinalizeAndDistributeRemaining"
        ];
        
        const instructionName = discriminator < instructionTypes.length 
          ? instructionTypes[discriminator] 
          : `Unknown (${discriminator})`;
        
        console.log("Instruction type:", instructionName);
        
        // Detailed debug for specific instructions
        if (discriminator === 0) { // CreateBounty
          logCreateBountyInstruction(Buffer.from(instruction.data));
        }
      } else {
        console.log("Instruction discriminator:", discriminator);
      }
    }
    
    console.log("Data hex:", Buffer.from(instruction.data).toString('hex'));
    console.log("=== End Debug ===");
    
  } catch (err) {
    console.error("Error debugging transaction instruction:", err);
  }
} 