import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { markOnboarded, pollDna, saveDNA, saveVoiceProfile, startDna } from '../lib/api'
import type { CreatorDNA, Platform, VoiceProfile } from '../lib/types'
import { GradientBar } from '../components/GradientBar'

const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube', 'other']

// Per-platform placeholder so the input matches the source they picked.
const PLACEHOLDER: Record<Platform, string> = {
  tiktok: '@yourhandle  or  https://tiktok.com/@yourhandle',
  instagram: '@yourhandle  or  https://instagram.com/yourhandle',
  youtube: '@yourchannel  or  https://youtube.com/@yourchannel',
  other: '@yourhandle',
}

type Mode = 'handle' | 'building' | 'confirm' | 'manual'

export default function Onboarding() {
  const { session, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('handle')

  if (!session) {
    navigate('/auth')
    return null
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-16">
      <div className="glass p-8">
        <GradientBar />
        {mode === 'handle' && <HandleStep onBuilding={() => setMode('building')} onManual={() => setMode('manual')} />}
        {mode === 'building' && (
          <BuildingStep onReady={() => setMode('confirm')} onManual={() => setMode('manual')} />
        )}
        {mode === 'confirm' && <ConfirmStep onDone={() => finish(refreshProfile, navigate)} />}
        {mode === 'manual' && <ManualQuiz onBack={() => setMode('handle')} />}
      </div>
    </main>
  )
}

async function finish(refreshProfile: () => Promise<void>, navigate: (to: string) => void) {
  await markOnboarded()
  await refreshProfile()
  navigate('/app')
}

// We stash the in-flight voice id between steps via module state (single onboarding
// session, never concurrent) so the confirm step can load it without prop drilling.
let activeVoiceId: string | null = null
let activeProfile: VoiceProfile | null = null

// --- Step 1: paste a handle ------------------------------------------------
function HandleStep({ onBuilding, onManual }: { onBuilding: () => void; onManual: () => void }) {
  const [handle, setHandle] = useState('')
  const [platform, setPlatform] = useState<Platform>('tiktok')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const go = async () => {
    setErr(null)
    if (!handle.trim()) return setErr('Paste your handle or profile link first.')
    setBusy(true)
    try {
      const res = await startDna(handle.trim(), platform)
      activeVoiceId = res.brand_voice_id
      onBuilding()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start the scan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="eyebrow mt-6">Your brand voice · the one-tap way</p>
      <h1 className="mt-4 font-display text-2xl">
        Paste your handle. We read how <span className="gradient-text">you</span> sound.
      </h1>
      <p className="mt-2 text-sand">
        TwinAI reads your recent posts and learns your voice — so every script sounds like you, not a robot.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {PLATFORMS.filter((p) => p !== 'other').map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            className={`chip ${platform === p ? 'border-coral text-cream' : ''}`}
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

      {err && <p className="mt-3 text-sm text-coral">{err}</p>}

      <div className="mt-8 flex items-center justify-between">
        <button className="btn-ghost" onClick={onManual} disabled={busy}>
          Set it up manually
        </button>
        <button className="btn-primary" onClick={go} disabled={busy}>
          {busy ? 'Starting…' : 'Build my voice'}
        </button>
      </div>
    </>
  )
}

// --- Step 2: live progress while the scan runs -----------------------------
function BuildingStep({ onReady, onManual }: { onReady: () => void; onManual: () => void }) {
  const [err, setErr] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!activeVoiceId) {
      setErr('Lost the scan — please set up manually.')
      return
    }
    let stopped = false
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
        }
      } catch (e) {
        // Transient — keep polling; surface only if it persists.
        console.warn('dna poll', e)
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
      <p className="eyebrow mt-6">Reading your voice</p>
      <h1 className="mt-4 font-display text-2xl">Studying your recent posts…</h1>
      <p className="mt-2 text-sand">
        Pulling your hooks, pacing and signature phrases. This usually takes under a minute.
      </p>

      <div className="mt-6 space-y-3">
        {['Fetching your posts', 'Reading captions & hooks', 'Synthesizing your voice'].map((s) => (
          <div key={s} className="flex items-center gap-3 text-sand">
            <span className="h-2 w-2 animate-pulse rounded-full bg-signature" />
            {s}
          </div>
        ))}
      </div>

      {err && (
        <div className="mt-6">
          <p className="text-sm text-coral">{err}</p>
          <button className="btn-ghost mt-3" onClick={onManual}>
            Set up manually instead
          </button>
        </div>
      )}
    </>
  )
}

