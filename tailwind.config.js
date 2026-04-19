/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'brand': {
          50: '#f4f7fb',
          100: '#e6edf6',
          200: '#c7d6e9',
          300: '#9bb6d6',
          400: '#688fbe',
          500: '#4570a3',
          600: '#345987',
          700: '#2c486d',
          800: '#283d5b',
          900: '#25344d',
          950: '#172033',
        },
        'accent': '#c9a962',
      },
    },
  },
  plugins: [],
};
