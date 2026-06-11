import { cn } from '../lib/cn'

// TwinAI mark — two mirrored chevrons (the "twin") inside a gradient-ringed tile,
// echoing the reference → reflection idea. Crisp at any size.
export function LogoMark({ className = '', size = 28 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn('relative grid place-items-center rounded-[10px]', className)}
      style={{ width: size, height: size }}
    >
      <span className="absolute inset-0 rounded-[10px] bg-signature opacity-90" />
      <span className="absolute inset-0 rounded-[10px] bg-signature blur-md opacity-50" aria-hidden />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="relative"
        style={{ width: size * 0.62, height: size * 0.62 }}
      >
        <path
          d="M7 6L11 12L7 18"
          stroke="#07070A"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M17 6L13 12L17 18"
          stroke="#07070A"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
        />
      </svg>
    </span>
  )
}

export function Logo({ className = '', size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 font-bold', className)}>
      <LogoMark size={size} />
      <span className="text-cream tracking-tight">
        Twin<span className="gradient-text">AI</span>
      </span>
    </span>
  )
}
