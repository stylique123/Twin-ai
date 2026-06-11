import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Wand2, Loader2, Sparkles, Target, Shuffle, Feather, ScanSearch } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { generateBlueprint, ingestReference, getJob } from '../lib/api'
import { BLUEPRINT_COST, videosFromCredits } from '../lib/brand'
import { Aurora } from '../components/Aurora'
import { Reveal, EASE } from '../components/motion'
import { cn } from '../lib/cn'

const FIDELITY = [
  { id: 'close', label: 'Close', note: 'Stay tight to the reference structure.', icon: Target },
  { id: 'balanced', label: 'Balanced', note: 'Proven shape, your spin.', icon: Shuffle },
  { id: 'loose', label: 'Loose', note: 'Just the inspiration, mostly you.', icon: Feather },
] as const

export default function Studio() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // A "Remix" click from the Gallery deep-links here with ?ref= prefilled.
  const [url, setUrl] = useState(() => params.get('ref') ?? '')
  const [note, setNote] = useState(() => params.get('note') ?? '')
  const [fidelity, setFidelity] = useState<'close' | 'balanced' | 'loose'>('balanced')
  const [deepRead, setDeepRead] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const left = videosFromCredits(profile?.credits ?? 0)
  const lowCredits = (profile?.credits ?? 0) < BLUEPRINT_COST

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
    <main className="relative overflow-clip">
      <Aurora className="opacity-60" />
      <div className="relative mx-auto max-w-3xl px-5 py-12 lg:py-16">
        <Reveal>
          <p className="eyebrow">The studio</p>
          <h1 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">
            Drop a reference. Get it <span className="gradient-text">shootable.</span>
          </h1>
          <p className="mt-3 text-sand">
            Turn a two-hour filming-and-editing slog into a focused 20-minute sprint.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="glass mt-9 space-y-6 p-6 sm:p-7">
            {/* Reference link */}
            <div>
              <label className="eyebrow flex items-center gap-2">
                <Link2 className="h-3.5 w-3.5" /> Reference link
              </label>
              <input
                className="field mt-2"
                placeholder="https://www.tiktok.com/@… or Reel / Short / YouTube link"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            {/* Note */}
            <div>
              <label className="eyebrow">What you want to say (optional)</label>
              <textarea
                className="field mt-2 resize-none"
                rows={3}
                placeholder="Your angle, offer, or the point you want to land."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {/* Fidelity */}
            <div>
              <label className="eyebrow">Inspiration fidelity</label>
              <div className="mt-2 grid gap-2.5 sm:grid-cols-3">
                {FIDELITY.map((f) => {
                  const active = fidelity === f.id
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFidelity(f.id)}
                      className={cn(
                        'rounded-card border p-3.5 text-left transition-all duration-300',
                        active
                          ? 'border-coral/50 bg-coral/10 shadow-glow'
                          : 'border-white/8 bg-white/[0.03] hover:border-white/16',
                      )}
                    >
                      <f.icon className={cn('h-4 w-4', active ? 'text-coral' : 'text-stone')} />
                      <div className="mt-2 font-heading">{f.label}</div>
                      <div className="text-xs text-stone">{f.note}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Deep read */}
            <button
              type="button"
              onClick={() => setDeepRead((v) => !v)}
              className={cn(
                'flex w-full items-start gap-3 rounded-card border p-3.5 text-left transition-all duration-300',
                deepRead ? 'border-teal/40 bg-teal/8' : 'border-white/8 bg-white/[0.03] hover:border-white/16',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors',
                  deepRead ? 'border-teal bg-teal text-ink' : 'border-white/25',
                )}
              >
                {deepRead && <ScanSearch className="h-3.5 w-3.5" />}
              </span>
              <span className="text-sm">
                <span className="font-heading text-cream">Read the actual video</span>
                <span className="block text-xs text-stone">
                  We transcribe the real clip and analyze its true structure — a sharper, literal read.
                  Takes ~1–2 min.
                </span>
              </span>
            </button>

            {/* Action row */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-5">
              <span className="chip">
                <Sparkles className="h-3.5 w-3.5 text-amber" /> {left} recreations left
              </span>
              <button className="btn-gradient min-w-[200px]" onClick={run} disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {progress || 'Reading the reference…'}
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" /> Generate blueprint
                  </>
                )}
              </button>
            </div>

            <AnimatePresence>
              {err && (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral"
                >
                  {err}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </Reveal>
      </div>
    </main>
  )
}
