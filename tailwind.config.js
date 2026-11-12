/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Superficies
        canvas: '#F5F0E8',
        surface: '#FFFDFA',
        sunken: '#EFE8DD',
        line: '#E6DCCF',
        // Tinta
        ink: { DEFAULT: '#2B221D', 2: '#5C5047', 3: '#6B5F56' },
        espresso: '#231B17',
        // Marca (#C19C80 es el tono del logotipo)
        clay: { DEFAULT: '#C19C80', deep: '#8A6548', soft: '#EFE2D4' },
        // Estados
        sage: { DEFAULT: '#5F7556', soft: '#E3EADD' },
        honey: { DEFAULT: '#82590F', soft: '#F6EAD0' },
        terracotta: { DEFAULT: '#A84E38', soft: '#F6E2DB' },
      },
      fontFamily: {
        display: ['"Fraunces Variable"', 'Georgia', 'serif'],
        body: ['"Manrope Variable"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: { '4xl': '2rem' },
      boxShadow: {
        card: '0 1px 2px rgba(43,34,29,0.04), 0 8px 24px -12px rgba(43,34,29,0.10)',
        lift: '0 2px 4px rgba(43,34,29,0.05), 0 18px 40px -16px rgba(43,34,29,0.22)',
        sheet: '0 -8px 40px rgba(43,34,29,0.18)',
      },
      letterSpacing: { label: '0.14em' },
    },
  },
  plugins: [],
}
