import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '../context/WalletModalContext';
import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
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
  onRefresh: () => void;
}

function getErrorMessage(e: unknown): string {
  if (!(e instanceof Error)) return String(e).slice(0, 200);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ae = e as any;
  if (ae.logs?.length) {
    console.error('[MOTE] Transaction logs:', ae.logs);
    const errLine = (ae.logs as string[]).find((l) => l.includes('Error Message:'));
    if (errLine) return errLine.replace(/.*Error Message:\s*/, '');
    const programErr = (ae.logs as string[]).find((l) => l.includes('custom program error'));
    if (programErr) return programErr;
    const failedLine = (ae.logs as string[]).find((l) => l.includes('failed'));
    if (failedLine) return failedLine.slice(0, 200);
  }
  if (ae.error?.errorMessage) return ae.error.errorMessage;
  if (ae.errorMessage) return ae.errorMessage;
  return e.message.slice(0, 200);
}

export function CloseEpochButton({ epochState, isEpochOver, isClosed, onRefresh }: CloseEpochButtonProps) {
  const { connected, publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [closing, setClosing] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const canClose = isEpochOver && !isClosed && !!epochState;
  const callerReward = epochState ? (epochState.pot / LAMPORTS_PER_XNT) * 0.05 : 0;

  async function handleClose() {
    if (!connected || !publicKey) { setVisible(true); return; }
    if (!signTransaction || !epochState) return;
    if (closing) return;

    setClosing(true);
    // Bug 3: clear ALL previous messages before each attempt
    setTxStatus(null);
    setIsError(false);

    try {
      const connection = new Connection(RPC_ENDPOINT, 'confirmed');
      const provider = new AnchorProvider(
        connection,
        {
          publicKey,
          signTransaction,
          // Bug 2: properly implement signAllTransactions so Anchor never bypasses signing
          signAllTransactions: async (txs: Transaction[]) =>
            Promise.all(txs.map((tx) => signTransaction(tx))),
        } as never,
        { commitment: 'confirmed' }
      );
      const program = new Program(IDL as unknown as Idl, provider);

      const [epochStatePDA] = PublicKey.findProgramAddressSync([Buffer.from(EPOCH_STATE_SEED)], PROGRAM_ID);
      const [currentMasterRecord] = PublicKey.findProgramAddressSync(
        [Buffer.from(MASTER_RECORD_SEED), new PublicKey(epochState.currentMaster).toBuffer()],
        PROGRAM_ID
      );
      const [gameCounterPDA] = PublicKey.findProgramAddressSync([Buffer.from(GAME_COUNTER_SEED)], PROGRAM_ID);

      // Determine winner (same logic as the on-chain handler)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const masterRecordData = await (program.account as any).masterRecord.fetch(currentMasterRecord);
      const now = Math.floor(Date.now() / 1000);
      const storedReignTime = (masterRecordData.totalReignTime as BN).toNumber();
      const ongoingReignTime = now - epochState.masterSince;
      const currentTotal = storedReignTime + ongoingReignTime;
      const winner =
        currentTotal >= epochState.leadingMasterTime
          ? new PublicKey(epochState.currentMaster)
          : new PublicKey(epochState.leadingMaster);

      const treasuryKey = new PublicKey(epochState.treasury);

      console.log('[MOTE] closeEpoch accounts:', {
        epochState: epochStatePDA.toString(),
        currentMasterRecord: currentMasterRecord.toString(),
        caller: publicKey.toString(),
        winner: winner.toString(),
        treasury: treasuryKey.toString(),
        burnAddress: BURN_ADDRESS.toString(),
      });
      console.log('[MOTE] winner determination:', {
        currentMaster: epochState.currentMaster,
        leadingMaster: epochState.leadingMaster,
        storedReignTime,
        ongoingReignTime,
        currentTotal,
        leadingMasterTime: epochState.leadingMasterTime,
        winnerIsCurrentMaster: currentTotal >= epochState.leadingMasterTime,
      });
      console.log('[MOTE] initializeEpoch accounts:', {
        epochState: epochStatePDA.toString(),
        gameCounter: gameCounterPDA.toString(),
        payer: publicKey.toString(),
        systemProgram: SystemProgram.programId.toString(),
      });

      // build both instructions and combine into one atomic transaction
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const closeIx = await (program.methods as any).closeEpoch()
        .accounts({
          epochState: epochStatePDA,
          currentMasterRecord,
          caller: publicKey,
          winner,
          treasury: treasuryKey,
          burnAddress: BURN_ADDRESS,
        })
        .instruction();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const initIx = await (program.methods as any).initializeEpoch()
        .accounts({
          epochState: epochStatePDA,
          gameCounter: gameCounterPDA,
          payer: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction();
      tx.add(closeIx, initIx);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // Sign once — user sees a single wallet popup
      const signedTx = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

      setTxStatus(`Epoch closed & new game started! tx: ${sig.slice(0, 8)}...`);
      setIsError(false);
      // Bug 5: immediately refresh state after successful transaction
      onRefresh();
    } catch (e: unknown) {
      // Reset button state first so it's immediately retryable, then show error
      setClosing(false);
      setIsError(true);
      setTxStatus(getErrorMessage(e));
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
            Closing & Restarting Epoch...
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
        <p className="text-[10px] font-mono text-white/70 text-center mt-1.5">
          Pot: {epochState ? formatXnt(epochState.pot) : '0'} XNT · 60% winner · 25% burn · 10% treasury · 5% you
        </p>
      )}

      {txStatus && !closing && (
        <p className={`text-xs font-mono text-center mt-2 ${isError ? 'text-red-400' : 'text-neon-dim'}`}>
          {txStatus}
        </p>
      )}
    </div>
  );
}
