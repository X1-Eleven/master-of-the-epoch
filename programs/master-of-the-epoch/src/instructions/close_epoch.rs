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

    /// Must match epoch_state.treasury — enforced by address constraint.
    /// CHECK: validated via address = epoch_state.treasury
    #[account(mut, address = epoch_state.treasury @ MasterError::InvalidTreasury)]
    pub treasury: UncheckedAccount<'info>,

    /// Hardcoded burn sink — lamports sent here are permanently removed from circulation.
    /// CHECK: address constraint enforces the well-known incinerator
    #[account(mut, address = BURN_ADDRESS)]
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

    // ── compute the final master's complete cumulative total ────────────────────
    // current_master_record.total_reign_time holds all their COMPLETED reigns.
    // Add the final ongoing reign measured by the wall-clock timestamp at the
    // moment close_epoch is called.
    let final_reign = (clock.unix_timestamp
        .checked_sub(state.master_since)
        .ok_or(MasterError::Overflow)?) as u64;

    let final_master_total = ctx.accounts.current_master_record
        .total_reign_time
        .checked_add(final_reign)
        .ok_or(MasterError::Overflow)?;

    // ── determine the winner ──────────────────────────────────────────────────
    // >= so that when both totals are zero the final (current) master wins
    // rather than falling through to leading_master which may be Pubkey::default().
    let winner_key = if final_master_total >= state.leading_master_time {
        state.leading_master = state.current_master;
        state.leading_master_time = final_master_total;
        state.current_master
    } else {
        state.leading_master
    };

    require_keys_eq!(
        ctx.accounts.winner.key(),
        winner_key,
        MasterError::InvalidWinner
    );

    let (pot, leading_master_time) = {
        state.closed = true;
        (state.pot, state.leading_master_time)
    };

    // ── payout ───────────────────────────────────────────────────────────────
    // Use u128 intermediates to prevent overflow when pot is large.
    let winner_share   = ((pot as u128) * (WINNER_BPS   as u128) / 10_000u128) as u64;
    let burn_share     = ((pot as u128) * (BURN_BPS     as u128) / 10_000u128) as u64;
    let treasury_share = ((pot as u128) * (TREASURY_BPS as u128) / 10_000u128) as u64;
    // Remainder to caller — absorbs any integer-division dust.
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
