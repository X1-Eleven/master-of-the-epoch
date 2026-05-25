use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::instruction::Instruction,
        AccountDeserialize, InstructionData, ToAccountMetas, system_program,
    },
    litesvm::LiteSVM,
    litesvm::types::FailedTransactionMetadata,
    master_of_the_epoch::{
        state::{EpochState, MasterRecord, GameCounter},
        BURN_ADDRESS, TREASURY_ADDRESS, GAME_COUNTER_SEED,
    },
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const XNT: u64 = 1_000_000_000;

fn program_id() -> Pubkey {
    master_of_the_epoch::id()
}

fn epoch_state_pda() -> Pubkey {
    Pubkey::find_program_address(&[b"epoch_state"], &program_id()).0
}

fn master_record_pda(wallet: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"master_record", wallet.as_ref()], &program_id()).0
}

fn game_counter_pda() -> Pubkey {
    Pubkey::find_program_address(&[GAME_COUNTER_SEED], &program_id()).0
}

fn set_clock(svm: &mut LiteSVM, unix_timestamp: i64, epoch: u64) {
    let slot = unix_timestamp as u64;
    svm.set_sysvar(&Clock {
        slot,
        epoch,
        epoch_start_timestamp: unix_timestamp - 100,
        unix_timestamp,
        leader_schedule_epoch: epoch + 1,
    });
    // expire_blockhash() rotates latest_blockhash so repeated transactions in
    // the same test don't get AlreadyProcessed.
    svm.expire_blockhash();
}

// Variant of set_clock with explicit epoch_start_timestamp for tests that
// need to verify the epoch-boundary cap on the final master's reign time.
fn set_clock_full(svm: &mut LiteSVM, unix_timestamp: i64, epoch: u64, epoch_start_timestamp: i64) {
    svm.set_sysvar(&Clock {
        slot: unix_timestamp as u64,
        epoch,
        epoch_start_timestamp,
        unix_timestamp,
        leader_schedule_epoch: epoch + 1,
    });
    svm.expire_blockhash();
}

fn read_epoch_state(svm: &LiteSVM) -> EpochState {
    let acc = svm.get_account(&epoch_state_pda()).expect("epoch_state not found");
    EpochState::try_deserialize(&mut acc.data.as_ref()).expect("deserialize EpochState")
}

fn read_master_record(svm: &LiteSVM, wallet: &Pubkey) -> MasterRecord {
    let pda = master_record_pda(wallet);
    let acc = svm.get_account(&pda).expect("master_record not found");
    MasterRecord::try_deserialize(&mut acc.data.as_ref()).expect("deserialize MasterRecord")
}

fn read_game_counter(svm: &LiteSVM) -> GameCounter {
    let acc = svm.get_account(&game_counter_pda()).expect("game_counter not found");
    GameCounter::try_deserialize(&mut acc.data.as_ref()).expect("deserialize GameCounter")
}

fn setup_svm() -> LiteSVM {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/master_of_the_epoch.so");
    svm.add_program(program_id(), bytes).unwrap();
    set_clock(&mut svm, 1_000_000, 1);
    svm
}

