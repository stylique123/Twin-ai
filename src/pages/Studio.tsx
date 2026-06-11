import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { generateBlueprint, ingestReference, getJob } from '../lib/api'
import { BLUEPRINT_COST, videosFromCredits } from '../lib/brand'
import { GradientBar } from '../components/GradientBar'

const FIDELITY = [
  { id: 'close', label: 'Close', note: 'Stay tight to the reference structure.' },
  { id: 'balanced', label: 'Balanced', note: 'Proven shape, your spin.' },
  { id: 'loose', label: 'Loose', note: 'Just the inspiration, mostly you.' },
] as const

export default function Studio() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [fidelity, setFidelity] = useState<'close' | 'balanced' | 'loose'>('balanced')
  const [deepRead, setDeepRead] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const lowCredits = (profile?.credits ?? 0) < BLUEPRINT_COST

  // Deep read: send the link to the worker, which transcribes the actual video
  // and derives its real structure. Returns the transcript_id to build from.
  const analyzeRealVideo = async (link: string): Promise<string> => {
    setProgress('Fetching the video…')
    const jobId = await ingestReference(link)
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      const job = await getJob(jobId)
      if (!job) continue
      if (job.status === 'done' && job.result?.transcript_id) return job.result.transcript_id
      if (job.status === 'failed') throw new Error(job.error || 'Could not analyze that video.')
      setProgress(job.status === 'running' ? 'Transcribing & reading structure…' : 'Queued…')
    }
    throw new Error('Analysis is taking too long — try again in a moment.')
  }

  const run = async () => {
    setErr(null)
    if (!url.trim()) return setErr('Paste a reference link first.')
    if (lowCredits) return setErr("You're out of recreations for now — upgrade to keep going.")
    setBusy(true)
    try {
      const transcript_id = deepRead ? await analyzeRealVideo(url.trim()) : undefined
      setProgress('Writing your blueprint…')
      const gen = await generateBlueprint({
        reference_url: url.trim(),
        reference_note: note.trim(),
        fidelity,
        transcript_id,
      })
      await refreshProfile()
      navigate(`/result/${gen.id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <GradientBar />
      <p className="eyebrow mt-8">The studio</p>
      <h1 className="mt-3 font-display text-3xl">
        Drop a reference. Get it <span className="gradient-text">shootable.</span>
      </h1>
      <p className="mt-2 text-sand">
        Turn a two-hour filming-and-editing slog into a focused 20-minute sprint.
      </p>

      <div className="glass mt-8 space-y-5 p-6">
        <div>
          <label className="eyebrow">Reference link</label>
          <input
            className="field mt-2"
            placeholder="https://www.tiktok.com/@... or Reel / Short / YouTube link"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        <div>
          <label className="eyebrow">What you want to say (optional)</label>
          <textarea
            className="field mt-2"
            rows={3}
            placeholder="Your angle, offer, or the point you want to land."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div>
          <label className="eyebrow">Inspiration fidelity</label>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {FIDELITY.map((f) => (
              <button
                key={f.id}
                onClick={() => setFidelity(f.id)}
                className={`glass p-3 text-left ${
                  fidelity === f.id ? 'ring-1 ring-coral' : ''
                }`}
              >
                <div className="font-heading">{f.label}</div>
                <div className="text-xs text-stone">{f.note}</div>
              </button>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-white/5 p-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={deepRead}
            onChange={(e) => setDeepRead(e.target.checked)}
          />
          <span className="text-sm">
            <span className="font-heading text-cream">Read the actual video</span>
            <span className="block text-xs text-stone">
              We transcribe the real clip and analyze its true structure — a sharper, literal read.
              Takes ~1–2 min.
            </span>
          </span>
        </label>

        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-stone">
            {videosFromCredits(profile?.credits ?? 0)} recreations left
          </span>
          <button className="btn-primary" onClick={run} disabled={busy}>
            {busy ? progress || 'Reading the reference…' : 'Generate blueprint'}
          </button>
        </div>
        {err && <p className="text-sm text-coral">{err}</p>}
      </div>
    </main>
  )
}
