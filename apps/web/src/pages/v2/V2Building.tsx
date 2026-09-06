// Screen 2 — AI Building (Loading). Makes the wait feel productive: a live step
// list that names what the AI is doing (never a naked spinner), with a skeleton
// of the Plan screen behind it. Runs the real build, then auto-advances to the
// Plan screen the instant the timeline is ready. See PRODUCT_VISION §13.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Check, Loader2, Eye, Wand2, FileText, Clapperboard, Captions } from 'lucide-react'
import { generateBlueprint, ingestReference, getJob, findGenerationByKey, listBrandVoices } from '../../lib/api'
import { creatorFacingMessage } from '@twinai/shared'
import { loadProductEntities } from '../../lib/api'
import type { ProductEntityRecord } from '../../lib/api'
import { assessReadiness, isCommercialField } from '../../lib/api'
import { judgeFit, warningForPickedVideo, recordTalkingHeadChoice } from '../../lib/api'
import type { FitWarning, FitReason } from '../../lib/api'
import { TalkingHeadWarning } from '../../components/TalkingHeadWarning'
import { compileVideoIntent, showsCommercialBlock } from '@twinai/shared'
import {
  VIDEO_GOALS, CONTENT_FOCUS, VIEWER_OUTCOMES, REFERENCE_USE,
  INTENT_QUESTIONS, type IntentQuestion, type VideoGoal, focusForGoal,
  defaultVideoGoalFromContentGoals, CANONICAL_GOAL_LABELS,
} from '@twinai/shared'
import { assessReference, mayUseReference, REFERENCE_REASON_TEXT } from '../../lib/api'
import { REFERENCE_UNREAD_TEXT, REFERENCE_UNREAD_CODE, isReadCapacityExhausted } from '../../lib/api'
import { READINESS_INCOMPLETE_CODE, SELL_WITHOUT_TARGET_CODE } from '../../lib/api'
import type { ReadinessQuestion } from '../../lib/api'
import { isSupportedReference, platformFromUrl } from '@twinai/shared'
import { useAuth } from '../../context/AuthContext'
import { Aurora } from '../../components/Aurora'
import { cn } from '../../lib/cn'
import { VideoPlanCard } from '../../components/VideoPlanCard'
import type { VideoPlanInput } from '@twinai/shared'
import { loadKnowledgeForPlan } from '../../lib/creatorAnswers'
import { LogoMark } from '../../components/Logo'
import { buildRecordingScript } from '../../lib/api'
import { saveRecordingScript } from '../../lib/api'

const STEPS = [
  { label: 'Watching your reference', icon: Eye },
  { label: 'Finding the strongest hook', icon: Wand2 },
  { label: 'Writing your script', icon: FileText },
  { label: 'Planning your shots', icon: Clapperboard },
  // Honest: this build produces the caption packet + title/cover, not b-roll (b-roll
  // is an edit-time, env-gated feature that isn't on by default).
  { label: 'Writing your captions & title', icon: Captions },
]
// Target progress % per active step, so the bar always shows forward motion and
// the last (long) model call never looks frozen. Index 5 = finished → 100.
const STEP_PCT = [12, 34, 58, 80, 94, 100]
// The last step is one model call and it can run for minutes. Parking the bar on
// STEP_PCT[4] made it sit at exactly 94% the whole time, which reads as a hang —
// reported from a real run as "it stayed on ninety-four for five minutes". It
// creeps toward this ceiling instead: never still, never claiming to be done.
const LAST_STEP_CEILING = 99

// ⚖️ HOW OFTEN THE RECOVERY POLL ASKS "IS IT DONE YET". One indexed read on
// `idempotency_key`, only while this screen is visible AND still believes it is
// building. Three seconds is well under the time a creator will wait before
// deciding the product is broken, and far above anything that would trouble the
// database.
const RECOVERY_POLL_MS = 3000
// ⚠️ BOUNDED, BUT GENEROUSLY. Measured 2026-09-02: a real build with a live
// reference read took 2m35s end to end. 100 attempts is ~5 minutes, comfortably
// past that, and the loop simply STOPS rather than showing an error — the work
// may still be running server-side, and saying otherwise would be a claim we
// cannot support. Returning to the tab resets the budget.
const RECOVERY_MAX_ATTEMPTS = 100

// ⚖️ HOW LONG A LOST REQUEST WAITS BEFORE IT IS CALLED A FAILURE. 30 attempts
// at 3s is 90 seconds — five times the 18-second gap that stranded a real
// creator, and still short enough that a genuine failure is not held behind a
// spinner for minutes.
const RESCUE_ATTEMPTS = 30

// ⚠️ THE HOST LIST MOVED TO @twinai/shared, because there were two of them and
// only one was ever consulted. This copy answered "is it supported?" while the
// PLATFORM was taken from a parameter the client never sent — so 44 of 51
// reference transcripts stored a NULL platform and the studio showed the
// creator "unknown" beside a youtube.com link. One derivation now answers both.
const isSupportedRef = (url: string): boolean => isSupportedReference(url)

interface BuildState {
  reference_url?: string
  reference_note?: string
  fidelity?: 'close' | 'balanced' | 'loose'
  tone?: 'understated' | 'balanced' | 'punchy'
  // What this video is for. Absent means an engagement CTA — see GenerateInput.
  goal?: VideoGoal
  // Minted by V2Create, one per click of "build". Carried in nav state so a
  // remount of THIS screen reuses it — see buildKey below.
  idempotency_key?: string
}

// ONE CLICK-INTENT, ONE REMIX.
//
// The build runs in an effect guarded by `started` — a ref, which dies with the
// component. Navigating away and back mounts a fresh instance, the guard is
// false again, and the creator is charged a second time for the same video. The
// server (0119) converges on an idempotency key; this decides what that key is.
//
// Preference order matters. A key minted by V2Create is per-CLICK, so asking for
// the same video twice on purpose correctly costs twice. When there isn't one we
// derive a key from the INPUT and park it in sessionStorage, which makes a
// remount converge without making a deliberate rebuild impossible: sessionStorage
// dies with the tab, and V2Create mints a fresh key on the next real click.
function buildKey(state: BuildState): string {
  if (state.idempotency_key) return state.idempotency_key
  const sig = JSON.stringify([
    (state.reference_url || '').trim(),
    (state.reference_note || '').trim(),
    state.fidelity ?? 'balanced',
    state.tone ?? 'balanced',
    // GOAL IS PART OF THE IDENTITY OF A BUILD. Omitting it would make "the same
    // reference, now as a sell video" collide with the awareness version
    // already in sessionStorage, and the creator would be handed the old script
    // back with no sign anything was ignored.
    state.goal ?? 'none',
  ])
  const slot = `twinai.buildkey.${sig}`
  try {
    const existing = sessionStorage.getItem(slot)
    if (existing) return existing
    const minted = crypto.randomUUID()
    sessionStorage.setItem(slot, minted)
    return minted
  } catch {
    // Private mode / storage disabled. Falling back to a fresh key is the honest
    // failure: idempotency is unavailable, so the build behaves as it did before
    // 0119 rather than silently colliding with someone else's intent.
    return crypto.randomUUID()
  }
}

// A transcript that was fetched, measured and judged fit to follow is a fact
// about the REFERENCE, not about this component. Parking it under the build key
// means a remount that happens while the first build is still writing (so no
// generation row exists to find yet) doesn't sit through the ~72s read a second
// time for an answer we already have. It dies with the tab, like the key.
const transcriptSlot = (key: string) => `twinai.transcript.${key}`
function rememberTranscript(key: string, id: string): void {
  try { sessionStorage.setItem(transcriptSlot(key), id) } catch { /* storage off — just re-read */ }
}
function recallTranscript(key: string): string | undefined {
  try { return sessionStorage.getItem(transcriptSlot(key)) ?? undefined } catch { return undefined }
}

// ⚠️ TYPED ANSWERS DIED WITH A TAB SWITCH, AND THE BUILD STARTED OVER. Reported
// from a real session: the creator was part-way through answering the readiness
// questions, switched to another tab, came back to a blank screen and a build
// running from the beginning. Everything they had typed was component state, so
// a discarded tab (mobile Safari and Chrome both reclaim background tabs) took
// it — and the restored page had no questions open, so it went straight back to
// building.
//
// ⚖️ PARKED UNDER THE BUILD KEY, like the transcript above and for the same
// reason: it belongs to THIS build intent, not to this component instance, and
// it should die with the tab rather than outlive it into someone's next video.
const answersSlot = (key: string) => `twinai.answers.${key}`
const askSlot = (key: string) => `twinai.ask.${key}`
function rememberAnswers(key: string, answers: Record<string, string>): void {
  try { sessionStorage.setItem(answersSlot(key), JSON.stringify(answers)) } catch { /* storage off */ }
}
function recallAnswers(key: string): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(answersSlot(key))
    const parsed = raw ? JSON.parse(raw) : null
    // ⚖️ A CORRUPT SLOT IS AN EMPTY ONE. Restoring junk into the form would be
    // worse than asking again.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, string> : {}
  } catch { return {} }
}
// ── THE THREE THINGS ONLY THE CREATOR KNOWS ABOUT *THIS* VIDEO ────────────
//
// ⚠️ THE QUESTIONS AND THEIR PLAIN-ENGLISH LABELS LIVE IN @twinai/shared, beside
// the enums they map onto. They were defined here, which meant the wording and
// the behaviour it selects could drift apart silently — and the wording is the
// part a creator actually experiences.
//
// ⚖️ AND THE CARD CARRIES NO MAPPING LOGIC. A grouped option's sub-choices, the
// values that are deliberately unreachable on screen, and the routing that keeps
// a retired label's behaviour alive are all decided in one place. This file
// renders what it is given.
type ChipQuestion = IntentQuestion

const INTENT_FIELDS: ReadonlySet<string> = new Set(INTENT_QUESTIONS.map((q) => q.field))

/** A question the card can render: free text, or chips. */
type AskItem = ReadinessQuestion | ChipQuestion
const isChip = (q: AskItem): q is ChipQuestion =>
  Array.isArray((q as ChipQuestion).options)

