use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::instruction::Instruction,
        AccountDeserialize, InstructionData, ToAccountMetas, system_program,
    },
    litesvm::LiteSVM,
    litesvm::types::FailedTransactionMetadata,
    master_of_the_epoch::{state::{EpochState, MasterRecord}, BURN_ADDRESS},
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

fn read_epoch_state(svm: &LiteSVM) -> EpochState {
    let acc = svm.get_account(&epoch_state_pda()).expect("epoch_state not found");
    EpochState::try_deserialize(&mut acc.data.as_ref()).expect("deserialize EpochState")
}

fn read_master_record(svm: &LiteSVM, wallet: &Pubkey) -> MasterRecord {
    let pda = master_record_pda(wallet);
    let acc = svm.get_account(&pda).expect("master_record not found");
    MasterRecord::try_deserialize(&mut acc.data.as_ref()).expect("deserialize MasterRecord")
}

fn setup_svm() -> LiteSVM {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/master_of_the_epoch.so");
    svm.add_program(program_id(), bytes).unwrap();
    set_clock(&mut svm, 1_000_000, 1);
    svm
}

fn do_initialize(svm: &mut LiteSVM, payer: &Keypair, treasury: &Pubkey) {
    let ix = Instruction::new_with_bytes(
        program_id(),
        &master_of_the_epoch::instruction::InitializeEpoch {}.data(),
        master_of_the_epoch::accounts::InitializeEpoch {
            epoch_state: epoch_state_pda(),
            treasury: *treasury,
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
        &master_of_the_epoch::instruction::ClaimThrone {}.data(),
        master_of_the_epoch::accounts::ClaimThrone {
            epoch_state: epoch_state_pda(),
            claimant_record: master_record_pda(claimant),
            outgoing_master_record,
            claimant: *claimant,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn do_claim_throne_ok(svm: &mut LiteSVM, claimant: &Keypair, outgoing_master: Option<&Pubkey>) {
    let ix = build_claim_ix(&claimant.pubkey(), outgoing_master);
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&claimant.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[claimant]).unwrap();
    svm.send_transaction(tx).expect("claim_throne failed");
}

fn do_claim_throne_err(
    svm: &mut LiteSVM,
    claimant: &Keypair,
    outgoing_master: Option<&Pubkey>,
) -> FailedTransactionMetadata {
    let ix = build_claim_ix(&claimant.pubkey(), outgoing_master);
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&claimant.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[claimant]).unwrap();
    svm.send_transaction(tx).expect_err("expected claim_throne to fail")
}

fn do_close_epoch(
    svm: &mut LiteSVM,
    caller: &Keypair,
    winner: &Pubkey,
    treasury: &Pubkey,
    burn_address: &Pubkey,
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
            treasury: *treasury,
            burn_address: *burn_address,
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
    treasury: &Pubkey,
    burn_address: &Pubkey,
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
            treasury: *treasury,
            burn_address: *burn_address,
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
    let treasury = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();

    do_initialize(&mut svm, &payer, &treasury.pubkey());

    let state = read_epoch_state(&svm);
    assert_eq!(state.treasury, treasury.pubkey());
    assert_eq!(state.current_master, Pubkey::default());
    assert_eq!(state.master_since, 0);
    assert_eq!(state.leading_master, Pubkey::default());
    assert_eq!(state.leading_master_time, 0);
    assert_eq!(state.game_epoch, 0);
    assert_eq!(state.pot, 0);
    assert_eq!(state.next_claim_cost, 5 * XNT);
    assert!(!state.closed);
}

#[test]
fn test_claim_throne_first_claim() {
    let mut svm = setup_svm();
    let payer = Keypair::new();
    let treasury = Keypair::new();
    let alice = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 20 * XNT).unwrap();

    do_initialize(&mut svm, &payer, &treasury.pubkey());
    do_claim_throne_ok(&mut svm, &alice, None);

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
fn test_claim_throne_cost_increases() {
    let mut svm = setup_svm();
    let payer = Keypair::new();
    let treasury = Keypair::new();
    let alice = Keypair::new();
    let bob = Keypair::new();
    let carol = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 20 * XNT).unwrap();
    svm.airdrop(&bob.pubkey(), 20 * XNT).unwrap();
    svm.airdrop(&carol.pubkey(), 20 * XNT).unwrap();

    do_initialize(&mut svm, &payer, &treasury.pubkey());

    // First claim: 5 XNT
    do_claim_throne_ok(&mut svm, &alice, None);
    let s = read_epoch_state(&svm);
    assert_eq!(s.pot, 5 * XNT);
    assert_eq!(s.next_claim_cost, 10 * XNT);

    // Second claim: 10 XNT (different wallet, no cooldown issue)
    set_clock(&mut svm, 1_000_070, 1);
    do_claim_throne_ok(&mut svm, &bob, Some(&alice.pubkey()));
    let s = read_epoch_state(&svm);
    assert_eq!(s.pot, 15 * XNT);
    assert_eq!(s.next_claim_cost, 15 * XNT);

    // Third claim: 15 XNT
    set_clock(&mut svm, 1_000_140, 1);
    do_claim_throne_ok(&mut svm, &carol, Some(&bob.pubkey()));
    let s = read_epoch_state(&svm);
    assert_eq!(s.pot, 30 * XNT);
    assert_eq!(s.next_claim_cost, 20 * XNT);
}

#[test]
fn test_claim_throne_cooldown_blocks_reclaim() {
    let mut svm = setup_svm();
    let payer = Keypair::new();
    let treasury = Keypair::new();
    let alice = Keypair::new();
    let bob = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 100 * XNT).unwrap();
    svm.airdrop(&bob.pubkey(), 100 * XNT).unwrap();

    do_initialize(&mut svm, &payer, &treasury.pubkey());

    // Alice claims at t=1_000_000
    do_claim_throne_ok(&mut svm, &alice, None);

    // Bob claims at t=1_000_070 (+70s, no cooldown for first claim)
    set_clock(&mut svm, 1_000_070, 1);
    do_claim_throne_ok(&mut svm, &bob, Some(&alice.pubkey()));

    // Alice reclaims at t=1_000_120 (120s since alice's first claim — ok)
    set_clock(&mut svm, 1_000_120, 1);
    do_claim_throne_ok(&mut svm, &alice, Some(&bob.pubkey()));

    // Bob tries to reclaim at t=1_000_125 — only 55s since his last claim at 1_000_070
    set_clock(&mut svm, 1_000_125, 1);
    let err = do_claim_throne_err(&mut svm, &bob, Some(&alice.pubkey()));
    let err_str = format!("{:?}", err);
    assert!(
        err_str.contains("CooldownActive") || err_str.contains("0x1775"),
        "expected CooldownActive, got: {}",
        err_str
    );
}

