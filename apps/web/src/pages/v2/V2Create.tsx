// Screen 1 — Create / Remix Input. One job: get the user's starting point and go.
// ONE responsive layout serves phone and desktop alike — a single focused column
// on the brand canvas, so the phone experience is the same studio page as
// desktop, just narrower. No separate phone wizard. PRODUCT_VISION §7.
//
// ── ⚠️ FOUR DOORS, AND ONLY ONE OF THEM WAS EVER LIT ──────────────────────
//
// This screen has always accepted two different starting points and advertised
// one. `/^https?:\/\//` sent the text to `reference_url` and everything else to
// `reference_note` — two genuinely different builds, chosen by a regex the
// creator never saw, under a heading that said "Paste a reference you wish
// you'd made" and a placeholder that said "Paste a video link…". A creator with
// an idea and no reference was looking at a screen that appeared to have
// nothing for them, and the note path has been live and unmentioned since it
// shipped (documented at generate-blueprint/index.ts:3794).
//
// The doors are now named. The text can still MOVE the door — pasting a link
// still lands you on Reference — but it does so visibly, and a stated choice is
// never overridden by what was typed afterwards.
//
// ⚠️⚠️ AND PRODUCT IS NEVER INFERRED FROM WHAT THEY TYPED. Typing "my collagen
// serum" must not put a creator into a build that treats them as the seller: a
// product build inherits claim entitlement, disclosure and evidence rules, and
// a wrong guess there is a legal exposure rather than a cosmetic mis-route.
// Owning a thing is a fact held in the Product Library, and the only safe way
// to learn it is for them to pick it. The rule and its mutation proof live in
// packages/shared/src/entryDoor.ts.
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Link2, Wand2, Wind, Activity, Flame, SlidersHorizontal, ChevronDown, Lightbulb, Package, Compass } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { listGenerations, loadProductEntities } from '../../lib/api'
import type { ProductEntityRecord } from '../../lib/api'
import { videosFromCredits } from '../../lib/brand'
import { recordEntryDoor } from '../../lib/entryDoors'
import {
  readEntryDoor, buildFieldsForDoor, looksLikeLink, ALL_DOORS, relationshipLabel, type EntryDoor,
  DEFAULT_TARGET_SECONDS, shapeFor, type TargetSeconds,
} from '@twinai/shared'
import { Aurora } from '../../components/Aurora'
import { cn } from '../../lib/cn'

type Tone = 'understated' | 'balanced' | 'punchy'

// ⚠️ FIX 10 (Wave 4). ONE HOME FOR FIDELITY — THE SLIDER USED TO LIVE HERE.
// "How close to the reference" duplicated the always-asked `reference_use`
// question ("How much of the original should Twin keep?", asked on every
// build a screen later) and generate-blueprint fed BOTH into the prompt as
// separate, unreconciled directives. Run D proved they can disagree: this
// slider said "loose" while `reference_use` said "Keep it close", and the
// header showed this slider's answer while the prompt carried both
// instructions at once. `reference_use` is the first-class, always-answered
// control (this one was one tap behind a collapsed "Advanced settings"
// panel most creators never opened) so it is now the ONLY closeness control
// — see `resolveFidelity` in `videoIntent.ts`, which derives the writer's
// fidelity rule from it. Nothing here can disagree with it because nothing
// here asks the question anymore.
// ⚖️ PLAIN ENGLISH, AND THE NOTE NAMES WHAT THE LENGTH BUYS rather than how
// many beats it maps to. "Room for a story" is the difference a creator can
// feel; "six beats" is our word for our problem.
const LENGTHS = [
  { id: 30 as const, label: '30 seconds', note: 'Fast, one idea' },
  { id: 60 as const, label: '60 seconds', note: 'Room for a story' },
  { id: 90 as const, label: '90 seconds', note: 'A full breakdown' },
] as const