fn do_initialize(svm: &mut LiteSVM, payer: &Keypair) {
    let ix = Instruction::new_with_bytes(
        program_id(),
        &master_of_the_epoch::instruction::InitializeEpoch {}.data(),
        master_of_the_epoch::accounts::InitializeEpoch {
            epoch_state: epoch_state_pda(),
            game_counter: game_counter_pda(),
            payer: payer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    svm.send_transaction(tx).expect("initialize_epoch failed");
}

fn build_claim_ix(claimant: &Pubkey, outgoing_master: Option<&Pubkey>) -> Instruction {
    let outgoing_master_record = match outgoing_master {
        Some(key) => master_record_pda(key),
        None => Pubkey::new_unique(),
    };
    Instruction::new_with_bytes(
        program_id(),
        &master_of_the_epoch::instruction::ClaimMaster {}.data(),
        master_of_the_epoch::accounts::ClaimMaster {
            epoch_state: epoch_state_pda(),
            claimant_record: master_record_pda(claimant),
            outgoing_master_record,
            claimant: *claimant,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn do_claim_master_ok(svm: &mut LiteSVM, claimant: &Keypair, outgoing_master: Option<&Pubkey>) {
    let ix = build_claim_ix(&claimant.pubkey(), outgoing_master);
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&claimant.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[claimant]).unwrap();
    svm.send_transaction(tx).expect("claim_master failed");
}

fn do_claim_master_err(
    svm: &mut LiteSVM,
    claimant: &Keypair,
    outgoing_master: Option<&Pubkey>,
) -> FailedTransactionMetadata {
    let ix = build_claim_ix(&claimant.pubkey(), outgoing_master);
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&claimant.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[claimant]).unwrap();
    svm.send_transaction(tx).expect_err("expected claim_master to fail")
}

fn do_close_epoch(
    svm: &mut LiteSVM,
    caller: &Keypair,
    winner: &Pubkey,
    current_master: &Pubkey,
) {
    let ix = Instruction::new_with_bytes(
        program_id(),
        &master_of_the_epoch::instruction::CloseEpoch {}.data(),
        master_of_the_epoch::accounts::CloseEpoch {
            epoch_state: epoch_state_pda(),
            current_master_record: master_record_pda(current_master),
            caller: caller.pubkey(),
            winner: *winner,
            treasury: TREASURY_ADDRESS,
            burn_address: BURN_ADDRESS,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&caller.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[caller]).unwrap();
    svm.send_transaction(tx).expect("close_epoch failed");
}

fn do_close_epoch_err(
    svm: &mut LiteSVM,
    caller: &Keypair,
    winner: &Pubkey,
    current_master: &Pubkey,
) -> FailedTransactionMetadata {
    let ix = Instruction::new_with_bytes(
        program_id(),
        &master_of_the_epoch::instruction::CloseEpoch {}.data(),
        master_of_the_epoch::accounts::CloseEpoch {
            epoch_state: epoch_state_pda(),
            current_master_record: master_record_pda(current_master),
            caller: caller.pubkey(),
            winner: *winner,
            treasury: TREASURY_ADDRESS,
            burn_address: BURN_ADDRESS,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&caller.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[caller]).unwrap();
    svm.send_transaction(tx).expect_err("expected close_epoch to fail")
}

// ── tests ──────────────────────────────────────────────────────────────────────

#[test]
fn test_initialize_epoch_initial_state() {
    let mut svm = setup_svm();
    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();

    do_initialize(&mut svm, &payer);

    let state = read_epoch_state(&svm);
    // Treasury must equal the hardcoded constant, not a caller-supplied address.
    assert_eq!(state.treasury, TREASURY_ADDRESS);
    assert_eq!(state.current_master, Pubkey::default());
    assert_eq!(state.master_since, 0);
    assert_eq!(state.leading_master, Pubkey::default());
    assert_eq!(state.leading_master_time, 0);
    assert_eq!(state.game_epoch, 0);
    assert_eq!(state.pot, 0);
    assert_eq!(state.next_claim_cost, 5 * XNT);
    assert!(!state.closed);
    // game_id is now the monotonic counter value (1 on first init).
    assert_eq!(state.game_id, 1);

    let counter = read_game_counter(&svm);
    assert_eq!(counter.count, 1);
}

#[test]
fn test_claim_master_first_claim() {
    let mut svm = setup_svm();
    let payer = Keypair::new();
    let alice = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 20 * XNT).unwrap();

    do_initialize(&mut svm, &payer);
    do_claim_master_ok(&mut svm, &alice, None);

    let state = read_epoch_state(&svm);
    assert_eq!(state.current_master, alice.pubkey());
    assert_eq!(state.pot, 5 * XNT);
    assert_eq!(state.next_claim_cost, 10 * XNT);
    assert_eq!(state.game_epoch, 1); // clock epoch set in setup_svm

    let record = read_master_record(&svm, &alice.pubkey());
    assert_eq!(record.owner, alice.pubkey());
    assert_ne!(record.last_claim, 0);
    assert_eq!(record.total_reign_time, 0); // not yet committed — only committed on depose
}

#[test]
fn test_claim_master_cost_increases() {
    let mut svm = setup_svm();
    let payer = Keypair::new();
    let alice = Keypair::new();
    let bob = Keypair::new();
    let carol = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 20 * XNT).unwrap();
    svm.airdrop(&bob.pubkey(), 20 * XNT).unwrap();
    svm.airdrop(&carol.pubkey(), 20 * XNT).unwrap();

    do_initialize(&mut svm, &payer);

    // First claim: 5 XNT
    do_claim_master_ok(&mut svm, &alice, None);
    let s = read_epoch_state(&svm);
    assert_eq!(s.pot, 5 * XNT);
    assert_eq!(s.next_claim_cost, 10 * XNT);

    // Second claim: 10 XNT (different wallet, no cooldown issue)
    set_clock(&mut svm, 1_000_070, 1);
    do_claim_master_ok(&mut svm, &bob, Some(&alice.pubkey()));
    let s = read_epoch_state(&svm);
    assert_eq!(s.pot, 15 * XNT);
    assert_eq!(s.next_claim_cost, 15 * XNT);

    // Third claim: 15 XNT
    set_clock(&mut svm, 1_000_140, 1);
    do_claim_master_ok(&mut svm, &carol, Some(&bob.pubkey()));
    let s = read_epoch_state(&svm);
    assert_eq!(s.pot, 30 * XNT);
    assert_eq!(s.next_claim_cost, 20 * XNT);
}

#[test]
fn test_claim_master_cooldown_blocks_reclaim() {
    let mut svm = setup_svm();
    let payer = Keypair::new();
    let alice = Keypair::new();
    let bob = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 100 * XNT).unwrap();
    svm.airdrop(&bob.pubkey(), 100 * XNT).unwrap();

    do_initialize(&mut svm, &payer);

    // Alice claims at t=1_000_000
    do_claim_master_ok(&mut svm, &alice, None);

    // Bob claims at t=1_000_070 (+70s, no cooldown for first claim)
    set_clock(&mut svm, 1_000_070, 1);
    do_claim_master_ok(&mut svm, &bob, Some(&alice.pubkey()));

    // Alice reclaims at t=1_000_120 (120s since alice's first claim — ok)
    set_clock(&mut svm, 1_000_120, 1);
    do_claim_master_ok(&mut svm, &alice, Some(&bob.pubkey()));

    // Bob tries to reclaim at t=1_000_125 — only 55s since his last claim at 1_000_070
    set_clock(&mut svm, 1_000_125, 1);
    let err = do_claim_master_err(&mut svm, &bob, Some(&alice.pubkey()));
    let err_str = format!("{:?}", err);
    assert!(
        err_str.contains("CooldownActive") || err_str.contains("0x1775"),
        "expected CooldownActive, got: {}",
        err_str
    );
}

#[test]
fn test_claim_master_cooldown_allows_after_delay() {
    let mut svm = setup_svm();
    let payer = Keypair::new();
    let alice = Keypair::new();
    let bob = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 100 * XNT).unwrap();
    svm.airdrop(&bob.pubkey(), 100 * XNT).unwrap();

    do_initialize(&mut svm, &payer);

    // Alice claims at t=1_000_000
    do_claim_master_ok(&mut svm, &alice, None);

    // Bob displaces alice at t=1_000_070
    set_clock(&mut svm, 1_000_070, 1);
    do_claim_master_ok(&mut svm, &bob, Some(&alice.pubkey()));

    // Alice reclaims at t=1_000_140 (140s since alice's claim — well past 60s cooldown)
    set_clock(&mut svm, 1_000_140, 1);
    do_claim_master_ok(&mut svm, &alice, Some(&bob.pubkey()));

    // Bob reclaims at t=1_000_200 (130s since his last claim — past cooldown)
    set_clock(&mut svm, 1_000_200, 1);
    do_claim_master_ok(&mut svm, &bob, Some(&alice.pubkey()));

    let state = read_epoch_state(&svm);
    assert_eq!(state.current_master, bob.pubkey());
}

#[test]
fn test_claim_master_accumulates_reign_time() {
    let mut svm = setup_svm();
    let payer = Keypair::new();
    let alice = Keypair::new();
    let bob = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 100 * XNT).unwrap();
    svm.airdrop(&bob.pubkey(), 100 * XNT).unwrap();

    do_initialize(&mut svm, &payer);

    // Alice claims at t=1_000_000, reigns 100s
    set_clock(&mut svm, 1_000_000, 1);
    do_claim_master_ok(&mut svm, &alice, None);

    // Bob displaces alice at t=1_000_100 → alice gets 100s credited
    set_clock(&mut svm, 1_000_100, 1);
    do_claim_master_ok(&mut svm, &bob, Some(&alice.pubkey()));
    assert_eq!(read_master_record(&svm, &alice.pubkey()).total_reign_time, 100);

    // Alice displaces bob at t=1_000_200 → bob gets 100s
    set_clock(&mut svm, 1_000_200, 1);
    do_claim_master_ok(&mut svm, &alice, Some(&bob.pubkey()));
    assert_eq!(read_master_record(&svm, &bob.pubkey()).total_reign_time, 100);

    // Bob displaces alice at t=1_000_350 → alice second reign = 150s; total = 250s
    set_clock(&mut svm, 1_000_350, 1);
    do_claim_master_ok(&mut svm, &bob, Some(&alice.pubkey()));
    assert_eq!(read_master_record(&svm, &alice.pubkey()).total_reign_time, 250);

    let state = read_epoch_state(&svm);
    assert_eq!(state.leading_master, alice.pubkey());
    assert_eq!(state.leading_master_time, 250);
}

