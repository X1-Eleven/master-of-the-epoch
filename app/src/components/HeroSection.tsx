import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import { IDL } from '../idl';
import { EpochStateData, EpochInfo } from '../hooks/useEpochState';
import { formatAddress, formatDuration, formatXnt } from '../utils/format';
import { PROGRAM_ID, RPC_ENDPOINT, EPOCH_STATE_SEED, MASTER_RECORD_SEED, NULL_PUBLIC_KEY } from '../constants';

interface HeroSectionProps {
  epochState: EpochStateData | null;
  epochInfo: EpochInfo | null;
  isLoading: boolean;
  claimCost: number;
  isEpochOver: boolean;
}

export function HeroSection({ epochState, epochInfo, isLoading, claimCost, isEpochOver }: HeroSectionProps) {
  const { connected, publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [countdown, setCountdown] = useState<number>(epochInfo?.secondsRemaining ?? 0);
  const [claiming, setClaiming] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // Live countdown ticker
  useEffect(() => {
    if (epochInfo?.secondsRemaining == null) return;
    setCountdown(epochInfo.secondsRemaining);
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [epochInfo?.secondsRemaining]);

  const hasNoMaster = !epochState || epochState.currentMaster === NULL_PUBLIC_KEY;
  const isCurrentMaster = connected && publicKey && epochState?.currentMaster === publicKey.toString();
  const gameNotStarted = epochState?.gameEpoch === 0;
  const reignSeconds = epochState && !hasNoMaster
    ? Math.max(0, Math.floor(Date.now() / 1000) - epochState.masterSince)
    : 0;

  async function handleClaim() {
    if (!connected || !publicKey || !signTransaction || !epochState) {
      setVisible(true);
      return;
    }
    setClaiming(true);
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = await (program.methods as any).claimMaster()
        .accounts({
          epochState: epochStatePDA,
          claimantRecord: claimantRecordPDA,
          outgoingMasterRecord,
          claimant: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setTxStatus(`Claimed! tx: ${tx.slice(0, 8)}...`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setTxStatus(`Error: ${msg.slice(0, 60)}`);
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
      {/* Top accent bar */}
      <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-purple-glow to-transparent" />

      <div className="scanlines relative p-6 sm:p-8">
        {/* Section label */}
        <div className="flex items-center gap-2 mb-6">
          <div className="h-px flex-1 bg-gradient-to-r from-purple-glow/50 to-transparent" />
          <span className="font-orbitron text-[10px] tracking-[0.3em] text-purple-light/60 uppercase">
            Current Epoch
          </span>
          <div className="h-px flex-1 bg-gradient-to-l from-purple-glow/50 to-transparent" />
        </div>

        {/* Master display */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="text-gold-mid text-xl">&#9812;</span>
            <span className="font-orbitron text-xs tracking-[0.25em] text-gold-mid/60 uppercase">
              Current Master
            </span>
          </div>

          {hasNoMaster ? (
            <div className="mt-2">
              <p className="font-orbitron text-2xl sm:text-3xl font-bold text-text-dim tracking-widest">
                — NONE —
              </p>
              <p className="text-xs text-text-dim font-mono mt-1">
                {gameNotStarted ? 'Game has not started' : 'No master yet'}
              </p>
            </div>
          ) : (
            <div className="mt-2">
              <p
                className="font-mono text-2xl sm:text-3xl font-bold tracking-wider animate-flicker"
                style={{ color: '#fbbf24', textShadow: '0 0 20px rgba(251, 191, 36, 0.5)' }}
              >
                {formatAddress(epochState!.currentMaster, 6)}
              </p>
              <p className="text-xs text-gold-mid/50 font-mono mt-1">
                Reigning for {formatDuration(reignSeconds)}
              </p>
            </div>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {/* Countdown */}
          <div className="rounded border border-border-dim bg-bg-primary/50 p-4 text-center">
            <p className="font-orbitron text-[9px] tracking-[0.25em] text-text-dim uppercase mb-2">
              Time Remaining
            </p>
            {isEpochOver ? (
              <p className="font-orbitron text-lg font-bold text-red-400 tracking-widest">
                EPOCH OVER
              </p>
            ) : gameNotStarted ? (
              <p className="font-orbitron text-sm font-bold text-text-dim tracking-wider">
                NOT STARTED
              </p>
            ) : (
              <p
                className="font-orbitron text-xl sm:text-2xl font-bold tabular-nums"
                style={{ color: '#00ff88', textShadow: '0 0 15px rgba(0, 255, 136, 0.4)' }}
              >
                {formatDuration(countdown)}
              </p>
            )}
            {epochInfo && !isEpochOver && (
              <p className="text-[9px] font-mono text-text-dim mt-1">
                Epoch #{epochInfo.currentEpoch} · {Math.round(epochInfo.slotIndex / epochInfo.slotsInEpoch * 100)}% complete
              </p>
            )}
          </div>

          {/* Pot */}
          <div className="rounded border border-border-dim bg-bg-primary/50 p-4 text-center">
            <p className="font-orbitron text-[9px] tracking-[0.25em] text-text-dim uppercase mb-2">
              Epoch Pot
            </p>
            <p
              className="font-orbitron text-xl sm:text-2xl font-bold"
              style={{ color: '#fbbf24', textShadow: '0 0 15px rgba(251, 191, 36, 0.4)' }}
            >
              {epochState ? formatXnt(epochState.pot) : '0.00'}
            </p>
            <p className="text-[9px] font-mono text-gold-mid/50 mt-1">XNT</p>
          </div>
        </div>

        {/* Claim button */}
        {!isEpochOver && (
          <div className="text-center">
            <button
              onClick={handleClaim}
              disabled={claiming || isCurrentMaster === true}
              className="relative group font-orbitron font-bold text-sm tracking-widest uppercase px-8 py-4 rounded border border-purple-glow bg-purple-mid/20 text-purple-light hover:bg-purple-mid/40 hover:shadow-purple-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed w-full sm:w-auto"
            >
              <span className="absolute inset-0 rounded border border-purple-light/0 group-hover:border-purple-light/20 transition-all" />
              {claiming ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-purple-light/40 border-t-purple-light rounded-full animate-spin inline-block" />
                  Broadcasting...
                </span>
              ) : isCurrentMaster ? (
                '⚡ You Are Master'
              ) : (
                `⚔ Become Master — ${claimCost} XNT`
              )}
            </button>

            {!connected && (
              <p className="text-xs text-text-dim font-mono mt-2">
                Connect wallet to claim
              </p>
            )}

            {txStatus && (
              <p className={`text-xs font-mono mt-2 ${txStatus.startsWith('Error') ? 'text-red-400' : 'text-neon-dim'}`}>
                {txStatus}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bottom accent */}
      <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-purple-glow/30 to-transparent" />
    </section>
  );
}
