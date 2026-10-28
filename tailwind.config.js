/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#09090b', // Deep canvas
          900: '#111114', // Elevated card / surface
          850: '#16161a', // Sidebar / toolbar
          800: '#202025', // Hover surface
          750: '#27272e', // Border subtle
          700: '#32323a', // Border prominent
          600: '#4c4c57', // Muted stroke
        },
        cyan: {
          DEFAULT: '#06b6d4',
          glow: '#22d3ee',
          dark: '#0891b2',
        },
        emerald: {
          DEFAULT: '#10b981',
          glow: '#34d399',
          dark: '#059669',
        },
        brand: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
          950: '#083344',
        },
      },
      fontFamily: {
        sans: ['Segoe UI', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'Courier New', 'monospace'],
      },
      boxShadow: {
        'glow-cyan': '0 0 15px -3px rgba(6, 182, 212, 0.35)',
        'glow-emerald': '0 0 15px -3px rgba(16, 185, 129, 0.35)',
        'obsidian': '0 10px 30px -10px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.06)',
      },
      animation: {
        'shimmer-flow': 'shimmer-flow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'download-bounce': 'download-bounce 1.2s ease-in-out infinite',
        'drop-pulse': 'drop-pulse 2s ease-in-out infinite',
        'pulse-subtle': 'pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
    },
  },
  plugins: [],
}
