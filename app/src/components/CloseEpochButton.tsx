import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '../context/WalletModalContext';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Idl, BN } from '@coral-xyz/anchor';
import { IDL } from '../idl';
import { EpochStateData } from '../hooks/useEpochState';
import { formatXnt } from '../utils/format';
import {
  PROGRAM_ID, RPC_ENDPOINT, EPOCH_STATE_SEED, MASTER_RECORD_SEED,
  GAME_COUNTER_SEED, BURN_ADDRESS, LAMPORTS_PER_XNT,
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
    if (!connected || !publicKey) { setVisible(true); return; }
    if (!signTransaction || !epochState) return;

    setClosing(true);
    setTxStatus(null);

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

    // Step 1: close_epoch
    let closeTx: string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const masterRecordData = await (program.account as any).masterRecord.fetch(currentMasterRecord);
      const now = Math.floor(Date.now() / 1000);
      const currentTotal = (masterRecordData.totalReignTime as BN).toNumber() + (now - epochState.masterSince);
      const winner =
        currentTotal > epochState.leadingMasterTime
          ? new PublicKey(epochState.currentMaster)
          : new PublicKey(epochState.leadingMaster);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      closeTx = await (program.methods as any).closeEpoch()
        .accounts({
          epochState: epochStatePDA,
          currentMasterRecord,
          caller: publicKey,
          winner,
          treasury: new PublicKey(epochState.treasury),
          burnAddress: BURN_ADDRESS,
        })
        .rpc();
    } catch {
      setTxStatus('Epoch ending, please wait a moment and try again');
      setClosing(false);
      return;
    }

    // Step 2: initialize_epoch for the next game
    setTxStatus('Epoch closed! Starting next epoch...');
    const [gameCounterPDA] = PublicKey.findProgramAddressSync([Buffer.from(GAME_COUNTER_SEED)], PROGRAM_ID);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const initTx = await (program.methods as any).initializeEpoch()
        .accounts({
          epochState: epochStatePDA,
          gameCounter: gameCounterPDA,
          payer: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setTxStatus(`New epoch started! tx: ${initTx.slice(0, 8)}...`);
    } catch {
      setTxStatus(`Epoch closed (tx: ${closeTx.slice(0, 8)}...) — new epoch init failed, please retry`);
    }

    setClosing(false);
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
            {txStatus ?? 'Closing Epoch...'}
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

      {txStatus && !closing && (
        <p className={`text-xs font-mono text-center mt-2 ${
          txStatus.startsWith('Epoch ending') || txStatus.includes('failed')
            ? 'text-red-400'
            : 'text-neon-dim'
        }`}>
          {txStatus}
        </p>
      )}
    </div>
  );
}
