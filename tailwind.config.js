/** TwinAI brand tokens — from Brand & GTM Cheat Sheet v1.0, extended for the
 *  flagship redesign (motion, depth, gradient mesh). Brand DNA is unchanged:
 *  dark ink canvas, cream ink, signature amber → coral → teal gradient. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#07070A',
        ink2: '#0C0C11',
        ink3: '#13131A',
        cream: '#F6F1E9',
        sand: '#C9BDAC',
        stone: '#8D8475',
        amber: '#FFB347',
        coral: '#FF5B7B',
        teal: '#65E5D8',
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      fontWeight: { display: '800', heading: '700' },
      borderRadius: { card: '18px', panel: '24px', xl2: '28px' },
      maxWidth: { content: '1180px' },
      backgroundImage: {
        // Signature gradient — never re-order: amber -> coral -> teal at 135deg
        // (exact stops from the brand book p.11).
        signature: 'linear-gradient(135deg, #FFB347 0%, #FF5B7B 50%, #70E4D5 100%)',
        'signature-soft':
          'linear-gradient(135deg, #ffb34738 0%, #ff5b7b2e 50%, #70e4d538 100%)',
        grid: 'linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)',
      },
      letterSpacing: { eyebrow: '0.18em' },
      boxShadow: {
        glass: '0 1px 0 0 rgba(255,255,255,0.05) inset, 0 8px 40px -12px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(255,91,123,.25), 0 18px 60px -18px rgba(255,91,123,.45)',
        'glow-teal': '0 0 0 1px rgba(101,229,216,.25), 0 18px 60px -18px rgba(101,229,216,.4)',
        lift: '0 24px 70px -28px rgba(0,0,0,.85)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        aurora: {
          '0%,100%': { transform: 'translate(-8%,-6%) rotate(0deg)' },
          '50%': { transform: 'translate(8%,6%) rotate(12deg)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'gradient-pan': {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'spin-slow': { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        'fade-up': 'fade-up .6s cubic-bezier(.22,1,.36,1) both',
        marquee: 'marquee 38s linear infinite',
        'marquee-slow': 'marquee 60s linear infinite',
        float: 'float 7s ease-in-out infinite',
        aurora: 'aurora 18s ease-in-out infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        'gradient-pan': 'gradient-pan 6s ease infinite',
        'spin-slow': 'spin-slow 22s linear infinite',
      },
    },
  },
  plugins: [],
}
