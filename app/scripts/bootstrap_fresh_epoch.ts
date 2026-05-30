/**
 * Bootstrap script: claim master → wait for epoch rollover → close_epoch → initialize_epoch
 *
 * Use-case: the on-chain epoch_state exists but was initialised with old constants
 * (5 XNT costs).  This script burns a single 5-XNT claim from our wallet to anchor
 * game_epoch to the current network epoch, then waits for the X1 epoch to roll over
 * (~3 min on testnet), closes the epoch, and re-initialises with the new 2-XNT cost.
 *
 * Run from app/:  npx tsx scripts/bootstrap_fresh_epoch.ts
 */

import { readFileSync } from 'fs';
import {
  Connection, PublicKey, Keypair, SystemProgram,
  Transaction, TransactionInstruction,
} from '@solana/web3.js';

// ── constants ────────────────────────────────────────────────────────────────
const RPC       = 'https://xolana.xen.network';
const PROGRAM   = new PublicKey('BC4y2dVdicttQCFSrBA9DjGxuHQrn3dikzds7twaRXu1');
const WALLET    = '/home/admin/.config/solana/id.json';
const TREASURY  = new PublicKey('4V2JhdSG2EL9GAv4wU59KsHsxCk3UhWxuTfnrVieYYet');
const BURN_ADDR = new PublicKey('1nc1nerator11111111111111111111111111111111');

const EPOCH_SEED        = Buffer.from('epoch_state');
const MASTER_RECORD_SEED = Buffer.from('master_record');
const GAME_COUNTER_SEED = Buffer.from('game_counter');

// Instruction discriminators from IDL
const DISC_CLAIM_MASTER    = Buffer.from([13, 126, 84, 49, 104, 197, 18, 165]);
const DISC_CLOSE_EPOCH     = Buffer.from([13, 87, 7, 133, 109, 14, 83, 25]);
const DISC_INIT_EPOCH      = Buffer.from([19, 114, 86, 107, 206, 21, 45, 39]);

// ── helpers ───────────────────────────────────────────────────────────────────
function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

