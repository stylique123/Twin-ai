// A simple mobile bottom sheet for one-tap "change the recommendation" choices.
// Opens from the bottom, dims the rest, closes on backdrop tap, Escape, or pick.
// Keeps the change inline so the user never leaves the screen they're on.
// Declares role=dialog/aria-modal and behaves like one: moves focus into the
// sheet on open, keeps Tab cycling inside it, and restores focus on close.
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export default function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
    ;(focusables()[0] ?? panel)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      // Contain Tab inside the sheet (wrap at the edges).
      const els = focusables()
      if (!els.length) return
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      restoreRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} tabIndex={-1} className="relative w-full max-w-screen-sm bg-ink2 border border-white/10 rounded-t-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[80dvh] overflow-y-auto animate-[slideUp_.2s_ease] outline-none">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
        <h3 className="text-base font-bold text-cream mb-3">{title}</h3>
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  )
}

// A single selectable option row inside the sheet.
export function SheetOption({
  label,
  reason,
  selected,
  onPick,
}: {
  label: string
  reason?: string
  selected?: boolean
  onPick: () => void
}) {
  return (
    <button
      onClick={onPick}
      className={`w-full text-left rounded-2xl border p-3 active:scale-[0.99] transition ${
        selected ? 'border-coral bg-white/10' : 'border-white/15'
      }`}
    >
      <div className="font-medium text-cream">{label}</div>
      {reason && <div className="text-xs text-sand mt-0.5">{reason}</div>}
    </button>
  )
}
