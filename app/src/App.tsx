import { useMemo, type FC, type ReactNode } from 'react';
import {
  ConnectionProvider as _ConnectionProvider,
  WalletProvider as _WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider as _WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import '@solana/wallet-adapter-react-ui/styles.css';

// Cast providers to FC<{children}> to resolve @types/react version mismatches
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ConnectionProvider = _ConnectionProvider as FC<{ children: ReactNode; endpoint: string; config?: any }>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WalletProvider = _WalletProvider as FC<{ children: ReactNode; wallets: any[]; autoConnect?: boolean }>;
const WalletModalProvider = _WalletModalProvider as FC<{ children: ReactNode }>;

import { RPC_ENDPOINT } from './constants';
import { useEpochState, getMockLeaderboard, computeClaimCost, computeClaimsCount } from './hooks/useEpochState';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { LiveStatsBar } from './components/LiveStatsBar';
import { Leaderboard } from './components/Leaderboard';
import { CloseEpochButton } from './components/CloseEpochButton';
import { Footer } from './components/Footer';

function AppContent() {
  const { epochState, epochInfo, isLoading, error } = useEpochState();

  const leaderboard = useMemo(
    () => (epochState ? getMockLeaderboard(epochState) : []),
    [epochState]
  );

  const claimCost = epochState ? computeClaimCost(epochState.nextClaimCost) : 5;
  const claimsCount = epochState ? computeClaimsCount(epochState.nextClaimCost) : 0;
  const isEpochOver = epochInfo?.isOver ?? false;
  const isClosed = epochState?.closed ?? false;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 pb-16 pt-8 space-y-8">
        {/* RPC status badge */}
        {error && (
          <div className="flex items-center gap-2 text-xs font-mono text-yellow-500/70 bg-yellow-500/5 border border-yellow-500/20 rounded px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500/60 animate-pulse inline-block" />
            {error}
          </div>
        )}

        <HeroSection
          epochState={epochState}
          epochInfo={epochInfo}
          isLoading={isLoading}
          claimCost={claimCost}
          isEpochOver={isEpochOver}
        />

        <LiveStatsBar
          pot={epochState?.pot ?? 0}
          claimCost={claimCost}
          claimsCount={claimsCount}
          isLoading={isLoading}
        />

        <Leaderboard entries={leaderboard} isLoading={isLoading} />

        {isEpochOver && !isClosed && epochState && (
          <CloseEpochButton epochState={epochState} />
        )}
      </main>

      <Footer />
    </div>
  );
}

export default function App() {
  const wallets = useMemo(
    // Backpack auto-registers via Wallet Standard; list others explicitly
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={RPC_ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AppContent />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
