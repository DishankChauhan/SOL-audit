use anchor_lang::prelude::*;
use crate::{state::*, constants::*, errors::*};

// Define the deadline in seconds (7 days)
const AUTO_RELEASE_DEADLINE: i64 = 7 * 24 * 60 * 60;

#[derive(Accounts)]
pub struct AutoRelease<'info> {
    #[account(mut)]
    /// CHECK: Can be anyone triggering the auto-release
    pub payer: Signer<'info>,
    
    #[account(
        mut,
        seeds = [
            BOUNTY_SEED, 
            bounty.creator.as_ref(), 
            &[bounty.nonce]
        ],
        bump = bounty.bump,
        constraint = bounty.status == BountyStatus::Submitted @ BountyError::BountyNotInReview,
        // Check that deadline has passed
        constraint = 
            Clock::get().unwrap().unix_timestamp >= 
            (bounty.created_at + AUTO_RELEASE_DEADLINE) @ BountyError::DeadlineNotReached,
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
        bump,
        seeds::program = system_program.key()
    )]
    /// CHECK: This is the escrow PDA that holds the funds
    pub escrow: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AutoRelease>) -> Result<()> {
    let bounty = &mut ctx.accounts.bounty;
    let auditor = &ctx.accounts.auditor;
    let escrow = &ctx.accounts.escrow;
    
    // Transfer funds from escrow to auditor
    let amount = bounty.amount;
    
    let bounty_key = bounty.key();
    let escrow_bump = ctx.bumps.escrow;
    let escrow_seeds = &[
        ESCROW_SEED,
        bounty_key.as_ref(),
        &[escrow_bump],
    ];
    
    // Use invoke_signed to transfer funds from escrow PDA to auditor
    anchor_lang::solana_program::program::invoke_signed(
        &anchor_lang::solana_program::system_instruction::transfer(
            escrow.key,
            auditor.key,
            amount,
        ),
        &[
            escrow.clone(),
            auditor.clone(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[escrow_seeds],
    )?;
    
    // Update bounty status
    bounty.status = BountyStatus::Approved;
    
    Ok(())
} 