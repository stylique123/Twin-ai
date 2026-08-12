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
import {
  loadProductEntities, loadProductSuggestions, updateEntityPresentation,
  claimProductEntity, listBrandVoices, OwnedEntityExistsError,
  type ProductSuggestion,
} from '@twinai/shared'
import type {
  ProductEntityRecord, Showability, EntityRelationship, EntityType, PersonalUse,
} from '@twinai/shared'
import { useAuth } from '../context/AuthContext'

/** ⚖️ THE TWO QUESTIONS THAT CANNOT BE SKIPPED OR DERIVED. `relationship` decides
 *  whether commercial language is permitted at all; `personalUse` decides whether
 *  "I use this" may be said. Owning a thing does not establish using it, and a
 *  commission establishes even less, so neither answer may be inferred from the
 *  other. Both are asked, in the creator's words, before anything is written. */
const RELATIONSHIP_CHOICES: Array<{ value: EntityRelationship; label: string }> = [
  { value: 'OWN_PRODUCT', label: 'I make or sell it' },
  { value: 'AFFILIATE', label: 'I earn a commission on it' },
  { value: 'SPONSOR', label: 'A sponsor pays me to feature it' },
  { value: 'REVIEW_ONLY', label: 'I just talk about it — no commercial tie' },
]

const TYPE_CHOICES: Array<{ value: EntityType; label: string }> = [
  { value: 'SAAS', label: 'Software or an app' },
  { value: 'PHYSICAL', label: 'A physical product' },
  { value: 'SERVICE', label: 'A service' },
  { value: 'DIGITAL', label: 'A digital product (course, template…)' },
]

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


/** The attestation. Two questions, both required, neither derivable.
 *
 *  ⚠️ THERE IS NO "CLAIM" SHORTCUT AND THERE MUST NOT BE. A one-tap button on a
 *  suggestion would write `relationship` and `personalUse` from a gesture that
 *  asserted nothing, which is the permission escalation the whole page is built
 *  to refuse. The cost of an entitlement is answering for it. */
