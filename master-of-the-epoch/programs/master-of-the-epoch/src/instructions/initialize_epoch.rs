use anchor_lang::prelude::*;
use crate::{constants::*, state::EpochState, error::MasterError};

#[derive(Accounts)]
pub struct InitializeEpoch<'info> {
    #[account(
        init,
        payer = payer,
        space = EpochState::LEN,
        seeds = [EPOCH_SEED],
        bump,
    )]
    pub epoch_state: Account<'info, EpochState>,

    /// The treasury wallet — baked into state at init time
    /// CHECK: Any pubkey is valid; it just receives SOL
    pub treasury: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeEpoch>) -> Result<()> {
    require!(!ctx.accounts.epoch_state.closed, MasterError::EpochAlreadyClosed);

    let state = &mut ctx.accounts.epoch_state;
    state.treasury = ctx.accounts.treasury.key();
    state.current_master = Pubkey::default();
    state.master_since = 0;
    state.leading_master = Pubkey::default();
    state.leading_master_time = 0;
    state.game_epoch = 0;
    state.pot = 0;
    state.next_claim_cost = INITIAL_CLAIM_COST;
    state.closed = false;
    state.bump = ctx.bumps.epoch_state;

    Ok(())
}
