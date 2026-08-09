// Screen 2 — AI Building (Loading). Makes the wait feel productive: a live step
// list that names what the AI is doing (never a naked spinner), with a skeleton
// of the Plan screen behind it. Runs the real build, then auto-advances to the
// Plan screen the instant the timeline is ready. See PRODUCT_VISION §13.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Check, Loader2, Eye, Wand2, FileText, Clapperboard, Captions } from 'lucide-react'
import { generateBlueprint, ingestReference, getJob } from '../../lib/api'
import { assessReference, mayUseReference, REFERENCE_REASON_TEXT } from '../../lib/api'
import { REFERENCE_UNREAD_TEXT, REFERENCE_UNREAD_CODE } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Aurora } from '../../components/Aurora'
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

// The hosts ingest-reference can actually fetch + transcribe (mirrors its
// SSRF allow-list). A link to one of these gets truly READ; anything else
// (or a described idea) falls back to pattern-mode generation.
const SUPPORTED = ['tiktok.com', 'instagram.com', 'youtube.com', 'youtu.be']
function isSupportedRef(url: string): boolean {
  try {
    const h = new URL(url.trim()).hostname.toLowerCase()
    return SUPPORTED.some((d) => h === d || h.endsWith('.' + d))
  } catch {
    return false
  }
}

interface BuildState {
  reference_url?: string
  reference_note?: string
  fidelity?: 'close' | 'balanced' | 'loose'
  tone?: 'understated' | 'balanced' | 'punchy'
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
    const target = scraping ? 40 : STEP_PCT[Math.min(active, STEP_PCT.length - 1)]
    const factor = scraping ? 0.012 : 0.08 // gentler climb during the long read
    const floor = scraping ? 0.12 : 0.4
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
    if (started.current) return
    started.current = true

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

        // An unreadable host never even reaches the worker. This used to sail
        // straight past into a paid build whose reference was decoration.
        if (refUrl && !willIngest) { halt('unsupported_host'); return }

        let transcript_id: string | undefined
        // null = we have a transcript, or there was no read to do.
        let unread: keyof typeof REFERENCE_UNREAD_TEXT | null = null
        if (willIngest) {
          setIngesting(true)
          try {
            const { jobId, transcriptId } = await ingestReference(refUrl)
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
        startPacing()
        const gen = await generateBlueprint({
          reference_url: refUrl,
          reference_note: state.reference_note || '',
          fidelity: state.fidelity ?? 'balanced',
          tone: state.tone,
          // Same intent → same key → the server returns the build it already
          // made instead of charging for it twice (0119).
          idempotency_key: buildKey(state),
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
        setError(e instanceof Error ? e.message : 'Something went wrong building your plan.')
      }
    })()

    // Unmount (in-app nav): the build keeps running so it lands in the Library —
    // we only stop the visual ticker. Explicit Cancel is what actually aborts it.
    return () => { alive = false; if (ticker) clearInterval(ticker) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        {unusableRef ? (
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
          <div className="glass gradient-border p-6 sm:p-8">
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
                    <span className={done ? 'text-sm text-sand' : isActive ? 'text-sm font-medium text-cream' : 'text-sm text-stone'}>{stepLabel(i, s.label)}</span>
                    {isActive && <span className="ml-auto text-[11px] font-medium text-amber">Working…</span>}
                    {done && <span className="ml-auto text-[11px] font-medium text-coral">Done</span>}
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
