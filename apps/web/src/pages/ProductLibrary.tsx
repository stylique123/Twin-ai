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
import { useSearchParams } from 'react-router-dom'
import {
  loadProductEntities, loadProductSuggestions, updateEntityPresentation,
  claimProductEntity, deleteProductEntity, archiveProductEntity, restoreProductEntity,
  requestProductExtraction, confirmProductFacts, uploadProductImage,
  listBrandVoices, OwnedEntityExistsError, ProductLibraryFullError,
  isStale, factAgeDays, SOURCE_LABEL, sourceWarrantsAttention,
  signEditUrls,
  bestSuggestion,
  type ProductSuggestion,
} from '@twinai/shared'
import { readOnboardingDraft } from '../lib/onboardingDraft'
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

/** ⚖️ FOUR, MATCHING THE ADD FORM. One number, so "you can add four" and "you
 *  may add two more" can never disagree. */
const PHOTO_SLOTS = 4

/** The creator's own photographs of a product, in the order they gave them.
 *
 *  ⚠️ ONLY PHOTOGRAPHS, NEVER PAGE BANDS. `evidence.sections` holds both — a
 *  captured page is stored the same way — and showing a screenshot of somebody's
 *  store page back to them under the heading "Your photos" would be a lie about
 *  where it came from, which is the whole failure the provenance work exists to
 *  stop. `form: 'images'` is what distinguishes them. */
function photoPathsOf(e: ProductEntityRecord): string[] {
  const ev = e.evidence
  if (!ev || ev === 'declined' || ev.form !== 'images') return []
  return [...ev.sections]
    .sort((a, b) => a.order - b.order)
    .map((x) => x.imagePath)
    .filter(Boolean)
}

