import { useEffect, useState, useCallback, useRef } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { BorshAccountsCoder, BN, Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
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
  leaderboard: LeaderboardEntry[];
  computedWinner: string | null;
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
  treasury: '4V2JhdSG2EL9GAv4wU59KsHsxCk3UhWxuTfnrVieYYet',
  gameId: 3,
};

const MOCK_EPOCH_INFO: EpochInfo = {
  secondsRemaining: 13 * 3600 + 24 * 60 + 18,
  isOver: false,
  slotIndex: 150234,
  slotsInEpoch: 432000,
  currentEpoch: 42,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CODER = new BorshAccountsCoder(IDL as unknown as any);

function makeReadProgram(connection: Connection): Program {
  const dummyWallet = {
    publicKey: new PublicKey('11111111111111111111111111111111'),
    signTransaction: async (t: unknown) => t as never,
    signAllTransactions: async (ts: unknown[]) => ts as never[],
  };
  const provider = new AnchorProvider(connection, dummyWallet as never, { commitment: 'confirmed' });
  return new Program(IDL as unknown as Idl, provider);
}

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

async function fetchMasterRecords(
  connection: Connection,
  state: EpochStateData,
  isOver: boolean,
  epochStartTs: number | null,
): Promise<{ entries: LeaderboardEntry[]; computedWinner: string | null }> {
  const program = makeReadProgram(connection);

  // Fetch all MasterRecord accounts and filter client-side to avoid byte-offset
  // errors in the memcmp filter that caused records to be silently dropped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRecords: any[] = await (program.account as any).masterRecord.all();

  const now = Math.floor(Date.now() / 1000);
  const entries: LeaderboardEntry[] = [];
  let computedWinner: string | null = null;

  for (const { account } of allRecords) {
    console.log('[MOTE] record gameId:', account.gameId.toString(), 'current:', state.gameId.toString(), 'match:', account.gameId.toString() === state.gameId.toString());
    if (account.gameId.toString() !== state.gameId.toString()) continue;
    const owner = (account.owner as PublicKey).toString();
    const stored = (account.totalReignTime as BN).toNumber();
    const isCurrent = owner === state.currentMaster && state.currentMaster !== NULL_PUBLIC_KEY;
    // When the epoch is over, freeze all times at their stored on-chain values only.
    // The current master's final reign will be committed by close_epoch; until then
    // we show the already-committed totals so no entry keeps ticking.
    const ongoing = isCurrent && !isOver ? Math.max(0, now - state.masterSince) : 0;
    const reignTime = stored + ongoing;
    if (reignTime > 0) entries.push({ wallet: owner, reignTime, isCurrent });

    // Mirror close_epoch.rs winner logic exactly when epoch is over
    if (isOver && isCurrent && epochStartTs !== null) {
      const reignEnd = Math.max(epochStartTs, state.masterSince);
      const finalReign = Math.max(0, reignEnd - state.masterSince);
      const finalMasterTotal = stored + finalReign;
      computedWinner = finalMasterTotal >= state.leadingMasterTime
        ? state.currentMaster
        : (state.leadingMaster !== NULL_PUBLIC_KEY ? state.leadingMaster : state.currentMaster);
    }
  }

  // Fallback when epoch is over but winner couldn't be computed (missing record or timestamp)
  if (isOver && computedWinner === null) {
    computedWinner = state.currentMaster === NULL_PUBLIC_KEY
      ? (state.leadingMaster !== NULL_PUBLIC_KEY ? state.leadingMaster : null)
      : (state.leadingMaster !== NULL_PUBLIC_KEY ? state.leadingMaster : state.currentMaster);
  }

  return { entries: entries.sort((a, b) => b.reignTime - a.reignTime), computedWinner };
}

export function useEpochState(): UseEpochStateReturn {
  const [epochState, setEpochState] = useState<EpochStateData | null>(null);
  const [epochInfo, setEpochInfo] = useState<EpochInfo | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [computedWinner, setComputedWinner] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const connectionRef = useRef<Connection | null>(null);
  const usingMockRef = useRef(false);

  const fetchState = useCallback(async () => {
    if (!connectionRef.current) {
      connectionRef.current = new Connection(RPC_ENDPOINT, 'confirmed');
    }
    const connection = connectionRef.current;

    // Phase 1: network reachability check
    let netEpochInfo: Awaited<ReturnType<Connection['getEpochInfo']>>;
    try {
      netEpochInfo = await connection.getEpochInfo();
    } catch (networkErr) {
      console.error('[MOTE] RPC unreachable:', networkErr);
      if (!usingMockRef.current) {
        setEpochState(MOCK_STATE);
        setEpochInfo(MOCK_EPOCH_INFO);
        setLeaderboard([]);
        usingMockRef.current = true;
      }
      setError('Using mock data — RPC unavailable');
      setIsLoading(false);
      return;
    }

    // Phase 2: fetch epoch_state PDA account
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
      usingMockRef.current = false;
      setEpochState(null);
      setLeaderboard([]);
      setComputedWinner(null);
      setEpochInfo({
        secondsRemaining: null,
        isOver: false,
        slotIndex: netEpochInfo.slotIndex,
        slotsInEpoch: netEpochInfo.slotsInEpoch,
        currentEpoch: netEpochInfo.epoch,
      });
      // Bug 8: don't surface the "not initialized" message as a visible error banner
      setError(null);
      setIsLoading(false);
      return;
    }

    // Phase 3: decode epoch state
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

      // Phase 4: fetch epoch start timestamp for winner computation when epoch is over
      let epochStartTs: number | null = null;
      if (isOver && state.currentMaster !== NULL_PUBLIC_KEY) {
        try {
          const epochStartSlot = netEpochInfo.absoluteSlot - netEpochInfo.slotIndex;
          const ts = await connection.getBlockTime(epochStartSlot);
          epochStartTs = ts !== null
            ? ts
            : Math.floor(Date.now() / 1000) - Math.floor(netEpochInfo.slotIndex * AVG_SLOT_MS / 1000);
        } catch {
          // epochStartTs remains null; winner computation falls back to leadingMaster
        }
      }

      // Phase 5: fetch real leaderboard from MasterRecord PDAs
      try {
        const { entries, computedWinner: winner } = await fetchMasterRecords(connection, state, isOver, epochStartTs);
        setLeaderboard(entries);
        setComputedWinner(winner);
      } catch (lbErr) {
        console.error('[MOTE] leaderboard fetch error:', lbErr);
        setLeaderboard([]);
        setComputedWinner(null);
      }
    } catch (decodeErr) {
      console.error('[MOTE] account decode error:', decodeErr);
      const msg = decodeErr instanceof Error ? decodeErr.message.slice(0, 80) : String(decodeErr);
      setError(`Decode error: ${msg}`);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, 5000);
    return () => clearInterval(id);
  }, [fetchState]);

  return { epochState, epochInfo, leaderboard, computedWinner, isLoading, error, refresh: fetchState };
}

export function computeClaimCost(nextClaimCostLamports: number): number {
  return nextClaimCostLamports / LAMPORTS_PER_XNT;
}

export function computeClaimsCount(nextClaimCostLamports: number): number {
  const base = BASE_CLAIM_COST_XNT * LAMPORTS_PER_XNT;
  if (nextClaimCostLamports <= base) return 0;
  return Math.round((nextClaimCostLamports - base) / base);
}