const TONE = [
  { id: 'understated', label: 'Understated', note: 'Calm, credible, no hype.', icon: Wind },
  { id: 'balanced', label: 'Balanced', note: 'Natural energy, your default.', icon: Activity },
  { id: 'punchy', label: 'Punchy', note: 'High-energy, bold hooks.', icon: Flame },
] as const

// ── THE DOORS, IN PLAIN ENGLISH ───────────────────────────────────────────
//
// ⚖️ EACH ONE NAMES THE CREATOR'S SITUATION, NOT OUR MECHANISM. "I have a video
// I love" is a thing a person is; "reference_url" is a thing a database has.
// HARD UX RULE — plain everyday English everywhere a creator reads.
//
// ⚠️ AND NOTHING HERE PROMISES A SHORTER SCRIPT FOR LESS INPUT. The copy is
// always "give Twin more and it uses it", never "skip this and get less" —
// which frames the creator's own effort as the thing being taken away.
// ⚠️⚠️ FOUR DOORS INTO ONE ROOM, REPORTED BY THE OWNER. A creator with a
// product AND a thought AND a saved video is looking at four cards that are all
// true at once, and nothing on screen tells her which to click. The old labels
// were noun phrases -- "A video I love", "An idea", "Something I sell",
// "Nothing yet" -- and a noun phrase does not exclude the other three.
//
// ⚖️ SO A MODE IS WHAT SHE BROUGHT, NOT WHAT THE VIDEO IS ABOUT. Written as
// "I ..." sentences, exactly one can be true of her right now, which is what
// makes the choice a choice. A product can appear in ANY door; what Product
// Mode means is that the product is the SUBJECT, and that is what switches on
// claim entitlement and disclosure.
//
// ⚖️ AND EACH CARD SHOWS WHAT COMES OUT, because nobody reads a definition and
// everybody understands an example. `outcome` is one line of the actual result,
// not a second description of the mode.
const DOORS: ReadonlyArray<{
  id: EntryDoor
  label: string
  blurb: string
  /** One line of what this door actually produces. Concrete, never a restatement. */
  outcome: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  {
    id: 'reference',
    label: 'I saw a video I liked',
    blurb: 'Paste the link. Twin keeps its shape and fills it with your story.',
    outcome: 'Same build, your story inside it',
    icon: Link2,
  },
  {
    id: 'idea',
    label: "I've got something to say",
    blurb: 'Say it however it comes out. Twin finds the video inside it.',
    outcome: 'Three videos in that paragraph — pick one',
    icon: Lightbulb,
  },
  {
    id: 'product',
    label: 'I need to talk about something I sell',
    blurb: 'Pick the thing. Twin finds an honest angle and stays inside what you may say.',
    outcome: 'An angle, and the claims you are allowed',
    icon: Package,
  },
  {
    id: 'browse',
    label: "I don't know what to post",
    blurb: "Twin shows what's moving in your niche and asks what you think.",
    outcome: 'A subject, and your take on it',
    icon: Compass,
  },
]

// What the box asks for, per door. The reference door is the only one that
// wants a link, and it is the only one that says so.
//
// ⚠️ WAVE 5.1 — THE IDEA BOX ASKED FOR A HEADLINE AND GOT ONE. Two rows and
// "e.g. why most people warm up wrong…" is a shape: it tells the creator the
// right answer is a tidy one-line topic, so that is what they typed, and the
// writer got a topic where it could have had the person's actual thinking.
//
// ⚖️ THE PLACEHOLDER IS THE FEATURE, not decoration around it. Permission to be
// unfinished has to be given explicitly — "half-thoughts, tangents and 'I don't
// know' are all fine" — because every other text box this creator has ever used
// punished exactly that.
const PROMPT: Record<EntryDoor, { eyebrow: string; placeholder: string; rows: number }> = {
  reference: { eyebrow: 'Reference link', placeholder: 'Paste a video link…', rows: 2 },
  idea: {
    eyebrow: 'Your idea',
    placeholder: "Say it however it comes out — half-thoughts, tangents and “I don't know” are all fine.",
    // ⚖️ SIX ROWS, NOT TWO. The box has to look like it expects paragraphs
    // before anyone will type them; it grows from here as they go.
    rows: 6,
  },
  product: { eyebrow: 'Your product', placeholder: 'Pick a product to talk about…', rows: 2 },
  browse: { eyebrow: 'Nothing yet', placeholder: '', rows: 2 },
}

