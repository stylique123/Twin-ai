import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Wand2, Loader2, Sparkles, Target, Shuffle, Feather, ScanSearch, FileText, Wind, Activity, Flame, SlidersHorizontal, Layers, Video, Mic, Bookmark, BookmarkPlus, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { generateBlueprint, ingestReference, getJob, listBrandVoices, listTemplates, saveTemplate, deleteTemplate, type ReferenceTemplate } from '../lib/api'
import type { BrandVoice } from '../lib/types'
import { BLUEPRINT_COST } from '../lib/brand'
import { Aurora } from '../components/Aurora'
import { Reveal, EASE } from '../components/motion'
import { cn } from '../lib/cn'
import { BuildProgress, type BuildStage } from '../components/BuildProgress'

const FIDELITY = [
  { id: 'close', label: 'Close', note: 'Stay tight to the reference structure.', icon: Target },
  { id: 'balanced', label: 'Balanced', note: 'Proven shape, your spin.', icon: Shuffle },
  { id: 'loose', label: 'Loose', note: 'Just the inspiration, mostly you.', icon: Feather },
] as const

// How the script should SOUND. Panel finding: the founder/B2B persona (and the pro)
// feared a "try-hard TikTok" tone in front of buyers and wanted a no-hype dial.
const TONE = [
  { id: 'understated', label: 'Understated', note: 'Calm, credible, no hype — great for B2B / founders.', icon: Wind },
  { id: 'balanced', label: 'Balanced', note: 'Natural energy, your default.', icon: Activity },
  { id: 'punchy', label: 'Punchy', note: 'High-energy, bold hooks.', icon: Flame },
] as const

// DELIVERY decides whether the creator has to be on camera. Panel finding: the
// founder/B2B persona wanted a "no-face" mode they could actually ship.
const DELIVERY = [
  { id: 'on_camera', label: 'On camera', note: 'You appear and deliver to camera.', icon: Video },
  { id: 'voiceover', label: 'Voiceover / no face', note: 'Voiceover over screen-recordings, demos & b-roll — no face needed.', icon: Mic },
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
  { label: 'Fetching the real video', icon: Link2, est: 12, flavor: ['Locating the source clip', 'Pulling the media'] },
  { label: 'Transcribing & reading its structure', icon: ScanSearch, est: 48, flavor: ['Transcribing the audio', 'Mapping the hook', 'Reading the retention beats', 'Spotting the winning pattern'] },
  { label: 'Writing your script, in your voice', icon: FileText, est: 52, flavor: ['Studying your voice DNA', 'Drafting hook options', 'Writing your script', 'Building the shot list', 'Polishing captions & publish plan'] },
]