function ClaimForm({ suggestion, onCancel, onClaim, busy }: {
  suggestion: ProductSuggestion
  onCancel: () => void
  busy: boolean
  onClaim: (a: {
    relationship: EntityRelationship; personalUse: PersonalUse
    type: EntityType; name: string
  }) => void
}) {
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState<EntityRelationship | null>(null)
  const [type, setType] = useState<EntityType | null>(null)
  const [personalUse, setPersonalUse] = useState<PersonalUse | null>(null)
  // ⚖️ EVERY ANSWER IS REQUIRED, INCLUDING THE NAME. A nameless entity reaches
  // the prompt as "the product", and an unanswered relationship has no default
  // that is safe — `NONE` would silently forbid, `OWN_PRODUCT` would silently
  // permit. So the button stays disabled rather than either.
  const ready = name.trim() !== '' && relationship !== null && type !== null && personalUse !== null

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-ink/5 p-3">
      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-ink/50">
          What do you call it?
        </label>
        <input
          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
          value={name}
          placeholder="The name you use on camera"
          onChange={(ev) => setName(ev.target.value)}
        />
      </div>

      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wide text-ink/50">
          What is it?
        </legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {TYPE_CHOICES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={`rounded-full border px-3 py-1 text-xs ${
                type === t.value ? 'border-ink bg-ink text-white' : 'border-ink/20'}`}
            >{t.label}</button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wide text-ink/50">
          Your relationship to it
        </legend>
        <div className="mt-1 space-y-1">
          {RELATIONSHIP_CHOICES.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`rel-${suggestion.id}`}
                checked={relationship === r.value}
                onChange={() => setRelationship(r.value)}
              />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        {/* ⚠️ ASKED SEPARATELY ON PURPOSE. Owning a product does not establish
            having used it, and a commission establishes less still. This is the
            answer that licenses "I use this every day"; the one above licenses
            commercial language. They are different permissions. */}
        <legend className="text-xs font-medium uppercase tracking-wide text-ink/50">
          Do you actually use it yourself?
        </legend>
        <div className="mt-1 flex gap-2">
          {([['CONFIRMED', 'Yes, I use it'], ['NOT_CONFIRMED', 'No, or not regularly']] as const)
            .map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setPersonalUse(v)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  personalUse === v ? 'border-ink bg-ink text-white' : 'border-ink/20'}`}
              >{label}</button>
            ))}
        </div>
      </fieldset>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => ready && onClaim({
            relationship: relationship!, personalUse: personalUse!, type: type!, name,
          })}
          className="rounded-lg bg-ink px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >{busy ? 'Adding…' : 'Add to my products'}</button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-ink/60">
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function ProductLibrary() {
  const [entities, setEntities] = useState<ProductEntityRecord[] | null>(null)
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [claimBusy, setClaimBusy] = useState(false)
  const { session } = useAuth()
  const [voiceId, setVoiceId] = useState<string | null>(null)

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
        // The voice an OWNED product is scoped to. Only needed to claim one, so
        // a failure here must not block the rest of the page.
        try {
          const voices = await listBrandVoices()
          if (alive) setVoiceId(voices[0]?.id ?? null)
        } catch { /* claiming an owned product will report it */ }
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

  async function claim(s: ProductSuggestion, a: {
    relationship: EntityRelationship; personalUse: PersonalUse; type: EntityType; name: string
  }) {
    // ⚠️ AN EMPTY OWNER ID MUST NOT REACH THE INSERT. RLS is owner-scoped, so a
    // blank id fails somewhere deep with a policy error that reads as a bug in
    // the product form. Say the real thing instead.
    const ownerId = session?.user?.id
    if (!ownerId) { setErr('Please sign in again before adding a product.'); return }
    // An OWNED product is scoped to a voice, and the partial unique index is on
    // that column — claiming one without a voice would write an unscoped row
    // that the entitlement reader in generate-blueprint never finds.
    if ((a.relationship === 'OWN_PRODUCT' || a.relationship === 'OWN_SERVICE') && !voiceId) {
      setErr('We could not find your brand voice, so this cannot be saved as a product you own yet.')
      return
    }
    setClaimBusy(true); setErr(null)
    try {
      const created = await claimProductEntity(ownerId, voiceId, a)
      if (created) {
        setEntities((prev) => [...(prev ?? []), created])
        // Drop it from the suggestions — it is claimed now, and leaving it there
        // invites a second claim of the same thing.
        setSuggestions((prev) => prev.filter((x) => x.id !== s.id))
      }
      setClaimingId(null)
    } catch (e) {
      // ⚖️ THE ONE-PRODUCT-PER-VOICE REFUSAL GETS ITS OWN MESSAGE. Falling back
      // to a generic failure would leave a creator retrying a thing that will
      // never succeed, with no idea why.
      setErr(e instanceof OwnedEntityExistsError
        ? e.message
        : e instanceof Error ? e.message : 'Could not add that product.')
    } finally {
      setClaimBusy(false)
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
                {claimingId === s.id ? (
                  <ClaimForm
                    suggestion={s}
                    busy={claimBusy}
                    onCancel={() => setClaimingId(null)}
                    onClaim={(a) => void claim(s, a)}
                  />
                ) : (
                  <button
                    type="button"
                    className="mt-2 rounded-lg border border-ink/20 px-3 py-1 text-xs"
                    onClick={() => setClaimingId(s.id)}
                  >This is mine</button>
                )}
              </li>
            ))}
          </ul>
          {/* ⚠️ "This is mine" OPENS QUESTIONS, IT DOES NOT CLAIM. The button
              could write `OWN_PRODUCT` directly and save four taps; that would be
              an entitlement granted by a gesture that asserted nothing, which is
              the escalation this whole page refuses. See `ClaimForm`. */}
          <p className="mt-3 text-xs text-ink/50">
            Nothing here is added to your products until you answer for it.
          </p>
        </section>
      )}
    </div>
  )
}
