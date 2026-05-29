import { formatAddress } from '../utils/format';
import { useNicknames } from '../context/NicknameContext';

interface HallEntry {
  wallet: string;
  epochsWon: number;
  totalXntWon: number;
  totalXntBurned: number;
}

const MOCK_HALL: HallEntry[] = [
  { wallet: '7xKpM3AQn4FqRtY8HzWsL2bNc6dVeXpUoKjMiTrEwFg', epochsWon: 5, totalXntWon: 1250.5, totalXntBurned: 521.0 },
  { wallet: '3mRtXQ7bPzNvKs4Y8dLhWc9eJfMnBrGiToAp1x6yUqE', epochsWon: 3, totalXntWon: 780.0,  totalXntBurned: 325.0 },
  { wallet: 'Bj2nL5xWqKm8RsDfPtCvYz4eHoNaUiGj7yTrFpXcB3A', epochsWon: 2, totalXntWon: 420.75, totalXntBurned: 175.3 },
  { wallet: 'Fq8sTv2pYmXjKcNwA5dReLhBgZoWiUn9s3PkFtEy1C7', epochsWon: 1, totalXntWon: 210.0,  totalXntBurned: 87.5  },
  { wallet: '9pLztK2vRcQj7mXs5YeHnDwFaBiGkNuTy3oP8sL1bCx', epochsWon: 1, totalXntWon: 147.25, totalXntBurned: 61.4  },
];

const RANK_COLORS = ['#fbbf24', '#94a3b8', '#c2956c', '#7c3aed', '#7c3aed'];

export function HallOfMasters() {
  const { getNickname } = useNicknames();

  return (
    <section className="rounded-lg border border-border-dim bg-bg-card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border-dim flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-orbitron text-xs tracking-[0.2em] text-purple-light uppercase">
            Hall of Masters
          </span>
          <span className="text-[9px] font-mono text-text-dim bg-border-dim px-2 py-0.5 rounded">
            All Time
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono text-text-dim/50">MOCK DATA</span>
        </div>
      </div>

      {/* Column headers — 12 cols: 1 rank | 2 name | 3 wallet | 2 epochs | 2 burned | 2 won */}
      <div className="px-6 py-2 grid grid-cols-12 gap-2 border-b border-border-dim/40">
        <span className="col-span-1 font-orbitron text-[9px] tracking-wider text-white uppercase">Rank</span>
        <span className="col-span-2 font-orbitron text-[9px] tracking-wider text-white uppercase">Name</span>
        <span className="col-span-3 font-orbitron text-[9px] tracking-wider text-white uppercase">Wallet</span>
        <span className="col-span-2 font-orbitron text-[9px] tracking-wider text-white uppercase text-center">Epochs</span>
        <span className="col-span-2 font-orbitron text-[9px] tracking-wider text-white uppercase text-right">XNT Burned</span>
        <span className="col-span-2 font-orbitron text-[9px] tracking-wider text-white uppercase text-right">XNT Won</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border-dim/30">
        {MOCK_HALL.map((entry, idx) => {
          const nickname = getNickname(entry.wallet);
          const isAnon = nickname === 'Anonymous';
          const rankColor = RANK_COLORS[idx] ?? '#7c3aed';
          return (
            <div
              key={entry.wallet}
              className="px-6 py-3 grid grid-cols-12 gap-2 items-center transition-colors hover:bg-bg-card-hover"
            >
              {/* Rank */}
              <span className="col-span-1 font-orbitron text-xs font-bold" style={{ color: rankColor }}>
                #{idx + 1}
              </span>

              {/* Name */}
              <div className="col-span-2 min-w-0">
                {isAnon ? (
                  <span className="font-mono text-[10px] text-text-dim/50 truncate">Anon</span>
                ) : (
                  <span className="font-orbitron text-[9px] tracking-wider text-purple-light/80 truncate block leading-tight">
                    {nickname}
                  </span>
                )}
              </div>

              {/* Wallet */}
              <span className="col-span-3 font-mono text-xs text-slate-400 tracking-wider truncate">
                {formatAddress(entry.wallet, 4)}
              </span>

              {/* Epochs Won */}
              <div className="col-span-2 flex items-center justify-center gap-1">
                <span
                  className="font-orbitron text-xs font-bold"
                  style={{ color: '#fbbf24', textShadow: '0 0 8px rgba(251,191,36,0.3)' }}
                >
                  {entry.epochsWon}
                </span>
                <span className="font-mono text-[9px] text-text-dim/60">
                  {entry.epochsWon === 1 ? 'epoch' : 'epochs'}
                </span>
              </div>

              {/* XNT Burned */}
              <span
                className="col-span-2 font-mono text-xs text-right"
                style={{ color: '#00ff88', textShadow: '0 0 8px rgba(0,255,136,0.2)' }}
              >
                {entry.totalXntBurned.toFixed(1)}
              </span>

              {/* XNT Won */}
              <span className="col-span-2 font-mono text-xs text-right text-gold-bright/80">
                {entry.totalXntWon.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="px-6 py-2 border-t border-border-dim/40">
        <p className="text-[9px] font-mono text-text-dim">
          * Historical data will be indexed from on-chain events
        </p>
      </div>
    </section>
  );
}