export default function ProductLibrary() {
  const [entities, setEntities] = useState<ProductEntityRecord[] | null>(null)
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  // `addingNew` is the same attestation with no suggestion behind it.
  /** ⚠️ SETTINGS PROMISES "Add a product →" AND MUST NOT LAND SOMEBODY ON A LIST
   *  TO FIND THE BUTTON AGAIN. A deep link with no reader is the same dead
   *  affordance the Settings rebuild exists to remove — it just fails one screen
   *  later, where it is harder to notice. */
  const [params] = useSearchParams()
  const [addingNew, setAddingNew] = useState(params.get('add') === '1')
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
  // ⚠️ THE ARCHIVED LIST USED TO SIT BELOW EVERYTHING, so a creator with four
  // products scrolled past four full editors to reach it — and the suggestions,
  // the one part of the page that asks for a decision, sat below THAT.
  //
  // ⚖️ TABS IN PLAIN ENGLISH, NOT "Active"/"Archived". "In use" and "Not in use"
  // say what Twin will do with them, which is the only thing the distinction
  // means; the internal word is `archived_at` and the creator never needs it.
  const [tab, setTab] = useState<'live' | 'retired'>('live')
  /** Storage path → signed URL, for photos already attached to a product. */
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [addingPhotoTo, setAddingPhotoTo] = useState<string | null>(null)

  // ── ONE SUGGESTION, WITH ITS EVIDENCE, OR NONE ────────────────────────────
  //
  // ⚠️ THE PAGE USED TO RENDER EVERY ROW THE EXTRACTOR PRODUCED. Reported from a
  // real account: five cards, of which a content-series title, Zoom, an opinion
  // about posting frequency and a claim about growing a TikTok account. The rule
  // behind them amounted to "this noun appeared in a video, so perhaps commerce
  // has occurred", and `bestSuggestion` is the rule that replaces it — a named
  // commercial RELATIONSHIP, corroborated, or silence.
  //
  // ⚠️ THE TIES COME FROM THE ONBOARDING DRAFT AND ARE OFTEN ABSENT, which is
  // correct rather than convenient: they are held in local storage and never
  // persisted server-side, so on a second device there is nothing to read. An
  // empty list means "the question was never reached", NOT "I sell nothing", and
  // `suggestionsAllowed` treats those differently — so a missing draft permits
  // the suggestion instead of silently suppressing it. The creator who ANSWERED
  // "nothing commercial" is the only one this filter silences.
  const ties = (() => {
    const id = session?.user?.id
    if (!id) return null
    try { return readOnboardingDraft(localStorage, id)?.commercialTies ?? null } catch { return null }
  })()
  const picked = bestSuggestion(suggestions, ties)

  /** ⚖️ SIGNING FAILS QUIETLY, PER PATH. A picture that will not sign is a
   *  missing thumbnail; it must never blank the product it belongs to. */
  async function signThumbs(rows: readonly ProductEntityRecord[]) {
    const paths = rows.flatMap((r) => photoPathsOf(r))
    if (paths.length === 0) return
    try {
      const signed = await signEditUrls(paths)
      setThumbs((prev) => ({ ...prev, ...signed }))
    } catch { /* a thumbnail is a convenience */ }
  }

  /** Add photos to a product that already exists.
   *
   *  ⚠️ THE GALLERY WAS WRITE-ONCE. Photos could only be attached while adding
   *  the product; afterwards there was no way in, so a creator who shot better
   *  pictures a week later had to delete and re-add the thing — losing its
   *  facts, its confirmations and its history to change a picture.
   *
   *  ⚖️ AND UPLOADING RE-READS. New pictures are new evidence; storing them
   *  without extraction would leave the writer working from the old set while
   *  the page showed the new one, which is the worst of both. */
  async function addPhotosTo(entity: ProductEntityRecord, files: FileList | null) {
    const ownerId = session?.user?.id
    if (!ownerId || !files || files.length === 0) return
    const existing = photoPathsOf(entity)
    const room = PHOTO_SLOTS - existing.length
    if (room <= 0) return
    setAddingPhotoTo(entity.id); setErr(null)
    try {
      const added: string[] = []
      for (const file of Array.from(files).slice(0, room)) {
        const dataUrl: string = await new Promise((res, rej) => {
          const r = new FileReader()
          r.onload = () => res(String(r.result)); r.onerror = rej
          r.readAsDataURL(file)
        })
        added.push(await uploadProductImage(dataUrl))
      }
      if (added.length === 0) return
      await requestProductExtraction(ownerId, entity.id, entity.productUrl ?? '', [...existing, ...added])
      const signed = await signEditUrls(added)
      setThumbs((prev) => ({ ...prev, ...signed }))
      setSaved(entity.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That photo could not be added.')
    } finally { setAddingPhotoTo(null) }
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await loadProductEntities()
        if (!alive) return
        setEntities(rows)
        // ⚖️ THE PHOTOS EXISTED AND NOBODY COULD SEE THEM. A creator uploaded up
        // to four pictures at add time, extraction read them, and the page then
        // showed only the words it got out of them — so "did my photo arrive"
        // was unanswerable, and re-uploading the same picture was the only way
        // to find out. `edits` is private, so they have to be signed to render.
        void signThumbs(rows)
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
    /** ⚖️ THE LINK IS PART OF THE ATTESTATION, NOT A LATER EDIT. A creator who
     *  starts from a page is telling us WHICH thing they mean; storing it on the
     *  mint is what lets Twin read it without asking them to find it twice. */
    productUrl?: string | null
    /** ⚖️ PATHS, NOT FILES. The upload has already happened by the time this
     *  runs — a claim that also had to carry bytes could fail halfway and leave
     *  a product minted with photographs nobody can find. */
    imagePaths?: string[]
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
        // ⚠️ EXTRACTION IS QUEUED, NOT AWAITED, AND ITS FAILURE IS NOT THE
        // CLAIM'S. The product now exists because a person said it is theirs —
        // that is the part that had to succeed. Reading the page is a
        // convenience that runs on the worker minutes later, and a reader that
        // could undo an attestation would be the wrong shape entirely.
        const url = (a.productUrl ?? '').trim()
        const imgs = a.imagePaths ?? []
        if (url || imgs.length > 0) {
          try { await requestProductExtraction(ownerId, created.id, url, imgs) }
          catch { setErr('Added, but we could not start reading that page. You can retry from the product below.') }
        }
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
      // ⚠️ THE LINK BECOMES THE PRODUCT'S LINK, AND IT DID NOT BEFORE. This box
      // sent the URL to the extractor and never wrote it to `product_url`, while
      // the Link field above wrote `product_url` and never re-read the page. Two
      // inputs, disjoint effects — so a creator could paste a page here, watch
      // Twin read it, and still find the Link field empty or holding an older
      // address. The most recent thing they told us was the one thing we did not
      // keep.
      //
      // ⚖️ ONE CANONICAL FIELD. `product_url` is what every other view reads, so
      // giving Twin a page to read IS telling us where the product lives. The
      // write is awaited before the extraction so a failure here surfaces as a
      // failure rather than leaving the two out of step.
      //
      // ⚖️ AND IT DOES NOT OVERWRITE AN IDENTICAL VALUE. `save` round-trips to
      // the server; skipping the no-op keeps a re-read from touching updated_at
      // and looking like an edit nobody made.
      const entity = (entities ?? []).find((x) => x.id === id)
      if (url && url !== (entity?.productUrl ?? '')) {
        await save(id, { productUrl: url })
      }
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

      {/* ⚖️ THE SECOND TAB APPEARS ONLY WHEN THERE IS SOMETHING IN IT. A creator
          who has never retired a product should not be shown an empty room and
          asked to wonder what belongs in it. */}
      {(archivedAll ?? []).filter((a) => a.archivedAt).length > 0 && (
        <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1 text-sm">
          {([['live', 'In use'], ['retired', 'Not in use']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`flex-1 rounded-md px-3 py-1.5 ${tab === k ? 'bg-white/10 text-white' : 'text-sand'}`}
            >{label}</button>
          ))}
        </div>
      )}

      {tab === 'live' && entities.length === 0 && !addingNew && (
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
          {/* ── GIVE TWIN SOMETHING TO INSPECT ──────────────────────────────
              ⚠️ THE OLD FLOW ASKED A CREATOR TO DESCRIBE THEIR OWN PRODUCT INTO
              A BLANK BOX, which is both the slowest way in and the least
              accurate: people summarise their product differently every time,
              and the summary is what the writer then had to work from.
              ⚖️ A LINK IS ONE PASTE AND IT IS THE THING ITSELF. Twin reads the
              page and comes back with what it found; the creator corrects only
              what matters. The questions that remain are the two that cannot be
              read off a page at all — what their relationship to it is, and
              whether they have used it — because those are permissions, and a
              permission read off a web page is a permission nobody granted. */}
          <StartFromLink
            busy={claimBusy}
            onCancel={() => setAddingNew(false)}
            onClaim={(a) => void claim(null, a)}
          />
        </section>
      )}

      {tab === 'live' && entities.length > 0 && !addingNew && (
        <button
          type="button"
          className="rounded-lg border border-white/15 px-3 py-1.5 text-sm"
          onClick={() => setAddingNew(true)}
        >Add another product</button>
      )}

      {(tab === 'live' ? entities : []).map((e) => (
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

          {/* ── WHAT IT LOOKS LIKE ───────────────────────────────────────
              ⚠️ THE PHOTOS WERE WRITE-ONCE AND INVISIBLE. They could be attached
              only while adding the product, and afterwards the page showed the
              WORDS extraction got out of them and never the pictures — so "did
              my photo arrive" had no answer, and changing one meant deleting the
              product and losing its facts, confirmations and history.
              ⚖️ SLOTS RATHER THAN A COUNTER. Four squares say how many there are
              and how many are left in one glance, without a sentence doing
              arithmetic at the creator. */}
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-stone">Photos of it</p>
            <p className="mt-1 text-xs text-stone">
              Your own pictures of the thing. Twin reads them for what it can see, and
              never states a price or a claim from a photo.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {photoPathsOf(e).map((path, i) => (
                <div key={path} className="h-16 w-16 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                  {thumbs[path]
                    ? <img src={thumbs[path]} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                    : <span className="grid h-full w-full place-items-center text-[10px] text-stone">…</span>}
                </div>
              ))}
              {photoPathsOf(e).length < PHOTO_SLOTS && (
                <label className="grid h-16 w-16 cursor-pointer place-items-center rounded-lg border border-dashed border-white/20 text-xs text-sand">
                  {addingPhotoTo === e.id ? '…' : '+'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="hidden"
                    disabled={addingPhotoTo === e.id}
                    onChange={(ev) => { void addPhotosTo(e, ev.target.files); ev.target.value = '' }}
                  />
                </label>
              )}
            </div>
            {addingPhotoTo === e.id && (
              <p className="mt-2 text-xs text-stone">
                Uploading, then re-reading everything you have given us about this product.
              </p>
            )}
          </div>

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

      {tab === 'retired' && (
        <section>
          <p className="text-sm text-sand">
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

      {picked && (
        <section>
          <h2 className="text-lg font-semibold">Is this something you sell?</h2>
          {/* ⚠️ THE HEADING WAS THE ONLY EXPLANATION AND IT SOUNDED LIKE A LIST
              OF PRODUCTS THE CREATOR ALREADY HAD. What it actually is: sentences
              lifted from their own transcripts, owned by nobody, doing nothing
              until someone claims one. Both facts have to be said, because a
              list that looks finished invites no action. */}
          {/* ⚠️ THE OLD HEADING WAS "Things you talked about in your videos" OVER
              FIVE CARDS, and the five were a content-series title, Zoom, an
              opinion about how often to post, and a claim about growing a TikTok
              account. A wall of guesses is not a shortlist — it is an audit the
              creator has to perform, and every wrong row costs more trust than a
              right one earns. One candidate, with its evidence, is a question a
              person can answer in two seconds. */}
          <p className="mt-1 text-sm text-sand">
            This came out of your own videos. Nothing has been added to your products
            and it is not affecting your scripts. If it is yours, say so and we will
            ask a few questions about it.
          </p>
          <ul className="mt-3 space-y-2">
            {[picked.item].map((s) => (
              <li key={s.id} className="rounded-lg border border-white/10 px-3 py-2 text-sm">
                <p>{s.text}</p>
                {/* ⚖️ THE SUGGESTION EXPLAINS ITSELF. A card that shows its
                    evidence can be judged; one that just asserts can only be
                    trusted or ignored, and a creator who has been shown one bad
                    guess will choose ignored for every later one. */}
                <p className="mt-1 text-xs text-stone">
                  Why we are asking: {picked.verdict.reasons.join(' · ')}
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
          {/* ⚖️ AND THE OTHER CANDIDATES ARE NOT MENTIONED, NOT EVEN AS A COUNT.
              "3 more we are unsure about" is the wall again, wearing a disclosure
              — it invites the creator to go and adjudicate our uncertainty, which
              is the work this page exists to do for them. Add is two inches away. */}
          <p className="mt-3 text-xs text-stone">
            Nothing is added to your products until you answer for it. Anything we
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
  if (!stale) return <FactOrigin fact={fact} />
  return (
    <span className="ml-1.5 whitespace-nowrap text-xs text-amber-700">
      {Number.isFinite(days)
        ? `read ${Math.round(days)} days ago — worth re-checking`
        : 'age unknown — worth re-checking'}
      <FactOrigin fact={fact} />
    </span>
  )
}

/** WHERE THIS CAME FROM, SAID IN WORDS.
 *
 *  ⚠️ THE WORD "source" ON A LINK ANSWERED THE WRONG QUESTION. It told a creator
 *  that an origin EXISTS and never what it was, and a fact with no link — one
 *  read off a photograph they uploaded, or one they typed themselves — said
 *  nothing at all. The review test is "where did every critical fact come
 *  from, within seconds", and a link labelled `source` fails it.
 *
 *  ⚖️ AND TWO ORIGINS EARN A SECOND LOOK RATHER THAN A REFUSAL. Marketing copy
 *  is written to persuade and a photograph is a machine's reading of an image;
 *  both are usable and neither is a claim the page itself made. Marking them is
 *  a prompt to check, not a block — the trust split already decides what may
 *  reach the writer, and saying it twice in two different vocabularies is how
 *  two rules come to disagree. */
function FactOrigin({ fact }: { fact: ProductFact }) {
  const label = SOURCE_LABEL[fact.source]
  const tone = sourceWarrantsAttention(fact.source) ? 'text-amber-700' : 'text-stone/70'
  if (!fact.sourceUrl) return <span className={`ml-1.5 text-xs ${tone}`}>{label}</span>
  return (
    <a
      href={fact.sourceUrl}
      target="_blank"
      rel="noreferrer noopener"
      className={`ml-1.5 text-xs underline decoration-dotted ${tone}`}
    >{label}</a>
  )
}

/** START FROM THE THING ITSELF.
 *
 *  ⚠️ THE OLD WAY IN WAS A BLANK NAME BOX, and it asked the creator to be the
 *  extractor: summarise your own product, in a sentence, from memory. People
 *  describe their product differently every time they are asked, and whatever
 *  they typed became the only thing the writer knew — so the least reliable
 *  possible source was also the authoritative one.
 *
 *  ⚖️ SO THE LINK COMES FIRST AND THE TYPING IS OPTIONAL. Twin reads the page and
 *  reports what it found; the creator corrects what is wrong. The name is left
 *  blank on purpose when a link is given — extraction fills it, and a guessed
 *  name typed in a hurry would outrank the real one.
 *
 *  ⚠️ TWO QUESTIONS SURVIVE, AND THEY ARE THE TWO A PAGE CANNOT ANSWER.
 *  `relationship` decides whether commercial language is permitted at all, and
 *  `personalUse` decides whether "I use this" may be said. Both are PERMISSIONS.
 *  A web page can tell us what a product is; it cannot tell us that this person
 *  sells it, and reading either off a URL would be an entitlement granted by a
 *  paste. That is the escalation this whole page exists to refuse.
 */
function StartFromLink({ onCancel, onClaim, busy }: {
  onCancel: () => void
  busy: boolean
  onClaim: (a: {
    relationship: EntityRelationship; personalUse: PersonalUse
    type: EntityType; name: string; productUrl?: string | null; imagePaths?: string[]
  }) => void
}) {
  const [url, setUrl] = useState('')
  // ⚖️ UPLOADED AS THEY ARE PICKED, NOT ON SUBMIT. A submit that also had to
  // carry several megabytes can fail halfway, and the creator would be told
  // their product could not be added when the real problem was one photo.
  const [imagePaths, setImagePaths] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [imgErr, setImgErr] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState<EntityRelationship | null>(null)
  const [type, setType] = useState<EntityType | null>(null)
  const [personalUse, setPersonalUse] = useState<PersonalUse | null>(null)

  const link = url.trim()
  // ⚖️ REFUSED HERE SO THE CREATOR IS TOLD NOW, not after a job fails silently
  // on the worker minutes later. `requestProductExtraction` refuses the same
  // shape; this is the copy that reaches a person.
  const linkLooksReal = link === '' || /^https:\/\/\S+\.\S+/i.test(link)
  // ⚠️ A NAME IS REQUIRED ONLY WHEN THERE IS NO LINK. With one, extraction
  // supplies it; without one, nothing else will, and a nameless entity reaches
  // the prompt as "the product".
  // ⚠️ PHOTOS COUNT AS SOMETHING TO INSPECT. A product with no page and three
  // pictures is a complete submission; demanding a name for it would make the
  // typing mandatory again in the one case where the pictures say more.
  const named = link !== '' || imagePaths.length > 0 || name.trim() !== ''
  const ready = named && linkLooksReal && !uploading && relationship !== null
    && type !== null && personalUse !== null

  const addPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true); setImgErr(null)
    try {
      for (const file of Array.from(files).slice(0, 4 - imagePaths.length)) {
        const dataUrl: string = await new Promise((res, rej) => {
          const r = new FileReader()
          r.onload = () => res(String(r.result)); r.onerror = rej
          r.readAsDataURL(file)
        })
        const path = await uploadProductImage(dataUrl)
        setImagePaths((prev) => [...prev, path])
      }
    } catch (e) {
      setImgErr(e instanceof Error ? e.message : 'That image could not be uploaded.')
    } finally { setUploading(false) }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-white/[0.03] p-3">
      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-stone" htmlFor="product-link">
          Paste a link to it
        </label>
        <p className="mt-1 text-xs text-stone">
          Its website, store page, or app listing. Twin will read it and tell you what it
          found — you only correct what is wrong.
        </p>
        <input
          id="product-link"
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-cream outline-none placeholder:text-stone/60 focus:border-signature"
        />
        {!linkLooksReal && (
          <p className="mt-1 text-xs text-coral">That does not look like a full link. It should start with https://</p>
        )}
      </div>

      {/* ⚖️ OFFERED, NOT REQUIRED, AND ONLY WHEN THERE IS NO LINK TO READ. Some
          products have no page — a service, a community, something not launched —
          and refusing those would make the link the price of entry. */}
      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-stone" htmlFor="product-name">
          {link ? 'Or give it a name (optional)' : 'What do you call it?'}
        </label>
        <input
          id="product-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={link ? 'Twin will read this from the page' : 'e.g. Twin'}
          className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-cream outline-none placeholder:text-stone/60 focus:border-signature"
        />
      </div>

      {/* ⚖️ PHOTOGRAPHS ESTABLISH WHAT A THING IS AND WHAT IT LOOKS LIKE, and
          nothing else — not its price, not what it does for anyone. The wording
          says so plainly, because a creator who uploads a pricing screenshot
          expecting Twin to learn the price should find that out here rather than
          from a script that never mentions it. */}
      <div>
        <span className="text-xs font-medium uppercase tracking-wide text-stone">
          Photos of it (optional)
        </span>
        <p className="mt-1 text-xs text-stone">
          Up to four. Twin uses these to know what it looks like, so a scene can show it.
          It will not take prices or promises from a picture.
        </p>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          disabled={uploading || imagePaths.length >= 4}
          onChange={(e) => { void addPhotos(e.target.files); e.target.value = '' }}
          className="mt-2 block w-full text-xs text-stone file:mr-3 file:rounded-lg file:border file:border-white/15 file:bg-white/5 file:px-3 file:py-1.5 file:text-xs file:text-cream"
        />
        {uploading && <p className="mt-1 text-xs text-stone">Uploading…</p>}
        {imagePaths.length > 0 && (
          <p className="mt-1 text-xs text-teal">{imagePaths.length} photo{imagePaths.length === 1 ? '' : 's'} ready</p>
        )}
        {imgErr && <p className="mt-1 text-xs text-coral">{imgErr}</p>}
      </div>

      <Choices
        label="What is it?"
        options={TYPE_CHOICES}
        chosen={type}
        onPick={(v) => setType(v)}
      />

      {/* ⚠️ THE TWO PERMISSION QUESTIONS. Neither is derivable from the other and
          neither is readable off a page — see this component's own note. */}
      <Choices
        label="What is your relationship to it?"
        options={RELATIONSHIP_CHOICES}
        chosen={relationship}
        onPick={(v) => setRelationship(v)}
      />
      <Choices
        label="Have you actually used it yourself?"
        options={[
          // ⚠️ THIS SAID `'DENIED' as PersonalUse`, AND THE CAST IS WHAT HID IT.
          // `PersonalUse` is CONFIRMED | NOT_CONFIRMED, and the database agrees:
          // `product_entities_personal_use_known` is CHECK (personal_use IN
          // ('CONFIRMED','NOT_CONFIRMED')). `attestedEntity` passes the value
          // straight through, so answering honestly sent 'DENIED' to the insert
          // and the constraint refused it — a creator telling the truth about an
          // affiliate product could not add it at all.
          //
          // ⚖️ NO CAST HERE, ON PURPOSE. Typed as PersonalUse, a third value is a
          // compile error rather than a runtime refusal nobody sees until a
          // creator hits it.
          { value: 'CONFIRMED', label: 'Yes, I have used it' },
          { value: 'NOT_CONFIRMED', label: 'No, I have not' },
        ]}
        chosen={personalUse}
        onPick={(v) => setPersonalUse(v)}
      />

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => onClaim({
            relationship: relationship!, personalUse: personalUse!, type: type!,
            name: name.trim(), productUrl: link || null, imagePaths,
          })}
          className="btn-gradient rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
        >{busy ? 'Adding…' : (link || imagePaths.length > 0) ? 'Add it and take a look' : 'Add it'}</button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-stone"
        >Cancel</button>
      </div>
      {link && (
        <p className="text-xs text-stone">
          Reading the page takes a few minutes and happens in the background. Nothing it
          finds is used in a script until you confirm it.
        </p>
      )}
    </div>
  )
}

/** A labelled row of single-choice chips. Extracted because three of them in one
 *  form is where copy-paste starts producing three slightly different behaviours. */
function Choices<T extends string>({ label, options, chosen, onPick }: {
  label: string
  options: Array<{ value: T; label: string }>
  chosen: T | null
  onPick: (v: T) => void
}) {
  return (
    <div>
      <span className="text-xs font-medium uppercase tracking-wide text-stone">{label}</span>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={chosen === o.value}
            onClick={() => onPick(o.value)}
            className={
              chosen === o.value
                ? 'rounded-full border border-signature/50 bg-signature/10 px-3 py-1.5 text-xs text-cream'
                : 'rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-sand hover:border-white/25'
            }
          >{o.label}</button>
        ))}
      </div>
    </div>
  )
}
