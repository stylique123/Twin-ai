import { useState } from 'react'
import {
  productDetailsByKind, missingProductDetails, showabilityForHoldUp, saveProductDetail, confirmProductFacts,
  type HoldUp, type ProductEntityRecord,
} from '@twinai/shared'

/**
 * Plan 1.4: the questions this kind of product needs, asked once per product
 * (product-details-by-type brief, aligned to the Need Check). Three required,
 * urgency optional. What Twin read off the page is shown first with a confirm,
 * so she is never asked for something the page already said.
 *
 * ⚖️ BEHIND THE TRIAL: shown only to the account in `VITE_TRIAL_USER_ID`. With
 * that unset, nobody sees it.
 */
export function trialUser(userId: string | null | undefined): boolean {
  const id = String(import.meta.env.VITE_TRIAL_USER_ID ?? '').trim()
  return id !== '' && userId === id
}

const HOLD_UP: Array<{ value: HoldUp; label: string }> = [
  { value: 'hold_up', label: 'Yes, I can hold it up' },
  { value: 'close_up', label: 'Only as a close-up' },
  { value: 'no', label: 'No' },
]

export function ProductDetailsByKind({ entity, onUpdated, onShowability }: {
  entity: ProductEntityRecord
  onUpdated: (e: ProductEntityRecord) => void
  onShowability: (value: 'ALWAYS' | 'NEVER') => Promise<void> | void
}) {
  const questions = productDetailsByKind(entity.type)
  const facts = entity.knowledge ?? []
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [holdUp, setHoldUp] = useState<HoldUp | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  if (questions.length === 0) return null
  const missing = new Set(missingProductDetails(entity.type, facts, entity.showability))

  async function run(key: string, fn: () => Promise<ProductEntityRecord | null>) {
    setBusy(key); setErr(null)
    try {
      const updated = await fn()
      if (updated) onUpdated(updated)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save that.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-sm font-semibold text-cream">Details for your scripts</p>
      <p className="mt-1 text-xs text-stone">
        Asked once for this product. {missing.size === 0 ? 'All three are answered.' : `${missing.size} of 3 still open.`}
      </p>
      {questions.map((q) => {
        const hers = facts.find((f) => f.field === q.writesTo && f.source === 'user_confirmed')
        const found = facts.filter((f) => f.field === q.writesTo && f.trust !== 'usable')
        const value = draft[q.key] ?? hers?.value ?? ''
        return (
          <div key={q.key} className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-stone">
              {q.prompt}{q.required && missing.has(q.key) ? ' *' : ''}
            </p>
            {found.slice(0, 2).map((f) => (
              <div key={f.value} className="mt-2 flex items-start gap-2 text-sm">
                <span className="flex-1 text-sand">Twin found this: “{f.value}”</span>
                <button
                  type="button"
                  className="rounded-md border border-white/15 px-2 py-0.5 text-xs"
                  disabled={busy !== null}
                  onClick={() => void run(q.key, () => confirmProductFacts(entity.id, [f.value]))}
                >
                  That’s right
                </button>
              </div>
            ))}
            {q.key === 'hold_up' && (
              <div className="mt-2 space-y-1">
                {HOLD_UP.map((o) => (
                  <label key={o.value} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name={`holdup-${entity.id}`}
                      className="mt-1"
                      checked={holdUp === o.value}
                      onChange={() => { setHoldUp(o.value); void onShowability(showabilityForHoldUp(o.value)) }}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <input
                className="flex-1 rounded-md border border-white/15 bg-transparent px-2 py-1 text-sm"
                placeholder={q.placeholder}
                value={value}
                onChange={(ev) => setDraft((d) => ({ ...d, [q.key]: ev.target.value }))}
              />
              <button
                type="button"
                className="rounded-md border border-white/15 px-3 py-1 text-xs"
                disabled={busy !== null || draft[q.key] === undefined}
                onClick={() => {
                  const v = q.key === 'hold_up' && holdUp ? `${holdUp.replace('_', ' ')}: ${value}`.trim() : value
                  void run(q.key, () => saveProductDetail(entity.id, q.writesTo, v))
                }}
              >
                {busy === q.key ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )
      })}
      {err && <p className="mt-3 text-xs text-red-300">{err}</p>}
    </div>
  )
}
