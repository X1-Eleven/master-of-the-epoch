import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { formatAddress } from '../utils/format';
import { useNicknames } from '../context/NicknameContext';

interface HeaderProps {
  onEditNickname: () => void;
}

export function Header({ onEditNickname }: HeaderProps) {
  const { connected, publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const { getNickname } = useNicknames();

  const nickname = connected && publicKey ? getNickname(publicKey.toString()) : null;
  const isAnon = nickname === 'Anonymous';

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
            <div className="flex items-center gap-2">
              <h1 className="font-orbitron font-bold text-sm sm:text-base tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-purple-light to-purple-glow">
                MASTER OF THE EPOCH
              </h1>
              {/* X1 network badge */}
              <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-neon-dim/40 bg-neon/5 shrink-0">
                <span className="font-orbitron font-bold text-[10px] tracking-wide text-neon">X</span>
                <span className="font-orbitron font-bold text-[10px] tracking-wide text-neon-dim">1</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-neon animate-pulse inline-block" />
              <span className="text-neon-dim text-[10px] font-mono tracking-wider">X1 TESTNET</span>
            </div>
          </div>
        </div>

        {/* Wallet area */}
        {connected && publicKey ? (
          <div className="flex items-center gap-2">
            {/* Identity chip */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-purple-glow/30 bg-purple-glow/5 max-w-[200px]">
              <span className="w-1.5 h-1.5 rounded-full bg-neon shrink-0 inline-block" />
              <div className="overflow-hidden">
                {!isAnon && (
                  <p className="font-orbitron text-[9px] text-purple-light tracking-wider truncate leading-tight">
                    {nickname}
                  </p>
                )}
                <p className="font-mono text-[9px] text-text-dim truncate leading-tight">
                  {formatAddress(publicKey.toString(), 4)}
                </p>
              </div>
              {/* Edit pencil */}
              <button
                onClick={onEditNickname}
                title="Edit nickname"
                className="shrink-0 p-0.5 rounded text-text-dim/50 hover:text-purple-light transition-colors"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>

            <button
              onClick={disconnect}
              className="font-orbitron text-[10px] tracking-wider uppercase px-3 py-1.5 rounded border border-red-500/40 text-red-400/70 hover:border-red-500/70 hover:text-red-400 hover:bg-red-500/5 transition-all"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => setVisible(true)}
            disabled={connecting}
            className="font-orbitron text-xs tracking-wider uppercase px-5 py-2.5 rounded border border-purple-glow bg-purple-mid/20 text-purple-light hover:bg-purple-mid/40 hover:shadow-purple-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
