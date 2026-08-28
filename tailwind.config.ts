import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef5ff',
          100: '#d9e8ff',
          200: '#bcd7ff',
          300: '#8ebeff',
          400: '#599bff',
          500: '#3378fb',
          600: '#1d59f0',
          700: '#1745dc',
          800: '#1939b2',
          900: '#1b358c',
        },
      },
    },
  },
  plugins: [],
};

export default config;
