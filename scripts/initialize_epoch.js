#!/usr/bin/env node
"use strict";

const anchor = require("../node_modules/@anchor-lang/core/dist/cjs/index.js");
const { web3 } = anchor;
const fs = require("fs");
const path = require("path");

const PROGRAM_ID = new web3.PublicKey("BC4y2dVdicttQCFSrBA9DjGxuHQrn3dikzds7twaRXu1");
const RPC_URL = "https://xolana.xen.network";
const WALLET_PATH = "/home/admin/.config/solana/id.json";

async function main() {
  // Load wallet
  const rawKey = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"));
  const payer = web3.Keypair.fromSecretKey(Uint8Array.from(rawKey));
  console.log("Payer:", payer.publicKey.toBase58());

  // Set up connection and provider
  const connection = new web3.Connection(RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load IDL
  const idl = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../target/idl/master_of_the_epoch.json"),
      "utf8"
    )
  );

  const program = new anchor.Program(idl, provider);

  // Derive PDAs
  const [epochStatePda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("epoch_state")],
    PROGRAM_ID
  );
  const [gameCounterPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("game_counter")],
    PROGRAM_ID
  );

  console.log("epoch_state PDA:", epochStatePda.toBase58());
  console.log("game_counter PDA:", gameCounterPda.toBase58());

  // Check current state of epoch_state
  const epochInfo = await connection.getAccountInfo(epochStatePda);
  if (epochInfo !== null) {
    console.log(
      "WARNING: epoch_state account already exists! It must be closed (via close_epoch) before re-initializing."
    );
    console.log("  Owner:", epochInfo.owner.toBase58());
    console.log("  Lamports:", epochInfo.lamports);
    console.log("  Data length:", epochInfo.data.length);
    process.exit(1);
  }

  console.log("epoch_state account does not exist — proceeding with initialize_epoch...");

  // Call initialize_epoch
  const tx = await program.methods
    .initializeEpoch()
    .accounts({
      epochState: epochStatePda,
      gameCounter: gameCounterPda,
      payer: payer.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([payer])
    .rpc();

  console.log("Transaction signature:", tx);
  console.log("Successfully initialized new epoch!");

  // Fetch and display the new state
  const state = await program.account.epochState.fetch(epochStatePda);
  console.log("\nNew epoch state:");
  console.log("  game_id:", state.gameId.toString());
  console.log("  next_claim_cost:", state.nextClaimCost.toString(), "lamports");
  console.log("  treasury:", state.treasury.toBase58());
  console.log("  closed:", state.closed);
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  if (err.logs) {
    console.error("Program logs:");
    err.logs.forEach((log) => console.error(" ", log));
  }
  process.exit(1);
});
