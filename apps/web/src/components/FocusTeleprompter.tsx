// FOCUS MODE — the script alone, one line at a time, large enough to read from
// a propped-up phone. Nothing else on screen: no panels, no scores, no notes.
//
// ⚠️ AUDIT 2026-09-30: the page had everything except a way to just read the
// words. This is that way; recording still happens in the recorder.
import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

export function FocusTeleprompter({ lines, onClose }: { lines: readonly string[]; onClose: () => void }) {
  const said = lines.map((l) => l.trim()).filter(Boolean)
  const [i, setI] = useState(0)
  const last = Math.max(0, said.length - 1)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); setI((x) => Math.min(last, x + 1)) }
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [last, onClose])

  if (said.length === 0) return null
  return (
    <div role="dialog" aria-modal="true" aria-label="Focus teleprompter" data-testid="focus-teleprompter"
      className="fixed inset-0 z-50 flex flex-col bg-ink text-cream">
      <div className="flex items-center justify-between px-4 py-3 text-xs text-stone">
        <span>Line {i + 1} of {said.length}</span>
        <button type="button" onClick={onClose} aria-label="Close focus mode" className="rounded-full p-2 hover:text-cream">
          <X className="h-5 w-5" />
        </button>
      </div>
      <button type="button" onClick={() => setI((x) => Math.min(last, x + 1))}
        className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="max-w-3xl font-heading text-3xl leading-snug sm:text-5xl">{said[i]}</p>
      </button>
      <div className="flex items-center justify-between px-4 pb-6">
        <button type="button" disabled={i === 0} onClick={() => setI((x) => Math.max(0, x - 1))}
          className="flex items-center gap-1 rounded-full border border-white/10 px-4 py-2 text-xs disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <span className="text-[11px] text-stone">Tap the line or press space for the next one</span>
        <button type="button" disabled={i === last} onClick={() => setI((x) => Math.min(last, x + 1))}
          className="flex items-center gap-1 rounded-full border border-white/10 px-4 py-2 text-xs disabled:opacity-30">
          Next <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
