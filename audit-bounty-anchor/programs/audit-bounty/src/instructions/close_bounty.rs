use anchor_lang::prelude::*;
use crate::{state::*, constants::*, errors::*};

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
        bump,
        seeds::program = system_program.key()
    )]
    /// CHECK: This is the escrow PDA that holds the funds
    pub escrow: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CancelBounty>) -> Result<()> {
    let bounty = &mut ctx.accounts.bounty;
    let creator = &ctx.accounts.creator;
    let escrow = &ctx.accounts.escrow;
    
    // Transfer funds from escrow back to creator
    let amount = bounty.amount;
    
    let bounty_key = bounty.key();
    let escrow_bump = ctx.bumps.escrow;
    let escrow_seeds = &[
        ESCROW_SEED,
        bounty_key.as_ref(),
        &[escrow_bump],
    ];
    
    // Use invoke_signed to transfer funds from escrow PDA back to creator
    anchor_lang::solana_program::program::invoke_signed(
        &anchor_lang::solana_program::system_instruction::transfer(
            escrow.key,
            creator.key,
            amount,
        ),
        &[
            escrow.clone(),
            creator.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[escrow_seeds],
    )?;
    
    // Update bounty status
    bounty.status = BountyStatus::Cancelled;
    
    Ok(())
} 