use anchor_lang::prelude::*;

mod state;
mod constants;
mod errors;
mod instructions;

pub use instructions::*;
pub use state::*;
pub use constants::*;
pub use errors::*;

declare_id!("BUPQa6bZdMcos6JnNmiaqwywPrBsS9iYVagH2TcBKSXi");

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum BountyStatus {
    Open,
    Submitted,
    Approved,
    Cancelled,
}

#[account]
pub struct Bounty {
    pub creator: Pubkey,               // Wallet of the creator
    pub auditor: Option<Pubkey>,       // Wallet of the assigned auditor
    pub amount: u64,                   // Amount locked in the bounty
    pub status: BountyStatus,          // Open, Submitted, Approved, Cancelled
    pub report_uri: Option<String>,    // IPFS or Arweave link to the report
    pub created_at: i64,               // Unix timestamp
    pub nonce: u8,                     // For PDA derivation
    pub bump: u8,                      // PDA bump
}

impl Bounty {
    pub const MAX_REPORT_URI_SIZE: usize = 100; // Define max size for report_uri
    
    pub fn space() -> usize {
        8 +                              // Discriminator
        32 +                             // creator: Pubkey
        1 + 32 +                         // Option<Pubkey> for auditor
        8 +                              // amount: u64
        1 +                              // status (enum)
        1 + Self::MAX_REPORT_URI_SIZE +  // Option<String> for report_uri
        8 +                              // created_at: i64
        1 +                              // nonce: u8
        1                                // bump: u8
    }
}

pub const BOUNTY_SEED: &[u8] = b"bounty";
pub const ESCROW_SEED: &[u8] = b"escrow";

#[error_code]
pub enum BountyError {
    #[msg("Bounty is not in Open status")]
    BountyNotOpen,
    
    #[msg("Bounty is not in Submitted status")]
    BountyNotInReview,
    
    #[msg("Bounty is not in Approved status")]
    BountyNotCompleted,
    
    #[msg("Only creator can perform this action")]
    OnlyCreatorCanPerform,
    
    #[msg("Report URI is too long")]
    ReportLinkTooLong,
    
    #[msg("Invalid escrow account")]
    InvalidEscrowAccount,
    
    #[msg("Bounty already has an auditor assigned")]
    AuditorAlreadyAssigned,
    
    #[msg("Auto-release deadline has not been reached yet")]
    DeadlineNotReached,
}

#[program]
pub mod audit_bounty {
    use super::*;

    pub fn create_bounty(
        ctx: Context<CreateBounty>,
        amount: u64,
        nonce: u8
    ) -> Result<()> {
        let bounty = &mut ctx.accounts.bounty;
        let creator = &ctx.accounts.creator;
        let escrow = &ctx.accounts.escrow;
        
        // Set bumps for PDAs
        let bump = ctx.bumps.bounty;
        let escrow_bump = ctx.bumps.escrow;
        
        // Transfer funds from creator to escrow account
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            creator.key,
            escrow.key,
            amount,
        );
        
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                creator.to_account_info(),
                escrow.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        
        // Initialize bounty account
        bounty.creator = *creator.key;
        bounty.auditor = None;
        bounty.amount = amount;
        bounty.status = BountyStatus::Open;
        bounty.report_uri = None;
        bounty.created_at = Clock::get()?.unix_timestamp;
        bounty.nonce = nonce;
        bounty.bump = bump;
        
