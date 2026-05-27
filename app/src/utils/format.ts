import { LAMPORTS_PER_XNT } from '../constants';

export function formatAddress(addr: string, chars = 4): string {
  if (!addr || addr.length < chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

export function lamportsToXnt(lamports: number): number {
  return lamports / LAMPORTS_PER_XNT;
}

export function formatXnt(lamports: number, decimals = 2): string {
  const xnt = lamportsToXnt(lamports);
  return xnt.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export function formatReignTime(seconds: number): string {
  if (seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function claimsFromCost(nextClaimCostLamports: number): number {
  const BASE = 5 * LAMPORTS_PER_XNT;
  const cost = nextClaimCostLamports;
  if (cost <= BASE) return 0;
  return Math.round((cost - BASE) / BASE);
}
