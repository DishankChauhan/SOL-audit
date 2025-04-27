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
    state::{BountyAccount, BountyStatus},
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
            BountyInstruction::CreateBounty { amount, deadline, custom_seed } => {
                msg!("Instruction: CreateBounty");
                Self::process_create_bounty(program_id, accounts, amount, deadline, custom_seed)
            }
            BountyInstruction::SubmitWork { submission_url } => {
                msg!("Instruction: SubmitWork");
                Self::process_submit_work(program_id, accounts, submission_url)
            }
            BountyInstruction::ApproveSubmission { hunter } => {
                msg!("Instruction: ApproveSubmission");
                Self::process_approve_submission(program_id, accounts, hunter)
            }
            BountyInstruction::ClaimBounty => {
                msg!("Instruction: ClaimBounty");
                Self::process_claim_bounty(program_id, accounts)
            }
            BountyInstruction::CancelBounty => {
                msg!("Instruction: CancelBounty");
                Self::process_cancel_bounty(program_id, accounts)
            }
        }
    }

    fn process_create_bounty(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount: u64,
        deadline: i64,
        custom_seed: Option<Vec<u8>>,
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
        };

        bounty_account.serialize(&mut *bounty_account_info.data.borrow_mut())?;
        
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
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        // Get account info
        let creator_info = next_account_info(account_info_iter)?;
        let bounty_account_info = next_account_info(account_info_iter)?;
        let hunter_info = next_account_info(account_info_iter)?;

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

        // Update bounty status and hunter
        let mut bounty_data = BountyAccount::try_from_slice(&bounty_account_info.data.borrow())?;
        bounty_data.status = BountyStatus::Approved;
        bounty_data.hunter = Some(hunter);

        // Save updated bounty data
        bounty_data.serialize(&mut *bounty_account_info.data.borrow_mut())?;
        
        msg!("Submission approved for hunter: {}", hunter_info.key);
        
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
} 