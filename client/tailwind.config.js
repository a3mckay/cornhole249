/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F5EFE0',
        surface: '#FDF8EE',
        primary: '#3A6B35',
        secondary: '#D48B2D',
        danger: '#B94040',
        'text-primary': '#2C2416',
        'text-secondary': '#7A6652',
        border: '#C8B89A',
        'chalkboard': '#2D4A28',
        'navbar': '#4A3728',
        'gold': '#D4A017',
      },
      fontFamily: {
        display: ['"Abril Fatface"', 'serif'],
        ui: ['Nunito', 'sans-serif'],
        marker: ['"Permanent Marker"', 'cursive'],
      },
      borderRadius: {
        card: '16px',
      },
      boxShadow: {
        card: '4px 4px 0px #C8B89A',
        'card-hover': '6px 6px 0px #C8B89A',
        'button-hover': '0 4px 12px rgba(0,0,0,0.15)',
      },
    },
  },
  plugins: [],
};
