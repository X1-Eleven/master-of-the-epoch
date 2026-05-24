use anchor_lang::prelude::*;
use crate::{constants::*, state::{EpochState, MasterRecord}, error::MasterError};

#[derive(Accounts)]
pub struct CloseEpoch<'info> {
    #[account(
        mut,
        seeds = [EPOCH_SEED],
        bump = epoch_state.bump,
    )]
    pub epoch_state: Account<'info, EpochState>,

    /// The final (current) master's record.
    /// Their last reign has not yet been committed to total_reign_time — we
    /// add it here when computing the winner.
    /// Seeds are derived from epoch_state.current_master, which is valid because
    /// epoch_end != 0 implies at least one claim was made (current_master != default).
    #[account(
        seeds = [MASTER_RECORD_SEED, epoch_state.current_master.as_ref()],
        bump = current_master_record.bump,
    )]
    pub current_master_record: Account<'info, MasterRecord>,

    /// Whoever calls close_epoch earns 5% of the pot.
    #[account(mut)]
    pub caller: Signer<'info>,

    /// Must match the wallet determined to be the winner in the handler.
    /// CHECK: validated in handler after computing cumulative totals
    #[account(mut)]
    pub winner: UncheckedAccount<'info>,

    /// Must match epoch_state.treasury — validated in handler.
    /// CHECK: validated against epoch_state.treasury in handler
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    /// Burn address — lamports sent here are effectively destroyed.
    /// CHECK: intentional sink; any pubkey is valid
    #[account(mut)]
    pub burn_address: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<CloseEpoch>) -> Result<()> {
    let clock = Clock::get()?;
    let state = &mut ctx.accounts.epoch_state;

    require!(!state.closed, MasterError::EpochAlreadyClosed);
    // Require at least one claim was made and the X1 network epoch has rolled over.
    require!(
        state.current_master != Pubkey::default() && clock.epoch > state.game_epoch,
        MasterError::EpochNotOver
    );

    require_keys_eq!(
        ctx.accounts.treasury.key(),
        state.treasury,
        MasterError::EpochNotOver
    );

    // ── compute the final master's complete cumulative total ────────────────────
    // current_master_record.total_reign_time holds all their COMPLETED reigns.
    // Add the final ongoing reign measured by the wall-clock timestamp at the
    // moment close_epoch is called.  This is the best on-chain approximation of
    // "time on the throne until the X1 epoch boundary."
    let final_reign = (clock.unix_timestamp
        .checked_sub(state.master_since)
        .unwrap_or(0)) as u64;

    let final_master_total = ctx.accounts.current_master_record
        .total_reign_time
        .checked_add(final_reign)
        .ok_or(MasterError::Overflow)?;

    // ── determine the winner ──────────────────────────────────────────────────
    // leading_master_time is the best cumulative total seen across all deposed masters.
    // We compare it against the final master's just-computed total.
    let winner_key = if final_master_total > state.leading_master_time {
        state.leading_master = state.current_master;
        state.leading_master_time = final_master_total;
        state.current_master
    } else {
        state.leading_master
    };

    require_keys_eq!(
        ctx.accounts.winner.key(),
        winner_key,
        MasterError::EpochNotOver
    );

    // Snapshot values we need after the mutable borrow ends, then close the
    // borrow explicitly so to_account_info() can be called on epoch_state below.
    let (pot, leading_master_time) = {
        state.closed = true;
        (state.pot, state.leading_master_time)
    };

    // ── payout ───────────────────────────────────────────────────────────────
    let winner_share   = pot.checked_mul(WINNER_BPS).ok_or(MasterError::Overflow)?   / 10_000;
    let burn_share     = pot.checked_mul(BURN_BPS).ok_or(MasterError::Overflow)?     / 10_000;
    let treasury_share = pot.checked_mul(TREASURY_BPS).ok_or(MasterError::Overflow)? / 10_000;
    // Remainder to caller prevents dust from accumulating in the vault.
    let caller_share = pot
        .checked_sub(winner_share)
        .and_then(|r| r.checked_sub(burn_share))
        .and_then(|r| r.checked_sub(treasury_share))
        .ok_or(MasterError::Overflow)?;

    // epoch_state is owned by this program — direct lamport manipulation is correct.
    let epoch_info = ctx.accounts.epoch_state.to_account_info();

    **epoch_info.try_borrow_mut_lamports()? -= winner_share;
    **ctx.accounts.winner.try_borrow_mut_lamports()? += winner_share;

    **epoch_info.try_borrow_mut_lamports()? -= burn_share;
    **ctx.accounts.burn_address.try_borrow_mut_lamports()? += burn_share;

    **epoch_info.try_borrow_mut_lamports()? -= treasury_share;
    **ctx.accounts.treasury.try_borrow_mut_lamports()? += treasury_share;

    **epoch_info.try_borrow_mut_lamports()? -= caller_share;
    **ctx.accounts.caller.try_borrow_mut_lamports()? += caller_share;

    msg!(
        "Epoch closed | winner: {} | total time: {}s | pot: {} | \
         winner_share: {} | burn: {} | treasury: {} | caller: {}",
        winner_key,
        leading_master_time,
        pot,
        winner_share,
        burn_share,
        treasury_share,
        caller_share,
    );

    Ok(())
}