// ── D2: THE RELATIONSHIP CHIP LIVES IN ONE PLACE, AND THIS IS NOT IT ──────
//
// ⚠️ THIS SCREEN USED TO ASK IT AGAIN, AS FREE TEXT. Product Library already
// has the real question — four chips, own it / earn from it / paid to
// feature it / just covering it — writing straight to
// `product_entities.relationship`, the enum every claim rule and disclosure
// check reads. This screen's own copy asked the same thing in prose and sent
// it to `readiness_answers.relationship`, which the server read only to
// satisfy a boolean gate (`READINESS_RELATIONSHIPS.includes(...)` — an
// exact-string match, never a parse), then discarded. It was never
// interpolated into a script and never written to a column. Typing "I get
// paid to feature it" did nothing a creator could see; only the four exact
// enum spellings, typed verbatim, ever passed the gate — which never
// happened in practice. A duplicate question with a dead-end answer.
//
// ⚖️ SO THE GATE NOW READS THE ENTITY DIRECTLY. `libraryRelationship` below
// resolves the same fact from Product Library instead, and the free-text box
// is gone — see `renderAsk`'s `relationship` branch, which is a link to
// Product Library, not an `<input>`.
/** Resolve the creator's relationship to the named offer from what Product
 *  Library already has on record, so the readiness check can be satisfied
 *  without ever re-asking it here.
 *
 *  ⚖️ NAME MATCH FIRST, SOLE ANSWER SECOND. A creator with several products
 *  is disambiguated by the offer name this build already settled on; a
 *  creator with exactly one answered product needs no disambiguation at
 *  all — asking them to match a name to itself would be its own tiny
 *  duplicate question. */
function libraryRelationship(
  products: readonly ProductEntityRecord[] | null,
  offer: string | null | undefined,
): string | null {
  if (!products?.length) return null
  const answered = products.filter((p) => p.relationship && p.relationship !== 'NONE')
  if (!answered.length) return null
  const offerNorm = (offer ?? '').trim().toLowerCase()
  if (offerNorm) {
    const hit = answered.find((p) => (p.name ?? '').trim().toLowerCase() === offerNorm)
    if (hit) return hit.relationship
  }
  return answered.length === 1 ? answered[0].relationship : null
}

// ⚖️ D3: THE SAME FALLBACK SHAPE AS D2, ONE FIELD OVER. The server
// (`generate-blueprint/index.ts`, `readyFacts`) already treats the
// Quick-things "What does the OFFER do?" answer as a fallback — it is
// consulted only when the matched product entity's `evidence.sections` is
// empty. Mirroring that HERE, before the question is ever put on screen, is
// what makes the fallback actually work: without it, a creator whose product
// already carries full extracted facts is still asked to retype them, and
// the answer is then silently discarded server-side because `readyFacts.
// length > 0`. Asked-and-ignored is a worse experience than never asked.
//
// ⚠️ MIRRORS THE SERVER'S DERIVATION EXACTLY: `evidence.sections` labels,
// not `knowledge` (the separate URL-extraction table) — matching
// `readyFacts` in `generate-blueprint/index.ts` line-for-line so client and
// server agree on when the fallback question is needed.
function libraryFacts(
  products: readonly ProductEntityRecord[] | null,
  offer: string | null | undefined,
): readonly string[] | null {
  if (!products?.length) return null
  const offerNorm = (offer ?? '').trim().toLowerCase()
  const match = offerNorm
    ? products.find((p) => (p.name ?? '').trim().toLowerCase() === offerNorm)
    : (products.length === 1 ? products[0] : null)
  if (!match) return null
  const ev = match.evidence
  if (!ev || ev === 'declined' || typeof ev !== 'object' || !Array.isArray(ev.sections)) return null
  return ev.sections.map((s) => String(s?.label ?? '')).filter((x) => x.trim() !== '')
}

/** ⚠️ A RESTORED ANSWER IS UNTRUSTED INPUT. sessionStorage can hold a value
 *  written by an older build whose enum has since changed, and a cast would
 *  send it anyway. Unknown reads as unanswered, which is the safe state. */
const asOneOf = <T extends string>(all: readonly T[], v: string | undefined): T | undefined =>
  (v && (all as readonly string[]).includes(v)) ? v as T : undefined

// ── THE PLAN SCREEN'S TWO PIECES OF MEMORY ────────────────────────────────
//
// ⚖️ ONE PER BUILD, NOT ONE PER MOUNT. `sessionStorage`, keyed the same way the
// questions are, so a reclaimed tab returns to a build that already showed its
// plan without showing it a second time.
const planSlot = (key: string) => `twin.plan.shown.${key}`
function planShown(key: string): boolean {
  try { return sessionStorage.getItem(planSlot(key)) === '1' } catch { return false }
}
function markPlanShown(key: string): void {
  try { sessionStorage.setItem(planSlot(key), '1') } catch { /* storage off — shows once more */ }
}

// ⚠️ THE OPT-OUT IS `localStorage`, SO IT OUTLIVES THE TAB — a preference that
// forgot itself every session would be a worse tax than the screen.
//
// ⚖️ AND IT IS PER-DEVICE, WHICH IS HONEST RATHER THAN IDEAL. A server-side
// preference is the right home once anyone actually uses this; storing it there
// today would be a write on the paid path for a setting nobody has expressed.
// Recorded so the follow-up is a decision rather than a discovery.
const PLAN_SKIP_KEY = 'twin.plan.skip'
function planSkipped(): boolean {
  try { return localStorage.getItem(PLAN_SKIP_KEY) === '1' } catch { return false }
}
function skipPlanAlways(): void {
  try { localStorage.setItem(PLAN_SKIP_KEY, '1') } catch { /* storage off — asked again next time */ }
}

// ⚠️ HOW MANY QUESTIONS MAY SHARE ONE CARD. Reported with a screenshot: three
// chip rows and three free-text boxes, twenty-five options, in one scroll. The
// three intent chips are the normal path; a readiness question is an exception
// and more than one at a time is a form.
//
// ⚖️ THE CHIPS ARE NEVER TRIMMED — they are the contract, and dropping one would
// silently unask a question whose answer changes retrieval. Only the free-text
// tail is capped, and what is dropped is asked by the server a moment later if
// it truly blocks.
const MAX_TEXT_QUESTIONS = 1

function rememberAsk(key: string, qs: AskItem[] | null): void {
  try {
    if (qs?.length) sessionStorage.setItem(askSlot(key), JSON.stringify(qs))
    else sessionStorage.removeItem(askSlot(key))
  } catch { /* storage off */ }
}
function recallAsk(key: string): AskItem[] | null {
  try {
    const raw = sessionStorage.getItem(askSlot(key))
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) && parsed.length ? parsed as AskItem[] : null
  } catch { return null }
}

