import { LAMPORTS_PER_XNT } from '../constants';

interface LiveStatsBarProps {
  pot: number;
  claimCost: number;
  claimsCount: number;
  historicalBurnXnt: number;
  isLoading: boolean;
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: 'green' | 'purple' | 'gold';
}

function StatCard({ label, value, sub, color = 'green' }: StatCardProps) {
  const colorMap = {
    green:  { text: '#00ff88', shadow: 'rgba(0,255,136,0.3)',  border: 'rgba(0,255,136,0.15)' },
    purple: { text: '#c084fc', shadow: 'rgba(147,51,234,0.3)', border: 'rgba(147,51,234,0.15)' },
    gold:   { text: '#fbbf24', shadow: 'rgba(251,191,36,0.3)', border: 'rgba(251,191,36,0.15)' },
  };
  const c = colorMap[color];

  return (
    <div
      className="flex-1 rounded border bg-bg-primary/40 p-4 text-center transition-all hover:bg-bg-card-hover"
      style={{ borderColor: c.border }}
    >
      <p className="font-orbitron text-[9px] tracking-[0.3em] text-white/70 uppercase mb-2">{label}</p>
      <p
        className="font-orbitron text-lg sm:text-xl font-bold tabular-nums"
        style={{ color: c.text, textShadow: `0 0 14px ${c.shadow}` }}
      >
        {value}
      </p>
      {sub && <p className="text-[9px] font-mono mt-1" style={{ color: c.text, opacity: 0.5 }}>{sub}</p>}
    </div>
  );
}

interface BurnCardProps {
  epochBurnXnt: number;
  historicalBurnXnt: number;
}

function BurnCard({ epochBurnXnt, historicalBurnXnt }: BurnCardProps) {
  const color = '#00ff88';
  const shadow = 'rgba(0,255,136,0.3)';
  const border = 'rgba(0,255,136,0.15)';

  return (
    <div
      className="flex-1 rounded border bg-bg-primary/40 p-4 text-center transition-all hover:bg-bg-card-hover"
      style={{ borderColor: border }}
    >
      <p className="font-orbitron text-[9px] tracking-[0.3em] text-white/70 uppercase mb-2">
        XNT Burned (est.)
      </p>
      <div className="flex items-start justify-center gap-4">
        {/* Epoch burn */}
        <div className="flex-1 text-center">
          <p
            className="font-orbitron text-lg sm:text-xl font-bold tabular-nums"
            style={{ color, textShadow: `0 0 14px ${shadow}` }}
          >
            {epochBurnXnt.toFixed(2)}
          </p>
          <p className="text-[9px] font-mono mt-0.5" style={{ color, opacity: 0.5 }}>
            XNT at epoch close
          </p>
        </div>
        {/* Divider */}
        <div className="w-px self-stretch bg-border-dim/40 mt-0.5" />
        {/* Historical burn */}
        <div className="flex-1 text-center">
          <p
            className="font-orbitron text-lg sm:text-xl font-bold tabular-nums"
            style={{ color, textShadow: `0 0 14px ${shadow}` }}
          >
            {historicalBurnXnt.toFixed(2)}
          </p>
          <p className="text-[9px] font-mono mt-0.5" style={{ color, opacity: 0.5 }}>
            XNT Historical
          </p>
        </div>
      </div>
    </div>
  );
}

export function LiveStatsBar({ pot, claimCost, claimsCount, historicalBurnXnt, isLoading }: LiveStatsBarProps) {
  const estimatedBurnXnt = (pot / LAMPORTS_PER_XNT) * 0.15;

  if (isLoading) {
    return (
      <div className="flex gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex-1 h-20 rounded border border-border-dim bg-bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-neon animate-pulse inline-block" />
        <span className="font-orbitron text-[9px] tracking-[0.3em] text-white uppercase">
          Live Stats
        </span>
      </div>
      <div className="flex gap-3">
        <BurnCard epochBurnXnt={estimatedBurnXnt} historicalBurnXnt={historicalBurnXnt} />
        <StatCard
          label="Next Master Cost"
          value={`${claimCost.toFixed(0)} XNT`}
          sub="+2 XNT per takeover"
          color="purple"
        />
        <StatCard
          label="Epoch Takeovers"
          value={String(claimsCount)}
          sub="total takeovers"
          color="gold"
        />
      </div>
    </section>
  );
}
