// The single mobile-first shell every V2 screen uses: a safe back button (never
// loses work — it just navigates), a one-line title for the screen's ONE job, a
// scrollable body with no horizontal overflow, and a sticky bottom CTA. Exactly
// one primary action per screen. See docs/PRODUCT_VISION.md §16.
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Aurora } from '../Aurora'

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
  // A single-focus task screen (one input, one decision) reads well as a
  // comfortably wide CENTERED column on desktop — not a multi-pane split, and
  // not the mobile-width column left tiny on a huge monitor either.
  return (
    <div className="relative min-h-[100dvh] w-full max-w-screen-sm mx-auto flex flex-col bg-ink text-cream overflow-x-hidden lg:max-w-2xl lg:pt-6">
      {/* Brand canvas so the phone screens aren't a flat black slab — matches the
          desktop studio's colored aurora + ambient glows. */}
      <Aurora className="opacity-70" />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute left-1/2 top-12 h-64 w-64 -translate-x-1/2 rounded-full bg-coral/10 blur-[120px]" />
        <div className="absolute right-0 bottom-24 h-56 w-56 rounded-full bg-teal/10 blur-[110px]" />
      </div>
      <header className="relative flex items-center gap-3 px-4 pt-4 pb-2 lg:px-0 lg:pt-0 lg:pb-4">
        <button
          onClick={() => (onBack ? onBack() : nav(-1))}
          aria-label="Back"
          className="shrink-0 h-9 w-9 grid place-items-center rounded-full bg-white/10 border border-white/15 hover:bg-white/20 active:scale-95 transition lg:h-10 lg:w-10"
        >
          ←
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-cream truncate lg:text-2xl">{title}</h1>
          {subtitle && <p className="text-xs text-sand/70 truncate lg:text-sm">{subtitle}</p>}
        </div>
      </header>

      <main className="relative flex-1 px-4 pb-28 overflow-y-auto space-y-4 lg:px-0 lg:pb-8">{children}</main>

      {cta && (
        <div className="sticky bottom-0 inset-x-0 z-10 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-ink via-ink/95 to-transparent lg:static lg:bg-none lg:px-0 lg:pb-0">
          <div className="max-w-screen-sm mx-auto lg:max-w-none">{cta}</div>
        </div>
      )}
    </div>
  )
}
