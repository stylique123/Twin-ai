import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CreatorTypePicker from '../components/CreatorTypePicker'
import { useNavigate, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { trialUser } from '../components/ProductDetailsByKind'
import { pollDna, saveCapabilityDefaults, savePreScriptBrief, saveDNA, saveVoiceProfile, startDna, startManualVoice } from '../lib/api'
import type { Platform, Profile, VoiceProfile } from '../lib/types'
import { asksForbiddenClaims, BRIEF_GOALS, type BriefWorkKind, type BriefGoal } from '../lib/api'
import {
  profileQuestionsFor, asksScreenCapability, asksProductCapability,
  ONBOARDING_SELLS_ANSWERS, sellsAnswerOf, SELLS_ANSWER_TO_TIES, handleShapeError,
  type OnboardingSellsAnswer,
  AUDIENCE_SEGMENTS, AUDIENCE_KNOWLEDGE, goalFromCtas, goalConfirmationLine,
  scannedAudienceFacts, audienceFactConfirmed,
  CAPABILITY_ANSWERS,
  DEPTH_QUESTION_IDS,
  type ProfileQuestionId, type AudienceSegment,
  type AudienceKnowledge,
  type CapabilityAnswer,
} from '../lib/api'
import {
  mintFromWorkKind, mintsOwnedEntity, claimProductEntity, offerPieces, OFFER_KIND_LABEL, type OfferPiece,
  saveMintedEntity, type EntityType, type Q4Answer,
} from '../lib/api'
import {
  readScanFailure, scanFailure, PLATFORM_LABEL,
  type ScanFailure,
} from '../lib/api'
import { OnboardingHeader } from '../components/onboarding/OnboardingHeader'
import { useWide } from '../hooks/useWide'
import '../styles/onboarding.css'

/** The chooser's words. Kept beside the screen rather than in the contract: the
 *  ids are the contract, and how they are phrased to a person is not. */
// ⚖️ PLAIN ENGLISH, AND THE INTERNAL NAME IS NEVER THE LABEL. `saas` reads as
// "Software", `local_service` as "Local business" — a creator should not have to
// know which noun the codebase picked.
//
// ⚠️ FOUNDER, COACH AND FREELANCER WERE DELETED FROM THIS CHOOSER, AND THAT
// WAS THE WRONG HALF OF THE FIX. The reasoning was sound as far as it went:
// `WORK_KIND_LINES` in `generate-blueprint/index.ts` had no entry for any of
// the three, so picking one produced the same empty line as picking nothing.
// The conclusion was not: the three chips describe the exact creators this
// product is tested on — a coach selling consulting, a founder remixing a
// business influencer — and removing them forced those people to answer
// "Something else" about their own occupation.
//
// A question with no reader is a bug, and so is deleting the question instead
// of writing the reader. `WORK_KIND_LINES` now has a real, distinct entry for
// all three (see the same file), so these chips reach the prompt like every
// other one, and `workKindLinesCoverEveryChip.test.ts` fails the build if a
// chip is ever offered again without one.
//
// ⚠️ PRODUCTION ALREADY HOLDS `coach`. Two `brand_voices` rows stored it before
// the deletion (checked against the live project, not assumed), so the value
// was never merely hypothetical — it was live data whose owners had just been
// told their occupation was "something else".
//
// ⚠️ "SOFTWARE / LOCAL BUSINESS" WAS ONE CHIP FOR TWO BUSINESSES THAT SHARE
// NOTHING, AND THE PROMPT ALREADY KNEW IT. `WORK_KIND_LINES` has always carried
// two genuinely opposed sentences for them:
//
//   saas           "proof is the product working — a screen SHOWN TO CAMERA...
//                   constraints are competitive, not regulatory"
//   local_service  "buyer is nearby and the action is booking or calling, not
//                   buying online. Completed work is the proof."
//
// A plumber who picked the merged chip stored `saas` and was told their proof
// was a screen recording. The two lines were written, distinct, and one of them
// was unreachable — a reader with nothing routed to it, which is the same
// defect as a field with no reader, wearing the other shoe.
//
// ⚖️ SPLIT, NEVER BACKFILLED. Measured in production 2026-09-05: ONE voice
// stores `saas` and ZERO store `local_service`, because the latter was never
// offered. That single row is NOT rewritten — nothing here can tell whether
// they are software or a local business, and guessing on their behalf is the
// silent rewrite this file's rules exist to forbid. They keep `saas`; only new
// signups see the two chips.
//
// ⚖️ EIGHT CHIPS, TEN STORED VALUES, AND NOTHING IS REWRITTEN. The chooser
// offers eight; `BRIEF_WORK_KINDS` keeps all ten valid. Two values are no
// longer OFFERED to a new signup but remain perfectly readable if a creator
// already stored one:
//
//   OFFERED CHIP                     STORES        ALSO READ AS (legacy, never rewritten)
//   Creator / influencer             creator       —
//   Founder / business owner         founder       —
//   Coach / consultant / freelancer  coach         freelancer
//   Licensed professional            professional  —
//   Ecommerce / brand                ecommerce     brand
//   Software product                 saas          —
//   Local business                   local_service —
//   Something else                   other         —
//
// This is the safest reading of the rewiring rules: merging two chips does NOT
// merge two stored values, so no row is silently rewritten and no backfill is
// owed. `freelancer` and `brand` keep their own labels AND their own
// `WORK_KIND_LINES` entries, so a creator who stored one still gets the
// sentence that describes their business rather than the one for the chip that
// absorbed it.
const WORK_KIND_LABEL: Record<BriefWorkKind, string> = {
  creator: 'Creator / influencer',
  founder: 'Founder / business owner',
  coach: 'Coach / consultant / freelancer',
  freelancer: 'Freelancer / agency',
  professional: 'Licensed professional',
  ecommerce: 'Ecommerce / brand',
  brand: 'Brand / content team',
  saas: 'Software product',
  local_service: 'Local business',
  other: 'Something else',
}

/** The seven chips a NEW signup is offered. Every one of these MUST have a
 *  non-empty `WORK_KIND_LINES` entry in `generate-blueprint/index.ts` — pinned
 *  by `workKindLinesCoverEveryChip.test.ts`, which is the guard that would have
 *  caught the original bug instead of trading it for a worse one.
 *
 *  `BRIEF_WORK_KINDS` (all ten) stays the stored type, so `freelancer`, `brand`
 *  and `local_service` remain valid values rather than becoming unreadable. */
const ONBOARDING_WORK_KINDS: readonly BriefWorkKind[] = [
  'creator', 'founder', 'coach', 'professional', 'ecommerce', 'saas',
  'local_service', 'other',
]
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
// ⚠️ Q4_LABEL's chips left with the block above; those labels live in the
// Product Library now, beside the product they describe.

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
  BUSINESS: 'business',
  OTHER: 'product',
}
import { EASE } from '../components/motion'
import { cn } from '../lib/cn'
import type { SellsKind } from '@twinai/shared'
import { loadProductEntities, sellsAnswerWithLibrary, type LibraryProductView } from '@twinai/shared'
import { manualVoiceCardOn, sanitizeManualVoiceAnswers, MANUAL_VOICE_KEY } from '@twinai/shared'
import { otherPlatforms } from '@twinai/shared'
import { StoryInterview } from '../components/StoryInterview'
import { loadSellsFacet } from '../lib/ownSellsLoad'
import { clearStoryDraft } from '../lib/storyDraft'
import { loadVoiceStageBand } from '../lib/voiceNicheLoad'
import {
  ONBOARDING_DRAFT_VERSION,
  clearOnboardingDraft,
  readOnboardingDraft,
  writeOnboardingDraft,
  type OnboardingDraft,
  emptyProfileAnswers,
  profileAnswersOf,
} from '../lib/onboardingDraft'

// Per-platform placeholder so the input matches the source they picked.
const PLACEHOLDER: Record<Platform, string> = {
  tiktok: '@yourhandle or https://tiktok.com/@yourhandle',
  instagram: '@yourhandle or https://instagram.com/@yourhandle',
  youtube: '@yourchannel or https://youtube.com/@yourchannel',
  linkedin: '@yourname  or  https://linkedin.com/in/yourname',
  other: '@yourhandle',
}

// Brand DNA is MANDATORY at signup, but a creator can reach it two ways: scan a
// real handle (the fast, one-tap path), OR describe their voice by hand. Both end
// at the same editable confirm form and produce a real voice — so a first run can
// never dead-end (no big account, or a scan outage, still gets you in).
// ⚠⚠ `stories` SITS BETWEEN THE SCAN AND THE REVIEW, AND THAT POSITION IS THE
// WHOLE FIX. The three story questions used to render DURING the scan, which
// meant Twin had no niche, no `sells` and no follower count to word them with —
// so a private chef and a template seller were asked the identical sentence
// "what does almost everyone in your NICHE believe", before we had read her
// niche. They can only be specific AFTER the DNA exists.
//
// ⚖️ AND IT IS ITS OWN STEP RATHER THAN A BLOCK ON THE REVIEW SCREEN. The
// measured failure was placement: on the first real production run EVERY
// question below the fold on the confirm screen came back unanswered. A step in
// the flow is passed through, not visited — which is the difference between this
// and the Product Library, a finished feature with zero rows because it waits.
type Mode = 'handle' | 'building' | 'stories' | 'confirm'

/** VITE_MANUAL_VOICE_CARD: default OFF; only 'true' / 'on' / '1' turns it on. */
export function manualVoiceCardFlag(): boolean {
  return manualVoiceCardOn(import.meta.env.VITE_MANUAL_VOICE_CARD as string | undefined)
}

/**
 * The profile to save, with her typed answers attached as `manual_voice` when
 * she set up by hand and the flag is on. Pure apart from the flag read: no
 * model call, nothing inferred. Every value is something she typed.
 */