// --- Step 3: confirm / edit the voice in one tap ---------------------------
function ConfirmStep({ onDone }: { onDone: () => void }) {
  const [vp, setVp] = useState<VoiceProfile | null>(activeProfile)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!vp) {
    return (
      <>
        <p className="eyebrow mt-6">Almost there</p>
        <p className="mt-4 text-sand">We couldn’t load your voice. Please set it up manually.</p>
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
      await onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save your voice.')
      setBusy(false)
    }
  }

  return (
    <>
      <p className="eyebrow mt-6">This is your voice · tweak anything</p>
      <h1 className="mt-3 font-display text-2xl">{vp.summary || 'Here’s how you sound'}</h1>

      <div className="mt-6 space-y-4">
        <Labeled label="Niche">
          <input className="field" value={vp.niche} onChange={(e) => setField('niche', e.target.value)} />
        </Labeled>
        <div className="grid gap-4 sm:grid-cols-2">
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
      </div>

      {err && <p className="mt-3 text-sm text-coral">{err}</p>}

      <div className="mt-8 flex justify-end">
        <button className="btn-primary" onClick={confirm} disabled={busy}>
          {busy ? 'Saving…' : 'This is me — enter the studio'}
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
            className="chip border-coral/60 text-cream"
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

// --- Fallback: the original manual quiz ------------------------------------
function ManualQuiz({ onBack }: { onBack: () => void }) {
  const { refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [dna, setDna] = useState<CreatorDNA>({
    niche: '',
    audience: '',
    product: '',
    goal: 'turn attention into trust',
    voice: 'direct, warm, a little punchy',
    platforms: ['tiktok'],
    editing_style: 'fast jump cuts, burned-in captions',
  })

  const steps = [
    {
      label: 'Your niche',
      field: (
        <input
          className="field"
          placeholder="e.g. fitness for busy founders"
          value={dna.niche}
          onChange={(e) => setDna({ ...dna, niche: e.target.value })}
        />
      ),
    },
    {
      label: 'Who you’re talking to',
      field: (
        <input
          className="field"
          placeholder="e.g. early-stage founders, 25–40"
          value={dna.audience}
          onChange={(e) => setDna({ ...dna, audience: e.target.value })}
        />
      ),
    },
    {
      label: 'What you’re selling / building',
      field: (
        <input
          className="field"
          placeholder="e.g. a coaching program, an app, my personal brand"
          value={dna.product}
          onChange={(e) => setDna({ ...dna, product: e.target.value })}
        />
      ),
    },
    {
      label: 'How you sound (your voice)',
      field: (
        <input
          className="field"
          placeholder="e.g. blunt and funny / calm and expert"
          value={dna.voice}
          onChange={(e) => setDna({ ...dna, voice: e.target.value })}
        />
      ),
    },
    {
      label: 'Where you post',
      field: (
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => {
            const on = dna.platforms.includes(p)
            return (
              <button
                key={p}
                type="button"
                onClick={() =>
                  setDna({
                    ...dna,
                    platforms: on ? dna.platforms.filter((x) => x !== p) : [...dna.platforms, p],
                  })
                }
                className={`chip ${on ? 'border-coral text-cream' : ''}`}
              >
                {p}
              </button>
            )
          })}
        </div>
      ),
    },
  ]

  const last = step === steps.length - 1
  const next = async () => {
    if (!last) return setStep(step + 1)
    setBusy(true)
    try {
      await saveDNA(dna)
      await refreshProfile()
      navigate('/app')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="eyebrow mt-6">Set up your voice manually · 90 seconds</p>
      <div className="mt-4 flex gap-1">
        {steps.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-signature' : 'bg-white/10'}`} />
        ))}
      </div>
      <h1 className="mt-6 font-display text-2xl">{steps[step].label}</h1>
      <div className="mt-4">{steps[step].field}</div>
      <div className="mt-8 flex justify-between">
        <button className="btn-ghost" onClick={() => (step === 0 ? onBack() : setStep(step - 1))}>
          Back
        </button>
        <button className="btn-primary" onClick={next} disabled={busy}>
          {busy ? 'Saving…' : last ? 'Enter the studio' : 'Next'}
        </button>
      </div>
    </>
  )
}
