use anchor_lang::prelude::*;

#[account]
pub struct EpochState {
    /// Treasury wallet that receives 10% of the pot
    pub treasury: Pubkey,
    /// Current master's wallet
    pub current_master: Pubkey,
    /// When the current master took the position (Unix timestamp)
    pub master_since: i64,
    /// Wallet currently leading on total accumulated reign time
    pub leading_master: Pubkey,
    /// leading_master's cumulative reign seconds (across all their reigns so far,
    /// not counting the current master's ongoing stint — that is added at close_epoch)
    pub leading_master_time: u64,
    /// The X1 network epoch number during which this game was started.
    /// Set on the first claim_master call; 0 means the game has not started.
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
    /// Unique identifier for this game instance.  Set to GameCounter.count at
    /// initialize_epoch time.  The counter is monotonically incremented each
    /// initialization, so two consecutive games can never share the same id
    /// even if they land in the same slot (audit M-1 fix).
    /// MasterRecord entries whose game_id differs from this are stale and are
    /// reset on a player's first claim in the new game.
    pub game_id: u64,
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
        + 1   // bump
        + 8;  // game_id
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
    /// claim_master (when they're deposed) or close_epoch (if they're last master).
    pub total_reign_time: u64,
    pub bump: u8,
    /// Mirrors EpochState.game_id at the time of this wallet's last claim.
    /// If it differs from the current epoch's game_id the record is stale and
    /// its per-game fields (total_reign_time, last_claim) are reset before use.
    pub game_id: u64,
}

impl MasterRecord {
    pub const LEN: usize = 8  // discriminator
        + 32  // owner
        + 8   // last_claim
        + 8   // total_reign_time
        + 1   // bump
        + 8;  // game_id
}

/// Singleton PDA that survives epoch close and is never drained.
/// Holds a monotonically incrementing counter used as game_id so that
/// two consecutive games always receive distinct identifiers (audit M-1 fix).
#[account]
pub struct GameCounter {
    pub count: u64,
    pub bump: u8,
}

impl GameCounter {
    pub const LEN: usize = 8  // discriminator
        + 8   // count
        + 1;  // bump
}