#[test]
fn test_close_epoch_correct_winner() {
    // Alice reigns 300s, Bob reigns final 50s.
    // At close: Alice wins (300 > 50).
    let mut svm = setup_svm();
    let payer = Keypair::new();
    let alice = Keypair::new();
    let bob = Keypair::new();
    let caller = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 20 * XNT).unwrap();
    svm.airdrop(&bob.pubkey(), 20 * XNT).unwrap();
    svm.airdrop(&caller.pubkey(), 2 * XNT).unwrap();

    do_initialize(&mut svm, &payer);

    set_clock(&mut svm, 1_000_000, 1);
    do_claim_master_ok(&mut svm, &alice, None);

    // Bob displaces alice at +300s → alice gets 300s credited
    set_clock(&mut svm, 1_000_300, 1);
    do_claim_master_ok(&mut svm, &bob, Some(&alice.pubkey()));

    // Advance to epoch 2 — game over; bob has been master for 50s
    set_clock(&mut svm, 1_000_350, 2);

    // winner = alice (300s committed), current_master = bob
    do_close_epoch(&mut svm, &caller, &alice.pubkey(), &bob.pubkey());

    // epoch_state is drained to zero lamports and garbage-collected on close
    assert!(
        svm.get_account(&epoch_state_pda()).is_none(),
        "epoch_state should be drained and gone after close"
    );
}