async function sendAndConfirm(
  conn: Connection, payer: Keypair, ix: TransactionInstruction
): Promise<string> {
  const tx = new Transaction();
  tx.add(ix);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

// ── PDAs ──────────────────────────────────────────────────────────────────────
const [epochStatePDA]  = PublicKey.findProgramAddressSync([EPOCH_SEED], PROGRAM);
const [gameCounterPDA] = PublicKey.findProgramAddressSync([GAME_COUNTER_SEED], PROGRAM);

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const raw   = JSON.parse(readFileSync(WALLET, 'utf-8')) as number[];
  const payer = Keypair.fromSecretKey(Uint8Array.from(raw));
  const conn  = new Connection(RPC, 'confirmed');

  console.log('Wallet :', payer.publicKey.toString());
  const bal = await conn.getBalance(payer.publicKey);
  console.log('Balance:', (bal / 1e9).toFixed(4), 'XNT');

  // ── STEP 1: read current state ─────────────────────────────────────────────
  const acct = await conn.getAccountInfo(epochStatePDA);
  if (!acct) {
    console.log('No epoch_state — running initialize_epoch directly...');
    await doInit(conn, payer);
    return;
  }

  const d  = acct.data;
  const dv = new DataView(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
  const currentMaster = new PublicKey(d.slice(40, 72));
  const gameEpoch     = dv.getBigUint64(120, true);
  const closed        = d[144] === 1;

  const netInfo = await conn.getEpochInfo();
  const networkEpoch = BigInt(netInfo.epoch);
  const isOver = gameEpoch > 0n && networkEpoch > gameEpoch;
  const noMaster = currentMaster.equals(PublicKey.default);

  console.log('\nOn-chain state:');
  console.log('  game_epoch    :', gameEpoch.toString(), '  network_epoch:', networkEpoch.toString());
  console.log('  current_master:', currentMaster.toString());
  console.log('  closed        :', closed);
  console.log('  isOver        :', isOver);

  // ── STEP 2: claim master if game not started ───────────────────────────────
  let needsClose = isOver && !closed && !noMaster;

  if (!closed && noMaster) {
    console.log('\n→ Game not started.  Claiming master to anchor game_epoch...');

    const [claimantRecord] = PublicKey.findProgramAddressSync(
      [MASTER_RECORD_SEED, payer.publicKey.toBuffer()], PROGRAM
    );
    // outgoing_master_record: no current master, pass claimant record (ignored by contract)
    const outgoingRecord = claimantRecord;

    const claimIx = new TransactionInstruction({
      programId: PROGRAM,
      keys: [
        { pubkey: epochStatePDA,   isSigner: false, isWritable: true },
        { pubkey: claimantRecord,  isSigner: false, isWritable: true },
        { pubkey: outgoingRecord,  isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true,  isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: DISC_CLAIM_MASTER,
    });

    const sig = await sendAndConfirm(conn, payer, claimIx);
    console.log('  claim_master tx:', sig);

    // Re-read to get the game epoch that was just anchored
    const acct2 = await conn.getAccountInfo(epochStatePDA);
    const dv2   = new DataView(acct2!.data.buffer.slice(acct2!.data.byteOffset, acct2!.data.byteOffset + acct2!.data.byteLength));
    const newGameEpoch = dv2.getBigUint64(120, true);
    console.log('  game_epoch is now:', newGameEpoch.toString());
    needsClose = true;
  }

  // ── STEP 3: wait for epoch rollover ───────────────────────────────────────
  if (needsClose || (isOver && !closed && !noMaster)) {
    const acctNow = await conn.getAccountInfo(epochStatePDA);
    const dvNow   = new DataView(acctNow!.data.buffer.slice(acctNow!.data.byteOffset, acctNow!.data.byteOffset + acctNow!.data.byteLength));
    const gameEpochNow = dvNow.getBigUint64(120, true);

    if (gameEpochNow > 0n) {
      console.log('\n→ Waiting for epoch', (gameEpochNow + 1n).toString(), 'to begin...');
      let waited = 0;
      while (true) {
        const info = await conn.getEpochInfo();
        if (BigInt(info.epoch) > gameEpochNow) {
          console.log('  Epoch rolled over! Network epoch:', info.epoch);
          break;
        }
        const remaining = Math.round((info.slotsInEpoch - info.slotIndex) * 400 / 1000);
        process.stdout.write(`\r  epoch ${info.epoch}, ~${remaining}s remaining...   `);
        await sleep(3000);
        waited += 3;
        if (waited > 600) throw new Error('Timeout waiting for epoch rollover');
      }
      console.log();
    }
  }

  // ── STEP 4: close_epoch ────────────────────────────────────────────────────
  {
    const acct3 = await conn.getAccountInfo(epochStatePDA);
    if (!acct3) {
      console.log('\nEpoch state already gone — skipping close, running init...');
      await doInit(conn, payer);
      return;
    }
    const d3  = acct3.data;
    const dv3 = new DataView(d3.buffer.slice(d3.byteOffset, d3.byteOffset + d3.byteLength));
    const isClosed3 = d3[144] === 1;

    if (!isClosed3) {
      console.log('\n→ Calling close_epoch...');

      // Determine winner: contract will pick currentMaster since they're the only one
      const currentMaster3 = new PublicKey(d3.slice(40, 72));
      const [currentMasterRecord] = PublicKey.findProgramAddressSync(
        [MASTER_RECORD_SEED, currentMaster3.toBuffer()], PROGRAM
      );

      // We are both caller and winner (only master this epoch)
      const closeIx = new TransactionInstruction({
        programId: PROGRAM,
        keys: [
          { pubkey: epochStatePDA,        isSigner: false, isWritable: true },
          { pubkey: currentMasterRecord,  isSigner: false, isWritable: false },
          { pubkey: payer.publicKey,      isSigner: true,  isWritable: true },   // caller
          { pubkey: currentMaster3,       isSigner: false, isWritable: true },   // winner
          { pubkey: TREASURY,             isSigner: false, isWritable: true },
          { pubkey: BURN_ADDR,            isSigner: false, isWritable: true },
        ],
        data: DISC_CLOSE_EPOCH,
      });

      const sig = await sendAndConfirm(conn, payer, closeIx);
      console.log('  close_epoch tx:', sig);
    } else {
      console.log('  Epoch already closed.');
    }
  }

  // ── STEP 5: initialize_epoch ──────────────────────────────────────────────
  // After close_epoch drains the PDA to 0 lamports the runtime garbage-collects it.
  // Poll briefly until the account disappears.
  console.log('\n→ Waiting for epoch_state to be garbage-collected...');
  for (let i = 0; i < 15; i++) {
    const check = await conn.getAccountInfo(epochStatePDA);
    if (!check) { console.log('  Account gone.'); break; }
    await sleep(2000);
  }

  await doInit(conn, payer);
}

async function doInit(conn: Connection, payer: Keypair) {
  console.log('\n→ Calling initialize_epoch...');

  const initIx = new TransactionInstruction({
    programId: PROGRAM,
    keys: [
      { pubkey: epochStatePDA,           isSigner: false, isWritable: true },
      { pubkey: gameCounterPDA,          isSigner: false, isWritable: true },
      { pubkey: payer.publicKey,         isSigner: true,  isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: DISC_INIT_EPOCH,
  });

  const raw   = JSON.parse(readFileSync(WALLET, 'utf-8')) as number[];
  const kp    = Keypair.fromSecretKey(Uint8Array.from(raw));
  const sig   = await sendAndConfirm(conn, kp, initIx);
  console.log('  initialize_epoch tx:', sig);

  // Verify
  const acct = await conn.getAccountInfo(epochStatePDA);
  if (acct) {
    const d  = acct.data;
    const dv = new DataView(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
    const nextCost = dv.getBigUint64(136, true);
    const gameId   = dv.getBigUint64(146, true);
    console.log('\n✅ Fresh epoch initialised!');
    console.log('  game_id        :', gameId.toString());
    console.log('  next_claim_cost:', (Number(nextCost)/1e9).toFixed(2), 'XNT  ← should be 2.00');
    console.log('  Explorer: https://explorer.testnet.x1.xyz/tx/' + sig);
  }
}

main().catch(err => {
  console.error('\n❌ Error:', err);
  process.exit(1);
});
