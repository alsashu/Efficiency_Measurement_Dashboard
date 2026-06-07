/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        carbon: { DEFAULT: '#1E3246', dark: '#152436', light: '#264058' },
        vibrant: { DEFAULT: '#DC3223', dark: '#b82a1d', light: '#e5574a' },
        gold: { DEFAULT: '#9B875F', dark: '#7d6c4a', light: '#b3a07a' },
        greenline: { DEFAULT: '#19AA6E', dark: '#14895a', light: '#2dc484' },
        steel: { DEFAULT: '#4B5A69', dark: '#3a4754', light: '#5e7080' },
        softred: '#E15A50',
        mutedgold: '#AFA082',
        mint: '#73CDAA',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in',
        'slide-in': 'slideIn 0.3s ease-out',
        'pulse-slow': 'pulse 3s infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideIn: { from: { transform: 'translateX(-10px)', opacity: 0 }, to: { transform: 'translateX(0)', opacity: 1 } },
      },
    },
  },
  plugins: [],
};
