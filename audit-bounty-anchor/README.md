# Audit Bounty Anchor Program

This is a Solana program built with the Anchor framework for managing security audit bounties. It allows project creators to create bounties with escrowed funds, auditors to submit reports, and for the funds to be released once the audit is approved.

## Features

- **Create Bounty**: Project creators can create a new bounty by escrowing SOL.
- **Submit Report**: Auditors can claim a bounty and submit a report (IPFS/Arweave link).
- **Approve & Release**: Project creators can approve an audit and release the escrowed funds to the auditor.
- **Reject Report**: Project creators can reject a report and reopen the bounty.
- **Cancel Bounty**: Project creators can cancel a bounty and reclaim their escrowed funds.

## Program Account Structure

The main account structure is the `Bounty` account, which includes:

- `creator`: The public key of the bounty creator.
- `auditor`: Optional field for the assigned auditor.
- `amount`: The amount of SOL (in lamports) in escrow.
- `status`: The status of the bounty (Open, Submitted, Approved, or Cancelled).
- `reportUri`: Optional field for the IPFS/Arweave link to the audit report.
- `createdAt`: Unix timestamp of when the bounty was created.
- `nonce`: A nonce used for PDA derivation.
- `bump`: The bump used in PDA derivation.

The program also uses an escrow PDA to hold funds securely until they are either released to the auditor or returned to the creator.

## Building and Deploying

### Prerequisites

- Rust and Cargo
- Solana CLI tools
- Anchor Framework (0.29.0+)
- Node.js and Yarn

### Build

```bash
# Clone the repository
git clone https://github.com/username/audit-bounty-anchor.git
cd audit-bounty-anchor

# Build the program
anchor build
```

### Deploy

```bash
# Start a local validator for testing
solana-test-validator

# Airdrop some SOL to your deployment wallet
solana airdrop 10

# Deploy locally
anchor deploy

# Or deploy to devnet
anchor deploy --provider.cluster devnet
```

## Testing

### Automated Tests with TypeScript

You can run several test scripts to verify different program flows:

```bash
# Test the full flow (create bounty, submit report, approve and release)
npx ts-node single-test.ts

# Test the cancel bounty flow
npx ts-node cancel-test.ts

# Test the reject report flow
npx ts-node reject-test.ts
```

Alternatively, use Anchor's test framework:

```bash
# Run the full test suite
anchor test
```

## Program Instructions

1. **createBounty**: Creates a new bounty with escrowed funds.
   - Parameters: `amount` (u64), `nonce` (u8)
   - Accounts: creator (signer), bounty (PDA), escrow (PDA), systemProgram

2. **submitReport**: Auditor submits an audit report.
   - Parameters: `reportUri` (String)
   - Accounts: auditor (signer), bounty

3. **approveAndRelease**: Creator approves audit and releases funds to auditor.
   - Accounts: creator (signer), bounty, auditor, escrow, systemProgram

4. **rejectReport**: Creator rejects the audit report and reopens the bounty.
   - Accounts: creator (signer), bounty

5. **cancelBounty**: Creator cancels the bounty and reclaims the escrowed funds.
   - Accounts: creator (signer), bounty, escrow, systemProgram

## Security Considerations

The program implements several security features:

- PDA-based escrow accounts for secure fund management
- Proper seed derivation for PDAs
- Access control to ensure only the creator can approve/reject/cancel
- Status checks to validate proper state transitions

## Recent Fixes

- Fixed issues with PDA bump storage and retrieval
- Corrected escrow account derivation
- Improved fund transfer handling in approveAndRelease and cancelBounty functions
- Fixed signature issues in CPI (Cross-Program Invocation) calls

## License

This project is licensed under the MIT License - see the LICENSE file for details. 