#[test]
fn test_close_epoch_distribution() {
    // One claim (5 XNT pot), then close. Verify exact lamport splits.
    let mut svm = setup_svm();
    let payer = Keypair::new();
    let alice = Keypair::new();
    let caller = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 20 * XNT).unwrap();
    svm.airdrop(&caller.pubkey(), 2 * XNT).unwrap();

    do_initialize(&mut svm, &payer);

    set_clock(&mut svm, 1_000_000, 1);
    do_claim_master_ok(&mut svm, &alice, None);

    // Advance to epoch 2
    set_clock(&mut svm, 1_000_100, 2);

    let pot = 5 * XNT;
    let winner_share   = ((pot as u128) * 6_000 / 10_000) as u64; // 3_000_000_000
    let burn_share     = ((pot as u128) * 2_500 / 10_000) as u64; // 1_250_000_000
    let treasury_share = ((pot as u128) * 1_000 / 10_000) as u64; //   500_000_000
    let caller_share   = pot - winner_share - burn_share - treasury_share; // remainder

    let treasury_before = svm.get_account(&TREASURY_ADDRESS).map(|a| a.lamports).unwrap_or(0);
    let burn_before     = svm.get_account(&BURN_ADDRESS).map(|a| a.lamports).unwrap_or(0);
    let caller_before   = svm.get_account(&caller.pubkey()).unwrap().lamports;
    let alice_before    = svm.get_account(&alice.pubkey()).unwrap().lamports;

    // close_epoch drains rent-exempt lamports to treasury in addition to the 10% share.
    // Capture epoch_state balance now (rent + pot) to compute how much rent goes to treasury.
    let epoch_lamports_before_close = svm.get_account(&epoch_state_pda()).unwrap().lamports;
    let rent_in_epoch = epoch_lamports_before_close - pot;

    // alice is both current_master and winner (only participant)
    do_close_epoch(&mut svm, &caller, &alice.pubkey(), &alice.pubkey());

    let alice_after    = svm.get_account(&alice.pubkey()).unwrap().lamports;
    let treasury_after = svm.get_account(&TREASURY_ADDRESS).unwrap().lamports;
    let burn_after     = svm.get_account(&BURN_ADDRESS).map(|a| a.lamports).unwrap_or(0);
    let caller_after   = svm.get_account(&caller.pubkey()).unwrap().lamports;

    // epoch_state is drained and gone
    assert!(svm.get_account(&epoch_state_pda()).is_none(), "epoch_state should be gone after close");

    assert_eq!(alice_after - alice_before, winner_share, "winner share wrong");
    // Treasury receives its 10% pot share plus the rent-exempt balance of the closed account.
    assert_eq!(
        treasury_after - treasury_before,
        treasury_share + rent_in_epoch,
        "treasury share wrong (should include rent recovery)"
    );
    assert_eq!(burn_after - burn_before, burn_share, "burn share wrong");

    // caller gets caller_share but also pays tx fees — allow a small tolerance
    let caller_delta    = caller_after as i64 - caller_before as i64;
    let expected_caller = caller_share as i64;
    assert!(
        (caller_delta - expected_caller).abs() < 200_000,
        "caller share off: got delta {} expected {}",
        caller_delta,
        expected_caller
    );
}

