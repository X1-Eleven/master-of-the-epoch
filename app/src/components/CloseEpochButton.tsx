import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '../context/WalletModalContext';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Idl, BN } from '@coral-xyz/anchor';
import { IDL } from '../idl';
import { EpochStateData } from '../hooks/useEpochState';
import { formatXnt } from '../utils/format';
import {
  PROGRAM_ID, RPC_ENDPOINT, EPOCH_STATE_SEED, MASTER_RECORD_SEED, BURN_ADDRESS, LAMPORTS_PER_XNT,
} from '../constants';

interface CloseEpochButtonProps {
  epochState: EpochStateData | null;
  isEpochOver: boolean;
  isClosed: boolean;
}

export function CloseEpochButton({ epochState, isEpochOver, isClosed }: CloseEpochButtonProps) {
  const { connected, publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [closing, setClosing] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  const canClose = isEpochOver && !isClosed && !!epochState;
  const callerReward = epochState ? (epochState.pot / LAMPORTS_PER_XNT) * 0.05 : 0;

  async function handleClose() {
    if (!connected || !publicKey || !signTransaction) { setVisible(true); return; }
    if (!epochState) return;
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

      const [epochStatePDA] = PublicKey.findProgramAddressSync([Buffer.from(EPOCH_STATE_SEED)], PROGRAM_ID);
      const [currentMasterRecord] = PublicKey.findProgramAddressSync(
        [Buffer.from(MASTER_RECORD_SEED), new PublicKey(epochState.currentMaster).toBuffer()],
        PROGRAM_ID
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const masterRecordData = await (program.account as any).masterRecord.fetch(currentMasterRecord);
      const now = Math.floor(Date.now() / 1000);
      const currentTotal = (masterRecordData.totalReignTime as BN).toNumber() + (now - epochState.masterSince);
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
    <div>
      <button
        onClick={handleClose}
        disabled={!canClose || closing}
        className={`w-full font-orbitron font-bold text-sm tracking-widest uppercase px-8 py-4 rounded border transition-all duration-200 disabled:cursor-not-allowed ${
          canClose
            ? 'border-red-500/60 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-500/80 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]'
            : 'border-border-dim bg-transparent text-text-dim/40 opacity-50'
        }`}
      >
        {closing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-red-400/40 border-t-red-400 rounded-full animate-spin inline-block" />
            Closing Epoch...
          </span>
        ) : isClosed ? (
          '✓ Epoch Already Closed'
        ) : !isEpochOver ? (
          'Close Epoch & Claim Reward (Inactive)'
        ) : (
          `Close Epoch & Claim Reward — earn ${callerReward.toFixed(2)} XNT (5%)`
        )}
      </button>

      {canClose && (
        <p className="text-[10px] font-mono text-text-dim/60 text-center mt-1.5">
          Pot: {epochState ? formatXnt(epochState.pot) : '0'} XNT · 60% winner · 25% burn · 10% treasury · 5% you
        </p>
      )}

      {txStatus && (
        <p className={`text-xs font-mono text-center mt-2 ${txStatus.startsWith('Error') ? 'text-red-400' : 'text-neon-dim'}`}>
          {txStatus}
        </p>
      )}
    </div>
  );
}
