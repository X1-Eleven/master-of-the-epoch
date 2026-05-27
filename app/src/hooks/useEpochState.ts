import { useEffect, useState, useCallback, useRef } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { BorshAccountsCoder, BN } from '@coral-xyz/anchor';
import { IDL } from '../idl';
import {
  PROGRAM_ID,
  RPC_ENDPOINT,
  EPOCH_STATE_SEED,
  NULL_PUBLIC_KEY,
  AVG_SLOT_MS,
  LAMPORTS_PER_XNT,
  BASE_CLAIM_COST_XNT,
} from '../constants';

export interface EpochStateData {
  currentMaster: string;
  masterSince: number;
  leadingMaster: string;
  leadingMasterTime: number;
  gameEpoch: number;
  pot: number;
  nextClaimCost: number;
  closed: boolean;
  treasury: string;
  gameId: number;
}

export interface LeaderboardEntry {
  wallet: string;
  reignTime: number;
  isCurrent: boolean;
}

export interface EpochInfo {
  secondsRemaining: number | null;
  isOver: boolean;
  slotIndex: number;
  slotsInEpoch: number;
  currentEpoch: number;
}

export interface UseEpochStateReturn {
  epochState: EpochStateData | null;
  epochInfo: EpochInfo | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

const MOCK_STATE: EpochStateData = {
  currentMaster: '7xKpM3AQn4FqRtY8HzWsL2bNc6dVeXpUoKjMiTrEwFg',
  masterSince: Math.floor(Date.now() / 1000) - 5432,
  leadingMaster: '7xKpM3AQn4FqRtY8HzWsL2bNc6dVeXpUoKjMiTrEwFg',
  leadingMasterTime: 9252,
  gameEpoch: 42,
  pot: 247.5 * LAMPORTS_PER_XNT,
  nextClaimCost: 30 * LAMPORTS_PER_XNT,
  closed: false,
  treasury: 'A2jXmCFBXzLPMhAfF5N3nR8sYtVkG6eQcD4iHbWuEpTz',
  gameId: 3,
};

const MOCK_EPOCH_INFO: EpochInfo = {
  secondsRemaining: 13 * 3600 + 24 * 60 + 18,
  isOver: false,
  slotIndex: 150234,
  slotsInEpoch: 432000,
  currentEpoch: 42,
};

// Stable coder instance (IDL is static)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CODER = new BorshAccountsCoder(IDL as unknown as any);

function decodeEpochState(data: Buffer): EpochStateData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = CODER.decode<any>('epochState', data);
  return {
    currentMaster: (raw.currentMaster as PublicKey).toString(),
    masterSince: (raw.masterSince as BN).toNumber(),
    leadingMaster: (raw.leadingMaster as PublicKey).toString(),
    leadingMasterTime: (raw.leadingMasterTime as BN).toNumber(),
    gameEpoch: (raw.gameEpoch as BN).toNumber(),
    pot: (raw.pot as BN).toNumber(),
    nextClaimCost: (raw.nextClaimCost as BN).toNumber(),
    closed: raw.closed as boolean,
    treasury: (raw.treasury as PublicKey).toString(),
    gameId: (raw.gameId as BN).toNumber(),
  };
}

