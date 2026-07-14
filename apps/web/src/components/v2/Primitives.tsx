// Shared V2 UI atoms. Mobile-first, large readable cards, quiet secondary
// actions, soft premium surface. Used across all five V2 screens so they share
// one visual language — the same dark ink/cream/sand/teal palette as the rest
// of the app (V2Capture, V2Review, BottomSheet). See docs/PRODUCT_VISION.md §16.
import type { ReactNode } from 'react'

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl bg-white/[0.04] backdrop-blur border border-white/10 shadow-sm p-4 ${onClick ? 'cursor-pointer active:scale-[0.99] transition' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function PrimaryButton({ children, onClick, disabled, type = 'button' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-2xl bg-cream text-ink font-semibold py-4 text-base disabled:opacity-40 hover:bg-white active:scale-[0.99] transition"
    >
      {children}
    </button>
  )
}

export function QuietButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="text-sm text-sand/70 underline-offset-2 hover:text-cream hover:underline">
      {children}
    </button>
  )
}

// The recommendation badge + one-line reason. Recommendation-first AI behavior.
export function RecommendedBadge({ reason }: { reason?: string }) {
  return (
    <div className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 rounded-full bg-teal/15 text-teal text-xs font-medium px-2 py-0.5 w-fit">
        ★ Recommended
      </span>
      {reason && <span className="text-xs text-sand/60">{reason}</span>}
    </div>
  )
}

// One-tap "change this" affordance next to any recommendation.


export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-sm font-semibold text-sand/70 uppercase tracking-wide">{children}</h2>
}
