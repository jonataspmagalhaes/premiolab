import type { Config } from 'tailwindcss';

// Tokens espelhando src/theme/tokens.js do app mobile
const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Background layers
        bg: '#070a11',
        surface1: 'rgba(255,255,255,0.03)',
        surface2: 'rgba(255,255,255,0.05)',
        surface3: 'rgba(255,255,255,0.08)',
        // Text
        primary: '#f1f1f4',
        secondary: '#9999aa',
        muted: '#666688',
        // Semantic
        income: '#22C55E',
        growth: '#10B981',
        danger: '#EF4444',
        warning: '#F59E0B',
        info: '#3B82F6',
        accent: '#6C5CE7',
      },
      fontFamily: {
        display: ['DMSans', 'system-ui', 'sans-serif'],
        body: ['DMSans', 'system-ui', 'sans-serif'],
        mono: ['JetBrainsMono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
      },
    },
  },
  plugins: [],
};
export default config;