#[test]
fn test_close_epoch_rejects_if_not_over() {
    let mut svm = setup_svm();
    let payer = Keypair::new();
    let alice = Keypair::new();
    let caller = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 20 * XNT).unwrap();
    svm.airdrop(&caller.pubkey(), 2 * XNT).unwrap();

    do_initialize(&mut svm, &payer);

    // Still in epoch 1 (same as game_epoch)
    set_clock(&mut svm, 1_000_000, 1);
    do_claim_master_ok(&mut svm, &alice, None);

    // Attempt close while still in epoch 1
    let err = do_close_epoch_err(&mut svm, &caller, &alice.pubkey(), &alice.pubkey());
    let err_str = format!("{:?}", err);
    assert!(
        err_str.contains("EpochNotOver") || err_str.contains("0x1771"),
        "expected EpochNotOver, got: {}",
        err_str
    );
}

#[test]
fn test_close_epoch_caps_reign_at_epoch_boundary() {
    // Verifies N-H-1 fix: the final master's reign is capped at epoch_start_timestamp
    // rather than the unix_timestamp when close_epoch is called.
    //
    // Scenario: Alice reigns 500s (committed at Bob's claim).  Bob claims at
    // T=1_000_500 and holds the master position.  The actual epoch boundary lands at
    // T=1_000_510 (10s after Bob's claim).  close_epoch is called very late
    // at T=1_002_000.  Without the cap, Bob's apparent reign would be 1500s,
    // beating Alice's 500s.  With the cap, Bob gets only his 10s and Alice wins.
    let mut svm = setup_svm();
    let payer = Keypair::new();
    let alice = Keypair::new();
    let bob = Keypair::new();
    let caller = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 50 * XNT).unwrap();
    svm.airdrop(&bob.pubkey(), 50 * XNT).unwrap();
    svm.airdrop(&caller.pubkey(), 2 * XNT).unwrap();

    do_initialize(&mut svm, &payer);

    // Alice claims at T=1_000_000, reigns 500s
    set_clock(&mut svm, 1_000_000, 1);
    do_claim_master_ok(&mut svm, &alice, None);

    // Bob displaces Alice at T=1_000_500 → Alice gets 500s credited
    set_clock(&mut svm, 1_000_500, 1);
    do_claim_master_ok(&mut svm, &bob, Some(&alice.pubkey()));

    // close_epoch is called very late (T=1_002_000) but epoch_start_timestamp=1_000_510
    // means the game epoch boundary was only 10s after Bob's claim.
    // Bob's capped reign = 1_000_510 - 1_000_500 = 10s < Alice's 500s → Alice wins.
    set_clock_full(&mut svm, 1_002_000, 2, 1_000_510);

    // Passing alice as winner must succeed; passing bob would fail with InvalidWinner.
    do_close_epoch(&mut svm, &caller, &alice.pubkey(), &bob.pubkey());

    assert!(
        svm.get_account(&epoch_state_pda()).is_none(),
        "epoch_state should be drained after close"
    );
}

