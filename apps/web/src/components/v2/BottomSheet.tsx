// Sheet: the app's pop-ups, built one for one from Create.dc.html / MCreate.dc.html.
//
// variant "dialog" = the "Add a product" pop-up.
//   <768  : bottom sheet, left/right/bottom 0, max-height 86%, radius 22 22 0 0.
//   768+  : centred dialog, 500px wide (max 560 on iPad per rule B), top 120px.
//   Surface #17171D, 1px white/12 border, padding 24, gap 14, scrim rgba(5,5,8,.6).
// variant "drawer" = the "Edit what Twin knows" panel.
//   <768  : full screen. 768+: right-hand panel, 470px, full height.
//   Surface #121217, left border white/10, padding 24, gap 16, scrim rgba(5,5,8,.55).
//
// Both are real modals: role=dialog + aria-modal, focus moves in (no forced
// ring for mouse/touch), Tab stays inside, Escape / scrim tap close, focus is
// restored on close, page scroll is locked.
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type SheetProps = {
  open: boolean
  /** Accessible name; also the visible title in the default dialog header. */
  title: string
  onClose: () => void
  children: ReactNode
  variant?: 'dialog' | 'drawer'
  /** One line under the title (default dialog header only). */
  description?: ReactNode
  /** Replaces the default header (e.g. the drawer's thumb + eyebrow + name). */
  header?: ReactNode
  /** Action row (Cancel / primary). Right-aligned like the boards. */
  footer?: ReactNode
}

/** The board's "Close" text button. */
export function SheetClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="shrink-0 border-0 bg-transparent p-0 text-[13.5px] leading-[normal] text-label hover:text-cream [@media(pointer:coarse)]:-my-3 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
    >
      Close
    </button>
  )
}

/** Drawer header from "Edit what Twin knows": 40px thumb, eyebrow, name, Close. */
export function DrawerHeader({ eyebrow, title, thumb, onClose }: { eyebrow: string; title: string; thumb?: ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-[11px] bg-placeholder">{thumb}</span>
      <span className="flex flex-grow flex-col">
        <span className="text-[12px] font-bold tracking-[.1em] text-label">{eyebrow}</span>
        <span className="text-[17px] font-bold text-cream">{title}</span>
      </span>
      <SheetClose onClose={onClose} />
    </div>
  )
}

export function Sheet({ open, title, onClose, children, variant = 'dialog', description, header, footer }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descId = useId()
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
    // No forced ring after a mouse/touch open; :focus-visible still shows it for Tab.
    ;(focusables()[0] ?? panel)?.focus({ focusVisible: false } as FocusOptions)

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return }
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
  const drawer = variant === 'drawer'
  return (
    <>
      <div
        className={cn('fixed inset-0', drawer ? 'z-[70] bg-[rgba(5,5,8,0.55)]' : 'z-[60] bg-[rgba(5,5,8,0.6)]')}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={header ? undefined : titleId}
        aria-label={header ? title : undefined}
        aria-describedby={!header && description ? descId : undefined}
        className={cn(
          'fixed box-border flex flex-col overflow-auto p-6 leading-[normal] text-cream outline-none',
          drawer
            ? 'inset-y-0 right-0 z-[71] w-full animate-cfdrawer gap-4 border-l border-white/10 bg-drawer md:w-[470px]'
            : [
                'inset-x-0 bottom-0 z-[61] max-h-[86%] animate-popin gap-[14px] rounded-t-[22px] border border-white/[0.12] bg-dialog shadow-[0_40px_90px_-20px_rgba(0,0,0,0.95)]',
                // Centred with auto margins: the board's popin animation ends on transform:none,
                // which would cancel a translate-based centring.
                'md:bottom-auto md:mx-auto md:top-[120px] md:max-h-[calc(100dvh-160px)] md:w-[min(560px,calc(100vw-48px))] md:rounded-[20px] lg:w-[500px]',
              ],
        )}
      >
        {header ?? (
          <div className="flex items-start justify-between gap-[10px]">
            <span className="flex flex-col gap-1">
              <span id={titleId} className="text-[18px] font-bold">{title}</span>
              {description && <span id={descId} className="text-[13.5px] text-label">{description}</span>}
            </span>
            <SheetClose onClose={onClose} />
          </div>
        )}
        {children}
        {footer && (
          <div className={cn('flex justify-end gap-[10px]', drawer ? 'mt-auto pt-2' : 'pt-1')}>{footer}</div>
        )}
      </div>
    </>
  )
}

// Back-compat: existing callers import the default export.
export default Sheet

// A single selectable option row inside a sheet (existing V2Capture sheets).
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
