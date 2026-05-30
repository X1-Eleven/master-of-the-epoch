import { useState } from 'react';
import { BASE_CLAIM_COST_XNT } from '../constants';

const MECHANICS = [
  {
    icon: '⚔',
    title: 'Claim the Master',
    body: `Pay ${BASE_CLAIM_COST_XNT} XNT to become Master. Each new takeover raises the cost by 2 XNT.`,
  },
  {
    icon: '⏱',
    title: 'Time = Power',
    body: 'The wallet with the most total time as Master wins — not the last to claim.',
  },
  {
    icon: '📈',
    title: 'Escalating Cost',
    body: 'Claim 1: 2 XNT · Claim 2: 4 XNT · Claim 3: 6 XNT … 60s cooldown between claims per wallet.',
  },
  {
    icon: '⏰',
    title: 'Epoch Timing',
    body: 'The game is synchronized with the real X1 network epoch. New epoch = new game.',
  },
  {
    icon: '💰',
    title: 'Close & Earn',
    body: 'Anyone can close the epoch after it ends and pocket 5% of the pot instantly.',
  },
  {
    icon: '🔥',
    title: 'Prize Split',
    body: '70% to the winner · 15% permanently burned · 10% to treasury · 5% to caller.',
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What happens if nobody claims Master during an epoch?',
    a: "Nothing bad — the game simply doesn't start. No pot accumulates, no winner is declared, and the next epoch begins fresh.",
  },
  {
    q: "What happens if nobody closes the epoch?",
    a: "The epoch remains open until someone calls close and claims the 5% reward. The pot is safe in the contract — no funds are lost. Anyone can close it at any time after the X1 network epoch has ended.",
  },
  {
    q: 'Can the same wallet claim multiple times?',
    a: 'Yes, but a 60-second cooldown applies between your own claims. Other wallets can still claim at any time during that window.',
  },
  {
    q: 'Who can close the epoch and claim the reward?',
    a: 'Anyone! The first person to call close_epoch after the X1 network epoch changes earns 5% of the entire pot as a finder\'s reward.',
  },
  {
    q: 'Where do the funds go exactly?',
    a: '70% → winner (most cumulative time as Master) · 15% → burned to incinerator · 10% → treasury · 5% → whoever closes the epoch.',
  },
  {
    q: 'What is XNT burn and why does it matter?',
    a: "15% of every pot is sent to Solana's incinerator address — a black-hole wallet from which XNT can never be recovered. It permanently reduces circulating supply.",
  },
  {
    q: 'What stops someone from spamming claims?',
    a: 'Cost. Starting at 2 XNT and rising by 2 XNT per takeover, spam becomes exponentially expensive. By claim #10 it costs 22 XNT; by #20 it\'s 42 XNT.',
  },
  {
    q: 'How is the winner determined — is it the last one to claim?',
    a: 'No. The contract tallies every wallet\'s cumulative seconds as Master. The wallet with the most total reign time — across all their reigns — wins.',
  },
  {
    q: 'Can I see all transactions on-chain?',
    a: 'Yes. Every claim and close_epoch call is a transparent on-chain transaction viewable on the X1 explorer using the program ID.',
  },
  {
    q: 'What happens to my XNT if the site goes down?',
    a: "Nothing. Your XNT is secured in the on-chain program account. The frontend is just a UI — if it disappears, you can still interact with the contract directly.",
  },
  {
    q: 'Is the contract open source?',
    a: 'Yes. The full Anchor program source code is on GitHub. You can verify it matches the deployed program ID at any time.',
  },
];

export function GameGuide() {
  const [isOpen, setIsOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <section className="rounded-lg border border-border-dim bg-bg-card/60 overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setIsOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-bg-card-hover transition-colors group"
      >
        <div className="flex items-center gap-2.5">
          <span className="font-orbitron text-xs tracking-[0.2em] text-purple-light/70 uppercase group-hover:text-purple-light transition-colors">
            Game Guide & FAQ
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-text-dim transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className="border-t border-border-dim">
          {/* How it works */}
          <div className="p-5 border-b border-border-dim/50">
            <p className="font-orbitron text-[9px] tracking-[0.3em] text-purple-light/50 uppercase mb-4">
              How It Works
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {MECHANICS.map((m) => (
                <div key={m.title} className="rounded border border-border-dim bg-bg-primary/40 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base">{m.icon}</span>
                    <span className="font-orbitron text-[9px] tracking-wider text-purple-light/80 uppercase">{m.title}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed font-mono">{m.body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div className="p-5">
            <p className="font-orbitron text-[9px] tracking-[0.3em] text-purple-light/50 uppercase mb-4">
              FAQ
            </p>
            <div className="space-y-1">
              {FAQ.map((item, i) => (
                <div key={i} className="rounded border border-border-dim/60 overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bg-primary/40 transition-colors gap-3"
                  >
                    <span className="text-xs font-mono text-slate-300 leading-snug">{item.q}</span>
                    <svg
                      className={`w-3.5 h-3.5 text-text-dim shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {openFaq === i && (
                    <div className="px-4 pb-3 bg-bg-primary/30 border-t border-border-dim/40">
                      <p className="text-xs text-slate-400 leading-relaxed font-mono pt-2">{item.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
