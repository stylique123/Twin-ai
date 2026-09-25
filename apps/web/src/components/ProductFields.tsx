// THE PRODUCT FIELDS BOTH FORMS SHOW — ONE DEFINITION, TWO PLACES.
//
// ⚠️ REPORTED 2026-09-23: "Add a product" and the opened product asked for
// different things in different shapes — a single offer box on one, option/price
// rows on the other; the three story questions nowhere. Each field below is
// rendered by `StartFromLink` AND by the product panel in ProductLibrary.tsx, so
// a field changed here changes in both.
import { useEffect, useRef, useState } from 'react'
import { PRODUCT_STORY_QUESTIONS, PROMOTED_STORY_QUESTIONS, type ProductStories, type ProductStoryKey } from '@twinai/shared'
import { parseOffer, serializeOffer, type OfferRow } from '../lib/offerRows'

/** The labels, once. */
export const FIELD_LABEL = {
  name: 'Name',
  summary: 'In one line, what is it and who is it for?',
  offer: 'Options & prices',
  link: 'Link to its page',
  photos: 'Photos',
} as const

/**
 * A text box that saves on blur and NEVER loses what is being typed.
 *
 * ⚠️⚠️ WHY "In one line…" CAME BACK EMPTY. The panel's boxes were uncontrolled
 * and keyed on `updated_at`, so they remounted whenever ANY save returned. Edit
 * the name, tab into the one-line box, start typing — the name's save lands, the
 * box remounts from the stored (empty) value, and the half-typed sentence is gone
 * without ever firing blur, so it was never saved either. Production shows two
 * products edited after creation with no summary at all.
 *
 * ⚖️ CONTROLLED, KEYED ONLY BY PRODUCT, AND IT ADOPTS THE STORED VALUE ONLY WHILE
 * NOT FOCUSED — so the server's normalised value still shows after a save, and a
 * save of some other field can no longer wipe this one.
 */
export function BlurText({ value, onCommit, multiline, ...rest }: {
  value: string | null
  onCommit: (v: string) => void
  multiline?: boolean
  id?: string
  className?: string
  placeholder?: string
  'aria-label'?: string
  inputMode?: 'url' | 'text'
}) {
  const [draft, setDraft] = useState(value ?? '')
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setDraft(value ?? '') }, [value])
  const common = {
    ...rest,
    value: draft,
    onFocus: () => { focused.current = true },
    onChange: (ev: { target: { value: string } }) => setDraft(ev.target.value),
    // Reads the element, not the state: the same text either way in a browser,
    // and correct even when a blur arrives in the same tick as the last keystroke.
    onBlur: (ev: { target: { value: string } }) => { focused.current = false; onCommit(ev.target.value.trim()) },
  }
  return multiline ? <textarea rows={2} {...common} /> : <input type="text" {...common} />
}

/** "$28 (one of 3 prices on the page — …)" → "$28": the worker's note is for the
 *  writer; the row only needs the price. */
const stripUnlabeledNote = (v: string) => v.replace(/\s*\(one of \d+ prices on the page[^)]*\)\s*$/, '')

/** Options & prices as rows, stored as the one `offer` text the writer reads. */
export function OfferEditor({ value, found, onSave }: {
  value: string | null
  found: string[]
  onSave: (v: string | null) => void
}) {
  const initial = parseOffer(value)
  const [rows, setRows] = useState<OfferRow[]>(initial.rows.length ? initial.rows : [{ name: '', price: '' }])
  const [included, setIncluded] = useState(initial.included)
  const commit = (r = rows, inc = included) => onSave(serializeOffer(r, inc))
  const input = 'w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm'
  const foundClean = found.map(stripUnlabeledNote)
  const foundUnlabeled = parseOffer(foundClean.join('\n')).rows.filter((r) => !r.name).length
  const filled = rows.filter((r) => r.price.trim() !== '')
  const unnamed = filled.length > 1 && filled.some((r) => r.name.trim() === '')
  return (
    <div className="mt-1 space-y-2">
      {!value && found.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-teal/[0.06] px-3 py-2 text-xs text-sand">
          <span>
            Twin found {found.length} price{found.length === 1 ? '' : 's'} on your page.
            {/* ⚖️ SAID, NOT GUESSED: several prices with no names are almost
                always sizes or styles, and only she knows which is which. */}
            {foundUnlabeled > 1 && ` ${foundUnlabeled} have no option name — probably sizes or styles; name each one after using them.`}
          </span>
          <button type="button" className="font-medium text-teal underline" onClick={() => {
            const next = parseOffer(foundClean.join('\n')).rows
            setRows(next); commit(next)
          }}>Use them</button>
        </div>
      )}
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <input className={input} placeholder="Option, e.g. Small" aria-label={`Option ${i + 1}`}
            value={r.name}
            onChange={(ev) => setRows((p) => p.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))}
            onBlur={() => commit()} />
          <input className={`${input} max-w-[9rem]`} placeholder="Price" aria-label={`Price ${i + 1}`}
            value={r.price}
            onChange={(ev) => setRows((p) => p.map((x, j) => (j === i ? { ...x, price: ev.target.value } : x)))}
            onBlur={() => commit()} />
          <button type="button" aria-label={`Remove option ${i + 1}`}
            className="shrink-0 rounded-lg px-2 text-lg leading-none text-stone hover:text-cream"
            onClick={() => {
              const next = rows.filter((_, j) => j !== i)
              setRows(next.length ? next : [{ name: '', price: '' }]); commit(next)
            }}>×</button>
        </div>
      ))}
      {unnamed && (
        <p className="text-xs text-sand">
          {filled.length} prices, not all named — say which size or style each one is, so a script never quotes the wrong one.
        </p>
      )}
      <button type="button" className="text-xs font-medium text-teal"
        onClick={() => setRows((p) => [...p, { name: '', price: '' }])}>+ Add another option</button>
      <input className={input} placeholder="What's included (optional)" aria-label="What's included"
        value={included} onChange={(ev) => setIncluded(ev.target.value)} onBlur={() => commit()} />
    </div>
  )
}

/** The three optional story questions (CTO decision 2026-09-23). */
export function StoryFields({ value, onCommit, idPrefix, promoted = false }: {
  value: ProductStories | null
  onCommit: (key: ProductStoryKey, v: string) => void
  idPrefix: string
  /** Affiliate / sponsor items get questions about her use of it, not its making. */
  promoted?: boolean
}) {
  return (
    <div className="space-y-3">
      {(promoted ? PROMOTED_STORY_QUESTIONS : PRODUCT_STORY_QUESTIONS).map((q) => (
        <div key={q.key}>
          <label htmlFor={`${idPrefix}-${q.key}`} className="block text-xs font-medium uppercase tracking-wide text-stone">
            {q.label} <span className="normal-case tracking-normal text-stone/70">(optional)</span>
          </label>
          <BlurText id={`${idPrefix}-${q.key}`} multiline
            className="mt-1 w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm"
            placeholder={q.placeholder}
            value={value?.[q.key] ?? null}
            onCommit={(v) => onCommit(q.key, v)} />
        </div>
      ))}
    </div>
  )
}
