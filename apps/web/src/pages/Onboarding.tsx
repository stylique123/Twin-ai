import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AtSign, Loader2, Check, Sparkles, ArrowRight, ArrowLeft, RotateCcw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { pollDna, saveCapabilityDefaults, saveDNA, saveVoiceProfile, startDna, startManualVoice } from '../lib/api'
import type { Platform, Profile, VoiceProfile } from '../lib/types'
import { asksForbiddenClaims, BRIEF_WORK_KINDS, type BriefWorkKind } from '../lib/api'
import { Aurora } from '../components/Aurora'

/** The chooser's words. Kept beside the screen rather than in the contract: the
 *  ids are the contract, and how they are phrased to a person is not. */
const WORK_KIND_LABEL: Record<BriefWorkKind, string> = {
  creator: 'Creator',
  professional: 'Licensed professional',
  ecommerce: 'Ecommerce',
  brand: 'Brand / in-house',
  saas: 'Software',
  local_service: 'Local service',
  other: 'Something else',
}
import { EASE } from '../components/motion'
import { cn } from '../lib/cn'
import {
  ONBOARDING_DRAFT_VERSION,
  clearOnboardingDraft,
  readOnboardingDraft,
  writeOnboardingDraft,
  type OnboardingDraft,
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

  const persistDraft = useCallback((next: OnboardingDraft) => {
    setDraft(next)
    safeWriteDraft(next)
  }, [])

  const startDraft = useCallback((voiceId: string, platform: Platform, profile: VoiceProfile | null) => {
    const next: OnboardingDraft = {
      version: ONBOARDING_DRAFT_VERSION,
      userId,
      voiceId,
      platform,
      profile,
      workKind: null,
      forbiddenClaims: null,
      // The scan pre-fills the offer, so it starts as NOT the creator's answer.
      // Only their edit flips it.
      offerFromCreator: false,
      // Unanswered until the creator answers. Never seeded, in either direction.
      canRecordScreen: null,
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
    brief: Pick<OnboardingDraft, 'workKind' | 'forbiddenClaims' | 'offerFromCreator' | 'canRecordScreen'>
      = { workKind: null, forbiddenClaims: null, offerFromCreator: false, canRecordScreen: null },
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
  const setCanRecordScreen = useCallback((value: boolean | null) => {
    setDraft((current) => {
      if (!current || current.userId !== userId) return current
      const next = { ...current, canRecordScreen: value }
      safeWriteDraft(next)
      return next
    })
  }, [userId])

  const complete = useCallback(async () => {
    await finish(refreshProfile, navigate)
    safeClearDraft(userId)
    setDraft(null)
  }, [navigate, refreshProfile, userId])
  const handleStarted = useCallback((voiceId: string, platform: Platform, profile: VoiceProfile | null) => {
    startDraft(voiceId, platform, profile)
    setMode(profile ? 'confirm' : 'building')
  }, [startDraft])
  const handleReady = useCallback((profile: VoiceProfile) => {
    updateAnswers(profile, profile.audience ?? '', profile.offer ?? '', '')
    setMode('confirm')
  }, [updateAnswers])

  if (!session) return <Navigate to="/auth" replace />

  return (
    <main className="relative grid min-h-screen place-items-center overflow-clip px-5 py-12 pt-20">
      <Aurora />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="relative w-full max-w-xl"
      >
        <div className="glass overflow-hidden rounded-panel p-8 sm:p-9">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              {mode === 'handle' && (
                <HandleStep onStarted={handleStarted} />
              )}
              {mode === 'building' && draft && (
                <BuildingStep
                  draft={draft}
                  onReady={handleReady}
                  onBack={() => setMode('handle')}
                  onCanRecordScreen={setCanRecordScreen}
                />
              )}
              {mode === 'confirm' && draft && (
                <ConfirmStep draft={draft} onDraftChange={updateAnswers} onDone={complete} />
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
}: {
  onStarted: (voiceId: string, platform: Platform, profile: VoiceProfile | null) => void
}) {
  const [handle, setHandle] = useState('')
  const [platform, setPlatform] = useState<Platform>('instagram')
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
      onStarted(res.brand_voice_id, platform, null)
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
      onStarted(res.brand_voice_id, platform, emptyVoiceProfile())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not set up a manual voice.')
    } finally {
      setManualBusy(false)
    }
  }

  return (
    <>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-signature-soft">
        <AtSign className="h-5 w-5 text-cream" />
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

function BuildingStep({
  draft,
  onReady,
  onBack,
  onCanRecordScreen,
}: {
  draft: OnboardingDraft
  onReady: (profile: VoiceProfile) => void
  onBack: () => void
  onCanRecordScreen: (value: boolean | null) => void
}) {
  const [err, setErr] = useState<string | null>(null)
  const [stage, setStage] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Advance the visual stage on a gentle clock so the wait feels alive even
  // though the backend reports only building/ready/failed.
  useEffect(() => {
    const t = setInterval(() => setStage((s) => Math.min(s + 1, SCAN_STAGES.length - 1)), 9000)
    return () => clearInterval(t)
  }, [])

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
          if (res.profile) onReady(res.profile)
          else setErr('The scan finished without a voice profile. Try a different handle or describe it yourself.')
        } else if (res.status === 'failed') {
          if (timer.current) clearInterval(timer.current)
          setErr(res.error ?? 'The scan could not finish.')
        } else if (Date.now() - startedAt > MAX_WAIT_MS) {
          if (timer.current) clearInterval(timer.current)
          setErr('This is taking longer than usual. Head back and try again — a public account reads fastest.')
        }
      } catch (e) {
        // Transient, keep polling; surface only if it persists past the cap.
        console.warn('dna poll', e)
        if (Date.now() - startedAt > MAX_WAIT_MS && !stopped) {
          if (timer.current) clearInterval(timer.current)
          setErr('We couldn’t reach the scanner. Head back and try again in a moment.')
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
        <Sparkles className="relative h-5 w-5 text-cream" />
      </span>
      <p className="eyebrow mt-5">Reading your voice</p>
      <h1 className="mt-3 font-display text-3xl">Studying your recent posts…</h1>
      <p className="mt-2.5 text-sand">
        Pulling your hooks, pacing and signature phrases. This usually takes under a minute.
      </p>

      <div className="mt-7 space-y-3">
        {SCAN_STAGES.map((s, i) => {
          const state = i < stage ? 'done' : i === stage ? 'active' : 'todo'
          return (
            <div
              key={s}
              className={cn(
                'flex items-center gap-3 rounded-card border p-3.5 transition-all duration-500',
                state === 'active' && 'border-coral/40 bg-coral/5 text-cream',
                state === 'done' && 'border-white/8 bg-white/[0.02] text-sand',
                state === 'todo' && 'border-white/8 bg-white/[0.02] text-stone opacity-60',
              )}
            >
              <span
                className={cn(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full',
                  state === 'done' ? 'bg-teal/20' : 'bg-white/5',
                )}
              >
                {state === 'done' ? (
                  <Check className="h-3.5 w-3.5 text-teal" />
                ) : state === 'active' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-coral" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                )}
              </span>
              {s}
            </div>
          )
        })}
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
          system a question only the person can answer.
          SKIPPING IS A REAL ANSWER AND IT IS NOT "NO". Tapping the chosen chip
          again clears it back to unanswered, and nothing is written for an
          unanswered question — `can_record_screen = false` permanently hides a
          surface, so "they never said" must never become "they said no". */}
      <div className="mt-7 rounded-card border border-white/8 bg-white/[0.02] p-4">
        <p className="text-xs font-semibold text-cream">While that runs — can you record your screen?</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={draft.canRecordScreen === v}
              onClick={() => onCanRecordScreen(draft.canRecordScreen === v ? null : v)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs transition',
                draft.canRecordScreen === v
                  ? 'border-coral bg-coral/15 text-cream'
                  : 'border-white/15 text-sand hover:bg-white/5',
              )}
            >
              {v ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-stone">
          Say yes and Twin can ask you to capture what is on your screen for the moments your
          script says to show something. Skip it and nothing changes — we just won’t offer it yet.
        </p>
      </div>

      {err && (
        <div className="mt-6 space-y-2">
          <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{err}</p>
          <p className="text-sm text-sand">
            Tip: pick a <span className="text-cream">public</span> account with a handful of recent posts — that reads fastest and most accurately.
          </p>
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
}: {
  draft: OnboardingDraft
  onDraftChange: (
    profile: VoiceProfile, audience: string, product: string, goal: string,
    brief: Pick<OnboardingDraft, 'workKind' | 'forbiddenClaims' | 'offerFromCreator' | 'canRecordScreen'>,
  ) => void
  onDone: () => Promise<void>
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
  const [forbiddenClaims, setForbiddenClaims] = useState(draft.forbiddenClaims ?? '')
  // The offer arrives PRE-FILLED FROM THE SCAN — which is the defect §8a names,
  // not a feature. Tracking whether the creator changed it is what separates
  // "they told us" from "the model guessed and nobody corrected it", and only
  // the first may decide a call to action.
  const [offerTouched, setOfferTouched] = useState(draft.offerFromCreator)
  // §2.2's `can_record_screen`, ANSWERED DURING THE SCAN (see BuildingStep) and
  // carried here so the durable save still writes it. Read from the draft rather
  // than re-asked: two screens asking one question is two places that can
  // disagree about what a skipped answer means.
  const canRecordScreen = draft.canRecordScreen
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Preserve every edit within this browser tab until the server has verified
  // onboarding completion. A refresh or retry must never erase Brand DNA.
  useEffect(() => {
    if (vp) {
      onDraftChange(vp, audience, product, goal, {
        workKind, forbiddenClaims: forbiddenClaims.trim() || null, offerFromCreator: offerTouched,
        canRecordScreen,
      })
    }
  }, [vp, audience, product, goal, workKind, forbiddenClaims, offerTouched, canRecordScreen, onDraftChange])

  if (!vp) {
    return (
      <>
        <p className="eyebrow">Almost there</p>
        <p className="mt-4 text-sand">We couldn’t load your voice. Head back and scan your handle again.</p>
      </>
    )
  }

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
      if (canRecordScreen !== null) {
        await saveCapabilityDefaults(draft.voiceId, { can_record_screen: canRecordScreen })
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

      <div className="mt-6 space-y-4">
        <Labeled label="Niche">
          <input className="field" value={vp.niche} onChange={(e) => setField('niche', e.target.value)} />
        </Labeled>
        {/* Captured here so the DNA is complete from day one (the scan can't read
            these). Optional — empty is fine, the creator can fill them in Settings. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            {!offerTouched && product && (
              <p className="mt-1 text-[11px] text-amber">
                We guessed this from your posts — worth a look, it becomes the call to action on every video.
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
        </Labeled>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      <div className="mt-8 flex justify-end">
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
