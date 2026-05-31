import { useMemo, useState, useEffect, useRef, type FC, type ReactNode } from 'react';
import {
  ConnectionProvider as _ConnectionProvider,
  WalletProvider as _WalletProvider,
  useWallet,
} from '@solana/wallet-adapter-react';

import { RPC_ENDPOINT, LAMPORTS_PER_XNT } from './constants';
import { NicknameProvider, useNicknames, NICKNAME_STORAGE_KEY } from './context/NicknameContext';
import { WalletModalProvider } from './context/WalletModalContext';
import { useEpochState, computeClaimCost, computeClaimsCount } from './hooks/useEpochState';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { LiveStatsBar } from './components/LiveStatsBar';
import { Leaderboard } from './components/Leaderboard';
import { GameGuide } from './components/GameGuide';
import { NicknameModal } from './components/NicknameModal';
import { HallOfMasters } from './components/HallOfMasters';
import { Footer } from './components/Footer';
import { WalletSelectModal } from './components/WalletSelectModal';

// Cast providers to resolve @types/react version mismatches with wallet adapter
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ConnectionProvider = _ConnectionProvider as FC<{ children: ReactNode; endpoint: string; config?: any }>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WalletProvider = _WalletProvider as FC<{ children: ReactNode; wallets: any[]; autoConnect?: boolean }>;

function AppContent() {
  const { publicKey, connected } = useWallet();
  const { setNickname } = useNicknames();
  const { epochState, epochInfo, leaderboard, computedWinner, isLoading, error, refresh } = useEpochState();

  // Nickname modal state: null = closed, otherwise {address, initial}
  const [nicknameModal, setNicknameModal] = useState<{ address: string; initial: string } | null>(null);
  const promptedRef = useRef<string | null>(null);

  // Show nickname prompt on first wallet connection for this address
  useEffect(() => {
    if (!connected || !publicKey) return;
    const addr = publicKey.toString();
    if (promptedRef.current === addr) return;
    // Read localStorage directly to avoid stale closure issues
    const stored = localStorage.getItem(NICKNAME_STORAGE_KEY);
    const existing: Record<string, string> = stored ? JSON.parse(stored) : {};
    if (!(addr in existing)) {
      promptedRef.current = addr;
      setNicknameModal({ address: addr, initial: '' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey?.toString()]);

  function openNicknameEdit() {
    if (!publicKey) return;
    const addr = publicKey.toString();
    const stored = localStorage.getItem(NICKNAME_STORAGE_KEY);
    const existing: Record<string, string> = stored ? JSON.parse(stored) : {};
    const current = existing[addr] ?? '';
    setNicknameModal({ address: addr, initial: current });
  }

  function handleNicknameSubmit(name: string) {
    if (nicknameModal) setNickname(nicknameModal.address, name);
    setNicknameModal(null);
  }

  const claimCost = epochState ? computeClaimCost(epochState.nextClaimCost) : 5;
  const claimsCount = epochState ? computeClaimsCount(epochState.nextClaimCost) : 0;
  const isEpochOver = epochInfo?.isOver ?? false;
  const isClosed = epochState?.closed ?? false;
  const historicalBurnXnt = epochState && epochState.gameId > 1
    ? (epochState.gameId - 1) * ((epochState.pot / LAMPORTS_PER_XNT) * 0.15)
    : 0;

  return (
    <div className="min-h-screen flex flex-col">
      <Header onEditNickname={openNicknameEdit} />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 pb-16 pt-6 space-y-6">
        {/* Status banner — mock data warning and real errors only (Bug 8: hide "not initialized" banner) */}
        {error && (() => {
          const isMock = error.startsWith('Using mock data');
          return (
            <div className={`flex items-center gap-2 text-xs font-mono rounded px-3 py-1.5 border ${
              isMock
                ? 'text-yellow-500/70 bg-yellow-500/5 border-yellow-500/20'
                : 'text-red-400/70 bg-red-500/5 border-red-500/20'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                isMock ? 'bg-yellow-500/60 animate-pulse' : 'bg-red-400/60'
              }`} />
              {error}
            </div>
          );
        })()}

        {/* Collapsible game guide — collapsed by default */}
        <GameGuide />

        <HeroSection
          epochState={epochState}
          epochInfo={epochInfo}
          isLoading={isLoading}
          isEpochOver={isEpochOver}
          isClosed={isClosed}
          computedWinner={computedWinner}
          onRefresh={refresh}
        />

        <LiveStatsBar
          pot={epochState?.pot ?? 0}
          claimCost={claimCost}
          claimsCount={claimsCount}
          historicalBurnXnt={historicalBurnXnt}
          isLoading={isLoading}
        />

        <Leaderboard entries={leaderboard} isLoading={isLoading} epochState={epochState} isEpochOver={isEpochOver} computedWinner={computedWinner} />

        <HallOfMasters />
      </main>

      <Footer />

      {/* Nickname modal */}
      {nicknameModal && (
        <NicknameModal
          isOpen={true}
          walletAddress={nicknameModal.address}
          initialValue={nicknameModal.initial}
          onSubmit={handleNicknameSubmit}
        />
      )}
    </div>
  );
}

export default function App() {
  // X1 Wallet and Backpack register via Wallet Standard — no explicit adapters needed
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={RPC_ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <NicknameProvider>
            <AppContent />
            <WalletSelectModal />
          </NicknameProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
