# Sol Audit Program Deployment - Native SOL Version

## Program Details

- **Network**: Solana Devnet
- **Program ID**: H2mR4RyLpyghynf1VQQZShjF2ZX5VRRyfgeoSq6pHJ4j
- **Deployment Keypair**:  audit_bounty_v2-keypair.json
- **Developer**: Dishank Chauhan

## Updated Program Architecture

This version uses native SOL for bounties with the following key features:

1. **Simplified Account Structure**:
   - Bounty Account (PDA): Stores bounty metadata (creator, hunter, amount, deadline, status)
   - Vault Account (PDA): Holds the locked SOL for each bounty

2. **Native SOL Operations**:
   - Uses direct SOL transfers instead of SPL tokens
   - Uses Program Derived Addresses (PDAs) for secure fund management

3. **Instructions**:
   - `CreateBounty`: Creator creates a bounty and locks SOL in the vault
   - `SubmitWork`: Hunter submits work (optional, mainly for logging)
   - `ApproveSubmission`: Creator approves a hunter's submission
   - `ClaimBounty`: Approved hunter claims SOL reward
   - `CancelBounty`: Creator cancels bounty after deadline and reclaims SOL

## Deployment Steps

1. Generate a new keypair for deployment (if needed):
   ```
   solana-keygen new --no-passphrase -o deploy-key.json
   ```

2. Set Solana configuration to use devnet:
   ```
   solana config set --url devnet --keypair deploy-key.json
   ```

3. Request SOL from the devnet faucet:
   ```
   solana airdrop 2
   ```

4. Build the program:
   ```
   cargo build-bpf
   ```

5. Deploy the program with the existing program ID:
   ```
   solana program deploy --program-id 5Bb4BGBkViCPnyRcSevAggmLXNLTCHTR27yzLkjCRdJY --max-len 1500000 target/deploy/audit_bounty.so
   ```

## Interacting with the Program

### Creating a Bounty

```javascript
const createBountyIx = new TransactionInstruction({
  keys: [
    { pubkey: creatorPublicKey, isSigner: true, isWritable: true },     // Creator
    { pubkey: bountyPDA, isSigner: false, isWritable: true },           // Bounty Account
    { pubkey: vaultPDA, isSigner: false, isWritable: true },            // Vault Account
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // System Program
  ],
  programId: PROGRAM_ID,
  data: encodeCreateBountyData(amount, deadline),
});
```

### Approving a Submission

```javascript
const approveSubmissionIx = new TransactionInstruction({
  keys: [
    { pubkey: creatorPublicKey, isSigner: true, isWritable: false },    // Creator
    { pubkey: bountyPDA, isSigner: false, isWritable: true },           // Bounty Account
    { pubkey: hunterPublicKey, isSigner: false, isWritable: false },    // Hunter
  ],
  programId: PROGRAM_ID,
  data: encodeApproveSubmissionData(hunterPublicKey),
});
```

### Claiming a Bounty

```javascript
const claimBountyIx = new TransactionInstruction({
  keys: [
    { pubkey: hunterPublicKey, isSigner: true, isWritable: true },      // Hunter
    { pubkey: bountyPDA, isSigner: false, isWritable: true },           // Bounty Account
    { pubkey: vaultPDA, isSigner: false, isWritable: true },            // Vault Account
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // System Program
  ],
  programId: PROGRAM_ID,
  data: Buffer.from([3]), // ClaimBounty instruction code
});
```

## Testing the Deployed Program

To interact with the deployed program, you can use the Solana CLI or create a client application that sends transactions to the program.

### Example Client Setup

```javascript
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');

// Connect to devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Use the deployed program ID
const programId = new PublicKey('5Bb4BGBkViCPnyRcSevAggmLXNLTCHTR27yzLkjCRdJY');

// Example function to initialize a bounty (pseudo-code)
async function initializeBounty(owner, repoUrl, bountyAmount, deadline, severityWeights) {
  // Create transaction with InitializeBounty instruction
  // ...
}
```

## Upgrading the Program

If you need to upgrade the program in the future, use the following command:

```
solana program deploy --program-id 5Bb4BGBkViCPnyRcSevAggmLXNLTCHTR27yzLkjCRdJY --max-len 1500000 target/deploy/audit_bounty.so
```

Make sure to use the same keypair for deployment upgrades. 