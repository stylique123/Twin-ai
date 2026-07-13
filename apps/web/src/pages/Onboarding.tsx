import { useEffect, useRef, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AtSign, Loader2, Check, Sparkles, ArrowRight, ArrowLeft, RotateCcw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { markOnboarded, pollDna, saveDNA, saveVoiceProfile, startDna } from '../lib/api'
import type { Platform, VoiceProfile } from '../lib/types'
import { Aurora } from '../components/Aurora'
import { EASE } from '../components/motion'
import { cn } from '../lib/cn'

const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube', 'other']

// Per-platform placeholder so the input matches the source they picked.
const PLACEHOLDER: Record<Platform, string> = {
  tiktok: '@yourhandle  or  https://tiktok.com/@yourhandle',
  instagram: '@yourhandle  or  https://instagram.com/@yourhandle',
  youtube: '@yourchannel  or  https://youtube.com/@yourchannel',
  linkedin: '@yourname  or  https://linkedin.com/in/yourname',
  other: '@yourhandle',
}

// Brand DNA is MANDATORY at signup and the only way to get it is to scan a real
// handle — there is no manual quiz and no "do it later" skip. A new creator must
// build their voice from their posts before they can enter the studio.
type Mode = 'handle' | 'building' | 'confirm'

export default function Onboarding() {
  const { session, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('handle')

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
              {mode === 'handle' && <HandleStep onBuilding={() => setMode('building')} />}
              {mode === 'building' && (
                <BuildingStep onReady={() => setMode('confirm')} onBack={() => setMode('handle')} />
              )}
              {mode === 'confirm' && <ConfirmStep onDone={() => finish(refreshProfile, navigate)} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </main>
  )
}

async function finish(refreshProfile: () => Promise<void>, navigate: (to: string) => void) {
  await markOnboarded()
  setActiveVoiceId(null) // onboarding done — clear the resume key
  await refreshProfile()
  navigate('/app')
}

// We stash the in-flight voice id between steps. Persist it in sessionStorage too
// so a refresh mid-scan RESUMES the same brand-voice poll instead of losing it and
// forcing the user to start over (the scan keeps running server-side regardless).
const VOICE_KEY = 'twinai_onboarding_voice_id'
let activeVoiceId: string | null =
  typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(VOICE_KEY) : null
let activeProfile: VoiceProfile | null = null
let activePlatform: Platform = 'tiktok'
function setActiveVoiceId(id: string | null) {
  activeVoiceId = id
  try {
    if (id) sessionStorage.setItem(VOICE_KEY, id)
    else sessionStorage.removeItem(VOICE_KEY)
  } catch { /* sessionStorage unavailable — module var still holds it */ }
}

// --- Step 1: paste a handle ------------------------------------------------
function HandleStep({ onBuilding }: { onBuilding: () => void }) {
  const [handle, setHandle] = useState('')
  const [platform, setPlatform] = useState<Platform>('tiktok')
  const [busy, setBusy] = useState(false)
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
      setActiveVoiceId(res.brand_voice_id)
      activePlatform = platform
      onBuilding()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start the scan.')
    } finally {
      setBusy(false)
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
        <button className="btn-gradient w-full !py-3.5" onClick={go} disabled={busy}>
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
      </div>
    </>
  )
}

// --- Step 2: live progress while the scan runs -----------------------------
const SCAN_STAGES = ['Fetching your posts', 'Reading captions & hooks', 'Synthesizing your voice']

function BuildingStep({ onReady, onBack }: { onReady: () => void; onBack: () => void }) {
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
    if (!activeVoiceId) {
      setErr('We lost track of that scan. Head back and try your handle again.')
      return
    }
    let stopped = false
    // Hard cap: if the scan never resolves (stuck worker, dropped job), don't
    // trap the user on an infinite spinner, surface the manual fallback.
    const startedAt = Date.now()
    const MAX_WAIT_MS = 220_000
    const tick = async () => {
      try {
        const res = await pollDna(activeVoiceId!)
        if (stopped) return
        if (res.status === 'ready') {
          activeProfile = res.profile ?? null
          if (timer.current) clearInterval(timer.current)
          onReady()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

      {err && (
        <div className="mt-6 space-y-2">
          <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{err}</p>
          <p className="text-sm text-sand">
            Tip: pick a <span className="text-cream">public</span> account with a handful of recent posts — that reads fastest and most accurately.
          </p>
        </div>
      )}

      {/* On an error, promote "Try again" to the primary action. There is no
          manual/skip path — building the voice from a real handle is required. */}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <button className="btn-ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        {err && (
          <button className="btn-gradient" onClick={onBack}>
            <RotateCcw className="h-4 w-4" /> Try a different handle
          </button>
        )}
      </div>
    </>
  )
}

// --- Step 3: confirm / edit the voice in one tap ---------------------------
function ConfirmStep({ onDone }: { onDone: () => void }) {
  const [vp, setVp] = useState<VoiceProfile | null>(activeProfile)
  const [audience, setAudience] = useState('')
  const [product, setProduct] = useState('')
  const [goal, setGoal] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

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
      if (activeVoiceId) await saveVoiceProfile(activeVoiceId, vp)
      // ALSO seed the Creator DNA (profile.dna) from the scan + these answers, so
      // the scanned signup isn't left with a half-empty DNA (the "audience/product/
      // goal Not set" bug). Best-effort — never blocks entering the studio.
      await saveDNA({
        niche: vp.niche,
        audience,
        product,
        // Never fabricate a goal the creator didn't state — an unset goal stays
        // empty (Settings shows "+ Add"), and the blueprint applies its own neutral
        // fallback at write time. Storing a canned goal here made it read as theirs.
        goal,
        voice: [vp.tone, vp.pacing].filter(Boolean).join(', '),
        platforms: [activePlatform],
        editing_style: vp.hook_style || '',
      }).catch(() => {})
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
          <Labeled label="What you sell / build">
            <input className="field" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. a coaching program, an app" />
          </Labeled>
        </div>
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