#[test]
fn test_claim_throne_cooldown_allows_after_delay() {
    let mut svm = setup_svm();
    let payer = Keypair::new();
    let treasury = Keypair::new();
    let alice = Keypair::new();
    let bob = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 100 * XNT).unwrap();
    svm.airdrop(&bob.pubkey(), 100 * XNT).unwrap();

    do_initialize(&mut svm, &payer, &treasury.pubkey());

    // Alice claims at t=1_000_000
    do_claim_throne_ok(&mut svm, &alice, None);

    // Bob displaces alice at t=1_000_070
    set_clock(&mut svm, 1_000_070, 1);
    do_claim_throne_ok(&mut svm, &bob, Some(&alice.pubkey()));

    // Alice reclaims at t=1_000_140 (140s since alice's claim — well past 60s cooldown)
    set_clock(&mut svm, 1_000_140, 1);
    do_claim_throne_ok(&mut svm, &alice, Some(&bob.pubkey()));

    // Bob reclaims at t=1_000_200 (130s since his last claim — past cooldown)
    set_clock(&mut svm, 1_000_200, 1);
    do_claim_throne_ok(&mut svm, &bob, Some(&alice.pubkey()));

    let state = read_epoch_state(&svm);
    assert_eq!(state.current_master, bob.pubkey());
}

