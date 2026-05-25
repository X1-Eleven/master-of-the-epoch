use anchor_lang::prelude::*;

#[error_code]
pub enum MasterError {
    #[msg("Epoch has already been closed")]
    EpochAlreadyClosed,

    #[msg("Epoch has not ended yet")]
    EpochNotOver,

    #[msg("Epoch is still open — claim is not allowed after epoch ends")]
    EpochOver,

    #[msg("Insufficient payment — check next_claim_cost on the epoch state")]
    InsufficientPayment,

    #[msg("You must wait 60 seconds before claiming again")]
    CooldownActive,

    #[msg("outgoing_master_record does not match the current master's PDA")]
    InvalidMasterRecord,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Cannot claim the throne you already hold")]
    SelfReclaim,

    #[msg("Treasury account does not match the registered treasury")]
    InvalidTreasury,

    #[msg("Winner account does not match the computed winner")]
    InvalidWinner,
}