export function withManualVoiceAnswers(
  vp: VoiceProfile,
  draft: Pick<OnboardingDraft, 'manual'>,
  audience: string,
  product: string,
  flagOn: boolean = manualVoiceCardFlag(),
): VoiceProfile {
  if (!flagOn || draft.manual !== true) return vp
  const answers = sanitizeManualVoiceAnswers({
    niche: vp.niche,
    tone: vp.tone,
    audience: audience || vp.audience || '',
    stories: [...(vp.sample_hooks ?? []), ...(vp.pov ?? []), ...(vp.enemy ? [vp.enemy] : [])],
    products: [product || vp.offer || ''].filter(Boolean),
  })
  if (!answers) return vp
  return { ...vp, [MANUAL_VOICE_KEY]: { source: 'manual', ...answers, saved_at: new Date().toISOString() } } as VoiceProfile
}

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

  const startDraft = useCallback((voiceId: string, platform: Platform, handle: string, profile: VoiceProfile | null, manual = false) => {
    const next: OnboardingDraft = {
      version: ONBOARDING_DRAFT_VERSION,
      userId,
      voiceId,
      platform,
      handle: handle.trim().slice(0, 120),
      ...(manual ? { manual: true } : {}),
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
  const handleStarted = useCallback((voiceId: string, platform: Platform, handle: string, profile: VoiceProfile | null, manual = false) => {
    startDraft(voiceId, platform, handle, profile, manual)
    setMode(profile ? 'confirm' : 'building')
  }, [startDraft])

  // ⚠️ THE SAME CREATOR, SOMEWHERE ELSE, IN ONE TAP. A scan that failed on OUR
  // side is most often fixed by trying another platform -- and the only route
  // there was Back, re-pick a platform, and retype the handle from memory.
  // That is a charge levied on somebody we have just told the fault was ours.
  const [retrySeed, setRetrySeed] = useState<{ handle: string; platform: Platform } | null>(null)
  // ⚖️ CONNECT BOARD: a failed scan is shown ON THE HANDLE SCREEN, with the
  // handle still filled in, the reason named, and the two ways forward (another
  // platform, or describe it myself). The answers given while it ran are kept.
  const [scanFailureShown, setScanFailureShown] = useState<ScanFailure | null>(null)
  const scanFailed = useCallback((f: ScanFailure) => {
    // The failed scan is forgotten before going back, so a reload cannot
    // resume into the same dead job.
    forgetDeadScan()
    setScanFailureShown(f)
    setRetrySeed({ handle: draft?.handle ?? '', platform: draft?.platform ?? 'instagram' })
    setMode('handle')
  }, [draft?.handle, draft?.platform, forgetDeadScan])
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
  const handleReady = useCallback((profile: VoiceProfile, manual = false) => {
    setDraft((current) => {
      if (!current || current.userId !== userId) return current
      const next: OnboardingDraft = {
        ...current,
        ...(manual ? { manual: true } : {}),
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
    // The scan is in. Ask the three questions it could not word until now.
    setMode('stories')
  }, [userId])

  // ⚠️ A WAY BACK TO THE START FROM ANY STEP. Owner report: onboarding failed
  // partway and nothing on screen could reset it. This clears only local state
  // (the draft and the story draft); the voice row a scan already created is
  // NOT deleted, and does not block re-entry — the handle step calls start-dna
  // with `replace: true`, which repoints that same single slot. No orphan, no wall.
  const [confirmingStartOver, setConfirmingStartOver] = useState(false)
  const startOver = useCallback(() => {
    safeClearDraft(userId)
    try { clearStoryDraft() } catch { /* storage unavailable */ }
    setDraft(null)
    setRetrySeed(null)
    setScanFailureShown(null)
    setConfirmingStartOver(false)
    setMode('handle')
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
  const stepIndex = mode === 'handle' ? 0 : mode === 'building' ? 1 : mode === 'stories' ? 2 : 3
  return (
    <main className="page-glow relative flex min-h-[100dvh] flex-col overflow-clip bg-ink pb-[max(2rem,env(safe-area-inset-bottom))] leading-[normal] text-cream">
      <div className="ob-aur ob-drift1 left-[-160px] top-[-160px] h-[700px] w-[700px] rounded-full bg-[radial-gradient(circle,rgba(255,179,71,0.14),rgba(255,179,71,0)_65%)] max-md:h-[460px] max-md:w-[460px]" aria-hidden="true" />
      <div className="ob-aur ob-drift2 bottom-[-200px] right-[-200px] h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,rgba(255,91,123,0.12),rgba(255,91,123,0)_65%)] max-md:hidden" aria-hidden="true" />
      <OnboardingHeader
        step={stepIndex}
        startOver={mode !== 'handle' && (
          confirmingStartOver ? (
            <span className="text-[12.5px] text-label">
              Clear your answers and start again?{' '}
              <button type="button" className="border-0 bg-transparent p-0 text-coral-soft underline" onClick={startOver}>Yes, start over</button>{' '}
              <button type="button" className="border-0 bg-transparent p-0 text-sand-soft underline" onClick={() => setConfirmingStartOver(false)}>Keep going</button>
            </span>
          ) : (
            <button type="button" className="border-0 bg-transparent p-0 text-[12.5px] text-label underline" onClick={() => setConfirmingStartOver(true)}>
              Stuck? Start over
            </button>
          )
        )}
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="relative z-[1] flex flex-grow flex-col"
        >
          {mode === 'handle' && (
            <HandleStep
              onStarted={(...args) => { setScanFailureShown(null); handleStarted(...args) }}
              seed={retrySeed}
              failure={scanFailureShown}
              onClearFailure={() => setScanFailureShown(null)}
            />
          )}
          {mode === 'building' && draft && (
            <BuildingStep
              draft={draft}
              onReady={handleReady}
              onScanDead={forgetDeadScan}
              onDraftChange={persistDraft}
              onFailed={scanFailed}
            />
          )}
          {mode === 'stories' && draft && (
            <StoryStep
              draft={draft}
              onDone={() => setMode('confirm')}
            />
          )}
          {mode === 'confirm' && draft && (
            <ConfirmStep
              draft={draft}
              onDraftChange={updateAnswers}
              onDone={complete}
              onPatch={persistDraft}
              onBack={() => (draft.manual ? setMode('handle') : setMode('stories'))}
            />
          )}
        </motion.div>
      </AnimatePresence>
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
  failure = null,
  onClearFailure,
}: {
  onStarted: (voiceId: string, platform: Platform, handle: string, profile: VoiceProfile | null, manual?: boolean) => void
  /** ⚖️ SET ONLY WHEN A FAILED SCAN SENT THEM BACK HERE. A normal arrival gets
   *  the empty form it always got; this is a recovery path, not a new default. */
  seed?: { handle: string; platform: Platform } | null
  /** The classified reason the last scan failed, shown on this screen (Connect board). */
  failure?: ScanFailure | null
  onClearFailure?: () => void
}) {
  const wide = useWide()
  const [handle, setHandle] = useState(seed?.handle ?? '')
  const [platform, setPlatform] = useState<Platform>(seed?.platform ?? 'instagram')
  const [busy, setBusy] = useState(false)
  const [manualBusy, setManualBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const go = async () => {
    setErr(null)
    if (!handle.trim()) return setErr('Paste your handle or profile link first.')
    // Same rule the server applies, so the sentence arrives before the round trip.
    const shape = handleShapeError(handle)
    if (shape) return setErr(shape)
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
      onStarted(res.brand_voice_id, platform, handle.trim(), emptyVoiceProfile(), true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not set up a manual voice.')
    } finally {
      setManualBusy(false)
    }
  }

  const name = handleName(handle)
  const liveErr = handle.trim() ? handleShapeError(handle) : null
  const shownErr = err ?? liveErr
  const ok = !!handle.trim() && !shownErr && !failure
  const pick = (p: Platform) => { setPlatform(p); setErr(null); onClearFailure?.() }
  const fail = failure ? failureCopy(failure, platform) : null
  const others = otherPlatforms(platform)
  const failureCard = fail && (
    <div role="alert" className={`ob-pop flex flex-col border border-[rgba(255,91,123,0.35)] bg-[rgba(255,91,123,0.08)] ${wide ? 'gap-2 rounded-[14px] px-4 py-[14px]' : 'gap-[6px] rounded-[14px] px-[14px] py-[13px]'}`}>
      <span className={`font-bold text-coral-soft ${wide ? 'text-[15px]' : 'text-[14.5px]'}`}>{fail.title}</span>
      <span className={`text-sand-soft ${wide ? 'text-[13.5px] leading-[1.5]' : 'text-[13px] leading-[1.45]'}`}>{fail.body}</span>
      <span className={`flex flex-wrap ${wide ? 'gap-2' : 'mt-1 gap-[6px]'}`}>
        {failure?.tryAnotherPlatform && others.length > 0 && others.map((p) => (
          <button key={p} type="button" onClick={() => pick(p)} className={`btn-outline ${wide ? '!px-3 !py-2 !text-[13px]' : '!px-[11px] !py-[7px] !text-[12.5px]'}`}>Try on {PLATFORM_LABEL[p]}</button>
        ))}
        <button type="button" onClick={goManual} disabled={busy || manualBusy} className={`btn-outline ${wide ? '!px-3 !py-2 !text-[13px]' : '!px-[11px] !py-[7px] !text-[12.5px]'}`}>
          {manualBusy ? 'Setting up…' : wide ? 'Describe my voice myself →' : 'Describe it myself →'}
        </button>
      </span>
    </div>
  )
  const tabs = (
    <div role="tablist" aria-label="Platform" className={`flex ${wide ? 'gap-2' : 'gap-[6px]'}`}>
      {(['tiktok', 'instagram', 'youtube'] as const).map((p) => {
        const on = platform === p
        return (
          <button key={p} type="button" role="tab" aria-selected={on} onClick={() => pick(p)}
            className={`flex items-center gap-2 rounded-full border font-semibold ${wide ? 'px-[15px] py-[9px] text-[14px]' : 'flex-1 justify-center gap-[6px] py-[9px] text-[13px] [@media(pointer:coarse)]:min-h-11'}`}
            style={{ borderColor: on ? 'rgba(255,91,123,0.6)' : 'rgba(255,255,255,0.1)', background: on ? 'rgba(255,91,123,0.12)' : 'transparent', color: on ? '#F6F1E9' : '#B7AE9F' }}>
            <PlatformIcon p={p} />{PLATFORM_LABEL[p]}
          </button>
        )
      })}
    </div>
  )
  const input = (
    <input className="fld" type="text" aria-label="Your handle or profile link" placeholder={PLACEHOLDER[platform]} value={handle}
      onChange={(e) => { setHandle(e.target.value); setErr(null); onClearFailure?.() }}
      onKeyDown={(e) => e.key === 'Enter' && go()}
      style={wide ? { padding: '16px 18px', fontSize: 17 } : { padding: '15px 16px', fontSize: 16 }} />
  )
  const status = ok ? (
    wide ? (
      <span className="ob-pop flex items-center gap-2 text-[13.5px] text-teal-soft">
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-teal text-[12px] font-black text-ink">✓</span>
        We'll read <b>@{name}</b> on {platformName(platform)}
      </span>
    ) : <span className="ob-pop -mt-[6px] text-[13px] text-teal-soft">✓ We'll read <b>@{name}</b> on {platformName(platform)}</span>
  ) : shownErr ? <span role="alert" className={`ob-pop text-coral-soft ${wide ? 'text-[13.5px]' : '-mt-[6px] text-[13px]'}`}>{shownErr}</span> : null
  const build = (
    <button type="button" onClick={go} disabled={busy || manualBusy}
      className={`ob-cta ob-gbtn flex items-center justify-center rounded-[14px] border-0 text-[16px] font-bold text-ink disabled:opacity-70 ${wide ? 'p-4 shadow-[0_14px_36px_-14px_rgba(255,91,123,0.8)]' : 'p-[15px]'}`}>
      {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting…</> : 'Build my voice →'}
    </button>
  )
  // Escape hatch: no account to scan? Describe your voice by hand instead.
  const manualLink = (cls: string) => (
    <button type="button" onClick={goManual} disabled={busy || manualBusy} className={cls}>
      {manualBusy ? 'Setting up…' : 'No account to scan? Set up my voice myself'}
    </button>
  )

  if (!wide) {
    return (
      <>
        <section className="pin d2 flex flex-grow flex-col gap-4 px-5 pt-7">
          <span className="text-[12px] font-bold tracking-[.12em] text-coral-soft">YOUR BRAND VOICE · THE ONE-TAP WAY</span>
          <h1 className="m-0 mt-[-6px] text-[31px] font-bold leading-[1.08] tracking-[-0.03em]">Paste your handle.<br /><span className="ob-grad">We read how you sound.</span></h1>
          {tabs}
          {input}
          {status}
          {failureCard}
          <span className="text-[13px] leading-[1.5] text-label">We read your recent public posts. Every guess stays yours to keep or change.</span>
        </section>
        <div className="flex flex-col gap-3 px-5 pb-7 pt-6">
          {build}
          {manualLink('min-h-11 border-0 bg-transparent text-center text-[13px] text-sand-muted underline')}
        </div>
      </>
    )
  }

  return (
    <div className="flex flex-grow flex-wrap items-center justify-center gap-x-20 gap-y-10 px-6 py-12 lg:px-20">
      <section className="pin d2 flex w-full max-w-[560px] flex-col gap-[22px]">
        <span className="text-[12px] font-bold tracking-[.12em] text-coral-soft">YOUR BRAND VOICE · THE ONE-TAP WAY</span>
        <h1 className="m-0 mt-[-8px] text-[46px] font-bold leading-[1.05] tracking-[-0.035em]">Paste your handle.<br /><span className="ob-grad">We read how you sound.</span></h1>
        <p className="m-0 text-[16px] leading-[1.55] text-sand-muted">Twin reads your recent posts and learns your voice, so every script sounds like you, not a robot.</p>
        {tabs}
        <div className="flex flex-col gap-[10px]">
          {input}
          {status}
        </div>
        {failureCard}
        {build}
        <div className="flex flex-wrap items-center justify-between gap-y-2 text-[13px] text-label">
          <span>We only read public posts. Use your own account.</span>
          {manualLink('border-0 bg-transparent p-0 text-sand-soft underline')}
        </div>
      </section>
      <aside className="pin d3 flex w-full max-w-[380px] flex-col gap-3">
        <span className="text-[12px] font-bold tracking-[.12em] text-label">WHAT TWIN READS</span>
        <div className="flex flex-col gap-[14px] rounded-[18px] border border-white/[0.07] bg-card p-[18px]">
          {[
            ['1', 'rgba(255,179,71,0.14)', '#FFB347', 'Your recent posts', 'How you open and end, the words you repeat'],
            ['2', 'rgba(255,91,123,0.14)', '#FF8FA4', 'How you actually talk', 'A few minutes later, from your videos’ audio'],
            ['3', 'rgba(101,229,216,0.14)', '#65E5D8', 'Nothing is final until you say so', 'Every guess is yours to keep or change'],
          ].map(([n, bg, fg, t, d]) => (
            <span key={n} className="flex items-start gap-3">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] text-[13px] font-extrabold" style={{ background: bg, color: fg }}>{n}</span>
              <span className="flex flex-col gap-[2px]"><b className="text-[14.5px]">{t}</b><span className="text-[13px] text-label">{d}</span></span>
            </span>
          ))}
        </div>
      </aside>
    </div>
  )
}

/** The account name a handle or profile link points at (Connect board's parser). */
function handleName(v: string): string {
  const t = v.trim()
  if (!t) return ''
  if (/\//.test(t)) {
    const parts = t.replace(/^https?:\/\//, '').split('/').filter(Boolean).slice(1)
    const at = parts.find((q) => q[0] === '@')
    return (at || parts.filter((q) => !['shorts', 'reels', 'videos', 'featured'].includes(q)).pop() || '').replace(/^@/, '')
  }
  return t.replace(/^@/, '')
}

/** Connect board copy for the three named failures; every other cause keeps
 *  its own tested sentence under a plain title. Never a dead end. */
function platformName(p: Platform): string {
  return p === 'tiktok' || p === 'instagram' || p === 'youtube' ? PLATFORM_LABEL[p] : 'This platform'
}

function failureCopy(f: ScanFailure, platform: Platform): { title: string; body: string } {
  switch (f.cause) {
    case 'ACCOUNT_PRIVATE': return { title: 'This account is private', body: 'Twin can only read public posts. Make it public for a minute, or try another platform.' }
    case 'NO_RECENT_CONTENT': return { title: 'No posts found', body: 'This account has no public videos yet. Try the platform you post on most.' }
    case 'RATE_LIMITED': return { title: `${platformName(platform)} is busy right now`, body: 'Too many reads at once. Wait a minute and try again, or try another platform.' }
    case 'HANDLE_NOT_FOUND': return { title: 'We couldn’t find that account', body: f.message }
    default: return { title: 'We couldn’t read this account', body: f.message }
  }
}

/** Platform glyphs, stroke paths copied from the Connect board. */
function PlatformIcon({ p }: { p: Platform }) {
  const d = p === 'tiktok' ? 'M15 3v10.5a3.5 3.5 0 1 1-3.5-3.5M15 3c.5 2.5 2.3 4 5 4'
    : p === 'instagram' ? 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'
    : 'M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM10 9l5 3-5 3z'
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  )
}

// --- Step 2: live progress while the scan runs -----------------------------

// ⚖️ THE COUNT IS NO LONGER A CONSTANT, AND THAT IS THE FEATURE. It is whatever
// `profileQuestionsFor` says applies to this person: five for a creator with
// nothing to sell, six for a founder with software to demonstrate. A fixed six
// would be a round number bought with irrelevant questions, and an irrelevant
// question is worse than a missing one — it teaches somebody the set is not
// serious, which is how the one that mattered gets skipped too.

function BuildingStep({
  draft,
  onReady,
  onScanDead,
  onDraftChange,
  onFailed,
}: {
  draft: OnboardingDraft
  onReady: (profile: VoiceProfile, manual?: boolean) => void
  onScanDead: () => void
  /** Connect board: a classified failure goes back to the handle screen,
   *  where "Try on <platform>" and "Describe my voice myself" live. */
  onFailed?: (f: ScanFailure) => void
  onDraftChange: (next: OnboardingDraft) => void
}) {
  // Her live Product Library rows, so an unanswered "do you sell" reads her
  // products as the answer (as Settings does). Null on a failed read — never
  // read as "no products".
  const [library, setLibrary] = useState<LibraryProductView[] | null>(null)
  useEffect(() => {
    let alive = true
    loadProductEntities()
      .then((rows) => { if (alive) setLibrary(rows) })
      .catch(() => { if (alive) setLibrary(null) })
    return () => { alive = false }
  }, [])
  const [, setErr] = useState<string | null>(null)
  // ⚠️ THE CLASSIFIED FAILURE, BESIDE THE RAW STRING RATHER THAN INSTEAD OF IT.
  // `err` still drives anything that only needs a sentence; this decides whether
  // the creator is told to go and change something, and it is the difference
  // between "your account may be private" and "this is on our side".

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
  // ⚠⚠ THE THREE STORY QUESTIONS ARE NO LONGER ASKED HERE. They moved to their
  // own step AFTER the scan (`mode === 'stories'`), because on this screen the
  // DNA does not exist yet and they could never be worded in her world. What is
  // left here is only what genuinely needs no scan: the categorical questions.
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
  // ⚠️ THE DEPTH QUESTIONS GATE THE HANDOVER TOO, for the reason this file has
  // already learned twice: a scan that finishes early must WAIT, never take the
  // screen away mid-answer. `StoryInterview` resolves every field before it
  // calls `onDone`, so this flips only on a tap.
  const [depthDone, setDepthDone] = useState(false)
  const asked = profileQuestionsFor(profileAnswersOf(draft))
  // ⚠️ AND A SHRINKING LIST CLAMPS RATHER THAN SKIPS. Standing on question five
  // when the list becomes four means seeing question four, not being thrown out
  // of the set entirely.
  const questionsDone = finished || asked.length === 0

  // Hand over only when BOTH halves are finished — and, per the Reading board,
  // on the creator's tap ("Twin has your voice." → Continue), never mid-answer.
  const canHandOver = !!(questionsDone && depthDone && readyProfile)
  const [tab, setTab] = useState(0)
  const wide = useWide()
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let stopped = false
    // Hard cap: if the scan never resolves (stuck worker, dropped job), don't
    // trap the user on an infinite spinner, surface the manual fallback.
    //
    // ⚠️⚠️ IT WAS 220s AND THE MEDIAN SCAN TAKES LONGER THAN THAT. Measured on
    // the last twelve `build_voice` jobs: 49, 91, 134, 199, 208, 266, 292, 340,
    // 373, 380, 538, 952 seconds — p50 279, p90 522. SEVEN OF TWELVE (58%)
    // crossed 220s, and ALL TWELVE completed successfully. Every one of the 53
    // non-failed voices in production is `ready` WITH a usable profile, 100%.
    //
    // ⚠️ SO THIS TIMEOUT WAS NOT REPORTING A FAILURE, IT WAS CAUSING ONE. On
    // expiry it stamps UNKNOWN and calls `onScanDead()`, which drops the
    // voiceId — while the job runs on, succeeds, and writes a profile nobody
    // ever collects. The creator is told "we could not read your account" about
    // an account we read fine. The four genuinely failed voices carry no profile
    // and a real error, so they are a different population and are unaffected.
    //
    // ⚖️ SET FROM THE MEASUREMENT WITH HEADROOM, NOT FROM A GUESS: 900s covers
    // eleven of the twelve and is ~1.7x the p90. The slowest observed scan was
    // 952s, so this still gives up on that one — a cap has to fall somewhere,
    // and it now falls beyond almost every real scan instead of beneath most of
    // them.
    //
    // ⚖️ AND A LONGER CAP IS CHEAP NOW IN A WAY IT WAS NOT BEFORE. The story
    // questions sit in this wait and the finished scan is parked until they are
    // answered, so the creator spends it writing rather than watching a spinner.
    //
    // ⚠️ A WALL CLOCK IS STILL THE WRONG INSTRUMENT AND THIS ONLY MOVES IT.
    // "Stuck" is a fact about the JOB, not about elapsed time, and `dna-poll`
    // already looks the job up — it could say whether one is still alive and let
    // this stop guessing. That is the real fix and it is an edge function, so it
    // needs the matrix lane; this one is `apps/web` and ships now, because 58%
    // is happening today.
    const startedAt = Date.now()
    const MAX_WAIT_MS = 900_000
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
            onFailed?.(scanFailure('VOICE_INCOMPLETE'))
          }
        } else if (res.status === 'failed') {
          if (timer.current) clearInterval(timer.current)
          // ⚠️ CLASSIFIED FROM A CAUSE CODE, NEVER GUESSED FROM THE MESSAGE.
          // `readScanFailure` recognises a known cause and falls back to UNKNOWN
          // for everything else — and UNKNOWN is worded as OURS. Pattern-matching
          // the server's prose for the word "private" would be exactly the guess
          // this taxonomy exists to stop.
          const f = readScanFailure((res as { cause?: unknown }).cause)
          setErr(f.message)
          onFailed?.(f)
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
          // imply one. SCAN_TIMED_OUT names it as ours and worth another try.
          const f = scanFailure('SCAN_TIMED_OUT')
          setErr(f.message)
          onScanDead()
          onFailed?.(f)
        }
      } catch (e) {
        // Transient, keep polling; surface only if it persists past the cap.
        console.warn('dna poll', e)
        if (Date.now() - startedAt > MAX_WAIT_MS && !stopped) {
          if (timer.current) clearInterval(timer.current)
          // We could not reach our OWN scanner. There is no ambiguity about
          // whose problem this is.
          const f = scanFailure('PLATFORM_ACCESS_FAILED')
          setErr(f.message)
          onScanDead()
          onFailed?.(f)
        }
      }
    }
    tick()
    timer.current = setInterval(tick, 4000)
    return () => {
      stopped = true
      if (timer.current) clearInterval(timer.current)
    }
  }, [draft.voiceId, onReady]) // eslint-disable-line react-hooks/exhaustive-deps -- onFailed/onScanDead are stable callbacks

  const set = (patch: Partial<OnboardingDraft>) => onDraftChange({ ...draft, ...patch })
  const shownSells = sellsAnswerWithLibrary(draft.commercialTies, library)
  const answers = profileAnswersOf(draft)
  const answered = [
    draft.workKind != null || draft.commercialTies.length > 0,
    draft.audienceSeg != null || draft.audienceKnowledge != null,
    depthDone,
  ]
  const TABS = [
    { short: 'About you', q: 'First, a little about you' },
    { short: 'Your audience', q: 'Who’s watching your videos?' },
    { short: 'Only you know', q: 'What do you keep having to explain to people, over and over?' },
  ]
  // Skip all on any step finishes the questions and the depth question both;
  // nothing is written for an unanswered question.
  const skipEverything = () => { setFinished(true); setDepthDone(true) }
  const next = () => { if (tab + 1 >= 2) setFinished(true); setTab(tab + 1) }
  const asking = !(questionsDone && depthDone)

  // Honest progress (owner decision): the scan reports only building / ready /
  // failed, so the first stage is active while it runs and all three are done
  // when it is ready. No post counts, no "noticed so far" until the backend
  // reports them.
  const STAGES: [string, string][] = [['Fetching your posts', 'In progress'], ['Reading captions and openings', 'Openings, endings, phrases'], ['Building your voice', 'Tone, pacing, what you push against']]
  const stageAt = readyProfile ? 3 : 0
  const stages = STAGES.map((x, i) => ({
    t: x[0], sub: i === stageAt ? x[1] : i < stageAt ? 'Done' : 'Waiting',
    c: i < stageAt ? '#65E5D8' : i === stageAt ? '#FF5B7B' : 'rgba(255,255,255,0.15)',
    fg: i <= stageAt ? '#F6F1E9' : '#6E675C', mark: i < stageAt ? '✓' : String(i + 1), on: i === stageAt,
  }))

  const QHead = ({ n, title, hint }: { n: number; title: string; hint?: string }) => (
    <div className="flex items-start gap-[11px]">
      <span className="mt-[1px] flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] bg-[rgba(255,179,71,0.14)] text-[12.5px] font-extrabold text-amber">{n}</span>
      <span className="flex flex-col gap-[3px]">
        <span className={`${wide ? 'text-[17px]' : 'text-[16px]'} font-[650] leading-[1.3] text-cream`}>{title}</span>
        {hint && <span className="text-[13px] leading-[1.45] text-label">{hint}</span>}
      </span>
    </div>
  )
  const Opt = ({ on, onClick, children, center, pad = 'px-3 py-[10px]', size = 'text-[13.5px]' }: { on: boolean; onClick: () => void; children: React.ReactNode; center?: boolean; pad?: string; size?: string }) => (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`min-h-[44px] cursor-pointer rounded-[12px] border leading-[1.25] transition-all duration-150 ${pad} ${size} ${center ? 'text-center' : 'text-left'}`}
      style={{ borderColor: on ? '#FF5B7B' : 'rgba(255,255,255,0.09)', background: on ? '#FF5B7B' : '#17171D', color: on ? '#07070A' : '#D8CFC2', fontWeight: on ? 600 : 500 }}>
      {children}
    </button>
  )
  const divider = 'flex flex-col gap-3 border-t border-white/[0.07] pt-5'
  /** The Reading board's option grid, fed by the same value lists and labels
   *  the rest of onboarding uses — one source of truth for what is offered. */
  function OptGrid<T extends string>({ values, label, chosen, onPick, cls, center, pad, size }: {
    values: readonly T[]; label: Record<T, string>; chosen: T | null | undefined; onPick: (v: T) => void
    cls: string; center?: boolean; pad?: string; size?: string
  }) {
    return (
      <div className={cls}>
        {values.map((v) => <Opt key={v} center={center} pad={pad} size={size} on={chosen === v} onClick={() => onPick(v)}>{label[v]}</Opt>)}
      </div>
    )
  }

  const about = (
    <div className="ob-pop flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <QHead n={1} title="What best describes what you do?" />
        <OptGrid cls="grid grid-cols-2 gap-2"
          values={ONBOARDING_WORK_KINDS} label={WORK_KIND_LABEL} chosen={draft.workKind}
          onPick={(k) => set({ workKind: draft.workKind === k ? null : k })} />
      </div>
      <div className={divider}>
        <QHead n={2} title="Do you sell or promote anything in your videos?" hint="A product, a service, a course, a cart. You add the details later in Brands & products." />
        <div className="grid grid-cols-2 gap-2">
          {ONBOARDING_SELLS_ANSWERS.map((a) => (
            <Opt key={a} center pad="px-3 py-3" size="text-[14.5px]" on={shownSells.answer === a}
              onClick={() => set({ commercialTies: shownSells.answer === a && !shownSells.fromLibrary ? [] : [...SELLS_ANSWER_TO_TIES[a]] })}>{SELLS_LABEL[a]}</Opt>
          ))}
        </div>
        {shownSells.reason && <p className="m-0 text-[12px] text-label">{shownSells.reason}</p>}
      </div>
      {asksScreenCapability(answers) && (
        <div className={`ob-pop ${divider}`}>
          <QHead n={3} title="Can you record your screen when Twin needs it?" hint="You picked software. Say no and we stop suggesting shots you can’t film." />
          <div className="grid grid-cols-3 gap-2">
            {CAPABILITY_ANSWERS.map((v) => (
              <Opt key={v} center pad="px-[6px] py-[9px]" on={draft.screenCapability === v} onClick={() => {
                const nx = draft.screenCapability === v ? null : v
                set({ screenCapability: nx, canRecordScreen: nx === 'yes' ? true : nx === 'no' ? false : null })
              }}>{CAPABILITY_LABEL[v]}</Opt>
            ))}
          </div>
        </div>
      )}
    </div>
  )
  const audience = (
    <div className="ob-pop flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <QHead n={1} title="Who do you mainly want to reach?" />
        <OptGrid cls="grid grid-cols-2 gap-2 lg:grid-cols-4" pad="px-[10px] py-2" size="text-[13px]"
          values={AUDIENCE_SEGMENTS} label={AUDIENCE_LABEL} chosen={draft.audienceSeg}
          onPick={(a) => set({ audienceSeg: draft.audienceSeg === a ? null : a })} />
      </div>
      <div className={divider}>
        <QHead n={2} title="How much do they already know?" hint="So Twin knows what to explain and what to skip." />
        <OptGrid cls="grid grid-cols-2 gap-2 lg:grid-cols-4" center pad="px-[6px] py-2" size="text-[13px]"
          values={AUDIENCE_KNOWLEDGE} label={KNOWLEDGE_LABEL} chosen={draft.audienceKnowledge}
          onPick={(k) => set({ audienceKnowledge: draft.audienceKnowledge === k ? null : k })} />
      </div>
    </div>
  )
  const footer = (
    <div className="mt-auto flex items-center gap-[10px] pt-2">
      {tab > 0 && <button type="button" onClick={() => setTab(tab - 1)} className="btn-outline">Back</button>}
      <span className="flex-grow" />
      <button type="button" onClick={skipEverything} className="min-h-11 cursor-pointer rounded-[10px] border-0 bg-transparent px-[10px] text-[13px] text-label">Skip all</button>
      <button type="button" onClick={next} className="btn-light !px-6">Next</button>
    </div>
  )
  const stepsRow = (
    <div className="flex items-center gap-[6px]">
      {TABS.map((t, i) => {
        const cur = i === tab
        const dot = cur ? 'linear-gradient(135deg,#FFB347,#FF5B7B)' : answered[i] ? '#65E5D8' : 'rgba(255,255,255,0.08)'
        const dfg = cur || answered[i] ? '#07070A' : '#8D8475'
        const mark = answered[i] && !cur ? '✓' : String(i + 1)
        return (
          <Fragment key={t.short}>
            {wide ? (
              <button type="button" onClick={() => setTab(i)} aria-current={cur ? 'step' : undefined}
                className="flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border-0 py-[5px] pl-[5px] pr-[11px] text-[13px] font-semibold"
                style={{ background: cur ? 'rgba(255,255,255,0.06)' : 'transparent', color: cur ? '#F6F1E9' : answered[i] ? '#8FEDE3' : '#6E675C' }}>
                <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-[12px] font-extrabold" style={{ background: dot, color: dfg }}>{mark}</span>{t.short}
              </button>
            ) : (
              <button type="button" onClick={() => setTab(i)} aria-label={t.short} aria-current={cur ? 'step' : undefined}
                className="h-[26px] w-[26px] cursor-pointer rounded-full border-0 p-0 text-[12px] font-extrabold [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:bg-clip-content [@media(pointer:coarse)]:p-[9px]"
                style={{ background: dot, color: dfg }}>{mark}</button>
            )}
            {i < TABS.length - 1 && <span className={`h-px ${wide ? 'w-[22px] bg-white/[0.12]' : 'w-[18px] bg-white/[0.14]'}`} />}
          </Fragment>
        )
      })}
      {!wide && <span className="ml-[6px] text-[13.5px] font-semibold">{TABS[tab].short}</span>}
    </div>
  )
  const card = (
    <div className={`relative flex flex-col gap-[18px] ${wide ? 'min-h-[560px] rounded-[20.5px] bg-[#131318] px-7 py-[26px]' : 'flex-grow'}`}>
      {asking && (
        <div className="flex flex-grow flex-col gap-5">
          <div className={`flex flex-col ${wide ? 'gap-3' : 'gap-[10px]'}`}>
            <span className="flex items-baseline justify-between">
              <span className="text-[12px] font-bold tracking-[.12em] text-amber">{wide ? 'WHILE WE READ · 3 QUICK STEPS' : 'WHILE WE READ'}</span>
              <span className="text-[12px] text-stone-dim">{wide ? 'all optional' : `Step ${tab + 1} of 3 · all optional`}</span>
            </span>
            {stepsRow}
          </div>
          <h2 key={tab} className={`ob-pop m-0 mt-[2px] font-bold leading-[1.2] tracking-[-0.02em] ${wide ? 'text-[26px]' : 'text-[22px]'}`}>{TABS[tab].q}</h2>
          {tab === 0 && about}
          {tab === 1 && audience}
          {tab < 2 && footer}
          {/* ⚖️ ONE STORYINTERVIEW, THE DEPTH QUESTION, NO NICHE: there is no
              scan yet on this screen, so the plain wording is the honest one. */}
          {tab === 2 && (
            <StoryInterview
              voiceId={draft.voiceId ?? null}
              onDone={() => { setFinished(true); setDepthDone(true) }}
              questionIds={DEPTH_QUESTION_IDS}
              look="reading"
              onBack={() => setTab(1)}
            />
          )}
        </div>
      )}
      {!asking && !canHandOver && (
        <div className="ob-pop flex flex-grow flex-col items-center justify-center gap-[14px] text-center" aria-live="polite">
          <span className="ob-dots inline-flex gap-[5px]" aria-hidden="true"><span /><span /><span /></span>
          <h2 className="m-0 text-[24px] font-bold">Thanks. Finishing the scan…</h2>
          <p className="m-0 max-w-[380px] text-[14.5px] leading-[1.5] text-sand-muted">Then three things only you know, and your voice.</p>
        </div>
      )}
      {canHandOver && (
        <div className="ob-pop flex flex-grow flex-col items-center justify-center gap-[14px] text-center" aria-live="polite">
          <span className="ob-ringp flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#FFB347,#FF5B7B)] text-[26px] font-extrabold text-ink">✓</span>
          <h2 className="m-0 text-[26px] font-bold">Twin has your voice.</h2>
          <p className="m-0 max-w-[400px] text-[14.5px] leading-[1.5] text-sand-muted">Twin read your posts. Now three things only you can tell us, then your voice.</p>
          <button type="button" onClick={() => readyProfile && onReady(readyProfile)} className="ob-cta ob-gbtn cursor-pointer rounded-[13px] border-0 px-[26px] py-[14px] text-[15px] font-bold text-ink">Continue →</button>
        </div>
      )}
    </div>
  )

  if (!wide) {
    return (
      <>
        <div className="mx-5 mt-4 flex flex-col gap-[9px] rounded-[14px] border border-white/[0.07] bg-card px-[14px] py-3" aria-live="polite">
          <span className="flex justify-between text-[13px]"><b>Studying your recent posts…</b><span className="text-label">{readyProfile ? 'Done' : ''}</span></span>
          <div className="h-1 overflow-hidden rounded-[9px] bg-white/[0.07]">
            <div className={`ob-gbtn h-full ${readyProfile ? 'w-full' : 'ob-indet w-full opacity-40'}`} />
          </div>
          <span className="flex flex-wrap gap-3">
            {stages.map((g) => (
              <span key={g.t} className="flex items-center gap-[5px] text-[12px]" style={{ color: g.fg }}>
                <span className="flex h-[14px] w-[14px] items-center justify-center rounded-full text-[9px] font-black text-ink" style={{ background: g.c }}>{g.mark}</span>{g.sub}
              </span>
            ))}
          </span>
        </div>
        <section className="mx-5 mb-6 mt-[14px] flex flex-grow flex-col">{card}</section>
      </>
    )
  }

  return (
    <div className="flex flex-grow flex-wrap justify-center gap-7 px-6 pt-10 lg:px-20">
      <section className="pin d2 flex w-full max-w-[440px] flex-col gap-[14px]">
        <h1 className="m-0 text-[30px] font-bold leading-[1.1] tracking-[-0.03em]">Studying your recent posts…</h1>
        <p className="m-0 text-[14.5px] text-sand-muted">Picking up how you open, your pace and your favourite phrases.</p>
        <div className="flex flex-col gap-[14px] rounded-[18px] border border-white/[0.07] bg-card p-[18px]" aria-live="polite">
          <div className="h-[5px] overflow-hidden rounded-[9px] bg-white/[0.07]">
            <div className={`ob-gbtn h-full transition-[width] duration-300 ${readyProfile ? 'w-full' : 'ob-indet w-full opacity-40'}`} />
          </div>
          {stages.map((g) => (
            <div key={g.t} className="flex items-center gap-3">
              <span className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold text-ink ${g.on && !readyProfile ? 'ob-ringp' : ''}`} style={{ background: g.c }}>{g.mark}</span>
              <span className="flex flex-col gap-[1px]">
                <span className="text-[14.5px] font-semibold" style={{ color: g.fg }}>{g.t}</span>
                <span className="text-[12.5px] text-label">{g.sub}</span>
              </span>
            </div>
          ))}
          <span className="text-[12px] text-stone-dim">Steps move when Twin actually finishes them.</span>
        </div>
      </section>
      <section className="pin d3 relative w-full max-w-[640px] self-start overflow-clip rounded-[22px] p-[1.5px]">
        <div aria-hidden="true" className="ob-spinb absolute left-1/2 top-1/2 -ml-[700px] -mt-[700px] h-[1400px] w-[1400px] bg-[conic-gradient(from_0deg,rgba(255,179,71,0),rgba(255,179,71,0.7),rgba(255,91,123,0.75),rgba(101,229,216,0.6),rgba(255,179,71,0)_40%)]" />
        {card}
      </section>
    </div>
  )
}

// --- Step 3: confirm / edit the voice in one tap ---------------------------
// ⚖️ EXPORTED FOR ONE REASON: the eight-blank-fields defect is only visible in a
// RENDER, because the bug was that a prop arriving after mount never reached the
// inputs. A pure helper could not have caught it. Same reason `ProfileQuestion`
// is exported above.
/**
 * THE THREE QUESTIONS NO SCAN CAN ANSWER, ASKED ONCE IT HAS.
 *
 * ⚠⚠ THEY USED TO RENDER DURING THE SCAN AND THAT IS WHY THEY READ AS GENERIC.
 * At that moment there is no niche, no `sells` and no follower count, so every
 * creator met the same three sentences — including "what does almost everyone in
 * your NICHE believe", asked before her niche had been read. The wording table
 * existed and could not be used, because its inputs arrive after the screen.
 *
 * ⚖️ THE INTENTS DO NOT CHANGE AND NEITHER DO THE IDS. A costly lesson, a
 * specific result, a contrarian belief — `expensive_lesson`, `best_result`,
 * `contrarian`. Only the words change, because the ids are what "already
 * answered" and "already skipped" are keyed on.
 *
 * ⚠️ AND IT NEVER BLOCKS ON THE LOOKUP. `sells` is read in the background; until
 * it lands, or if it fails, the plain bank renders. No spinner, no error, no
 * empty screen — a creator who is ready to type must never wait on a lookup that
 * only changes the wording.
 */
function StoryStep({
  draft, onDone,
}: {
  draft: OnboardingDraft
  onDone: () => void
}) {
  const [sells, setSells] = useState<SellsKind | 'none' | null>(null)
  const [band, setBand] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void loadSellsFacet().then((v) => { if (alive) setSells(v) })
    void loadVoiceStageBand(draft.voiceId ?? null).then((v) => { if (alive) setBand(v) })
    return () => { alive = false }
  }, [draft.voiceId])

  const wide = useWide()
  const worded = draft.profile?.sub_niche || draft.profile?.niche || ''
  return (
    <div className={`flex flex-grow justify-center ${wide ? 'px-6 pb-[50px] pt-10' : 'px-5 pb-8 pt-6'}`}>
    <section className="flex w-full max-w-[760px] flex-col gap-[22px]">
      <div className="pin d2 flex flex-col gap-[10px]">
        {/* Stories board copy. The set is the opening three by default. */}
        <span className="text-[12px] font-bold tracking-[.12em] text-teal-soft">STEP 3 · THREE THINGS ONLY YOU KNOW</span>
        <h1 className={`m-0 font-bold leading-[1.08] tracking-[-0.03em] ${wide ? 'text-[38px]' : 'text-[30px]'}`}>The things your videos <span className="ob-grad">can't tell us.</span></h1>
        <p className="m-0 text-[15.5px] leading-[1.5] text-sand-muted">
          We read your account. These are the parts only you know, and they’re what give a script something real to say.
          {worded && <> Worded for <b className="text-cream">{worded}</b>, from your scan.</>}
        </p>
      </div>
      <StoryInterview
        voiceId={draft.voiceId ?? null}
        onDone={onDone}
        niche={draft.profile?.niche ?? null}
        sells={sells}
        stageBand={band}
        /* ⚠️ THE PROFILE WAS ALREADY HERE AND ONLY `niche` WAS READ OUT OF IT.
           `sub_niche` sits in the same object — populated on 52 of 57 voices —
           and is the difference between "everyone in your industry" and
           "everyone in custom Bible rebinding". Extracted, available, and one
           caller reading a single field of it: the defect class this codebase
           keeps closing. */
        subNiche={draft.profile?.sub_niche ?? null}
        look="stories"
      />
    </section>
    </div>
  )
}

export function ConfirmStep({
  draft,
  onDraftChange,
  onDone,
  onBack,
  onPatch,
}: {
  draft: OnboardingDraft
  onDraftChange: (
    profile: VoiceProfile, audience: string, product: string, goal: string,
    brief: Pick<OnboardingDraft, 'workKind' | 'workKindOther' | 'forbiddenClaims' | 'q4' | 'ownsEntity' | 'offerFromCreator' | 'canRecordScreen' | 'canFilmObjects'>,
  ) => void
  onDone: () => Promise<void>
  onBack: () => void
  /** Writes a whole draft. Used by the content-goal and product-capability
   *  questions, which moved here from Reading. */
  onPatch?: (next: OnboardingDraft) => void
}) {
  const wide = useWide()
  const [hookIdx, setHookIdx] = useState(0)
  const [hookK, setHookK] = useState(0)
  const [prodConfirmed, setProdConfirmed] = useState(false)
  const [vp, setVp] = useState<VoiceProfile | null>(draft.profile)
  // ⚠️⚠️ EIGHT FIELDS RENDERED BLANK WHILE THEIR VALUES WERE PRINTED ONE LINE
  // ABOVE THEM. Reported live on a creator's account: `WHO YOU'RE TALKING TO`,
  // `WHAT IS YOUR OFFER CALLED`, `NICHE`, `TONE`, `PACING`, `HOOK STYLE` and
  // `WHAT YOU PUSH AGAINST` were all empty, while the summary directly above
  // read "Fitness · Empathetic · 7 signature phrases · 4 recurring CTAs".
  //
  // ⚠️ THE CAUSE IS TWO SOURCES, ONE OF THEM FROZEN. `voiceIsEmpty` and
  // `voiceDigest` read `draft.profile` through a `useMemo` dependency, so they
  // update when the scan lands. The inputs read `vp`, which `useState`
  // CAPTURED ONCE AT MOUNT. A profile that arrives — or is replaced by a
  // fuller one — after this component mounted updates the summary and never
  // reaches the fields under it.
  //
  // ⚖️ MEASURED, NOT ASSUMED, BECAUSE "MISSING EXTRACTION" AND "MISSING
  // RENDER" NEED OPPOSITE FIXES. Across all 52 stored voices: niche 48,
  // tone 48, pacing 48, hook_style 48, enemy 46, audience 46, offer 46,
  // pov 46. On her row every one of the eight is populated, and `enemy` reads
  // "The fear-mongering myth that pregnant women are too fragile to lift
  // weights". NOTHING NEEDED EXTRACTING OR DERIVING. It was all there.
  //
  // ⚖️ THIS IS THE REACT "ADJUST STATE WHEN A PROP CHANGES" PATTERN, ON
  // PURPOSE, AND NOT A `useEffect`. An effect would paint the blank fields
  // first and correct them on a second pass, which is the flicker this screen
  // does not need. Keyed on object IDENTITY so a creator's edits are never
  // clobbered: `setVp` replaces the object, so `vp !== draft.profile`
  // thereafter and this branch stops firing until a genuinely new profile
  // arrives.
  const [seenProfile, setSeenProfile] = useState<VoiceProfile | null>(draft.profile)
  if (draft.profile !== seenProfile) {
    setSeenProfile(draft.profile)
    if (draft.profile) setVp(draft.profile)
  }
  // Prefill "who you're talking to" and "what you sell" from what the scan ACTUALLY
  // inferred (audience / offer) — the DNA extracts these, so they shouldn't show
  // empty. "Your goal" is deliberately NOT prefilled: a creator's business goal
  // isn't something we can read from their posts, so we leave it blank and let them
  // state it rather than fill it with a guess. All stay editable.
  //
  // ⚠️ AND THESE TWO READ A THIRD SOURCE AGAIN — the draft's own strings, not
  // the profile — which is why they were blank even when the profile HAD
  // arrived. The comment above has claimed since it was written that they are
  // "prefilled from what the scan ACTUALLY inferred"; they were not, because
  // nothing read `profile.audience` or `profile.offer`. `types.ts:38` records
  // the same gap from the other end: "produced by the DNA synthesis all along
  // but weren't typed, so onboarding couldn't prefill them." The typing landed
  // and the reader never did.
  //
  // ⚖️ THE DRAFT STILL WINS. A saved answer is a decision, and re-suggesting
  // over it would replace what the creator told us with what we inferred —
  // the same rule `claimsGuess` below already states.
  // ⚠️ READ, NEVER ASKED HERE ANY MORE. Screen 2's chips are the question; this
  // keeps whatever the scan or a previous answer produced so the save shape and
  // every existing account are untouched.
  const audience = draft.audience || draft.profile?.audience || ''
  // ⚖️ THE OFFER LIVES IN THE PRODUCT LIBRARY NOW. Carried through unchanged so
  // an account that already has one does not lose it on a re-save.
  const product = draft.product || draft.profile?.offer || ''
  // ⚖️ `goal` STAYS BLANK AND THAT IS STILL DELIBERATE. A business goal is not
  // readable from someone's posts, and the screen asks rather than guesses.
  // ⚠️ `goal` (the free-text one) IS NO LONGER ASKED — zero of 53 accounts ever
  // filled it. Kept so the draft shape and any stored answer survive a re-save.
  const goal = draft.goal
  // §8a.1's brief. `workKind` decides whether the claims question appears at
  // all; `forbiddenClaims` is the answer no model can infer.
  // From screen 2. Still read here because it decides whether the claims
  // question is asked at all.
  const workKind: BriefWorkKind | null = draft.workKind
  const workKindOther: string = draft.workKindOther ?? ''
  // ⚠️ THE SCAN ALREADY FOUND HIS RESTRICTION AND FILED IT AS A CTA. Measured on
  // a real Senior MSK Physiotherapist: "Always discuss this with your
  // physiotherapist or surgeon." was captured as a recurring CTA while THIS
  // field sat empty, asking him to invent restrictions from scratch. The worker
  // now splits disclaimers out of `recurring_ctas` and carries them here.
  //
  // ⚖️ A GUESS, AND NEVER OVER THE CREATOR'S OWN ANSWER. Prefilled only when the
  // draft holds nothing: a saved answer is a decision, and re-suggesting over it
  // would silently replace what they told us with what we inferred.
  const foundDisclaimers = Array.isArray((vp as { claim_disclaimers?: unknown })?.claim_disclaimers)
    ? ((vp as { claim_disclaimers?: unknown[] }).claim_disclaimers ?? [])
        .filter((d): d is string => typeof d === 'string' && d.trim() !== '')
    : []
  const claimsGuess = foundDisclaimers.join(' · ')
  const [forbiddenClaims, setForbiddenClaims] = useState(draft.forbiddenClaims ?? claimsGuess)
  // ⚖️ THE CHIPS AND THE BOX ARE ONE STORED STRING. `forbidden_claims` is read
  // downstream as prose and nothing about that changes here — joining on ' · '
  // is the separator `claimsGuess` above already uses, so a chip answer and a
  // scan-found disclaimer arrive in the same shape and no reader learns a new
  // one. Splitting them into a second column would fork one fact in two.
  const [claimChips, setClaimChips] = useState<string[]>([])
  // ⚠️ ONE VALUE, OR THE CHIPS ARE DECORATION. The tapped restrictions and
  // anything typed underneath are joined into the single `forbidden_claims`
  // string every downstream reader already expects. Saving only the box would
  // have made a tapped chip look recorded and reach no script — the defect this
  // codebase keeps finding, in a control that visibly responds to the tap.
  const claimsValue = [...claimChips, forbiddenClaims.trim()]
    .map((x) => x.trim()).filter(Boolean).join(' · ') || null
  // True only while the creator is still looking at OUR words, so the note
  // disappears the moment they touch the field.
  const [claimsAreGuessed, setClaimsAreGuessed] = useState(
    (draft.forbiddenClaims ?? '') === '' && claimsGuess !== '')
  // ⚠️ STILL READ, NO LONGER SET HERE. The question that wrote it left this
  // screen; the value survives for accounts that answered before, and stays
  // null for everyone else — the "unanswered" state preScriptBrief documents.
  const [q4] = useState<Q4Answer | null>(draft.q4 ?? null)
  // WHETHER THE CREATOR KEPT THE ENTITY Q3 MINTED. Defaults to keeping it when
  // Q3 was informative — that is what "pre-filled" means — and the screen gives
  // a one-tap way out, which is what "correctable" means. A pre-fill with no
  // exit is just a decision we made and blamed on them.
  const [ownsEntity, setOwnsEntity] = useState<boolean>(draft.ownsEntity ?? true)
  // ⚠️ A GUESSED LIST IS SEVERAL PRODUCTS. "bandanas, collars, bows, and mystery
  // packs" could only be accepted as one entity or denied. Null = kept as one.
  const [splitItems, setSplitItems] = useState<OfferPiece[] | null>(null)
  const pieces = offerPieces(product, draft.profile?.offer, draft.profile?.offer_items)
  // The offer arrives PRE-FILLED FROM THE SCAN — which is the defect §8a names,
  // not a feature. Tracking whether the creator changed it is what separates
  // "they told us" from "the model guessed and nobody corrected it", and only
  // the first may decide a call to action.
  // ⚠️ STILL READ, AND NOW ONLY EVER FALSE FOR A NEW SIGNUP. It is what keeps a
  // GUESSED offer out of every script (`offer: offerTouched ? product : null`),
  // and accounts that confirmed an offer before it moved to the Product Library
  // keep theirs. Removing it would promote every old guess into a live CTA.
  const offerTouched: boolean = draft.offerFromCreator
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
  // ⚠️ READS `vp`, THE SAME OBJECT THE FIELDS RENDER — not `draft.profile`.
  // Two sources for one screen is how the summary once showed data over six
  // blank boxes; one source means they cannot disagree, edits included.
  const voiceDigest = useMemo(() => {
    const p = vp
    if (!p) return 'What the scan heard.'
    const bits: string[] = []
    if (typeof p.niche === 'string' && p.niche.trim()) bits.push(p.niche.trim())
    if (typeof p.tone === 'string' && p.tone.trim()) bits.push(p.tone.trim().split(',')[0].trim())
    const words = Array.isArray(p.vocabulary) ? p.vocabulary.length : 0
    const ctas = Array.isArray(p.recurring_ctas) ? p.recurring_ctas.length : 0
    if (words) bits.push(`${words} signature ${words === 1 ? 'phrase' : 'phrases'}`)
    if (ctas) bits.push(`${ctas} recurring ${ctas === 1 ? 'ending' : 'endings'}`)
    return bits.length ? `${bits.join(' · ')}. Tap Show to change anything.` : 'What the scan heard.'
  }, [vp])

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

  // ⚖️ READ, NEVER SET, ON THIS SCREEN. The value still travels — a creator who
  // answered before this change keeps their answer, and the Product Library
  // writes it per product — but nothing here asks for it any more.
  // Read live from the draft: the product-capability question below writes
  // it through `onPatch`, and a copy captured at mount would overwrite that.
  const canRecordScreen: boolean | null = draft.canRecordScreen
  const canFilmObjects: boolean | null = draft.canFilmObjects
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
        forbiddenClaims: claimsValue, q4, offerFromCreator: offerTouched,
        // Only meaningful where Q3 minted something. Where it did not, the
        // creator was never shown the block and has no opinion to record —
        // which is the null this three-state field exists to keep.
        ownsEntity: mintsOwnedEntity(workKind) ? ownsEntity : null,
        canRecordScreen, canFilmObjects,
      })
    }
  }, [vp, audience, product, goal, workKind, workKindOther, claimsValue, q4, ownsEntity, offerTouched, canRecordScreen, canFilmObjects, onDraftChange])

  // Types the opening line like the board (30ms, two characters a tick).
  const liveHooks = (vp?.sample_hooks ?? []).filter((h) => typeof h === 'string' && h.trim() !== '')
  const hookLen = liveHooks.length ? liveHooks[hookIdx % liveHooks.length].length : 0
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setHookK(hookLen); return }
    if (hookK >= hookLen) return
    const t = window.setTimeout(() => setHookK((k) => k + 2), 30)
    return () => window.clearTimeout(t)
  }, [hookK, hookLen])

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

  // ⚠️ `{ ...null }` IS `{}`, AND THAT WAS A SILENT DATA-LOSS PATH. With `vp`
  // null — which is exactly the state the blank fields above were rendering —
  // typing into any one field produced a profile carrying THAT KEY ALONE and
  // no others, and it was the object the confirm step then saved. Starting
  // from a complete empty profile keeps every other field present and empty
  // instead of absent.
  const setField = (k: keyof VoiceProfile, v: string) =>
    setVp({ ...(vp ?? emptyVoiceProfile()), [k]: v })
  const setList = (k: keyof VoiceProfile, v: string[]) =>
    setVp({ ...(vp ?? emptyVoiceProfile()), [k]: v })

  const confirm = async () => {
    setErr(null)
    setBusy(true)
    try {
      // Plan v6.6 §32: a hand-typed voice also stores her typed answers, labelled
      // manual, so the server can build a voice card with no model call. Behind
      // VITE_MANUAL_VOICE_CARD (default off); a later scan replaces it.
      await saveVoiceProfile(draft.voiceId, withManualVoiceAnswers(vp, draft, audience, product))
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
        // ⚠️⚠️ THE ANSWER THAT USED TO DIE WITH THE TAB. The card above has
        // asked "Is this what your people are stuck on?" since #766 and written
        // the reply to `sessionStorage` only — this call named every other draft
        // field and not these two, so every confirmation was discarded on close.
        //
        // ⚖️ SAME RULE AS `offer` ONE LINE UP, and for the same reason: a value
        // the creator did not affirm must never be stored as though she had.
        // "Not quite" sets the draft field to null, `sanitizeBriefForWrite`
        // drops nulls, and a refusal therefore stays ABSENT rather than becoming
        // a stored empty answer.
        confirmedAudiencePain: draft.confirmedAudiencePain ?? null,
        confirmedDreamOutcome: draft.confirmedDreamOutcome ?? null,
        contentPillars: draft.contentPillars?.length ? draft.contentPillars : null,
        background: draft.background?.trim() || null,
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
          // ⚖️ FREE CONTENT IS NOT MINTED. Tips she posts are not a thing she
          // sells; only products and services become entities.
          const items = splitItems && splitItems.length > 0
            ? (splitItems.filter((it) => it.kind !== 'content').length > 0 ? splitItems.filter((it) => it.kind !== 'content') : null)
            : null
          const baseDraft = mintFromWorkKind(workKind, {
              // ⚠️ THE SAME GATE THE BRIEF ALREADY HONOURS, AND THE ENTITY DID
              // NOT. `offer` above is written as `offerTouched ? product : null`
              // because this screen promises "we will not use it until you edit
              // it". The entity mint took `product` unconditionally and wrote it
              // into `product_entities.name` — so an untouched guess became a
              // stored product with a sentence for a name, observed live as
              // "Fresh artisan sourdough loaves ... via link in bio" on a
              // creator with no bio link. One promise, two consumers, one of
              // which kept it.
              // A split names each entity by its own item — she chose the list.
              name: items ? items[0].name : (product.trim() || null),
              offerConfirmed: items ? true : offerTouched,
              flags: { canRecordScreen, canFilmObjects },
              // ⚠️ THE FINER ANSWER, WHICH REACHED NOTHING UNTIL NOW. The scan
              // step asks "What kind of thing do you sell?" and the entity was
              // minted from workKind alone -- so a creator selling a course
              // said so and was typed SAAS. The type decides the show moments,
              // so this was not cosmetic.
              ownProductKind: draft.ownProductKind ?? null,
              ownServiceKind: draft.ownServiceKind ?? null,
            })
          const minted = await saveMintedEntity(
            draft.userId,
            draft.voiceId,
            baseDraft && items && items[0].kind === 'service' ? { ...baseDraft, type: 'SERVICE' } : baseDraft,
          )
          // ⚖️ ONE ENTRY PER REMAINING ITEM, same kind and relationship as the
          // mint. Personal use stays NOT_CONFIRMED — splitting asserts ownership
          // of each, nothing more; the Product Library asks the rest.
          if (items && minted) {
            for (const it of items.slice(1)) {
              // Each piece keeps its own kind: advice is a SERVICE, a thing is
              // the mint's product type (never a service type).
              const type = it.kind === 'service' ? 'SERVICE'
                : (minted.type === 'SERVICE' || minted.type === 'COURSE' ? 'PHYSICAL_PRODUCT' : minted.type)
              await claimProductEntity(draft.userId, draft.voiceId, {
                relationship: minted.relationship, personalUse: 'NOT_CONFIRMED',
                type, name: it.name, flags: { canRecordScreen, canFilmObjects },
              })
            }
          }
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

  // Meet / MMeet boards. Desktop column 880, phone 20px gutters.
  const hooks = (vp.sample_hooks ?? []).filter((h) => typeof h === 'string' && h.trim() !== '')
  const hook = hooks.length ? hooks[hookIdx % hooks.length] : ''
  const hook2 = hooks.length > 1 ? hooks[(hookIdx + 1) % hooks.length] : ''
  const offerName = product.trim() || 'your offer'
  const sellable = (splitItems ?? []).filter((it) => it.kind !== 'content').length
  const goalInferred = goalFromCtas(draft.profile?.recurring_ctas)
  const goalChosen = !!goalInferred && draft.contentGoals.includes(goalInferred.goal)
  const goalDeclined = draft.contentGoals.length === 0 && draft.contentGoalsTouched === true
  const showProductCap = asksProductCapability(profileAnswersOf(draft))
  const patch = (p: Partial<OnboardingDraft>) => onPatch?.({ ...draft, ...p })
  const plainRows: Array<[string, string | undefined]> = [
    ['Niche', vp.niche], ['Tone', vp.tone], ['Pacing', vp.pacing],
    ['Opening style', vp.hook_style], ['What you push against', vp.enemy],
  ]
  const sumFields: Array<[string, 'niche' | 'tone' | 'pacing' | 'hook_style']> = [
    ['Niche', 'niche'], ['Tone', 'tone'], ['Pacing', 'pacing'], ['Opening style', 'hook_style'],
  ]
  const tagGroups1: Array<[string, keyof VoiceProfile]> = [
    ['Signature words', 'vocabulary'], ['Recurring endings', 'recurring_ctas'], ['Do', 'dos'], ['Don’t', 'donts'],
  ]
  const tagGroups2: Array<[string, keyof VoiceProfile]> = [
    ['Your point of view', 'pov'], ['Openings you use', 'hook_patterns'], ['Your video formats', 'formats'],
  ]
  const pad = wide ? 'px-5 py-[18px]' : 'p-[14px]'
  const smallBtn = 'min-h-11 !px-[14px] !py-[9px] !text-[13.5px] md:min-h-0'
  const linkBtn = 'cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-[13px] [@media(pointer:coarse)]:min-h-11'
  const cta = (
    <button
      type="button"
      onClick={() => void confirm()}
      disabled={busy}
      className={cn(
        'ob-cta ob-gbtn inline-flex cursor-pointer items-center justify-center gap-2 border-0 font-[inherit] font-bold text-ink [touch-action:manipulation] disabled:opacity-70',
        wide ? 'rounded-[14px] px-7 py-[15px] text-[16px] shadow-[0_14px_36px_-14px_rgba(255,91,123,0.8)]' : 'flex-grow rounded-[14px] p-[15px] text-[15.5px]',
      )}
    >
      {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <>This is me, enter the studio →</>}
    </button>
  )

  return (
    <div className={cn('flex flex-grow flex-col items-center leading-[normal]', wide ? 'px-6 pb-[60px] pt-9' : 'pt-5')}>
    <div className={cn('flex w-full flex-col', wide ? 'max-w-[880px] gap-[30px]' : 'gap-5 px-5')}>
      <header className="pin d2 flex flex-col gap-[14px]">
        <span className="flex items-center gap-2 text-[13.5px] font-semibold text-teal-soft">
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[22px] bg-teal text-[12px] font-black text-ink" aria-hidden="true">✓</span>
          This is your voice · tweak anything
        </span>
        <h1 className={cn('m-0 font-bold leading-[1.15] tracking-[-0.03em]', wide ? 'text-[36px]' : 'text-[25px]')}>
          {vp.summary || 'Here’s how you sound'}
        </h1>
        {hook && (
          <div className="relative overflow-hidden rounded-[16px] p-[1.5px]">
            <div aria-hidden="true" className="ob-spinb absolute left-1/2 top-1/2 -ml-[700px] -mt-[700px] h-[1400px] w-[1400px] bg-[conic-gradient(from_0deg,rgba(255,179,71,0),rgba(255,179,71,0.9),rgba(255,91,123,0.8),rgba(255,179,71,0)_35%)] [animation-duration:7s]" />
            <div className={cn('relative flex flex-col gap-2 rounded-[14.5px] bg-[#15121A]', wide ? 'px-5 py-[18px]' : 'p-[14px]')}>
              <span className="flex items-center justify-between">
                <span className="text-[11.5px] font-bold tracking-[.12em] text-amber">AN OPENING I’D WRITE AS YOU</span>
                {hooks.length > 1 && (
                  <button type="button" onClick={() => { setHookIdx((i) => i + 1); setHookK(0) }}
                    className="cursor-pointer rounded-full border border-white/[0.12] bg-transparent px-[10px] py-[5px] font-[inherit] text-[12px] font-semibold text-cream [@media(pointer:coarse)]:min-h-11 [touch-action:manipulation]">
                    ↻ Another
                  </button>
                )}
              </span>
              <p className={cn('m-0 font-semibold leading-[1.4]', wide ? 'min-h-[34px] text-[21px]' : 'min-h-[60px] text-[17px]')}>
                “{hook.slice(0, hookK)}<span className="ob-caret" aria-hidden="true" />”
                <span className="sr-only">{hook}</span>
              </p>
              {hook2 && <p className="m-0 text-[13.5px] leading-[1.45] text-label">or: “{hook2}”</p>}
            </div>
          </div>
        )}
      </header>

      <section className="pin d3 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-[20px] font-bold">What Twin needs from you</h2>
          <p className="m-0 text-[14px] text-sand-muted">No scan can read these, and each one changes what your scripts say.</p>
        </div>

        {mintsOwnedEntity(workKind) && (
          <div className={cn('flex flex-col gap-3 rounded-[18px] border border-white/[0.07] bg-[#111115]', pad)}>
            <span className="flex items-center gap-[10px]">
              <span className="text-[15.5px] font-semibold">Your own product</span>
              {ownsEntity && !prodConfirmed && splitItems === null && (
                <span className="rounded-full bg-[rgba(255,179,71,.14)] px-2 py-[2px] text-[12px] font-bold tracking-[.05em] text-amber">FROM WHAT YOU DO</span>
              )}
            </span>
            {ownsEntity && prodConfirmed && (
              <span className="ob-pop text-[14px] text-teal-soft">
                ✓ {splitItems ? `${sellable} ${sellable === 1 ? 'item' : 'items'}` : offerName} {splitItems && sellable !== 1 ? 'are' : 'is'} yours. You’ll find {splitItems && sellable !== 1 ? 'them' : 'it'} in Brands &amp; products.{' '}
                <button type="button" onClick={() => setProdConfirmed(false)} className={cn(linkBtn, 'text-label')}>Undo</button>
              </span>
            )}
            {!ownsEntity && (
              <span className="ob-pop text-[14px] text-sand-muted">
                No product of your own, then. Scripts won’t speak for one.{' '}
                <button type="button" onClick={() => setOwnsEntity(true)} className={cn(linkBtn, 'text-coral-soft')}>Actually, I do own one</button>
              </span>
            )}
            {ownsEntity && !prodConfirmed && splitItems === null && (
              <div className="flex flex-col gap-3">
                <span className="flex flex-col gap-[3px]">
                  <span className="text-[15px] leading-[1.5] text-sand">We’ll treat <b className="text-cream">{offerName}</b> as your own {ENTITY_TYPE_LABEL[mintedType]}.</span>
                  <span className="text-[13px] text-label">So a script may speak for it, and say what it costs.</span>
                </span>
                <span className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setProdConfirmed(true)} className={cn('btn-board-light', smallBtn)}>Yes, that’s mine</button>
                  {pieces.length >= 2 && (
                    <button type="button" onClick={() => setSplitItems(pieces)} className={cn('btn-board-ghost', smallBtn)}>
                      {pieces.some((p) => p.kind !== 'product') ? 'These are separate things' : 'These are separate products'}
                    </button>
                  )}
                  <button type="button" onClick={() => setOwnsEntity(false)} className={cn('btn-board-ghost', smallBtn)}>That’s not right, I don’t own one</button>
                </span>
              </div>
            )}
            {ownsEntity && !prodConfirmed && splitItems !== null && (
              <div className="ob-pop flex flex-col gap-[10px]">
                <span className="text-[13.5px] leading-[1.45] text-sand-muted">We’ll add each one as its own item. Free content is noted, not added as something you sell.</span>
                <div className="flex flex-wrap gap-[7px]">
                  {splitItems.map((it) => (
                    <span key={it.name} className="ob-pop inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] py-[7px] pl-3 pr-2 text-[13.5px]">
                      {it.name} <span className="text-label">· {OFFER_KIND_LABEL[it.kind]}</span>
                      <button type="button" aria-label={`Remove ${it.name}`}
                        className="h-[22px] w-[22px] cursor-pointer rounded-full border-0 bg-white/[0.07] font-[inherit] text-sand-muted"
                        onClick={() => setSplitItems((prev) => {
                          const next = (prev ?? []).filter((x) => x.name !== it.name)
                          return next.length > 0 ? next : null
                        })}>×</button>
                    </span>
                  ))}
                </div>
                <span className="flex items-center gap-[10px]">
                  <button type="button" onClick={() => setProdConfirmed(true)} className={cn('btn-board-light', smallBtn)}>
                    Add {sellable} as separate {sellable === 1 ? 'item' : 'items'}
                  </button>
                  <button type="button" onClick={() => setSplitItems(null)} className={cn(linkBtn, 'text-label')}>Keep it as one</button>
                </span>
              </div>
            )}
          </div>
        )}

        {asksForbiddenClaims(workKind) && (
          <div className={cn('flex flex-col gap-3 rounded-[18px] border border-white/[0.07] bg-[#111115]', pad)}>
            <span className="text-[15.5px] font-semibold">Is there anything you’re not allowed to claim?</span>
            <div className={cn('grid gap-[7px]', wide ? 'grid-cols-2' : 'grid-cols-1')}>
              {CLAIM_RESTRICTIONS.map((c: string) => {
                const on = claimChips.includes(c)
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => { setClaimChips(on ? claimChips.filter((x) => x !== c) : [...claimChips, c]); setClaimsAreGuessed(false) }}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center gap-[10px] rounded-[11px] border border-white/[0.07] px-3 py-[9px] text-left font-[inherit] text-[14px] text-cream [touch-action:manipulation]',
                      on ? 'bg-[rgba(101,229,216,0.06)]' : 'bg-[#0E0E12]',
                    )}
                  >
                    <span aria-hidden="true" className={cn(
                      'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] text-[12px] font-black text-ink',
                      on ? 'border-teal bg-teal' : 'border-white/25 bg-transparent',
                    )}>{on ? '✓' : ''}</span>
                    {c}
                  </button>
                )
              })}
            </div>
            <label className="flex flex-col gap-[6px] text-[13px] text-sand-muted">
              Anything else you’re not allowed to say
              <input
                className="ob-fld md:!text-[15px]"
                value={forbiddenClaims}
                onChange={(e) => { setForbiddenClaims(e.target.value); setClaimsAreGuessed(false) }}
                placeholder="e.g. never mention our supplier by name"
              />
            </label>
            {claimsAreGuessed ? (
              <div className="flex items-center gap-[10px] rounded-[10px] bg-[rgba(255,179,71,0.07)] px-3 py-2 text-[13px] text-[#FFCB85]">
                <span className="flex-grow">We found this in your posts. Is it right? Edit it if not.</span>
                <button type="button" onClick={() => setClaimsAreGuessed(false)}
                  className="cursor-pointer rounded-[8px] border-0 bg-amber px-[10px] py-[6px] font-[inherit] text-[12.5px] font-bold text-ink [@media(pointer:coarse)]:min-h-11">
                  Yes, it’s right
                </button>
              </div>
            ) : null}
            <span className="text-[12.5px] text-label">We’ll keep these out of every script. Write “none” if there are no restrictions.</span>
          </div>
        )}

        {/* Moved here from Reading (owner decision): the content goal, read off
            the creator's own sign-offs, and whether they can film the product. */}
        {goalInferred && onPatch && (
          <div className={cn('flex flex-col gap-3 rounded-[18px] border border-white/[0.07] bg-[#111115]', pad)}>
            <span className="flex items-center gap-[10px]">
              <span className="text-[15.5px] font-semibold">Is this what your videos are for?</span>
              {!draft.contentGoalsTouched && (
                <span className="rounded-full bg-[rgba(255,179,71,.14)] px-2 py-[2px] text-[12px] font-bold tracking-[.05em] text-amber">GUESS</span>
              )}
            </span>
            <span className="text-[15px] leading-[1.5] text-sand">{goalConfirmationLine(goalInferred)}</span>
            <span className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={goalChosen}
                onClick={() => patch({ contentGoals: [goalInferred.goal], contentGoalsTouched: true })}
                className={cn(goalChosen ? 'btn-board-light' : 'btn-board-ghost', smallBtn)}>Yes, that’s right</button>
              <button type="button" aria-pressed={goalDeclined}
                onClick={() => patch({ contentGoals: [], contentGoalsTouched: true })}
                className={cn(goalDeclined ? 'btn-board-light' : 'btn-board-ghost', smallBtn)}>Not quite</button>
            </span>
            {goalDeclined && (
              <div className="ob-pop flex flex-col gap-2">
                <span className="text-[13.5px] text-sand-muted">Then what are they for?</span>
                <span className="flex flex-wrap gap-2">
                  {BRIEF_GOALS.filter((g) => g !== goalInferred.goal).map((g) => (
                    <button key={g} type="button" onClick={() => patch({ contentGoals: [g], contentGoalsTouched: true })}
                      className={cn('btn-board-ghost', smallBtn)}>{CONTENT_GOAL_LABEL[g]}</button>
                  ))}
                </span>
              </div>
            )}
            {draft.contentGoalsTouched && draft.contentGoals.length > 0 && !goalChosen && (
              <span className="ob-pop text-[14px] text-teal-soft">✓ {CONTENT_GOAL_LABEL[draft.contentGoals[0]]}</span>
            )}
          </div>
        )}
        {showProductCap && onPatch && (
          <div className={cn('flex flex-col gap-3 rounded-[18px] border border-white/[0.07] bg-[#111115]', pad)}>
            <span className="text-[15.5px] font-semibold">Can you usually show the product on camera?</span>
            <span className="flex flex-wrap gap-2">
              {CAPABILITY_ANSWERS.map((v) => {
                const on = draft.productCapability === v
                return (
                  <button key={v} type="button" aria-pressed={on}
                    onClick={() => {
                      const next = on ? null : v
                      patch({ productCapability: next, canFilmObjects: next === 'yes' ? true : next === 'no' ? false : null })
                    }}
                    className={cn(on ? 'btn-board-light' : 'btn-board-ghost', smallBtn)}>{CAPABILITY_LABEL[v]}</button>
                )
              })}
            </span>
            <span className="text-[12.5px] text-label">Say no and we stop suggesting shots you cannot film. Skip it and nothing is decided.</span>
          </div>
        )}
      </section>

      <section className="pin d4 overflow-hidden rounded-[18px] border border-white/[0.07] bg-[#111115]">
        <button
          type="button"
          onClick={() => setShowVoice((v) => !v)}
          aria-expanded={showVoice}
          className={cn('flex w-full cursor-pointer items-center gap-[14px] border-0 bg-transparent text-left font-[inherit] text-cream', wide ? 'px-5 py-[18px]' : 'p-[14px]')}
        >
          <span className="flex flex-grow flex-col gap-[3px]">
            <span className="text-[18px] font-bold">Your voice</span>
            <span className="text-[13px] leading-[1.45] text-label">
              {voiceIsEmpty
                ? 'The scan found nothing to fill these in. Add them now or leave them, and Twin will learn them from how you talk on camera.'
                : voiceDigest}
            </span>
          </span>
          <span className="shrink-0 rounded-full border border-white/[0.12] px-3 py-[6px] text-[12.5px] text-sand">{showVoice ? 'Hide' : 'Show'}</span>
        </button>
        {!showVoice && (
          <dl className={cn('m-0 flex flex-col', wide ? 'px-5 pb-[18px]' : 'px-[14px] pb-[14px]')} data-testid="voice-plain">
            {plainRows.map(([k, v]) => (
              <div key={k} className="flex gap-[14px] border-t border-white/[0.05] py-[9px] text-[13.5px]">
                <dt className={cn('shrink-0 text-stone-dim', wide ? 'w-[170px]' : 'w-[104px]')}>{k}</dt>
                <dd className="m-0 leading-[1.4]">{typeof v === 'string' && v.trim() ? v : '—'}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className={cn('ob-pop flex flex-col gap-4', wide ? 'px-5 pb-5' : 'px-[14px] pb-4', !showVoice && 'hidden')}>
          <div className={cn('grid gap-[10px]', wide ? 'grid-cols-2' : 'grid-cols-1')}>
            {sumFields.map(([label, key]) => (
              <label key={key} className="flex flex-col gap-[6px] text-[12.5px] text-label">
                {label}
                <input className="ob-fld" value={vp[key] ?? ''} placeholder={voiceIsEmpty ? 'In your words' : ''} onChange={(e) => setField(key, e.target.value)} />
              </label>
            ))}
          </div>
          <CreatorTypePicker value={vp.creator_type} onChange={(t) => setVp({ ...vp, creator_type: t })} />
          {tagGroups1.map(([label, key]) => (
            <TagRow key={key} label={label} items={(vp[key] as string[] | undefined) ?? []} onChange={(v) => setList(key, v)} />
          ))}
          <label className="flex flex-col gap-[6px] text-[12.5px] text-label">
            What you push against (your “enemy”)
            <input className="ob-fld" value={vp.enemy ?? ''} onChange={(e) => setField('enemy', e.target.value)} placeholder="The bad advice or take you argue against" />
          </label>
          {tagGroups2.map(([label, key]) => (
            <TagRow key={key} label={label} items={(vp[key] as string[] | undefined) ?? []} onChange={(v) => setList(key, v)} />
          ))}
          <span className="text-[12.5px] text-teal-soft">We’ll sharpen this from how you actually talk on camera within a few minutes. Your spoken voice is the strongest signal.</span>
        </div>
      </section>

      {err && (
        <div className="rounded-[12px] bg-coral/10 px-3 py-2 text-[14px] text-coral">
          <p className="m-0">{err}</p>
          {/* Every write in `confirm` is an upsert, so running it again is a safe retry. */}
          <button type="button" className="mt-1 min-h-11 cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-[13px] text-coral underline underline-offset-2 md:min-h-0" onClick={() => void confirm()} disabled={busy}>
            Try again
          </button>
        </div>
      )}
      {mintWarning && (
        <p className="m-0 rounded-[12px] bg-amber/10 px-3 py-2 text-[14px] text-amber">{mintWarning}</p>
      )}

      {wide && (
        <div className="pin d5 flex items-center gap-3">
          <button type="button" className="btn-board-ghost" onClick={onBack} disabled={busy}>← Back</button>
          <span className="flex-grow" />
          <span className="text-[13px] text-label">Only what you keep is saved</span>
          {cta}
        </div>
      )}
    </div>
    {!wide && (
      <div className="sticky bottom-0 mt-[22px] flex w-full gap-2 bg-[linear-gradient(180deg,rgba(11,11,14,0),#0B0B0E_30%)] px-5 pb-[max(26px,env(safe-area-inset-bottom))] pt-[14px]">
        <button type="button" className="btn-board-ghost !px-4 !py-[14px]" aria-label="Back" onClick={onBack} disabled={busy}>←</button>
        {cta}
      </div>
    )}
    </div>
  )
}

function TagRow({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('')
  const add = () => {
    const t = text.trim()
    if (t && !items.includes(t)) onChange([...items, t])
    setText('')
  }
  return (
    <div className="flex flex-col gap-[7px]">
      <span className="text-[12.5px] text-label">{label}</span>
      <div className="flex flex-wrap items-center gap-[6px]">
        {items.map((t) => (
          <button key={t} type="button" aria-label={`Remove ${t}`} onClick={() => onChange(items.filter((x) => x !== t))}
            className="ob-pop cursor-pointer rounded-full border border-white/10 bg-white/[0.04] px-[10px] py-[6px] font-[inherit] text-[13px] text-[#E6DED2] [@media(pointer:coarse)]:min-h-11">
            {t} <span className="text-stone-dim">×</span>
          </button>
        ))}
        <input
          className="ob-fld w-[110px] !rounded-full !px-[11px] !py-[6px] !text-[16px] md:!text-[13px]"
          placeholder="+ add"
          aria-label={`Add to ${label}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          onBlur={add}
        />
      </div>
    </div>
  )
}


// ⚠️ `Section` (the collapsible block) WAS DELETED WITH ITS LAST USER,
// "What can appear in your videos". An unused component is a shape the next
// screen gets built around because it is there, not because it is right.


// Chip editor: click a chip to remove it; type + Enter to add one.

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

/** The restrictions that recur across regulated work.
 *
 * ⚠️ A STARTING LIST, NEVER A CLOSED ONE. It exists so that tapping is possible,
 * not so that typing becomes impossible — the free-text box sits underneath it
 * and always. Capping what a creator may declare about their own legal exposure
 * would be a worse failure than the empty box this replaces, which zero of 53
 * accounts ever filled.
 *
 * ⚖️ WORDED AS THE CREATOR WOULD SAY IT, not as a compliance taxonomy. These are
 * stored verbatim into `forbidden_claims`, which the writer reads as prose, so
 * they have to read like something a person wrote. */
const CLAIM_RESTRICTIONS: readonly string[] = [
  'No guaranteed outcomes',
  'No medical or health claims',
  'No income or earnings claims',
  'Never the word "cure"',
  'No before-and-after comparisons',
  'Must say "consult a professional"',
  'No naming competitors',
]

const CONTENT_GOAL_LABEL: Record<BriefGoal, string> = {
  followers: 'Reach more people',
  authority: 'Build trust in what I know',
  educate: 'Teach people',
  leads: 'Get leads or clients',
  sell: 'Sell what I offer',
  entertain: 'Entertain people',
  personal_brand: 'Build my name',
}

// FORMAT_LABEL and EXPLORATION_LABEL (the `desiredFormats` / `formatExploration`
// wording) moved to Gallery.tsx along with the question itself — see D7 of the
// consolidation spec: "what kinds of videos do you want to make" no longer asks
// at signup, it is a filter on the Gallery.
//
// TIE_LABEL, PRODUCT_KIND_LABEL and SERVICE_KIND_LABEL are gone for the same
// reason: they were the wording for six tie chips and their thirteen follow-up
// options, and onboarding no longer asks which KIND of commercial thing exists
// — only whether one does. The FIELDS survive and are still read; only this
// screen's copy for them is gone, and the Product Library has its own.

/** ⚖️ "NOT RIGHT NOW" RATHER THAN "NO", BECAUSE IT IS A STATE AND NOT A REFUSAL.
 *  Somebody who has not started selling yet will start; a chip that reads as a
 *  permanent no makes the honest answer feel like a door closing, and this
 *  question is asked of people mid-signup who are guessing about their own
 *  future. Both answers are equally cheap to change later in the Product
 *  Library, and the copy should say that rather than imply a verdict. */
const SELLS_LABEL: Record<OnboardingSellsAnswer, string> = {
  yes: 'Yes',
  not_right_now: 'Not right now',
}



const CAPABILITY_LABEL: Record<CapabilityAnswer, string> = {
  yes: 'Yes',
  sometimes: 'Sometimes',
  no: 'No',
}

/** The answers the adaptive rules read, lifted off the draft. */

/**
 * THE ANSWERS SO FAR, SO NOBODY SCROLLS BACK TO CHECK ONE.
 *
 * ⚠️ AN ANSWERED QUESTION LEAVES THE SCREEN COMPLETELY. Moving to the next
 * question replaces the previous one, so "wait, did I say founders or
 * professionals?" costs a scroll back, a scroll forward, and the risk of
 * changing an answer by mis-tapping a chip on the way past. The common outcome
 * is not checking at all, and then correcting it on the confirm screen — or not.
 *
 * ⚖️ READ-ONLY, AND DELIBERATELY NOT EDITABLE HERE. Making these tappable would
 * put two ways to change one answer on one screen, and the confirm screen
 * already owns editing. This answers "what did I say" and nothing else.
 *
 * ⚖️ IT RENDERS NOTHING WHEN THERE IS NOTHING TO SAY, which is the whole of the
 * first question and every screen for a creator who is skipping. A summary bar
 * that appears empty is a band of chrome charging rent on a phone screen.
 */
export function AnswerSummary({ draft }: { draft: OnboardingDraft }) {
  const sells = sellsAnswerOf(draft.commercialTies)
  const parts: string[] = [
    draft.workKind ? WORK_KIND_LABEL[draft.workKind] : '',
    draft.audienceSeg ? AUDIENCE_LABEL[draft.audienceSeg] : '',
    draft.audienceKnowledge ? KNOWLEDGE_LABEL[draft.audienceKnowledge] : '',
    ...draft.contentGoals.map((g) => CONTENT_GOAL_LABEL[g]),
    // ⚠️ A CONFIRMATION THAT NOTHING READS IS THE DEFECT IT WAS BUILT TO FIX.
    // The chip says the difference out loud: what Twin believed is now what the
    // creator has agreed to, and the summary is where they can see it stuck.
    draft.confirmedAudiencePain ? 'Their problem — confirmed' : '',
    draft.confirmedDreamOutcome ? 'What they want — confirmed' : '',
    sells ? SELLS_LABEL[sells] : '',
  ].filter((x) => x !== '')

  if (parts.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 border-b border-white/10 pb-3">
      {parts.map((p) => (
        <span
          key={p}
          className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-sand"
        >{p}</span>
      ))}
    </div>
  )
}

/**
 * A QUESTION AS A TITLED BLOCK, NOT A LINE OF TEXT ABOVE SOME BUTTONS.
 *
 * ⚠️ QUESTIONS AND ANSWERS DID NOT READ AS PAIRS. Every question was one weight
 * of text followed by chips, with the next question's text at the same weight
 * directly under the previous question's chips — so on a screen with three
 * questions there was no visual boundary saying which chips belonged to which
 * question. The label is heavier, the hint is muted beneath it, and the block
 * owns its spacing.
 *
 * ⚖️ THE HINT SITS ABOVE THE CHIPS BECAUSE IT CONSTRAINS THEM. "Pick up to two"
 * was printed UNDER the options it limits, where it is a correction rather than
 * an instruction — read only after somebody has already tapped a third time and
 * wondered why nothing happened.
 */
function Field({ label, hint, children }: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-5 first:mt-0">
      <p className="text-sm font-semibold leading-snug text-cream">{label}</p>
      {hint && <p className="mt-1 text-[11px] leading-snug text-stone">{hint}</p>}
      {children}
    </div>
  )
}

/**
 * ⚠️ A FIXED GRID, NOT A WRAPPING FLEX ROW. Chips of different label lengths in
 * a `flex-wrap` row produce a ragged edge that reflows every time a value is
 * added, and long labels pushed the grid into shapes that fit neither a phone
 * nor a laptop. Two columns on a phone, three on a desktop, every cell the same
 * height, and a label too long for its cell truncates rather than growing the
 * row it sits in.
 *
 * ⚠️ SELECTED IS A FILL, NOT AN OUTLINE. The chosen chip was a thin `coral/15`
 * wash behind a `cream` label — on this near-black background that is a border
 * a shade or two off the unselected one, and creators could not tell what they
 * had picked. Selected now inverts: a solid coral fill with near-black text, so
 * it reads as chosen at a glance rather than on inspection.
 *
 * ⚖️ 44px MINIMUM HEIGHT, because these are tapped on a phone and a chip
 * smaller than a fingertip is a chip that gets mis-tapped — expensive here,
 * where a mis-tap on a capability question hides a surface.
 */
function Chips<T extends string>({ values, label, chosen, onPick }: {
  values: readonly T[]
  label: Record<T, string>
  /** A single value, or the list for a multi-select. */
  chosen: T | readonly T[] | null
  onPick: (v: T) => void
}) {
  const isOn = (v: T) => (Array.isArray(chosen) ? (chosen as readonly T[]).includes(v) : chosen === v)
  return (
    <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={isOn(v)}
          title={label[v]}
          onClick={() => onPick(v)}
          className={cn(
            'flex min-h-[44px] items-center justify-center rounded-xl border px-2.5 py-2',
            'text-center text-xs leading-tight transition',
            isOn(v)
              ? 'border-coral bg-coral font-semibold text-ink'
              : 'border-white/15 text-sand hover:border-white/30 hover:bg-white/5',
          )}
        >
          <span className="w-full truncate">{label[v]}</span>
        </button>
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
export function ProfileQuestion({ id, draft, onDraftChange, library = null }: {
  id: ProfileQuestionId | undefined
  draft: OnboardingDraft
  onDraftChange: (next: OnboardingDraft) => void
  /** Live Product Library rows — the evidence for an UNANSWERED sell/promote
   *  question (the same `sellsAnswerWithLibrary` Settings uses). Null = unknown. */
  library?: ReadonlyArray<LibraryProductView> | null
}) {
  const trialId = useAuth().session?.user.id ?? null
  if (!id) return null
  const set = (patch: Partial<OnboardingDraft>) => onDraftChange({ ...draft, ...patch })
  const note = (text: string) => <p className="mt-2 text-[11px] text-stone">{text}</p>

  if (id === 'whoYouAre') {
    // THREE SCREENS, ONE THOUGHT.
    //
    // ⚠️ WHO YOU ARE, WHO YOU ARE FOR, AND WHETHER YOU SELL used to be three
    // separate screens. Asked one at a time they read as an interrogation;
    // asked together they read as an introduction, which is what they are.
    // Nothing about what is stored changed — the same four fields, the same
    // keys, the same draft.
    // ⚠️ SAME READ AS SETTINGS: a stated answer wins; an unanswered one is
    // pre-selected Yes from her own live library rows, with the reason shown.
    const shownSells = sellsAnswerWithLibrary(draft.commercialTies, library)
    const sells = shownSells.answer
    return (
      <>
        <Field label="What best describes what you do?">
          <Chips
            values={ONBOARDING_WORK_KINDS} label={WORK_KIND_LABEL} chosen={draft.workKind}
            onPick={(k) => set({ workKind: draft.workKind === k ? null : k })}
          />
        </Field>

        {/* ── WHAT THE SCAN ALREADY KNOWS, PUT TO THEM ONCE ────────────────
            ⚠️ 45 OF 47 VOICES CARRY THESE, MEASURED IN PRODUCTION, and the only
            reader was the writer's prompt. "0 stated, 34 guessed" was never a
            failure to infer — it was the creator never being shown the
            inference. Four generated chips would throw away a better answer to
            ask a worse question.
            ⚖️ CONFIRMED, NEVER ASSUMED, and the sentence is quoted verbatim: a
            paraphrase would ask them to agree to something the writer never
            reads. Declining records nothing. */}
        {scannedAudienceFacts(draft.profile).map((fact) => {
          const confirmed = fact.field === 'audience_pain'
            ? draft.confirmedAudiencePain
            : draft.confirmedDreamOutcome
          if (audienceFactConfirmed(confirmed, fact)) return null
          return (
            <div key={fact.field} className="mt-5 rounded-card border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-stone">{fact.question}</p>
              <p className="mt-2 text-sm leading-relaxed text-cream">{fact.text}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold"
                  onClick={() => set(fact.field === 'audience_pain'
                    ? { confirmedAudiencePain: fact.text }
                    : { confirmedDreamOutcome: fact.text })}
                >Yes, that's them</button>
                <button
                  type="button"
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm text-sand hover:text-cream"
                  onClick={() => set(fact.field === 'audience_pain'
                    ? { confirmedAudiencePain: null }
                    : { confirmedDreamOutcome: null })}
                >Not quite</button>
              </div>
              {note('Read from your own posts. Nothing is saved until you answer.')}
            </div>
          )
        })}

        {/* Plan v3.10 (Part 16): profile questions asked once — her pillars and
            background. Trial account only (VITE_TRIAL_USER_ID). */}
        {trialUser(trialId) && (
          <div className="mt-5 rounded-card border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-stone">What are the 2 or 3 things you make videos about?</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <input
                  key={i}
                  className="rounded-md border border-white/15 bg-transparent px-2 py-1 text-sm"
                  placeholder={i === 2 ? 'Optional' : `Topic ${i + 1}`}
                  value={draft.contentPillars?.[i] ?? ''}
                  onChange={(ev) => {
                    const next = [...(draft.contentPillars ?? [])]
                    next[i] = ev.target.value.slice(0, 80)
                    set({ contentPillars: next.map((x) => x ?? '').filter((x, j) => x.trim() !== '' || j < next.length - 1) })
                  }}
                />
              ))}
            </div>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-stone">Your background, in a sentence or two</p>
            <textarea
              className="mt-2 w-full rounded-md border border-white/15 bg-transparent px-2 py-1 text-sm"
              rows={2}
              value={draft.background ?? ''}
              onChange={(ev) => set({ background: ev.target.value.slice(0, 400) })}
            />
          </div>
        )}

        {/* ⚖️ AUDIENCE AND DEPTH SIT SIDE BY SIDE BECAUSE THEY ARE ONE QUESTION
            IN TWO HALVES, and neither is answerable without the other in view.
            The same subject for beginner founders and expert founders is two
            different videos. */}
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="Who do you mainly want to reach?">
            <Chips
              values={AUDIENCE_SEGMENTS} label={AUDIENCE_LABEL} chosen={draft.audienceSeg}
              onPick={(a) => set({ audienceSeg: draft.audienceSeg === a ? null : a })}
            />
          </Field>
          <Field label="How much do they already know?">
            <Chips
              values={AUDIENCE_KNOWLEDGE} label={KNOWLEDGE_LABEL} chosen={draft.audienceKnowledge}
              onPick={(k) => set({ audienceKnowledge: draft.audienceKnowledge === k ? null : k })}
            />
          </Field>
        </div>

        {/* THIRTEEN OPTIONS BECAME ONE YES/NO, AND IT NO LONGER OWNS A SCREEN.
            It asked six tie chips plus a seven-chip "what kind of service?"
            follow-up — for facts the Product Library already collects in full,
            behind an attestation, where a claim can actually be granted. What
            onboarding legitimately owns is only whether a commercial thing
            EXISTS, because that bit gates whether Twin ever offers a product
            scene. The rest is a property of the thing, and the thing gets
            named later.

            ⚖️ NOTHING IS DELETED. `ownProductKind` and `ownServiceKind` are
            still stored, still loaded, still saved, still read by
            `asksScreenCapability` for accounts that hold them. This stops
            ASKING; reading continues. The answer still lands in
            `commercialTies` via `SELLS_ANSWER_TO_TIES`, so every reader keeps
            working with no migration. */}
        <Field
          label="Do you sell or promote anything in your videos?"
          hint="Just so Twin knows whether to offer it. You add the actual product later, in your Product Library."
        >
          <Chips
            values={ONBOARDING_SELLS_ANSWERS} label={SELLS_LABEL} chosen={sells}
            onPick={(a) => set({
              // ⚠️ TAPPING THE CHOSEN ANSWER AGAIN CLEARS IT. An empty list is
              // UNANSWERED and is not "nothing to sell" — turning silence into
              // a commercial statement is the error this screen exists to
              // avoid, and `sellsAnswerOf` keeps the two apart.
              // An inferred "yes" is saved as hers on tap, not cleared.
              commercialTies: sells === a && !shownSells.fromLibrary ? [] : [...SELLS_ANSWER_TO_TIES[a]],
            })}
          />
          {shownSells.reason && note(shownSells.reason)}
        </Field>
      </>
    )
  }

  if (id === 'contentGoals') {
    // ── THE THIRD ASKING IS DELETED, NOT SOFTENED ───────────────────────────
    //
    // ⚠️ REPORTED FOUR TIMES. "What do you want your content to help you do?"
    // is asked here, in the remix pop-up, and again in the intent questions. My
    // first attempt showed a confirmation of the creator's own CTA when one
    // could be inferred and FELL BACK to the seven chips otherwise — and
    // measured over all 47 stored `recurring_ctas` sets, that inference fired
    // on 12 of 42 accounts. So on 71% of accounts the screen was unchanged,
    // which is exactly why it was reported still there after being reported
    // fixed. Widening the patterns took it to 23 of 42; the rest are sign-offs
    // that genuinely ask for nothing ("Do the work", "Take a deep breath").
    //
    // ⚖️ SO WHEN TWIN CANNOT INFER IT, NOBODY IS ASKED. The question survives
    // where it changes something — the per-video intent question, which is
    // about THIS video rather than the creator in general — and
    // `compileVideoIntent` already reads an absent goal as "no directive"
    // rather than as a default, so silence costs nothing downstream.
    // ⚠️⚠️ THIS USED TO GO BLANK IN TWO DIFFERENT WAYS, AND A CREATOR SAW BOTH.
    //
    // The condition was `draft.contentGoals.length === 0 ? goalFromCtas(...) :
    // null`, followed by `if (!inferred) return null`. So the step drew nothing
    // when no goal could be inferred — 19 of 42 accounts by this file's own
    // measurement — AND, worse, it drew nothing the instant somebody ANSWERED,
    // because answering set `contentGoals` and sent `inferred` to null. The
    // header still said "2 of 2" and Done and Skip all were still there. An
    // empty step is worse than a wrong one.
    //
    // ⚖️ WHETHER TO ASK IS NOW THE SELECTOR'S DECISION, NOT THIS RENDERER'S.
    // `asksContentGoal` keeps the question out of the set entirely when there
    // is nothing to read off the creator's sign-offs, so a step that renders
    // ALWAYS has a question in it. The null below is unreachable through
    // `profileQuestionsFor` and stays as a belt-and-braces guard for direct
    // callers, never as the mechanism.
    //
    // ⚖️ AND IT NO LONGER STOPS DRAWING ONCE ANSWERED. The answer is shown as
    // chosen instead, so the step stays put and the set does not shrink under
    // whoever is standing in it.
    const inferred = goalFromCtas(draft.profile?.recurring_ctas)
    if (!inferred) return null
    const goalChosen = draft.contentGoals.includes(inferred.goal)
    const declined = draft.contentGoals.length === 0 && draft.contentGoalsTouched === true
    return (
      <Field label="Is this what your videos are for?">
        <p className="text-sm leading-relaxed text-cream">{goalConfirmationLine(inferred)}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={goalChosen}
            className={goalChosen
              ? 'btn-gradient rounded-lg px-4 py-2 text-sm font-semibold ring-2 ring-amber'
              : 'btn-gradient rounded-lg px-4 py-2 text-sm font-semibold'}
            onClick={() => set({ contentGoals: [inferred.goal], contentGoalsTouched: true })}
          >Yes, that's right</button>
          {/* ⚠️ DECLINING USED TO RECORD NOTHING AND ASK NOTHING MORE, and the
              reason given was that offering the seven chips here would be "the
              third asking wearing a no button". That holds for showing them
              UP FRONT. It does not hold after a no, and the cost of the silence
              was measured on 2026-09-13: of 13 creators whose brief records a
              commercial tie -- they sell something -- TWELVE have no `sell` in
              their content goals. The stored spread is followers 8, leads 3,
              authority 2, sell 1, educate 1. The inference reads recurring CTAs
              and lands on `followers`, and a creator it mislabels had no way to
              say otherwise: "Not quite" wrote an empty array and moved on.
              So the chips appear ONLY after a no. That is not a third asking;
              it is the second half of the question they just answered. */}
          <button
            type="button"
            aria-pressed={declined}
            className={declined
              ? 'rounded-lg border border-amber/60 px-4 py-2 text-sm text-cream'
              : 'rounded-lg border border-white/15 px-4 py-2 text-sm text-sand hover:text-cream'}
            onClick={() => set({ contentGoals: [], contentGoalsTouched: true })}
          >Not quite</button>
        </div>
        {declined ? (
          <div className="mt-4">
            <p className="text-sm text-sand">Then what are they for?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {BRIEF_GOALS.filter((g) => g !== inferred.goal).map((g) => (
                <button
                  key={g}
                  type="button"
                  className="rounded-lg border border-white/15 px-3 py-2 text-sm text-sand hover:text-cream"
                  onClick={() => set({ contentGoals: [g], contentGoalsTouched: true })}
                >{CONTENT_GOAL_LABEL[g]}</button>
              ))}
            </div>
          </div>
        ) : null}
        {note('Read from how your own videos end. Nothing is saved until you answer.')}
      </Field>
    )
  }

  // `capabilities` — only reached when at least one half applies.
  const answers = profileAnswersOf(draft)
  return (
    <>
      {asksScreenCapability(answers) && (
        <Field label="Can you record your screen when Twin needs it?">
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
        </Field>
      )}
      {asksProductCapability(answers) && (
        <Field label="Can you usually show the product on camera?">
          <Chips
            values={CAPABILITY_ANSWERS} label={CAPABILITY_LABEL} chosen={draft.productCapability}
            onPick={(v) => {
              const next = draft.productCapability === v ? null : v
              set({ productCapability: next, canFilmObjects: next === 'yes' ? true : next === 'no' ? false : null })
            }}
          />
        </Field>
      )}
      {note('Say no and we stop suggesting shots you cannot film. Skip it and nothing is decided.')}
    </>
  )
}
