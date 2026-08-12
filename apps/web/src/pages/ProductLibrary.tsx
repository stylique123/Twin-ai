// THE PAGE THAT WAS REFERRED TO BUT NEVER BUILT.
//
// ⚠️ THREE COMMENTS IN `Onboarding.tsx` TOLD CREATORS TO CORRECT THINGS "in the
// Product Library", and there was no route, no component, and a complete reader
// (`loadProductEntities`) with no caller anywhere in the repo. That is why
// `product_entities` held zero rows in production for its entire existence: the
// only writer was a single tap during onboarding, with no way to revisit it, and
// a mint that failed was swallowed as a console warning. `generate-blueprint`
// then read the empty table and told every script the creator had no product.
//
// ── WHAT A CREATOR MAY CHANGE HERE, AND WHAT THEY MAY NOT ─────────────────
//
// ⚖️ THIS PAGE EDITS PRESENTATION, NEVER ENTITLEMENT. `relationship` and
// `personalUse` decide whether a commercial CTA is permitted, whether disclosure
// is required, and whether a marketing claim may be attributed to this person. A
// settings page that let them pick `OWN_PRODUCT` and `CONFIRMED` from two
// dropdowns would hand over every one of those permissions for a tap, with
// nothing on record that they ever asserted it — a permission escalator wearing
// a settings page's clothes.
//
// So those fields are RENDERED AND READ-ONLY, and the restriction is enforced in
// `updateEntityPresentation`, whose argument type cannot express them. Enforcing
// it here instead would mean the guarantee lasts exactly as long as the next
// person to edit this file remembers it.
//
// ── THE SUGGESTIONS ARE NOT A BACKFILL ────────────────────────────────────
//
// ⚠️ 64 ROWS OF `kind='product'` SIT IN `creator_knowledge`, EXTRACTED AND
// UNUSED, and writing them into `product_entities` would empty the table problem
// overnight. It would also be wrong. Knowing a creator said "Peak Design Phone
// Tripod" is evidence they mentioned it and no evidence whatsoever that they own
// it, use it, or may claim anything about it. Traceability is not entitlement.
//
// ⚖️ SO THEY APPEAR AS UNCLAIMED SUGGESTIONS. The list turns "add your product"
// from a blank field into things they demonstrably talked about; claiming one
// still costs an explicit assertion. What the suggestion saves is typing, which
// is the difference between a page nobody fills in and one they finish.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  loadProductEntities, loadProductSuggestions, updateEntityPresentation,
  type ProductSuggestion,
} from '@twinai/shared'
import type { ProductEntityRecord, Showability } from '@twinai/shared'

const SHOW_OPTIONS: Array<{ value: Showability; label: string; note: string }> = [
  { value: 'ALWAYS', label: 'Always', note: 'A scene may show it directly.' },
  { value: 'SOMETIMES', label: 'Sometimes', note: 'It can be mentioned; no scene will depend on it.' },
  { value: 'NEVER', label: 'Never', note: 'Scripts stay talking-only for this one.' },
  { value: 'UNKNOWN', label: 'Not set', note: 'Treated as "cannot dependably show".' },
]

/** Plain-language names for the fields a creator cannot change here. Showing the
 *  value with no explanation reads as a bug; showing it with one reads as a
 *  decision, which is what it is. */
const RELATIONSHIP_LABEL: Record<string, string> = {
  OWN_PRODUCT: 'You own this product',
  OWN_SERVICE: 'You own this service',
  AFFILIATE: 'You earn a commission on it',
  SPONSOR: 'A sponsor pays you to feature it',
  REVIEW_ONLY: 'You review it, with no commercial tie',
  NONE: 'No commercial relationship',
}

