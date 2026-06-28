// A simple mobile bottom sheet for one-tap "change the recommendation" choices.
// Opens from the bottom, dims the rest, closes on backdrop tap or pick. Keeps the
// change inline so the user never leaves the screen they're on.
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
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onClose} />
      <div className="relative w-full max-w-screen-sm bg-white rounded-t-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[80dvh] overflow-y-auto animate-[slideUp_.2s_ease]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stone-300" />
        <h3 className="text-base font-bold text-stone-900 mb-3">{title}</h3>
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
        selected ? 'border-stone-900 bg-stone-50' : 'border-stone-200'
      }`}
    >
      <div className="font-medium text-stone-900">{label}</div>
      {reason && <div className="text-xs text-stone-500 mt-0.5">{reason}</div>}
    </button>
  )
}
