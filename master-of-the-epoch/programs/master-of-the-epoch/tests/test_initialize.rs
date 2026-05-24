use {
    anchor_lang::{
        solana_program::instruction::Instruction, InstructionData, ToAccountMetas,
        system_program,
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

fn program_id() -> anchor_lang::prelude::Pubkey {
    master_of_the_epoch::id()
}

fn epoch_state_pda() -> anchor_lang::prelude::Pubkey {
    anchor_lang::prelude::Pubkey::find_program_address(
        &[b"epoch_state"],
        &program_id(),
    )
    .0
}

/// Minimal smoke-test: initialize_epoch creates the epoch state account.
#[test]
fn test_initialize_epoch() {
    let prog_id = program_id();
    let payer = Keypair::new();
    let treasury = Keypair::new();
    let epoch_state = epoch_state_pda();

    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/master_of_the_epoch.so");
    svm.add_program(prog_id, bytes).unwrap();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();

    let instruction = Instruction::new_with_bytes(
        prog_id,
        &master_of_the_epoch::instruction::InitializeEpoch {}.data(),
        master_of_the_epoch::accounts::InitializeEpoch {
            epoch_state,
            treasury: treasury.pubkey(),
            payer: payer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();

    let res = svm.send_transaction(tx);
    assert!(res.is_ok(), "initialize_epoch failed: {:?}", res.err());
}