/** ⚠️ NOT A LIMIT AND NOT A TARGET. Nothing truncates — `buildFieldsForDoor`
 *  passes the whole note through — so this exists only to stop a creator who is
 *  mid-flow from wondering whether they have said too much. It appears once
 *  they are clearly past a one-liner and never counts down toward anything. */
const LONG_ENOUGH_TO_COUNT = 40

function wordCount(text: string): number {
  const t = text.trim()
  return t === '' ? 0 : t.split(/\s+/).length
}

// Pull a starting reference from the acquisition funnels: Gallery's "Remix in my
// voice" passes `?ref=<url>`, and the landing hero stashes a link in the
// `twinai_pending_remix` localStorage key (which survives signup). Consume it
// once so the promise that got the user here actually carries into the flow.
function initialInput(ref: string | null): string {
  if (ref) return ref
  try {
    const pending = localStorage.getItem('twinai_pending_remix')
    if (pending) {
      localStorage.removeItem('twinai_pending_remix')
      return pending
    }
  } catch { /* localStorage unavailable (private mode) — ignore */ }
  return ''
}

export default function V2Create() {
  const nav = useNavigate()
  const { profile } = useAuth()
  const [params] = useSearchParams()
  const [input, setInput] = useState(() => initialInput(params.get('ref')))
  // ── "SOMETHING I SELL" MUST BE A CHOICE, NOT A REDIRECT ──────────────────
  //
  // ⚠️ REPORTED FROM PRODUCTION: "when I click something I sell, pick a
  // product, why does it still take me to the product library and there's no
  // option to choose anything?" The door was a HANDOFF — it navigated to
  // /products and abandoned the build. The creator had said what they wanted to
  // make a video about and was answered with a filing cabinet.
  //
  // ⚖️ SO THE DOOR ANSWERS ITS OWN QUESTION. Picking a product here starts the
  // build with that product chosen, on the same screen, in the same gesture.
  // The library is still one tap away for the creator who has nothing in it —
  // but as an EMPTY-STATE, which is the only case where it was ever the answer.
  const [picking, setPicking] = useState(false)
  const [myProducts, setMyProducts] = useState<ProductEntityRecord[] | null>(null)
  useEffect(() => {
    let alive = true
    // ⚠️ NULL IS "WE DO NOT KNOW YET", NOT "YOU HAVE NONE". A failed read must
    // not render the empty state, which would tell a creator with a full
    // library that it is empty.
    void loadProductEntities()
      .then((rows) => { if (alive) setMyProducts(rows.filter((r) => r.archivedAt === null)) })
      .catch(() => { if (alive) setMyProducts(null) })
    return () => { alive = false }
  }, [])
  // ⚠️ null MEANS "THEY HAVE NOT PICKED", WHICH IS NOT THE SAME AS ANY DOOR.
  // Seeding this with the inferred door would make every entry look chosen and
  // destroy the one distinction the impression table exists to record.
  const [picked, setPicked] = useState<EntryDoor | null>(null)
  const [advanced, setAdvanced] = useState(false)
  const [tone, setTone] = useState<Tone>('balanced') // recommended default
  // ⚖️ DEFAULTS TO 60, NOT 30. The twelve measured runs fail by being THIN, so
  // opening on the shortest option would push the common case further in the
  // direction it is already wrong.
  const [target, setTarget] = useState<TargetSeconds>(DEFAULT_TARGET_SECONDS)
  const [checking, setChecking] = useState(false)
  // A generation that already used this exact link — surfaced so we can offer to
  // open it instead of silently spending another remix on a duplicate.
  const [dup, setDup] = useState<{ id: string } | null>(null)
  const remixesLeft = videosFromCredits(profile?.credits ?? 0)

  // The door in force right now: their choice if they made one, otherwise what
  // the text suggests. `source` is what separates the two, and it is the field
  // the old regex could not produce.
  const { door, source } = readEntryDoor({ text: input, chosen: picked })
  const prompt = PROMPT[door]
  // The reference door is the one place a link is required — everywhere else
  // the words ARE the input, so demanding a URL would be a false refusal.
  const needsLink = door === 'reference' && input.trim() !== '' && !looksLikeLink(input)
  // ⚠️ THE TWO DOORS THAT ARE NOT A TEXT BOX. Both send the creator somewhere
  // real — the Product Library and the Gallery — rather than showing a field
  // that cannot answer what they just said about themselves.
  const isHandoff = door === 'product' || door === 'browse'

  const proceed = () => {
    const t = input.trim()
    // ⚖️ RECORDED AT THE CLICK, NOT AT RENDER. An impression means "a creator
    // went through this door"; writing on render would count someone who opened
    // the studio and left as having taken whichever door the screen opened on.
    void recordEntryDoor({ door, source, offered: ALL_DOORS, text: t })
    nav('/v2/building', {
      // ONE KEY PER CLICK (0119). Minted HERE rather than on the building screen
      // because this is the moment the creator asks for a video — the building
      // screen only carries out the ask, and it remounts. Two deliberate clicks
      // mint two keys and correctly cost two remixes; a remount, a back-and-
      // forward or a refresh reuses this one and costs nothing extra.
      state: {
        ...buildFieldsForDoor(door, t),
        // ⚠️ THE DOOR TRAVELS NOW, AND IT DID NOT BEFORE. The build screen had
        // to infer the mode from whether a link was pasted, which cannot
        // distinguish the product door from the idea door at all — both arrive
        // with no reference. `readEntryDoor` refuses to infer `product` from
        // text for a stated reason (claim entitlement is a legal exposure, not
        // a guess), so the only honest way for the next screen to know is for
        // this one to say.
        door,
        tone,
        // HER EXPLICIT PICK. Rides the request so the server never has to guess
        // which of the three she chose — and `asTarget` refuses anything else.
        target_seconds: target,
        idempotency_key: crypto.randomUUID(),
        // ⚠️ THE LIBRARY WAS A LIST, NOT A SELECTOR. It showed a creator every
        // product they own and offered no way to make a video about one — so
        // the way to start a video about a specific product was to start a
        // video and hope the picker asked.
        //
        // ⚖️ CARRIED, NOT DECIDED. This is the creator's own tap on that
        // product's card, so it is an answer, not a default — but the build
        // screen still puts it through `selectProduct`, which refuses it on a
        // video that may not carry a product at all.
        ...(params.get('product') ? { selected_product_id: params.get('product') as string } : {}),
      },
    })
  }

  const go = async () => {
    // The handoff doors do not build; they take the creator to the place that
    // holds what they said they have. Both record the door first, because
    // leaving for the Product Library IS taking the product door.
    if (door === 'product') {
      // ⚖️ THE DOOR IS RECORDED WHERE IT IS TAKEN, exactly as before — what
      // changed is what happens next, not what we learn from it.
      void recordEntryDoor({ door, source, offered: ALL_DOORS, text: input })
      setPicking(true)
      return
    }
    if (isHandoff) {
      void recordEntryDoor({ door, source, offered: ALL_DOORS, text: input })
      // ⚠️ THIS BRANCH NO LONGER SEES THE PRODUCT DOOR, AND THAT IS THE POINT.
      // This branch used to send it to the Library with a from-studio flag — a
      // better dead end than the plain list, but still a dead end. main now answers the
      // door in place: `door === 'product'` returns above, opening the chooser
      // on this screen and carrying the pick into the build. Only `browse`
      // reaches here, and the Gallery genuinely is where "nothing yet" leads.
      nav('/gallery')
      return
    }
    const t = input.trim()
    if (!t || needsLink) return
    // Only links can be duplicates (a described idea is always fresh). Look for a
    // prior generation off the SAME link and, if found, ask before charging again.
    if (door === 'reference' && looksLikeLink(t)) {
      setChecking(true)
      try {
        const norm = (u: string) => u.trim().replace(/[/?#]+$/, '').toLowerCase()
        const gens = await listGenerations()
        const existing = gens.find((g) => g.reference_url && norm(g.reference_url) === norm(t))
        if (existing) { setDup({ id: existing.id }); setChecking(false); return }
      } catch { /* never block a remix on a failed lookup */ }
      setChecking(false)
    }
    proceed()
  }

  return (
    <>
      {/* Duplicate-link guard: you already remixed this exact link — open it or
          spend a remix on a fresh version, but never a silent double-charge. */}
      {dup && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/75 p-5 backdrop-blur-sm">
          <div className="glass gradient-border w-full max-w-md p-6 text-center">
            <h2 className="font-display text-2xl tracking-tight">You already remixed this link</h2>
            <p className="mt-2 text-sm leading-relaxed text-stone">
              Open the remix you already made, or spend one remix to generate a fresh version with new hooks?
            </p>
            <div className="mt-6 space-y-2.5">
              <button onClick={() => nav(`/result/${dup.id}`)} className="btn-gradient w-full">Open my remix</button>
              <button onClick={() => { setDup(null); proceed() }} className="btn-ghost w-full">Make a new version</button>
              <button onClick={() => setDup(null)} className="w-full py-2 text-sm text-stone transition-colors hover:text-cream">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── One focused column on the brand canvas: doors → input → advanced
          settings (collapsed) → the CTA. Fully responsive — the same studio page
          on phone (narrower, tighter type) and desktop. Tone is REAL: it rides
          the request into generate-blueprint, where it maps to a hard prompt
          rule. Closeness to the reference is asked once, on the next screen
          (`reference_use`) — see the FIX 10 comment above. ── */}
      {/* Centered on phone AND desktop, and keyboard-aware. Phone height is dvh
          (DYNAMIC viewport) minus the app chrome (~8rem = top bar + bottom tab bar),
          so the box fills exactly the VISIBLE area between them. dvh shrinks when the
          on-screen keyboard opens → the column re-centers ABOVE the keyboard and the
          input stays in view, then restores cleanly when it closes (svh stayed fixed,
          which left the page stuck scrolled with black gaps). Desktop keeps 100dvh. */}
      <div className="relative grid min-h-[calc(100dvh-8rem)] place-items-center overflow-clip px-5 py-8 text-cream sm:px-8 lg:min-h-[100dvh] lg:py-16">
        <Aurora className="opacity-80" />
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute left-1/3 top-1/4 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-coral/10 blur-[160px]" />
          <div className="absolute right-0 bottom-0 h-[20rem] w-[20rem] rounded-full bg-teal/10 blur-[140px]" />
        </div>

        <div className="relative mx-auto w-full max-w-2xl text-center">
          <p className="eyebrow">Studio</p>
          <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">Make a video</h1>
          <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-stone">
            Start from whatever you actually have.
          </p>

          {/* ── The four doors. All of them visible, always — a door behind a
              toggle is a door nobody counts, and the impression row records
              which ones were on screen precisely so that stays true. ── */}
          <div
            role="radiogroup"
            aria-label="What are you starting from?"
            className="mx-auto mt-7 grid max-w-md grid-cols-2 gap-2.5 text-left"
          >
            {DOORS.map((d) => {
              const active = door === d.id
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPicked(d.id)}
                  className={cn(
                    'rounded-card border p-3.5 transition-colors',
                    active
                      ? 'border-coral/50 bg-coral/[0.07]'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
                  )}
                >
                  <d.icon className={cn('h-4 w-4', active ? 'text-coral' : 'text-stone')} />
                  <div className={cn('mt-2 text-sm font-semibold', active ? 'text-cream' : 'text-sand')}>{d.label}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-stone">{d.blurb}</div>
                  {/* ⚖️ THE RESULT, NOT A SECOND DESCRIPTION OF THE MODE. An
                      arrow and one concrete line is what lets a creator pick the
                      picture she wants instead of reading four definitions. */}
                  <div className="mt-1.5 text-[11px] leading-snug text-teal">
                    <span aria-hidden="true">→ </span>{d.outcome}
                  </div>
                </button>
              )
            })}
          </div>

          {/* The input box — a compact, refined hero input on the canvas, with a
              soft coral bloom on focus. Hidden for the two handoff doors, where
              a text field could not answer what the creator just told us. */}
          {!isHandoff && (
            <div className="glass gradient-border mx-auto mt-5 max-w-md rounded-2xl p-4 text-left transition-shadow focus-within:shadow-[0_0_48px_-16px_rgba(255,91,123,.5)]">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-sand/80">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-signature-soft">
                  {door === 'reference' ? <Link2 className="h-3 w-3 text-cream" /> : <Lightbulb className="h-3 w-3 text-cream" />}
                </span>
                {prompt.eyebrow}
              </div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={prompt.rows}
                autoFocus
                placeholder={prompt.placeholder}
                className="mt-2.5 max-h-[40vh] w-full resize-y bg-transparent text-base leading-relaxed outline-none text-cream placeholder:text-sand/35"
              />
              {/* ⚖️ A COUNT UP, NEVER A COUNT DOWN. Nothing truncates what they
                  type, so this must not read as a budget being spent — it is
                  there so somebody three paragraphs in knows the box is still
                  with them. */}
              {door === 'idea' && wordCount(input) >= LONG_ENOUGH_TO_COUNT && (
                <p className="mt-2 text-[11px] text-sand/50">
                  {wordCount(input)} words — keep going if there is more.
                </p>
              )}
              {/* ⚖️ NO SPEECH-TO-TEXT, AND THE POINTER INSTEAD. Every phone
                  keyboard already dictates, and the browser API that would do
                  it here sends the creator's audio to a third party — a bad
                  trade on the one surface built to collect their raw thinking.
                  Shown only where the keyboard has the button. */}
              {door === 'idea' && (
                <p className="mt-2 text-[11px] text-sand/50 sm:hidden">
                  Tip: tap the mic on your keyboard and just talk.
                </p>
              )}
              {/* ⚠️ NAMES THE WAY OUT RATHER THAN JUST REFUSING. A creator who
                  typed prose under the reference door has not made a mistake —
                  they are in the wrong room, and the other room is one tap away. */}
              {needsLink && (
                <p className="mt-2 text-xs leading-relaxed text-sand">
                  That isn't a link.{' '}
                  <button type="button" onClick={() => setPicked('idea')} className="underline underline-offset-2 hover:text-cream">
                    Use it as an idea instead
                  </button>
                  , or paste the video's URL.
                </p>
              )}
            </div>
          )}

          {/* ── HOW LONG. ────────────────────────────────────────────────────
              ⚠️ DELIBERATELY NOT IN ADVANCED SETTINGS, and the comment two
              blocks below says why: "What this video is for" WAS buried in that
              collapsed panel, defaulted to unset for almost everyone, and every
              script was told it was not a selling video. Length is the same kind
              of question — the creator's intent, not an execution preference —
              and burying it would reproduce that failure exactly.

              ⚖️ AND IT IS ASKED FOR EVERY DOOR. Reference and Product could
              derive a default from what they were given; Idea and Suggest have
              nothing to derive from, and today Idea Mode produces whatever
              length it happens to produce. ── */}
          {!isHandoff && (
            <div className="mx-auto mt-7 max-w-md text-left">
              <div className="eyebrow mb-2.5">How long?</div>
              <div role="radiogroup" aria-label="How long should the video be?" className="grid grid-cols-3 gap-2.5">
                {LENGTHS.map((l) => {
                  const active = target === l.id
                  return (
                    <button
                      key={l.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setTarget(l.id)}
                      className={cn(
                        'rounded-xl border px-3 py-2.5 text-center transition-all',
                        active
                          ? 'border-coral/40 bg-coral/10 text-cream'
                          : 'border-white/8 bg-white/[0.015] text-stone hover:border-white/15',
                      )}
                    >
                      <div className="text-sm font-medium">{l.label}</div>
                      <div className="mt-0.5 text-[11px] leading-snug text-stone">{l.note}</div>
                    </button>
                  )
                })}
              </div>
              {/* ⚠️ THE 30-SECOND TRADE, SAID OUT LOUD. The episode slot only
                  exists at 60 and above, so choosing 30 is choosing an explainer
                  — a creator should learn that here, not at the teleprompter. */}
              {!shapeFor(target).includes('episode') && (
                <p className="mt-2 text-[11px] leading-relaxed text-sand/70">
                  At 30 seconds there's room for one idea, not a story with a before and after.
                </p>
              )}
            </div>
          )}

          {/* Advanced settings — a larger, more tactile toggle: the icon warms to
              coral on hover so it reads as interactive, not just a label. Hidden
              on the handoff doors, where nothing is being built yet. */}
          {!isHandoff && (
            <>
              <button
                onClick={() => setAdvanced((v) => !v)}
                className="group mx-auto mt-6 inline-flex items-center gap-2.5 rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-sand transition-all hover:border-coral/30 hover:bg-white/[0.06] hover:text-cream"
              >
                <SlidersHorizontal className="h-4 w-4 text-stone transition-colors group-hover:text-coral" /> Advanced settings
                <ChevronDown className={cn('h-4 w-4 text-stone transition-transform', advanced && 'rotate-180')} />
              </button>
              {advanced && (
                <div className="mx-auto mt-4 max-w-md space-y-6 rounded-panel border border-white/8 bg-ink2/50 p-5 text-left backdrop-blur-sm">
                  <OptionRow label="How it should sound" options={TONE} value={tone} onPick={(v) => setTone(v as Tone)} />
                  {/* ⚠️ "WHAT THIS VIDEO IS FOR" IS NO LONGER HERE. It was an
                      INTENT question buried in a collapsed panel two clicks from
                      the button, next to two EXECUTION preferences — so it defaulted
                      to unset for almost everyone, and an unset goal meant every
                      script was told "NOT a selling video".
                      It now opens with the other two intent questions the moment a
                      remix starts, where it is asked rather than discovered. What
                      stays here is what genuinely belongs here: how the writing
                      should be executed, not what the video is for. */}
                  {/* ⚠️ "HOW CLOSE TO THE REFERENCE" IS NO LONGER HERE EITHER — see
                      FIX 10 above. It duplicated `reference_use`, asked on the next
                      screen for every build, and the two could silently disagree. */}
                  <p className="text-xs leading-relaxed text-stone">
                    This steers the writing for real: <span className="text-sand">sound</span> sets the energy of the hooks and lines.
                    How closely to follow the reference is asked next.
                  </p>
                </div>
              )}
            </>
          )}

          {/* ── PICK A PRODUCT, HERE, WITHOUT LEAVING THE BUILD ─────────────
              ⚠️ THIS BUTTON USED TO NAVIGATE TO /products. The creator said
              what they wanted to make a video about and was answered with a
              filing cabinet — reported as "why does it still take me to the
              product library and there's no option to choose anything?" */}
          {picking && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="pick-product-title"
              className="fixed inset-0 z-[70] grid place-items-center bg-ink/80 p-4 backdrop-blur-sm"
            >
              <div className="glass gradient-border w-full max-w-md rounded-2xl p-5 text-left">
                <div className="flex items-start justify-between gap-3">
                  <h2 id="pick-product-title" className="font-display text-xl tracking-tight">
                    Which one is this video about?
                  </h2>
                  <button
                    type="button"
                    aria-label="Close"
                    className="-mt-1 px-2 py-1 text-lg leading-none text-stone hover:text-cream"
                    onClick={() => setPicking(false)}
                  >×</button>
                </div>

                {/* ⚠️ THREE STATES, AND NOT KNOWING IS ONE OF THEM. A failed
                    read must never render as "you have no products". */}
                {myProducts === null ? (
                  <p className="mt-4 text-sm text-stone">
                    We could not read your products just now.{' '}
                    <button type="button" className="underline underline-offset-2 hover:text-cream" onClick={() => nav('/products')}>
                      Open your library
                    </button>
                  </p>
                ) : myProducts.length === 0 ? (
                  <>
                    <p className="mt-3 text-sm leading-relaxed text-sand">
                      Nothing in your library yet. Add the thing you sell once, and Twin knows
                      what it may claim about it in every script after that.
                    </p>
                    <button type="button" className="btn-gradient mt-4 w-full" onClick={() => nav('/products?add=1')}>
                      Add a product
                    </button>
                  </>
                ) : (
                  <>
                    <ul className="mt-4 space-y-2">
                      {myProducts.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="w-full rounded-xl border border-white/10 px-4 py-3 text-left transition-colors hover:border-white/25 hover:bg-white/[0.04]"
                            onClick={() => {
                              // ⚖️ THE CHOICE TRAVELS WITH THE BUILD, so the
                              // building screen does not ask it again.
                              setPicking(false)
                              nav('/v2/building', {
                                state: {
                                  ...buildFieldsForDoor('idea', input.trim()),
                                  tone,
                                  selected_product_id: p.id,
                                  idempotency_key: crypto.randomUUID(),
                                },
                              })
                            }}
                          >
                            <span className="block truncate text-sm font-semibold text-cream">
                              {(p.name ?? '').trim() || 'Not named yet'}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-stone">
                              {relationshipLabel(p.relationship)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="mt-3 w-full py-2 text-center text-sm text-stone transition-colors hover:text-cream"
                      onClick={() => nav('/products?add=1')}
                    >Add another product</button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* The one CTA — centered, matched to the input width so the column reads
              as one tight, intentional stack. Its wording follows the door, so the
              button always says what is about to happen. */}
          <div className="mx-auto mt-7 max-w-md">
            <button
              onClick={go}
              disabled={(!isHandoff && (!input.trim() || needsLink)) || checking}
              className="btn-gradient w-full !py-4 text-base"
            >
              <Wand2 className="h-4 w-4" />
              {checking ? 'Checking…'
                : door === 'product' ? 'Pick a product'
                : door === 'browse' ? "See what's working"
                : 'Remix'}
            </button>
            {!isHandoff && (
              <p className="mt-2.5 text-center text-xs text-stone">{remixesLeft} remixes left · you're only charged when a script is written</p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Desktop option cards (the classic studio pattern: icon + label + note) ── */
function OptionRow({ label, options, value, onPick }: {
  label: string
  options: ReadonlyArray<{ id: string; label: string; note: string; icon: React.ComponentType<{ className?: string }> }>
  value: string
  onPick: (id: string) => void
}) {
  return (
    <div>
      <div className="eyebrow mb-2.5">{label}</div>
      <div className={cn('grid gap-2.5', options.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {options.map((o) => {
          const active = value === o.id
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onPick(o.id)}
              className={cn(
                'rounded-card border p-3.5 text-left transition-colors',
                active ? 'border-coral/50 bg-coral/[0.07]' : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
              )}
            >
              <o.icon className={cn('h-4 w-4', active ? 'text-coral' : 'text-stone')} />
              <div className={cn('mt-2 text-sm font-semibold', active ? 'text-cream' : 'text-sand')}>{o.label}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-stone">{o.note}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
