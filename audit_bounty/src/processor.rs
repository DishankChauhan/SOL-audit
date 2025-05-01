use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    system_program,
    sysvar::Sysvar,
    sysvar::clock::Clock,
};
use crate::{
    error::BountyError,
    instruction::BountyInstruction,
    state::{BountyAccount, BountyStatus, Submission, SubmissionStatus, Vote, VoteType},
};

pub struct Processor {}

impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = BountyInstruction::try_from_slice(instruction_data)
            .map_err(|_| ProgramError::InvalidInstructionData)?;

        match instruction {
            BountyInstruction::CreateBounty { amount, deadline, custom_seed, winners_count } => {
                msg!("Instruction: CreateBounty");
                Self::process_create_bounty(program_id, accounts, amount, deadline, custom_seed, winners_count)
            }
            BountyInstruction::SubmitWork { submission_url } => {
                msg!("Instruction: SubmitWork");
                Self::process_submit_work(program_id, accounts, submission_url)
            }
            BountyInstruction::ApproveSubmission { hunter, submission_id } => {
                msg!("Instruction: ApproveSubmission");
                Self::process_approve_submission(program_id, accounts, hunter, submission_id)
            }
            BountyInstruction::ClaimBounty => {
                msg!("Instruction: ClaimBounty");
                Self::process_claim_bounty(program_id, accounts)
            }
            BountyInstruction::CancelBounty => {
                msg!("Instruction: CancelBounty");
                Self::process_cancel_bounty(program_id, accounts)
            }
            BountyInstruction::CancelBountyEmergency => {
                msg!("Instruction: CancelBountyEmergency");
                Self::process_cancel_bounty_emergency(program_id, accounts)
            }
            BountyInstruction::RecordSubmission { submission_id, severity, description, ipfs_hash } => {
                msg!("Instruction: RecordSubmission");
                Self::process_record_submission(program_id, accounts, submission_id, severity, description, ipfs_hash)
            }
            BountyInstruction::VoteOnSubmission { submission_id, is_upvote } => {
                msg!("Instruction: VoteOnSubmission");
                Self::process_vote_on_submission(program_id, accounts, submission_id, is_upvote)
            }
            BountyInstruction::SelectWinner { submission_id, payout_amount } => {
                msg!("Instruction: SelectWinner");
                Self::process_select_winner(program_id, accounts, submission_id, payout_amount)
            }
            BountyInstruction::FinalizeAndDistributeRemaining => {
                msg!("Instruction: FinalizeAndDistributeRemaining");
                Self::process_finalize_and_distribute(program_id, accounts)
            }
        }
    }

    fn process_create_bounty(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount: u64,
        deadline: i64,
        custom_seed: Option<Vec<u8>>,
        winners_count: Option<u8>,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        // Get account info
        let creator_info = next_account_info(account_info_iter)?;
        let bounty_account_info = next_account_info(account_info_iter)?;
        let vault_account_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;

        // Check accounts
        if !creator_info.is_signer {
            return Err(BountyError::UnauthorizedCreator.into());
        }

        if !system_program::check_id(system_program_info.key) {
            return Err(ProgramError::InvalidAccountData);
        }

        // Validate inputs
        if amount == 0 {
            return Err(BountyError::InvalidBountyAmount.into());
        }

        let current_time = Clock::get()?.unix_timestamp;
        if deadline <= current_time {
            return Err(BountyError::InvalidDeadline.into());
        }

        // Prepare time bytes outside the if statement to extend lifetime
        let time_bytes = current_time.to_le_bytes();
        let custom_seed_storage;
        
        // Use custom seed if provided, otherwise use blockchain time
        let bounty_seed_refs: Vec<&[u8]>;
        
        if let Some(seed) = custom_seed {
            msg!("Using custom seed for bounty derivation");
            // Store seed in our storage
            custom_seed_storage = seed;
            bounty_seed_refs = vec![
                b"bounty",
                creator_info.key.as_ref(),
                custom_seed_storage.as_slice()
            ];
        } else {
            msg!("Using blockchain time for bounty derivation");
            bounty_seed_refs = vec![
                b"bounty",
                creator_info.key.as_ref(),
                &time_bytes
            ];
        }

        // Derive bounty account PDA
        let (bounty_key, bounty_bump) = Pubkey::find_program_address(
            bounty_seed_refs.as_slice(), 
            program_id
        );

        // Verify bounty account address
        if bounty_key != *bounty_account_info.key {
            msg!("Expected bounty address: {}", bounty_key);
            msg!("Provided bounty address: {}", bounty_account_info.key);
            return Err(ProgramError::InvalidAccountData);
        }

        // Create bounty account if it doesn't exist yet
        if bounty_account_info.owner != program_id {
            let rent = Rent::get()?;
            let bounty_size = std::mem::size_of::<BountyAccount>();
            let bounty_rent = rent.minimum_balance(bounty_size);

            msg!("Creating bounty account: {}", bounty_account_info.key);
            
            // Create a signer seeds array with the bump
            let mut signer_seeds = bounty_seed_refs.clone();
            let bump = [bounty_bump];
            signer_seeds.push(&bump);
            
            invoke_signed(
                &system_instruction::create_account(
                    creator_info.key,
                    bounty_account_info.key,
                    bounty_rent,
                    bounty_size as u64,
                    program_id,
                ),
                &[
                    creator_info.clone(),
                    bounty_account_info.clone(),
                    system_program_info.clone(),
                ],
                &[&signer_seeds[..]],
            )?;
        } else {
            // If the account exists, make sure it's not already initialized
            let bounty_data = BountyAccount::try_from_slice(&bounty_account_info.data.borrow())?;
            if bounty_data.is_initialized() {
                return Err(BountyError::BountyAlreadyInitialized.into());
            }
        }

        // Derive vault account PDA - use standard seed format for consistency
        let vault_seed_prefix = b"vault";
        let vault_seeds = [
            vault_seed_prefix.as_ref(),
            bounty_account_info.key.as_ref()
        ];
        let (vault_key, vault_bump) = Pubkey::find_program_address(&vault_seeds, program_id);

        // Verify vault account address
        if vault_key != *vault_account_info.key {
            msg!("Expected vault address: {}", vault_key);
            msg!("Provided vault address: {}", vault_account_info.key);
            return Err(ProgramError::InvalidAccountData);
        }

        // Create vault account if it doesn't exist yet
        if vault_account_info.owner != program_id {
            msg!("Creating vault account: {}", vault_account_info.key);
            invoke_signed(
                &system_instruction::create_account(
                    creator_info.key,
                    vault_account_info.key,
                    amount, // Transfer the bounty amount to the vault
                    0,      // No data stored in vault, just lamports
                    program_id,
                ),
                &[
                    creator_info.clone(),
                    vault_account_info.clone(),
                    system_program_info.clone(),
                ],
                &[&[
                    vault_seed_prefix,
                    bounty_account_info.key.as_ref(),
                    &[vault_bump],
                ]],
            )?;
        } else {
            // If the vault exists, add lamports to it
            msg!("Funding existing vault: {}", vault_account_info.key);
            invoke(
                &system_instruction::transfer(
                    creator_info.key,
                    vault_account_info.key,
                    amount,
                ),
                &[
                    creator_info.clone(),
                    vault_account_info.clone(),
                    system_program_info.clone(),
                ],
            )?;
        }

        // Initialize bounty account data
        let bounty_account = BountyAccount {
            creator: *creator_info.key,
            hunter: None,
            amount,
            deadline,
            status: BountyStatus::Open,
            initialized: true,
            winners_count: winners_count.unwrap_or(1), // Default to 1 winner if not specified
            current_winners: 0,
        };

        // Log the initialization for debugging
        msg!("Creating new bounty with initialized=true");
        msg!("Creator: {}", creator_info.key);
        msg!("Amount: {}", amount);
        msg!("Deadline: {}", deadline);
        msg!("Status: Open");
        msg!("Winners count: {}", bounty_account.winners_count);
        
        // Serialize the account data
        bounty_account.serialize(&mut *bounty_account_info.data.borrow_mut())?;
        
        // Verify initialization after serialization
        let verify_data = BountyAccount::try_from_slice(&bounty_account_info.data.borrow())?;
        msg!("Verification: Account initialized = {}", verify_data.is_initialized());
        
        // Check if initialized flag is at expected offset (for debugging)
        if bounty_account_info.data.borrow().len() >= 80 {
            // The exact offset depends on your struct layout
            msg!("Raw initialized flag at offset 74: {}", 
                 bounty_account_info.data.borrow()[74] != 0);
        }
        
        msg!("Bounty created by {} with {} lamports", creator_info.key, amount);
        
        Ok(())
    }

    fn process_submit_work(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        submission_url: String,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        // Get account info
        let hunter_info = next_account_info(account_info_iter)?;
        let bounty_account_info = next_account_info(account_info_iter)?;

        // Check accounts
        if !hunter_info.is_signer {
            return Err(BountyError::UnauthorizedHunter.into());
        }

        if bounty_account_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        // Load bounty data
        let bounty_data = BountyAccount::try_from_slice(&bounty_account_info.data.borrow())?;
        
        // Validate bounty state
        if !bounty_data.is_initialized() {
            return Err(ProgramError::UninitializedAccount);
        }

        if bounty_data.status != BountyStatus::Open {
            return Err(BountyError::BountyNotOpen.into());
        }

        // We don't need to store the submission URL in this simplified version
        // It can be handled by the frontend or a separate off-chain system
        // However, we log it for reference
        msg!("Work submitted by {} with URL: {}", hunter_info.key, submission_url);
        
        Ok(())
    }

    fn process_approve_submission(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        hunter: Pubkey,
        submission_id: String,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        // Get account info
        let creator_info = next_account_info(account_info_iter)?;
        let bounty_account_info = next_account_info(account_info_iter)?;
        let hunter_info = next_account_info(account_info_iter)?;
        let submission_account_info = next_account_info(account_info_iter)?;

        // Check accounts
        if !creator_info.is_signer {
            return Err(BountyError::UnauthorizedCreator.into());
        }

        if bounty_account_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        // Verify hunter account matches the provided hunter pubkey
        if hunter != *hunter_info.key {
            return Err(ProgramError::InvalidArgument);
        }

        // Verify submission account
        let submission_seed = [
            b"submission",
            bounty_account_info.key.as_ref(),
            hunter_info.key.as_ref(),
            submission_id.as_bytes(),
        ];
        
        let (expected_submission_key, _) = Pubkey::find_program_address(
            &submission_seed, 
            program_id
        );
        
        if expected_submission_key != *submission_account_info.key {
            msg!("Expected submission address: {}", expected_submission_key);
            msg!("Provided submission address: {}", submission_account_info.key);
            return Err(ProgramError::InvalidAccountData);
        }

        // Verify submission exists
        if submission_account_info.owner != program_id {
            return Err(ProgramError::InvalidAccountData);
        }

        // Add more debugging information about account data
        msg!("Bounty account data length: {}", bounty_account_info.data.borrow().len());
        
        // Try to deserialize with better error handling
        let bounty_data = match BountyAccount::try_from_slice(&bounty_account_info.data.borrow()) {
            Ok(data) => {
                msg!("Successfully deserialized bounty data");
                data
            },
            Err(e) => {
                msg!("Failed to deserialize bounty account data: {:?}", e);
                // Log the raw data for debugging
                if bounty_account_info.data.borrow().len() >= 80 {
                    msg!("First 32 bytes (creator): {:?}", &bounty_account_info.data.borrow()[0..32]);
                    msg!("Hunter option flag: {}", bounty_account_info.data.borrow()[32]);
                    msg!("Initialized flag (expected at offset 74): {}", 
                         bounty_account_info.data.borrow()[74] != 0);
                }
                return Err(ProgramError::InvalidAccountData);
            }
        };
        
        // Validate bounty state
        if !bounty_data.is_initialized() {
            msg!("Bounty account is NOT initialized!");
            return Err(ProgramError::UninitializedAccount);
        }

        if bounty_data.status != BountyStatus::Open {
            return Err(BountyError::BountyNotOpen.into());
        }

        if bounty_data.creator != *creator_info.key {
            return Err(BountyError::UnauthorizedCreator.into());
        }

        // Update bounty status and hunter
        let mut bounty_data = BountyAccount::try_from_slice(&bounty_account_info.data.borrow())?;
        bounty_data.status = BountyStatus::Approved;
        bounty_data.hunter = Some(hunter);
        bounty_data.initialized = true;  // Explicitly set initialized to true again

        // Save updated bounty data
        bounty_data.serialize(&mut *bounty_account_info.data.borrow_mut())?;
        
        msg!("Submission approved for hunter: {}", hunter_info.key);
        msg!("Submission ID: {}", submission_id);
        msg!("Bounty status updated to Approved");
        msg!("Hunter set to: {}", hunter);
        msg!("Initialized flag set to: true");
        
        Ok(())
    }

    fn process_claim_bounty(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        // Get account info
        let hunter_info = next_account_info(account_info_iter)?;
        let bounty_account_info = next_account_info(account_info_iter)?;
        let vault_account_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;

        // Check accounts
        if !hunter_info.is_signer {
            return Err(BountyError::UnauthorizedHunter.into());
        }

        if bounty_account_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        if vault_account_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        if !system_program::check_id(system_program_info.key) {
            return Err(ProgramError::InvalidAccountData);
        }

        // Load bounty data
        let bounty_data = BountyAccount::try_from_slice(&bounty_account_info.data.borrow())?;
        
        // Validate bounty state
        if !bounty_data.is_initialized() {
            return Err(ProgramError::UninitializedAccount);
        }

        if bounty_data.status != BountyStatus::Approved {
            return Err(BountyError::BountyNotApproved.into());
        }

        // Check that the hunter is the approved hunter
        if bounty_data.hunter.is_none() || bounty_data.hunter.unwrap() != *hunter_info.key {
            return Err(BountyError::UnauthorizedHunter.into());
        }

        // Get amount to transfer from vault
        let amount = bounty_data.amount;

        // Verify that this is the correct vault for this bounty
        let vault_seeds = [b"vault", bounty_account_info.key.as_ref()];
        let (expected_vault, vault_bump) = Pubkey::find_program_address(&vault_seeds, program_id);
        
        if expected_vault != *vault_account_info.key {
            return Err(ProgramError::InvalidAccountData);
        }

        // Check that vault has enough lamports
        if vault_account_info.lamports() < amount {
            return Err(ProgramError::InsufficientFunds);
        }

        // Transfer lamports from vault to hunter
        let vault_signer_seeds = [
            b"vault",
            bounty_account_info.key.as_ref(),
            &[vault_bump],
        ];

        invoke_signed(
            &system_instruction::transfer(
                vault_account_info.key,
                hunter_info.key,
                amount,
            ),
            &[
                vault_account_info.clone(),
                hunter_info.clone(),
                system_program_info.clone(),
            ],
            &[&vault_signer_seeds],
        )?;

        // Update bounty status
        let mut bounty_data = BountyAccount::try_from_slice(&bounty_account_info.data.borrow())?;
        bounty_data.status = BountyStatus::Claimed;
        
        // Save updated bounty data
        bounty_data.serialize(&mut *bounty_account_info.data.borrow_mut())?;
        
        msg!("Bounty claimed by hunter: {}, amount: {}", hunter_info.key, amount);
        
        Ok(())
    }

    fn process_cancel_bounty(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        // Get account info
        let creator_info = next_account_info(account_info_iter)?;
        let bounty_account_info = next_account_info(account_info_iter)?;
        let vault_account_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;

        // Check accounts
        if !creator_info.is_signer {
            return Err(BountyError::UnauthorizedCreator.into());
        }

        if bounty_account_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        if vault_account_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        if !system_program::check_id(system_program_info.key) {
            return Err(ProgramError::InvalidAccountData);
        }

        // Load bounty data
        let bounty_data = BountyAccount::try_from_slice(&bounty_account_info.data.borrow())?;
        
        // Validate bounty state
        if !bounty_data.is_initialized() {
            return Err(ProgramError::UninitializedAccount);
        }

        if bounty_data.status != BountyStatus::Open {
            return Err(BountyError::BountyNotOpen.into());
        }

        if bounty_data.creator != *creator_info.key {
            return Err(BountyError::UnauthorizedCreator.into());
        }

        // Check if deadline has passed
        let current_time = Clock::get()?.unix_timestamp;
        if current_time <= bounty_data.deadline {
            return Err(BountyError::DeadlineNotPassed.into());
        }

        // Verify that this is the correct vault for this bounty
        let vault_seeds = [b"vault", bounty_account_info.key.as_ref()];
        let (expected_vault, vault_bump) = Pubkey::find_program_address(&vault_seeds, program_id);
        
        if expected_vault != *vault_account_info.key {
            return Err(ProgramError::InvalidAccountData);
        }

        // Get amount to transfer back to creator
        let amount = bounty_data.amount;

        // Check that vault has enough lamports
        if vault_account_info.lamports() < amount {
            return Err(ProgramError::InsufficientFunds);
        }

        // Transfer lamports from vault back to creator
        let vault_signer_seeds = [
            b"vault",
            bounty_account_info.key.as_ref(),
            &[vault_bump],
        ];

        invoke_signed(
            &system_instruction::transfer(
                vault_account_info.key,
                creator_info.key,
                amount,
            ),
            &[
                vault_account_info.clone(),
                creator_info.clone(),
                system_program_info.clone(),
            ],
            &[&vault_signer_seeds],
        )?;

        // Update bounty status
        let mut bounty_data = BountyAccount::try_from_slice(&bounty_account_info.data.borrow())?;
        bounty_data.status = BountyStatus::Cancelled;
        
        // Save updated bounty data
        bounty_data.serialize(&mut *bounty_account_info.data.borrow_mut())?;
        
        msg!("Bounty cancelled by creator: {}, refunded amount: {}", creator_info.key, amount);
        
        Ok(())
    }

    fn process_cancel_bounty_emergency(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        // Get account info
        let creator_info = next_account_info(account_info_iter)?;
        let bounty_account_info = next_account_info(account_info_iter)?;
        let vault_account_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;

        // Check accounts
        if !creator_info.is_signer {
            return Err(BountyError::UnauthorizedCreator.into());
        }

        if bounty_account_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        if vault_account_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        if !system_program::check_id(system_program_info.key) {
            return Err(ProgramError::InvalidAccountData);
        }

        // Load bounty data
        let bounty_data = BountyAccount::try_from_slice(&bounty_account_info.data.borrow())?;
        
        // Validate bounty state
        if !bounty_data.is_initialized() {
            return Err(ProgramError::UninitializedAccount);
        }

        if bounty_data.status != BountyStatus::Open {
            return Err(BountyError::BountyNotOpen.into());
        }

        if bounty_data.creator != *creator_info.key {
            return Err(BountyError::UnauthorizedCreator.into());
        }

        // Verify that this is the correct vault for this bounty
        let vault_seeds = [b"vault", bounty_account_info.key.as_ref()];
        let (expected_vault, vault_bump) = Pubkey::find_program_address(&vault_seeds, program_id);
        
        if expected_vault != *vault_account_info.key {
            return Err(ProgramError::InvalidAccountData);
        }

        // Get amount to transfer back to creator
        let amount = bounty_data.amount;

        // Check that vault has enough lamports
        if vault_account_info.lamports() < amount {
            return Err(ProgramError::InsufficientFunds);
        }

        // Transfer lamports from vault back to creator
        let vault_signer_seeds = [
            b"vault",
            bounty_account_info.key.as_ref(),
            &[vault_bump],
        ];

        invoke_signed(
            &system_instruction::transfer(
                vault_account_info.key,
                creator_info.key,
                amount,
            ),
            &[
                vault_account_info.clone(),
                creator_info.clone(),
                system_program_info.clone(),
            ],
            &[&vault_signer_seeds],
        )?;

        // Update bounty status
        let mut bounty_data = BountyAccount::try_from_slice(&bounty_account_info.data.borrow())?;
        bounty_data.status = BountyStatus::Cancelled;
        
        // Save updated bounty data
        bounty_data.serialize(&mut *bounty_account_info.data.borrow_mut())?;
        
        msg!("Bounty cancelled by creator: {}, refunded amount: {}", creator_info.key, amount);
        
        Ok(())
    }

    fn process_record_submission(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        submission_id: String,
        severity: u8,
        description: String,
        ipfs_hash: String,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        // Get account info
        let hunter_info = next_account_info(account_info_iter)?;
        let bounty_account_info = next_account_info(account_info_iter)?;
        let submission_account_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;

        // Check accounts
        if !hunter_info.is_signer {
            return Err(BountyError::UnauthorizedHunter.into());
        }

        if bounty_account_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        if !system_program::check_id(system_program_info.key) {
            return Err(ProgramError::InvalidAccountData);
        }

        // Load bounty data to verify it's valid
        let bounty_data = BountyAccount::try_from_slice(&bounty_account_info.data.borrow())?;
        
        // Validate bounty state
        if !bounty_data.is_initialized() {
            return Err(ProgramError::UninitializedAccount);
        }

        if bounty_data.status != BountyStatus::Open {
            return Err(BountyError::BountyNotOpen.into());
        }

        // Validate severity
        if severity < 1 || severity > 5 {
            return Err(ProgramError::InvalidArgument);
        }

        // Validate the submission hasn't been already initialized
        if *submission_account_info.owner == *program_id {
            let submission_data = match Submission::try_from_slice(&submission_account_info.data.borrow()) {
                Ok(data) => data,
                Err(_) => Submission {
                    id: "".to_string(),
                    bounty_id: *bounty_account_info.key,
                    auditor: Pubkey::default(),
                    description: "".to_string(),
                    ipfs_hash: "".to_string(),
                    severity: 0,
                    upvotes: 0,
                    downvotes: 0,
                    status: SubmissionStatus::Pending,
                    payout_amount: None,
                    is_winner: false,
                    created_at: 0,
                },
            };

            if submission_data.is_initialized() {
                return Err(BountyError::SubmissionAlreadyApproved.into());
            }
        }

        // Get current timestamp
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Create submission data
        let submission_data = Submission {
            id: submission_id.clone(),
            bounty_id: *bounty_account_info.key,
            auditor: *hunter_info.key,
            description,
            ipfs_hash: ipfs_hash.clone(),
            severity,
            upvotes: 0,
            downvotes: 0,
            status: SubmissionStatus::Pending,
            payout_amount: None,
            is_winner: false,
            created_at: current_time,
        };

        // Calculate account size and rent
        let submission_size = std::mem::size_of::<Submission>();
        let rent = Rent::get()?;
        let rent_lamports = rent.minimum_balance(submission_size);

        // Create the submission account PDA if it doesn't exist
        if submission_account_info.owner != program_id {
            // Derive the submission address
            let submission_seed = [
                b"submission",
                bounty_account_info.key.as_ref(),
                hunter_info.key.as_ref(),
                submission_id.as_bytes(),
            ];
            let (_, submission_bump) = Pubkey::find_program_address(&submission_seed, program_id);
            let submission_signer_seeds = [
                b"submission".as_ref(),
                bounty_account_info.key.as_ref(),
                hunter_info.key.as_ref(),
                submission_id.as_bytes(),
                &[submission_bump],
            ];

            // Create the PDA account
            invoke_signed(
                &system_instruction::create_account(
                    hunter_info.key,
                    submission_account_info.key,
                    rent_lamports,
                    submission_size as u64,
                    program_id,
                ),
                &[
                    hunter_info.clone(),
                    submission_account_info.clone(),
                    system_program_info.clone(),
                ],
                &[&submission_signer_seeds],
            )?;
        }

        // Store the submission data
        submission_data.serialize(&mut *submission_account_info.data.borrow_mut())?;

        msg!("Submission recorded: ID {}, Severity {}, IPFS {}", submission_id, severity, ipfs_hash);
        
        Ok(())
    }

    fn process_vote_on_submission(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        submission_id: String,
        is_upvote: bool,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        // Get account info
        let voter_info = next_account_info(account_info_iter)?;
        let bounty_account_info = next_account_info(account_info_iter)?;
        let submission_account_info = next_account_info(account_info_iter)?;
        let vote_account_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;

        // Check accounts
        if !voter_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        if !system_program::check_id(system_program_info.key) {
            return Err(ProgramError::InvalidAccountData);
        }

        // Load bounty and submission data
        let bounty_data = BountyAccount::try_from_slice(&bounty_account_info.data.borrow())?;
        
        if !bounty_data.is_initialized() {
            return Err(ProgramError::UninitializedAccount);
        }

        if bounty_data.status != BountyStatus::Open {
            return Err(BountyError::BountyNotOpen.into());
        }

        // Check if submission exists
        if submission_account_info.owner != program_id {
            return Err(ProgramError::InvalidAccountData);
        }

        let mut submission_data = Submission::try_from_slice(&submission_account_info.data.borrow())?;
        
        if !submission_data.is_initialized() {
            return Err(ProgramError::UninitializedAccount);
        }

        // Check if the submission ID matches
        if submission_data.id != submission_id {
            return Err(ProgramError::InvalidArgument);
        }

        // Get current timestamp
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Check if voter has already voted
        let vote_type = if is_upvote { VoteType::Up } else { VoteType::Down };
        let mut existing_vote = VoteType::None;

        // Initialize vote account if it doesn't exist
        if vote_account_info.owner != program_id {
            // Derive the vote PDA
            let vote_seed = [
                b"vote",
                submission_account_info.key.as_ref(),
                voter_info.key.as_ref(),
            ];
            let (_, vote_bump) = Pubkey::find_program_address(&vote_seed, program_id);
            let vote_signer_seeds = [
                b"vote".as_ref(),
                submission_account_info.key.as_ref(),
                voter_info.key.as_ref(),
                &[vote_bump],
            ];

            // Calculate account size and rent
            let vote_size = std::mem::size_of::<Vote>();
            let rent = Rent::get()?;
            let rent_lamports = rent.minimum_balance(vote_size);

            // Create the vote account
            invoke_signed(
                &system_instruction::create_account(
                    voter_info.key,
                    vote_account_info.key,
                    rent_lamports,
                    vote_size as u64,
                    program_id,
                ),
                &[
                    voter_info.clone(),
                    vote_account_info.clone(),
                    system_program_info.clone(),
                ],
                &[&vote_signer_seeds],
            )?;

            // Initialize vote data
            let vote_data = Vote {
                voter: *voter_info.key,
                submission: *submission_account_info.key,
                bounty: *bounty_account_info.key,
                vote_type: vote_type.clone(),
                timestamp: current_time,
            };
            vote_data.serialize(&mut *vote_account_info.data.borrow_mut())?;
        } else {
            // Load existing vote
            let mut vote_data = Vote::try_from_slice(&vote_account_info.data.borrow())?;
            
            // Save existing vote type
            existing_vote = vote_data.vote_type.clone();
            
            // Update vote data
            vote_data.vote_type = vote_type.clone();
            vote_data.timestamp = current_time;
            
            // Save updated vote
            vote_data.serialize(&mut *vote_account_info.data.borrow_mut())?;
        }

        // Update submission vote counts based on previous and new vote
        match existing_vote {
            VoteType::Up => {
                if submission_data.upvotes > 0 {
                    submission_data.upvotes -= 1;
                }
            },
            VoteType::Down => {
                if submission_data.downvotes > 0 {
                    submission_data.downvotes -= 1;
                }
            },
            VoteType::None => {}
        }

        // Add new vote
        match vote_type {
            VoteType::Up => submission_data.upvotes += 1,
            VoteType::Down => submission_data.downvotes += 1,
            VoteType::None => {} // Should never happen
        }

        // Save updated submission data
        submission_data.serialize(&mut *submission_account_info.data.borrow_mut())?;

        msg!("Vote recorded: {}, Upvotes: {}, Downvotes: {}", 
            if is_upvote { "Upvote" } else { "Downvote" },
            submission_data.upvotes,
            submission_data.downvotes
        );
        
        Ok(())
    }

    fn process_select_winner(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        submission_id: String,
        payout_amount: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        // Get account info
        let creator_info = next_account_info(account_info_iter)?;
        let bounty_account_info = next_account_info(account_info_iter)?;
        let submission_account_info = next_account_info(account_info_iter)?;
        let _system_program_info = next_account_info(account_info_iter)?;

        // Check permissions - only creator can select winners
        if !creator_info.is_signer {
            return Err(BountyError::UnauthorizedCreator.into());
        }

        // Load bounty data
        let mut bounty_data = BountyAccount::try_from_slice(&bounty_account_info.data.borrow())?;
        
        // Validate bounty state
        if !bounty_data.is_initialized() {
            return Err(ProgramError::UninitializedAccount);
        }

        if bounty_data.status != BountyStatus::Open {
            return Err(BountyError::BountyNotOpen.into());
        }

        // Only creator can select winners
        if bounty_data.creator != *creator_info.key {
            return Err(BountyError::UnauthorizedCreator.into());
        }

        // Check if max winners reached
        if bounty_data.current_winners >= bounty_data.winners_count {
            return Err(ProgramError::InvalidArgument);
        }

        // Check if the submission exists
        if submission_account_info.owner != program_id {
            return Err(ProgramError::InvalidAccountData);
        }

        // Load submission data
        let mut submission_data = Submission::try_from_slice(&submission_account_info.data.borrow())?;
        
        if !submission_data.is_initialized() {
            return Err(ProgramError::UninitializedAccount);
        }

        // Verify submission ID
        if submission_data.id != submission_id {
            return Err(ProgramError::InvalidArgument);
        }

        // Verify submission not already a winner
        if submission_data.is_winner {
            return Err(ProgramError::InvalidArgument);
        }

        // Check payout amount is valid
        let max_payment_per_winner = bounty_data.amount / (bounty_data.winners_count as u64);
        if payout_amount > max_payment_per_winner {
            return Err(ProgramError::InvalidArgument);
        }

        // Update submission to mark as winner
        submission_data.is_winner = true;
        submission_data.status = SubmissionStatus::Approved;
        submission_data.payout_amount = Some(payout_amount);
        
        // Update bounty current winners count
        bounty_data.current_winners += 1;
        
        // If all winners selected, update bounty status
        if bounty_data.current_winners >= bounty_data.winners_count {
            bounty_data.status = BountyStatus::Approved;
        }

        // Save updated data
        submission_data.serialize(&mut *submission_account_info.data.borrow_mut())?;
        bounty_data.serialize(&mut *bounty_account_info.data.borrow_mut())?;

        msg!("Winner selected: {}, Payout amount: {}, Winners so far: {}/{}",
            submission_id, payout_amount, bounty_data.current_winners, bounty_data.winners_count);
        
        Ok(())
    }

    fn process_finalize_and_distribute(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        // Get account info
        let creator_info = next_account_info(account_info_iter)?;
        let bounty_account_info = next_account_info(account_info_iter)?;
        let vault_account_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;

        // Check creator authority
        if !creator_info.is_signer {
            return Err(BountyError::UnauthorizedCreator.into());
        }

        if !system_program::check_id(system_program_info.key) {
            return Err(ProgramError::InvalidAccountData);
        }

        // Load bounty data
        let mut bounty_data = BountyAccount::try_from_slice(&bounty_account_info.data.borrow())?;
        
        // Validate bounty state
        if !bounty_data.is_initialized() {
            return Err(ProgramError::UninitializedAccount);
        }

        // Only creator can finalize
        if bounty_data.creator != *creator_info.key {
            return Err(BountyError::UnauthorizedCreator.into());
        }

        // Can only finalize if all winners selected or deadline passed
        let current_time = Clock::get()?.unix_timestamp;
        let deadline_passed = current_time > bounty_data.deadline;
        let all_winners_selected = bounty_data.current_winners >= bounty_data.winners_count;
        
        if !deadline_passed && !all_winners_selected {
            return Err(ProgramError::InvalidArgument);
        }

        // Verify vault account
        let vault_seeds = [b"vault", bounty_account_info.key.as_ref()];
        let (expected_vault, vault_bump) = Pubkey::find_program_address(&vault_seeds, program_id);
        
        if expected_vault != *vault_account_info.key {
            msg!("Expected vault address: {}", expected_vault);
            msg!("Provided vault address: {}", vault_account_info.key);
            return Err(ProgramError::InvalidAccountData);
        }

        // Check vault balance
        let vault_balance = vault_account_info.lamports();
        if vault_balance == 0 {
            return Err(ProgramError::InsufficientFunds);
        }

        // Transfer remaining funds back to creator
        let vault_signer_seeds = [
            b"vault", 
            bounty_account_info.key.as_ref(),
            &[vault_bump]
        ];

        invoke_signed(
            &system_instruction::transfer(
                vault_account_info.key,
                creator_info.key,
                vault_balance,
            ),
            &[
                vault_account_info.clone(),
                creator_info.clone(),
                system_program_info.clone(),
            ],
            &[&vault_signer_seeds],
        )?;

        // Update bounty status
        bounty_data.status = BountyStatus::Claimed;
        bounty_data.serialize(&mut *bounty_account_info.data.borrow_mut())?;

        msg!("Bounty finalized and remaining funds ({} lamports) returned to creator", vault_balance);
        
        Ok(())
    }
} 