import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Wand2, Loader2, Sparkles, Target, Shuffle, Feather, ScanSearch, FileText } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { generateBlueprint, ingestReference, getJob } from '../lib/api'
import { BLUEPRINT_COST, videosFromCredits } from '../lib/brand'
import { Aurora } from '../components/Aurora'
import { Reveal, EASE } from '../components/motion'
import { cn } from '../lib/cn'
import { BuildProgress, type BuildStage } from '../components/BuildProgress'

const FIDELITY = [
  { id: 'close', label: 'Close', note: 'Stay tight to the reference structure.', icon: Target },
  { id: 'balanced', label: 'Balanced', note: 'Proven shape, your spin.', icon: Shuffle },
  { id: 'loose', label: 'Loose', note: 'Just the inspiration, mostly you.', icon: Feather },
] as const

// The studio ALWAYS reads the real video now: paste a link, we transcribe the
// actual clip and analyze its true structure, then write the blueprint from that
// real read in the creator's voice. No "blind" mode, that produced generic
// blueprints unrelated to the reference and still charged a recreation.
type Phase = 'idle' | 'fetching' | 'transcribing' | 'writing'

const PHASE_ORDER: Phase[] = ['idle', 'fetching', 'transcribing', 'writing']

// Stages for the live BuildProgress overlay. `est` paces the creeping bar and the
// rotating `flavor` lines so the long "writing" model call never looks frozen.
const STUDIO_STAGES: BuildStage[] = [
  { label: 'Fetching the real video', icon: Link2, est: 8, flavor: ['Locating the source clip', 'Pulling the media'] },
  { label: 'Transcribing & reading its structure', icon: ScanSearch, est: 22, flavor: ['Transcribing the audio', 'Mapping the hook', 'Reading the retention beats', 'Spotting the winning pattern'] },
  { label: 'Writing your blueprint, in your voice', icon: FileText, est: 42, flavor: ['Studying your voice DNA', 'Drafting hook options', 'Writing your script', 'Building the shot list', 'Polishing captions & publish plan'] },
]

export default function Studio() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // A "Remix" click from the Gallery deep-links here with ?ref= prefilled.
  const [url, setUrl] = useState(() => params.get('ref') ?? '')
  const [note, setNote] = useState(() => params.get('note') ?? '')
  const [fidelity, setFidelity] = useState<'close' | 'balanced' | 'loose'>('balanced')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [err, setErr] = useState<string | null>(null)

  const left = videosFromCredits(profile?.credits ?? 0)
  const lowCredits = (profile?.credits ?? 0) < BLUEPRINT_COST

  // Transcribe the real clip and return its transcript id. Throws (without ever
  // charging a recreation) if the video can't be read, generation only runs on
  // a real read, never a blind guess.
  const analyzeRealVideo = async (link: string): Promise<string> => {
    setPhase('fetching')
    const jobId = await ingestReference(link)
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      const job = await getJob(jobId)
      if (!job) continue
      if (job.status === 'done' && job.result?.transcript_id) return job.result.transcript_id
      if (job.status === 'failed') throw new Error(job.error || 'Could not read that video. Try another reference.')
      if (job.status === 'running') setPhase('transcribing')
    }
    throw new Error('Reading the video is taking too long, please try again in a moment.')
  }

  const run = async () => {
    setErr(null)
    if (!url.trim()) return setErr('Paste a reference link first.')
    if (lowCredits) return setErr("You're out of recreations for now, upgrade to keep going.")
    setBusy(true)
    try {
      // ALWAYS read the actual video first.
      const transcript_id = await analyzeRealVideo(url.trim())
      setPhase('writing')
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
      setPhase('idle')
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
            We read the actual video, transcript and true structure, then write your blueprint in your voice.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="glass relative mt-9 space-y-6 p-6 sm:p-7">
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
                disabled={busy}
              />
              <p className="mt-2 flex items-center gap-1.5 text-xs text-teal">
                <ScanSearch className="h-3.5 w-3.5" /> We transcribe and analyze the real clip, every time.
              </p>
            </div>

            {/* Optional personalization */}
            <div>
              <label className="eyebrow">Your angle <span className="text-stone">(optional)</span></label>
              <textarea
                className="field mt-2 resize-none"
                rows={2}
                placeholder="Add your own spin, offer, or the point you want to land. Leave blank to follow the reference."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy}
              />
            </div>

            {/* Fidelity */}
            <div>
              <label className="eyebrow">How close to the reference?</label>
              <div className="mt-2 grid gap-2.5 sm:grid-cols-3">
                {FIDELITY.map((f) => {
                  const active = fidelity === f.id
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFidelity(f.id)}
                      disabled={busy}
                      className={cn(
                        'rounded-card border p-3.5 text-left transition-all duration-300 disabled:opacity-50',
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

            {/* Action row */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-5">
              <span className="chip">
                <Sparkles className="h-3.5 w-3.5 text-amber" /> {left} recreations left
              </span>
              <button className="btn-gradient min-w-[220px]" onClick={run} disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Working…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" /> Read video & generate
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

            {/* Processing overlay, real, animated progress so it never looks frozen. */}
            <AnimatePresence>
              {busy && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="absolute inset-0 z-10 grid place-items-center rounded-card bg-ink/80 backdrop-blur-md"
                >
                  <div className="w-full max-w-sm px-6">
                    <BuildProgress
                      stages={STUDIO_STAGES}
                      active={Math.max(0, PHASE_ORDER.indexOf(phase) - 1)}
                      footer="Reading the real clip takes ~1-2 min. Hang tight, we don't charge a recreation unless this finishes."
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Reveal>
      </div>
    </main>
  )
}