#[test]
fn test_restart_after_epoch_close() {
    // Verifies N-I-1 fix: after close_epoch drains and GC's the epoch_state PDA,
    // initialize_epoch can re-create it for a new game.  Also verifies N-M-1
    // design: MasterRecord per-game fields (total_reign_time, last_claim) reset
    // when a player first claims in the new game.
    let mut svm = setup_svm();
    let payer = Keypair::new();
    let alice = Keypair::new();
    let bob = Keypair::new();
    let caller = Keypair::new();
    svm.airdrop(&payer.pubkey(), 100 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 500 * XNT).unwrap();
    svm.airdrop(&bob.pubkey(), 500 * XNT).unwrap();
    svm.airdrop(&caller.pubkey(), 10 * XNT).unwrap();

    // ── GAME 1 ───────────────────────────────────────────────────────────────
    // game_id = 1 (first initialization, counter goes 0 → 1)
    do_initialize(&mut svm, &payer);
    let game1_id = read_epoch_state(&svm).game_id;
    assert_eq!(game1_id, 1, "first game gets id 1");

    set_clock(&mut svm, 1_000_000, 1);
    do_claim_master_ok(&mut svm, &alice, None); // Alice reigns 300s

    set_clock(&mut svm, 1_000_300, 1);
    do_claim_master_ok(&mut svm, &bob, Some(&alice.pubkey())); // Bob holds the master position at game end

    // Close game 1: epoch boundary at T=1_000_250 (set_clock offset), Bob's reign = 0s.
    // Alice wins (300s > 0s).
    set_clock(&mut svm, 1_000_350, 2);
    do_close_epoch(&mut svm, &caller, &alice.pubkey(), &bob.pubkey());

    // epoch_state PDA must be gone — runtime GC'd it when lamports hit zero
    assert!(svm.get_account(&epoch_state_pda()).is_none(), "epoch_state must be gone after game 1");

    // game_counter PDA must still exist with count = 1
    let counter_after_close = read_game_counter(&svm);
    assert_eq!(counter_after_close.count, 1, "game_counter persists across epoch close");

    // ── GAME 2 ───────────────────────────────────────────────────────────────
    // Use the SAME unix_timestamp as the last close to prove monotonic counter
    // prevents a game_id collision even when both land in the same slot.
    set_clock(&mut svm, 1_000_350, 2);
    do_initialize(&mut svm, &payer);

    let state2 = read_epoch_state(&svm);
    assert!(!state2.closed, "game 2 must start open");
    assert_eq!(state2.pot, 0, "game 2 pot must reset to 0");
    assert_eq!(state2.next_claim_cost, 5 * XNT, "game 2 claim cost must reset to 5 XNT");
    assert_eq!(state2.current_master, Pubkey::default());
    // Monotonic counter: game 2 always gets id 2, regardless of timestamp.
    assert_ne!(state2.game_id, game1_id, "game 2 must have a different game_id");
    assert_eq!(state2.game_id, 2, "game_id is monotonic counter; second game gets id 2");
    assert_eq!(state2.treasury, TREASURY_ADDRESS, "treasury is hardcoded constant");

    let counter2 = read_game_counter(&svm);
    assert_eq!(counter2.count, 2);

    // Bob's MasterRecord from game 1 still exists but its game_id differs.
    // His first claim in game 2 must trigger the reset, zeroing total_reign_time.
    do_claim_master_ok(&mut svm, &bob, None);
    let bob_record = read_master_record(&svm, &bob.pubkey());
    assert_eq!(bob_record.total_reign_time, 0, "Bob's reign time must reset in game 2");
    assert_eq!(bob_record.game_id, 2, "Bob's record must carry game 2 game_id");

    // Game 2 escalates from scratch: Alice's claim costs 10 XNT (second claim overall in game 2)
    set_clock(&mut svm, 1_000_420, 2);
    do_claim_master_ok(&mut svm, &alice, Some(&bob.pubkey()));

    let state2 = read_epoch_state(&svm);
    assert_eq!(state2.current_master, alice.pubkey());
    assert_eq!(state2.pot, 15 * XNT, "pot must be 5+10 XNT from two fresh-game claims");
    assert_eq!(state2.next_claim_cost, 15 * XNT);
}

