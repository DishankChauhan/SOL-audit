# Debug Tools

This directory contains tools for debugging and testing the Solana audit bounty platform, particularly focusing on the payment flow.

## Localnet Test Flow

Located at `/debug/localnet-test-flow`

### Purpose
This tool provides a complete end-to-end test flow for the bounty system on localnet, which helps identify and fix issues with:

1. Network mismatches between wallet and blockchain
2. Escrow payment flow
3. Transaction instruction formatting
4. Bounty status management

### Usage Instructions

1. Make sure you have a Solana localnet running:
   ```
   solana-test-validator
   ```

2. Navigate to `/debug/localnet-test-flow` in the app

3. The page will guide you through a step-by-step process:
   - Fund test wallets (creator, auditor, validator)
   - Create a bounty from the creator wallet
   - Submit audit work from the auditor wallet
   - Approve the submission from the creator wallet
   - Claim the bounty from the auditor wallet

### Features

- Uses local test keypairs to avoid network mismatch issues
- Automatically detects localnet connection
- Shows detailed status updates and error messages
- Displays wallet addresses and balances
- Handles the complete bounty flow in one place

### How It Works

1. Test keypairs are defined in `src/lib/solana/localWallet.ts`
2. The test flow creates mock WalletContextState objects that mimic real wallets
3. These mock wallets sign transactions locally
4. Transactions are sent directly to the localnet
5. The UI shows detailed status updates for each step

## Common Issues Solved

1. **Phantom Wallet Connection Issues**
   - Problem: Phantom wallet connects to devnet/mainnet by default, while your contract is on localnet
   - Solution: Use local test keypairs instead of Phantom for localnet testing

2. **Escrow Payment Flow**
   - Problem: Funds not transferring because of missing approval step
   - Solution: The flow enforces the correct sequence: Create → Submit → Approve → Claim

3. **Transaction Formatting**
   - Problem: Incorrect account structures for transaction instructions
   - Solution: Properly structured accounts and instructions based on the Rust contract

4. **Network Mismatch**
   - Problem: Trying to execute transactions across different networks
   - Solution: Everything stays on localnet using direct transaction sending 