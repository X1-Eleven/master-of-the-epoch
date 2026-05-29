import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '../context/WalletModalContext';
import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import { IDL } from '../idl';
import { EpochStateData, EpochInfo } from '../hooks/useEpochState';
import { formatAddress, formatDuration, formatXnt } from '../utils/format';
import { useNicknames } from '../context/NicknameContext';
import { CloseEpochButton } from './CloseEpochButton';
import { PROGRAM_ID, RPC_ENDPOINT, EPOCH_STATE_SEED, MASTER_RECORD_SEED, NULL_PUBLIC_KEY } from '../constants';

interface HeroSectionProps {
  epochState: EpochStateData | null;
  epochInfo: EpochInfo | null;
  isLoading: boolean;
  isEpochOver: boolean;
  isClosed: boolean;
  onRefresh: () => void;
}

// Bug 3: extract a user-friendly message from any Anchor/wallet error
function getErrorMessage(e: unknown): string {
  if (!(e instanceof Error)) return String(e).slice(0, 120);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ae = e as any;
  if (ae.error?.errorMessage) return ae.error.errorMessage;
  if (ae.errorMessage) return ae.errorMessage;
  if (ae.logs?.length) {
    const line = (ae.logs as string[]).find((l) => l.includes('Error Message:'));
    if (line) return line.replace(/.*Error Message:\s*/, '');
  }
  return e.message.slice(0, 120);
}

function ShareButton({ masterDisplay }: { masterDisplay: string }) {
  const tweet = `${masterDisplay} is the Master of the Epoch! x1mote.xyz #MasterOfTheEpoch #MOTE #X1Blockchain #XNT`;
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="Share on X"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-600/40 bg-slate-800/30 text-slate-400 hover:border-slate-400/60 hover:text-slate-200 hover:bg-slate-700/40 transition-all text-[10px] font-mono tracking-wide shrink-0"
    >
      Show Them!!
      {/* X / Twitter logo */}
      <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.261 5.633 5.903-5.633zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
      </svg>
    </a>
  );
}

