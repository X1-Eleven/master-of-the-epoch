import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '../context/WalletModalContext';
import { ComputeBudgetProgram, Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { Program, AnchorProvider, Idl, BN } from '@coral-xyz/anchor';
import { IDL } from '../idl';
import { EpochStateData } from '../hooks/useEpochState';
import { formatXnt } from '../utils/format';
import {
  PROGRAM_ID, RPC_ENDPOINT, EPOCH_STATE_SEED, MASTER_RECORD_SEED,
  GAME_COUNTER_SEED, BURN_ADDRESS, LAMPORTS_PER_XNT,
} from '../constants';

interface CloseEpochButtonProps {
  epochState: EpochStateData | null;
  isEpochOver: boolean;
  isClosed: boolean;
  onRefresh: () => void;
}

// Bug 3: extract a user-friendly message from any Anchor/wallet error
function getErrorMessage(e: unknown): string {
  if (!(e instanceof Error)) return String(e).slice(0, 120);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ae = e as any;
  if (ae.error?.errorMessage) return ae.error.errorMessage;
  if (ae.errorMessage) return ae.errorMessage;
  if (ae.logs?.length) {
    const line = (ae.logs as string[]).find((l) => l.includes('Error Message:'));
    if (line) return line.replace(/.*Error Message:\s*/, '');
  }
  return e.message.slice(0, 120);
}

export function CloseEpochButton({ epochState, isEpochOver, isClosed, onRefresh }: CloseEpochButtonProps) {
  const { connected, publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [closing, setClosing] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const canClose = isEpochOver && !isClosed && !!epochState;
  const callerReward = epochState ? (epochState.pot / LAMPORTS_PER_XNT) * 0.05 : 0;

  async function handleClose() {
    if (!connected || !publicKey) { setVisible(true); return; }
    if (!signTransaction || !epochState) return;
    if (closing) return;

    setClosing(true);
    // Bug 3: clear ALL previous messages before each attempt
    setTxStatus(null);
    setIsError(false);

    try {
      const connection = new Connection(RPC_ENDPOINT, 'confirmed');
      const provider = new AnchorProvider(
        connection,
        {
          publicKey,
          signTransaction,
          // Bug 2: properly implement signAllTransactions so Anchor never bypasses signing
          signAllTransactions: async (txs: Transaction[]) =>
            Promise.all(txs.map((tx) => signTransaction(tx))),
        } as never,
        { commitment: 'confirmed' }
      );
      const program = new Program(IDL as unknown as Idl, provider);

      const [epochStatePDA] = PublicKey.findProgramAddressSync([Buffer.from(EPOCH_STATE_SEED)], PROGRAM_ID);
      const [currentMasterRecord] = PublicKey.findProgramAddressSync(
        [Buffer.from(MASTER_RECORD_SEED), new PublicKey(epochState.currentMaster).toBuffer()],
        PROGRAM_ID
      );
      const [gameCounterPDA] = PublicKey.findProgramAddressSync([Buffer.from(GAME_COUNTER_SEED)], PROGRAM_ID);

      // Determine winner (same logic as the on-chain handler)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const masterRecordData = await (program.account as any).masterRecord.fetch(currentMasterRecord);
      const now = Math.floor(Date.now() / 1000);
      const currentTotal = (masterRecordData.totalReignTime as BN).toNumber() + (now - epochState.masterSince);
      const winner =
        currentTotal >= epochState.leadingMasterTime
          ? new PublicKey(epochState.currentMaster)
          : new PublicKey(epochState.leadingMaster);

      // Bug 1: build both instructions and combine into one atomic transaction
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const closeIx = await (program.methods as any).closeEpoch()
        .accounts({
          epochState: epochStatePDA,
          currentMasterRecord,
          caller: publicKey,
          winner,
          treasury: new PublicKey(epochState.treasury),
          burnAddress: BURN_ADDRESS,
        })
        .instruction();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const initIx = await (program.methods as any).initializeEpoch()
        .accounts({
          epochState: epochStatePDA,
          gameCounter: gameCounterPDA,
          payer: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction();
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10000 }), closeIx, initIx);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // Sign once — user sees a single wallet popup
      const signedTx = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

      setTxStatus(`Epoch closed & new game started! tx: ${sig.slice(0, 8)}...`);
      setIsError(false);
      // Bug 5: immediately refresh state after successful transaction
      onRefresh();
    } catch (e: unknown) {
      // Reset button state first so it's immediately retryable, then show error
      setClosing(false);
      setIsError(true);
      setTxStatus(getErrorMessage(e));
    } finally {
      setClosing(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClose}
        disabled={!canClose || closing}
        className={`w-full font-orbitron font-bold text-sm tracking-widest uppercase px-8 py-4 rounded border transition-all duration-200 disabled:cursor-not-allowed ${
          canClose
            ? 'border-red-500/60 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-500/80 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]'
            : 'border-border-dim bg-transparent text-text-dim/40 opacity-50'
        }`}
      >
        {closing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-red-400/40 border-t-red-400 rounded-full animate-spin inline-block" />
            Closing & Restarting Epoch...
          </span>
        ) : isClosed ? (
          '✓ Epoch Already Closed'
        ) : !isEpochOver ? (
          'Close Epoch & Claim Reward (Inactive)'
        ) : (
          `Close Epoch & Claim Reward — earn ${callerReward.toFixed(2)} XNT (5%)`
        )}
      </button>

      {canClose && (
        <p className="text-[10px] font-mono text-text-dim/60 text-center mt-1.5">
          Pot: {epochState ? formatXnt(epochState.pot) : '0'} XNT · 60% winner · 25% burn · 10% treasury · 5% you
        </p>
      )}

      {txStatus && !closing && (
        <p className={`text-xs font-mono text-center mt-2 ${isError ? 'text-red-400' : 'text-neon-dim'}`}>
          {txStatus}
        </p>
      )}
    </div>
  );
}
