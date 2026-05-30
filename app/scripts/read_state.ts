import { Connection, PublicKey } from '@solana/web3.js';

const RPC = 'https://xolana.xen.network';
const PROGRAM = new PublicKey('BC4y2dVdicttQCFSrBA9DjGxuHQrn3dikzds7twaRXu1');

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from('epoch_state')], PROGRAM);
  const info = await conn.getAccountInfo(pda);
  if (!info) { console.log('No epoch_state account'); return; }

  const d = info.data;
  // Correct layout (discriminator=8):
  // [8..40]   treasury
  // [40..72]  current_master
  // [72..80]  master_since (i64)
  // [80..112] leading_master
  // [112..120] leading_master_time (u64)
  // [120..128] game_epoch (u64)
  // [128..136] pot (u64)
  // [136..144] next_claim_cost (u64)
  // [144]     closed (bool)
  // [145]     bump (u8)
  // [146..154] game_id (u64)
  const dv = new DataView(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
  const treasury       = new PublicKey(d.slice(8,   40)).toString();
  const currentMaster  = new PublicKey(d.slice(40,  72)).toString();
  const masterSince    = dv.getBigInt64(72, true);
  const leadingMaster  = new PublicKey(d.slice(80, 112)).toString();
  const leadingMasterTime = dv.getBigUint64(112, true);
  const gameEpoch      = dv.getBigUint64(120, true);
  const pot            = dv.getBigUint64(128, true);
  const nextClaimCost  = dv.getBigUint64(136, true);
  const closed         = d[144];
  const bump           = d[145];
  const gameId         = dv.getBigUint64(146, true);

  const epochInfo = await conn.getEpochInfo();
  console.log('Network epoch      :', epochInfo.epoch);
  console.log('game_epoch stored  :', gameEpoch.toString());
  console.log('Epoch over?        :', epochInfo.epoch > Number(gameEpoch) ? 'YES' : 'NO');
  console.log('next_claim_cost    :', (Number(nextClaimCost)/1e9).toFixed(2), 'XNT');
  console.log('closed             :', closed === 1 ? 'YES' : 'NO');
  console.log('current_master     :', currentMaster);
  console.log('master_since       :', masterSince.toString(), '→', new Date(Number(masterSince)*1000).toISOString());
  console.log('leading_master     :', leadingMaster);
  console.log('leading_master_time:', leadingMasterTime.toString(), 's');
  console.log('pot                :', (Number(pot)/1e9).toFixed(4), 'XNT');
  console.log('game_id            :', gameId.toString());
  console.log('treasury           :', treasury);
  console.log('bump               :', bump);
}

main().catch(console.error);
