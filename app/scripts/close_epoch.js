/**
 * close_epoch.js — emergency close script
 *
 * 1. Reads epoch_state to get currentMaster, leadingMaster, and their times.
 * 2. Reads currentMaster's MasterRecord to get stored reign time.
 * 3. Computes epoch_start_timestamp and the final master total.
 * 4. Determines the correct winner (matches on-chain contract logic exactly).
 * 5. Calls close_epoch with the winner.
 * 6. Calls initialize_epoch to start a fresh game.
 *
 * Run from app/:  node scripts/close_epoch.js
 */

import { readFileSync } from 'fs';
import {
  Connection, PublicKey, Keypair, SystemProgram,
  Transaction, TransactionInstruction,
} from '@solana/web3.js';

// ── constants ────────────────────────────────────────────────────────────────
const RPC      = 'https://xolana.xen.network';
const PROGRAM  = new PublicKey('BC4y2dVdicttQCFSrBA9DjGxuHQrn3dikzds7twaRXu1');
const WALLET   = '/home/admin/.config/solana/id.json';
const BURN_ADDR = new PublicKey('1nc1nerator11111111111111111111111111111111');

const EPOCH_SEED         = Buffer.from('epoch_state');
const MASTER_RECORD_SEED = Buffer.from('master_record');
const GAME_COUNTER_SEED  = Buffer.from('game_counter');

// Instruction discriminators (from IDL)
const DISC_CLOSE_EPOCH = Buffer.from([13, 87, 7, 133, 109, 14, 83, 25]);
const DISC_INIT_EPOCH  = Buffer.from([19, 114, 86, 107, 206, 21, 45, 39]);

const NULL_PUBKEY = '11111111111111111111111111111111';

// ── EpochState byte offsets (after 8-byte discriminator) ─────────────────────
// [8..40]    treasury            Pubkey
// [40..72]   current_master      Pubkey
// [72..80]   master_since        i64
// [80..112]  leading_master      Pubkey
// [112..120] leading_master_time u64
// [120..128] game_epoch          u64
// [128..136] pot                 u64
// [136..144] next_claim_cost     u64
// [144]      closed              bool
// [145]      bump                u8
// [146..154] game_id             u64

// ── MasterRecord byte offsets ─────────────────────────────────────────────────
// [8..40]  owner              Pubkey
// [40..48] last_claim         i64
// [48..56] total_reign_time   u64
// [56]     bump               u8
// [57..65] game_id            u64