// ── new tests covering audit fixes ──────────────────────────────────────────

/// C-1 fix: treasury is always the hardcoded constant, not a caller argument.
#[test]
fn test_treasury_is_hardcoded_constant() {
    let mut svm = setup_svm();
    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();

    do_initialize(&mut svm, &payer);

    let state = read_epoch_state(&svm);
    assert_eq!(
        state.treasury, TREASURY_ADDRESS,
        "treasury must equal the compile-time constant, not any caller-supplied address"
    );
}

/// M-1 fix: GameCounter increments monotonically; two games initialized in
/// the same slot (same unix_timestamp) still receive distinct game_ids.
#[test]
fn test_game_counter_monotonic_across_restarts() {
    let mut svm = setup_svm();
    let payer = Keypair::new();
    let alice = Keypair::new();
    let caller = Keypair::new();
    svm.airdrop(&payer.pubkey(), 100 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 100 * XNT).unwrap();
    svm.airdrop(&caller.pubkey(), 10 * XNT).unwrap();

    // Game 1
    do_initialize(&mut svm, &payer);
    assert_eq!(read_epoch_state(&svm).game_id, 1);
    assert_eq!(read_game_counter(&svm).count, 1);

    set_clock(&mut svm, 1_000_000, 1);
    do_claim_master_ok(&mut svm, &alice, None);
    set_clock(&mut svm, 1_000_100, 2);
    do_close_epoch(&mut svm, &caller, &alice.pubkey(), &alice.pubkey());

    assert!(svm.get_account(&epoch_state_pda()).is_none(), "epoch_state GC'd");
    // Counter survives the close.
    assert_eq!(read_game_counter(&svm).count, 1);

    // Game 2 — intentionally same unix_timestamp as close to simulate same-slot reinit.
    // A timestamp-based game_id would collide; the monotonic counter must not.
    set_clock(&mut svm, 1_000_100, 2);
    do_initialize(&mut svm, &payer);
    assert_eq!(read_epoch_state(&svm).game_id, 2, "game_id must be 2 despite same timestamp");
    assert_eq!(read_game_counter(&svm).count, 2);

    // Run a third game to confirm continued monotonicity.
    set_clock(&mut svm, 1_000_100, 2);
    do_claim_master_ok(&mut svm, &alice, None);
    set_clock(&mut svm, 1_000_200, 3);
    do_close_epoch(&mut svm, &caller, &alice.pubkey(), &alice.pubkey());

    set_clock(&mut svm, 1_000_200, 3);
    do_initialize(&mut svm, &payer);
    assert_eq!(read_epoch_state(&svm).game_id, 3);
    assert_eq!(read_game_counter(&svm).count, 3);
}

