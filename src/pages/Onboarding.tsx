import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { saveDNA } from '../lib/api'
import type { CreatorDNA, Platform } from '../lib/types'
import { GradientBar } from '../components/GradientBar'

const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube', 'other']

export default function Onboarding() {
  const { session, refreshProfile } = useAuth()
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

  if (!session) {
    navigate('/auth')
    return null
  }

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
                    platforms: on
                      ? dna.platforms.filter((x) => x !== p)
                      : [...dna.platforms, p],
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
    <main className="mx-auto max-w-xl px-5 py-16">
      <div className="glass p-8">
        <GradientBar />
        <p className="eyebrow mt-6">Your creator DNA · takes 90 seconds</p>
        <div className="mt-4 flex gap-1">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-signature' : 'bg-white/10'}`}
            />
          ))}
        </div>
        <h1 className="mt-6 font-display text-2xl">{steps[step].label}</h1>
        <div className="mt-4">{steps[step].field}</div>
        <div className="mt-8 flex justify-between">
          <button
            className="btn-ghost"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
          >
            Back
          </button>
          <button className="btn-primary" onClick={next} disabled={busy}>
            {busy ? 'Saving…' : last ? 'Enter the studio' : 'Next'}
          </button>
        </div>
      </div>
    </main>
  )
}
