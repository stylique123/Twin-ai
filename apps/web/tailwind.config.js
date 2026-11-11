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
        stone: '#9C9384',
        amber: '#FFB347',
        coral: '#FF5B7B',
        teal: '#65E5D8',
        // Design-handoff shades (2026 redesign). Softer text tints of the
        // existing colours for dark surfaces — not new accents. Still ONE teal.
        'sand-muted': '#B7AE9F', // secondary body text
        'sand-soft': '#D8CFC2', // text on quiet buttons and notes
        'stone-dim': '#6E675C', // footnotes, calendar day names, footer eyebrows
        'amber-soft': '#FFCB85', // muted warnings ("You've used your 3 free videos")
        'coral-soft': '#FF8FA4', // failure / "Scheduled" text on dark
        'teal-soft': '#8FEDE3', // success / "Posted" text, teal outline buttons
        rec: '#FF3B5C', // the recording dot and bar on Record only
        placeholder: '#141015', // background while a media tile loads
        // Exact board values (START_HERE rule 1.3: never round to a nearby token).
        label: '#8D8475', // board labels/captions (the board's stone; differs from `stone`)
        dialog: '#17171D', // pop-up dialog surface (Add a product)
        drawer: '#121217', // side panel surface (Edit what Twin knows)
        row: '#0E0E12', // choice-row surface
        footer: '#09090C', // site footer
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      fontWeight: { display: '800', heading: '700' },
      // rounded-xl (12px) and rounded-2xl (16px) are Tailwind defaults; 9 and 14 are the
      // extra corners the redesign boards use for chips/controls and radio rows.
      borderRadius: { '9': '9px', '14': '14px', card: '18px', panel: '24px', xl2: '28px' },
      maxWidth: { content: '1180px' },
      backgroundImage: {
        // Signature gradient — never re-order: amber -> coral -> teal at 135deg
        // (exact stops from the brand book p.11).
        signature: 'linear-gradient(135deg, #FFB347 0%, #FF5B7B 50%, #65E5D8 100%)',
        'signature-soft':
          'linear-gradient(135deg, #ffb34738 0%, #ff5b7b2e 50%, #65E5D838 100%)',
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
        'sheet-up': { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
        'dialog-in': { '0%': { opacity: '0', transform: 'translateY(8px) scale(.98)' }, '100%': { opacity: '1', transform: 'none' } },
        // Board keyframes, verbatim.
        popin: { '0%': { opacity: '0', transform: 'translateY(10px) scale(.94)' }, '100%': { opacity: '1', transform: 'none' } },
        cfdrawer: { from: { transform: 'translateX(40px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
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
        'sheet-up': 'sheet-up .28s cubic-bezier(.22,1,.36,1) both',
        'dialog-in': 'dialog-in .2s cubic-bezier(.22,1,.36,1) both',
        popin: 'popin .5s cubic-bezier(.22,1,.36,1) both',
        cfdrawer: 'cfdrawer .4s cubic-bezier(.22,1,.36,1) both',
      },
    },
  },
  plugins: [],
}