/// M-1 fix: MasterRecord stale-data reset is keyed off the monotonic game_id,
/// confirming that a player who participated in game N has their per-game fields
/// (total_reign_time, last_claim) zeroed when they first claim in game N+1.
#[test]
fn test_master_record_resets_across_games() {
    let mut svm = setup_svm();
    let payer = Keypair::new();
    let alice = Keypair::new();
    let bob = Keypair::new();
    let caller = Keypair::new();
    svm.airdrop(&payer.pubkey(), 100 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 500 * XNT).unwrap();
    svm.airdrop(&bob.pubkey(), 500 * XNT).unwrap();
    svm.airdrop(&caller.pubkey(), 10 * XNT).unwrap();

    // ── Game 1 ──
    do_initialize(&mut svm, &payer);

    set_clock(&mut svm, 1_000_000, 1);
    do_claim_master_ok(&mut svm, &alice, None);      // Alice reigns 200s

    set_clock(&mut svm, 1_000_200, 1);
    do_claim_master_ok(&mut svm, &bob, Some(&alice.pubkey())); // Bob displaces; Alice +200s

    // Confirm Alice accrued time in game 1.
    assert_eq!(read_master_record(&svm, &alice.pubkey()).total_reign_time, 200);
    assert_eq!(read_master_record(&svm, &alice.pubkey()).game_id, 1);

    set_clock(&mut svm, 1_000_300, 2);
    do_close_epoch(&mut svm, &caller, &alice.pubkey(), &bob.pubkey());

    // ── Game 2 (same timestamp → would collide without monotonic counter) ──
    set_clock(&mut svm, 1_000_300, 2);
    do_initialize(&mut svm, &payer);
    assert_eq!(read_epoch_state(&svm).game_id, 2);

    // Alice's first claim in game 2 must reset her record.
    do_claim_master_ok(&mut svm, &alice, None);
    let alice_rec = read_master_record(&svm, &alice.pubkey());
    assert_eq!(alice_rec.total_reign_time, 0, "Alice's reign time resets in game 2");
    assert_eq!(alice_rec.game_id, 2, "Alice's record updated to game 2 id");

    // Bob's first claim in game 2 must also reset his record.
    set_clock(&mut svm, 1_000_370, 2);
    do_claim_master_ok(&mut svm, &bob, Some(&alice.pubkey()));
    let bob_rec = read_master_record(&svm, &bob.pubkey());
    assert_eq!(bob_rec.total_reign_time, 0, "Bob's reign time resets in game 2");
    assert_eq!(bob_rec.game_id, 2, "Bob's record updated to game 2 id");
}
