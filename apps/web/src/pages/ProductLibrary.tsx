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
  claimProductEntity, deleteProductEntity, archiveProductEntity, restoreProductEntity,
  requestProductExtraction, confirmProductFacts,
  listBrandVoices, OwnedEntityExistsError, ProductLibraryFullError,
  isStale, factAgeDays,
  type ProductSuggestion,
} from '@twinai/shared'
import type {
  ProductEntityRecord, Showability, EntityRelationship, EntityType, PersonalUse,
  ExtractedFact as ProductFact,
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

/** ⚖️ ORDERED BY HOW OFTEN CREATORS PICK THEM, not by the enum. `OTHER` sits
 *  last and is deliberately offered: forcing a misclassification is worse than
 *  an unspecific answer, because `inferShowability` reads this to tell the
 *  Director what it may ask for on camera. */
const TYPE_CHOICES: Array<{ value: EntityType; label: string }> = [
  { value: 'SAAS', label: 'Software' },
  { value: 'APP', label: 'A mobile app' },
  { value: 'PHYSICAL_PRODUCT', label: 'A physical product' },
  { value: 'DIGITAL_PRODUCT', label: 'A digital product (template, preset…)' },
  { value: 'COURSE', label: 'A course' },
  { value: 'COMMUNITY', label: 'A community or membership' },
  { value: 'SERVICE', label: 'A service' },
  { value: 'MARKETPLACE', label: 'A marketplace or store' },
  { value: 'OTHER', label: 'Something else' },
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
  // ⚠️ OPTIONAL, AND THAT WAS THE BUG. This form shipped reachable ONLY from a
  // suggestion, so a creator whose product the extractor never saw could not
  // register it AT ALL — 6 of 17 owners in production had no suggestions and so
  // no way in. The attestation was never the part that needed a suggestion; the
  // suggestion only ever saved typing.
  suggestion?: ProductSuggestion | null
  onCancel: () => void
  busy: boolean
  onClaim: (a: {
    relationship: EntityRelationship; personalUse: PersonalUse
    type: EntityType; name: string
  }) => void
}) {
  // ⚖️ NOT PREFILLED FROM THE SUGGESTION TEXT. A suggestion is a CLAIM — "Early
  // is an iOS alarm app that requires push-ups" — not a name. Dropping that into
  // the name field would put a sentence where the prompt expects a noun.
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
    <div className="mt-3 space-y-3 rounded-lg bg-white/[0.03] p-3">
      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-stone">
          What do you call it?
        </label>
        <input
          className="mt-1 w-full rounded-lg border border-white/12 px-3 py-2 text-sm"
          value={name}
          placeholder="The name you use on camera"
          onChange={(ev) => setName(ev.target.value)}
        />
      </div>

      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wide text-stone">
          What is it?
        </legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {TYPE_CHOICES.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={type === t.value}
              onClick={() => setType(t.value)}
              className={`rounded-full border px-3 py-1 text-xs ${
                type === t.value
                  ? 'border-coral/50 bg-coral/[0.08] text-cream'
                  : 'border-white/10 bg-white/[0.02] text-sand hover:border-white/20'}`}
            >{t.label}</button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wide text-stone">
          Your relationship to it
        </legend>
        <div className="mt-1 space-y-1">
          {RELATIONSHIP_CHOICES.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`rel-${suggestion?.id ?? 'new'}`}
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
        <legend className="text-xs font-medium uppercase tracking-wide text-stone">
          Do you actually use it yourself?
        </legend>
        <div className="mt-1 flex gap-2">
          {([['CONFIRMED', 'Yes, I use it'], ['NOT_CONFIRMED', 'No, or not regularly']] as const)
            .map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={personalUse === v}
                onClick={() => setPersonalUse(v)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  personalUse === v
                    ? 'border-coral/50 bg-coral/[0.08] text-cream'
                    : 'border-white/10 bg-white/[0.02] text-sand hover:border-white/20'}`}
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
          className="btn-gradient rounded-lg px-3 py-1.5 text-sm disabled:opacity-40"
        >{busy ? 'Adding…' : 'Add to my products'}</button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-sand">
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
  // `addingNew` is the same attestation with no suggestion behind it.
  const [addingNew, setAddingNew] = useState(false)
  // Removal is confirmed in place rather than with a window.confirm, so the
  // consequence can be SPELLED OUT — a browser dialog cannot say what is lost.
  const [removingId, setRemovingId] = useState<string | null>(null)
  // Loaded WITH archived so the page can show what was withdrawn. The live list
  // stays the default everywhere else.
  const [archivedAll, setArchived] = useState<ProductEntityRecord[] | null>(null)
  const [learnUrl, setLearnUrl] = useState<Record<string, string>>({})
  const [learning, setLearning] = useState<string | null>(null)
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
          loadProductEntities({ includeArchived: true }).then((all) => {
          if (alive) setArchived(all)
        }).catch(() => { /* the archive view is optional */ })
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

  async function claim(s: ProductSuggestion | null, a: {
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
        if (s) setSuggestions((prev) => prev.filter((x) => x.id !== s.id))
      }
      setClaimingId(null)
      setAddingNew(false)
    } catch (e) {
      // ⚖️ THE ONE-PRODUCT-PER-VOICE REFUSAL GETS ITS OWN MESSAGE. Falling back
      // to a generic failure would leave a creator retrying a thing that will
      // never succeed, with no idea why.
      // ⚖️ THREE DISTINCT SITUATIONS, THREE DISTINCT MESSAGES. A correctness
      // refusal ("already added") shown to someone at their plan cap sends them
      // hunting for a duplicate that does not exist; a commercial refusal shown
      // to a replayed mint invites them to buy their way out of our bug.
      setErr(e instanceof ProductLibraryFullError
        ? `${e.message} Archive a product you no longer use, or upgrade your plan.`
        : e instanceof OwnedEntityExistsError
          ? e.message
          : e instanceof Error ? e.message : 'Could not add that product.')
    } finally {
      setClaimBusy(false)
    }
  }

  async function archive(id: string) {
    setErr(null)
    try {
      await archiveProductEntity(id)
      // Re-read rather than mutating in place: `loadProductEntities` decides what
      // "live" means, and duplicating that rule here is how the two drift.
      setEntities(await loadProductEntities())
      setArchived(await loadProductEntities({ includeArchived: true }))
      setRemovingId(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not archive that product.')
    }
  }

  async function restore(id: string) {
    setErr(null)
    try {
      await restoreProductEntity(id)
      setEntities(await loadProductEntities())
      setArchived(await loadProductEntities({ includeArchived: true }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not restore that product.')
    }
  }

  async function learn(id: string) {
    const url = (learnUrl[id] ?? '').trim()
    setErr(null)
    const ownerId = session?.user?.id
    if (!ownerId) { setErr('Please sign in again.'); return }
    setLearning(id)
    try {
      await requestProductExtraction(ownerId, id, url)
      // ⚖️ POLLS THE ENTITY, NOT THE JOB. A creator who reloads or comes back
      // tomorrow sees whatever the worker got to; watching a job id would lose
      // the result the moment the tab did.
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => window.setTimeout(r, 3000))
        const rows = await loadProductEntities()
        const found = rows.find((e) => e.id === id)
        if (found && found.knowledge !== null) { setEntities(rows); break }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not read that page.')
    } finally {
      setLearning(null)
    }
  }

  async function confirmFact(id: string, value: string) {
    setErr(null)
    try {
      const updated = await confirmProductFacts(id, [value])
      if (updated) setEntities((prev) => (prev ?? []).map((e) => (e.id === id ? updated : e)))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not confirm that.')
    }
  }

  async function remove(id: string) {
    setErr(null)
    try {
      await deleteProductEntity(id)
      setEntities((prev) => (prev ?? []).filter((e) => e.id !== id))
      setRemovingId(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not remove that product.')
    }
  }

  if (err && entities === null) {
    return <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{err}</p>
  }
  if (entities === null) return <p className="text-sm text-sand">Loading your products…</p>

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6">
      {/* ⚠️ THE ACTION WAS ONLY REACHABLE FROM AN EMPTY STATE HALF A SCREEN
          DOWN, UNDER A PARAGRAPH. A creator who scrolled past it, or who had one
          product already, had to hunt for the way to add another. The primary
          thing you can do on a page belongs beside its title. */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Product Library</h1>
          <p className="mt-1 text-sm text-sand">
            The things you sell or promote, and what your scripts are allowed to say and
            show about each one.
          </p>
        </div>
        {!addingNew && (
          <button
            type="button"
            className="btn-gradient shrink-0 rounded-lg px-3 py-1.5 text-sm"
            onClick={() => setAddingNew(true)}
          >Add a product</button>
        )}
      </header>

      {err && <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{err}</p>}

      {entities.length === 0 && !addingNew && (
        <div className="rounded-lg border border-white/10 px-4 py-6 text-sm text-sand">
          <p>
            You have not registered a product yet. Until you do, your scripts will not assume
            you have one — they will not invent a product for you, and they will not build a
            scene around showing one.
          </p>
          {/* ⚠️ THE EMPTY STATE USED TO BE A DEAD END. The only way in was a
              suggestion the extractor had already found, so a creator whose
              product was never mentioned on camera could not register it at all —
              and the page they were sent to told them, accurately, that they had
              no product and offered no way to fix that. */}
          <button
            type="button"
            className="mt-4 btn-gradient rounded-lg px-3 py-1.5 text-sm"
            onClick={() => setAddingNew(true)}
          >Add a product</button>
        </div>
      )}

      {addingNew && (
        <section className="rounded-xl border border-white/10 p-4">
          <h2 className="text-sm font-semibold">Add a product</h2>
          <ClaimForm
            busy={claimBusy}
            onCancel={() => setAddingNew(false)}
            onClaim={(a) => void claim(null, a)}
          />
        </section>
      )}

      {entities.length > 0 && !addingNew && (
        <button
          type="button"
          className="rounded-lg border border-white/15 px-3 py-1.5 text-sm"
          onClick={() => setAddingNew(true)}
        >Add another product</button>
      )}

      {entities.map((e) => (
        <section key={e.id} className="rounded-xl border border-white/10 p-4">
          <label className="block text-xs font-medium uppercase tracking-wide text-stone">
            Name
          </label>
          <input
            className="mt-1 w-full rounded-lg border border-white/12 px-3 py-2 text-sm"
            defaultValue={e.name ?? ''}
            placeholder="What you call it on camera"
            onBlur={(ev) => {
              const v = ev.target.value.trim()
              if (v !== (e.name ?? '')) void save(e.id, { name: v || null })
            }}
          />

          <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-stone">
            Link
          </label>
          <input
            className="mt-1 w-full rounded-lg border border-white/12 px-3 py-2 text-sm"
            defaultValue={e.productUrl ?? ''}
            placeholder="https://"
            onBlur={(ev) => {
              const v = ev.target.value.trim()
              if (v !== (e.productUrl ?? '')) void save(e.id, { productUrl: v || null })
            }}
          />

          <fieldset className="mt-4">
            <legend className="text-xs font-medium uppercase tracking-wide text-stone">
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
                    <span className="block text-xs text-stone">{o.note}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* ── WHAT TWIN KNOWS ABOUT THIS PRODUCT ───────────────────────
              ⚖️ NULL AND EMPTY SAY DIFFERENT THINGS. "Never extracted" offers a
              link; "read it and found nothing" says so, rather than pretending
              nobody ever tried. Same `unset ≠ false` rule as everywhere else. */}
          <div className="mt-4 rounded-lg border border-white/10 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-stone">
              What Twin knows about it
            </p>

            {e.knowledge === null ? (
              <>
                <p className="mt-1 text-sm text-sand">
                  Paste a link to its page and Twin will read it, so your scripts can say
                  what it actually does instead of guessing.
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    className="w-full rounded-lg border border-white/12 px-3 py-2 text-sm"
                    placeholder="https://"
                    value={learnUrl[e.id] ?? ''}
                    onChange={(ev) => setLearnUrl((p) => ({ ...p, [e.id]: ev.target.value }))}
                  />
                  <button
                    type="button"
                    disabled={learning === e.id || (learnUrl[e.id] ?? '').trim() === ''}
                    className="whitespace-nowrap btn-gradient rounded-lg px-3 py-1.5 text-sm disabled:opacity-40"
                    onClick={() => void learn(e.id)}
                  >{learning === e.id ? 'Reading…' : 'Read the page'}</button>
                </div>
                {learning === e.id && (
                  <p className="mt-2 text-xs text-stone">
                    This keeps running if you leave — come back and it will be here.
                  </p>
                )}
              </>
            ) : e.knowledge.length === 0 ? (
              <p className="mt-1 text-sm text-sand">
                Twin read that page and could not find anything usable on it. You can still
                describe the product yourself.
              </p>
            ) : (
              <>
                <ul className="mt-2 space-y-1">
                  {e.knowledge.filter((f) => f.trust === 'usable').map((f) => (
                    <li key={`u-${f.field}-${f.value}`} className="text-sm">
                      <span className="text-stone">{f.field}: </span>{f.value}
                      <FactAge fact={f} />
                    </li>
                  ))}
                </ul>
                {e.knowledge.some((f) => f.trust === 'needs_confirmation') && (
                  <div className="mt-3 rounded-lg bg-amber-500/10 p-2">
                    {/* ⚠️ THE POINT OF THE WHOLE SPLIT. These came off a page and
                        carry a number or promise a result, so they are stored,
                        shown, and NOT given to the writer until a person says
                        they are true. Confirming is per fact — one tap that
                        approved a dozen claims would be the escalation the claim
                        flow already refuses. */}
                    <p className="text-xs text-sand">
                      Twin found these but will not say them until you confirm each one —
                      they claim a number or a result.
                    </p>
                    <ul className="mt-2 space-y-1">
                      {e.knowledge.filter((f) => f.trust === 'needs_confirmation').map((f) => (
                        <li key={`n-${f.field}-${f.value}`} className="flex items-start justify-between gap-2 text-sm">
                          <span>
                            <span className="text-stone">{f.field}: </span>{f.value}
                            <FactAge fact={f} />
                          </span>
                          <button
                            type="button"
                            className="whitespace-nowrap text-xs underline"
                            onClick={() => void confirmFact(e.id, f.value)}
                          >That's right</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ⚖️ READ-ONLY, AND SAID SO PLAINLY. A greyed-out control with no
              explanation reads as broken; naming why it cannot change here tells
              the creator what to do instead. */}
          <div className="mt-4 rounded-lg bg-white/[0.03] px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-stone">
              Your relationship to it
            </p>
            <p className="mt-1 text-sm">
              {RELATIONSHIP_LABEL[e.relationship] ?? e.relationship}
              {e.personalUse === 'CONFIRMED' && ' — and you use it yourself'}
            </p>
            <p className="mt-1 text-xs text-stone">
              This decides what your scripts may claim, so it is not editable here.
              Ask us to change it and we will record what changed and when.
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <p className="h-4 text-xs text-stone">
              {savingId === e.id ? 'Saving…' : saved === e.id ? 'Saved.' : ''}
            </p>
            {removingId === e.id ? (
              // ⚖️ TWO WAYS OUT, AND THEY ARE NOT THE SAME ACT. Archiving
              // withdraws the product from FUTURE videos and keeps the record,
              // so scripts already written about it still resolve what they
              // referred to. Removing destroys it. The spec prefers archive
              // wherever scripts may already reference the entity, which is
              // every entity that has been used even once — so archive leads and
              // delete is the smaller, explicitly destructive choice.
              <span className="text-xs">
                <span className="text-sand">
                  Archiving stops Twin using it in new videos; your existing scripts keep
                  their record of it. Removing deletes it entirely.
                </span>
                <button
                  type="button"
                  className="ml-2 font-medium"
                  onClick={() => void archive(e.id)}
                >Archive</button>
                <button
                  type="button"
                  className="ml-2 text-coral"
                  onClick={() => void remove(e.id)}
                >Delete for good</button>
                <button
                  type="button"
                  className="ml-2 text-stone"
                  onClick={() => setRemovingId(null)}
                >Keep</button>
              </span>
            ) : (
              <button
                type="button"
                className="text-xs text-stone underline"
                onClick={() => setRemovingId(e.id)}
              >Archive or remove</button>
            )}
          </div>
        </section>
      ))}

      {(archivedAll ?? []).filter((a) => a.archivedAt).length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">Archived</h2>
          <p className="mt-1 text-sm text-sand">
            Twin will not use these in new videos. Scripts you have already made keep their
            record of them.
          </p>
          <ul className="mt-3 space-y-2">
            {(archivedAll ?? []).filter((a) => a.archivedAt).map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
                <span>
                  {a.name ?? 'Unnamed product'}
                  <span className="block text-xs text-stone">
                    {RELATIONSHIP_LABEL[a.relationship] ?? a.relationship}
                  </span>
                </span>
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => void restore(a.id)}
                >Restore</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {suggestions.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">Things you talked about in your videos</h2>
          {/* ⚠️ THE HEADING WAS THE ONLY EXPLANATION AND IT SOUNDED LIKE A LIST
              OF PRODUCTS THE CREATOR ALREADY HAD. What it actually is: sentences
              lifted from their own transcripts, owned by nobody, doing nothing
              until someone claims one. Both facts have to be said, because a
              list that looks finished invites no action. */}
          <p className="mt-1 text-sm text-sand">
            These are sentences from your own videos — we have not added any of them to
            your products, and none of them affect your scripts yet. If one of these is
            yours, say so and we will ask a few questions about it.
          </p>
          <ul className="mt-3 space-y-2">
            {suggestions.map((s) => (
              <li key={s.id} className="rounded-lg border border-white/10 px-3 py-2 text-sm">
                <p>{s.text}</p>
                <p className="mt-1 text-xs text-stone">
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
                  // ⚖️ THE LABEL NOW SAYS WHAT THE TAP DOES. "This is mine"
                  // reads as the claim itself, and it is not one — it opens four
                  // questions, which is the whole point of the page. A button
                  // that promises more than it performs is how a creator decides
                  // the page is broken when nothing appears to happen.
                  <button
                    type="button"
                    className="mt-2 rounded-lg border border-white/15 px-3 py-1 text-xs text-cream hover:border-white/30"
                    onClick={() => setClaimingId(s.id)}
                  >This one is mine — add it</button>
                )}
              </li>
            ))}
          </ul>
          {/* ⚠️ "This is mine" OPENS QUESTIONS, IT DOES NOT CLAIM. The button
              could write `OWN_PRODUCT` directly and save four taps; that would be
              an entitlement granted by a gesture that asserted nothing, which is
              the escalation this whole page refuses. See `ClaimForm`. */}
          <p className="mt-3 text-xs text-stone">
            Nothing here is added to your products until you answer for it. Anything we
            missed, you can add yourself.
          </p>
        </section>
      )}
    </div>
  )
}

/** HOW OLD THIS FACT IS, AND WHERE IT CAME FROM.
 *
 *  ⚠️ `extractedAt` AND `sourceUrl` WERE STORED ON EVERY FACT AND READ BY
 *  NOTHING. The timestamp's own definition says why it exists — "Pricing ages in
 *  weeks; a category does not" — and the URL's says "so a creator correcting it
 *  can go and look". Neither reached a screen, so a creator had no way to tell a
 *  price read this morning from one read in the spring, and no way to check a
 *  fact they doubted.
 *
 *  ⚖️ STALE IS A PROMPT, NOT A WARNING. A four-month-old price is probably still
 *  right. This marks it worth a glance and links the page it came from; nothing
 *  is refused and no script is blocked, because blocking on a maybe would stop a
 *  creator working for no gain.
 *
 *  ⚖️ AND THE AGE IS ONLY SHOWN WHEN IT MEANS SOMETHING. Stamping every line
 *  with "read 2 days ago" is noise that trains people to stop reading the line —
 *  the same way a staleness indicator on a product's NAME would. */
function FactAge({ fact }: { fact: ProductFact }) {
  const stale = isStale(fact, new Date())
  const days = factAgeDays(fact, new Date())
  if (!stale) {
    return fact.sourceUrl ? (
      <a
        href={fact.sourceUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="ml-1.5 text-xs text-stone/70 underline decoration-dotted"
      >source</a>
    ) : null
  }
  return (
    <span className="ml-1.5 whitespace-nowrap text-xs text-amber-700">
      {Number.isFinite(days)
        ? `read ${Math.round(days)} days ago — worth re-checking`
        : 'age unknown — worth re-checking'}
      {fact.sourceUrl && (
        <>
          {' '}
          <a
            href={fact.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-dotted"
          >source</a>
        </>
      )}
    </span>
  )
}
