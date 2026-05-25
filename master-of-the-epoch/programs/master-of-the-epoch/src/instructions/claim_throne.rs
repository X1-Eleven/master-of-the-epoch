use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_lang::AccountDeserialize;
use crate::{constants::*, state::{EpochState, MasterRecord}, error::MasterError};

#[derive(Accounts)]
pub struct ClaimThrone<'info> {
    #[account(
        mut,
        seeds = [EPOCH_SEED],
        bump = epoch_state.bump,
    )]
    pub epoch_state: Account<'info, EpochState>,

    /// The claimant's own master record — created on their first claim.
    #[account(
        init_if_needed,
        payer = claimant,
        space = MasterRecord::LEN,
        seeds = [MASTER_RECORD_SEED, claimant.key().as_ref()],
        bump,
    )]
    pub claimant_record: Account<'info, MasterRecord>,

    /// The OUTGOING master's master record.
    /// When there is no current master (epoch_state.current_master == default),
    /// pass any account here — it is ignored.  When there IS a current master,
    /// this MUST be the PDA derived from [MASTER_RECORD_SEED, current_master],
    /// validated and written to in the handler.
    /// CHECK: validated in handler via find_program_address when current_master != default
    #[account(mut)]
    pub outgoing_master_record: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = claimant.key() != epoch_state.current_master @ MasterError::SelfReclaim,
    )]
    pub claimant: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ClaimThrone>) -> Result<()> {
    let claimant_key = ctx.accounts.claimant.key();
    let now = Clock::get()?.unix_timestamp;

    // ── pre-flight checks ────────────────────────────────────────────────────
    {
        let state = &ctx.accounts.epoch_state;
        require!(!state.closed, MasterError::EpochAlreadyClosed);
        // Once the game has started (current_master != default), reject new claims
        // if the X1 network epoch has rolled over.
        if state.current_master != Pubkey::default() {
            let clock = Clock::get()?;
            require!(clock.epoch == state.game_epoch, MasterError::EpochOver);
        }
    }

    // Cooldown: skip on first-ever claim from this wallet (last_claim == 0)
    {
        let record = &ctx.accounts.claimant_record;
        if record.last_claim != 0 {
            let elapsed = now
                .checked_sub(record.last_claim)
                .ok_or(MasterError::Overflow)?;
            require!(elapsed >= CLAIM_COOLDOWN, MasterError::CooldownActive);
        }
    }

    let cost = ctx.accounts.epoch_state.next_claim_cost;

    // ── payment: claimant → epoch_state vault ────────────────────────────────
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            system_program::Transfer {
                from: ctx.accounts.claimant.to_account_info(),
                to: ctx.accounts.epoch_state.to_account_info(),
            },
        ),
        cost,
    )?;

    // ── credit the outgoing master's completed reign ────────────────────────────
    // Must happen AFTER payment (CPI may re-borrow epoch_state) and before
    // we swap current_master, so we still have the old master's identity.
    let state = &mut ctx.accounts.epoch_state;

    // First claim: anchor this game to the current X1 network epoch.
    if state.current_master == Pubkey::default() {
        state.game_epoch = Clock::get()?.epoch;
    }

    if state.current_master != Pubkey::default() {
        let reign_duration = (now
            .checked_sub(state.master_since)
            .ok_or(MasterError::Overflow)?) as u64;

        // Validate that the caller supplied the correct outgoing master record PDA.
        let (expected_pda, _) = Pubkey::find_program_address(
            &[MASTER_RECORD_SEED, state.current_master.as_ref()],
            ctx.program_id,
        );
        require_keys_eq!(
            ctx.accounts.outgoing_master_record.key(),
            expected_pda,
            MasterError::InvalidMasterRecord,
        );

        // Deserialize → add reign → serialize back.
        let mut outgoing = {
            let data = ctx.accounts.outgoing_master_record.try_borrow_data()?;
            MasterRecord::try_deserialize(&mut data.as_ref())?
        };
        outgoing.total_reign_time = outgoing.total_reign_time
            .checked_add(reign_duration)
            .ok_or(MasterError::Overflow)?;
        {
            let mut data = ctx.accounts.outgoing_master_record.try_borrow_mut_data()?;
            outgoing.try_serialize(&mut data.as_mut())?;
        }

        // Update the epoch-level leaderboard with the outgoing master's new cumulative total.
        if outgoing.total_reign_time > state.leading_master_time {
            state.leading_master = state.current_master;
            state.leading_master_time = outgoing.total_reign_time;
        }
    }

    // ── crown the new master ────────────────────────────────────────────────────
    state.current_master = claimant_key;
    state.master_since = now;
    state.pot = state.pot
        .checked_add(cost)
        .ok_or(MasterError::Overflow)?;
    state.next_claim_cost = state.next_claim_cost
        .checked_add(CLAIM_COST_STEP)
        .ok_or(MasterError::Overflow)?;

    // Update the claimant's cooldown (and bump on first init)
    let claimant_record = &mut ctx.accounts.claimant_record;
    claimant_record.owner = claimant_key;
    claimant_record.last_claim = now;
    claimant_record.bump = ctx.bumps.claimant_record;

    msg!(
        "New master: {} | cost: {} lamports | game epoch: {}",
        claimant_key,
        cost,
        state.game_epoch,
    );

    Ok(())
}
