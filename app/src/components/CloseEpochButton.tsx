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

const INIT_MAX_TRIES = 3;
const INIT_RETRY_DELAY_MS = 2000;

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
  const [phase, setPhase] = useState<'idle' | 'closing' | 'initializing'>('idle');
  // 1-based attempt counter shown in the button label during auto-retry; 0 = not retrying
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  // true when close_epoch confirmed but all initialize_epoch attempts failed
  const [needsInit, setNeedsInit] = useState(false);

  const busy = phase !== 'idle';
  const canClose = isEpochOver && !isClosed && !!epochState;
  const canAct = (canClose || needsInit) && !busy;
  // Emergency button: visible when epoch closed but not yet re-initialized,
  // whether detected this session (needsInit) or after a page refresh (isClosed+isEpochOver).
  const showEmergencyInit = !busy && (needsInit || (isClosed && isEpochOver));
  const callerReward = epochState ? (epochState.pot / LAMPORTS_PER_XNT) * 0.05 : 0;

  async function sendAndConfirm(connection: Connection, tx: Transaction): Promise<string> {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = publicKey!;
    const signed = await signTransaction!(tx);
    const sig = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    return sig;
  }

  // Sends initialize_epoch, retrying up to INIT_MAX_TRIES times on failure.
  // Throws the last error if all attempts fail.
  async function sendInitWithRetry(
    connection: Connection,
    program: Program,
    epochStatePDA: PublicKey,
    gameCounterPDA: PublicKey,
  ): Promise<string> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= INIT_MAX_TRIES; attempt++) {
      setRetryAttempt(attempt);
      if (attempt > 1) {
        await new Promise<void>((r) => setTimeout(r, INIT_RETRY_DELAY_MS));
      }
      try {
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
        tx.add(initIx);
        return await sendAndConfirm(connection, tx);
      } catch (e: unknown) {
        lastError = e;
        console.warn(`[MOTE] initialize_epoch attempt ${attempt}/${INIT_MAX_TRIES} failed:`, e);
      }
    }
    throw lastError;
  }

  function makeConnection(): [Connection, Program] {
    const connection = new Connection(RPC_ENDPOINT, 'confirmed');
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: publicKey!,
        signTransaction: signTransaction!,
        signAllTransactions: async (txs: Transaction[]) =>
          Promise.all(txs.map((tx) => signTransaction!(tx))),
      } as never,
      { commitment: 'confirmed' }
    );
    return [connection, new Program(IDL as unknown as Idl, provider)];
  }

  async function handleClose() {
    if (!connected || !publicKey) { setVisible(true); return; }
    if (!signTransaction || !epochState) return;
    if (busy) return;

    setTxStatus(null);
    setIsError(false);
    setRetryAttempt(0);

    const [connection, program] = makeConnection();
    const [epochStatePDA] = PublicKey.findProgramAddressSync([Buffer.from(EPOCH_STATE_SEED)], PROGRAM_ID);
    const [gameCounterPDA] = PublicKey.findProgramAddressSync([Buffer.from(GAME_COUNTER_SEED)], PROGRAM_ID);

    // ── Retry path: close_epoch already confirmed, only need initialize ───────
    if (needsInit) {
      setPhase('initializing');
      try {
        const sig = await sendInitWithRetry(connection, program, epochStatePDA, gameCounterPDA);
        setNeedsInit(false);
        setTxStatus(`New epoch started! tx: ${sig.slice(0, 8)}...`);
        setIsError(false);
        onRefresh();
      } catch (e: unknown) {
        setIsError(true);
        setTxStatus(`Failed to start new epoch — ${getErrorMessage(e)}`);
      } finally {
        setPhase('idle');
        setRetryAttempt(0);
      }
      return;
    }

    // ── Step 1: close_epoch ──────────────────────────────────────────────────
    const [currentMasterRecord] = PublicKey.findProgramAddressSync(
      [Buffer.from(MASTER_RECORD_SEED), new PublicKey(epochState.currentMaster).toBuffer()],
      PROGRAM_ID
    );

    // Bug 2: set phase immediately (same React batch as message clearing above) so no
    // old status message can ever be visible while a new attempt is in flight.
    setPhase('closing');

    let closeSig: string;
    try {
      // Bug 4: mirror the contract's winner logic exactly.
      // The contract uses clock.epoch_start_timestamp (start of current network epoch) as
      // the reign cap — NOT the current wall-clock time.  Fetch it from the RPC so our
      // comparison matches what the on-chain handler will compute.
      const netEpochInfo = await connection.getEpochInfo();
      const epochStartSlot = netEpochInfo.absoluteSlot - netEpochInfo.slotIndex;
      let epochStartTs = await connection.getBlockTime(epochStartSlot);
      if (epochStartTs === null) {
        // Fallback: estimate from slot index (400 ms avg slot time on X1)
        epochStartTs = Math.floor(Date.now() / 1000) - Math.floor(netEpochInfo.slotIndex * 400 / 1000);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const masterRecordData = await (program.account as any).masterRecord.fetch(currentMasterRecord);
      const storedReignTime = (masterRecordData.totalReignTime as BN).toNumber();

      // Contract: final_reign = max(epoch_start_ts, master_since) - master_since
      const reignEnd = Math.max(epochStartTs, epochState.masterSince);
      const finalReign = Math.max(0, reignEnd - epochState.masterSince);
      const finalMasterTotal = storedReignTime + finalReign;

      // Use epochState.leadingMasterTime and epochState.leadingMaster directly from on-chain state
      const winner =
        finalMasterTotal >= epochState.leadingMasterTime
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
        finalMasterTotal,
        leadingMasterTime: epochState.leadingMasterTime,
        epochStartTs,
      });

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
      const tx = new Transaction();
      tx.add(closeIx);
      closeSig = await sendAndConfirm(connection, tx);
    } catch (e: unknown) {
      setPhase('idle');
      setIsError(true);
      setTxStatus(`Step 1 failed — ${getErrorMessage(e)}`);
      return;
    }

    console.log('[MOTE] close_epoch confirmed:', closeSig);

    // ── Step 2: initialize_epoch with auto-retry ─────────────────────────────
    setPhase('initializing');
    try {
      const initSig = await sendInitWithRetry(connection, program, epochStatePDA, gameCounterPDA);
      setNeedsInit(false);
      setTxStatus(`Epoch closed & new game started! tx: ${initSig.slice(0, 8)}...`);
      setIsError(false);
      onRefresh();
    } catch (e: unknown) {
      // close_epoch landed; user can retry step 2 via the main button or emergency button
      setNeedsInit(true);
      setIsError(true);
      setTxStatus(
        `Epoch closed (tx: ${closeSig.slice(0, 8)}...) but failed to start new epoch after ${INIT_MAX_TRIES} attempts.`
      );
    } finally {
      setPhase('idle');
      setRetryAttempt(0);
    }
  }

  async function handleEmergencyInit() {
    if (!connected || !publicKey) { setVisible(true); return; }
    if (!signTransaction) return;
    if (busy) return;

    setTxStatus(null);
    setIsError(false);
    setRetryAttempt(0);

    const [connection, program] = makeConnection();
    const [epochStatePDA] = PublicKey.findProgramAddressSync([Buffer.from(EPOCH_STATE_SEED)], PROGRAM_ID);
    const [gameCounterPDA] = PublicKey.findProgramAddressSync([Buffer.from(GAME_COUNTER_SEED)], PROGRAM_ID);

    setPhase('initializing');
    try {
      const sig = await sendInitWithRetry(connection, program, epochStatePDA, gameCounterPDA);
      setNeedsInit(false);
      setTxStatus(`New epoch started! tx: ${sig.slice(0, 8)}...`);
      setIsError(false);
      onRefresh();
    } catch (e: unknown) {
      setIsError(true);
      setTxStatus(`Failed to start new epoch — ${getErrorMessage(e)}`);
    } finally {
      setPhase('idle');
      setRetryAttempt(0);
    }
  }

  function buttonLabel() {
    if (phase === 'closing') {
      return (
        <span className="flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-red-400/40 border-t-red-400 rounded-full animate-spin inline-block" />
          Closing epoch... (1/2)
        </span>
      );
    }
    if (phase === 'initializing') {
      const label = retryAttempt > 1
        ? `Starting new epoch... retrying (${retryAttempt}/${INIT_MAX_TRIES})`
        : 'Starting new epoch... (2/2)';
      return (
        <span className="flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-red-400/40 border-t-red-400 rounded-full animate-spin inline-block" />
          {label}
        </span>
      );
    }
    if (needsInit) return '↺ Retry: Start New Epoch';
    if (isClosed) return '✓ Epoch Already Closed';
    if (!isEpochOver) return 'Close Epoch & Claim Reward (Inactive)';
    return `Close Epoch & Claim Reward — earn ${callerReward.toFixed(2)} XNT (5%)`;
  }

  return (
    <div>
      <button
        onClick={handleClose}
        disabled={!canAct}
        className={`w-full font-orbitron font-bold text-sm tracking-widest uppercase px-8 py-4 rounded border transition-all duration-200 disabled:cursor-not-allowed ${
          canAct
            ? 'border-red-500/60 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-500/80 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]'
            : 'border-border-dim bg-transparent text-text-dim/40 opacity-50'
        }`}
      >
        {buttonLabel()}
      </button>

      {canClose && !needsInit && (
        <p className="text-[10px] font-mono text-white/70 text-center mt-1.5">
          Pot: {epochState ? formatXnt(epochState.pot) : '0'} XNT · 60% winner · 25% burn · 10% treasury · 5% you
        </p>
      )}

      {txStatus && !busy && (
        <p className={`text-xs font-mono text-center mt-2 ${isError ? 'text-red-400' : 'text-neon-dim'}`}>
          {txStatus}
        </p>
      )}

      {showEmergencyInit && (
        <button
          onClick={handleEmergencyInit}
          className="mt-2 w-full font-orbitron font-bold text-xs tracking-widest uppercase px-6 py-3 rounded border border-amber-500/60 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/80 hover:shadow-[0_0_16px_rgba(245,158,11,0.3)] transition-all duration-200"
        >
          ⚡ Start New Epoch
        </button>
      )}
    </div>
  );
}