export function HeroSection({
  epochState, epochInfo, isLoading, isEpochOver, isClosed, onRefresh,
}: HeroSectionProps) {
  const { connected, publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const { getNickname } = useNicknames();
  const [countdown, setCountdown] = useState<number>(epochInfo?.secondsRemaining ?? 0);
  const [claiming, setClaiming] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [txIsError, setTxIsError] = useState(false);

  // Bug 4: freeze "Reigning for" when epoch is over
  const frozenReignSecondsRef = useRef<number | null>(null);

  useEffect(() => {
    if (epochInfo?.secondsRemaining == null) return;
    setCountdown(epochInfo.secondsRemaining);
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [epochInfo?.secondsRemaining]);

  const hasNoMaster = !epochState || epochState.currentMaster === NULL_PUBLIC_KEY;
  const isCurrentMaster = connected && publicKey && epochState?.currentMaster === publicKey.toString();
  const gameNotStarted = epochState?.gameEpoch === 0;

  // Bug 4: snapshot reign time the moment we detect epoch is over; never let it tick past that
  const liveReignSeconds = epochState && !hasNoMaster
    ? Math.max(0, Math.floor(Date.now() / 1000) - epochState.masterSince)
    : 0;

  useEffect(() => {
    if (isEpochOver && !hasNoMaster && liveReignSeconds > 0) {
      if (frozenReignSecondsRef.current === null) {
        frozenReignSecondsRef.current = liveReignSeconds;
      }
    } else if (!isEpochOver) {
      frozenReignSecondsRef.current = null;
    }
  });

  const reignSeconds = isEpochOver
    ? (frozenReignSecondsRef.current ?? liveReignSeconds)
    : liveReignSeconds;

  const masterNickname = epochState && !hasNoMaster
    ? getNickname(epochState.currentMaster)
    : null;
  const masterDisplay = masterNickname && masterNickname !== 'Anonymous'
    ? masterNickname
    : (epochState ? formatAddress(epochState.currentMaster, 6) : '—');

  async function handleClaim() {
    if (!connected || !publicKey) { setVisible(true); return; }
    if (!signTransaction || !epochState) return;
    // Bug 2: guard against re-entry while already claiming
    if (claiming) return;

    setClaiming(true);
    // Bug 3: clear ALL previous messages before each new attempt
    setTxStatus(null);
    setTxIsError(false);

    try {
      const connection = new Connection(RPC_ENDPOINT, 'confirmed');
      const provider = new AnchorProvider(
        connection,
        {
          publicKey,
          signTransaction,
          // Bug 2: properly implement signAllTransactions to avoid silent no-sign on some paths
          signAllTransactions: async (txs: Transaction[]) =>
            Promise.all(txs.map((tx) => signTransaction(tx))),
        } as never,
        { commitment: 'confirmed' }
      );
      const program = new Program(IDL as unknown as Idl, provider);

      const [epochStatePDA] = PublicKey.findProgramAddressSync([Buffer.from(EPOCH_STATE_SEED)], PROGRAM_ID);
      const [claimantRecordPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(MASTER_RECORD_SEED), publicKey.toBuffer()],
        PROGRAM_ID
      );
      const noMaster = epochState.currentMaster === NULL_PUBLIC_KEY;
      const outgoingMasterRecord = noMaster
        ? claimantRecordPDA
        : PublicKey.findProgramAddressSync(
            [Buffer.from(MASTER_RECORD_SEED), new PublicKey(epochState.currentMaster).toBuffer()],
            PROGRAM_ID
          )[0];

      // Bug 2: use .instruction() + manual sign/send to avoid relying on Anchor's
      // internal sendAndConfirm state, which can get stuck after a failed tx
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ix = await (program.methods as any).claimMaster()
        .accounts({
          epochState: epochStatePDA,
          claimantRecord: claimantRecordPDA,
          outgoingMasterRecord,
          claimant: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction();
      tx.add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const signedTx = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

      setTxStatus(`Claimed! tx: ${sig.slice(0, 8)}...`);
      setTxIsError(false);
      // Bug 5: immediately refresh state instead of waiting for the next 5-second poll
      onRefresh();
    } catch (e: unknown) {
      // Reset button state first so it's immediately retryable, then show error
      setClaiming(false);
      setTxIsError(true);
      setTxStatus(getErrorMessage(e));
    } finally {
      setClaiming(false);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border-dim bg-bg-card p-8 animate-pulse">
        <div className="h-6 bg-border-dim rounded w-1/3 mb-4" />
        <div className="h-12 bg-border-dim rounded w-2/3 mb-6" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-20 bg-border-dim rounded" />
          <div className="h-20 bg-border-dim rounded" />
        </div>
      </div>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-lg border border-border-bright/40 bg-bg-card shadow-purple-sm">
      <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-purple-glow to-transparent" />

      <div className="scanlines relative p-6 sm:p-8">
        {/* Epoch label */}
        <div className="flex items-center gap-2 mb-6">
          <div className="h-px flex-1 bg-gradient-to-r from-purple-glow/50 to-transparent" />
          <span className="font-orbitron text-[10px] tracking-[0.3em] text-white uppercase">
            Epoch {(!epochState || epochState.currentMaster === NULL_PUBLIC_KEY)
              ? (epochInfo?.currentEpoch ?? '')
              : (epochState.gameEpoch)}
          </span>
          <div className="h-px flex-1 bg-gradient-to-l from-purple-glow/50 to-transparent" />
        </div>

        {/* Master display */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="text-gold-mid text-xl" style={{ filter: 'drop-shadow(0 0 8px rgba(251,191,36,0.8))' }}>&#9812;</span>
            <span
              className="font-orbitron text-xs tracking-[0.25em] uppercase"
              style={{
                color: '#fbbf24',
                textShadow: '0 0 12px rgba(251,191,36,0.9), 0 0 24px rgba(251,191,36,0.5), 0 0 40px rgba(192,132,252,0.4)',
              }}
            >
              Current Master
            </span>
          </div>

          {hasNoMaster ? (
            <div className="mt-2">
              <p className="font-orbitron text-2xl sm:text-3xl font-bold text-text-dim tracking-widest">
                — NONE —
              </p>
              <p className="text-xs text-text-dim font-mono mt-1">
                {gameNotStarted ? 'Game has not started' : 'No master yet this epoch'}
              </p>
            </div>
          ) : (
            <div className="mt-2">
              {/* Nickname (if set) */}
              {masterNickname && masterNickname !== 'Anonymous' && (
                <p className="font-orbitron text-lg sm:text-xl font-bold tracking-widest mb-0.5"
                   style={{ color: '#fbbf24', textShadow: '0 0 20px rgba(251,191,36,0.5)' }}>
                  {masterNickname}
                </p>
              )}
              {/* Address + share button inline */}
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <p className="font-mono text-base sm:text-xl font-bold tracking-wider animate-flicker"
                   style={{ color: masterNickname !== 'Anonymous' ? 'rgba(251,191,36,0.65)' : '#fbbf24',
                            textShadow: '0 0 15px rgba(251,191,36,0.35)' }}>
                  {formatAddress(epochState!.currentMaster, 6)}
                </p>
                <ShareButton masterDisplay={masterDisplay} />
              </div>
              {/* Bug 4: stop "Reigning for" timer once epoch is over */}
              <p className="text-xs text-gold-mid/50 font-mono mt-1">
                {isEpochOver ? 'Final reign:' : 'Reigning for'} {formatDuration(reignSeconds)}
              </p>
            </div>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="rounded border border-border-dim bg-bg-primary/50 p-4 text-center">
            <p className="font-orbitron text-[9px] tracking-[0.25em] text-white/70 uppercase mb-2">
              Time Remaining
            </p>
            {isEpochOver ? (
              <p className="font-orbitron text-lg font-bold text-red-400 tracking-widest">EPOCH OVER</p>
            ) : gameNotStarted ? (
              <p className="font-orbitron text-sm font-bold text-text-dim tracking-wider">NOT STARTED</p>
            ) : (
              <p className="font-orbitron text-xl sm:text-2xl font-bold tabular-nums"
                 style={{ color: '#00ff88', textShadow: '0 0 15px rgba(0,255,136,0.4)' }}>
                {formatDuration(countdown)}
              </p>
            )}
            {epochInfo && !isEpochOver && (
              <p className="text-[9px] font-mono text-text-dim mt-1">
                Epoch #{epochInfo.currentEpoch} · {Math.round((epochInfo.slotIndex / epochInfo.slotsInEpoch) * 100)}% complete
              </p>
            )}
          </div>

          <div className="rounded border border-border-dim bg-bg-primary/50 p-4 text-center">
            <p className="font-orbitron text-[9px] tracking-[0.25em] text-white/70 uppercase mb-2">
              Epoch Pot
            </p>
            <p className="font-orbitron text-xl sm:text-2xl font-bold"
               style={{ color: '#fbbf24', textShadow: '0 0 15px rgba(251,191,36,0.4)' }}>
              {epochState ? formatXnt(epochState.pot) : '0.00'}
            </p>
            <p className="text-[9px] font-mono text-gold-mid/50 mt-1">XNT</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          {/* Become Master */}
          <button
            onClick={handleClaim}
            disabled={claiming || isCurrentMaster === true || isEpochOver || isClosed}
            className="relative group w-full font-orbitron font-bold text-sm tracking-widest uppercase px-8 py-4 rounded border border-purple-glow bg-purple-mid/20 text-purple-light hover:bg-purple-mid/40 hover:shadow-purple-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="absolute inset-0 rounded border border-purple-light/0 group-hover:border-purple-light/20 transition-all" />
            {claiming ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-purple-light/40 border-t-purple-light rounded-full animate-spin inline-block" />
                Broadcasting...
              </span>
            ) : isCurrentMaster ? (
              '⚡ You Are The Master'
            ) : isEpochOver || isClosed ? (
              '⚔ Become Master (Epoch Ended)'
            ) : (
              '⚔ BECOME MASTER'
            )}
          </button>

          {/* Close Epoch — always visible */}
          <CloseEpochButton
            epochState={epochState}
            isEpochOver={isEpochOver}
            isClosed={isClosed}
            onRefresh={onRefresh}
          />

          {/* Hint text */}
          {!connected && !isEpochOver && (
            <p className="text-xs text-text-dim font-mono text-center">
              Connect wallet to claim
            </p>
          )}
          {txStatus && (
            <p className={`text-xs font-mono text-center ${txIsError ? 'text-red-400' : 'text-neon-dim'}`}>
              {txStatus}
            </p>
          )}
        </div>
      </div>

      <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-purple-glow/30 to-transparent" />
    </section>
  );
}