// ── helpers ───────────────────────────────────────────────────────────────────
function mkDv(buf) {
  return new DataView(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
function readPubkey(buf, off) { return new PublicKey(buf.slice(off, off + 32)); }
function readU64(buf, off)    { return mkDv(buf).getBigUint64(off, true); }
function readI64(buf, off)    { return mkDv(buf).getBigInt64(off, true); }

async function sendAndConfirm(conn, payer, ix) {
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

// ── main ──────────────────────────────────────────────────────────────────────
const raw   = JSON.parse(readFileSync(WALLET, 'utf-8'));
const payer = Keypair.fromSecretKey(Uint8Array.from(raw));
const conn  = new Connection(RPC, 'confirmed');

console.log('Wallet :', payer.publicKey.toString());
const bal = await conn.getBalance(payer.publicKey);
console.log('Balance:', (bal / 1e9).toFixed(4), 'XNT');

const [epochStatePDA]  = PublicKey.findProgramAddressSync([EPOCH_SEED], PROGRAM);
const [gameCounterPDA] = PublicKey.findProgramAddressSync([GAME_COUNTER_SEED], PROGRAM);

// ── Step 1: read epoch_state ──────────────────────────────────────────────────
const epochAcct = await conn.getAccountInfo(epochStatePDA);
if (!epochAcct) throw new Error('epoch_state PDA not found — already closed or garbage-collected');

const d = epochAcct.data;
const treasury          = readPubkey(d, 8);
const currentMaster     = readPubkey(d, 40);
const masterSince       = readI64(d, 72);
const leadingMaster     = readPubkey(d, 80);
const leadingMasterTime = readU64(d, 112);
const gameEpoch         = readU64(d, 120);
const pot               = readU64(d, 128);
const closed            = d[144] === 1;

console.log('\n── Epoch State ──────────────────────────────────────────────');
console.log('  current_master:      ', currentMaster.toString());
console.log('  master_since:        ', masterSince.toString(),
  '->', new Date(Number(masterSince) * 1000).toISOString());
console.log('  leading_master:      ', leadingMaster.toString());
console.log('  leading_master_time: ', leadingMasterTime.toString(), 's');
console.log('  game_epoch:          ', gameEpoch.toString());
console.log('  pot:                 ', (Number(pot) / 1e9).toFixed(4), 'XNT');
console.log('  treasury:            ', treasury.toString());
console.log('  closed:              ', closed);

if (closed) throw new Error('Epoch is already closed.');
if (currentMaster.toString() === NULL_PUBKEY) throw new Error('No current master — game not started.');

const netInfo      = await conn.getEpochInfo();
const networkEpoch = BigInt(netInfo.epoch);
const isOver       = gameEpoch > 0n && networkEpoch > gameEpoch;
console.log('\n  network_epoch:       ', networkEpoch.toString());
console.log('  isOver:              ', isOver);
if (!isOver) throw new Error(`Epoch not over yet (game_epoch=${gameEpoch}, network=${networkEpoch}).`);

// ── Step 2: read currentMaster's MasterRecord ────────────────────────────────
const [currentMasterRecord] = PublicKey.findProgramAddressSync(
  [MASTER_RECORD_SEED, currentMaster.toBuffer()], PROGRAM
);
const mrAcct = await conn.getAccountInfo(currentMasterRecord);
if (!mrAcct) throw new Error('currentMaster MasterRecord PDA not found: ' + currentMasterRecord.toString());

const mrd             = mrAcct.data;
const storedReignTime = readU64(mrd, 48);

console.log('\n── Current Master Record ────────────────────────────────────');
console.log('  PDA:                 ', currentMasterRecord.toString());
console.log('  stored_reign_time:   ', storedReignTime.toString(), 's');

// ── Step 3: epoch_start_timestamp (mirrors Clock::get().epoch_start_timestamp) ─
const epochStartSlot = netInfo.absoluteSlot - netInfo.slotIndex;
let epochStartTs     = await conn.getBlockTime(epochStartSlot);
if (epochStartTs === null) {
  epochStartTs = Math.floor(Date.now() / 1000) - Math.floor(netInfo.slotIndex * 400 / 1000);
  console.log('\n  epochStartTs (fallback):', epochStartTs);
} else {
  console.log('\n  epochStartTs (chain):   ', epochStartTs);
}

// ── Step 4: compute final total and determine winner ─────────────────────────
// Contract logic (close_epoch.rs):
//   reign_end         = max(epoch_start_timestamp, master_since)
//   final_reign       = reign_end - master_since   (clamped ≥ 0)
//   final_master_total = stored + final_reign
//   winner = final_master_total >= leading_master_time ? current_master : leading_master
const masterSinceNum   = Number(masterSince);
const reignEnd         = Math.max(epochStartTs, masterSinceNum);
const finalReign       = BigInt(Math.max(0, reignEnd - masterSinceNum));
const finalMasterTotal = storedReignTime + finalReign;

console.log('\n── Winner Determination ─────────────────────────────────────');
console.log('  final_reign:         ', finalReign.toString(), 's');
console.log('  final_master_total:  ', finalMasterTotal.toString(), 's');
console.log('  leading_master_time: ', leadingMasterTime.toString(), 's');

let winner;
if (finalMasterTotal >= leadingMasterTime) {
  winner = currentMaster;
  console.log('  -> Winner: currentMaster (final_master_total >= leading_master_time)');
  console.log('             ', winner.toString());
} else {
  winner = leadingMaster;
  console.log('  -> Winner: leadingMaster (leading_master_time > final_master_total)');
  console.log('             ', winner.toString());
}

// ── Step 5: close_epoch ───────────────────────────────────────────────────────
console.log('\n-> Calling close_epoch...');
const closeIx = new TransactionInstruction({
  programId: PROGRAM,
  keys: [
    { pubkey: epochStatePDA,       isSigner: false, isWritable: true  }, // epoch_state
    { pubkey: currentMasterRecord, isSigner: false, isWritable: false }, // current_master_record (read-only)
    { pubkey: payer.publicKey,     isSigner: true,  isWritable: true  }, // caller (earns 5%)
    { pubkey: winner,              isSigner: false, isWritable: true  }, // winner (earns 70%)
    { pubkey: treasury,            isSigner: false, isWritable: true  }, // treasury (from chain state)
    { pubkey: BURN_ADDR,           isSigner: false, isWritable: true  }, // burn address
  ],
  data: DISC_CLOSE_EPOCH,
});

const closeSig = await sendAndConfirm(conn, payer, closeIx);
console.log('  OK close_epoch:', closeSig);
console.log('     Explorer:  ', 'https://explorer.testnet.x1.xyz/tx/' + closeSig);

// ── Step 6: wait for epoch_state GC ──────────────────────────────────────────
console.log('\n-> Waiting for epoch_state to be garbage-collected...');
let gone = false;
for (let i = 0; i < 15; i++) {
  await new Promise(r => setTimeout(r, 2000));
  const check = await conn.getAccountInfo(epochStatePDA);
  if (!check) { console.log('  Account gone.'); gone = true; break; }
}
if (!gone) console.log('  Timed out — proceeding anyway...');

// ── Step 7: initialize_epoch ──────────────────────────────────────────────────
console.log('\n-> Calling initialize_epoch...');
const initIx = new TransactionInstruction({
  programId: PROGRAM,
  keys: [
    { pubkey: epochStatePDA,           isSigner: false, isWritable: true  },
    { pubkey: gameCounterPDA,          isSigner: false, isWritable: true  },
    { pubkey: payer.publicKey,         isSigner: true,  isWritable: true  },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: DISC_INIT_EPOCH,
});

const initSig = await sendAndConfirm(conn, payer, initIx);
console.log('  OK initialize_epoch:', initSig);
console.log('     Explorer:       ', 'https://explorer.testnet.x1.xyz/tx/' + initSig);

// ── Verify ────────────────────────────────────────────────────────────────────
const newAcct = await conn.getAccountInfo(epochStatePDA);
if (newAcct) {
  const nd      = newAcct.data;
  const newId   = readU64(nd, 146);
  const newCost = readU64(nd, 136);
  console.log('\nFresh epoch initialised!');
  console.log('  game_id:         ', newId.toString());
  console.log('  next_claim_cost: ', (Number(newCost) / 1e9).toFixed(2), 'XNT  <- should be 2.00');
}
