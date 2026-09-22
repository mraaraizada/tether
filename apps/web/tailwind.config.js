/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        lavender: '#b18cf5',
        ink: '#1c1c24',
        inkSoft: '#2a2a33',
        lime: '#d7f56a',
        muted: '#8a8a99',
        shell: '#fdfcf8',
      },
      boxShadow: {
        card: '0 1px 2px rgba(28,28,36,0.04), 0 8px 24px rgba(28,28,36,0.04)',
        shell: '0 40px 80px -20px rgba(60,30,110,0.35)',
      },
    },
  },
  plugins: [],
}
