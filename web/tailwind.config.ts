import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        page: '#0B0C0E',
        bg: '#0B0C0E',
        'bg-elevated': '#0c1019',
        surface: 'rgba(255,255,255,0.04)',
        'surface-hover': 'rgba(255,255,255,0.07)',
        surface1: 'rgba(255,255,255,0.05)',
        surface2: 'rgba(255,255,255,0.07)',
        surface3: 'rgba(255,255,255,0.10)',
        primary: '#F5F5F7',
        secondary: '#AAAABC',
        muted: '#6E6E8A',
        income: '#22C55E',
        growth: '#10B981',
        danger: '#EF4444',
        warning: '#F59E0B',
        info: '#3B82F6',
        accent: '#F97316',
        'accent-muted': '#FB923C',
        fii: '#10B981',
        acao: '#3B82F6',
        etf: '#F59E0B',
        'stock-int': '#E879F9',
        rf: '#06B6D4',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        body: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
      },
      animation: {
        'fade-up': 'fadeUp 0.7s cubic-bezier(0.16,1,0.3,1) both',
        'draw-line': 'drawLine 2s ease-out forwards',
        'donut-draw': 'donutDraw 1.2s ease-out forwards',
        'slide-right': 'slideRight 1s ease-out forwards',
        'row-slide': 'rowSlide 0.4s ease-out forwards',
        'ticker-scroll': 'tickerScroll 20s linear infinite',
        'orb-float': 'orbFloat 14s ease-in-out infinite',
        'matrix-fall': 'matrixFall linear infinite',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(12px)', filter: 'blur(4px)' },
          to: { opacity: '1', transform: 'translateY(0)', filter: 'blur(0)' },
        },
        drawLine: {
          from: { strokeDashoffset: '2000' },
          to: { strokeDashoffset: '0' },
        },
        donutDraw: {
          from: { strokeDasharray: '0 345.58' },
        },
        slideRight: {
          from: { width: '0' },
        },
        rowSlide: {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        tickerScroll: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        orbFloat: {
          '0%': { transform: 'translate(0,0) scale(1)' },
          '33%': { transform: 'translate(25px,-20px) scale(1.08)' },
          '66%': { transform: 'translate(-20px,15px) scale(0.94)' },
          '100%': { transform: 'translate(0,0) scale(1)' },
        },
        matrixFall: {
          '0%': { top: '-20%', opacity: '0' },
          '5%': { opacity: '0.2' },
          '50%': { opacity: '0.1' },
          '95%': { opacity: '0.03' },
          '100%': { top: '110%', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
