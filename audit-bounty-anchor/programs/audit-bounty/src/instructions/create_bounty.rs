use anchor_lang::prelude::*;
use crate::{state::*, constants::*};

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
        bump,
        seeds::program = system_program.key()
    )]
    /// CHECK: This is the escrow account for the bounty
    pub escrow: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateBounty>, amount: u64, nonce: u8) -> Result<()> {
    let bounty = &mut ctx.accounts.bounty;
    let creator = &ctx.accounts.creator;
    let escrow = &ctx.accounts.escrow;
    
    // Set bumps for PDAs
    let bump = bounty.bump;
    let _escrow_bump = ctx.bumps.escrow;
    
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