// The single mobile-first shell every V2 screen uses: a safe back button (never
// loses work — it just navigates), a one-line title for the screen's ONE job, a
// scrollable body with no horizontal overflow, and a sticky bottom CTA. Exactly
// one primary action per screen. See docs/PRODUCT_VISION.md §16.
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

export default function ScreenLayout({
  title,
  subtitle,
  onBack,
  cta,
  children,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  cta?: ReactNode
  children: ReactNode
}) {
  const nav = useNavigate()
  return (
    <div className="min-h-[100dvh] w-full max-w-screen-sm mx-auto flex flex-col bg-ink text-cream overflow-x-hidden">
      <header className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button
          onClick={() => (onBack ? onBack() : nav(-1))}
          aria-label="Back"
          className="shrink-0 h-9 w-9 grid place-items-center rounded-full bg-white/10 border border-white/15 hover:bg-white/20 active:scale-95 transition"
        >
          ←
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-cream truncate">{title}</h1>
          {subtitle && <p className="text-xs text-sand/70 truncate">{subtitle}</p>}
        </div>
      </header>

      <main className="flex-1 px-4 pb-28 overflow-y-auto space-y-4">{children}</main>

      {cta && (
        <div className="sticky bottom-0 inset-x-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-ink via-ink/95 to-transparent">
          <div className="max-w-screen-sm mx-auto">{cta}</div>
        </div>
      )}
    </div>
  )
}