#[test]
fn test_claim_throne_accumulates_reign_time() {
    let mut svm = setup_svm();
    let payer = Keypair::new();
    let treasury = Keypair::new();
    let alice = Keypair::new();
    let bob = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 100 * XNT).unwrap();
    svm.airdrop(&bob.pubkey(), 100 * XNT).unwrap();

    do_initialize(&mut svm, &payer, &treasury.pubkey());

    // Alice claims at t=1_000_000, reigns 100s
    set_clock(&mut svm, 1_000_000, 1);
    do_claim_throne_ok(&mut svm, &alice, None);

    // Bob displaces alice at t=1_000_100 → alice gets 100s credited
    set_clock(&mut svm, 1_000_100, 1);
    do_claim_throne_ok(&mut svm, &bob, Some(&alice.pubkey()));
    assert_eq!(read_master_record(&svm, &alice.pubkey()).total_reign_time, 100);

    // Alice displaces bob at t=1_000_200 → bob gets 100s
    set_clock(&mut svm, 1_000_200, 1);
    do_claim_throne_ok(&mut svm, &alice, Some(&bob.pubkey()));
    assert_eq!(read_master_record(&svm, &bob.pubkey()).total_reign_time, 100);

    // Bob displaces alice at t=1_000_350 → alice second reign = 150s; total = 250s
    set_clock(&mut svm, 1_000_350, 1);
    do_claim_throne_ok(&mut svm, &bob, Some(&alice.pubkey()));
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
    let treasury = Keypair::new();
    let alice = Keypair::new();
    let bob = Keypair::new();
    let caller = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 20 * XNT).unwrap();
    svm.airdrop(&bob.pubkey(), 20 * XNT).unwrap();
    svm.airdrop(&caller.pubkey(), 2 * XNT).unwrap();

    do_initialize(&mut svm, &payer, &treasury.pubkey());

    set_clock(&mut svm, 1_000_000, 1);
    do_claim_throne_ok(&mut svm, &alice, None);

    // Bob displaces alice at +300s → alice gets 300s credited
    set_clock(&mut svm, 1_000_300, 1);
    do_claim_throne_ok(&mut svm, &bob, Some(&alice.pubkey()));

    // Advance to epoch 2 — game over; bob has been master for 50s
    set_clock(&mut svm, 1_000_350, 2);

    // winner = alice (300s committed), current_master = bob
    do_close_epoch(
        &mut svm,
        &caller,
        &alice.pubkey(),
        &treasury.pubkey(),
        &BURN_ADDRESS,
        &bob.pubkey(),
    );

    let state = read_epoch_state(&svm);
    assert!(state.closed);
}

#[test]
fn test_close_epoch_distribution() {
    // One claim (5 XNT pot), then close. Verify exact lamport splits.
    let mut svm = setup_svm();
    let payer = Keypair::new();
    let treasury = Keypair::new();
    let alice = Keypair::new();
    let caller = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 20 * XNT).unwrap();
    svm.airdrop(&caller.pubkey(), 2 * XNT).unwrap();

    do_initialize(&mut svm, &payer, &treasury.pubkey());

    set_clock(&mut svm, 1_000_000, 1);
    do_claim_throne_ok(&mut svm, &alice, None);

    // Advance to epoch 2
    set_clock(&mut svm, 1_000_100, 2);

    let pot = 5 * XNT;
    let winner_share   = ((pot as u128) * 6_000 / 10_000) as u64; // 3_000_000_000
    let burn_share     = ((pot as u128) * 2_500 / 10_000) as u64; // 1_250_000_000
    let treasury_share = ((pot as u128) * 1_000 / 10_000) as u64; //   500_000_000
    let caller_share   = pot - winner_share - burn_share - treasury_share; // remainder

    let treasury_before = svm.get_account(&treasury.pubkey()).map(|a| a.lamports).unwrap_or(0);
    let burn_before     = svm.get_account(&BURN_ADDRESS).map(|a| a.lamports).unwrap_or(0);
    let caller_before   = svm.get_account(&caller.pubkey()).unwrap().lamports;
    let alice_before    = svm.get_account(&alice.pubkey()).unwrap().lamports;

    // alice is both current_master and winner (only participant)
    do_close_epoch(
        &mut svm,
        &caller,
        &alice.pubkey(),
        &treasury.pubkey(),
        &BURN_ADDRESS,
        &alice.pubkey(),
    );

    let alice_after    = svm.get_account(&alice.pubkey()).unwrap().lamports;
    let treasury_after = svm.get_account(&treasury.pubkey()).unwrap().lamports;
    let burn_after     = svm.get_account(&BURN_ADDRESS).map(|a| a.lamports).unwrap_or(0);
    let caller_after   = svm.get_account(&caller.pubkey()).unwrap().lamports;

    assert_eq!(alice_after - alice_before, winner_share,   "winner share wrong");
    assert_eq!(treasury_after - treasury_before, treasury_share, "treasury share wrong");
    assert_eq!(burn_after - burn_before, burn_share,       "burn share wrong");

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
    let treasury = Keypair::new();
    let alice = Keypair::new();
    let caller = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * XNT).unwrap();
    svm.airdrop(&alice.pubkey(), 20 * XNT).unwrap();
    svm.airdrop(&caller.pubkey(), 2 * XNT).unwrap();

    do_initialize(&mut svm, &payer, &treasury.pubkey());

    // Still in epoch 1 (same as game_epoch)
    set_clock(&mut svm, 1_000_000, 1);
    do_claim_throne_ok(&mut svm, &alice, None);

    // Attempt close while still in epoch 1
    let err = do_close_epoch_err(
        &mut svm,
        &caller,
        &alice.pubkey(),
        &treasury.pubkey(),
        &BURN_ADDRESS,
        &alice.pubkey(),
    );
    let err_str = format!("{:?}", err);
    assert!(
        err_str.contains("EpochNotOver") || err_str.contains("0x1771"),
        "expected EpochNotOver, got: {}",
        err_str
    );
}
