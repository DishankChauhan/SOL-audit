# Solana Contract Migration Guide

This document explains the process of migrating from the old contract program ID to the new one.

## Program IDs

- **Old Program ID**: `3K6VQ96CqESYiVT5kqPy6BU7ZDQbkZhVU4K5Bas7r9eh`
- **New Program ID**: `Gd2hEeEPdvPN7bPdbkthPZHxsaRNTJWxcpp2pwRWBw4R`

## Understanding the Impact of Program ID Change

When a Solana program is deployed to a new program ID, there are several important consequences:

1. **PDAs (Program Derived Addresses) Change**: Since PDAs are derived using the program ID as input, all PDAs will be different with the new program ID.

2. **On-chain Data Access**: Any data stored in accounts owned by the old program ID will not be accessible by the new program. This means that existing bounties on the old program ID cannot be interacted with using the new program.

3. **Client Configuration**: All client-side code that interacts with the program needs to be updated to use the new program ID.

## Migration Process

Our migration involves the following steps:

### 1. Contract Deployment

The contract was deployed to a new program ID on the Solana localnet using the command:

```bash
solana program deploy --program-id program-id.json target/deploy/audit_bounty.so
```

### 2. Code Updates

The following files were updated to reference the new program ID:

- `src/lib/env.ts` - Updated LOCAL_PROGRAM_ID and PROGRAM_ID constants
- `src/app/debug/localnet-check/page.tsx` - Updated PROGRAM_ID constant
- `src/app/bounty/create/page.tsx` - Updated PROGRAM_ID constant
- `src/app/api/bounty/initialize/route.ts` - Updated PROGRAM_ID constant
- `src/app/admin/migrate-bounties/page.tsx` - Added admin migration utility
- `src/app/debug/pda-checker/page.tsx` - Added PDA checker utility

### 3. Regenerating PDAs

PDAs are dynamically generated in our codebase using the pattern:

```typescript
// For bounty PDAs
const [bountyPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("bounty"), creatorWallet.toBuffer(), customSeed],
  PROGRAM_ID
);

// For vault PDAs
const [vaultPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), bountyPDA.toBuffer()],
  PROGRAM_ID
);
```

With the updated PROGRAM_ID constant, these PDAs will now be derived correctly for the new program.

### 4. Firebase Data Migration

The `/admin/migrate-bounties` page provides a utility to:

- Fetch all bounties from Firebase
- Recalculate the PDAs for each bounty using the new program ID
- Update the Firebase records with the new PDAs

This migration tool should be used with caution, as it will rewrite the PDA addresses in Firebase.

### 5. PDA Verification Tool

The `/debug/pda-checker` page allows you to:

- Enter a creator wallet and bounty title
- See what the PDA would be with both the old and new program IDs
- Verify that PDAs are correctly derived

## Using the PDA Checker

To verify PDA generation with the new program ID:

1. Navigate to `/debug/pda-checker`
2. Enter a valid creator wallet address
3. Enter a bounty title
4. Click "Calculate PDAs"
5. Compare the old and new PDAs

## Important Notes

1. **Localnet vs. Devnet**: The program ID update currently targets localnet. For devnet deployment, additional steps would be needed.

2. **On-chain Data**: Any bounties created with the old program ID will need to be recreated with the new program ID. The funds in old vaults cannot be directly transferred to new vaults without custom migration logic in the contract.

3. **Testing**: After migration, thorough testing should be performed to ensure all functionality works with the new program ID.

## Recovery Plan

If issues occur with the new program ID, you can temporarily revert to the old program ID by updating the constants in the files mentioned above.

## Future Considerations

For future deployments, consider using an upgradeable program approach to avoid needing to change the program ID. 