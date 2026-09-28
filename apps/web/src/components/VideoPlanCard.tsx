// WHAT TWIN WILL USE, IN ONE TIDY BOX (owner, 2026-09-28).
//
// ⚠️ The earlier card listed eight truncated items (two of them the same cup
// score, one a legal deadline), a vague angle and three gap lines. Now:
//   · "What I'll use (N of M)", collapsed; open shows only facts that FIT this
//     idea, "See all" shows the rest;
//   · each item says where it came from, and legal/sensitive items, unconfirmed
//     numbers and "first/only" claims start OFF (the parent seeds them into the
//     excluded set); a struck item is never supplied to the writer;
//   · "What I don't have" appears only when it matters: a product-led video
//     with no product attached.
// The rules live in `planUse.ts` (shared) so they are tested, not guessed here.
import { useMemo, useState } from 'react'
import { buildVideoPlan, planUseItems, type VideoPlanInput } from '@twinai/shared'
import { cn } from '../lib/cn'

export function VideoPlanCard({
  input, about, excluded, onToggle, onWrite, needsProduct = false, onAddProduct, busy = false,
}: {
  input: VideoPlanInput
  /** Her paragraph and answers: what "fits this idea" is measured against. */
  about: string
  excluded: ReadonlySet<string>
  onToggle: (id: string) => void
  /** Absent when the card sits inside the questions screen, whose own button builds. */
  onWrite?: () => void
  /** The video promotes something, so a missing product matters. */
  needsProduct?: boolean
  onAddProduct?: () => void
  busy?: boolean
}) {
  const plan = buildVideoPlan(input)
  const items = useMemo(() => planUseItems(input.knowledge as never, about), [input.knowledge, about])
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  const on = items.filter((i) => !excluded.has(i.id))
  const shown = all ? items : items.filter((i) => i.fits)
  const productGap = needsProduct && plan.gaps.some((g) => g.basis === 'readyFacts')

  return (
    <div className="space-y-3" data-testid="video-plan">
      {items.length > 0 && (
        <div>
          <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
            <span className="text-sm text-cream">{open ? '▾' : '▸'} What I'll use ({on.length} of {items.length})</span>
            {open && items.some((i) => !i.fits) && (
              <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setAll(!all) }}
                className="text-xs text-stone underline underline-offset-2">{all ? 'Only what fits' : 'See all'}</span>
            )}
          </button>
          {open && (
            <ul className="mt-2 space-y-1.5">
              {shown.length === 0 && <li className="text-xs text-stone">Nothing on file fits this idea closely. Tap "See all" to choose.</li>}
              {shown.map((i) => {
                const off = excluded.has(i.id)
                return (
                  <li key={i.id}>
                    <button type="button" onClick={() => onToggle(i.id)} aria-pressed={!off}
                      className={cn('w-full rounded-lg border px-2.5 py-1.5 text-left text-[13px] leading-snug transition-colors',
                        off ? 'border-white/5 text-stone' : 'border-white/12 text-cream hover:border-white/25')}>
                      <span className={cn(off && 'line-through')}>{i.text}</span>
                      <span className="mt-0.5 block text-[11px] text-stone">{i.reason} · {off ? 'left out, tap to use' : 'in, tap to leave out'}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {productGap && (
        <p className="text-sm text-cream/90">
          No product attached.{' '}
          {onAddProduct
            ? <button type="button" onClick={onAddProduct} className="underline underline-offset-2">Add one</button>
            : 'Add one'}, or continue without.
        </p>
      )}

      {onWrite && (
        <button type="button" onClick={onWrite} disabled={busy}
          className={cn('rounded-full bg-cream px-4 py-2 text-sm font-medium text-ink', busy && 'opacity-60')}>
          Write it
        </button>
      )}
    </div>
  )
}
