import { Connection } from '@solana/web3.js';
async function main() {
  const conn = new Connection('https://xolana.xen.network', 'confirmed');
  const info = await conn.getEpochInfo();
  console.log('epoch:', info.epoch, '| slotIndex:', info.slotIndex, '| slotsInEpoch:', info.slotsInEpoch);
  const secsPerEpoch = Math.round(info.slotsInEpoch * 400 / 1000);
  const secsRemaining = Math.round((info.slotsInEpoch - info.slotIndex) * 400 / 1000);
  console.log(`Epoch duration ≈ ${secsPerEpoch}s (${(secsPerEpoch/60).toFixed(1)} min)`);
  console.log(`Time remaining in current epoch ≈ ${secsRemaining}s (${(secsRemaining/60).toFixed(1)} min)`);
}
main().catch(console.error);
