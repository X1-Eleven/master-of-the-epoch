pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("HLB1ZRJCnJ3XThkKx9SD6VcDVEVq8EGGqWdGWFFDAE1w");

#[program]
pub mod master_of_the_epoch {
    use super::*;

    /// One-time setup: create the epoch state account and record the treasury address.
    pub fn initialize_epoch(ctx: Context<InitializeEpoch>) -> Result<()> {
        instructions::initialize_epoch::handler(ctx)
    }

    /// Pay XNT to seize the throne. Starts the 22-hour epoch on first call.
    pub fn claim_throne(ctx: Context<ClaimThrone>) -> Result<()> {
        instructions::claim_throne::handler(ctx)
    }

    /// Anyone may call after epoch_end to distribute the pot to winner/burn/treasury/caller.
    pub fn close_epoch(ctx: Context<CloseEpoch>) -> Result<()> {
        instructions::close_epoch::handler(ctx)
    }
}
