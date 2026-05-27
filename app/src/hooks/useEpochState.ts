import { useEffect, useState, useCallback, useRef } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Idl, BN } from '@coral-xyz/anchor';
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

export function useEpochState(): UseEpochStateReturn {
  const [epochState, setEpochState] = useState<EpochStateData | null>(null);
  const [epochInfo, setEpochInfo] = useState<EpochInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const connectionRef = useRef<Connection | null>(null);

  const fetchState = useCallback(async () => {
    try {
      if (!connectionRef.current) {
        connectionRef.current = new Connection(RPC_ENDPOINT, 'confirmed');
      }
      const connection = connectionRef.current;

      const [epochStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(EPOCH_STATE_SEED)],
        PROGRAM_ID
      );

      // Use a read-only provider (no wallet needed for reads)
      const provider = new AnchorProvider(
        connection,
        { publicKey: PublicKey.default } as never,
        { commitment: 'confirmed' }
      );
      const program = new Program(IDL as unknown as Idl, provider);

      const [stateRaw, netEpochInfo] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (program.account as any).epochState.fetch(epochStatePDA),
        connection.getEpochInfo(),
      ]);

      const state: EpochStateData = {
        currentMaster: (stateRaw.currentMaster as PublicKey).toString(),
        masterSince: (stateRaw.masterSince as BN).toNumber(),
        leadingMaster: (stateRaw.leadingMaster as PublicKey).toString(),
        leadingMasterTime: (stateRaw.leadingMasterTime as BN).toNumber(),
        gameEpoch: (stateRaw.gameEpoch as BN).toNumber(),
        pot: (stateRaw.pot as BN).toNumber(),
        nextClaimCost: (stateRaw.nextClaimCost as BN).toNumber(),
        closed: stateRaw.closed as boolean,
        treasury: (stateRaw.treasury as PublicKey).toString(),
        gameId: (stateRaw.gameId as BN).toNumber(),
      };

      const currentNetworkEpoch = netEpochInfo.epoch;
      const isOver =
        state.gameEpoch > 0 && currentNetworkEpoch > state.gameEpoch;

      const slotsRemaining = netEpochInfo.slotsInEpoch - netEpochInfo.slotIndex;
      const secondsRemaining = Math.round((slotsRemaining * AVG_SLOT_MS) / 1000);

      setEpochState(state);
      setEpochInfo({
        secondsRemaining: isOver ? 0 : secondsRemaining,
        isOver,
        slotIndex: netEpochInfo.slotIndex,
        slotsInEpoch: netEpochInfo.slotsInEpoch,
        currentEpoch: currentNetworkEpoch,
      });
      setError(null);
    } catch (e) {
      // Fall back to mock data so the UI always renders
      if (!epochState) {
        setEpochState(MOCK_STATE);
        setEpochInfo(MOCK_EPOCH_INFO);
      }
      setError('Using mock data — RPC unavailable');
    } finally {
      setIsLoading(false);
    }
  }, [epochState]);

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
    { wallet: state.leadingMaster !== state.currentMaster ? state.leadingMaster : '3mRtXQ7bPzNvKs4Y8dLhWc9eJfMnBrGiToAp1x6yUqE', reignTime: state.leadingMasterTime, isCurrent: false },
    { wallet: '9pLztK2vRcQj7mXs5YeHnDwFaBiGkNuTy3oP8sL1bCx', reignTime: 2730, isCurrent: false },
    { wallet: 'Bj2nL5xWqKm8RsDfPtCvYz4eHoNaUiGj7yTrFpXcB3A', reignTime: 1200, isCurrent: false },
    { wallet: 'Fq8sTv2pYmXjKcNwA5dReLhBgZoWiUn9s3PkFtEy1C7', reignTime: 540, isCurrent: false },
  ].sort((a, b) => b.reignTime - a.reignTime).map((e, i) => ({ ...e, rank: i + 1 })) as LeaderboardEntry[];
}

export function computeClaimCost(nextClaimCostLamports: number): number {
  return nextClaimCostLamports / LAMPORTS_PER_XNT;
}

export function computeClaimsCount(nextClaimCostLamports: number): number {
  const base = BASE_CLAIM_COST_XNT * LAMPORTS_PER_XNT;
  if (nextClaimCostLamports <= base) return 0;
  return Math.round((nextClaimCostLamports - base) / base);
}
