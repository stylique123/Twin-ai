import { cn } from '../lib/cn'

// The TwinAI "twin mark": a solid cream T (the reference you admire) reflected
// into a gradient T (your version, reborn in the signature gradient). Reads as a
// clean I-beam / T monogram down to favicon size. Per brand book p.08.
export function LogoMark({ className = '', size = 28 }: { className?: string; size?: number }) {
  const gid = 'twinai-grad'
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn('shrink-0', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="4" y1="12" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFB347" />
          <stop offset="0.5" stopColor="#FF5B7B" />
          <stop offset="1" stopColor="#65E5D8" />
        </linearGradient>
      </defs>
      {/* Reference T (cream): top crossbar + upper stem */}
      <rect x="6" y="4.6" width="12" height="2.7" rx="1.35" fill="#F6F1E9" />
      <rect x="10.65" y="7.3" width="2.7" height="4.7" fill="#F6F1E9" />
      {/* Twin T (gradient): lower stem + bottom crossbar, the mirror */}
      <rect x="10.65" y="12" width="2.7" height="4.7" fill={`url(#${gid})`} />
      <rect x="6" y="16.7" width="12" height="2.7" rx="1.35" fill={`url(#${gid})`} />
    </svg>
  )
}

export function Logo({ className = '', size = 26 }: { className?: string; size?: number }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 font-bold', className)}>
      <LogoMark size={size} />
      <span className="tracking-tight text-cream">
        Twin<span className="text-amber">AI</span>
      </span>
    </span>
  )
}

// App-icon lockup: the mark centered on the warm ink-black tile (per brand book).
export function LogoIcon({ size = 56, rounded = 14 }: { size?: number; rounded?: number }) {
  return (
    <span
      className="relative grid place-items-center bg-ink"
      style={{ width: size, height: size, borderRadius: rounded }}
    >
      <span
        className="absolute inset-0 ring-1 ring-white/10"
        style={{ borderRadius: rounded }}
        aria-hidden
      />
      <LogoMark size={size * 0.56} />
    </span>
  )
}