export default function ProductLibrary() {
  const [entities, setEntities] = useState<ProductEntityRecord[] | null>(null)
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await loadProductEntities()
        if (!alive) return
        setEntities(rows)
        // ⚖️ SUGGESTIONS ARE LOADED SEPARATELY AND MAY FAIL ALONE. They are a
        // convenience; the entities are the page. A knowledge-table error must
        // not blank out the products a creator actually registered.
        try {
          const s = await loadProductSuggestions(rows)
          if (alive) setSuggestions(s)
        } catch { /* the page works without them */ }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : 'Could not load your products.')
      }
    })()
    return () => { alive = false }
  }, [])

  async function save(id: string, edit: Parameters<typeof updateEntityPresentation>[1]) {
    setSavingId(id); setErr(null)
    try {
      const updated = await updateEntityPresentation(id, edit)
      // ⚠️ RE-READ, DO NOT ECHO. Rendering the value we sent rather than the one
      // the database returned is precisely how onboarding came to believe it had
      // saved a product it had not.
      if (updated) setEntities((prev) => (prev ?? []).map((e) => (e.id === id ? updated : e)))
      setSaved(id)
      window.setTimeout(() => setSaved((s) => (s === id ? null : s)), 2000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save that change.')
    } finally {
      setSavingId(null)
    }
  }

  if (err && entities === null) {
    return <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{err}</p>
  }
  if (entities === null) return <p className="text-sm text-ink/60">Loading your products…</p>

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6">
      <header>
        <h1 className="text-2xl font-semibold">Product Library</h1>
        <p className="mt-1 text-sm text-ink/60">
          What your scripts are allowed to show and say about the things you make or promote.
        </p>
      </header>

      {err && <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{err}</p>}

      {entities.length === 0 && (
        <p className="rounded-lg border border-ink/10 px-4 py-6 text-sm text-ink/70">
          You have not registered a product yet. Until you do, your scripts will not assume
          you have one — they will not invent a product for you, and they will not build a
          scene around showing one.
        </p>
      )}

      {entities.map((e) => (
        <section key={e.id} className="rounded-xl border border-ink/10 p-4">
          <label className="block text-xs font-medium uppercase tracking-wide text-ink/50">
            Name
          </label>
          <input
            className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
            defaultValue={e.name ?? ''}
            placeholder="What you call it on camera"
            onBlur={(ev) => {
              const v = ev.target.value.trim()
              if (v !== (e.name ?? '')) void save(e.id, { name: v || null })
            }}
          />

          <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-ink/50">
            Link
          </label>
          <input
            className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
            defaultValue={e.productUrl ?? ''}
            placeholder="https://"
            onBlur={(ev) => {
              const v = ev.target.value.trim()
              if (v !== (e.productUrl ?? '')) void save(e.id, { productUrl: v || null })
            }}
          />

          <fieldset className="mt-4">
            <legend className="text-xs font-medium uppercase tracking-wide text-ink/50">
              Can you put it on screen?
            </legend>
            <div className="mt-2 space-y-1">
              {SHOW_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`show-${e.id}`}
                    className="mt-1"
                    checked={e.showability === o.value}
                    onChange={() => void save(e.id, { showability: o.value })}
                  />
                  <span>
                    {o.label}
                    <span className="block text-xs text-ink/50">{o.note}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* ⚖️ READ-ONLY, AND SAID SO PLAINLY. A greyed-out control with no
              explanation reads as broken; naming why it cannot change here tells
              the creator what to do instead. */}
          <div className="mt-4 rounded-lg bg-ink/5 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/50">
              Your relationship to it
            </p>
            <p className="mt-1 text-sm">
              {RELATIONSHIP_LABEL[e.relationship] ?? e.relationship}
              {e.personalUse === 'CONFIRMED' && ' — and you use it yourself'}
            </p>
            <p className="mt-1 text-xs text-ink/50">
              This decides what your scripts may claim, so it is not editable here.
              Ask us to change it and we will record what changed and when.
            </p>
          </div>

          <p className="mt-3 h-4 text-xs text-ink/50">
            {savingId === e.id ? 'Saving…' : saved === e.id ? 'Saved.' : ''}
          </p>
        </section>
      ))}

      {suggestions.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">Products you have mentioned</h2>
          <p className="mt-1 text-sm text-ink/60">
            Picked up from your own videos. We have not assumed any of these are yours —
            tell us which are and what your relationship to them is, and your scripts can
            start using them.
          </p>
          <ul className="mt-3 space-y-2">
            {suggestions.map((s) => (
              <li key={s.id} className="rounded-lg border border-ink/10 px-3 py-2 text-sm">
                <p>{s.text}</p>
                <p className="mt-1 text-xs text-ink/50">
                  {s.basis === 'stated' ? 'You said this' : 'From a video description'}
                  {s.timesSeen > 1 && ` · mentioned ${s.timesSeen} times`}
                </p>
              </li>
            ))}
          </ul>
          {/* ⚠️ NO ONE-TAP CLAIM BUTTON YET, ON PURPOSE. Claiming a product sets
              `relationship` and `personalUse`, which is the entitlement decision
              this page deliberately refuses to make from a single tap. The
              attestation flow that records what was asserted and when is the next
              piece of work; shipping a button that quietly wrote `OWN_PRODUCT`
              would be the escalation the rest of this file exists to prevent. */}
          <p className="mt-3 text-xs text-ink/50">
            Claiming a product needs a couple of questions about your relationship to it —
            that flow is coming next. Until then, <Link className="underline" to="/settings">
            Settings</Link> is the place to ask us to add one.
          </p>
        </section>
      )}
    </div>
  )
}
