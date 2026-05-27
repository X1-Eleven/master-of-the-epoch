pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("BC4y2dVdicttQCFSrBA9DjGxuHQrn3dikzds7twaRXu1");

#[program]
pub mod master_of_the_epoch {
    use super::*;

    /// One-time setup: create the epoch state account and record the treasury address.
    pub fn initialize_epoch(ctx: Context<InitializeEpoch>) -> Result<()> {
        instructions::initialize_epoch::handler(ctx)
    }

    /// Pay XNT to seize the master position. Starts the 22-hour epoch on first call.
    pub fn claim_master(ctx: Context<ClaimMaster>) -> Result<()> {
        instructions::claim_master::handler(ctx)
    }

    /// Anyone may call after epoch_end to distribute the pot to winner/burn/treasury/caller.
    pub fn close_epoch(ctx: Context<CloseEpoch>) -> Result<()> {
        instructions::close_epoch::handler(ctx)
    }
}