export function useEpochState(): UseEpochStateReturn {
  const [epochState, setEpochState] = useState<EpochStateData | null>(null);
  const [epochInfo, setEpochInfo] = useState<EpochInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const connectionRef = useRef<Connection | null>(null);
  // Track whether we have already loaded mock data (avoid flicker on retries)
  const usingMockRef = useRef(false);

  // fetchState is stable (no state deps) — the interval never resets
  const fetchState = useCallback(async () => {
    if (!connectionRef.current) {
      connectionRef.current = new Connection(RPC_ENDPOINT, 'confirmed');
    }
    const connection = connectionRef.current;

    // Phase 1: network reachability check via getEpochInfo
    let netEpochInfo: Awaited<ReturnType<Connection['getEpochInfo']>>;
    try {
      netEpochInfo = await connection.getEpochInfo();
    } catch (networkErr) {
      console.error('[MOTE] RPC unreachable:', networkErr);
      if (!usingMockRef.current) {
        setEpochState(MOCK_STATE);
        setEpochInfo(MOCK_EPOCH_INFO);
        usingMockRef.current = true;
      }
      setError('Using mock data — RPC unavailable');
      setIsLoading(false);
      return;
    }

    // Phase 2: fetch the epoch_state PDA account
    const [epochStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from(EPOCH_STATE_SEED)],
      PROGRAM_ID
    );

    let accountInfo: Awaited<ReturnType<Connection['getAccountInfo']>>;
    try {
      accountInfo = await connection.getAccountInfo(epochStatePDA);
    } catch (fetchErr) {
      console.error('[MOTE] getAccountInfo failed:', fetchErr);
      const msg = fetchErr instanceof Error ? fetchErr.message.slice(0, 80) : String(fetchErr);
      setError(`RPC error: ${msg}`);
      setIsLoading(false);
      return;
    }

    if (!accountInfo) {
      // RPC is up but the account doesn't exist — initialize_epoch not yet called
      console.info('[MOTE] epoch_state PDA not found at', epochStatePDA.toString(), '— game not initialized');
      usingMockRef.current = false;
      setEpochState(null);
      setEpochInfo({
        secondsRemaining: null,
        isOver: false,
        slotIndex: netEpochInfo.slotIndex,
        slotsInEpoch: netEpochInfo.slotsInEpoch,
        currentEpoch: netEpochInfo.epoch,
      });
      setError('Game not yet initialized — call initialize_epoch to start the first epoch');
      setIsLoading(false);
      return;
    }

    // Phase 3: decode and apply
    try {
      const state = decodeEpochState(accountInfo.data as Buffer);
      const currentNetworkEpoch = netEpochInfo.epoch;
      const isOver = state.gameEpoch > 0 && currentNetworkEpoch > state.gameEpoch;
      const slotsRemaining = netEpochInfo.slotsInEpoch - netEpochInfo.slotIndex;
      const secondsRemaining = Math.round((slotsRemaining * AVG_SLOT_MS) / 1000);

      usingMockRef.current = false;
      setEpochState(state);
      setEpochInfo({
        secondsRemaining: isOver ? 0 : secondsRemaining,
        isOver,
        slotIndex: netEpochInfo.slotIndex,
        slotsInEpoch: netEpochInfo.slotsInEpoch,
        currentEpoch: currentNetworkEpoch,
      });
      setError(null);
    } catch (decodeErr) {
      console.error('[MOTE] account decode error:', decodeErr);
      const msg = decodeErr instanceof Error ? decodeErr.message.slice(0, 80) : String(decodeErr);
      setError(`Decode error: ${msg}`);
    }

    setIsLoading(false);
  }, []); // stable — no state deps, uses refs

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, 5000);
    return () => clearInterval(id);
  }, [fetchState]);

  return { epochState, epochInfo, isLoading, error, refresh: fetchState };
}

export function getMockLeaderboard(state: EpochStateData): LeaderboardEntry[] {
  const now = Math.floor(Date.now() / 1000);
  const currentOngoing = state.currentMaster !== NULL_PUBLIC_KEY
    ? now - state.masterSince
    : 0;

  if (state.currentMaster === NULL_PUBLIC_KEY) {
    return [
      { wallet: '7xKpM3AQn4FqRtY8HzWsL2bNc6dVeXpUoKjMiTrEwFg', reignTime: 9252, isCurrent: false },
      { wallet: '3mRtXQ7bPzNvKs4Y8dLhWc9eJfMnBrGiToAp1x6yUqE', reignTime: 4365, isCurrent: false },
      { wallet: '9pLztK2vRcQj7mXs5YeHnDwFaBiGkNuTy3oP8sL1bCx', reignTime: 2730, isCurrent: false },
    ];
  }

  return [
    { wallet: state.currentMaster, reignTime: currentOngoing, isCurrent: true },
    {
      wallet: state.leadingMaster !== state.currentMaster
        ? state.leadingMaster
        : '3mRtXQ7bPzNvKs4Y8dLhWc9eJfMnBrGiToAp1x6yUqE',
      reignTime: state.leadingMasterTime,
      isCurrent: false,
    },
    { wallet: '9pLztK2vRcQj7mXs5YeHnDwFaBiGkNuTy3oP8sL1bCx', reignTime: 2730, isCurrent: false },
    { wallet: 'Bj2nL5xWqKm8RsDfPtCvYz4eHoNaUiGj7yTrFpXcB3A', reignTime: 1200, isCurrent: false },
    { wallet: 'Fq8sTv2pYmXjKcNwA5dReLhBgZoWiUn9s3PkFtEy1C7', reignTime: 540, isCurrent: false },
  ].sort((a, b) => b.reignTime - a.reignTime) as LeaderboardEntry[];
}

export function computeClaimCost(nextClaimCostLamports: number): number {
  return nextClaimCostLamports / LAMPORTS_PER_XNT;
}

export function computeClaimsCount(nextClaimCostLamports: number): number {
  const base = BASE_CLAIM_COST_XNT * LAMPORTS_PER_XNT;
  if (nextClaimCostLamports <= base) return 0;
  return Math.round((nextClaimCostLamports - base) / base);
}
