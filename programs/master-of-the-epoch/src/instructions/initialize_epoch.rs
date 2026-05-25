use anchor_lang::prelude::*;
use crate::{constants::*, error::MasterError, state::{EpochState, GameCounter}};

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

    /// Persistent monotonic game counter — never drained, survives epoch close.
    /// Created on the first call; bumped on every subsequent call so each game
    /// gets a unique game_id regardless of block timestamp (audit M-1 fix).
    #[account(
        init_if_needed,
        payer = payer,
        space = GameCounter::LEN,
        seeds = [GAME_COUNTER_SEED],
        bump,
    )]
    pub game_counter: Account<'info, GameCounter>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeEpoch>) -> Result<()> {
    // Increment before reading so game_id 0 is never issued and every game
    // gets a strictly larger id than the previous one (audit M-1 fix).
    let new_game_id = {
        let counter = &mut ctx.accounts.game_counter;
        counter.count = counter.count
            .checked_add(1)
            .ok_or(MasterError::Overflow)?;
        counter.bump = ctx.bumps.game_counter;
        counter.count
    };

    let state = &mut ctx.accounts.epoch_state;
    // Treasury is baked in as a compile-time constant — no caller argument,
    // so no one can install a malicious treasury by front-running (audit C-1 fix).
    state.treasury = TREASURY_ADDRESS;
    state.current_master = Pubkey::default();
    state.master_since = 0;
    state.leading_master = Pubkey::default();
    state.leading_master_time = 0;
    state.game_epoch = 0;
    state.pot = 0;
    state.next_claim_cost = INITIAL_CLAIM_COST;
    state.closed = false;
    state.bump = ctx.bumps.epoch_state;
    state.game_id = new_game_id;

    Ok(())
}
