import { PublicKey } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('BC4y2dVdicttQCFSrBA9DjGxuHQrn3dikzds7twaRXu1');
export const RPC_ENDPOINT = 'https://xolana.xen.network';
export const BURN_ADDRESS = new PublicKey('1nc1nerator11111111111111111111111111111111');
export const EXPLORER_URL = 'https://explorer.testnet.x1.xyz';
export const GITHUB_URL = 'https://github.com/X1-Eleven/master-of-the-epoch';

export const EPOCH_STATE_SEED = 'epoch_state';
export const MASTER_RECORD_SEED = 'master_record';
export const GAME_COUNTER_SEED = 'game_counter';

export const LAMPORTS_PER_XNT = 1_000_000_000;
export const BASE_CLAIM_COST_XNT = 2;
export const COOLDOWN_SECONDS = 60;

// X1 testnet slot time ≈ 400ms
export const AVG_SLOT_MS = 400;

export const NULL_PUBLIC_KEY = '11111111111111111111111111111111';
