# Security Audit — Third Round
**Target:** Master of the Epoch (Anchor/X1)
**Scope:** 10 specified attack vectors not covered in prior audits
**Date:** 2026-05-25

---

## Summary

| ID | Vector | Severity |
|---|---|---|
| C-1 | No access control on `initialize_epoch` | **Critical** |
| M-1 | `game_id` collision allows per-game state bleed | **Medium** |
| L-1 | Unchecked outgoing_master_record `game_id` during deposition | **Low** |
| L-2 | Dust lamports bypass `state.pot` accounting | **Low** |
| I-1 | Account confusion — properly mitigated | Informational |
| I-2 | Close-epoch griefing — not viable | Informational |
| I-3 | Claim cost undercut — not possible | Informational |
| I-4 | Lamport draining outside close_epoch — no path | Informational |
| I-5 | PDA seed collision — structurally impossible | Informational |
| I-6 | Re-initialization mid-game — prevented by `init` | Informational |
| I-7 | Integer precision — benign, by design | Informational |
| I-8 | Denial of service — no low-cost permanent path | Informational |

---

## C-1 — No access control on `initialize_epoch` [CRITICAL]

**Files:** `instructions/initialize_epoch.rs:5-23`, `lib.rs:19`

**Description:**
`initialize_epoch` has exactly one constraint on the caller: they must be a signer (`payer`) who pays rent. There is no authority check — no stored admin pubkey, no multisig, nothing. The treasury address is an unchecked argument accepted from whoever calls the instruction.

After `close_epoch` drains the `epoch_state` PDA to zero lamports, the Solana runtime garbage-collects it at the end of that transaction. From that moment the PDA no longer exists. Any wallet can call `initialize_epoch` and install their own treasury address.

**Concrete attack path:**

1. Attacker monitors the chain. When `clock.epoch > game_epoch`, the game is closeable.
2. Attacker calls `close_epoch` (permissionless, earns 5% bonus). At the end of this transaction `epoch_state` is gone.
3. In the same block or the next, attacker calls `initialize_epoch` passing their own wallet as `treasury`.
4. All future players pay into a game where 10% of the pot flows to the attacker indefinitely.

Steps 2 and 3 can be submitted in a single bundle on X1, making the race window essentially zero — the same caller who closes can atomically reinitialize.

**Impact:** Complete and permanent treasury hijack. The legitimate operator has no on-chain authority they can assert to reclaim the treasury slot.

---

## M-1 — `game_id` collision allows per-game state bleed [MEDIUM]

**Files:** `instructions/initialize_epoch.rs:40`, `instructions/claim_throne.rs:62-70`, `state.rs:63-67`

**Description:**
`game_id` is set at initialization time to `Clock::get()?.unix_timestamp as u64`. On Solana and X1, all transactions within the same slot share the same `unix_timestamp`. If `close_epoch` and the subsequent `initialize_epoch` land in the same slot, both games receive the same `game_id`.

The stale-record check in `claim_throne` is:

```rust
// claim_throne.rs:65-69
if record.game_id != current_game_id {
    record.total_reign_time = 0;
    record.last_claim = 0;
    record.game_id = current_game_id;
}
```

When game IDs match, this branch is skipped. Any `MasterRecord` written during game 1 is silently treated as belonging to game 2.

**Concrete effects:**

- A player who accrued `total_reign_time` in game 1 enters game 2 with that time already on their record. Because the leading-master comparison uses cumulative reign time, they can win the pot while spending far less actual time on the throne in game 2.
- A player's `last_claim` timestamp from game 1 is carried into game 2, incorrectly gating their first claim behind the 60-second cooldown.
- The `test_restart_after_epoch_close` test guards against this by explicitly advancing the clock to a different second (`set_clock(&mut svm, 1_100_000, 2)`), but that is a test-harness guarantee, not an on-chain guarantee.

An attacker who controls the timing (e.g., by being the operator or by exploiting C-1 above) can reliably force this collision by submitting close+init in a single transaction bundle.

---

## L-1 — Outgoing master's `MasterRecord.game_id` not validated during deposition [LOW]

**Files:** `instructions/claim_throne.rs:124-135`

**Description:**
When a new claimant deposes the current master, the outgoing master's `MasterRecord` is deserialized and `total_reign_time` is incremented without first checking whether `outgoing.game_id == current_game_id`:

```rust
// claim_throne.rs:125-135
let mut outgoing = {
    let data = ctx.accounts.outgoing_master_record.try_borrow_data()?;
    MasterRecord::try_deserialize(&mut data.as_ref())?
};
outgoing.total_reign_time = outgoing.total_reign_time
    .checked_add(reign_duration)
    .ok_or(MasterError::Overflow)?;
```

Under normal operation this is harmless: a player's record `game_id` is set to `current_game_id` whenever they successfully claim (lines 159), so by the time they are deposed their record always carries the current game's ID.

However, this guarantee depends entirely on the absence of a `game_id` collision (M-1). If M-1 is triggered, the outgoing master's record was never reset, and deposition adds this epoch's reign to their already-inflated `total_reign_time`. The missing `game_id` check means there is no defence-in-depth at the deposition site.

**Impact (conditional):** If M-1 is exploited, this path amplifies the leaderboard distortion. Standalone impact is nil.

---

## L-2 — Dust lamports sent directly to `epoch_state` bypass `state.pot` [LOW]

**Files:** `instructions/close_epoch.rs:94-128`

**Description:**
`claim_throne` is the only instruction that increments `state.pot`. However, any account can directly transfer lamports to the `epoch_state` PDA (via the system program) without going through `claim_throne`, leaving `state.pot` smaller than the account's actual balance.

In `close_epoch`, payouts are computed from `state.pot`, not from the account balance. The residual lamports (rent-exempt minimum + out-of-band transfers) are then drained to treasury:

