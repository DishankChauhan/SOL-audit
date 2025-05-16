use anchor_lang::prelude::*;
use crate::{state::*, constants::*, errors::*};

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

pub fn handler(ctx: Context<RejectReport>) -> Result<()> {
    let bounty = &mut ctx.accounts.bounty;
    
    // Reset bounty
    bounty.auditor = None;
    bounty.report_uri = None;
    bounty.status = BountyStatus::Open;
    
    Ok(())
} 