# Audit Bounty Anchor Program

This is a Solana program built with the Anchor framework for managing audit bounties. It allows project creators to create bounties with escrowed funds, auditors to submit reports, and for the funds to be released once the audit is approved.

## Features

- **Create Bounty**: Project creators can create a new bounty by escrowing SOL or USDC tokens.
- **Submit Report**: Auditors can claim a bounty and submit a report (IPFS/Arweave link).
- **Release Funds**: Project creators can approve an audit and release the escrowed funds to the auditor.
- **Reject Report**: Project creators can reject a report and reopen the bounty.
- **Close Bounty**: Project creators can close a completed bounty and reclaim the account rent.

## Program Account Structure

The main account structure is the `Bounty` account, which includes:

- `creator`: The public key of the bounty creator.
- `auditor`: Optional field for the assigned auditor.
- `amount`: The amount of tokens (in lamports or token units) in escrow.
- `status`: The status of the bounty (Open, InReview, or Completed).
- `report_link`: Optional field for the IPFS/Arweave link to the audit report.
- `created_at`: Unix timestamp of when the bounty was created.
- `nonce`: A nonce used for PDA derivation.
- `bump`: The bump used in PDA derivation.

## Building and Deploying

### Prerequisites

- Rust and Cargo
- Solana CLI tools
- Anchor CLI

### Build

```bash
# Clone the repository
git clone https://github.com/your-username/audit-bounty-anchor.git
cd audit-bounty-anchor

# Build the program
anchor build
```

### Deploy

```bash
# Get the program ID
solana address -k target/deploy/audit_bounty-keypair.json

# Update the program ID in Anchor.toml and lib.rs

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

## Testing

```bash
# Run tests
anchor test
```

## Program Instructions

1. **create_bounty**: Creates a new bounty with escrowed funds.
   - Parameters: `amount` (u64), `nonce` (u8)

2. **submit_report**: Auditor submits an audit report.
   - Parameters: `report_link` (String)

3. **release_funds**: Creator approves audit and releases funds to auditor.
   - No parameters

4. **reject_report**: Creator rejects the audit report and reopens the bounty.
   - No parameters

5. **close_bounty**: Creator closes a completed bounty and reclaims rent.
   - No parameters

## License

This project is licensed under the MIT License - see the LICENSE file for details. 