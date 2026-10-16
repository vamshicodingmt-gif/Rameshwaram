/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        jp: ['"Noto Serif JP"', 'serif'],
      },
      colors: {
        cursedBlue: '#29d3ff',
        cursedRed: '#ff3b3b',
        cursedPurple: '#8a2be2',
      },
      keyframes: {
        pulseGlow: {
          '0%,100%': { opacity: 0.8, transform: 'scale(1)' },
          '50%': { opacity: 1, transform: 'scale(1.05)' },
        },
        shake: {
          '0%,100%': { transform: 'translate(0,0)' },
          '25%': { transform: 'translate(-4px,3px)' },
          '50%': { transform: 'translate(4px,-3px)' },
          '75%': { transform: 'translate(-3px,-4px)' },
        },
      },
      animation: {
        pulseGlow: 'pulseGlow 1.6s ease-in-out infinite',
        shake: 'shake 0.25s linear infinite',
      },
    },
  },
  plugins: [],
};
