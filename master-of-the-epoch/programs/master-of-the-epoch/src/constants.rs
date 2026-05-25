use anchor_lang::prelude::Pubkey;

/// Seed for the global epoch PDA
pub const EPOCH_SEED: &[u8] = b"epoch_state";

/// Seed prefix for per-wallet master record PDAs
pub const MASTER_RECORD_SEED: &[u8] = b"master_record";

/// 1 XNT expressed in lamports (X1 uses 9-decimal lamports like Solana)
pub const XNT_PER_LAMPORT: u64 = 1_000_000_000;

/// Initial claim cost: 5 XNT
pub const INITIAL_CLAIM_COST: u64 = 5 * XNT_PER_LAMPORT;

/// Each takeover increases cost by 5 XNT
pub const CLAIM_COST_STEP: u64 = 5 * XNT_PER_LAMPORT;

/// Cooldown between claims from the same wallet: 60 seconds
pub const CLAIM_COOLDOWN: i64 = 60;

// Payout basis points (out of 10_000)
pub const WINNER_BPS: u64 = 6_000;   // 60%
pub const BURN_BPS: u64 = 2_500;     // 25%
pub const TREASURY_BPS: u64 = 1_000; // 10%
pub const CALLER_BPS: u64 = 500;     // 5%

/// Well-known Solana/X1 incinerator — lamports sent here are permanently removed
/// from circulation. bs58: 1nc1nerator11111111111111111111111111111111
pub const BURN_ADDRESS: Pubkey = Pubkey::new_from_array([
      0,  51, 144, 114, 141,  52,  17,  96, 121, 189, 201,  17, 191, 255,   0, 219,
    212,  77,  46, 205, 204, 247, 156, 166, 225,   0,  56, 225,   0,   0,   0,   0,
]);
