// Animated gradient-mesh backdrop in the brand palette. Pure CSS blobs + grid,
// GPU-friendly, sits behind hero/section content. Respects reduced-motion.
export function Aurora({ className = '' }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <div className="absolute -left-[10%] top-[-12%] h-[42rem] w-[42rem] rounded-full bg-amber/25 blur-[140px] animate-aurora" />
      <div
        className="absolute right-[-8%] top-[6%] h-[38rem] w-[38rem] rounded-full bg-coral/25 blur-[150px] animate-aurora"
        style={{ animationDelay: '-6s' }}
      />
      <div
        className="absolute left-[28%] bottom-[-18%] h-[34rem] w-[34rem] rounded-full bg-teal/20 blur-[150px] animate-aurora"
        style={{ animationDelay: '-12s' }}
      />
      <div className="absolute inset-0 bg-grid bg-[size:54px_54px] opacity-[0.5] [mask-image:radial-gradient(ellipse_at_center,#000_0%,transparent_72%)]" />
    </div>
  )
}