export default function V2Building() {
  const nav = useNavigate()
  const loc = useLocation()
  const { refreshProfile } = useAuth()
  const state = (loc.state || {}) as BuildState
  const [active, setActive] = useState(0)
  const [pct, setPct] = useState(6)
  // True while the reference is being scraped/transcribed (step 0 is held the whole
  // time). Drives a slow crawl so the bar never freezes at 12% and reads as stuck.
  const [ingesting, setIngesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A reference we measured and will not build from. Distinct from `error`: this
  // is a decision about the INPUT, taken before any credit is spent, so the copy
  // says what to do next rather than apologising for a failure.
  const [unusableRef, setUnusableRef] = useState<string | null>(null)
  // ⚠️ THE SENTENCE ALONE WAS NOT ENOUGH TO DECIDE THE WAY OUT. Every cause
  //  used to share one button — "Try a different reference" — which is right
  //  for a video we could not read and WRONG when Twin's reading budget is
  //  spent, because the next reference fails identically. The screen needs to
  //  know WHICH refusal it is showing, so the cause is kept beside the copy.
  const [unreadCause, setUnreadCause] = useState<keyof typeof REFERENCE_UNREAD_TEXT | null>(null)
  // ── THE TALKING-HEAD WARNING ──────────────────────────────────────────────
  //
  // ⚠️ IT WARNS AND WAITS; IT DOES NOT REFUSE. Unlike `unusableRef` above, which
  // is a decision Twin makes alone, this one is the CREATOR'S. Twin agreed with
  // a human on 73% of the visual claims it was judged on, so it must never be
  // able to stop anybody — it may only say what it saw and hand back the choice.
  //
  // ⚖️ THE READ PAUSES HERE RATHER THAN RACING ON. The whole value is that the
  // question is asked BEFORE the slow work and before any spend, so the loop
  // holds on this promise until a button is pressed.
  const [gateWarn, setGateWarn] = useState<FitWarning | null>(null)
  const [gateBusy, setGateBusy] = useState(false)
  const gateResolve = useRef<((c: 'used_anyway' | 'picked_another') => void) | null>(null)
  // What Twin actually said, kept so the recorded row describes the warning the
  // creator SAW rather than what the rules would produce today.
  const gateCtx = useRef<{ jobId: string | null; reason: FitReason; framesLookedAt: number | null } | null>(null)
  // ⚠️ ASKED ONCE PER BUILD. The poll runs up to 60 times and the answer sits on
  // the job row for all of them; without this the card would reappear on every
  // tick after the creator had already answered it.
  const gateAsked = useRef(false)
  // ⚖️ A CONTRADICTION, NOT A MISSING INPUT. Readiness asks a question because an
  // answer would unblock the build; this one has no question — the goal and what
  // the creator has to sell disagree, and only they can settle which was wrong.
  const [contradiction, setContradiction] = useState<{ message: string; remedies: string[] } | null>(null)
  /** ⚠️ THE OFFER QUESTION WAS A BLANK TEXT BOX FOR A THING WE ALREADY KNOW. A
   *  creator who registered a product then had to type its name from memory, and
   *  whatever they typed — a nickname, a typo, a different product — became what
   *  the script pointed at, with no link back to the entity carrying its facts,
   *  its permissions and its photos.
   *
   *  ⚖️ SO THE ANSWER IS A CARD, AND TYPING IS THE FALLBACK. Null means the
   *  library has not been read yet, which is not the same as an empty library. */
  const [products, setProducts] = useState<ProductEntityRecord[] | null>(null)
  // ⚖️ A REFUSAL THAT ASKS, NOT ONE THAT APOLOGISES. The server could not settle
  // 1-3 inputs it needs to write confidently, so it declined to charge. This is
  // the reader for those questions — without it the server would be asking into
  // a void, which is the one thing this project never ships.
  // ⚠️ RESTORED, NOT RESET. A tab the browser reclaimed comes back to the card
  // it left — with the questions still open and the words still in the boxes.
  // ⚠️ THE PLAN IS A PAUSE, NOT A GATE, AND IT SITS EXACTLY WHERE THE QUESTION
  // CARD DOES: after the answers are in, before any ingest and before any
  // spend. Non-null means "show it and wait"; `null` means there is nothing to
  // show, which is also what a FAILED knowledge read produces — a plan built on
  // an outage would tell a creator "I have nothing from you" about a store that
  // is full.
  const [plan, setPlan] = useState<VideoPlanInput | null>(null)
  const [askQuestions, setAskQuestions] = useState<AskItem[] | null>(
    () => recallAsk(buildKey((loc.state || {}) as BuildState)))
  const [askAnswers, setAskAnswers] = useState<Record<string, string>>(
    () => recallAnswers(buildKey((loc.state || {}) as BuildState)))
  // Answers survive the retry so a second refusal never re-asks what was typed.
  // ⚖️ SEEDED FROM THE SAME SLOT. The ref is what the build actually sends, so
  // restoring only the visible form would show the creator their answers and
  // then generate without them.
  const answersRef = useRef<Record<string, string>>(
    recallAnswers(buildKey((loc.state || {}) as BuildState)))
  /** Record one answer and persist it in the same breath.
   *
   *  ⚠️ FIVE AFFORDANCES ANSWER THESE QUESTIONS — a chip, a sub-chip, a product
   *  chip, the "or type something else" box and the plain text box — and each
   *  one had its own copy of "merge, then remember". Five copies of a save is
   *  five chances for the next affordance to be added without one, and the event
   *  that loses an answer is not a submit: it is a background tab reclaimed with
   *  no warning and no unload.
   *
   *  ⚖️ SO THE SAVE IS THE FUNCTION, NOT A LINE INSIDE EACH HANDLER. A new
   *  control cannot forget to persist, because setting an answer is what
   *  persisting IS. */
  const answer = (field: string, value: string): void => setAskAnswers((a) => {
    const next = { ...a, [field]: value }
    rememberAnswers(buildKey(state), next)
    return next
  })
  // ⚖️ THE ONE PIECE OF STATE THE "CHANGE" AFFORDANCE NEEDS. False is the whole
  // point: the standing goal is shown, not asked, and the eight chips exist for
  // the exception rather than the rule.
  const [changingGoal, setChangingGoal] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)
  const started = useRef(false)
  // Set ONLY by the explicit Cancel button — so leaving via the nav (Library,
  // Calendar…) keeps the build running in the background, but Cancel truly stops
  // it (and never spends a credit).
  const cancelled = useRef(false)

  // While a build is in flight, warn before a tab close / refresh (that WOULD lose
  // the in-flight work). In-app navigation is safe — the build keeps running.
  useEffect(() => {
    if (error) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [error])

  // Ease the % bar toward the current step's target so it always creeps forward
  // (never a dead bar), and snaps to 100 the instant the plan is ready.
  //
  // The reference scrape holds step 0 for the whole read; if the bar just sat at
  // 12% it read as frozen ("people think it's stuck"). So while ingesting, step 0
  // gets a SLOW independent crawl up to a ~40% ceiling — always visibly moving,
  // but paced so it doesn't reach the ceiling before the read realistically ends.
  // Once the steps advance, the normal per-step targets take over.
  useEffect(() => {
    if (error) return
    const scraping = active === 0 && ingesting
    const writing = active === STEPS.length - 1 // the long model call
    const target = scraping ? 40 : writing ? LAST_STEP_CEILING : STEP_PCT[Math.min(active, STEP_PCT.length - 1)]
    const factor = scraping ? 0.012 : writing ? 0.004 : 0.08 // gentler climb during the long waits
    // No floor while writing: a floor is a promised RATE, and this step has no
    // known duration. Purely proportional motion is slow, always visible, and
    // never arrives — which is the honest shape of "still working".
    const floor = scraping ? 0.12 : writing ? 0 : 0.4
    const id = setInterval(() => {
      setPct((p) => (p >= target ? p : Math.min(target, p + Math.max(floor, (target - p) * factor))))
    }, 90)
    return () => clearInterval(id)
  }, [active, ingesting, error])

  useEffect(() => {
    // No input (e.g. refresh) → go back to Create.
    if (!state.reference_url && !state.reference_note) {
      nav('/v2', { replace: true })
      return
    }
    // ⚖️ `started` guards against a double-mount, not against a RETRY. A
    // readiness refusal is a legitimate second attempt with new inputs, so the
    // nonce re-arms the latch — without it the answers would be collected and
    // never sent, which is the "question with no reader" failure wearing a
    // different hat.
    if (started.current) return
    started.current = true

    const key = buildKey(state)
    const refUrl = (state.reference_url || '').trim()
    const willIngest = !!refUrl && isSupportedRef(refUrl)
    let ticker: ReturnType<typeof setInterval> | null = null
    // Advance the visible steps AFTER the reference is read (steps 1..4 track the
    // blueprint write). During a real ingest we hold on step 0 ("Watching your
    // reference") — which is now literally true.
    let alive = true
    const startPacing = () => {
      // Guard against a post-unmount start leaking an interval that never clears.
      if (!alive || cancelled.current) return
      setActive(willIngest ? 1 : 0)
      ticker = setInterval(() => { if (alive) setActive((a) => Math.min(a + 1, STEPS.length - 1)) }, 1400)
    }

    ;(async () => {
      try {
        // 0) IS THERE ANYTHING LEFT TO BUILD? Ask before doing any of it.
        //
        // `started` is a ref, so it dies with the component and every mount
        // re-runs everything below. 0119 made that safe for the creator's
        // credits — the key converges and the server returns the build it
        // already made — but nothing told THIS screen, so it re-walked the whole
        // sequence, ~72s reference read included, to arrive at a generation that
        // had existed the entire time. Reported from a real run: the bar reached
        // 94%, then started again from the beginning while the finished plan was
        // already sitting in the Library.
        //
        // One indexed lookup on the same key answers it. Found → there is
        // nothing to build, only somewhere to go, and the plan opens itself.
        //
        // A failed lookup NEVER blocks a build: the server's own idempotency is
        // the guarantee against a double charge, and this is only ever an
        // optimisation on top of it.
        try {
          const done = await findGenerationByKey(key)
          if (done) {
            if (alive) { setActive(STEPS.length); setPct(100); nav(`/result/${done.id}`, { replace: true }) }
            return
          }
        } catch (e) {
          console.warn('[build] existing-build lookup failed; building', e)
        }
        if (cancelled.current) return
        // 1) READING the reference is BEST-EFFORT. A supported link gets truly read
        //    (transcript + structure) for the most tailored script — but if the read
        //    fails, the video is private/unreadable, or the worker is briefly backed
        //    up, we DON'T hard-fail: we build the plan from the reference + the
        //    creator's DNA (pattern mode). A slightly-less-tailored script always
        //    beats "We hit a snag". The wait is also capped so a slow read never
        //    strands the creator for minutes.
        // EVERY UNREAD PATH STOPS HERE (§12 step 1). Below, four different
        // things can go wrong and all four used to end the same way: a
        // pattern-mode build, charged. They now end with a sentence naming
        // which one happened, and no spend.
        //
        // The server refuses the same case as a backstop, but it only ever
        // learns "no transcript arrived". This is the layer that knows the
        // host was unsupported, or the read timed out rather than failed — so
        // the creator is told what to change instead of what went wrong.
        const halt = (cause: keyof typeof REFERENCE_UNREAD_TEXT) => {
          if (alive) { setUnusableRef(REFERENCE_UNREAD_TEXT[cause]); setUnreadCause(cause); setActive(0) }
        }

        // ── ASK BEFORE THE WAIT, NOT AFTER IT ──────────────────────────
        //
        // ⚠️ THE ORDER WAS BACKWARDS AND A CREATOR FELT IT. The readiness
        // questions are returned by the SERVER, and the server is not called
        // until the reference has been ingested — `ingestReference` plus a poll
        // of up to 60 x 1.2s. So the creator watched a two-minute progress bar,
        // was then asked two questions, and pressing the build button
        // started the bar again. The questions are about the creator's own
        // intent; not one of them needs the reference read.
        //
        // ⚖️ SO THEY ARE ASKED FIRST, FROM ONE CHEAP ROW. `listBrandVoices` is a
        // single indexed read — milliseconds against two minutes — and it
        // carries the brief and profile the verdict needs.
        //
        // ⚖️ THE SERVER GATE STAYS. This is a courtesy layer that saves the
        // wait; the refusal that protects the charge still lives beside
        // `spend_credits`, where no caller — an old client, a direct POST — can
        // route around it.
        // ⚠️ THE GATE NOW ASKS "IS ANYTHING STILL UNANSWERED", not "has
        // anything been answered". The old form skipped the whole pre-check the
        // moment a single answer existed, which was correct when every question
        // was a repair and wrong now that three of them are always asked.
        const intentAnswered = INTENT_QUESTIONS.every(
          (q) => (answersRef.current[q.field] ?? '').trim())
        if (!askQuestions && !(intentAnswered && Object.keys(answersRef.current).length)) {
          try {
            // ⚖️ THE LIBRARY IS READ ALONGSIDE THE VOICE, NOT AFTER IT. Both are
            // cheap indexed reads, and the relationship verdict below needs the
            // library's answer before it can decide whether to ask anything —
            // fetching it later, only once a question was already on screen,
            // would mean asking first and checking second.
            const [voices, libraryProducts] = await Promise.all([
              listBrandVoices(),
              // A failed read falls back to "nothing on file" — the same
              // conservative default `assessReadiness` already treats a gap
              // as, never a reason to block this courtesy pre-check.
              loadProductEntities().catch(() => [] as ProductEntityRecord[]),
            ])
            // Reused by the `offer` chip's product picker below, so a creator
            // who reaches that branch does not pay for the same fetch twice.
            if (products === null) setProducts(libraryProducts)
            const v = voices.find((x) => x.is_default) ?? voices[0] ?? null
            const vBrief = ((v as { pre_script_brief?: Record<string, unknown> } | null)
              ?.pre_script_brief ?? {}) as Record<string, unknown>
            const str = (x: unknown) => (typeof x === 'string' ? x : undefined)
            const verdict = assessReadiness({
              goal: state.goal ?? str(vBrief.goal) ?? null,
              angle: state.reference_note || refUrl || str(vBrief.idea) || null,
              // ⚠️ THE CREATOR'S OWN WORDS ONLY. `profile.offer` is the scan's
              // guess and the scan prompt forbids a blank, so passing it here
              // made every creator "promoting" and put two mandatory product
              // questions on the card — including for one whose stored answer
              // was `nothing_to_sell`.
              offer: str(vBrief.offer) ?? null,
              // ⚖️ ONE FACT, ONE OWNER (D2). Product Library's entity is the
              // real answer to this question — read it first, matched against
              // the same offer name just above. `vBrief.promotes` is what a
              // NON-owned tie (affiliate, sponsor) is recorded under, for a
              // creator whose product row is not theirs to answer for.
              // "Nothing to sell" is an ANSWER too, and passing it through as
              // the relationship keeps `assessReadiness` from treating it as a
              // gap.
              relationship: libraryRelationship(libraryProducts, str(vBrief.offer)) ?? str(vBrief.promotes) ?? null,
              cta: str(vBrief.cta) ?? null,
              audience: str(vBrief.audience) ?? str(v?.profile?.audience) ?? null,
              referenceRead: Boolean(refUrl),
              hasCreatorKnowledge: Boolean(v?.profile),
              // D3: same source the server falls back to (`readyFacts`) — a
              // product entity with usable evidence means the free-text
              // claims question is not needed, here or on the server.
              productFacts: libraryFacts(libraryProducts, str(vBrief.offer)),
            })
            const missing: AskItem[] = verdict.fields
              .filter((f) => f.state === 'MISSING_REQUIRED' && f.question)
              .map((f) => ({ field: f.field, question: f.question as string }))
            // ⚠️ THE INTENT QUESTIONS ARE ASKED FOR EVERY VIDEO, not only when
            // something is missing. They are not a repair for an incomplete
            // profile — they are about a video that does not exist yet, so
            // there is nothing to be complete about. Asked FIRST because they
            // are three taps and the readiness ones are typing.
            //
            // ⚖️ ONLY THE ONES NOT ALREADY ANSWERED FOR THIS BUILD. A tab
            // reclaimed mid-answer restores what was picked, and re-asking it
            // would throw the creator's own answer away in front of them.
            const unanswered = INTENT_QUESTIONS.filter(
              (q) => !(answersRef.current[q.field] ?? '').trim())
            // ⚖️ CAPPED, NOT DISCARDED. `assessReadiness` already orders these
            // by what unblocks the most, so the first is the one worth asking.
            // ── AND NOT THE COMMERCIAL ONES, IF THIS VIDEO SELLS NOTHING ──
            //
            // ⚠️ REPORTED FROM A SCREENSHOT: a relationship question, a claims
            // question and "what does the OFFER do?" on a card belonging to
            // somebody with an empty Product Library who had just chosen "build
            // authority" and "a hot take". `assessReadiness` resolves those
            // itself when the PROFILE says nothing is promoted — but the verdict
            // above is computed before the creator answers the chips beside it,
            // so this video's own answer never reached it.
            //
            // ⚖️ ONLY WHEN THEY HAVE ACTUALLY ANSWERED. An unanswered card says
            // nothing about commerce, and suppressing on silence would hide a
            // question from somebody who simply had not tapped yet. The server
            // gate is unchanged either way — this drops a question we would have
            // asked early, never one that protects a charge.
            const answeredIntent = compileVideoIntent({
              goal: answersRef.current.video_goal,
              focus: answersRef.current.content_focus,
            })
            const decidedCommercially = Boolean(
              (answersRef.current.video_goal ?? '').trim() && (answersRef.current.content_focus ?? '').trim())
            const relevant = decidedCommercially && !showsCommercialBlock(answeredIntent)
              ? missing.filter((m) => !isCommercialField(m.field))
              : missing
            // ⚠️ THE GOAL IS DISPLAYED, NOT ASKED — AND THIS IS WHERE THAT
            // HAPPENS. `contentGoals` is a standing preference the creator
            // already gave Twin during onboarding; re-asking it every single
            // video is the same fact owned in two places, and the previous fix
            // (pre-select the chip, still show all eight) only made the
            // duplicate question cheaper to answer, not gone.
            //
            // ⚖️ SO: PRE-ANSWER IT AND TAKE IT OUT OF THE QUESTION LIST. The
            // card then renders it as one line — "For: Teach something ·
            // Change" — which is zero taps when their standing goal is right
            // and one tap when it is not. The value is still SENT, so the
            // per-video answer still wins on the server.
            //
            // ⚖️ AND ONLY WHEN THERE IS A STANDING GOAL TO SHOW. A creator who
            // never gave one still gets the full question, because displaying a
            // fact nobody owns would be inventing one.
            const standingGoal = defaultVideoGoalFromContentGoals(
              Array.isArray(vBrief.contentGoals) ? vBrief.contentGoals as string[] : null)
            // ⚖️ WRITTEN BEFORE THE LIST IS BUILT, because the list is what asks
            // and this is what stops it asking. Only when the chip was actually
            // going to be asked, and only when nothing was already picked or
            // restored for THIS build — a tab reclaimed mid-answer must not
            // have the creator's own choice overwritten in front of them.
            if (standingGoal
              && unanswered.some((q) => q.field === 'video_goal')
              && !(askAnswers.video_goal ?? '').trim()) {
              answer('video_goal', standingGoal)
            }
            // ⚠️ NOT READ BACK OUT OF `answersRef`, AND THAT WAS THE BUG WAITING
            // TO HAPPEN. `answer` writes React state; `answersRef` is only
            // reconciled when the build button is pressed. Reading the ref
            // immediately after writing would have seen the OLD value, silently
            // left the goal in the question list, and re-asked it anyway — the
            // exact thing this change exists to stop.
            const goalIsDisplayed = Boolean(standingGoal)
            const ask: AskItem[] = [
              ...unanswered.filter((q) => !(goalIsDisplayed && q.field === 'video_goal')),
              ...relevant.slice(0, MAX_TEXT_QUESTIONS),
            ]
            if (ask.length && alive) {
              // No spend, no ingest, no wait — and `active` stays at 0 so the
              // bar does not pretend work is happening behind the card.
              rememberAsk(key, ask)
              setAskQuestions(ask)
              setActive(0)
              setIngesting(false)
              return
            }

            // ⚠️ THE PLAN, ONCE, AFTER THE QUESTIONS AND BEFORE THE SPEND. It
            // sits here rather than earlier because the angle is only settled
            // once the intent answers are in, and later would be after money.
            //
            // ⚖️ SKIPPED SILENTLY IN THREE CASES, AND ALL THREE ARE DELIBERATE:
            // the creator turned it off, this build key already showed it (a
            // reclaimed tab must not re-ask), or the knowledge read FAILED —
            // because a plan assembled from an outage would tell a creator
            // "I have nothing from you" about a store that is full.
            if (alive && !planSkipped() && !planShown(key)) {
              const items = await loadKnowledgeForPlan()
              if (!alive) return
              if (items) {
                markPlanShown(key)
                setPlan({
                  // ⚖️ THE SAME EXPRESSION THE READINESS CHECK CALLS "angle"
                  // twenty lines above. Two notions of what this video is
                  // would be two answers to the creator's question.
                  angle: state.reference_note || refUrl || str(vBrief.idea) || null,
                  knowledge: items,
                  // ⚖️ AND THE SAME `libraryFacts` THE SERVER MIRRORS. This is
                  // what makes "no confirmed facts" true of the actual script.
                  readyFacts: libraryFacts(libraryProducts, str(vBrief.offer)),
                  // ⚠️ `canShowProduct` IS DELIBERATELY NOT PASSED. The
                  // capability is not on `pre_script_brief` — it is written and
                  // read elsewhere — and passing a key that does not exist
                  // would assert "they cannot film it" from a lookup miss.
                  // Unanswered is not no, and a wrong gap is worse than none.
                })
                setActive(0)
                setIngesting(false)
                return
              }
            }
          } catch (e) {
            // ⚖️ A FAILED PRE-CHECK MUST NOT BLOCK A BUILD. The server asks the
            // same question authoritatively a moment later; losing the courtesy
            // is a slower path, not a broken one.
            console.warn('[build] readiness pre-check skipped', e)
          }
        }

        // An unreadable host never even reaches the worker. This used to sail
        // straight past into a paid build whose reference was decoration.
        if (refUrl && !willIngest) { halt('unsupported_host'); return }

        // A read this key already completed. Skipping it skips only the WAIT —
        // the transcript it returns was measured and accepted the first time.
        let transcript_id: string | undefined = willIngest ? recallTranscript(key) : undefined
        // null = we have a transcript, or there was no read to do.
        let unread: keyof typeof REFERENCE_UNREAD_TEXT | null = null
        if (willIngest && !transcript_id) {
          setIngesting(true)
          try {
            const { jobId, transcriptId } = await ingestReference(refUrl, platformFromUrl(refUrl) ?? undefined)
            transcript_id = transcriptId // cache hit → immediate
            if (!transcript_id) {
              // Starts as the timeout, because that is what an answer that
              // never comes IS. Each branch below that learns something more
              // specific overwrites it; reaching the end of the loop leaves it
              // true. Defaulting to `null` instead would make silence look
              // like success.
              unread = 'read_timed_out'
              // Poll on a tighter 1.2s cadence so a transcript that finishes early is
              // picked up promptly (was 2.5s → up to 2.5s wasted after it was ready).
              // ~72s ceiling preserved, then we proceed in pattern mode regardless.
              for (let i = 0; i < 60; i++) {
                await new Promise((r) => setTimeout(r, 1200))
                if (cancelled.current) return // explicit Cancel → stop, no spend
                const job = await getJob(jobId)
                if (!job) continue

                // ⚠️ THE EARLY ANSWER ARRIVES BEFORE THE TRANSCRIPT, ON PURPOSE.
                // The worker publishes it on the way past, so this fires while
                // the job is still running — which is the entire point. Asking
                // after `done` would be an apology, not a warning.
                //
                // ⚖️ `unsure` FALLS THROUGH SILENTLY. warningForPickedVideo
                // returns null for anything but does_not_fit, so a check that
                // failed, timed out or simply could not tell costs the creator
                // nothing and says nothing. A broken check must never become an
                // obstacle.
                const early = job.result?.early_look
                if (early && !gateAsked.current) {
                  gateAsked.current = true
                  const decision = judgeFit(early)
                  const warn = warningForPickedVideo(decision)
                  if (warn) {
                    gateCtx.current = {
                      jobId,
                      reason: decision.reason,
                      framesLookedAt: early.framesLookedAt ?? null,
                    }
                    const choice = await new Promise<'used_anyway' | 'picked_another'>((resolve) => {
                      gateResolve.current = resolve
                      if (alive) { setGateWarn(warn); setIngesting(false) }
                    })
                    if (cancelled.current) return // Cancel during the question → no spend
                    if (choice === 'picked_another') {
                      // ⚠️ NO SPEND, AND STRAIGHT BACK TO THE COMPOSER. They took
                      // the advice; the useful next screen is the one with the
                      // link box on it, not a progress bar they must abandon.
                      if (alive) nav('/v2', { replace: true })
                      return
                    }
                    if (alive) setIngesting(true)
                  }
                }
                if (job.status === 'done' && job.result?.transcript_id) {
                  // REJECT AN UNUSABLE REFERENCE BEFORE IT POISONS THE SCRIPT.
                  // §5: "a bad reference link — 12 minutes, no speech, a
                  // slideshow, a song. Currently goes straight in and produces
                  // confident nonsense." The nonsense is confident precisely
                  // because nothing said the input was unusable.
                  //
                  // Withholding the transcript id is the WHOLE mechanism —
                  // `generate-blueprint` already builds from the reference plus
                  // the creator's DNA when no transcript arrives, which is the
                  // same pattern mode a failed read has always fallen back to.
                  // So this adds a reason, not a new code path.
                  //
                  // An UNKNOWN verdict proceeds. A reference we could not
                  // measure is one we have no opinion about, and discarding the
                  // creator's own choice on no evidence is the same overreach in
                  // the other direction.
                  const check = assessReference({
                    durationSec: job.result.duration_sec ?? null,
                    wordCount: job.result.words ?? null,
                  })
                  if (mayUseReference(check)) {
                    transcript_id = job.result.transcript_id
                    unread = null // read, measured, and fit to follow
                  } else {
                    // STOP. DO NOT SPEND.
                    //
                    // This used to record the reason and carry on into a
                    // pattern-mode build, on the theory that a less-tailored
                    // script beats "We hit a snag". That theory charges a remix
                    // for a video the creator did not ask for: they pasted a
                    // reference precisely so the script would follow it, and we
                    // announced at 94% that we had ignored it — after the money
                    // was gone.
                    //
                    // A creator who wants a build from their own style alone can
                    // have one for free: leave the reference out. What they must
                    // never get is a bill for us silently substituting that.
                    if (alive) {
                      setUnusableRef(REFERENCE_REASON_TEXT[check.reason])
                      setActive(0)
                    }
                    return
                  }
                  break
                }
                // A job that finished WITHOUT a transcript is a different fact
                // from one that failed, and from one still running. Naming it
                // stops all three collapsing into "taking too long".
                // ⚠️ CHECKED BEFORE THE STATUS, AND WHILE THE JOB IS STILL
                // `queued`. A job retrying against an exhausted DAILY quota
                // never reaches `failed` inside this 72s window, so it used to
                // fall out of the loop as `read_timed_out` — telling the
                // creator their video was slow when nothing about their video
                // was involved. The error text is on the row from the first
                // attempt, which is what makes it answerable in time.
                if (isReadCapacityExhausted(job.error)) { unread = 'read_unavailable'; break }
                if (job.status === 'done') { unread = 'read_empty'; break }
                if (job.status === 'failed') { unread = 'read_failed'; break }
              }
            }
          } catch (e) {
            // Ingest itself errored. Logged, then refused — this is exactly the
            // case that used to become a silent pattern-mode charge.
            console.warn('[build] reference read failed; refusing to spend', e)
            unread = 'read_failed'
          } finally {
            setIngesting(false)
          }
        }

        if (cancelled.current) return // Cancel pressed during the read → no spend
        if (unread) { halt(unread); return }
        if (transcript_id) rememberTranscript(key, transcript_id)
        startPacing()
        // ⚖️ SPLIT AT THE POINT OF SEND, from one stored map. Two maps in
        // sessionStorage would be two things a reclaimed tab could restore out
        // of step with each other.
        const intentAnswers: Record<string, string> = {}
        const readinessAnswers: Record<string, string> = {}
        for (const [k, v] of Object.entries(answersRef.current)) {
          if (INTENT_FIELDS.has(k)) intentAnswers[k] = v
          else readinessAnswers[k] = v
        }
        const gen = await generateBlueprint({
          reference_url: refUrl,
          reference_note: state.reference_note || '',
          fidelity: state.fidelity ?? 'balanced',
          tone: state.tone,
          // ⚠️ THE THREE INTENT ANSWERS RIDE THE REQUEST, NOT `readiness_answers`.
          // Readiness answers are creator-stable facts that get persisted to the
          // brief so they are never asked twice; these are per-VIDEO and must
          // not be written to a profile — the next video gets its own answers.
          // `state.goal` is gone with the Advanced Settings picker.
          // ⚖️ NARROWED THROUGH THE ENUMS RATHER THAN CAST. A cast would let a
          // stale sessionStorage value from an older build reach the request as
          // a goal that no longer exists.
          goal: asOneOf(VIDEO_GOALS, intentAnswers.video_goal),
          focus: asOneOf(CONTENT_FOCUS, intentAnswers.content_focus),
          outcome: asOneOf(VIEWER_OUTCOMES, intentAnswers.viewer_outcome),
          // ⚖️ THE ONE ANSWER ABOUT THE REFERENCE RATHER THAN THE CREATOR.
          // Narrowed through the enum like the other three, so a stale value
          // from an older build cannot reach the request as a setting that no
          // longer exists.
          reference_use: asOneOf(REFERENCE_USE, intentAnswers.reference_use),
          ...(Object.keys(readinessAnswers).length ? { readiness_answers: readinessAnswers } : {}),
          // Same intent → same key → the server returns the build it already
          // made instead of charging for it twice (0119).
          idempotency_key: key,
          ...(transcript_id ? { transcript_id } : {}),
        })
        // A recreation was just spent — refresh so the remixes-left counter is
        // accurate everywhere (AppShell / Dashboard / Settings), not one behind.
        void refreshProfile()
        const timeline = buildRecordingScript({
          generationId: gen.id,
          blueprint: gen.blueprint,
          selectedHook: gen.selected_hook,
          platform: gen.blueprint?.reference_read?.platform,
        })
        await saveRecordingScript(timeline)
        if (ticker) clearInterval(ticker)
        // The blueprint is saved server-side regardless of navigation, so it's
        // already in the Library. Only route the user there if they're still here.
        if (alive) { setActive(STEPS.length); nav(`/result/${gen.id}`, { replace: true }) }
      } catch (e) {
        if (ticker) clearInterval(ticker)
        if (!alive) return
        // ── THE SERVER MAY HAVE FINISHED THE THING THIS REQUEST LOST ─────
        //
        // ⚠️ REPORTED AS "it stopped at 40%", AND THE DATABASE AGREES. Every
        // script_attempt on this project has settled `succeeded` — including
        // one that produced a generation while the creator watched a bar sit
        // still. The build is ONE long request, ~50-70 seconds; a backgrounded
        // tab, a sleeping phone or a dropped connection kills the socket, and
        // the work carries on server-side to completion. The creator is charged
        // for a script they are never shown.
        //
        // ⚖️ THE LOOKUP ALREADY EXISTED AND RAN IN ONLY ONE PLACE — on mount,
        // before building. That covers a reload and nothing else. It never ran
        // for the case it was written for, because a creator whose bar froze
        // stays on the page rather than reloading it.
        //
        // ⚖️ IDEMPOTENCY IS WHAT MAKES THIS SAFE. `key` is the same value the
        // server keyed the charge on, so this can only ever find the build this
        // request paid for.
        try {
          const rescued = await findGenerationByKey(key)
          if (rescued) {
            if (alive) { setActive(STEPS.length); setPct(100); nav(`/result/${rescued.id}`, { replace: true }) }
            return
          }
        } catch (lookupErr) {
          console.warn('[build] post-failure lookup failed', lookupErr)
        }
        // The server's own hard stop. Reached only when this screen's checks
        // did not fire first — a client older than the server, or a read that
        // looked fine here and produced nothing there. It is a refusal, not a
        // failure, and nothing was charged, so it must not wear "We hit a
        // snag": that copy sends the creator to retry the thing that will
        // refuse again.
        if ((e as { code?: string } | null)?.code === REFERENCE_UNREAD_CODE) {
          setUnusableRef(e instanceof Error ? e.message : REFERENCE_UNREAD_TEXT.read_failed)
          setActive(0)
          return
        }
        // Also not a failure and not a charge, and NOT answerable here.
        if ((e as { code?: string } | null)?.code === SELL_WITHOUT_TARGET_CODE) {
          setContradiction({
            message: e instanceof Error ? e.message : 'This video is set to sell, but there is nothing to sell.',
            remedies: (e as { remedies?: string[] }).remedies ?? [],
          })
          setActive(0)
          return
        }
        // Not a failure and not a charge — the build is waiting on the creator.
        if ((e as { code?: string } | null)?.code === READINESS_INCOMPLETE_CODE) {
          const qs = (e as { questions?: ReadinessQuestion[] }).questions ?? []
          if (qs.length) { rememberAsk(key, qs); setAskQuestions(qs); setActive(0); return }
          // A code with no questions is a server we do not understand. Falling
          // through to the generic error beats rendering an empty form.
        }
        // ── ASKING ONCE, AT THE WORST POSSIBLE MOMENT ────────────────────
        //
        // ⚠️ MEASURED 2026-09-02, AND THIS IS THE RACE. The single lookup above
        // fires the INSTANT the request died — which is exactly when the server
        // is most likely to still be finishing. Real numbers from production:
        // charged 13:55:33, generation row written 13:58:08. A fetch that died
        // around 13:57:50 got its one lookup at 13:57:51, EIGHTEEN SECONDS
        // before the script existed, found nothing, and showed "We hit a snag".
        // The row landed moments later and nothing looked again.
        //
        // ⚠️ THE CREATOR WAS CHARGED, TOLD IT FAILED, AND THE SCRIPT WAS SITTING
        // IN THEIR LIBRARY. That is the worst of the three possible outcomes:
        // worse than a clean failure with a refund, and worse than a slow
        // success, because they have no reason to go looking for the thing they
        // were just told does not exist.
        //
        // ⚖️ SO KEEP ASKING BEFORE DECLARING FAILURE. Placed BELOW the coded
        // refusals on purpose: REFERENCE_UNREAD, SELL_WITHOUT_TARGET and
        // READINESS_INCOMPLETE are decisions, not lost answers — no generation
        // is coming for them and waiting would only stall a creator who needs to
        // act. This waits only on the genuinely-unknown failure.
        for (let i = 0; i < RESCUE_ATTEMPTS; i++) {
          await new Promise((r) => setTimeout(r, RECOVERY_POLL_MS))
          if (!alive) return
          try {
            const late = await findGenerationByKey(key)
            if (late) {
              if (alive) { setActive(STEPS.length); setPct(100); nav(`/result/${late.id}`, { replace: true }) }
              return
            }
          } catch (lookupErr) {
            // A failed read is not evidence the build failed. Keep asking.
            console.warn('[build] late lookup failed', lookupErr)
          }
        }
        // ⚠️ NEVER THE LIBRARY'S OWN WORDS. `e.message` here was
        // "Edge Function returned a non-2xx status code" on a real creator's
        // screen — supabase-js's FunctionsHttpError, printed verbatim. The
        // original still reaches the console for whoever is debugging; the
        // creator gets a sentence written for them.
        console.warn('[build] failed', e)
        setError(creatorFacingMessage(e))
      }
    })()

    // Unmount (in-app nav): the build keeps running so it lands in the Library —
    // we only stop the visual ticker. Explicit Cancel is what actually aborts it.
    return () => { alive = false; if (ticker) clearInterval(ticker) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryNonce])

  // ── A HIDDEN TAB MUST NOT COST A SCRIPT ───────────────────────────────
  //
  // ⚠️ REPORTED TWICE, AS TWO SYMPTOMS OF ONE THING: "it stopped at 40%", and
  // "when I go to another tab it does not carry on in the background". Both are
  // the same request. The build is a single ~50-70 second fetch that the browser
  // is free to throttle or drop when the tab is not visible, and when the socket
  // dies quietly nothing rejects — so the catch above never runs and the bar
  // simply stops where the pacing ticker left it.
  //
  // ⚖️ THE WORK NEVER STOPPED. `generate-blueprint` runs server-side to
  // completion and settles its own charge, which is why every script_attempt in
  // production reads `succeeded`. What was lost is only the answer, and the
  // answer is addressable by the same idempotency key the charge used.
  //
  // ⚖️ SO COMING BACK IS THE TRIGGER. On every return to the tab, while this
  // screen still believes it is building, ask whether the build already exists.
  // It is one indexed read on a user gesture, it cannot double-charge, and a
  // failure leaves the screen exactly as it was.
  //
  // ⚠️ A ONE-SHOT LOOKUP ON THE GESTURE WAS NOT ENOUGH, AND THE GAP IS THE
  // COMMON CASE. Returning to the tab fires this once. If the build is still
  // in flight at that instant the lookup finds nothing, and when it finishes
  // ten seconds later NOTHING NOTICES — the screen sits at its frozen
  // percentage until the creator switches tabs again to re-trigger the very
  // handler meant to rescue them. Reported from production: "when I minimize
  // the tab it gets stuck without moving forward".
  //
  // ⚠️ AND THE BAR FREEZING IS NOT THE BUG, IT IS THE SYMPTOM. Both intervals
  // on this screen are cosmetic — the progress climb and the step ticker.
  // Browsers throttle background timers, so the animation stalls while the real
  // work, a single long `await` on generate-blueprint, continues server-side.
  // What actually strands the creator is the fetch itself being dropped when a
  // mobile browser reclaims a background tab: the promise never settles, and no
  // amount of returning to the tab settles it.
  //
  // ⚖️ SO RECOVERY IS A POLL WHILE VISIBLE, NOT A SINGLE SHOT. It costs one
  // indexed read on `idempotency_key` every few seconds, only while this screen
  // still believes it is building, and it cannot double-charge because it only
  // ever reads. It covers both cases at once: the fetch that died in the
  // background, and the fetch that is still running fine.
  useEffect(() => {
    // Nothing to recover once the screen has settled into an outcome.
    if (error || unusableRef || contradiction || askQuestions) return
    const key = buildKey(state)
    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false
    let attempts = 0

    const stop = () => { stopped = true; if (timer) { clearTimeout(timer); timer = null } }

    const look = () => {
      if (stopped || document.visibilityState !== 'visible') return
      // ⚖️ BOUNDED. A screen left open for an hour must not read forever; the
      // cap is far beyond any real build and simply stops the loop rather than
      // showing an error, because the work may genuinely still be running.
      if (attempts >= RECOVERY_MAX_ATTEMPTS) return
      attempts += 1
      void findGenerationByKey(key)
        .then((done) => {
          if (stopped) return
          if (done) {
            stop()
            setActive(STEPS.length); setPct(100)
            nav(`/result/${done.id}`, { replace: true })
            return
          }
          timer = setTimeout(look, RECOVERY_POLL_MS)
        })
        .catch((e) => {
          if (stopped) return
          console.warn('[build] recovery lookup failed', e)
          // A failed read is not evidence the build failed — keep looking.
          timer = setTimeout(look, RECOVERY_POLL_MS)
        })
    }

    const onVisible = () => {
      if (document.visibilityState !== 'visible') { if (timer) { clearTimeout(timer); timer = null } ; return }
      // ⚖️ RE-ARM ON EVERY RETURN. Attempts reset so a creator who steps away
      // repeatedly is never quietly out of budget.
      attempts = 0
      if (!timer) look()
    }

    document.addEventListener('visibilitychange', onVisible)
    // Start immediately when the screen is already in front of them: a dropped
    // fetch does not wait for a tab switch to strand someone.
    if (document.visibilityState === 'visible') look()
    return () => { stop(); document.removeEventListener('visibilitychange', onVisible) }
  }, [state, error, unusableRef, contradiction, askQuestions, nav])

  // ⚠️ THE ROW IS WRITTEN BEFORE THE FLOW RESUMES, and the buttons are disabled
  // while it is in flight. Two rows from one decision would corrupt the only
  // evidence that says whether this gate is any good.
  //
  // ⚖️ BUT A FAILED WRITE NEVER TRAPS THE CREATOR. recordTalkingHeadChoice
  // swallows its own errors, so the resolve below always runs.
  const answerGate = async (choice: 'used_anyway' | 'picked_another') => {
    if (gateBusy) return
    setGateBusy(true)
    const ctx = gateCtx.current
    if (ctx) {
      await recordTalkingHeadChoice({
        jobId: ctx.jobId,
        // does_not_fit is the only verdict that produces a card, and its three
        // reasons are exactly the values the table accepts.
        reason: ctx.reason as 'ANIMATED' | 'NOBODY_ON_CAMERA' | 'NOBODY_TALKING_TO_CAMERA',
        framesLookedAt: ctx.framesLookedAt,
        choice,
      })
    }
    setGateBusy(false)
    setGateWarn(null)
    const resolve = gateResolve.current
    gateResolve.current = null
    resolve?.(choice)
  }

  const echo = state.reference_url ? 'From your reference link' : 'From your idea'
  const shownPct = Math.round(pct)
  // Only a supported host is actually watched/transcribed; a described idea or an
  // unsupported link is used as a guide (pattern mode). Keep the first step honest so
  // it never claims to "watch" something it can't read.
  const willRead = !!state.reference_url && isSupportedRef(state.reference_url)
  const stepLabel = (i: number, base: string) =>
    i !== 0 ? base : willRead ? 'Watching your reference' : state.reference_url ? 'Using your reference as a guide' : 'Working from your idea'
  // A voice-not-ready failure has a specific fix (set up your brand voice), not just
  // "try a different reference".
  const isVoiceIssue = /voice/i.test(error ?? '')

  // ── THE CARD IS TWO BLOCKS, AND THEY ARE NOT THE SAME KIND OF THING ───────
  //
  // ⚖️ THE DECISIONS ARE ASKED OF EVERY VIDEO; THE COMMERCIAL BLOCK IS ASKED OF
  // ALMOST NONE. Stacking them into one undifferentiated list made a card that
  // is normally three taps look like a form, because the two free-text boxes
  // below the chips read as more work rather than as a different subject that
  // only appears when Twin already believes there is an offer to talk about.
  //
  // ⚠️ THE SPLIT IS ON `isChip`, WHICH IS THE EXISTING DISTINCTION AND NOT A NEW
  // ONE. Chips are the fixed-enum decisions that drive the intent record; every
  // other item fires from an inferred offer and is answered in the creator's own
  // words. Introducing a second, parallel notion of "which block is this" would
  // be a field that can disagree with the renderer.
  // ⚖️ LOADED ONLY WHEN SOMETHING IS BEING ASKED. On the ordinary path — no
  // questions, the build just runs — the library is never read, because a fetch
  // nobody's answer depends on is a fetch that can only slow a build down.
  useEffect(() => {
    if (!askQuestions?.some((q) => q.field === 'offer') || products !== null) return
    let alive = true
    loadProductEntities()
      .then((rows) => { if (alive) setProducts(rows) })
      // ⚖️ A FAILED READ FALLS BACK TO TYPING RATHER THAN BLOCKING THE ANSWER.
      // [] would claim the creator has no products, which is a different thing.
      .catch(() => { if (alive) setProducts([]) })
    return () => { alive = false }
  }, [askQuestions, products])

  // ── THE GOAL, DISPLAYED RATHER THAN RE-ASKED ─────────────────────────────
  //
  // ⚠️ DERIVED, NOT STORED, SO A RECLAIMED TAB STILL SHOWS IT. The condition is
  // exactly "we have an answer for the goal and we are not asking for one" —
  // which is true both when the pre-check just filled it from the standing
  // preference and when sessionStorage restored it, without a second flag that
  // could disagree with the first.
  const goalQuestion = INTENT_QUESTIONS.find((q) => q.field === 'video_goal') ?? null
  const displayedGoal = !(askQuestions ?? []).some((q) => q.field === 'video_goal')
    ? ((VIDEO_GOALS as readonly string[]).includes(askAnswers.video_goal ?? '')
      ? askAnswers.video_goal as VideoGoal : null)
    : null

  const decisions = (askQuestions ?? []).filter(isChip)
  const commercial = (askQuestions ?? []).filter((q) => !isChip(q))
  const hasTwoBlocks = decisions.length > 0 && commercial.length > 0

  /** ⚖️ ONE RENDERER, TWO COLUMNS. The blocks differ in what they ask and
   *  where they sit, never in how a question behaves — so the chip logic, the
   *  sub-option row and the keystroke-level save live here once. Copying them
   *  per column is how two lists drift into two behaviours. */
  const renderAsk = (q: AskItem) => (
            <div key={q.field} className="block">
              <span className="text-sm leading-relaxed text-cream">{q.question}</span>
              {isChip(q) ? (
                // ⚖️ CHIPS, NOT A TEXT BOX. These three have a fixed set of
                // answers that map to decisions downstream; free text would
                // have to be interpreted, and an interpretation is a guess
                // wearing the creator's words.
                // ⚖️ A FRAGMENT: the chip branch is two siblings now — the
                // options row, and the sub-options row it can reveal.
                <>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {q.options.map((o) => {
                    // A grouped option is chosen when ANY of its children is.
                    const kids = o.options ?? []
                    const picked = askAnswers[q.field] ?? ''
                    const active = kids.length
                      ? kids.some((c) => c.value === picked)
                      : picked === o.value
                    // ⚠️ "SELL SOMETHING" AND "MY PRODUCT OR SERVICE" READ AS ONE
                    // QUESTION ASKED TWICE, and a creator said so. The goal now
                    // fills the subject in and the chip SAYS WHY, so the pair
                    // explains itself where it is asked rather than in a doc.
                    //
                    // ⚖️ SHOWN, NOT STORED. `askAnswers` stays empty until the
                    // creator taps: an implied answer written as a chosen one
                    // makes "did creators actually want this" unanswerable
                    // forever — the `default_taken` lesson from the hook picker.
                    // The compiler applies the same implication server-side, so
                    // the untapped chip still takes effect.
                    const implied = !picked && q.field === 'content_focus'
                      && focusForGoal({
                        goal: asOneOf(VIDEO_GOALS, askAnswers.video_goal),
                        focus: null,
                      }).focus === o.value
                    return (
                      <button
                        key={o.value}
                        type="button"
                        aria-pressed={active}
                        title={o.hint}
                        onClick={() => {
                          // Tapping the active chip clears it, so a mis-tap
                          // is one tap to undo rather than a reload. A group
                          // opens on its FIRST child, which the second row
                          // then lets the creator change — so one tap is
                          // always a complete answer.
                          answer(q.field, active ? '' : (kids[0]?.value ?? o.value))
                        }}
                        className={cn(
                          'rounded-full border px-3.5 py-2 text-left text-[13px] transition-colors',
                          active
                            ? 'border-coral/50 bg-coral/[0.08] text-cream'
                            : implied
                              // ⚖️ DIMMER THAN A REAL CHOICE, ON PURPOSE. It reads
                              // as "already handled" without claiming the creator
                              // picked it.
                              ? 'border-coral/25 bg-coral/[0.04] text-cream/90'
                              : 'border-white/10 bg-white/[0.02] text-sand hover:border-white/20 hover:bg-white/[0.04]',
                        )}
                      >
                        <span className="block leading-tight">{o.label}</span>
                        {implied && (
                          <span className="mt-0.5 block text-[11px] leading-snug text-coral/70">
                            {focusForGoal({
                              goal: asOneOf(VIDEO_GOALS, askAnswers.video_goal), focus: null,
                            }).because}
                          </span>
                        )}
                        {/* ⚖️ THE HINT IS THE DISAMBIGUATION, so it only
                            appears where two labels could be confused. */}
                        {o.hint && (
                          <span className="mt-0.5 block text-[11px] leading-snug text-stone">{o.hint}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {/* ⚠️ THE SECOND LEVEL, REVEALED ONLY WHEN ITS GROUP IS OPEN.
                    Comment, share and follow are three different endings and
                    collapsing them internally would have thrown two payoffs
                    away to save two chips. Grouping is visual; the behaviour
                    stays whole. */}
                {q.options.filter((o) => o.options?.length
                  && o.options.some((c) => c.value === (askAnswers[q.field] ?? '')))
                  .map((group) => (
                    <div key={`${group.value}-sub`} className="mt-2 flex flex-wrap gap-2 pl-1">
                      {(group.options ?? []).map((c) => {
                        const on = (askAnswers[q.field] ?? '') === c.value
                        return (
                          <button
                            key={c.value}
                            type="button"
                            aria-pressed={on}
                            onClick={() => answer(q.field, c.value)}
                            className={cn(
                              'rounded-full border px-3 py-1.5 text-[12px] transition-colors',
                              on
                                ? 'border-coral/40 bg-coral/[0.06] text-cream'
                                : 'border-white/8 bg-white/[0.015] text-stone hover:border-white/15',
                            )}
                          >{c.label}</button>
                        )
                      })}
                    </div>
                  ))}
                </>
              ) : q.field === 'offer' && (products?.length ?? 0) > 0 ? (
                // ⚠️ THE ONE QUESTION WHOSE ANSWER WE ALREADY HAVE. Asking a
                // creator to retype a product they registered is asking them to
                // be their own database — and the string they type has no way
                // back to the entity that carries the product's facts, its
                // permissions and its photos.
                <>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {(products ?? []).map((pr) => {
                    const label = (pr.name ?? '').trim() || 'Unnamed product'
                    const active = (askAnswers[q.field] ?? '') === label
                    return (
                      <button
                        key={pr.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => answer(q.field, active ? '' : label)}
                        className={cn(
                          'rounded-xl border px-3.5 py-2 text-left text-[13px] transition-colors',
                          active
                            ? 'border-coral/50 bg-coral/[0.08] text-cream'
                            : 'border-white/10 bg-white/[0.02] text-sand hover:border-white/20 hover:bg-white/[0.04]',
                        )}
                      >
                        <span className="block leading-tight">{label}</span>
                        {/* ⚖️ WHAT TWIN KNOWS ABOUT IT, SO THE CHOICE IS
                            INFORMED. A creator with two products picks better
                            knowing one has been read and the other has not. */}
                        <span className="mt-0.5 block text-[11px] leading-snug text-stone">
                          {pr.knowledge === null
                            ? 'Twin has not read this one yet'
                            : pr.knowledge.length === 0
                              ? 'Nothing usable found on its page'
                              : `${pr.knowledge.length} thing${pr.knowledge.length === 1 ? '' : 's'} Twin can say about it`}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {/* ⚖️ TYPING STAYS, BECAUSE THE LIBRARY IS NOT THE ONLY TRUTH.
                    A creator may be pointing this video at something they have
                    not registered, and a picker with no way out would make the
                    Product Library the price of answering a question. */}
                <input
                  type="text"
                  autoComplete="off"
                  value={askAnswers[q.field] ?? ''}
                  onChange={(ev) => answer(q.field, ev.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-cream outline-none placeholder:text-stone/60 focus:border-signature"
                  placeholder="Or type something else"
                />
                </>
              ) : q.field === 'relationship' ? (
                // ⚠️ D2: NOT A TEXT BOX. This is a duplicate of Product
                // Library's own four-chip question ("own it / earn from it /
                // paid to feature it / just covering it"), which writes the
                // real enum column (`product_entities.relationship`) that
                // every claim rule and disclosure check reads. A free-text
                // answer here never reached any of that — it only ever
                // satisfied a gate that matched it against the exact enum
                // spelling, which a typed sentence never is. So this sends the
                // creator to the one place that answer actually counts,
                // instead of asking it again for nothing.
                <button
                  type="button"
                  onClick={() => nav('/products')}
                  className="mt-2.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-left text-[13px] text-sand transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                >
                  Open Product Library to set it →
                </button>
              ) : (
                <input
                  type="text"
                  autoComplete="off"
                  value={askAnswers[q.field] ?? ''}
                  // ⚠️ SAVED ON EVERY KEYSTROKE, because the event that loses
                  // them is not a submit — it is a background tab being
                  // reclaimed with no warning and no unload. `answer` is what
                  // makes that true for every control at once.
                  onChange={(ev) => answer(q.field, ev.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-cream outline-none placeholder:text-stone/60 focus:border-signature"
                  placeholder="Your answer"
                />
              )}
            </div>
  )

  return (
    // Brand canvas, vertically centered in the space BETWEEN the app chrome (top
    // bar + tab bar, ~8rem on phone) so the card sits clean and the nav/tab bar stay
    // reachable — the creator can leave to any tab while it builds. Desktop centers
    // full-height beside the sidebar.
    <div className="relative grid min-h-[calc(100dvh-8rem)] w-full place-items-center overflow-clip bg-ink px-5 py-8 text-cream lg:min-h-[100dvh] lg:py-10">
      <Aurora className="opacity-70" />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute left-1/2 top-1/3 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-coral/10 blur-[150px]" />
        <div className="absolute right-1/4 bottom-1/4 h-[18rem] w-[18rem] rounded-full bg-teal/10 blur-[130px]" />
      </div>

      {/* ⚖️ THE CARD WIDENS ONLY WHEN THERE ARE TWO COLUMNS TO PUT IN IT. Every
          other state here — building, refused, errored — is a single narrow
          column, and stretching it to three inches of whitespace on a desktop
          to keep one class name simple would make every one of them worse. */}
      <div className={cn('relative w-full max-w-md', hasTwoBlocks && 'lg:max-w-3xl')}>
        {/* ⚠️ THE PLAN SITS AHEAD OF THE QUESTION CARD IN THIS CHAIN AND CAN
            NEVER COLLIDE WITH IT: it is only ever set once `askQuestions` came
            back empty, which is the one path that reaches it. Ordered this way
            so the reader can see there is no state where both are open — ONE
            screen, never two, is a promise about the flow and not only a
            promise about this card. */}
        {plan ? (
          <VideoPlanCard
            input={plan}
            busy={false}
            onWrite={() => {
              // ⚖️ CLEARING THE PLAN IS WHAT RESUMES THE BUILD. `markPlanShown`
              // already fired, so the retry runs straight past this block to
              // the ingest and the spend — no second pause, no second read.
              setPlan(null)
              setRetryNonce((n) => n + 1)
            }}
            onSkipAlways={() => {
              // ⚖️ HONOURED IMMEDIATELY, NOT NEXT TIME. A preference that took
              // effect on the following build would look broken on the one
              // where it was expressed.
              skipPlanAlways()
              setPlan(null)
              setRetryNonce((n) => n + 1)
            }}
          />
        ) : askQuestions ? (
          // NOT an error, and the copy leads with the thing that protects the
          // creator: nothing was charged. Twin declined to write a script it
          // would have had to fill with questions, and is asking the few things
          // that turn it into a real one.
          <div className="glass gradient-border p-7">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-signature-soft"><LogoMark size={22} /></span>
            <h2 className="mt-4 text-center font-display text-2xl">
              {askQuestions.some(isChip) ? 'What is this video for?' : 'A couple of quick things'}
            </h2>
            <p className="mt-2 text-center text-sm leading-relaxed text-stone">
              {askQuestions.some(isChip)
                // ⚖️ THE CARD IS NO LONGER ONLY A REFUSAL. Three of these are
                // asked for every video, so leading with "no remix has been
                // used" would read as an accusation on the happy path.
                ? 'No remix has been used yet. Three taps — Twin decides how to make it, you decide what it is for.'
                : 'No remix has been used. Twin would rather ask than guess — a guess here ends up as a claim in your voice.'}
            </p>
            {/* ⚖️ TWO COLUMNS ONLY WHERE THERE IS ROOM, AND ONLY WHEN THERE ARE
                TWO BLOCKS. On a phone this is the same single stack it always
                was; the split exists because on a desktop the three decisions
                and the offer questions were separated by a scroll. */}
            <div className={cn('mt-6', hasTwoBlocks && 'lg:grid lg:grid-cols-2 lg:gap-8')}>
              <div className="space-y-4">
                {hasTwoBlocks && (
                  <span className="block text-[11px] uppercase tracking-wide text-stone/70">What this video is for</span>
                )}
                {/* ⚠️ ONE FACT, ONE OWNER, DISPLAYED WITH A WAY TO CHANGE IT.
                    The creator told Twin what their content is for during
                    onboarding. Re-asking that here, every video, is the same
                    question in two places — so this SHOWS the answer and offers
                    to change it. Zero taps when it is right, one tap when it is
                    not, and the value is still sent so the per-video answer
                    still outranks the standing one on the server. */}
                {displayedGoal && !changingGoal && (
                  <div className="block">
                    <span className="text-sm leading-relaxed text-cream">This video is for</span>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-coral/50 bg-coral/[0.08] px-3.5 py-2 text-[13px] text-cream">
                        {CANONICAL_GOAL_LABELS[displayedGoal]}
                      </span>
                      <button
                        type="button"
                        onClick={() => setChangingGoal(true)}
                        className="rounded-full px-2 py-1 text-[12px] text-stone underline underline-offset-2 transition-colors hover:text-cream"
                      >Change</button>
                    </div>
                    {/* ⚖️ SAYING WHERE IT CAME FROM IS WHAT MAKES IT A DISPLAY
                        RATHER THAN A GUESS. A prefilled value with no
                        provenance is indistinguishable from Twin deciding. */}
                    <span className="mt-1.5 block text-[11px] leading-snug text-stone/70">
                      From what you told us your content is for. Changing it here only affects this video.
                    </span>
                  </div>
                )}
                {/* ⚖️ NOT GATED ON `displayedGoal`, DELIBERATELY. Tapping an active
                    chip clears it, so the displayed value can legitimately
                    become empty while the creator is mid-change — gating on it
                    would make the whole question vanish under their finger. */}
                {changingGoal && goalQuestion && renderAsk(goalQuestion)}
                {decisions.map(renderAsk)}
              </div>
              {commercial.length > 0 && (
                <div className="mt-6 space-y-4 lg:mt-0">
                  {/* ⚠️ NAMED AS OPTIONAL IN THE HEADING ITSELF, because these
                      boxes fire from an INFERRED offer and the button does not
                      wait for them. A creator who cannot answer one must be able
                      to see that without discovering it by clicking. */}
                  <span className="block text-[11px] uppercase tracking-wide text-stone/70">
                    About what you sell <span className="normal-case tracking-normal text-stone/50">— optional</span>
                  </span>
                  {commercial.map(renderAsk)}
                </div>
              )}
            </div>
            <button
              type="button"
              // Every question must be answered: each one is here because
              // guessing it would put a claim in the creator's mouth, so a
              // partial answer would send us back to the same refusal.
              // ⚠️ ONLY THE CHIPS BLOCK, AND THE OLD RULE WAS AN UNESCAPABLE CARD.
              // Requiring every question meant a creator who picked all three
              // chips and left the free-text boxes empty could not click this
              // button at all — and those boxes fire from an INFERRED offer, so
              // for most creators they were unanswerable as well as mandatory.
              //
              // ⚖️ THE CHIPS ARE THE CONTRACT. They are three taps, always
              // answerable, and they are what the build actually needs. A
              // readiness question left blank is a thinner script; a card that
              // cannot be dismissed is no script at all.
              disabled={askQuestions.some(
                (q) => isChip(q) && !(askAnswers[q.field] ?? '').trim())}
              onClick={() => {
                answersRef.current = { ...answersRef.current, ...askAnswers }
                // ⚖️ THE ANSWERS OUTLIVE THE CARD, THE CARD DOES NOT. Keeping
                // the answers means a tab reclaimed mid-build still sends them;
                // clearing the questions means it does not re-ask what was just
                // answered.
                rememberAnswers(buildKey(state), answersRef.current)
                rememberAsk(buildKey(state), null)
                setAskQuestions(null)
                started.current = false
                setError(null)
                setActive(0)
                setPct(6)
                setRetryNonce((n) => n + 1)
              }}
              className="btn-gradient mt-6 w-full disabled:opacity-40"
            >
              Create my version
            </button>
            <button onClick={() => nav('/v2', { replace: true })} className="btn-ghost mt-3 w-full">Start over</button>
          </div>
        ) : contradiction ? (
          // ⚠️ THE SELL/NO-OFFER CONTRADICTION, SHOWN AS WHAT IT IS. Before this
          // it reached the writer as two opposing instructions in one prompt and
          // the model picked one, so the creator paid for a script that either
          // pitched nothing or sold something they had never told us about.
          <div className="glass gradient-border p-7 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-signature-soft"><LogoMark size={22} /></span>
            <h2 className="mt-4 font-display text-2xl">Nothing to sell yet</h2>
            <p className="mt-2 text-sm leading-relaxed text-stone">{contradiction.message}</p>
            {contradiction.remedies.length > 0 && (
              <ul className="mt-4 space-y-1.5 text-left text-sm text-sand">
                {contradiction.remedies.map((r) => <li key={r}>· {r}</li>)}
              </ul>
            )}
            <p className="mt-3 text-xs leading-relaxed text-stone/80">No remix was used.</p>
            <button onClick={() => nav('/products')} className="btn-gradient mt-6 w-full">Open my Product Library</button>
            <button onClick={() => nav('/v2', { replace: true })} className="btn-ghost mt-3 w-full">Start over</button>
          </div>
        ) : gateWarn ? (
          // ⚠️ IT REPLACES THE PROGRESS BAR RATHER THAN SITTING BESIDE IT. The
          // requirement was that this "very apparently" limits bad results; a
          // note next to a spinner is read by nobody.
          <TalkingHeadWarning
            warning={gateWarn}
            busy={gateBusy}
            onPickAnother={() => { void answerGate('picked_another') }}
            onUseAnyway={() => { void answerGate('used_anyway') }}
          />
        ) : unusableRef ? (
          // NOT "We hit a snag" — nothing went wrong and nothing was charged. The
          // reference was read, measured, and judged the wrong shape to copy.
          // Saying so plainly is what stops a creator paying to find out.
          <div className="glass gradient-border p-7 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-signature-soft"><LogoMark size={22} /></span>
            <h2 className="mt-4 font-display text-2xl">We can’t follow that reference</h2>
            <p className="mt-2 text-sm leading-relaxed text-stone">{unusableRef}</p>
            {/* The two ways out are the same whichever check refused, so they
                live here rather than in the per-cause sentence above. "Shorter"
                used to be here and is advice about only one of them. */}
            {/* ⚖️ THE WAY OUT DEPENDS ON THE CAUSE, AND ONLY HERE. For every
                other refusal another video really is the answer. When Twin's
                own reading budget is spent it is not: the next reference hits
                the identical wall, so sending someone off to re-pick videos
                would cost them an afternoon to learn what we already know. */}
            {unreadCause === 'read_unavailable' ? (
              <>
                <p className="mt-3 text-xs leading-relaxed text-stone/80">
                  No remix was used, and another link will not help — this is on
                  our side, not yours. You can build from your own idea now,
                  which costs nothing extra, or come back later and use the link.
                </p>
                <button onClick={() => nav('/v2', { replace: true })} className="btn-gradient mt-6 w-full">Build from my own idea</button>
              </>
            ) : (
              <>
                <p className="mt-3 text-xs leading-relaxed text-stone/80">
                  No remix was used. Try another short-form video from TikTok,
                  Instagram or YouTube — or build from your own idea with no
                  reference at all, which costs nothing extra.
                </p>
                <button onClick={() => nav('/v2', { replace: true })} className="btn-gradient mt-6 w-full">Try a different reference</button>
              </>
            )}
          </div>
        ) : error ? (
          <div className="glass gradient-border p-7 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-coral/15"><LogoMark size={22} /></span>
            <h2 className="mt-4 font-display text-2xl">We hit a snag</h2>
            <p className="mt-2 text-sm leading-relaxed text-stone">{error}</p>
            {isVoiceIssue ? (
              <>
                <button onClick={() => nav('/brands')} className="btn-gradient mt-6 w-full">Set up your brand voice</button>
                <button onClick={() => nav('/v2', { replace: true })} className="btn-ghost mt-3 w-full">Try a different reference</button>
              </>
            ) : (
              <button onClick={() => nav('/v2', { replace: true })} className="btn-gradient mt-6 w-full">Try a different reference</button>
            )}
          </div>
        ) : (
          <div className="glass gradient-border p-5 sm:p-8">
            {/* Signature icon + gentle pulse */}
            <div className="relative mx-auto h-14 w-14">
              <span className="absolute inset-0 animate-ping rounded-2xl bg-signature opacity-30" />
              <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-signature shadow-glow">
                <LogoMark size={26} />
              </span>
            </div>

            <h1 className="mt-5 text-center font-display text-2xl tracking-tight">Building your video plan</h1>
            <p className="mt-1 text-center text-sm text-stone">{echo}</p>

            {/* Live progress */}
            <div className="mt-6 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-amber via-coral to-teal transition-[width] duration-200 ease-out" style={{ width: `${shownPct}%` }} />
              </div>
              <span className="w-10 text-right text-sm font-semibold tabular-nums text-cream">{shownPct}%</span>
            </div>

            {/* Steps — done / active / pending */}
            <ul className="mt-6 space-y-3.5">
              {STEPS.map((s, i) => {
                const done = i < active
                const isActive = i === active
                return (
                  <li key={i} className="flex items-center gap-3">
                    {done ? (
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-coral"><Check className="h-4 w-4 text-white" /></span>
                    ) : isActive ? (
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-coral"><Loader2 className="h-3.5 w-3.5 animate-spin text-coral" /></span>
                    ) : (
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-dashed border-white/15 text-[11px] font-bold text-stone">{i + 1}</span>
                    )}
                    {/* min-w-0 flex-1 + a non-shrinking status: on a 360px phone
                        the longest label ("Using your reference as a guide") and
                        the status badge were both shrinkable, so the badge wrapped
                        mid-word and the rows stopped lining up with each other.
                        The label is the only thing allowed to wrap; the badge
                        keeps its own line and the right edge stays straight. */}
                    <span className={cn('min-w-0 flex-1 text-sm', done ? 'text-sand' : isActive ? 'font-medium text-cream' : 'text-stone')}>{stepLabel(i, s.label)}</span>
                    {isActive && <span className="shrink-0 whitespace-nowrap text-[11px] font-medium text-amber">Working…</span>}
                    {done && <span className="shrink-0 whitespace-nowrap text-[11px] font-medium text-coral">Done</span>}
                  </li>
                )
              })}
            </ul>

            {/* The "we are building from your idea instead" notice lived here. It
                is gone because the thing it excused is gone: an unusable
                reference now STOPS before the spend and says so on its own
                screen, rather than being announced at 94% on a build the
                creator has already paid for. */}
            <p className="mt-6 rounded-card border border-white/8 bg-white/[0.02] px-4 py-3 text-center text-xs leading-relaxed text-stone">
              Usually 30–60 seconds. Leave anytime — we keep building and it lands in your Library.
            </p>
            <button onClick={() => { cancelled.current = true; nav('/v2', { replace: true }) }} className="mt-3 block w-full text-center text-sm text-stone transition-colors hover:text-cream">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
