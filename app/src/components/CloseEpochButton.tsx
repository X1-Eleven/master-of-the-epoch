import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Idl, BN } from '@coral-xyz/anchor';
import { IDL } from '../idl';
import { EpochStateData } from '../hooks/useEpochState';
import { formatXnt } from '../utils/format';
import {
  PROGRAM_ID,
  RPC_ENDPOINT,
  EPOCH_STATE_SEED,
  MASTER_RECORD_SEED,
  BURN_ADDRESS,
  LAMPORTS_PER_XNT,
} from '../constants';

interface CloseEpochButtonProps {
  epochState: EpochStateData;
}

export function CloseEpochButton({ epochState }: CloseEpochButtonProps) {
  const { connected, publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [closing, setClosing] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  const callerReward = (epochState.pot / LAMPORTS_PER_XNT) * 0.05;
  const winnerReward = (epochState.pot / LAMPORTS_PER_XNT) * 0.60;

  async function handleClose() {
    if (!connected || !publicKey || !signTransaction) {
      setVisible(true);
      return;
    }
    setClosing(true);
    setTxStatus(null);
    try {
      const connection = new Connection(RPC_ENDPOINT, 'confirmed');
      const provider = new AnchorProvider(
        connection,
        { publicKey, signTransaction, signAllTransactions: async (txs: unknown[]) => txs } as never,
        { commitment: 'confirmed' }
      );
      const program = new Program(IDL as unknown as Idl, provider);

      const [epochStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(EPOCH_STATE_SEED)],
        PROGRAM_ID
      );
      const [currentMasterRecord] = PublicKey.findProgramAddressSync(
        [Buffer.from(MASTER_RECORD_SEED), new PublicKey(epochState.currentMaster).toBuffer()],
        PROGRAM_ID
      );

      // Fetch current master record to determine winner
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const masterRecordData = await (program.account as any).masterRecord.fetch(currentMasterRecord);
      const now = Math.floor(Date.now() / 1000);
      const ongoingReign = now - epochState.masterSince;
      const currentTotal = (masterRecordData.totalReignTime as BN).toNumber() + ongoingReign;

      const winner =
        currentTotal > epochState.leadingMasterTime
          ? new PublicKey(epochState.currentMaster)
          : new PublicKey(epochState.leadingMaster);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = await (program.methods as any).closeEpoch()
        .accounts({
          epochState: epochStatePDA,
          currentMasterRecord,
          caller: publicKey,
          winner,
          treasury: new PublicKey(epochState.treasury),
          burnAddress: BURN_ADDRESS,
        })
        .rpc();

      setTxStatus(`Epoch closed! tx: ${tx.slice(0, 8)}...`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setTxStatus(`Error: ${msg.slice(0, 80)}`);
    } finally {
      setClosing(false);
    }
  }

  return (
    <section className="rounded-lg border border-red-500/30 bg-red-500/5 overflow-hidden">
      <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />
      <div className="p-6 sm:p-8 text-center">
        <div className="inline-flex items-center gap-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse inline-block" />
          <span className="font-orbitron text-xs tracking-[0.25em] text-red-400 uppercase">
            Epoch Concluded
          </span>
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse inline-block" />
        </div>

        <p className="text-slate-300 text-sm mb-2">
          The epoch has ended. Anyone can call <span className="font-mono text-purple-light">close_epoch</span> to distribute the prize pool.
        </p>
        <p className="text-xs font-mono text-text-dim mb-6">
          You earn <span className="text-neon-dim">5% ({callerReward.toFixed(2)} XNT)</span> for triggering close · Winner receives{' '}
          <span className="text-gold-mid">60% ({winnerReward.toFixed(2)} XNT)</span>
        </p>

        <button
          onClick={handleClose}
          disabled={closing}
          className="font-orbitron font-bold text-sm tracking-widest uppercase px-8 py-4 rounded border border-red-500/60 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-500/80 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed w-full sm:w-auto"
        >
          {closing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-red-400/40 border-t-red-400 rounded-full animate-spin inline-block" />
              Closing Epoch...
            </span>
          ) : (
            `Close Epoch & Claim Reward — ${epochState ? formatXnt(epochState.pot) : '0'} XNT Pot`
          )}
        </button>

        {txStatus && (
          <p className={`text-xs font-mono mt-3 ${txStatus.startsWith('Error') ? 'text-red-400' : 'text-neon-dim'}`}>
            {txStatus}
          </p>
        )}
      </div>
    </section>
  );
}
