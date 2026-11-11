// Sheet: one component for every pop-up panel in the app.
// Phone (< sm): a bottom sheet with a drag handle, safe-area padding and an
// optional sticky footer (the Continue bar). Desktop (sm+): a centred dialog.
// Behaves like a real modal: role=dialog/aria-modal, moves focus in on open,
// keeps Tab inside, closes on Escape or backdrop tap, restores focus on close,
// and locks page scroll while open. Motion is calm and is neutralised by the
// global prefers-reduced-motion rule in index.css.
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

export type SheetProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** One plain sentence under the title. */
  description?: ReactNode
  /** Sticky bottom bar (e.g. the Continue button). Stays visible while the body scrolls. */
  footer?: ReactNode
  /** Desktop dialog width. Defaults to 'md'. */
  size?: 'md' | 'lg'
  /** Show the close (X) button. Defaults to true. */
  closeButton?: boolean
}

export function Sheet({
  open,
  title,
  onClose,
  children,
  description,
  footer,
  size = 'md',
  closeButton = true,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descId = useId()
  // Keep the latest onClose without re-running the focus effect (an inline
  // arrow from the parent would otherwise steal focus back on every render).
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
    ;(focusables()[0] ?? panel)?.focus()

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
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
      document.body.style.overflow = prevOverflow
      restoreRef.current?.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[85dvh] w-full flex-col rounded-t-panel border border-white/10 bg-ink2 shadow-lift outline-none',
          'animate-sheet-up sm:max-h-[80dvh] sm:rounded-panel sm:animate-dialog-in',
          size === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-md',
        )}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/20 sm:hidden" aria-hidden="true" />
        <div className="flex shrink-0 items-start gap-3 px-5 pt-3 sm:px-6 sm:pt-6">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-bold tracking-tight text-cream">{title}</h2>
            {description && (
              <p id={descId} className="mt-1 text-sm leading-relaxed text-sand-muted">{description}</p>
            )}
          </div>
          {closeButton && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone transition-colors hover:bg-white/5 hover:text-cream"
            >
              <X className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          )}
        </div>
        <div
          className={cn(
            'min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-5 pt-4 sm:px-6',
            footer ? 'pb-4' : 'pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-6',
          )}
        >
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-white/[0.07] px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// Back-compat: existing callers import the default export.
export default Sheet

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
      type="button"
      onClick={onPick}
      className={`w-full min-h-11 text-left rounded-2xl border p-3 active:scale-[0.99] transition ${
        selected ? 'border-coral bg-white/10' : 'border-white/15'
      }`}
    >
      <div className="font-medium text-cream">{label}</div>
      {reason && <div className="text-xs text-sand mt-0.5">{reason}</div>}
    </button>
  )
}
