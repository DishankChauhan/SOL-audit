use anchor_lang::prelude::*;
use crate::{state::*, constants::*, errors::*};

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

pub fn handler(ctx: Context<SubmitReport>, report_uri: String) -> Result<()> {
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