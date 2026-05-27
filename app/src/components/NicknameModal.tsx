import { useState, useEffect, useRef } from 'react';
import { formatAddress } from '../utils/format';

interface NicknameModalProps {
  isOpen: boolean;
  walletAddress: string;
  initialValue?: string;
  onSubmit: (name: string) => void;
}

export function NicknameModal({ isOpen, walletAddress, initialValue = '', onSubmit }: NicknameModalProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const handleSave = () => onSubmit(value.trim());
  const handleSkip = () => onSubmit('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={handleSkip} />

      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-lg border border-border-bright/50 bg-bg-card overflow-hidden shadow-purple-lg">
          <div className="h-0.5 bg-gradient-to-r from-transparent via-purple-glow to-transparent" />

          <div className="p-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-full border border-purple-glow/50 bg-purple-mid/20 flex items-center justify-center shrink-0">
                <span className="text-purple-light text-base">✦</span>
              </div>
              <div>
                <h2 className="font-orbitron text-xs font-bold tracking-[0.15em] text-purple-light uppercase">
                  Set Your Identity
                </h2>
                <p className="text-[10px] font-mono text-text-dim mt-0.5">
                  {formatAddress(walletAddress, 5)}
                </p>
              </div>
            </div>

            {/* Input */}
            <div className="mb-5">
              <label className="block font-orbitron text-[9px] tracking-[0.25em] text-text-dim uppercase mb-1.5">
                Nickname to Play
              </label>
              <input
                ref={inputRef}
                type="text"
                value={value}
                maxLength={20}
                placeholder="e.g. CryptoKnight, SatoshiX ..."
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleSkip(); }}
                className="w-full bg-bg-primary border border-border-dim focus:border-purple-glow rounded px-3 py-2.5 font-mono text-sm text-slate-200 placeholder-text-dim/40 outline-none focus:ring-1 focus:ring-purple-glow/30 transition-colors"
              />
              <p className="text-[9px] font-mono text-text-dim/60 mt-1">
                Optional · max 20 chars · skip to stay Anonymous
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleSkip}
                className="flex-1 font-orbitron text-[10px] tracking-wider uppercase py-2.5 rounded border border-border-dim text-text-dim hover:border-border-bright hover:text-slate-300 transition-all"
              >
                Skip
              </button>
              <button
                onClick={handleSave}
                className="flex-1 font-orbitron text-[10px] tracking-wider uppercase py-2.5 rounded border border-purple-glow bg-purple-mid/20 text-purple-light hover:bg-purple-mid/40 hover:shadow-purple-sm transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