```rust
// close_epoch.rs:124-128
let remaining = **epoch_info.try_borrow_lamports()?;
if remaining > 0 {
    **epoch_info.try_borrow_mut_lamports()? -= remaining;
    **ctx.accounts.treasury.try_borrow_mut_lamports()? += remaining;
}
```

**Scenarios:**

- A user who mistakenly sends XNT directly to the epoch PDA address (common UX error) loses those funds entirely to treasury — not to the pot — with no on-chain signal.
- An attacker who controls treasury (via C-1) can silently extract extra lamports by pre-loading the PDA before close.
- Neither scenario breaks protocol execution, but the accounting discrepancy between balance and `state.pot` is invisible to participants reading only `state.pot`.

---

## I-1 — Account confusion — properly mitigated [Informational]

**File:** `instructions/claim_throne.rs:113-122`

When `current_master != Pubkey::default()`, the handler derives the expected PDA with `find_program_address` and enforces equality via `require_keys_eq!`. Passing a MasterRecord from a different wallet or a previous game's record fails the key check. When `current_master == Pubkey::default()` (first claim), the outgoing account is not read or written. No confusion path exists.

---

## I-2 — Close-epoch griefing — not viable [Informational]

**File:** `instructions/close_epoch.rs`

The payout loop uses direct lamport manipulation (`try_borrow_mut_lamports`), not CPI. This bypasses any program logic on recipient accounts — lamports can be transferred to any account regardless of owner, executable flag, or data state. The `winner` and `treasury` accounts can never reject receipt. Sending dust to `epoch_state` before `close_epoch` only inflates the `remaining` drain (covered by L-2), not the computed `pot` shares. There is no viable griefing path.

---

## I-3 — Claim cost undercut — not possible [Informational]

**File:** `instructions/claim_throne.rs:84-96`

The exact `next_claim_cost` is read from state and passed as the transfer amount to the system program CPI. There is no user-supplied amount parameter. No path exists to claim for less than the current cost.

---

## I-4 — Lamport draining outside `close_epoch` — no path [Informational]

**Files:** all instructions

After `init`, `epoch_state` is owned by the master-of-the-epoch program. The system program cannot debit a program-owned account. The only program-internal instruction that decrements `epoch_state.lamports` is `close_epoch`. `initialize_epoch` adds rent; `claim_throne` adds pot via CPI. There is no instruction that drains the vault outside of the intended close flow.

---

## I-5 — PDA seed collision — structurally impossible [Informational]

**File:** `constants.rs`

`epoch_state` is derived from a single seed `b"epoch_state"` (11 bytes). `master_record` is derived from two seeds `[b"master_record", wallet_pubkey]` (13 + 32 bytes). Anchor serializes seeds with length-prefixed framing, so these produce structurally distinct preimages. A wallet's pubkey would have to be chosen such that its 32-byte value, concatenated with the 13-byte prefix, collides with the 11-byte epoch seed — computationally infeasible.

---

## I-6 — Re-initialization mid-game — prevented by `init` [Informational]

**File:** `instructions/initialize_epoch.rs:6-13`

Anchor's `init` constraint fails with `AccountAlreadyInitialized` if the target account already exists (non-zero lamports, program-owned data). While a game is in progress, `epoch_state` holds at least its rent-exempt minimum plus the pot. Re-initialization cannot succeed until `close_epoch` drains it to zero and the runtime garbage-collects it. The account lifecycle is correct.

---

## I-7 — Integer precision — benign rounding [Informational]

**File:** `instructions/close_epoch.rs:95-103`

The three fixed shares (winner, burn, treasury) are computed with floor division using `u128` intermediates. The caller receives the arithmetic remainder:

```rust
let caller_share = pot
    .checked_sub(winner_share)
    .and_then(|r| r.checked_sub(burn_share))
    .and_then(|r| r.checked_sub(treasury_share))
    .ok_or(MasterError::Overflow)?;
```

Maximum over-allocation to the caller is 3 lamports (one per floor). The three shares together can never exceed `pot` because `60% + 25% + 10% = 95% < 100%`, so `caller_share` is always non-negative. Not exploitable; the remainder approach is the correct way to handle dust.

---

## I-8 — Denial of service — no low-cost permanent path [Informational]

No instruction path was identified that allows an attacker to permanently disable the contract without themselves spending meaningful lamports:

- Claim costs increase by 5 XNT per takeover, creating a self-throttling escalation. Spamming claims is geometrically expensive.
- The epoch end condition depends on the X1 network's own epoch counter; an attacker cannot prevent it from rolling over.
- `current_master_record` in `close_epoch` is a program-owned PDA that only the program can write; it cannot be corrupted externally.
- Direct lamport transfers to `epoch_state` do not block `close_epoch`.

The only realistic "DoS" is treasury capture (C-1), which permanently redirects revenue rather than stopping execution.

---

## Recommendations (priority order)

1. **(C-1)** Add an `authority: Signer` field to `InitializeEpoch` constrained to a hardcoded or state-stored operator pubkey. Alternatively, store the authorized deployer in a separate singleton PDA during program deployment.
2. **(M-1)** Replace the `unix_timestamp`-based `game_id` with a monotonic counter stored in a persistent singleton PDA that survives epoch close — or add an explicit `game_nonce` argument to `initialize_epoch` that the operator increments.
3. **(L-1)** Add a `game_id` check when deserializing the outgoing master's record in `claim_throne`, as defence-in-depth against any future game_id scheme regression.
4. **(L-2)** Document explicitly (or enforce via assertion) that `epoch_state.lamports - rent_exempt_minimum == state.pot`. Consider emitting a warning log when `remaining > rent_exempt_minimum`.
