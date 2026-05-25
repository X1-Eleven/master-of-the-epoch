use anchor_lang::prelude::*;

#[account]
pub struct EpochState {
    /// Treasury wallet that receives 10% of the pot
    pub treasury: Pubkey,
    /// Current master's wallet
    pub current_master: Pubkey,
    /// When the current master took the throne (Unix timestamp)
    pub master_since: i64,
    /// Wallet currently leading on total accumulated reign time
    pub leading_master: Pubkey,
    /// leading_master's cumulative reign seconds (across all their reigns so far,
    /// not counting the current master's ongoing stint — that is added at close_epoch)
    pub leading_master_time: u64,
    /// The X1 network epoch number during which this game was started.
    /// Set on the first claim_throne call; 0 means the game has not started.
    /// The game is live while Clock::get().epoch == game_epoch,
    /// and over when Clock::get().epoch > game_epoch.
    pub game_epoch: u64,
    /// Total XNT (in lamports) collected this epoch
    pub pot: u64,
    /// Cost in lamports for the next claim (starts at 5 XNT, +5 each takeover)
    pub next_claim_cost: u64,
    /// True once the epoch has been closed and prizes paid out
    pub closed: bool,
    /// Bump seed for the PDA
    pub bump: u8,
}

impl EpochState {
    pub const LEN: usize = 8  // discriminator
        + 32  // treasury
        + 32  // current_master
        + 8   // master_since
        + 32  // leading_master
        + 8   // leading_master_time
        + 8   // game_epoch
        + 8   // pot
        + 8   // next_claim_cost
        + 1   // closed
        + 1;  // bump
}

/// Per-wallet record tracking cooldown and cumulative reign time.
/// Created on a wallet's first claim; updated every time they are deposed.
#[account]
pub struct MasterRecord {
    /// The wallet this record belongs to
    pub owner: Pubkey,
    /// Unix timestamp of their last successful claim (for cooldown enforcement)
    pub last_claim: i64,
    /// Sum of all completed reign durations for this wallet, in seconds.
    /// The current ongoing reign is NOT included here — it is tallied at
    /// claim_throne (when they're deposed) or close_epoch (if they're last master).
    pub total_reign_time: u64,
    pub bump: u8,
}

impl MasterRecord {
    pub const LEN: usize = 8  // discriminator
        + 32  // owner
        + 8   // last_claim
        + 8   // total_reign_time
        + 1;  // bump
}