export default function Studio() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // A "Remix" click from the Gallery deep-links here with ?ref= prefilled; the
  // landing "Drop a link" stashes it in localStorage so it survives signup +
  // onboarding. Consume the stash once.
  const [url, setUrl] = useState(() => {
    const q = params.get('ref')
    if (q) return q
    try {
      const pending = localStorage.getItem('twinai_pending_remix')
      if (pending) { localStorage.removeItem('twinai_pending_remix'); return pending }
    } catch { /* storage off */ }
    return ''
  })
  const [note, setNote] = useState(() => params.get('note') ?? '')
  const [fidelity, setFidelity] = useState<'close' | 'balanced' | 'loose'>('balanced')
  const [tone, setTone] = useState<'understated' | 'balanced' | 'punchy'>('balanced')
  const [delivery, setDelivery] = useState<'on_camera' | 'voiceover'>('on_camera')
  // Bulk mode: paste several links (one per line) and get a script for each in
  // one run — the agency "batch a week in an afternoon" ask.
  const [bulk, setBulk] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  // Reusable reference templates — save a proven reference + its settings, re-remix later.
  const [templates, setTemplates] = useState<ReferenceTemplate[]>([])
  useEffect(() => { listTemplates().then(setTemplates).catch(() => {}) }, [])
  const applyTemplate = (t: ReferenceTemplate) => {
    setBulk(false)
    setUrl(t.reference_url)
    setNote(t.note ?? '')
    if (t.fidelity) setFidelity(t.fidelity as 'close' | 'balanced' | 'loose')
    if (t.tone) setTone(t.tone as 'understated' | 'balanced' | 'punchy')
    if (t.delivery) setDelivery(t.delivery as 'on_camera' | 'voiceover')
  }
  const saveAsTemplate = async () => {
    const link = (bulk ? url.split(/\n+/)[0] : url).trim()
    if (!link) return setErr('Paste a link first, then save it as a template.')
    const name = (window.prompt('Name this template', link.slice(0, 48)) || '').trim()
    if (!name) return
    const t = await saveTemplate({ name, reference_url: link, note: note.trim(), fidelity, tone, delivery })
    if (t) setTemplates((prev) => [t, ...prev])
  }
  const removeTemplate = async (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id))
    await deleteTemplate(id).catch(() => {})
  }
  // Fidelity + tone are advanced knobs — hidden by default so the studio is a single
  // clear input (paste → make). Power users open "Advanced" to tune them.
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [slowRead, setSlowRead] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Which brand voice this blueprint will be written in — agencies must know
  // they're writing for the right client before they spend a remix.
  const [activeBrand, setActiveBrand] = useState<BrandVoice | null>(null)
  useEffect(() => {
    listBrandVoices().then((vs) => {
      const ready = vs.filter((v) => v.status === 'ready')
      setActiveBrand(ready.find((v) => v.is_default) ?? ready[0] ?? null)
    }).catch(() => {})
  }, [])

  const lowCredits = (profile?.credits ?? 0) < BLUEPRINT_COST

  // Transcribe the real clip and return its transcript id. Throws (without ever
  // charging a recreation) if the video can't be read, generation only runs on
  // a real read, never a blind guess.
  const analyzeRealVideo = async (link: string): Promise<string> => {
    setPhase('fetching')
    const { jobId, transcriptId } = await ingestReference(link)
    // Cache hit: this reference was already transcribed + structured — use it now,
    // no polling, no transcribe wait.
    if (transcriptId) return transcriptId
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 2500))
      const job = await getJob(jobId)
      if (!job) continue
      if (job.status === 'done' && job.result?.transcript_id) return job.result.transcript_id
      if (job.status === 'failed') throw new Error(job.error || 'Could not read that video. Try another reference.')
      if (job.status === 'running') setPhase('transcribing')
    }
    throw new Error('Reading the video is taking longer than usual. Try again in a moment — you weren’t charged a remix.')
  }

  // Read one real clip then write its blueprint. Returns the new generation id.
  const runOne = async (link: string): Promise<string> => {
    const transcript_id = await analyzeRealVideo(link)
    setPhase('writing')
    const gen = await generateBlueprint({
      reference_url: link,
      reference_note: note.trim(),
      fidelity,
      tone,
      delivery,
      transcript_id,
    })
    return gen.id
  }

  const run = async () => {
    setErr(null)
    // In bulk mode the field holds one link per line; otherwise it's a single link.
    const links = (bulk ? url.split(/\n+/) : [url]).map((l) => l.trim()).filter(Boolean)
    if (!links.length) return setErr(bulk ? 'Paste at least one link, one per line.' : 'Paste a reference link first.')
    if (lowCredits) return setErr('That was your last remix. Upgrade to keep going.')
    setBusy(true)
    // Long clips can push the read past the advertised ~1-2 min. After 90s, swap
    // the footer copy so the progress overlay stays HONEST instead of looking stuck.
    const slowTimer = setTimeout(() => setSlowRead(true), 150_000)
    try {
      // Single link: the classic flow — straight to the finished script.
      if (links.length === 1) {
        const id = await runOne(links[0])
        await refreshProfile()
        // One flow: straight to the create screen (script + hook + record/upload +
        // edit + download, one page). The full blueprint stays a click away there.
        navigate(`/record/${id}`)
        return
      }
      // Bulk: process sequentially. Skip a link that can't be read; stop early if
      // remixes run out. Each finished script lands in the Library.
      let made = 0
      let outOfRemixes = false
      for (let i = 0; i < links.length; i++) {
        setBulkProgress({ done: i, total: links.length })
        setPhase('fetching')
        try {
          await runOne(links[i])
          made++
          await refreshProfile()
        } catch (e) {
          const msg = e instanceof Error ? e.message : ''
          if (/credit|remix|upgrade/i.test(msg)) { outOfRemixes = true; break }
          // a single unreadable link shouldn't kill the batch — skip it
        }
      }
      setBulkProgress(null)
      if (made > 0) {
        if (outOfRemixes) setErr(`Made ${made} of ${links.length} — that was your last remix.`)
        navigate('/history')
      } else {
        setErr('None of those links could be read. Try different references.')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      clearTimeout(slowTimer)
      setSlowRead(false)
      setBusy(false)
      setPhase('idle')
      setBulkProgress(null)
    }
  }

  return (
    <main className="relative min-h-screen overflow-clip">
      <Aurora className="opacity-60" />
      <div className="relative mx-auto max-w-3xl px-5 py-12 lg:py-16">
        <Reveal>
          <span className="inline-flex items-center rounded-full border border-coral/40 px-3 py-1 text-xs font-bold tracking-wider text-coral">STEP 1 OF 5</span>
          <h1 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">
            Give us a reference. <span className="gradient-text">We'll build your blueprint.</span>
          </h1>
          <p className="mt-3 text-sand">
            We read the actual video, transcript and true structure, then write your blueprint in your voice.
          </p>
          {activeBrand && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-sand">
              <Sparkles className="h-3.5 w-3.5 text-amber" /> Writing in <span className="font-semibold text-cream">@{activeBrand.handle}</span>’s voice
              <Link to="/brands" className="text-amber transition-colors hover:text-cream">switch</Link>
            </p>
          )}
        </Reveal>

        <Reveal delay={0.08}>
          <div className="glass relative mt-9 space-y-6 p-6 sm:p-7">
            {/* Reusable templates: save a proven reference + settings, re-remix later. */}
            <div className="flex flex-wrap items-center gap-2">
              {templates.map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] py-1 pl-3 pr-1 text-xs text-sand">
                  <button onClick={() => applyTemplate(t)} className="inline-flex items-center gap-1 transition-colors hover:text-cream" title="Load this template">
                    <Bookmark className="h-3 w-3 text-amber" /> {t.name}
                  </button>
                  <button onClick={() => removeTemplate(t.id)} aria-label="Delete template" className="grid h-4 w-4 place-items-center rounded-full text-stone transition-colors hover:text-coral">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button onClick={saveAsTemplate} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-white/15 px-3 py-1 text-xs text-stone transition-colors hover:text-cream disabled:opacity-50">
                <BookmarkPlus className="h-3.5 w-3.5" /> Save as template
              </button>
            </div>

            {/* Reference link */}
            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="eyebrow flex items-center gap-2">
                  <Link2 className="h-3.5 w-3.5" /> {bulk ? 'Reference links' : 'Reference link'}
                </label>
                <button
                  type="button"
                  onClick={() => setBulk((v) => !v)}
                  disabled={busy}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50',
                    bulk ? 'border-coral/50 bg-coral/10 text-cream' : 'border-white/10 text-stone hover:text-cream',
                  )}
                  title="Paste several links and get a script for each"
                >
                  <Layers className="h-3.5 w-3.5" /> Bulk
                </button>
              </div>
              {bulk ? (
                <textarea
                  className="field mt-2 resize-none"
                  rows={4}
                  placeholder={'One link per line:\nhttps://www.tiktok.com/@…\nhttps://www.youtube.com/shorts/…'}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={busy}
                />
              ) : (
                <input
                  className="field mt-2"
                  placeholder="https://www.tiktok.com/@… or Reel / Short / YouTube link"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={busy}
                />
              )}
              <p className="mt-2 flex items-center gap-1.5 text-xs text-teal">
                <ScanSearch className="h-3.5 w-3.5" /> We transcribe and analyze the real clip, every time.
              </p>
              <p className="mt-1.5 text-xs text-stone">
                {bulk
                  ? 'One link per line. We write a script for each — one remix per link — and they all land in your Library.'
                  : "Best results: a short, punchy reel / Short / TikTok with a strong hook (under ~90s) from your niche — the one you wish you'd made."}
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

            {/* Advanced (fidelity + tone) — collapsed by default. */}
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-stone transition-colors hover:text-cream"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> {advancedOpen ? 'Hide' : 'Advanced'}
            </button>
            {advancedOpen && (<>
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

            {/* Tone */}
            <div>
              <label className="eyebrow">How should it sound?</label>
              <div className="mt-2 grid gap-2.5 sm:grid-cols-3">
                {TONE.map((t) => {
                  const active = tone === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTone(t.id)}
                      disabled={busy}
                      className={cn(
                        'rounded-card border p-3.5 text-left transition-all duration-300 disabled:opacity-50',
                        active
                          ? 'border-coral/50 bg-coral/10 shadow-glow'
                          : 'border-white/8 bg-white/[0.03] hover:border-white/16',
                      )}
                    >
                      <t.icon className={cn('h-4 w-4', active ? 'text-coral' : 'text-stone')} />
                      <div className="mt-2 font-heading">{t.label}</div>
                      <div className="text-xs text-stone">{t.note}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Delivery: on-camera vs no-face voiceover */}
            <div>
              <label className="eyebrow">Will you be on camera?</label>
              <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
                {DELIVERY.map((d) => {
                  const active = delivery === d.id
                  return (
                    <button
                      key={d.id}
                      onClick={() => setDelivery(d.id)}
                      disabled={busy}
                      className={cn(
                        'rounded-card border p-3.5 text-left transition-all duration-300 disabled:opacity-50',
                        active
                          ? 'border-coral/50 bg-coral/10 shadow-glow'
                          : 'border-white/8 bg-white/[0.03] hover:border-white/16',
                      )}
                    >
                      <d.icon className={cn('h-4 w-4', active ? 'text-coral' : 'text-stone')} />
                      <div className="mt-2 font-heading">{d.label}</div>
                      <div className="text-xs text-stone">{d.note}</div>
                    </button>
                  )
                })}
              </div>
            </div>
            </>)}

            {/* Action row */}
            <div className="flex border-t border-white/8 pt-5">
              <button className="btn-gradient w-full" onClick={run} disabled={busy || lowCredits}>
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {bulkProgress ? `Making ${bulkProgress.done + 1} of ${bulkProgress.total}…` : 'Reading the real clip…'}
                  </>
                ) : lowCredits ? (
                  <>Out of remixes</>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" /> {bulk ? 'Remix all links' : 'Remix'}
                  </>
                )}
              </button>
            </div>
            {lowCredits && (
              <p className="text-center text-xs text-stone">
                You're out of remixes. <Link to="/settings" className="text-amber hover:text-cream">Upgrade</Link> to keep creating — every video you've already finished stays yours to download.
              </p>
            )}

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
                      footer={bulkProgress
                        ? `Batch in progress — ${bulkProgress.done + 1} of ${bulkProgress.total}. Each finished script lands in your Library.`
                        : slowRead
                        ? "Still reading — longer clips take a little more. We don't charge a remix unless this finishes."
                        : "Reading the real clip takes ~2-3 min — longer for longer videos. We don't charge a remix unless this finishes."}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Reveal>

        {/* Flow rail — the real stages: reference now, then blueprint, record, edit, export. */}
        <Reveal delay={0.15}>
          <div className="mt-8 flex items-center">
            {['Reference', 'Blueprint', 'Record', 'Edit', 'Export'].map((label, i) => (
              <div key={label} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center">
                  <span className={cn('grid h-8 w-8 place-items-center rounded-full border text-xs font-bold', i === 0 ? 'border-coral bg-coral/15 text-coral' : 'border-white/15 text-stone')}>{i + 1}</span>
                  <span className={cn('mt-1.5 text-[11px]', i === 0 ? 'text-cream' : 'text-stone')}>{label}</span>
                </div>
                {i < 4 && <span className="mx-1 mb-5 h-px flex-1 bg-white/10" />}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </main>
  )
}
