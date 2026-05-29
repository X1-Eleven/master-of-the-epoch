import { useState } from 'react';
import { formatAddress } from '../utils/format';
import { PROGRAM_ID, GITHUB_URL } from '../constants';

const TREASURY_ADDRESS = '4V2JhdSG2EL9GAv4wU59KsHsxCk3UhWxuTfnrVieYYet';

function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <svg className="w-3.5 h-3.5 text-neon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ) : (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function Footer() {
  const programId = PROGRAM_ID.toString();
  const [copied, setCopied] = useState(false);

  function handleCopyTreasury() {
    navigator.clipboard.writeText(TREASURY_ADDRESS).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <footer className="border-t border-border-dim bg-bg-card/50 mt-auto">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-text-dim">
          {/* Program ID */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border-dim">
            <span className="font-orbitron text-[9px] tracking-[0.2em] text-text-dim/60 uppercase">Smart Contract</span>
            <a
              href={`https://explorer.testnet.x1.xyz/account/${programId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-orbitron text-[9px] tracking-[0.2em] text-purple-light/70 hover:text-purple-light transition-colors uppercase"
              title={programId}
            >
              {formatAddress(programId, 6)}
            </a>
          </div>

          {/* Center: badges */}
          <div className="flex items-center gap-3">
            {/* X1 network badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-neon-dim/30 bg-neon-dim/5">
              <span className="w-1.5 h-1.5 rounded-full bg-neon animate-pulse inline-block" />
              <span className="font-orbitron text-[9px] tracking-[0.2em] text-neon-dim uppercase">
                X1 Testnet
              </span>
            </div>

            {/* Anchor badge */}
            <div className="px-2.5 py-1 rounded border border-border-dim text-[9px] font-orbitron tracking-wider text-text-dim/60 uppercase">
              Anchor 0.30
            </div>
          </div>

          {/* GitHub */}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border-dim text-text-dim/60 hover:text-purple-light hover:border-purple-light/40 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span className="font-orbitron text-[9px] tracking-[0.2em] uppercase">GitHub</span>
          </a>
        </div>

        <div className="mt-4 pt-4 border-t border-border-dim/40 text-center space-y-2">
          <p className="text-xs font-mono tracking-wider text-white/50">
            Master of the Epoch · Built on X1
          </p>
          <p className="text-xs font-mono tracking-wider inline-flex items-center gap-2 flex-wrap justify-center">
            <span style={{ color: '#00ff88' }}>Support development with XNT:</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-purple-light/70 tracking-wider">{formatAddress(TREASURY_ADDRESS, 4)}</span>
              <button
                onClick={handleCopyTreasury}
                title="Copy treasury address"
                className="inline-flex items-center text-purple-light/50 hover:text-purple-light transition-colors"
              >
                <CopyIcon copied={copied} />
              </button>
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
