import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { formatAddress } from '../utils/format';

export function Header() {
  const { connected, publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();

  return (
    <header className="sticky top-0 z-50 border-b border-border-dim bg-bg-primary/90 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 rounded-full border-2 border-purple-glow flex items-center justify-center shadow-purple-sm">
              <span className="text-purple-light font-orbitron font-bold text-xs">M</span>
            </div>
            <div className="absolute inset-0 rounded-full border-2 border-purple-glow animate-ping opacity-20" />
          </div>
          <div>
            <h1 className="font-orbitron font-bold text-sm sm:text-base tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-purple-light to-purple-glow">
              MASTER OF THE EPOCH
            </h1>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-neon animate-pulse inline-block" />
              <span className="text-neon-dim text-[10px] font-mono tracking-wider">X1 TESTNET</span>
            </div>
          </div>
        </div>

        {/* Wallet button */}
        {connected && publicKey ? (
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded border border-purple-glow/30 bg-purple-glow/5">
              <span className="w-1.5 h-1.5 rounded-full bg-neon inline-block" />
              <span className="font-mono text-xs text-purple-light">
                {formatAddress(publicKey.toString(), 4)}
              </span>
            </div>
            <button
              onClick={disconnect}
              className="font-orbitron text-xs tracking-wider uppercase px-4 py-2 rounded border border-red-500/40 text-red-400/70 hover:border-red-500/70 hover:text-red-400 hover:bg-red-500/5 transition-all"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => setVisible(true)}
            disabled={connecting}
            className="relative font-orbitron text-xs tracking-wider uppercase px-5 py-2.5 rounded border border-purple-glow bg-purple-mid/20 text-purple-light hover:bg-purple-mid/40 hover:shadow-purple-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connecting ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-purple-light/40 border-t-purple-light rounded-full animate-spin inline-block" />
                Connecting...
              </span>
            ) : (
              'Connect Wallet'
            )}
          </button>
        )}
      </div>
    </header>
  );
}
