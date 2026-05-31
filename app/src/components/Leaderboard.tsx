import { LeaderboardEntry, EpochStateData } from '../hooks/useEpochState';
import { formatAddress, formatReignTime } from '../utils/format';
import { useNicknames } from '../context/NicknameContext';
import { NULL_PUBLIC_KEY } from '../constants';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  isLoading: boolean;
  epochState: EpochStateData | null;
  isEpochOver: boolean;
  computedWinner: string | null;
}

const RANK_COLORS = ['#fbbf24', '#94a3b8', '#c2956c', '#7c3aed', '#7c3aed'];
const RANK_LABELS = ['#1', '#2', '#3', '#4', '#5'];

function ReignBar({ percent }: { percent: number }) {
  return (
    <div className="w-full h-1 bg-border-dim rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${Math.max(2, percent)}%`,
          background: 'linear-gradient(90deg, #7c3aed, #00ff88)',
          boxShadow: '0 0 8px rgba(0, 255, 136, 0.3)',
        }}
      />
    </div>
  );
}

export function Leaderboard({ entries, isLoading, epochState, isEpochOver, computedWinner }: LeaderboardProps) {
  const { getNickname } = useNicknames();
  const totalTime = entries.reduce((sum, e) => sum + e.reignTime, 0) || 1;

  // When epoch is over, the M badge belongs to the computed winner (mirrors close_epoch.rs).
  // During live play it belongs to the current master (entry.isCurrent).
  const masterBadgeWallet = isEpochOver && epochState
    ? (computedWinner ?? (epochState.leadingMaster !== NULL_PUBLIC_KEY
        ? epochState.leadingMaster
        : epochState.currentMaster))
    : null; // null → use entry.isCurrent (live play)

  return (
    <section className="rounded-lg border border-border-dim bg-bg-card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border-dim flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-orbitron text-xs tracking-[0.2em] text-purple-light uppercase">
            Epoch Leaderboard
          </span>
          <span className="text-[9px] font-mono text-text-dim bg-border-dim px-2 py-0.5 rounded">
            By Reign Time
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-neon animate-pulse inline-block" />
          <span className="text-[9px] font-mono text-neon-dim">LIVE</span>
        </div>
      </div>

      {/* Column headers */}
      <div className="px-6 py-2 grid grid-cols-12 gap-2 border-b border-border-dim/40">
        <span className="col-span-1 font-orbitron text-[9px] tracking-wider text-white uppercase">Rank</span>
        <span className="col-span-3 font-orbitron text-[9px] tracking-wider text-white uppercase">Name</span>
        <span className="col-span-3 font-orbitron text-[9px] tracking-wider text-white uppercase">Wallet</span>
        <span className="col-span-3 font-orbitron text-[9px] tracking-wider text-white uppercase text-right">Reign Time</span>
        <span className="col-span-2 font-orbitron text-[9px] tracking-wider text-white uppercase text-right">Dominance</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border-dim/30">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-6 py-3 animate-pulse">
              <div className="h-4 bg-border-dim rounded w-full" />
            </div>
          ))
        ) : entries.length === 0 ? (
          <div className="px-6 py-8 text-center text-text-dim font-mono text-sm">
            No claims recorded yet
          </div>
        ) : (
          entries.map((entry, idx) => {
            const percent = (entry.reignTime / totalTime) * 100;
            const rankColor = RANK_COLORS[idx] ?? '#7c3aed';
            const nickname = getNickname(entry.wallet);
            const isAnon = nickname === 'Anonymous';
            // Which wallet gets the MASTER badge + row highlight this render
            const showMaster = masterBadgeWallet !== null
              ? entry.wallet === masterBadgeWallet
              : entry.isCurrent;
            return (
              <div
                key={entry.wallet}
                className={`px-6 py-3 grid grid-cols-12 gap-2 items-center transition-colors hover:bg-bg-card-hover ${showMaster ? 'bg-gold-bright/[0.03]' : ''}`}
              >
                {/* Rank */}
                <span
                  className="col-span-1 font-orbitron text-xs font-bold"
                  style={{ color: rankColor }}
                >
                  {RANK_LABELS[idx] ?? `#${idx + 1}`}
                </span>

                {/* Name */}
                <div className="col-span-3 min-w-0">
                  {isAnon ? (
                    <span className="font-mono text-[10px] text-text-dim/50 truncate">Anonymous</span>
                  ) : (
                    <span className="font-orbitron text-[9px] tracking-wider text-purple-light/80 truncate block leading-tight">
                      {nickname}
                    </span>
                  )}
                </div>

                {/* Wallet */}
                <div className="col-span-3 flex items-center gap-1.5 min-w-0">
                  <span className="font-mono text-xs text-slate-400 tracking-wider truncate">
                    {formatAddress(entry.wallet, 4)}
                  </span>
                  {showMaster && (
                    <span
                      className="text-[9px] font-orbitron px-1.5 py-0.5 rounded border tracking-wider shrink-0"
                      style={{ color: '#fbbf24', borderColor: 'rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.05)' }}
                    >
                      M
                    </span>
                  )}
                </div>

                {/* Reign time */}
                <span
                  className="col-span-3 font-mono text-xs text-right"
                  style={{ color: '#00ff88', textShadow: '0 0 8px rgba(0,255,136,0.3)' }}
                >
                  {formatReignTime(entry.reignTime)}
                </span>

                {/* Share */}
                <div className="col-span-2 text-right">
                  <span className="font-mono text-xs text-text-dim">
                    {percent.toFixed(1)}%
                  </span>
                </div>

                {/* Progress bar (full width, below row) */}
                <div className="col-span-12 -mt-1">
                  <ReignBar percent={percent} />
                </div>
              </div>
            );
          })
        )}
      </div>

    </section>
  );
}
