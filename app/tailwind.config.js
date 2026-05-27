/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#050508',
        'bg-card': '#0d0d1a',
        'bg-card-hover': '#111127',
        'border-dim': '#1e1e3f',
        'border-bright': '#3b1fa0',
        'purple-glow': '#9333ea',
        'purple-mid': '#7c3aed',
        'purple-light': '#c084fc',
        'gold-bright': '#fbbf24',
        'gold-mid': '#f59e0b',
        'neon': '#00ff88',
        'neon-dim': '#10b981',
        'text-dim': '#64748b',
      },
      fontFamily: {
        orbitron: ['Orbitron', 'monospace'],
        mono: ['Share Tech Mono', 'Courier New', 'monospace'],
      },
      boxShadow: {
        'purple-sm': '0 0 12px rgba(147, 51, 234, 0.25)',
        'purple-lg': '0 0 30px rgba(147, 51, 234, 0.45)',
        'gold-sm': '0 0 12px rgba(251, 191, 36, 0.25)',
        'gold-lg': '0 0 30px rgba(251, 191, 36, 0.45)',
        'neon-sm': '0 0 12px rgba(0, 255, 136, 0.25)',
        'neon-lg': '0 0 30px rgba(0, 255, 136, 0.45)',
      },
      animation: {
        'glow-pulse': 'glow-pulse 2.5s ease-in-out infinite',
        'flicker': 'flicker 3s step-end infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: '0.85' },
          '50%': { opacity: '1' },
        },
        'flicker': {
          '0%, 95%, 100%': { opacity: '1' },
          '96%': { opacity: '0.8' },
          '97%': { opacity: '1' },
          '98%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
};
