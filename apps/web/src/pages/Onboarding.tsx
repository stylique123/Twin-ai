import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Check, ArrowRight, ArrowLeft, RotateCcw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { pollDna, saveCapabilityDefaults, savePreScriptBrief, saveDNA, saveVoiceProfile, startDna, startManualVoice } from '../lib/api'
import type { Platform, Profile, VoiceProfile } from '../lib/types'
import { asksForbiddenClaims, BRIEF_WORK_KINDS, BRIEF_GOALS, type BriefWorkKind, type BriefGoal } from '../lib/api'
import {
  profileQuestionsFor, asksScreenCapability, asksProductCapability,
  asksOwnProductKind, asksOwnServiceKind, MAX_CONTENT_GOALS,
  AUDIENCE_SEGMENTS, AUDIENCE_KNOWLEDGE, DESIRED_FORMATS, FORMAT_EXPLORATION,
  COMMERCIAL_TIES, OWN_PRODUCT_KINDS, OWN_SERVICE_KINDS, CAPABILITY_ANSWERS,
  type ProfileQuestionId, type AudienceSegment,
  type AudienceKnowledge, type DesiredFormat, type FormatExploration,
  type CommercialTie, type OwnProductKind, type OwnServiceKind, type CapabilityAnswer,
} from '../lib/api'
import {
  Q4_ANSWERS, mintFromWorkKind, mintsOwnedEntity, q4AsksOwnership,
  saveMintedEntity, type EntityType, type Q4Answer,
} from '../lib/api'
import {
  readScanFailure, scanFailure, otherPlatforms, otherPlatformsSentence, PLATFORM_LABEL,
  type ScanFailure,
} from '../lib/api'
import { Aurora } from '../components/Aurora'

/** The chooser's words. Kept beside the screen rather than in the contract: the
 *  ids are the contract, and how they are phrased to a person is not. */
// ⚖️ PLAIN ENGLISH, AND THE INTERNAL NAME IS NEVER THE LABEL. `saas` reads as
// "Software", `local_service` as "Local business" — a creator should not have to
// know which noun the codebase picked. The three new kinds are here because
// founders, coaches and freelancers were all landing on "Something else", which
// told Twin nothing about a person who has a great deal to say.
const WORK_KIND_LABEL: Record<BriefWorkKind, string> = {
  creator: 'Creator / influencer',
  founder: 'Founder / business owner',
  coach: 'Coach / consultant',
  freelancer: 'Freelancer / agency',
  professional: 'Licensed professional',
  ecommerce: 'Ecommerce / brand',
  brand: 'Brand / content team',
  saas: 'Software',
  local_service: 'Local business',
  other: 'Something else',
}
// Q4, REWRITTEN — it now asks ONLY about things the creator does NOT own.
//
// The old Q4 ("what do your videos promote", with "my own product" as a chip)
// re-asked what Q3 had already answered: a creator who has just said "Software"
// does not need to be asked whether they have a product. That redundancy is the
// standing rule's exact target — no question may re-ask what another answer
// implies — and Q3 now MINTS the owned entity instead, pre-filled and
// correctable.
//
// What is left is the only part still genuinely unknown: whose ELSE'S things
// appear in these videos. Four answers, and each one changes what a script may
// say (`claimRulesFor`), not merely how it is phrased.
const Q4_LABEL: Record<Q4Answer, string> = {
  affiliate: 'Affiliate products',
  sponsor: 'Sponsored products',
  review_only: 'Products I review',
  none: 'Nothing of anyone else’s',
}

/** The words for the minted entity, so the creator reads a sentence rather than
 *  an enum. The ids are the contract; how they are said to a person is not. */
const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  SAAS: 'software product',
  APP: 'app',
  PHYSICAL_PRODUCT: 'physical product',
  DIGITAL_PRODUCT: 'digital product',
  SERVICE: 'service',
  COURSE: 'course',
  COMMUNITY: 'community',
  MARKETPLACE: 'store',
  OTHER: 'product',
}
import { EASE } from '../components/motion'
import { cn } from '../lib/cn'
import { LogoMark } from '../components/Logo'
import {
  ONBOARDING_DRAFT_VERSION,
  clearOnboardingDraft,
  readOnboardingDraft,
  writeOnboardingDraft,
  type OnboardingDraft,
  emptyProfileAnswers,
  profileAnswersOf,
} from '../lib/onboardingDraft'

const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube', 'other']

// Per-platform placeholder so the input matches the source they picked.
const PLACEHOLDER: Record<Platform, string> = {
  tiktok: '@yourhandle  or  https://tiktok.com/@yourhandle',
  instagram: '@yourhandle  or  https://instagram.com/@yourhandle',
  youtube: '@yourchannel  or  https://youtube.com/@yourchannel',
  linkedin: '@yourname  or  https://linkedin.com/in/yourname',
  other: '@yourhandle',
}

// Brand DNA is MANDATORY at signup, but a creator can reach it two ways: scan a
// real handle (the fast, one-tap path), OR describe their voice by hand. Both end
// at the same editable confirm form and produce a real voice — so a first run can
// never dead-end (no big account, or a scan outage, still gets you in).
type Mode = 'handle' | 'building' | 'confirm'

// A blank, editable voice profile — the starting point for the manual path and the
// scan-failed fallback. Shared so both use the exact same shape.
function emptyVoiceProfile(): VoiceProfile {
  return {
    summary: '', niche: '', tone: '', pacing: '', hook_style: '',
    vocabulary: [], recurring_ctas: [], dos: [], donts: [], sample_hooks: [],
  }
}

