import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';
import { useWalletModal } from '../context/WalletModalContext';

const WALLET_OPTIONS = [
  { name: 'X1 Wallet' as WalletName<string>, logo: '/x1wallet-logo.png', label: 'X1 WALLET' },
  { name: 'Backpack' as WalletName<string>, logo: '/backpack-logo.png', label: 'BACKPACK' },
];

export function WalletSelectModal() {
  const { select } = useWallet();
  const { visible, setVisible } = useWalletModal();

  if (!visible) return null;

  function handleSelect(name: WalletName<string>) {
    select(name);
    setVisible(false);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setVisible(false)}
      />

      <div className="relative z-10 w-80 rounded-lg border border-purple-glow/40 bg-bg-card shadow-purple-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-dim flex items-center justify-between">
          <span className="font-orbitron text-sm tracking-widest text-purple-light uppercase">
            Connect Wallet
          </span>
          <button
            onClick={() => setVisible(false)}
            className="text-text-dim/50 hover:text-text-dim transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Wallet options */}
        <div className="p-4 space-y-3">
          {WALLET_OPTIONS.map(({ name, logo, label }) => (
            <button
              key={name}
              onClick={() => handleSelect(name)}
              className="w-full flex items-center gap-4 px-4 py-3 rounded border border-border-dim hover:border-purple-glow/50 hover:bg-purple-glow/5 transition-all group"
            >
              <img src={logo} alt={name} className="w-8 h-8 rounded object-contain" />
              <span className="font-orbitron text-xs tracking-widest text-text-dim group-hover:text-purple-light transition-colors">
                {label}
              </span>
              <svg
                className="w-4 h-4 ml-auto text-text-dim/30 group-hover:text-purple-light/50 transition-colors"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          ))}
        </div>

        <div className="px-6 pb-4 text-center">
          <p className="text-[10px] font-mono text-text-dim/40">X1 Testnet · Wallet Standard</p>
        </div>
      </div>
    </div>
  );
}
