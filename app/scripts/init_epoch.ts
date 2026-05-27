/**
 * One-shot script: calls initialize_epoch on the deployed Master of the Epoch program.
 * Run from app/: tsx scripts/init_epoch.ts
 */
import { readFileSync } from 'fs';
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
} from '@solana/web3.js';
import { AnchorProvider, Program, Idl } from '@coral-xyz/anchor';

const RPC     = 'https://xolana.xen.network';
const PROGRAM = new PublicKey('BC4y2dVdicttQCFSrBA9DjGxuHQrn3dikzds7twaRXu1');
const WALLET  = '/home/admin/.config/solana/id.json';

const IDL = {
  address: 'BC4y2dVdicttQCFSrBA9DjGxuHQrn3dikzds7twaRXu1',
  metadata: { name: 'masterOfTheEpoch', version: '0.1.0', spec: '0.1.0' },
  instructions: [
    {
      name: 'initializeEpoch',
      discriminator: [19, 114, 86, 107, 206, 21, 45, 39],
      accounts: [
        { name: 'epochState',   writable: true, pda: { seeds: [{ kind: 'const', value: [101,112,111,99,104,95,115,116,97,116,101] }] } },
        { name: 'gameCounter',  writable: true, pda: { seeds: [{ kind: 'const', value: [103,97,109,101,95,99,111,117,110,116,101,114] }] } },
        { name: 'payer',        writable: true, signer: true },
        { name: 'systemProgram', address: '11111111111111111111111111111111' },
      ],
      args: [],
    },
  ],
  accounts: [],
  types: [],
};

async function main() {
  // Load wallet
  const raw = JSON.parse(readFileSync(WALLET, 'utf-8')) as number[];
  const payer = Keypair.fromSecretKey(Uint8Array.from(raw));
  console.log('Payer:', payer.publicKey.toString());

  const connection = new Connection(RPC, 'confirmed');

  // Check balance
  const lamports = await connection.getBalance(payer.publicKey);
  console.log('Balance:', (lamports / 1e9).toFixed(4), 'XNT');

  // Check current epoch
  const epochInfo = await connection.getEpochInfo();
  console.log(`Network epoch: ${epochInfo.epoch}, slot ${epochInfo.absoluteSlot}`);

  // Derive PDAs
  const [epochStatePDA, epochBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('epoch_state')],
    PROGRAM
  );
  const [gameCounterPDA, counterBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('game_counter')],
    PROGRAM
  );
  console.log('epoch_state PDA:  ', epochStatePDA.toString(), '(bump', epochBump + ')');
  console.log('game_counter PDA: ', gameCounterPDA.toString(), '(bump', counterBump + ')');

  // Check if already initialized
  const existing = await connection.getAccountInfo(epochStatePDA);
  if (existing) {
    console.log('\n⚠️  epoch_state already exists — initialize_epoch was already called.');
    console.log('Account data length:', existing.data.length, 'bytes');
    process.exit(0);
  }

  // Build provider + program
  const wallet = {
    publicKey: payer.publicKey,
    signTransaction: async <T extends Parameters<typeof payer['sign']>[0]>(tx: T) => {
      tx.sign(payer);
      return tx;
    },
    signAllTransactions: async <T extends Parameters<typeof payer['sign']>[0]>(txs: T[]) => {
      txs.forEach(tx => tx.sign(payer));
      return txs;
    },
  };

  const provider = new AnchorProvider(connection, wallet as never, { commitment: 'confirmed' });
  const program  = new Program(IDL as unknown as Idl, provider);

  console.log('\nSending initialize_epoch transaction...');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = await (program.methods as any).initializeEpoch()
    .accounts({
      epochState:    epochStatePDA,
      gameCounter:   gameCounterPDA,
      payer:         payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([payer])
    .rpc({ commitment: 'confirmed' });

  console.log('\n✅ initialize_epoch succeeded!');
  console.log('Transaction:', tx);
  console.log('View on explorer: https://explorer.testnet.x1.xyz/tx/' + tx);

  // Verify
  const account = await connection.getAccountInfo(epochStatePDA);
  console.log('\nVerification: epoch_state account now exists,', account?.data.length, 'bytes');
}

main().catch(err => {
  console.error('\n❌ Error:', err);
  process.exit(1);
});