export default function Onboarding() {
  const { session, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const userId = session?.user.id ?? ''
  const [draft, setDraft] = useState<OnboardingDraft | null>(() => safeReadDraft(userId))
  // Resume the exact durable onboarding step after a refresh. Previously only
  // the voice id survived, while the screen always restarted at Handle and the
  // creator had to re-enter Brand DNA.
  const [mode, setMode] = useState<Mode>(() => draft?.profile ? 'confirm' : draft?.voiceId ? 'building' : 'handle')

  // A FAILED SCAN MUST NOT OUTLIVE ITSELF. `mode` resumes into 'building'
  // while the draft carries a voiceId, and `Protected` sends every signed-in
  // user here until `onboarded` is true — so one failed scan locked the account
  // into a screen that re-polled the same dead job on every visit. Forgetting
  // the id is what turns that loop back into a form someone can leave.
  const forgetDeadScan = useCallback(() => {
    setDraft((current) => {
      if (!current || current.userId !== userId) return current
      const next = { ...current, voiceId: '' }
      safeWriteDraft(next)
      return next
    })
  }, [userId])

  const persistDraft = useCallback((next: OnboardingDraft) => {
    setDraft(next)
    safeWriteDraft(next)
  }, [])

  const startDraft = useCallback((voiceId: string, platform: Platform, handle: string, profile: VoiceProfile | null) => {
    const next: OnboardingDraft = {
      version: ONBOARDING_DRAFT_VERSION,
      userId,
      voiceId,
      platform,
      handle: handle.trim().slice(0, 120),
      profile,
      ...emptyProfileAnswers(),
      workKind: null,
      workKindOther: null,
      forbiddenClaims: null,
      q4: null,
      // Q3 has not been answered yet, so nothing is minted and `ownsEntity` has
      // no opinion. Never seeded in either direction.
      ownsEntity: null,
      // The scan pre-fills the offer, so it starts as NOT the creator's answer.
      // Only their edit flips it.
      offerFromCreator: false,
      // Unanswered until the creator answers. Never seeded, in either direction.
      canRecordScreen: null,
      canFilmObjects: null,
      audience: profile?.audience ?? '',
      product: profile?.offer ?? '',
      goal: '',
    }
    persistDraft(next)
  }, [persistDraft, userId])

  const updateAnswers = useCallback((
    profile: VoiceProfile,
    audience: string,
    product: string,
    goal: string,
    brief: Pick<OnboardingDraft, 'workKind' | 'workKindOther' | 'forbiddenClaims' | 'q4' | 'ownsEntity' | 'offerFromCreator' | 'canRecordScreen' | 'canFilmObjects'>
      = { workKind: null, workKindOther: null, forbiddenClaims: null, q4: null, ownsEntity: null, offerFromCreator: false, canRecordScreen: null, canFilmObjects: null },
  ) => {
    setDraft((current) => {
      if (!current || current.userId !== userId) return current
      const next = { ...current, profile, audience, product, goal, ...brief }
      safeWriteDraft(next)
      return next
    })
  }, [userId])

  // The scan-step answer, persisted on its own. `updateAnswers` needs a
  // profile and there is none yet during the scan — which is exactly why the
  // question fits there: it costs the creator nothing that the scan was not
  // already spending.
  // The per-flag draft setters that lived here are gone with the questions.
  // The confirm screen owns both inputs now and persists them through the same
  // onDraftChange path as every other answer — one writer, one route, rather
  // than two screens able to set the same flag.

  const complete = useCallback(async () => {
    await finish(refreshProfile, navigate)
    safeClearDraft(userId)
    setDraft(null)
  }, [navigate, refreshProfile, userId])
  const handleStarted = useCallback((voiceId: string, platform: Platform, handle: string, profile: VoiceProfile | null) => {
    startDraft(voiceId, platform, handle, profile)
    setMode(profile ? 'confirm' : 'building')
  }, [startDraft])

  // ⚠️ THE SAME CREATOR, SOMEWHERE ELSE, IN ONE TAP. A scan that failed on OUR
  // side is most often fixed by trying another platform -- and the only route
  // there was Back, re-pick a platform, and retype the handle from memory.
  // That is a charge levied on somebody we have just told the fault was ours.
  const [retrySeed, setRetrySeed] = useState<{ handle: string; platform: Platform } | null>(null)
  const tryAnotherPlatform = useCallback((platform: Platform) => {
    setRetrySeed({ handle: draft?.handle ?? '', platform })
    // ⚖️ THE DEAD SCAN IS DROPPED FIRST. Leaving the failed voiceId on the draft
    // is what used to resume straight back into the scan that already failed.
    forgetDeadScan()
    setMode('handle')
  }, [draft?.handle, forgetDeadScan])
  // THE SCAN MUST NOT OVERWRITE WHAT THE CREATOR JUST TYPED.
  //
  // This used to hand the scan's own reading straight in — `profile.audience`
  // for audience and a literal `''` for goal — which was harmless while both
  // were only ever asked afterwards. Now that they are answered DURING the
  // scan, that same line silently discards them at the moment the scan
  // finishes: the creator answers three questions and arrives at a screen
  // showing none of them.
  //
  // The creator's answer wins wherever they gave one. The scan fills only what
  // is still blank, which is what it was always for.
  const handleReady = useCallback((profile: VoiceProfile) => {
    setDraft((current) => {
      if (!current || current.userId !== userId) return current
      const next: OnboardingDraft = {
        ...current,
        profile,
        // ⚠️ THE CHOOSER SEEDS THE BOX, SO ONE FACT HAS ONE ORIGIN. The confirm
        // screen still shows free-text "who you're talking to" and "your goal",
        // and a creator who has just tapped "Founders" and "Build trust" must
        // not then find those boxes empty — an answer that vanishes reads as an
        // answer that was not recorded. The typed value always wins; this only
        // fills a blank, and the scan's guess remains the last resort.
        audience: current.audience.trim()
          || (current.audienceSeg ? AUDIENCE_LABEL[current.audienceSeg] : '')
          || profile.audience || '',
        product: current.product.trim() || profile.offer || '',
        goal: current.goal.trim()
          || current.contentGoals.map((g) => CONTENT_GOAL_LABEL[g]).join(' and '),
      }
      safeWriteDraft(next)
      return next
    })
    setMode('confirm')
  }, [userId])

  if (!session) return <Navigate to="/auth" replace />

  // `min-h-screen` IS 100vh, AND ON iOS SAFARI THAT IS THE *LARGE* VIEWPORT —
  // the height the page would have if the browser chrome were hidden. Safari
  // does not hide it here, so the last ~90px of every step rendered underneath
  // the address bar: the "Back" button on the scan screen was sliced in half,
  // and no amount of scrolling revealed it because the page believed it had
  // already fitted.
  //
  // `100dvh` is the viewport that actually exists, and it is the unit the rest
  // of this app already uses (`v2/ScreenLayout.tsx`, `V2Capture.tsx`). The
  // bottom padding then clears the home indicator on notched phones, with the
  // same `max(…, env(safe-area-inset-bottom))` idiom used there — so this
  // screen stops being the one place that measures the phone differently from
  // every other.
  return (
    <main className="relative grid min-h-[100dvh] place-items-center overflow-clip px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-20 sm:px-5 sm:pb-12">
      <Aurora />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: EASE }}
        /* THE CONFIRM STEP IS NOT A PHONE FORM. Every step shared one 576px
           column, which is right for pasting a handle and watching a scan, and
           wrong for a screen carrying fifteen fields: on a desktop it rendered
           as a narrow strip with the whole display empty either side and most
           of the form below the fold. When the scan comes back thin, that strip
           is fifteen EMPTY boxes, which is the worst version of it. */
        className={cn('relative w-full', mode === 'confirm' ? 'max-w-4xl' : 'max-w-xl')}
      >
        {/* p-8 is 64px of horizontal padding, which is 16% of a 390px phone
            spent on nothing. The confirm step is the longest screen in the
            product, so that width is exactly what makes its fields feel
            cramped and its labels wrap. Phones get p-5 and grow from there. */}
        <div className="glass overflow-hidden rounded-panel p-5 sm:p-8 lg:p-9">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              {mode === 'handle' && (
                <HandleStep onStarted={handleStarted} seed={retrySeed} />
              )}
              {mode === 'building' && draft && (
                <BuildingStep
                  draft={draft}
                  onReady={handleReady}
                  onBack={() => setMode('handle')}
                  onScanDead={forgetDeadScan}
                  onTryPlatform={tryAnotherPlatform}
                  onDraftChange={persistDraft}
                />
              )}
              {mode === 'confirm' && draft && (
                <ConfirmStep
                  draft={draft}
                  onDraftChange={updateAnswers}
                  onDone={complete}
                  onBack={() => setMode('handle')}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </main>
  )
}

async function finish(
  refreshProfile: () => Promise<Profile | null>,
  navigate: (to: string) => void,
) {
  const saved = await refreshProfile()
  if (!saved?.onboarded) {
    throw new Error("Your Brand DNA was saved, but Twin couldn't verify account setup. Please retry.")
  }
  navigate('/app')
}

function safeReadDraft(userId: string): OnboardingDraft | null {
  if (!userId || typeof sessionStorage === 'undefined') return null
  try { return readOnboardingDraft(sessionStorage, userId) } catch { return null }
}
function safeWriteDraft(draft: OnboardingDraft): void {
  if (typeof sessionStorage === 'undefined') return
  try { writeOnboardingDraft(sessionStorage, draft) } catch { /* storage unavailable */ }
}
function safeClearDraft(userId: string): void {
  if (!userId || typeof sessionStorage === 'undefined') return
  try { clearOnboardingDraft(sessionStorage, userId) } catch { /* storage unavailable */ }
}

// --- Step 1: paste a handle ------------------------------------------------
function HandleStep({
  onStarted,
  seed,
}: {
  onStarted: (voiceId: string, platform: Platform, handle: string, profile: VoiceProfile | null) => void
  /** ⚖️ SET ONLY WHEN A FAILED SCAN SENT THEM BACK HERE. A normal arrival gets
   *  the empty form it always got; this is a recovery path, not a new default. */
  seed?: { handle: string; platform: Platform } | null
}) {
  const [handle, setHandle] = useState(seed?.handle ?? '')
  const [platform, setPlatform] = useState<Platform>(seed?.platform ?? 'instagram')
  const [busy, setBusy] = useState(false)
  const [manualBusy, setManualBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const go = async () => {
    setErr(null)
    if (!handle.trim()) return setErr('Paste your handle or profile link first.')
    setBusy(true)
    try {
      // `replace: true` — onboarding is a SINGLE voice slot. If the creator already
      // started a scan (e.g. picked the wrong platform, tapped Back within a second),
      // this repoints that same slot to the new handle/platform instead of creating a
      // second voice or hitting the "you already have a voice" / brand-limit wall. So
      // Back → choose again → Build always works, and no orphan voices pile up.
      const res = await startDna(handle.trim(), platform, false, true)
      onStarted(res.brand_voice_id, platform, handle.trim(), null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start the scan.')
    } finally {
      setBusy(false)
    }
  }

  // Manual path: create an empty voice slot (no scan) and jump straight to the
  // editable confirm form. For creators with no scannable account — or if they'd
  // just rather type it — so the first run never requires a working scan.
  const goManual = async () => {
    setErr(null)
    setManualBusy(true)
    try {
      const res = await startManualVoice(platform, handle.trim())
      onStarted(res.brand_voice_id, platform, handle.trim(), emptyVoiceProfile())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not set up a manual voice.')
    } finally {
      setManualBusy(false)
    }
  }

  return (
    <>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-signature-soft">
        <LogoMark size={22} />
      </span>
      <p className="eyebrow mt-5">Your brand voice · the one-tap way</p>
      <h1 className="mt-3 font-display text-3xl leading-tight">
        Paste your handle. We read how <span className="gradient-text">you</span> sound.
      </h1>
      <p className="mt-2.5 text-sand">
        TwinAI reads your recent posts and learns your voice, so every script sounds like you, not a robot.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {PLATFORMS.filter((p) => p !== 'other').map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            className={cn(
              'chip capitalize transition-all duration-200',
              platform === p && 'border-coral/60 bg-coral/10 text-cream',
            )}
          >
            {p}
          </button>
        ))}
      </div>

      <input
        className="field mt-4"
        placeholder={PLACEHOLDER[platform]}
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && go()}
      />

      <AnimatePresence>
        {err && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral"
          >
            {err}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="mt-8">
        <button className="btn-gradient w-full !py-3.5" onClick={go} disabled={busy || manualBusy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Starting…
            </>
          ) : (
            <>
              Build my voice <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
        <p className="mt-3 text-center text-xs text-stone">
          Use any public account — it can be yours or a creator you sound like. We only read public posts.
        </p>
        {/* Escape hatch: no account to scan, or the scan is down? Describe your
            voice by hand instead — same editable form, a real voice, no dead-end. */}
        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-sand underline-offset-4 hover:text-cream hover:underline disabled:opacity-60"
          onClick={goManual}
          disabled={busy || manualBusy}
        >
          {manualBusy ? 'Setting up…' : 'No account to scan? Set up my voice myself'}
        </button>
      </div>
    </>
  )
}

// --- Step 2: live progress while the scan runs -----------------------------
const SCAN_STAGES = ['Fetching your posts', 'Reading captions & hooks', 'Synthesizing your voice']

// ⚖️ THE COUNT IS NO LONGER A CONSTANT, AND THAT IS THE FEATURE. It is whatever
// `profileQuestionsFor` says applies to this person: five for a creator with
// nothing to sell, six for a founder with software to demonstrate. A fixed six
// would be a round number bought with irrelevant questions, and an irrelevant
// question is worse than a missing one — it teaches somebody the set is not
// serious, which is how the one that mattered gets skipped too.

function BuildingStep({
  draft,
  onReady,
  onBack,
  onScanDead,
  onTryPlatform,
  onDraftChange,
}: {
  draft: OnboardingDraft
  onReady: (profile: VoiceProfile) => void
  onBack: () => void
  onScanDead: () => void
  /** Take the same handle to another platform, in one tap. */
  onTryPlatform: (platform: Platform) => void
  onDraftChange: (next: OnboardingDraft) => void
}) {
  const [err, setErr] = useState<string | null>(null)
  // ⚠️ THE CLASSIFIED FAILURE, BESIDE THE RAW STRING RATHER THAN INSTEAD OF IT.
  // `err` still drives anything that only needs a sentence; this decides whether
  // the creator is told to go and change something, and it is the difference
  // between "your account may be private" and "this is on our side".
  const [failure, setFailure] = useState<ScanFailure | null>(null)
  const [stage, setStage] = useState(0)

  // THE QUESTIONS RUN AT THE CREATOR'S PACE, THE SCAN AT ITS OWN.
  //
  // Version one advanced the question with the scan STAGE, which meant a
  // stage timer decided how long someone had to think — and a scan that
  // finished early took the screen away with an answer half-typed. Tying the
  // two together made the faster scan the worse experience, which is the same
  // inversion the confirm screen had.
  //
  // They are now independent. `qIndex` moves only when the creator answers or
  // skips. `readyProfile` parks the finished scan until they are done, so
  // finishing early means WAITING, never interrupting. The last one to finish
  // hands over, whichever it is.
  const [qIndex, setQIndex] = useState(0)
  const [readyProfile, setReadyProfile] = useState<VoiceProfile | null>(null)
  // ⚠️ FINISHING IS SOMETHING THE CREATOR DOES, NOT SOMETHING A COMPARISON
  // DECIDES. `qIndex >= asked.length` LOOKED equivalent and was not: the list is
  // recomputed from the answers and SHRINKS under them — answering question one
  // can remove a later question — so the comparison flipped to true while
  // somebody was still reading question two. With a parked profile waiting, that
  // handed the screen over mid-answer, which is exactly the interruption the
  // parking was built to prevent. Reported from a real run: five questions
  // announced, three seen, the rest gone.
  //
  // ⚖️ SO THE ONLY TWO WAYS OUT ARE `Done` AND `Skip all`, both of them taps.
  // The scan may finish whenever it likes; it waits.
  const [finished, setFinished] = useState(false)
  const asked = profileQuestionsFor(profileAnswersOf(draft))
  // ⚠️ AND A SHRINKING LIST CLAMPS RATHER THAN SKIPS. Standing on question five
  // when the list becomes four means seeing question four, not being thrown out
  // of the set entirely.
  const qAt = Math.min(qIndex, Math.max(asked.length - 1, 0))
  const questionsDone = finished || asked.length === 0

  // Hand over exactly once, and only when BOTH halves are finished.
  useEffect(() => {
    if (questionsDone && readyProfile) onReady(readyProfile)
  }, [questionsDone, readyProfile, onReady])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Advance the visual stage on a gentle clock so the wait feels alive even
  // though the backend reports only building/ready/failed.
  //
  // AND STOP THE MOMENT IT FAILS. This ran on empty deps, so polling halted on
  // an error and the animation did not: the screen showed a live spinner on
  // "Synthesizing your voice" directly above the words "We couldn't read
  // @handle". Still working and already failed, at the same time, and no way
  // for a creator to tell which one was true.
  useEffect(() => {
    if (err) return
    const t = setInterval(() => setStage((s) => Math.min(s + 1, SCAN_STAGES.length - 1)), 9000)
    return () => clearInterval(t)
  }, [err])

  useEffect(() => {
    let stopped = false
    // Hard cap: if the scan never resolves (stuck worker, dropped job), don't
    // trap the user on an infinite spinner, surface the manual fallback.
    const startedAt = Date.now()
    const MAX_WAIT_MS = 220_000
    const tick = async () => {
      try {
        const res = await pollDna(draft.voiceId)
        if (stopped) return
        if (res.status === 'ready') {
          if (timer.current) clearInterval(timer.current)
          // DO NOT LEAVE THE SCREEN YET. The profile is parked; `advance` below
          // decides when to hand it over, because a scan that finishes mid
          // question would take the screen away with the answer half-typed.
          if (res.profile) setReadyProfile(res.profile)
          else {
            setErr('The scan finished without a voice profile. Try a different handle or describe it yourself.')
            onScanDead()
          }
        } else if (res.status === 'failed') {
          if (timer.current) clearInterval(timer.current)
          // ⚠️ CLASSIFIED FROM A CAUSE CODE, NEVER GUESSED FROM THE MESSAGE.
          // `readScanFailure` recognises a known cause and falls back to UNKNOWN
          // for everything else — and UNKNOWN is worded as OURS. Pattern-matching
          // the server's prose for the word "private" would be exactly the guess
          // this taxonomy exists to stop.
          const f = readScanFailure((res as { cause?: unknown }).cause)
          setFailure(f)
          setErr(f.message)
          // AND FORGET THE DEAD SCAN. `mode` resumes into 'building' whenever
          // the draft still carries a voiceId, so a failed scan used to trap
          // the account: onboarded stays false, every sign-in redirects here,
          // and this screen resumes polling the same scan that already failed.
          // The only exit was noticing the manual link. Dropping the id means a
          // reload lands on the handle screen, which is where someone whose
          // scan failed actually needs to be.
          onScanDead()
        } else if (Date.now() - startedAt > MAX_WAIT_MS) {
          if (timer.current) clearInterval(timer.current)
          // A timeout tells us nothing about their account, so it must not
          // imply one. UNKNOWN says we are unsure and it is worth another try.
          const f = scanFailure('UNKNOWN')
          setFailure(f)
          setErr(f.message)
          onScanDead()
        }
      } catch (e) {
        // Transient, keep polling; surface only if it persists past the cap.
        console.warn('dna poll', e)
        if (Date.now() - startedAt > MAX_WAIT_MS && !stopped) {
          if (timer.current) clearInterval(timer.current)
          // We could not reach our OWN scanner. There is no ambiguity about
          // whose problem this is.
          const f = scanFailure('PLATFORM_ACCESS_FAILED')
          setFailure(f)
          setErr(f.message)
          onScanDead()
        }
      }
    }
    tick()
    timer.current = setInterval(tick, 4000)
    return () => {
      stopped = true
      if (timer.current) clearInterval(timer.current)
    }
  }, [draft.voiceId, onReady])

  return (
    <>
      <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-signature-soft">
        <span className="absolute inset-0 animate-ping rounded-2xl bg-coral/20" />
        <LogoMark size={22} className="relative" />
      </span>
      {/* SIZED FOR THE PHONE FIRST. `text-3xl` turned this heading into two
          lines on a 390px screen and the sub-paragraph into three, which is
          most of a viewport spent restating the eyebrow. The copy also said
          "this usually takes under a minute" directly above a progress bar that
          reports the same thing more honestly, so it goes: a static estimate
          next to a live indicator is the one that gets believed, and it is the
          one that can be wrong. */}
      <p className="eyebrow mt-5">Reading your voice</p>
      <h1 className="mt-2.5 font-display text-2xl sm:text-3xl">Studying your recent posts…</h1>
      <p className="mt-2 text-sm text-sand sm:text-base">
        Pulling your hooks, pacing and signature phrases.
      </p>

      {/* ONE LINE, NOT THREE CARDS.
          Three stacked status cards cost ~200px — over a third of a phone
          viewport — to say one thing: which of three stages is running. They
          pushed the QUESTION to the fold, which is the exact defect §6 exists
          to fix. Every stage below the active one was also pure padding: a
          creator does not need "Synthesizing your voice" listed as pending in
          order to understand that a scan has steps.
          So the stage is a single line with a progress bar, and the space it
          gave back goes to the question. The information lost is the list of
          stages not yet reached, which nobody acted on. `SCAN_STAGES` still
          drives both the label and the bar, so the two cannot disagree. */}
      <div className="mt-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-5 w-5 shrink-0 place-items-center">
            {err ? (
              <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-coral" />
            )}
          </span>
          <p className="min-w-0 flex-1 truncate text-sm text-sand">
            {err ? 'Scan stopped' : SCAN_STAGES[stage]}
          </p>
          {/* A COUNT, so "is it moving" is answerable at a glance without
              needing three rows to show it. */}
          <p className="shrink-0 text-xs tabular-nums text-stone">
            {Math.min(stage + 1, SCAN_STAGES.length)}/{SCAN_STAGES.length}
          </p>
        </div>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/8">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700',
              err ? 'bg-white/20' : 'bg-gradient-to-r from-amber to-coral',
            )}
            style={{ width: `${((stage + 1) / SCAN_STAGES.length) * 100}%` }}
          />
        </div>
      </div>

      {/* ASKED DURING THE SCAN, not on the confirm screen.
          The scan already costs the creator ~50 seconds of waiting, and this is
          a question no scan could ever answer: reading someone's captions tells
          you what they HAVE posted, never what their setup can do (§8a.2's
          observed-is-not-stated rule). Putting it here spends time that was
          already being spent, and keeps the confirm screen to what the scan
          drafted and the creator is correcting.
          It needs no camera and no permission prompt — the answer is about the
          creator's setup, not about what this browser can do this second, and
          opening a share-picker to find out would be asking the operating
          system a question only the person can answer. They are asked on the
          CONFIRM screen now, after what the creator does and what they sell,
          because how someone films is the last thing that matters and was the
          first thing we asked. */}
      {/* THE THREE QUESTIONS NO SCAN CAN ANSWER, ASKED WHILE IT RUNS.
          §6 of the intelligence architecture. They used to sit below the fold on
          the confirm screen, and in the first real production run EVERY question
          below the fold came back unanswered — placement, not wording, is why
          the answers were empty.
          One per stage, never all three: three questions stacked on a waiting
          screen is the same wall in a new place. Each is answered in a tap
          (audience aside), so a stage's worth of waiting is enough time.
          They persist on every change rather than on a Next button, because the
          scan finishes on its own schedule and can advance out from under a
          half-typed answer. `forgetDeadScan` clears only `voiceId`, so a scan
          that dies keeps every answer given here. */}
      {!err && questionsDone && (
        // Answered everything before the scan finished. Say so plainly — a
        // spinner with no sentence reads as a stall, and this is the one moment
        // the creator is genuinely just waiting.
        <div className="mt-6 rounded-card border border-white/10 bg-white/[0.03] p-4 text-center">
          <p className="text-sm text-cream">Thanks — that is everything we needed.</p>
          <p className="mt-1 text-xs text-stone">
            {readyProfile ? 'Opening your voice…' : 'Finishing the scan, then we will show you your voice.'}
          </p>
        </div>
      )}

      {!err && !questionsDone && (
        // THE QUESTION IS THE CONTENT OF THIS SCREEN, so it is styled like it.
        // It used to be a faint box below three louder status cards, which read
        // as an aside to the "real" thing happening above — and an aside is
        // what people skip. The scan is the thing that needs no attention; the
        // question is the only thing here only the creator can do.
        <div className="mt-5 rounded-card border border-amber/25 bg-amber/[0.06] p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber">
            While we read · {qAt + 1} of {asked.length}
          </p>
          <ProfileQuestion
            id={asked[qAt]}
            draft={draft}
            onDraftChange={onDraftChange}
          />
          {/* THE CREATOR MOVES THE QUESTIONS, NOTHING ELSE DOES.
              Skipping is unpunished: a required question on a waiting screen
              turns a wait into a toll, and all three are asked again on the
              confirm screen where they stay editable. */}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                // The LAST question hands over; every other one advances. Read
                // off the live list, so a list that shrank still ends where the
                // creator can see it ending.
                if (qAt + 1 >= asked.length) setFinished(true)
                else setQIndex(qAt + 1)
              }}
              className="btn-gradient flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold"
            >
              {qAt + 1 >= asked.length ? 'Done' : 'Next'}
            </button>
            <button
              type="button"
              onClick={() => setFinished(true)}
              className="shrink-0 px-2 py-2 text-xs text-stone hover:text-cream"
            >
              Skip all
            </button>
          </div>
          <p className="mt-2 text-[11px] text-stone">
            Optional, and you can change any of it on the next screen.
          </p>
        </div>
      )}

      {err && (
        <div className="mt-6 space-y-2">
          <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{err}</p>
          {/* ⚠️ THE TIP USED TO SHOW ON EVERY FAILURE, INCLUDING OURS. Telling a
              creator to "pick a public account" after Twin's own retriever fell
              over sends them to check a setting that was never the problem — the
              owner hit exactly this with a large, unambiguously public account.
              It now appears only when the failure is genuinely theirs to fix. */}
          {failure?.creatorCanFix && (
            <p className="text-sm text-sand">
              Tip: pick a <span className="text-cream">public</span> account with a handful of recent posts — that reads fastest and most accurately.
            </p>
          )}
          {/* ⚖️ AND WHEN IT IS OURS, SAY WHAT ACTUALLY HELPS. The same creator on
              another platform usually reads fine, which is what happened when
              Instagram failed and YouTube worked.
              ⚠️ AND IT NAMES ONLY THE ONES THAT ARE LEFT. This line used to
              hardcode all three, so an Instagram failure advised "YouTube,
              TikTok or Instagram" — offering back the platform that had just
              failed, which reads as though nobody looked at what happened.
              `otherPlatforms` has been correct and CALLED BY NOTHING since it
              was written; this is its first caller. */}
          {failure && !failure.creatorCanFix && failure.tryAnotherPlatform
            && otherPlatforms(draft.platform).length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-sand">
                {draft.handle !== ''
                  ? 'You can try the same handle somewhere else:'
                  : `You can also try the same creator on ${otherPlatformsSentence(draft.platform)}.`}
              </p>
              {/* ⚠️ ONE TAP, BECAUSE THE ALTERNATIVE WAS RETYPING FROM MEMORY.
                  The old route was Back, re-pick a platform, type the handle
                  again — charged to somebody we have just told the fault was
                  ours.
                  ⚖️ AND THE BUTTONS APPEAR ONLY IF WE ACTUALLY KEPT THE HANDLE.
                  An older draft predates the field and carries ''; offering a
                  one-tap retry that silently lands on an empty box would be
                  worse than the sentence, so that case keeps the sentence. */}
              {draft.handle !== '' && (
                <div className="flex flex-wrap gap-2">
                  {otherPlatforms(draft.platform).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="btn-ghost text-sm"
                      onClick={() => onTryPlatform(p)}
                    >Try on {PLATFORM_LABEL[p]}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* On an error, promote "Try again" to the primary action. There is no
          skip during a HEALTHY scan — building the voice from a real handle is
          required. But when the scan itself FAILS (private/thin account, scraper
          outage), a hard wall would block every affected signup from ever entering
          the product — so failure (and only failure) unlocks a manual path: the
          creator describes their voice in the same confirm form, which saves as a
          real, editable profile. Nothing is fabricated; every field is theirs. */}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <button className="btn-ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        {err && (
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-ghost" onClick={onBack}>
              <RotateCcw className="h-4 w-4" /> Try a different handle
            </button>
            {/* Manual is the PRIMARY recovery: a scan failure (private/thin account,
                scraper outage) must never wall a signup out of the product. */}
            <button
              className="btn-gradient"
              onClick={() => onReady(emptyVoiceProfile())}
            >
              Describe your voice myself <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// --- Step 3: confirm / edit the voice in one tap ---------------------------
function ConfirmStep({
  draft,
  onDraftChange,
  onDone,
  onBack,
}: {
  draft: OnboardingDraft
  onDraftChange: (
    profile: VoiceProfile, audience: string, product: string, goal: string,
    brief: Pick<OnboardingDraft, 'workKind' | 'workKindOther' | 'forbiddenClaims' | 'q4' | 'ownsEntity' | 'offerFromCreator' | 'canRecordScreen' | 'canFilmObjects'>,
  ) => void
  onDone: () => Promise<void>
  onBack: () => void
}) {
  const [vp, setVp] = useState<VoiceProfile | null>(draft.profile)
  // Prefill "who you're talking to" and "what you sell" from what the scan ACTUALLY
  // inferred (audience / offer) — the DNA extracts these, so they shouldn't show
  // empty. "Your goal" is deliberately NOT prefilled: a creator's business goal
  // isn't something we can read from their posts, so we leave it blank and let them
  // state it rather than fill it with a guess. All stay editable.
  const [audience, setAudience] = useState(draft.audience)
  const [product, setProduct] = useState(draft.product)
  const [goal, setGoal] = useState(draft.goal)
  // §8a.1's brief. `workKind` decides whether the claims question appears at
  // all; `forbiddenClaims` is the answer no model can infer.
  const [workKind, setWorkKind] = useState<BriefWorkKind | null>(draft.workKind)
  const [workKindOther, setWorkKindOther] = useState<string>(draft.workKindOther ?? '')
  const [forbiddenClaims, setForbiddenClaims] = useState(draft.forbiddenClaims ?? '')
  const [q4, setQ4] = useState<Q4Answer | null>(draft.q4 ?? null)
  // WHETHER THE CREATOR KEPT THE ENTITY Q3 MINTED. Defaults to keeping it when
  // Q3 was informative — that is what "pre-filled" means — and the screen gives
  // a one-tap way out, which is what "correctable" means. A pre-fill with no
  // exit is just a decision we made and blamed on them.
  const [ownsEntity, setOwnsEntity] = useState<boolean>(draft.ownsEntity ?? true)
  // The offer arrives PRE-FILLED FROM THE SCAN — which is the defect §8a names,
  // not a feature. Tracking whether the creator changed it is what separates
  // "they told us" from "the model guessed and nobody corrected it", and only
  // the first may decide a call to action.
  const [offerTouched, setOfferTouched] = useState(draft.offerFromCreator)
  // §2.2's `can_record_screen`, ANSWERED DURING THE SCAN (see BuildingStep) and
  // carried here so the durable save still writes it. Read from the draft rather
  // than re-asked: two screens asking one question is two places that can
  // disagree about what a skipped answer means.
  // MOVED HERE FROM THE SCAN SCREEN. These were the ONLY two questions asked
  // while the scan ran, which put the least important answers first: they are
  // about how someone FILMS, and the scan screen is where we are still working
  // out who they are. Understanding the creator comes first, then whether there
  // is a product, and only then how they can shoot it.
  // EMPTY MEANS THE SCAN FOUND NOTHING, and that is a different screen from a
  // scan that worked. Measured from the fields the scan actually populates, so
  // a creator who typed their own audience does not count as "the scan worked".
  // Computed once from the initial profile rather than live: a section that
  // collapses itself the moment someone clears a field would fight them.
  const voiceIsEmpty = useMemo(() => {
    const p = draft.profile
    if (!p) return true
    const text = [p.niche, p.tone, p.pacing, p.hook_style, p.enemy]
      .filter((v) => typeof v === 'string' && v.trim() !== '')
    const lists = [p.vocabulary, p.recurring_ctas, p.dos, p.donts, p.pov, p.hook_patterns, p.formats]
      .filter((v) => Array.isArray(v) && v.length > 0)
    return text.length === 0 && lists.length === 0
  }, [draft.profile])
  // What the scan heard, in ONE line, so collapsing hides length and not
  // information. A creator who cannot see that the read was right has no reason
  // to trust a section they have been asked to skip — so this names the fields
  // that would be wrong most visibly (niche and tone) and COUNTS the rest
  // rather than listing them, because a count is checkable at a glance and a
  // list is another wall.
  const voiceDigest = useMemo(() => {
    const p = draft.profile
    if (!p) return 'What the scan heard.'
    const bits: string[] = []
    if (typeof p.niche === 'string' && p.niche.trim()) bits.push(p.niche.trim())
    if (typeof p.tone === 'string' && p.tone.trim()) bits.push(p.tone.trim().split(',')[0].trim())
    const words = Array.isArray(p.vocabulary) ? p.vocabulary.length : 0
    const ctas = Array.isArray(p.recurring_ctas) ? p.recurring_ctas.length : 0
    if (words) bits.push(`${words} signature ${words === 1 ? 'phrase' : 'phrases'}`)
    if (ctas) bits.push(`${ctas} recurring ${ctas === 1 ? 'CTA' : 'CTAs'}`)
    return bits.length ? `${bits.join(' · ')}. Tap to change anything.` : 'What the scan heard.'
  }, [draft.profile])

  // INVERTED, because the old default made a GOOD scan the worst screen.
  //
  // It opened whenever the scan found something — so the better the read, the
  // more fields appeared, and a creator whose voice was captured perfectly met
  // fifteen expanded inputs they had no reason to touch. The screen was longest
  // exactly when it needed the least work.
  //
  // Now it opens only when the scan found NOTHING, which is the one case where
  // these boxes are a task rather than a record. When there is something to
  // show, `voiceDigest` below summarises it in one line and the section stays
  // one tap away. Nothing is hidden; it just stops being homework.
  const [showVoice, setShowVoice] = useState(voiceIsEmpty)

  const [canRecordScreen, setCanRecordScreen] = useState<boolean | null>(draft.canRecordScreen)
  const [canFilmObjects, setCanFilmObjects] = useState<boolean | null>(draft.canFilmObjects)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // A refinement that did not land. Distinct from `err`, which blocks: this one
  // reports something already-committed and lets the flow continue, so it is
  // rendered as a notice beside the error rather than in its place.
  const [mintWarning, setMintWarning] = useState<string | null>(null)

  // Preserve every edit within this browser tab until the server has verified
  // onboarding completion. A refresh or retry must never erase Brand DNA.
  useEffect(() => {
    if (vp) {
      onDraftChange(vp, audience, product, goal, {
        workKind, workKindOther: workKindOther.trim() || null,
        forbiddenClaims: forbiddenClaims.trim() || null, q4, offerFromCreator: offerTouched,
        // Only meaningful where Q3 minted something. Where it did not, the
        // creator was never shown the block and has no opinion to record —
        // which is the null this three-state field exists to keep.
        ownsEntity: mintsOwnedEntity(workKind) ? ownsEntity : null,
        canRecordScreen, canFilmObjects,
      })
    }
  }, [vp, audience, product, goal, workKind, workKindOther, forbiddenClaims, q4, ownsEntity, offerTouched, canRecordScreen, canFilmObjects, onDraftChange])

  if (!vp) {
    return (
      <>
        <p className="eyebrow">Almost there</p>
        <p className="mt-4 text-sand">We couldn’t load your voice. Head back and scan your handle again.</p>
      </>
    )
  }

  // THE ENTITY Q3 IMPLIES, recomputed as the creator changes their answer.
  // `mintFromWorkKind` returns null where Q3 said nothing, and the block that
  // renders this is gated on `mintsOwnedEntity` — so the fallback type below is
  // never the one displayed, it only keeps the lookup total.
  //
  // ⚠️ THE KINDS ARE PASSED HERE FOR THE SAME REASON THEY ARE PASSED AT THE
  // SAVE. This line used to call `mintFromWorkKind(workKind)` with no options,
  // while the save a few hundred lines below passed `ownProductKind` and
  // `ownServiceKind` — so `refinedEntityType` ran on one and not the other, and
  // the two disagreed for every creator who answered the finer question.
  //
  // What that looked like: a creator selling a COURSE read "We'll treat your
  // offer as your own SaaS product" on the confirm screen, and COURSE was
  // stored. The sentence describing their own business was wrong at the exact
  // moment we asked them to confirm it.
  //
  // ⚖️ AND THE ESCAPE HATCH IS WHAT MAKES IT MORE THAN COSMETIC. Directly under
  // this sentence sits "That's not right", which CLEARS the mint. A creator
  // shown the wrong type would reasonably take it, throwing away a mint that
  // was in fact correct — so a display bug became a data-loss path.
  const mintedType: EntityType = mintFromWorkKind(workKind, {
    ownProductKind: draft.ownProductKind ?? null,
    ownServiceKind: draft.ownServiceKind ?? null,
  })?.type ?? 'SAAS'

  const setField = (k: keyof VoiceProfile, v: string) => setVp({ ...vp, [k]: v })
  const setList = (k: keyof VoiceProfile, v: string[]) => setVp({ ...vp, [k]: v })

  const confirm = async () => {
    setErr(null)
    setBusy(true)
    try {
      await saveVoiceProfile(draft.voiceId, vp)
      // The capability answer, stored as this brand's DEFAULT. Written only when
      // there IS one: an unanswered question leaves the column exactly as it was,
      // because `can_record_screen = false` permanently hides a surface and
      // "they never said" must not become "they said no". Its own call rather
      // than a field on saveVoiceProfile — the profile is what the scan read, and
      // this is what the creator told us about their setup.
      // ONE CALL, both answers, and only the ones actually given.
      // `saveCapabilityDefaults` merges, so an unanswered flag is simply absent
      // from the object and the column keeps whatever it held — which is what
      // makes "they never said" survive as its own state rather than collapsing
      // to false.
      const caps: Record<string, boolean> = {}
      if (canRecordScreen !== null) caps.can_record_screen = canRecordScreen
      if (canFilmObjects !== null) caps.can_film_objects = canFilmObjects
      if (Object.keys(caps).length > 0) {
        await saveCapabilityDefaults(draft.voiceId, caps)
      }
      // §8a.1's BRIEF, persisted — the answers that used to end here.
      //
      // `workKind` and `forbiddenClaims` were collected above, written into the
      // onboarding draft, and the draft is localStorage. Nothing carried them
      // further: there was no column, and no consumer. So a doctor typed what
      // they may never claim into a box we put in front of them, and it lived in
      // one browser until that browser was cleared.
      //
      // Asking and discarding is worse than not asking. An unasked question
      // leaves a creator knowing the system does not know; a dropped one leaves
      // them believing it does, which is the reason they stop checking the
      // output for the claim they told us never to make.
      //
      // `audience` rides along because the brief is where the CREATOR'S OWN
      // answers live — `saveDNA` below stores the same field, but as part of the
      // scan's reading, and generate-blueprint has to know which is which to
      // prefer the one the person actually typed.
      //
      // `goal` deliberately does NOT: this screen's goal box is free text, and
      // §8a.1's `goal` is a CHOOSER whose values decide format, hook strategy and
      // CTA strength. Writing a sentence into an enum field would store an
      // answer no reader can act on — `readStoredBrief` would drop it anyway,
      // silently. The chooser is the other track's to add.
      // ⚠️ AND THE SIX SCAN ANSWERS, WHICH THIS BLOCK DESCRIBED AND THEN LEFT
      // OUT. Everything the comment above says about `workKind` was equally true
      // of them and stayed true afterwards: asked on the scan step, written into
      // the draft, and the draft is localStorage. A creator answered six
      // questions on their phone and a second device had never heard of any of
      // them.
      //
      // ⚖️ THIS IS THE ROOT CAUSE OF "TWIN ASKS ME THE SAME THING FOUR TIMES".
      // Onboarding asks, the DNA review asks again, "what can appear in your
      // videos" asks a third version, the Product Library asks a fourth — not
      // because four screens were written carelessly, but because THE FIRST
      // ANSWER NEVER LEFT THE BROWSER, so every later screen had to ask again.
      // The duplication is a symptom of this missing write.
      //
      // ⚠️ THE COLUMN, THE CONSTRAINT AND THE SANITISER ALREADY EXISTED. 0136 is
      // literally named `brief_carries_the_six_answers`, whitelists every key
      // below, and enforces that the three multi-selects are non-empty arrays.
      // The storage was built and the write was never wired — which is why
      // nothing ever failed loudly enough to notice.
      //
      // ⚖️ `null` RATHER THAN A DEFAULT FOR EVERY UNANSWERED ONE. The sanitiser
      // drops nulls, so a skipped question stays ABSENT rather than becoming a
      // stored value that reads as an answer. Unknown must stay unknown.
      await savePreScriptBrief(draft.voiceId, {
        workKind, workKindOther: workKindOther.trim() || null,
        forbiddenClaims, audience, promotes: q4,
        audienceKnowledge: draft.audienceKnowledge ?? null,
        contentGoals: draft.contentGoals?.length ? draft.contentGoals : null,
        desiredFormats: draft.desiredFormats?.length ? draft.desiredFormats : null,
        formatExploration: draft.formatExploration ?? null,
        commercialTies: draft.commercialTies?.length ? draft.commercialTies : null,
        ownProductKind: draft.ownProductKind ?? null,
        ownServiceKind: draft.ownServiceKind ?? null,
        // The offer, but ONLY if the creator typed it. `offerTouched` is exactly
        // that fact, and without it we would store the scan's guess as though
        // they had confirmed it — which is the inference this question exists to
        // replace.
        offer: offerTouched ? product : null,
      })
      // THE ENTITY Q3 MINTED — written here, not asked anywhere.
      //
      // A creator who said "Software" has told us they own a SaaS product; a
      // separate question asking whether they have one would be re-asking what
      // this answer already implied. So the entity is derived, shown pre-filled
      // above, and persisted here with whatever correction they made.
      //
      // `ownsEntity === false` writes NOTHING, which is the whole mechanism for
      // "I don't own one" — including the creator whose old `nothing_to_sell`
      // answer was mapped to it. No owned entity means nothing downstream has
      // anything to sell, which is exactly what that answer bought them.
      //
      // A FAILED MINT MUST NOT LOSE THE VOICE. Everything above is already
      // committed by this point, and the entity is a refinement rather than a
      // prerequisite: a creator whose product row failed to write still has a
      // working profile and can correct it from the Product Library. Throwing
      // here would send them back to a confirm screen whose work is already
      // saved, to do it again.
      if (ownsEntity && mintsOwnedEntity(workKind)) {
        try {
          await saveMintedEntity(
            draft.userId,
            draft.voiceId,
            // SHOWABILITY IS PRE-FILLED FROM THE CAPABILITY ANSWERS, not asked
            // again. Whether this product can be put on screen is the question
            // "can you record a screen / film an object" applied to a specific
            // thing — so it is derived, marked inferred, and correctable from
            // the Product Library rather than costing another tap here.
            mintFromWorkKind(workKind, {
              name: product.trim() || null,
              flags: { canRecordScreen, canFilmObjects },
              // ⚠️ THE FINER ANSWER, WHICH REACHED NOTHING UNTIL NOW. The scan
              // step asks "What kind of thing do you sell?" and the entity was
              // minted from workKind alone -- so a creator selling a course
              // said so and was typed SAAS. The type decides the show moments,
              // so this was not cosmetic.
              ownProductKind: draft.ownProductKind ?? null,
              ownServiceKind: draft.ownServiceKind ?? null,
            }),
          )
        } catch (mintError) {
          // ⚠️ THIS WAS A BARE console.warn, AND IT HID THE ONE FAILURE THAT
          // CHANGES WHAT GETS WRITTEN. Not throwing is right — see above, the
          // voice is already saved and sending them back would lose nothing but
          // their time. Staying SILENT is not. A swallowed mint leaves the
          // creator believing they told us about their product while
          // `generate-blueprint` reads no row and writes to a prompt that says
          // so. They then get scripts shaped around not having the thing they
          // just described, with nothing anywhere pointing at why.
          //
          // ⚖️ SO IT IS LOGGED AS AN EVENT AND SHOWN AS A NOTICE, NOT RAISED AS
          // AN ERROR. The severity is "a refinement did not land", which is a
          // thing to tell someone about and let them fix, not a thing to fail
          // their signup over.
          console.error(JSON.stringify({
            event: 'owned_entity_mint_failed',
            voiceId: draft.voiceId,
            detail: mintError instanceof Error ? mintError.message : String(mintError),
          }))
          // ⚖️ NOW THAT THE PAGE EXISTS, THE NOTICE CAN POINT AT IT. This text
          // deliberately said nothing about the Product Library while three
          // comments in this file sent people to a route that did not exist —
          // telling someone to go somewhere that isn't there turns a storage
          // failure into a hunt. `/products` is real as of this change.
          setMintWarning(
            'Your profile is saved, but we could not store your product details. '
            + 'Your scripts will not assume you have a product until you add it in the Product Library.',
          )
        }
      }
      // ALSO seed the Creator DNA (profile.dna) from the scan + these answers, so
      // the scanned signup isn't left with a half-empty DNA (the "audience/product/
      // goal Not set" bug). This is the durable onboarding boundary: do not enter
      // the studio until the profile row confirms the Brand DNA and onboarded flag.
      await saveDNA({
        niche: vp.niche,
        audience,
        product,
        // Never fabricate a goal the creator didn't state — an unset goal stays
        // empty (Settings shows "+ Add"), and the blueprint applies its own neutral
        // fallback at write time. Storing a canned goal here made it read as theirs.
        goal,
        voice: [vp.tone, vp.pacing].filter(Boolean).join(', '),
        platforms: [draft.platform],
        editing_style: vp.hook_style || '',
      })
      await onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save your voice.')
      setBusy(false)
    }
  }

  return (
    <>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-signature-soft">
        <Check className="h-5 w-5 text-teal" />
      </span>
      <p className="eyebrow mt-5">This is your voice · tweak anything</p>
      <h1 className="mt-3 font-display text-2xl leading-snug">{vp.summary || 'Here’s how you sound'}</h1>

      {/* Lead with PROOF the AI nailed their voice — a hook written as them. One
          generated line converts skeptics far better than a wall of input fields. */}
      {vp.sample_hooks?.[0] && (
        <div className="mt-5 rounded-card border border-amber/25 bg-amber/[0.07] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber">A hook I’d write as you</p>
          <p className="mt-1.5 font-heading text-lg leading-snug text-cream">“{vp.sample_hooks[0]}”</p>
          {vp.sample_hooks[1] && (
            <p className="mt-2 text-sm leading-snug text-sand">“{vp.sample_hooks[1]}”</p>
          )}
        </div>
      )}

      {/* WHAT CHANGES THE SCRIPT, SEPARATED FROM WHAT DESCRIBES THE VOICE.
          Every field on this screen used to carry identical weight: the four
          answers that decide what a video says sat between ten scan-derived
          voice details, indistinguishable. When the scan came back thin that
          was fifteen empty boxes with no indication which mattered — the worst
          moment to make someone guess.

          These are the ones no scan can produce. Niche moved down with the
          voice fields, because a scan CAN read it. */}
      <div className="mt-6 space-y-4">
        <div>
          <p className="eyebrow text-cream">What Twin needs from you</p>
          <p className="mt-1 text-xs text-stone">
            No scan can read these, and each one changes what your scripts say.
          </p>
        </div>
        {/* Captured here so the DNA is complete from day one (the scan can't read
            these). Optional — empty is fine, the creator can fill them in Settings. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
          <Labeled label="Who you're talking to">
            <input className="field" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. busy founders, 25-40" />
          </Labeled>
          {/* Q3b — §8a calls this the highest-value field on the form. It is
              otherwise INFERRED, and voice.ts's prompt forbids a blank, so the
              model must produce something: a guessed offer is a wrong call to
              action on every video shipped. */}
          <Labeled label="What is your offer called, and what does it do?">
            <input
              className="field"
              value={product}
              onChange={(e) => { setProduct(e.target.value); setOfferTouched(true) }}
              placeholder="e.g. Twin — it edits your videos for you"
            />
            {/* ⚠️ THE NOTICE SAID THE OPPOSITE OF WHAT THE CODE DOES, AND THE
                NOTICE IS WHAT A CREATOR BELIEVES. "It becomes the call to action
                on every video" is false for an untouched guess: `offer` is
                written only when `offerTouched`, so a guess nobody edits is
                stored as null and reaches no script.
                MEASURED: a real account was shown "A radical mindset shift
                towards patience, self-awareness…" under that sentence. That is
                a THEME, not an offer — and being told it would drive every CTA
                is exactly the alarm a creator should feel about a claim they
                never made. The behaviour was already right; the sentence was
                manufacturing the fear. */}
            {!offerTouched && product && (
              <p className="mt-1 text-[11px] text-amber">
                We guessed this from your posts. We will not use it until you edit it —
                fix it if it is wrong, or leave it and Twin stays quiet about your offer.
              </p>
            )}
          </Labeled>
        </div>
        {/* Q3 — decides where business truth comes from, and whether the claims
            question below is asked at all. */}
        <Labeled label="What do you do?">
          <div className="flex flex-wrap gap-2">
            {BRIEF_WORK_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setWorkKind(workKind === k ? null : k)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  workKind === k
                    ? 'border-coral bg-coral/15 text-cream'
                    : 'border-white/15 text-sand hover:bg-white/5'
                }`}
              >
                {WORK_KIND_LABEL[k]}
              </button>
            ))}
          </div>
          {/* THE BOX THE CONTRACT HAS ALWAYS REQUIRED.
              `otherWithoutText` has existed in preScriptBrief.ts since the brief
              was written, and nothing rendered a place to type. So `other`
              reached the script as the bare word "other" — which describes
              nobody, and is the one answer where the creator has more to say
              than any chip could hold. Shown only for `other`, because a text
              box beside six chips invites everyone to skip the chips. */}
          {workKind === 'other' && (
            <input
              value={workKindOther}
              onChange={(e) => setWorkKindOther(e.target.value.slice(0, 240))}
              placeholder="In one line — what do you actually do?"
              aria-label="Describe what you do"
              className="mt-2 w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm text-cream placeholder:text-sand/50 focus:border-coral focus:outline-none"
            />
          )}
        </Labeled>
        {/* WHAT Q3 ALREADY TOLD US — SHOWN, NOT ASKED.
            A creator who has just said "Software" is not then asked whether they
            have a product. Q3 mints the owned entity and it appears here
            pre-filled and correctable, which is the pattern `offer` directly
            above already uses.
            CORRECTABLE MEANS A REAL EXIT. The mint is an inference from an
            answer, not the answer itself, so "That's not right" clears it rather
            than arguing — and clearing it hands ownership back to Q4 below,
            which is where a creator with nothing of their own belongs. */}
        {mintsOwnedEntity(workKind) && (
          <div className="rounded-card border border-white/10 bg-white/[0.03] p-3.5">
            {ownsEntity ? (
              <>
                <p className="text-sm text-cream">
                  We’ll treat{' '}
                  <span className="text-amber">{product.trim() || 'your offer'}</span>{' '}
                  as your own {ENTITY_TYPE_LABEL[mintedType]}.
                </p>
                <p className="mt-1 text-[11px] text-stone">
                  From what you do — so a script may speak for it, and say what it costs.
                </p>
                <button
                  type="button"
                  onClick={() => setOwnsEntity(false)}
                  className="mt-2 text-[11px] text-stone underline decoration-white/20 underline-offset-2 hover:text-cream"
                >
                  That’s not right — I don’t own one
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-sand">No product of your own, then.</p>
                <button
                  type="button"
                  onClick={() => setOwnsEntity(true)}
                  className="mt-2 text-[11px] text-stone underline decoration-white/20 underline-offset-2 hover:text-cream"
                >
                  Actually, I do own one
                </button>
              </>
            )}
          </div>
        )}
        {/* Q4 — ONLY ABOUT THINGS THE CREATOR DOES NOT OWN.
            Placed after the mint because it is the residue: the block above
            settles what is theirs, this settles whose else's appears.

            NO DEFAULT. Leaving it unset is a real state that emits nothing into
            the prompt — the same three-state rule the claims question follows. A
            pre-selected answer would have this screen deciding a
            liability-adjacent fact nobody asked about.

            FOR A `creator` IT DOES DOUBLE DUTY. Q3 implies nothing for them, so
            "Nothing of anyone else's" additionally means ideas-only and no
            Product DNA at all — which is why the helper line changes with
            `q4AsksOwnership`. */}
        <Section
          title="What can appear in your videos?"
          hint="What a script may promise, and which shots Twin is allowed to ask you for."
          badge={q4 === null || canRecordScreen === null || canFilmObjects === null ? 'Not answered' : null}
        >
        <Labeled label={q4AsksOwnership(workKind)
          ? 'Do your videos feature any products?'
          : 'Anything else in your videos that isn’t yours?'}>
          <div className="flex flex-wrap gap-2">
            {Q4_ANSWERS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setQ4(q4 === k ? null : k)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  q4 === k
                    ? 'border-coral bg-coral/15 text-cream'
                    : 'border-white/15 text-sand hover:bg-white/5'
                }`}
              >
                {Q4_LABEL[k]}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-stone">
            {q4AsksOwnership(workKind)
              ? 'It changes what a script may promise — you can only speak for something you own.'
              : 'Someone else’s product means no ownership language, and a disclosure where one is owed.'}
          </p>
        </Labeled>
        {/* HOW THEY CAN SHOOT IT — IN THE SAME PLACE AS WHAT THEY SHOOT.
            These two sat in their own collapsed section further down the page,
            with unrelated fields between them and the products question, so one
            subject was asked in two places that never met. They are one thought:
            somebody deciding whether they show products has already decided
            whether they can hold one up.

            They still come AFTER the products question, and that ordering is the
            point. They used to be the ONLY questions asked while the scan ran,
            so the first thing Twin wanted to know was someone's camera setup,
            before it had established what they do or whether they sell anything.

            SKIPPING IS A REAL ANSWER AND IT IS NOT "NO". Tapping the chosen
            chip again clears it back to unanswered, and nothing is written for
            an unanswered question — `can_record_screen = false` permanently
            hides a surface, so "they never said" must never become "they said
            no".

            THE TWO GATES RUN IN OPPOSITE DIRECTIONS, which is why the copy is
            written twice rather than templated. `can_record_screen = false`
            HIDES a capture surface; `can_film_objects = false` withholds
            footage SUGGESTIONS. Saying no to the second removes advice, not
            ability, so the sentence has to promise the right thing. */}
          <p className="mt-5 text-xs text-sand">Can you have it open on a screen while you film?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([true, false] as const).map((v) => (
              <button
                key={String(v)}
                type="button"
                aria-pressed={canRecordScreen === v}
                onClick={() => setCanRecordScreen(canRecordScreen === v ? null : v)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs transition',
                  canRecordScreen === v
                    ? 'border-coral bg-coral/15 text-cream'
                    : 'border-white/15 text-sand hover:bg-white/5',
                )}
              >
                {v ? 'Yes' : 'No'}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-stone">
            Say yes and Twin can ask you to capture your screen for the moments your script says
            to show something. Skip it and nothing changes, we just will not offer it yet.
          </p>

          <p className="mt-4 text-xs text-sand">Can you put a product or object in front of the camera?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([true, false] as const).map((v) => (
              <button
                key={String(v)}
                type="button"
                aria-pressed={canFilmObjects === v}
                onClick={() => setCanFilmObjects(canFilmObjects === v ? null : v)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs transition',
                  canFilmObjects === v
                    ? 'border-coral bg-coral/15 text-cream'
                    : 'border-white/15 text-sand hover:bg-white/5',
                )}
              >
                {v ? 'Yes' : 'No'}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-stone">
            Say no and we stop suggesting shots you cannot film. Skip it and we keep showing the
            full checklist, because a suggestion you ignore costs nothing and a missing one costs
            a video.
          </p>
        </Section>
        {/* THE CONDITIONAL. Unguessable, and unforgivable to get wrong for a
            doctor, lawyer, financial adviser or supplement brand — there is no
            model that can infer what a regulator will not let someone say. */}
        {asksForbiddenClaims(workKind) && (
          <Labeled label="Is there anything you are not allowed to claim?">
            <input
              className="field"
              value={forbiddenClaims}
              onChange={(e) => setForbiddenClaims(e.target.value)}
              placeholder="e.g. no guaranteed outcomes, never the word “cure”"
            />
            <p className="mt-1 text-[11px] text-stone">
              We will keep these out of every script. Write “none” if there are no restrictions.
            </p>
          </Labeled>
        )}
        <Labeled label="Your goal">
          <input className="field" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. grow to 50k, drive signups, build trust" />
        </Labeled>
      </div>

      {/* THE VOICE DETAILS, AND THEY COLLAPSE WHEN THERE IS NOTHING IN THEM.
          These are what the scan produced. When it worked they are worth
          reviewing, so the section opens. When it returned nothing they are ten
          empty boxes that make the screen look broken and bury the answers
          above, so it starts closed and says so. Either way nothing is hidden
          from anyone who wants it. */}
      <div className="mt-8 border-t border-white/8 pt-6">
        <button
          type="button"
          onClick={() => setShowVoice((v) => !v)}
          aria-expanded={showVoice}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span>
            <span className="eyebrow text-cream">Your voice</span>
            <span className="mt-1 block text-xs text-stone">
              {voiceIsEmpty
                ? 'The scan found nothing to fill these in. You can add them now or leave them, and Twin will learn them from how you talk on camera.'
                : voiceDigest}
            </span>
          </span>
          <span className="shrink-0 text-xs text-sand">{showVoice ? 'Hide' : 'Show'}</span>
        </button>
      </div>

      <div className={cn('mt-6 space-y-4', !showVoice && 'hidden')}>
        <Labeled label="Niche">
          <input className="field" value={vp.niche} onChange={(e) => setField('niche', e.target.value)} />
        </Labeled>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
          <Labeled label="Tone">
            <input className="field" value={vp.tone} onChange={(e) => setField('tone', e.target.value)} />
          </Labeled>
          <Labeled label="Pacing">
            <input className="field" value={vp.pacing} onChange={(e) => setField('pacing', e.target.value)} />
          </Labeled>
        </div>
        <Labeled label="Hook style">
          <input className="field" value={vp.hook_style} onChange={(e) => setField('hook_style', e.target.value)} />
        </Labeled>
        <ChipList label="Signature words" items={vp.vocabulary} onChange={(v) => setList('vocabulary', v)} />
        <ChipList label="Recurring CTAs" items={vp.recurring_ctas} onChange={(v) => setList('recurring_ctas', v)} />
        <ChipList label="Do" items={vp.dos} onChange={(v) => setList('dos', v)} />
        <ChipList label="Don’t" items={vp.donts} onChange={(v) => setList('donts', v)} />
        {/* The distinctive fields — what makes a hook unmistakably YOURS. Editable
            so a wrong stance can't silently poison every future blueprint. */}
        <Labeled label="What you push against (your “enemy”)">
          <input className="field" value={vp.enemy ?? ''} onChange={(e) => setField('enemy', e.target.value)} placeholder="the bad advice or take you argue against" />
        </Labeled>
        <ChipList label="Your point of view" items={vp.pov ?? []} onChange={(v) => setList('pov', v)} />
        <ChipList label="Hook patterns" items={vp.hook_patterns ?? []} onChange={(v) => setList('hook_patterns', v)} />
        <ChipList label="Your video formats" items={vp.formats ?? []} onChange={(v) => setList('formats', v)} />
        <p className="text-xs text-stone">We’ll sharpen this from how you actually talk on camera within a few minutes — your spoken voice is the strongest signal.</p>
      </div>

      {err && <p className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{err}</p>}
      {mintWarning && (
        <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-600">{mintWarning}</p>
      )}

      {/* A WAY OUT. "Describe your voice myself" landed here with no exit, so
          choosing it by mistake meant filling in fifteen fields or reloading
          the page. The scan step has always had a back button; this one never
          did, and it is the step you are most likely to reach by accident.

          The draft is written to localStorage on every answer, so going back
          keeps everything typed so far — this is a route out, not a reset. */}
      <div className="mt-8 flex items-center justify-between gap-3">
        <button className="btn-ghost" onClick={onBack} disabled={busy}>
          Back
        </button>
        <button className="btn-gradient" onClick={confirm} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              This is me, enter the studio <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </>
  )
}

/**
 * A COLLAPSIBLE GROUP, because this screen is five phone-screens of one scroll.
 *
 * The confirm step carries every answer that changes what a script says AND
 * every field the scan drafted, flat, at identical weight. The first real
 * production run found the consequence: EVERY question below the fold came back
 * unanswered. That is not a wording problem — a form nobody can see the shape of
 * is a form people abandon partway and believe they finished.
 *
 * So each group states what it is and how many answers are still open, and only
 * the group being worked on is expanded. `<details>` rather than a `useState`
 * accordion on purpose: it is keyboard-accessible, it survives without
 * JavaScript, and the browser gives the open/closed animation for free.
 *
 * ⚖️ COLLAPSED IS NOT HIDDEN. Every group renders its fields in the DOM whether
 * open or shut, so nothing here can silently drop an answer the creator gave
 * before collapsing it — and the summary line tells them what is left rather
 * than making them open each one to find out.
 */
function Section({
  title, hint, open, badge, children,
}: {
  title: string
  hint?: string
  open?: boolean
  /** What is still unanswered in here. Absent when there is nothing outstanding. */
  badge?: string | null
  children: React.ReactNode
}) {
  return (
    <details
      open={open}
      className="group rounded-card border border-white/10 bg-white/[0.02] transition-colors open:border-white/15 open:bg-white/[0.035]"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-cream">{title}</p>
          {hint && <p className="mt-1 text-xs leading-relaxed text-stone">{hint}</p>}
        </div>
        {badge && (
          <span className="shrink-0 rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 text-[11px] text-amber">
            {badge}
          </span>
        )}
        {/* Rotates with the group's own open state — no JS, no second source of
            truth about whether this is expanded. */}
        <ArrowRight className="h-4 w-4 shrink-0 text-stone transition-transform group-open:rotate-90" />
      </summary>
      <div className="space-y-4 border-t border-white/8 p-4 pt-4">{children}</div>
    </details>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="eyebrow">{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  )
}

// Chip editor: click a chip to remove it; type + Enter to add one.
function ChipList({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (v && !items.includes(v)) onChange([...items, v])
    setDraft('')
  }
  return (
    <div>
      <label className="eyebrow">{label}</label>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((it) => (
          <button
            key={it}
            type="button"
            className="chip border-coral/50 text-cream transition-colors hover:border-coral"
            onClick={() => onChange(items.filter((x) => x !== it))}
            title="Remove"
          >
            {it} ✕
          </button>
        ))}
        <input
          className="field w-40 flex-1"
          placeholder="add…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
        />
      </div>
    </div>
  )
}

// ── THE SIX QUESTIONS, IN PLAIN ENGLISH ───────────────────────────────────
//
// ⚖️ THE LABELS LIVE BESIDE THE SCREEN, THE BEHAVIOUR LIVES IN SHARED. Every
// value below comes from an enum the compiler reads, so a chip whose value the
// compiler discards cannot be rendered — that is a question that lies. What is
// local is only the WORDING, which is the part a creator experiences and the
// part that must never say `own_product`, `talking_head` or `stay_close`.
const AUDIENCE_LABEL: Record<AudienceSegment, string> = {
  consumers: 'Everyday people',
  founders: 'Founders / business owners',
  professionals: 'Professionals in my field',
  creators: 'Other creators',
  companies: 'Companies / teams',
  students: 'Students / people learning',
  enthusiasts: 'Hobbyists / enthusiasts',
  mixed: 'A mix of people',
}

const KNOWLEDGE_LABEL: Record<AudienceKnowledge, string> = {
  beginners: 'Mostly beginners',
  basics: 'They know the basics',
  experienced: 'Mostly experienced',
  mixed: 'A mix',
}

const CONTENT_GOAL_LABEL: Record<BriefGoal, string> = {
  followers: 'Reach more people',
  authority: 'Build trust in what I know',
  educate: 'Teach people',
  leads: 'Get leads or clients',
  sell: 'Sell what I offer',
  entertain: 'Entertain people',
  personal_brand: 'Build my name',
}

const FORMAT_LABEL: Record<DesiredFormat, string> = {
  talking_head: 'Talking to camera',
  educational: 'Explaining things',
  founder: 'Behind the business',
  review: 'Reviews & comparisons',
  product: 'Showing a product',
  story: 'Stories & experiences',
  opinion: 'Opinions & takes',
  pov: 'POV / simple skits',
  trend: 'Trends & current topics',
  walking: 'Walking & casual talking',
  recommend: 'Let Twin suggest',
}

const EXPLORATION_LABEL: Record<FormatExploration, string> = {
  stay_close: 'Mostly what I already make',
  fit_goals: 'Whatever fits my goals',
  try_new: 'Help me try new things',
  mixed: 'A mix',
}

const TIE_LABEL: Record<CommercialTie, string> = {
  own_product: 'Something I sell',
  own_service: 'A service I offer',
  affiliate: 'Products I earn commission on',
  sponsor: 'Sponsored products',
  review: 'Things I review',
  none: 'Nothing commercial',
}

const PRODUCT_KIND_LABEL: Record<OwnProductKind, string> = {
  software: 'Software or an app',
  physical: 'A physical product',
  digital: 'A digital product',
  course: 'A course',
  marketplace: 'A marketplace or store',
  other: 'Something else',
}

const SERVICE_KIND_LABEL: Record<OwnServiceKind, string> = {
  consulting: 'Consulting',
  coaching: 'Coaching',
  agency: 'Agency work',
  freelance: 'Freelance work',
  training: 'Training',
  community: 'A community',
  other: 'Something else',
}

const CAPABILITY_LABEL: Record<CapabilityAnswer, string> = {
  yes: 'Yes',
  sometimes: 'Sometimes',
  no: 'No',
}

/** The answers the adaptive rules read, lifted off the draft. */

function Chips<T extends string>({ values, label, chosen, onPick }: {
  values: readonly T[]
  label: Record<T, string>
  /** A single value, or the list for a multi-select. */
  chosen: T | readonly T[] | null
  onPick: (v: T) => void
}) {
  const isOn = (v: T) => (Array.isArray(chosen) ? (chosen as readonly T[]).includes(v) : chosen === v)
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={isOn(v)}
          onClick={() => onPick(v)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs transition',
            isOn(v) ? 'border-coral bg-coral/15 text-cream' : 'border-white/15 text-sand hover:bg-white/5',
          )}
        >{label[v]}</button>
      ))}
    </div>
  )
}

/**
 * ⚠️ EVERY CHIP TOGGLES OFF. A mis-tap on a waiting screen is common, and on
 * the capability questions it is expensive — `no` permanently hides a surface —
 * so tapping the chosen answer again returns to unanswered everywhere, rather
 * than only where somebody remembered to write it.
 */
function ProfileQuestion({ id, draft, onDraftChange }: {
  id: ProfileQuestionId | undefined
  draft: OnboardingDraft
  onDraftChange: (next: OnboardingDraft) => void
}) {
  if (!id) return null
  const set = (patch: Partial<OnboardingDraft>) => onDraftChange({ ...draft, ...patch })
  const toggle = <T extends string>(list: readonly T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
  const ask = (text: string) => <p className="mt-2 text-base font-medium text-cream">{text}</p>
  const note = (text: string) => <p className="mt-2 text-[11px] text-stone">{text}</p>

  if (id === 'workKind') {
    return (
      <>
        {ask('What best describes what you do?')}
        <Chips
          values={BRIEF_WORK_KINDS} label={WORK_KIND_LABEL} chosen={draft.workKind}
          onPick={(k) => set({ workKind: draft.workKind === k ? null : k })}
        />
      </>
    )
  }

  if (id === 'audience') {
    return (
      <>
        {ask('Who do you mainly want to reach?')}
        <Chips
          values={AUDIENCE_SEGMENTS} label={AUDIENCE_LABEL} chosen={draft.audienceSeg}
          onPick={(a) => set({ audienceSeg: draft.audienceSeg === a ? null : a })}
        />
        {/* ⚖️ THE SECOND HALF CHANGES DEPTH, NOT TONE. The same subject for
            beginner founders and expert founders is two different videos. */}
        <p className="mt-4 text-xs text-sand">How much do they already know?</p>
        <Chips
          values={AUDIENCE_KNOWLEDGE} label={KNOWLEDGE_LABEL} chosen={draft.audienceKnowledge}
          onPick={(k) => set({ audienceKnowledge: draft.audienceKnowledge === k ? null : k })}
        />
      </>
    )
  }

  if (id === 'contentGoals') {
    const full = draft.contentGoals.length >= MAX_CONTENT_GOALS
    return (
      <>
        {ask('What do you want your content to help you do?')}
        <Chips
          values={BRIEF_GOALS} label={CONTENT_GOAL_LABEL} chosen={draft.contentGoals}
          onPick={(g) => {
            // ⚠️ THE CAP IS ENFORCED BY REFUSING THE THIRD TAP, NOT BY SILENTLY
            // DROPPING ONE. A chip that appears to select and then vanishes
            // reads as a bug; a chip that does not light up reads as a limit.
            const chosen = draft.contentGoals.includes(g)
            if (!chosen && full) return
            set({ contentGoals: toggle(draft.contentGoals, g) })
          }}
        />
        {note(full ? 'Two is the limit — tap one to swap it.' : 'Pick up to two.')}
      </>
    )
  }

  if (id === 'desiredFormats') {
    return (
      <>
        {ask('What kinds of videos do you want Twin to help you make?')}
        <Chips
          values={DESIRED_FORMATS} label={FORMAT_LABEL} chosen={draft.desiredFormats}
          onPick={(f) => set({ desiredFormats: toggle(draft.desiredFormats, f) })}
        />
        {/* ⚖️ NOT DERIVABLE FROM THE LIST ABOVE. Somebody can pick three formats
            they already make and still want to be pushed. */}
        <p className="mt-4 text-xs text-sand">Should Twin stay close to what you already do?</p>
        <Chips
          values={FORMAT_EXPLORATION} label={EXPLORATION_LABEL} chosen={draft.formatExploration}
          onPick={(e) => set({ formatExploration: draft.formatExploration === e ? null : e })}
        />
      </>
    )
  }

  if (id === 'commercialTies') {
    return (
      <>
        {ask('Do you make content about anything you sell or promote?')}
        <Chips
          values={COMMERCIAL_TIES} label={TIE_LABEL} chosen={draft.commercialTies}
          onPick={(t) => {
            // ⚠️ "NOTHING COMMERCIAL" IS EXCLUSIVE, IN BOTH DIRECTIONS. Chosen
            // alongside a real tie it means nothing, and leaving both selected
            // would make the adaptive rules read a contradiction.
            if (t === 'none') {
              set({ commercialTies: draft.commercialTies.includes('none') ? [] : ['none'] })
              return
            }
            const next = toggle(draft.commercialTies.filter((x) => x !== 'none'), t)
            set({ commercialTies: next })
          }}
        />
        {asksOwnProductKind(profileAnswersOf(draft)) && (
          <>
            <p className="mt-4 text-xs text-sand">What kind of thing do you sell?</p>
            <Chips
              values={OWN_PRODUCT_KINDS} label={PRODUCT_KIND_LABEL} chosen={draft.ownProductKind}
              onPick={(k) => set({ ownProductKind: draft.ownProductKind === k ? null : k })}
            />
          </>
        )}
        {asksOwnServiceKind(profileAnswersOf(draft)) && (
          <>
            <p className="mt-4 text-xs text-sand">What kind of service?</p>
            <Chips
              values={OWN_SERVICE_KINDS} label={SERVICE_KIND_LABEL} chosen={draft.ownServiceKind}
              onPick={(k) => set({ ownServiceKind: draft.ownServiceKind === k ? null : k })}
            />
          </>
        )}
        {note('This only tells Twin what kind of thing exists — you claim the actual product later.')}
      </>
    )
  }

  // `capabilities` — only reached when at least one half applies.
  const answers = profileAnswersOf(draft)
  return (
    <>
      {ask('What can Twin ask you to show when you record?')}
      {asksScreenCapability(answers) && (
        <>
          <p className="mt-3 text-xs text-sand">Can you record your screen when Twin needs it?</p>
          <Chips
            values={CAPABILITY_ANSWERS} label={CAPABILITY_LABEL} chosen={draft.screenCapability}
            onPick={(v) => {
              const next = draft.screenCapability === v ? null : v
              // ⚠️ THE BOOLEAN IS DERIVED, NEVER TYPED TWICE. Every existing
              // reader is written against `canRecordScreen`, and "sometimes"
              // becomes null there: no scene may depend on it, and nothing is
              // hidden — which is exactly what null already meant.
              set({ screenCapability: next, canRecordScreen: next === 'yes' ? true : next === 'no' ? false : null })
            }}
          />
        </>
      )}
      {asksProductCapability(answers) && (
        <>
          <p className="mt-4 text-xs text-sand">Can you usually show the product on camera?</p>
          <Chips
            values={CAPABILITY_ANSWERS} label={CAPABILITY_LABEL} chosen={draft.productCapability}
            onPick={(v) => {
              const next = draft.productCapability === v ? null : v
              set({ productCapability: next, canFilmObjects: next === 'yes' ? true : next === 'no' ? false : null })
            }}
          />
        </>
      )}
      {note('Say no and we stop suggesting shots you cannot film. Skip it and nothing is decided.')}
    </>
  )
}
