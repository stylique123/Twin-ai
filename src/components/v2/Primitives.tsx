// Shared V2 UI atoms. Mobile-first, large readable cards, quiet secondary
// actions, soft premium surface. Used across all five V2 screens so they share
// one visual language. See docs/PRODUCT_VISION.md §16.
import type { ReactNode } from 'react'

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl bg-white/80 backdrop-blur border border-stone-200 shadow-sm p-4 ${onClick ? 'cursor-pointer active:scale-[0.99] transition' : ''} ${className}`}
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
      className="w-full rounded-2xl bg-stone-900 text-white font-semibold py-4 text-base disabled:opacity-40 active:scale-[0.99] transition"
    >
      {children}
    </button>
  )
}

export function QuietButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="text-sm text-stone-500 underline-offset-2 hover:underline">
      {children}
    </button>
  )
}

// The recommendation badge + one-line reason. Recommendation-first AI behavior.
export function RecommendedBadge({ reason }: { reason?: string }) {
  return (
    <div className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-medium px-2 py-0.5 w-fit">
        ★ Recommended
      </span>
      {reason && <span className="text-xs text-stone-500">{reason}</span>}
    </div>
  )
}

// One-tap "change this" affordance next to any recommendation.
export function ChangeButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-sm font-medium text-stone-700 rounded-full border border-stone-300 px-3 py-1 active:scale-95 transition">
      Change
    </button>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-stone-200/70 ${className}`} />
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide">{children}</h2>
}
