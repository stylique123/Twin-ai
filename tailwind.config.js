/** TwinAI brand tokens — from Brand & GTM Cheat Sheet v1.0 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#07070A',
        cream: '#F6F1E9',
        sand: '#C9BDAC',
        stone: '#8D8475',
        amber: '#FFB347',
        coral: '#FF5B7B',
        teal: '#65E5D8',
      },
      fontFamily: {
        // Geist for display/headings, Inter as the body fallback in one family stack
        sans: ['Geist', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      fontWeight: {
        display: '800',
        heading: '700',
      },
      borderRadius: {
        card: '18px',
        panel: '24px',
      },
      backgroundImage: {
        // Signature gradient — never re-order: amber -> coral -> teal at 135deg
        signature: 'linear-gradient(135deg, #FFB347 0%, #FF5B7B 50%, #65E5D8 100%)',
      },
      letterSpacing: {
        eyebrow: '0.18em',
      },
      boxShadow: {
        glass: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 40px -12px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
}
