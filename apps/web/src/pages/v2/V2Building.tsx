// Screen 2 — AI Building (Loading). Makes the wait feel productive: a live step
// list that names what the AI is doing (never a naked spinner), with a skeleton
// of the Plan screen behind it. Runs the real build, then auto-advances to the
// Plan screen the instant the timeline is ready. See PRODUCT_VISION §13.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Check, Loader2, Eye, Wand2, FileText, Clapperboard, Captions } from 'lucide-react'
import { generateBlueprint, ingestReference, getJob, findGenerationByKey, listBrandVoices } from '../../lib/api'
import { assessReadiness, isCommercialField } from '../../lib/api'
import { compileVideoIntent, showsCommercialBlock } from '@twinai/shared'
import {
  VIDEO_GOALS, CONTENT_FOCUS, VIEWER_OUTCOMES, REFERENCE_USE,
  INTENT_QUESTIONS, type IntentQuestion, type VideoGoal,
} from '@twinai/shared'
import { assessReference, mayUseReference, REFERENCE_REASON_TEXT } from '../../lib/api'
import { REFERENCE_UNREAD_TEXT, REFERENCE_UNREAD_CODE } from '../../lib/api'
import { READINESS_INCOMPLETE_CODE } from '../../lib/api'
import type { ReadinessQuestion } from '../../lib/api'
import { isSupportedReference, platformFromUrl } from '@twinai/shared'
import { useAuth } from '../../context/AuthContext'
import { Aurora } from '../../components/Aurora'
import { cn } from '../../lib/cn'
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

/** ⚠️ A RESTORED ANSWER IS UNTRUSTED INPUT. sessionStorage can hold a value
 *  written by an older build whose enum has since changed, and a cast would
 *  send it anyway. Unknown reads as unanswered, which is the safe state. */
const asOneOf = <T extends string>(all: readonly T[], v: string | undefined): T | undefined =>
  (v && (all as readonly string[]).includes(v)) ? v as T : undefined

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
  // ⚖️ A REFUSAL THAT ASKS, NOT ONE THAT APOLOGISES. The server could not settle
  // 1-3 inputs it needs to write confidently, so it declined to charge. This is
  // the reader for those questions — without it the server would be asking into
  // a void, which is the one thing this project never ships.
  // ⚠️ RESTORED, NOT RESET. A tab the browser reclaimed comes back to the card
  // it left — with the questions still open and the words still in the boxes.
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
          if (alive) { setUnusableRef(REFERENCE_UNREAD_TEXT[cause]); setActive(0) }
        }

        // ── ASK BEFORE THE WAIT, NOT AFTER IT ──────────────────────────
        //
        // ⚠️ THE ORDER WAS BACKWARDS AND A CREATOR FELT IT. The readiness
        // questions are returned by the SERVER, and the server is not called
        // until the reference has been ingested — `ingestReference` plus a poll
        // of up to 60 x 1.2s. So the creator watched a two-minute progress bar,
        // was then asked two questions, and pressing "Build my video plan"
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
            const voices = await listBrandVoices()
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
              // ⚖️ "Nothing to sell" is an ANSWER. Passing it through as the
              // relationship keeps `assessReadiness` from treating it as a gap.
              relationship: str(vBrief.promotes) ?? null,
              cta: str(vBrief.cta) ?? null,
              audience: str(vBrief.audience) ?? str(v?.profile?.audience) ?? null,
              referenceRead: Boolean(refUrl),
              hasCreatorKnowledge: Boolean(v?.profile),
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
            const ask: AskItem[] = [...unanswered, ...relevant.slice(0, MAX_TEXT_QUESTIONS)]
            if (ask.length && alive) {
              // No spend, no ingest, no wait — and `active` stays at 0 so the
              // bar does not pretend work is happening behind the card.
              rememberAsk(key, ask)
              setAskQuestions(ask)
              setActive(0)
              setIngesting(false)
              return
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
        // Not a failure and not a charge — the build is waiting on the creator.
        if ((e as { code?: string } | null)?.code === READINESS_INCOMPLETE_CODE) {
          const qs = (e as { questions?: ReadinessQuestion[] }).questions ?? []
          if (qs.length) { rememberAsk(key, qs); setAskQuestions(qs); setActive(0); return }
          // A code with no questions is a server we do not understand. Falling
          // through to the generic error beats rendering an empty form.
        }
        setError(e instanceof Error ? e.message : 'Something went wrong building your plan.')
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
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      // Nothing to recover if the screen has already settled into an outcome.
      if (error || unusableRef || askQuestions) return
      const key = buildKey(state)
      void findGenerationByKey(key)
        .then((done) => { if (done) { setActive(STEPS.length); setPct(100); nav(`/result/${done.id}`, { replace: true }) } })
        .catch((e) => console.warn('[build] visibility lookup failed', e))
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [state, error, unusableRef, askQuestions, nav])

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

      <div className="relative w-full max-w-md">
        {askQuestions ? (
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
            <div className="mt-6 space-y-4">
              {askQuestions.map((q) => (
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
                        return (
                          <button
                            key={o.value}
                            type="button"
                            aria-pressed={active}
                            title={o.hint}
                            onClick={() => setAskAnswers((a) => {
                              // Tapping the active chip clears it, so a mis-tap
                              // is one tap to undo rather than a reload. A group
                              // opens on its FIRST child, which the second row
                              // then lets the creator change — so one tap is
                              // always a complete answer.
                              const next = {
                                ...a,
                                [q.field]: active ? '' : (kids[0]?.value ?? o.value),
                              }
                              rememberAnswers(buildKey(state), next)
                              return next
                            })}
                            className={cn(
                              'rounded-full border px-3.5 py-2 text-left text-[13px] transition-colors',
                              active
                                ? 'border-coral/50 bg-coral/[0.08] text-cream'
                                : 'border-white/10 bg-white/[0.02] text-sand hover:border-white/20 hover:bg-white/[0.04]',
                            )}
                          >
                            <span className="block leading-tight">{o.label}</span>
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
                                onClick={() => setAskAnswers((a) => {
                                  const next = { ...a, [q.field]: c.value }
                                  rememberAnswers(buildKey(state), next)
                                  return next
                                })}
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
                  ) : (
                    <input
                      type="text"
                      autoComplete="off"
                      value={askAnswers[q.field] ?? ''}
                      onChange={(ev) => setAskAnswers((a) => {
                        // ⚠️ SAVED ON EVERY KEYSTROKE, because the event that
                        // loses them is not a submit — it is a background tab
                        // being reclaimed with no warning and no unload.
                        const next = { ...a, [q.field]: ev.target.value }
                        rememberAnswers(buildKey(state), next)
                        return next
                      })}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-cream outline-none placeholder:text-stone/60 focus:border-signature"
                      placeholder="Your answer"
                    />
                  )}
                </div>
              ))}
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
              Build my video plan
            </button>
            <button onClick={() => nav('/v2', { replace: true })} className="btn-ghost mt-3 w-full">Start over</button>
          </div>
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
            <p className="mt-3 text-xs leading-relaxed text-stone/80">
              No remix was used. Try another short-form video from TikTok,
              Instagram or YouTube — or build from your own idea with no
              reference at all, which costs nothing extra.
            </p>
            <button onClick={() => nav('/v2', { replace: true })} className="btn-gradient mt-6 w-full">Try a different reference</button>
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
