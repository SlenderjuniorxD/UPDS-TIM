/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        upds: {
          blue: '#227ffd',
          dark: '#1a6fd3',
          light: '#f4f6f9',
        }
      }
    },
  },
  plugins: [],
}