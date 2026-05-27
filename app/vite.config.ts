import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'process', 'crypto', 'stream', 'util', 'assert'],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'solana-web3': ['@solana/web3.js'],
          'anchor': ['@coral-xyz/anchor'],
          'wallet-adapter': [
            '@solana/wallet-adapter-react',
            '@solana/wallet-adapter-react-ui',
            '@solana/wallet-adapter-wallets',
          ],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