        Ok(())
    }

    pub fn submit_report(
        ctx: Context<SubmitReport>,
        report_uri: String
    ) -> Result<()> {
        let bounty = &mut ctx.accounts.bounty;
        let auditor = &ctx.accounts.auditor;
        
        // Validate report URI length
        if report_uri.len() > Bounty::MAX_REPORT_URI_SIZE {
            return Err(BountyError::ReportLinkTooLong.into());
        }
        
        // Update bounty status
        bounty.auditor = Some(*auditor.key);
        bounty.report_uri = Some(report_uri);
        bounty.status = BountyStatus::Submitted;
        
        Ok(())
    }

    pub fn approve_and_release(ctx: Context<ApproveAndRelease>) -> Result<()> {
        let bounty = &mut ctx.accounts.bounty;
        let auditor = &ctx.accounts.auditor;
        let escrow = &ctx.accounts.escrow;
        
        // Transfer funds from escrow to auditor
        let amount = bounty.amount;
        
        // We need to use the PDA's bump to generate the correct seeds for signing
        let escrow_bump = ctx.bumps.escrow;
        
        // Get the correct escrow seeds
        let bounty_key = bounty.key();
        let escrow_seeds = &[
            ESCROW_SEED,
            bounty_key.as_ref(),
            &[escrow_bump]
        ];
        
        // Use invoke_signed to transfer funds from escrow PDA to auditor
        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::transfer(
                escrow.key,
                auditor.key,
                amount,
            ),
            &[
                escrow.to_account_info(),
                auditor.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[escrow_seeds],
        )?;
        
        // Update bounty status
        bounty.status = BountyStatus::Approved;
        
        Ok(())
    }

    pub fn reject_report(ctx: Context<RejectReport>) -> Result<()> {
        let bounty = &mut ctx.accounts.bounty;
        
        // Reset bounty
        bounty.auditor = None;
        bounty.report_uri = None;
        bounty.status = BountyStatus::Open;
        
        Ok(())
    }

    pub fn cancel_bounty(ctx: Context<CancelBounty>) -> Result<()> {
        let bounty = &mut ctx.accounts.bounty;
        let creator = &ctx.accounts.creator;
        let escrow = &ctx.accounts.escrow;
        
        // Transfer funds from escrow back to creator
        let amount = bounty.amount;
        
        // We need to use the PDA's bump to generate the correct seeds for signing
        let escrow_bump = ctx.bumps.escrow;
        
        // Get the correct escrow seeds
        let bounty_key = bounty.key();
        let escrow_seeds = &[
            ESCROW_SEED,
            bounty_key.as_ref(),
            &[escrow_bump]
        ];
        
        // Use invoke_signed to transfer funds from escrow PDA back to creator
        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::transfer(
                escrow.key,
                creator.key,
                amount,
            ),
            &[
                escrow.to_account_info(),
                creator.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[escrow_seeds],
        )?;
        
        // Update bounty status
        bounty.status = BountyStatus::Cancelled;
        
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(amount: u64, nonce: u8)]
pub struct CreateBounty<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    
    #[account(
        init,
        payer = creator,
        space = Bounty::space(),
        seeds = [
            BOUNTY_SEED, 
            creator.key().as_ref(), 
            &[nonce]
        ],
        bump
    )]
    pub bounty: Account<'info, Bounty>,
    
    #[account(
        mut,
        seeds = [
            ESCROW_SEED,
            bounty.key().as_ref()
        ],
        bump
    )]
    /// CHECK: This is the escrow account for the bounty
    pub escrow: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitReport<'info> {
    #[account(mut)]
    pub auditor: Signer<'info>,
    
    #[account(
        mut,
        seeds = [
            BOUNTY_SEED, 
            bounty.creator.as_ref(), 
            &[bounty.nonce]
        ],
        bump = bounty.bump,
        constraint = bounty.status == BountyStatus::Open @ BountyError::BountyNotOpen,
        constraint = bounty.auditor.is_none() @ BountyError::AuditorAlreadyAssigned,
    )]
    pub bounty: Account<'info, Bounty>,
}

#[derive(Accounts)]
pub struct ApproveAndRelease<'info> {
    #[account(
        constraint = creator.key() == bounty.creator @ BountyError::OnlyCreatorCanPerform
    )]
    pub creator: Signer<'info>,
    
    #[account(
        mut,
        seeds = [
            BOUNTY_SEED, 
            bounty.creator.as_ref(), 
            &[bounty.nonce]
        ],
        bump = bounty.bump,
        constraint = bounty.status == BountyStatus::Submitted @ BountyError::BountyNotInReview,
    )]
    pub bounty: Account<'info, Bounty>,
    
    /// CHECK: This is the auditor who will receive the funds
    #[account(
        mut,
        constraint = Some(auditor.key()) == bounty.auditor @ BountyError::InvalidEscrowAccount,
    )]
    pub auditor: AccountInfo<'info>,
    
    #[account(
        mut,
        seeds = [
            ESCROW_SEED,
            bounty.key().as_ref()
        ],
        bump
    )]
    /// CHECK: This is the escrow PDA that holds the funds
    pub escrow: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RejectReport<'info> {
    #[account(
        constraint = creator.key() == bounty.creator @ BountyError::OnlyCreatorCanPerform
    )]
    pub creator: Signer<'info>,
    
    #[account(
        mut,
        seeds = [
            BOUNTY_SEED, 
            bounty.creator.as_ref(), 
            &[bounty.nonce]
        ],
        bump = bounty.bump,
        constraint = bounty.status == BountyStatus::Submitted @ BountyError::BountyNotInReview,
    )]
    pub bounty: Account<'info, Bounty>,
}

#[derive(Accounts)]
pub struct CancelBounty<'info> {
    #[account(
        mut,
        constraint = creator.key() == bounty.creator @ BountyError::OnlyCreatorCanPerform
    )]
    pub creator: Signer<'info>,
    
    #[account(
        mut,
        seeds = [
            BOUNTY_SEED, 
            bounty.creator.as_ref(), 
            &[bounty.nonce]
        ],
        bump = bounty.bump,
        constraint = bounty.status == BountyStatus::Open @ BountyError::BountyNotOpen,
    )]
    pub bounty: Account<'info, Bounty>,
    
    #[account(
        mut,
        seeds = [
            ESCROW_SEED,
            bounty.key().as_ref()
        ],
        bump
    )]
    /// CHECK: This is the escrow PDA that holds the funds
    pub escrow: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}