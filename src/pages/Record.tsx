import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Video, VideoOff, Circle, Square, RotateCcw, Download, ArrowLeft, Loader2,
  Play, Pause, FlipHorizontal2, Minus, Plus, Gauge, Mic, AlertTriangle, Check, Sparkles, Upload,
} from 'lucide-react'
import { getGeneration, autoEditTake, remakeEdit, getJob, updateGenerationChoice } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { Generation } from '../lib/types'
import { cn } from '../lib/cn'

type Phase = 'idle' | 'countdown' | 'recording' | 'review'

// In-app Record: a teleprompter over a live camera, so the blueprint gets shot
// the moment inspiration hits. Everything stays client-side, the take is yours
// to download (Phase 6 will hand it to the auto-editor).
const EDIT_STYLES = [
  { id: 'punchy', label: 'Punchy', note: 'Fast jump-cuts, energetic captions' },
  { id: 'clean', label: 'Clean', note: 'Tidy cuts, calm captions' },
  { id: 'cinematic', label: 'Cinematic', note: 'Smoother pacing, softer captions' },
] as const

export default function Record() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const uploadMode = params.get('upload') === '1'
  const { refreshProfile } = useAuth()
  const [gen, setGen] = useState<Generation | null>(null)
  const [loading, setLoading] = useState(true)
  const [editStyle, setEditStyle] = useState('punchy')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const promptRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const offsetRef = useRef(0)

  const [camReady, setCamReady] = useState(false)
  const [camError, setCamError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [count, setCount] = useState(3)
  const [elapsed, setElapsed] = useState(0)
  const [takeUrl, setTakeUrl] = useState<string | null>(null)
  const takeBlobRef = useRef<Blob | null>(null)

  // auto-edit state
  const [editPhase, setEditPhase] = useState<'none' | 'working' | 'done' | 'error'>('none')
  const [editStatus, setEditStatus] = useState('')
  const [editPct, setEditPct] = useState(0)
  const [editUrl, setEditUrl] = useState<string | null>(null)
  const [editErr, setEditErr] = useState<string | null>(null)
  const takePathRef = useRef<string | null>(null)
  const [variation, setVariation] = useState(0)

  // teleprompter controls
  const [scrolling, setScrolling] = useState(false)
  const [speed, setSpeed] = useState(42) // px/sec
  const [fontPx, setFontPx] = useState(38)
  const [mirror, setMirror] = useState(false)
  const [active, setActive] = useState(0) // line currently at the read line
  const lineEls = useRef<(HTMLParagraphElement | null)[]>([])

  useEffect(() => {
    if (!id) return
    getGeneration(id)
      .then((g) => { setGen(g); if (g?.edit_style) setEditStyle(g.edit_style) })
      .catch(() => setGen(null))
      .finally(() => setLoading(false))
  }, [id])

  // Teleprompter shows ONLY what the creator speaks (chosen hook + script lines).
  // The hook is the one the creator picked on the blueprint (selected_hook), so
  // the prompter opens with exactly what they decided to shoot.
  const lines = useMemo(() => {
    const b = gen?.blueprint
    if (!b) return [] as { kind: 'hook' | 'line'; text: string }[]
    const out: { kind: 'hook' | 'line'; text: string }[] = []
    const hook = gen?.selected_hook ?? b.hook_options?.[0]
    if (hook) out.push({ kind: 'hook', text: hook })
    for (const s of b.script ?? []) {
      if (s.line?.trim()) out.push({ kind: 'line', text: s.line })
    }
    return out
  }, [gen])

  const chooseStyle = (s: string) => {
    setEditStyle(s)
    if (id) void updateGenerationChoice(id, { edit_style: s })
  }

  // Upload-your-own-clip path: load a picked video as the "take" and jump to
  // review, where the existing auto-edit flow takes over (no recording needed).
  const onUploadFile = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('video/')) { setCamError('Please choose a video file.'); return }
    if (takeUrl) URL.revokeObjectURL(takeUrl)
    takeBlobRef.current = file
    setTakeUrl(URL.createObjectURL(file))
    setEditPhase('none'); setEditUrl(null); setEditErr(null)
    setCamReady(true)
    setPhase('review')
  }

  // Which line sits at the read guide (~38% down the prompter). Keeps the active
  // line bright + scaled and dims the rest, so the eye always knows where to read.
  const updateActive = () => {
    const el = promptRef.current
    if (!el) return
    const readY = el.getBoundingClientRect().top + el.clientHeight * 0.38
    let best = 0
    let bestDist = Infinity
    lineEls.current.forEach((p, i) => {
      if (!p) return
      const r = p.getBoundingClientRect()
      const d = Math.abs(r.top + r.height / 2 - readY)
      if (d < bestDist) { bestDist = d; best = i }
    })
    setActive((prev) => (prev === best ? prev : best))
  }

  // ---- camera lifecycle ----
  const startCamera = async () => {
    setCamError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setCamReady(true)
    } catch (e) {
      setCamError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Camera/mic permission was blocked. Allow access in your browser and try again.'
          : 'Could not access your camera. Check it isn’t in use by another app.',
      )
    }
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (takeUrl) URL.revokeObjectURL(takeUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- teleprompter scroll loop ----
  useEffect(() => {
    if (!scrolling) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }
    let last = performance.now()
    const step = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      offsetRef.current += speed * dt
      const el = promptRef.current
      if (el) {
        const max = el.scrollHeight - el.clientHeight
        if (offsetRef.current >= max) {
          offsetRef.current = max
          setScrolling(false)
        }
        el.scrollTop = offsetRef.current
        updateActive()
      }
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrolling, speed])

  const resetPrompt = () => {
    offsetRef.current = 0
    if (promptRef.current) promptRef.current.scrollTop = 0
    setActive(0)
    setScrolling(false)
  }

  // ---- recording ----
  const pickMime = () => {
    const c = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    return c.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
  }

  const beginRecording = () => {
    if (!streamRef.current) return
    chunksRef.current = []
    if (takeUrl) {
      URL.revokeObjectURL(takeUrl)
      setTakeUrl(null)
    }
    const mime = pickMime()
    const rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined)
    rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data)
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime || 'video/webm' })
      takeBlobRef.current = blob
      setTakeUrl(URL.createObjectURL(blob))
      setEditPhase('none')
      setEditUrl(null)
      setEditErr(null)
      setPhase('review')
    }
    recorderRef.current = rec
    rec.start()
    setPhase('recording')
    setElapsed(0)
    resetPrompt()
    setScrolling(true)
  }

  // countdown → record
  useEffect(() => {
    if (phase !== 'countdown') return
    if (count === 0) {
      beginRecording()
      return
    }
    const t = setTimeout(() => setCount((c) => c - 1), 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, count])

  // elapsed timer while recording
  useEffect(() => {
    if (phase !== 'recording') return
    const t = setInterval(() => setElapsed((e) => e + 0.1), 100)
    return () => clearInterval(t)
  }, [phase])

  const startCountdown = () => {
    setCount(3)
    setPhase('countdown')
  }
  const stopRecording = () => {
    recorderRef.current?.stop()
    setScrolling(false)
  }
  const reshoot = () => {
    setPhase('idle')
    resetPrompt()
    setEditPhase('none')
    setEditUrl(null)
    if (editUrl) URL.revokeObjectURL(editUrl)
  }

  // ---- poll a queued edit job to completion ----
  const pollEdit = async (jobId: string) => {
    setEditStatus('Queued…'); setEditPct(8)
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const job = await getJob(jobId)
      if (!job) continue
      if (job.status === 'done' && job.result?.output_url) {
        setEditPct(100)
        setEditUrl(job.result.output_url)
        setEditPhase('done')
        return
      }
      if (job.status === 'failed') throw new Error(job.error || 'The edit could not finish.')
      // Show the REAL stage the worker reports (Reading words → Directing → Cutting
      // → Rendering → Finishing) so it never looks frozen.
      const p = job.result?.progress
      if (p && p.label) { setEditStatus(p.label); setEditPct(Math.max(8, Math.min(99, p.pct))) }
      else setEditStatus(job.status === 'running' ? 'Editing your video…' : 'Queued…')
    }
    throw new Error('The edit is taking longer than expected, check your Library shortly.')
  }

  // ---- first auto-edit: FREE (bundled with the blueprint) ----
  const runAutoEdit = async () => {
    if (!takeBlobRef.current || !id) return
    setEditErr(null)
    setEditPhase('working')
    setEditStatus('Uploading your take…'); setEditPct(3)
    try {
      const { jobId, takePath } = await autoEditTake(id, takeBlobRef.current)
      takePathRef.current = takePath
      await pollEdit(jobId)
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : 'Auto-edit failed.')
      setEditPhase('error')
    }
  }

  // ---- remake: a fresh look, costs one recreation ----
  const runRemake = async () => {
    if (!takePathRef.current || !id) return
    setEditErr(null)
    setEditPhase('working')
    setEditStatus('Remaking, a fresh edit…'); setEditPct(3)
    const nextVar = variation + 1
    setVariation(nextVar)
    try {
      const jobId = await remakeEdit(id, takePathRef.current, nextVar)
      if (editUrl) URL.revokeObjectURL(editUrl)
      setEditUrl(null)
      await pollEdit(jobId)
      await refreshProfile()
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : 'Remake failed.')
      setEditPhase('error')
    }
  }

  const inHook = phase === 'recording' && elapsed <= 3

  if (loading)
    return (
      <div className="grid min-h-[60vh] place-items-center text-sand">
        <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading your script…</span>
      </div>
    )

  if (!gen)
    return (
      <div className="mx-auto max-w-md px-5 py-20 text-center">
        <p className="font-heading text-lg">We couldn’t load that blueprint.</p>
        <Link to="/history" className="btn-gradient mt-6 inline-flex">Back to Library</Link>
      </div>
    )

  return (
    <main className="relative mx-auto max-w-6xl px-5 py-8 lg:py-10">
      <div className="flex items-center justify-between gap-3">
        <Link to={`/result/${id}`} className="inline-flex items-center gap-1.5 text-sm text-stone hover:text-cream">
          <ArrowLeft className="h-4 w-4" /> Back to blueprint
        </Link>
        <span className="chip"><Mic className="h-3.5 w-3.5 text-coral" /> {uploadMode ? 'Edit your clip' : 'Record studio'}</span>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => onUploadFile(e.target.files?.[0])}
      />

      <div className="mt-4 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        {/* ---------- camera + teleprompter ---------- */}
        <div className="relative overflow-hidden rounded-panel border border-white/10 bg-black shadow-lift">
          {/* Always 9:16 — this is a vertical-video tool, and the old sm:aspect-video
              flipped the phone preview to letterboxed landscape. */}
          <div className="relative aspect-[9/16] max-h-[78vh] w-full">
            <video
              ref={videoRef}
              playsInline
              muted
              className={cn('h-full w-full object-cover', mirror && 'scale-x-[-1]')}
            />

            {/* no camera yet */}
            {!camReady && (
              <div className="absolute inset-0 grid place-items-center bg-ink/90 p-6 text-center">
                {camError ? (
                  <div className="max-w-sm">
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-coral/15">
                      <AlertTriangle className="h-6 w-6 text-coral" />
                    </span>
                    <p className="mt-4 text-sm text-coral">{camError}</p>
                    <button onClick={() => { setCamError(null); uploadMode ? fileInputRef.current?.click() : startCamera() }} className="btn-ghost mt-5">Try again</button>
                  </div>
                ) : uploadMode ? (
                  <div>
                    <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-signature-soft">
                      <Upload className="h-6 w-6 text-cream" />
                    </span>
                    <p className="mt-4 font-heading text-lg">Upload your clip to auto-edit</p>
                    <p className="mt-1 text-sm text-stone">We’ll add captions, jump-cuts, framing & a cover. MP4 or MOV.</p>
                    <button onClick={() => fileInputRef.current?.click()} className="btn-gradient mt-5">
                      <Upload className="h-4 w-4" /> Choose a video
                    </button>
                    <button onClick={startCamera} className="mt-3 block w-full text-xs text-stone hover:text-cream">…or record with the teleprompter instead</button>
                  </div>
                ) : (
                  <div>
                    <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-signature-soft">
                      <Video className="h-6 w-6 text-cream" />
                    </span>
                    <p className="mt-4 font-heading text-lg">Turn on your camera to record</p>
                    <p className="mt-1 text-sm text-stone">Stays on your device, nothing is uploaded.</p>
                    <button onClick={startCamera} className="btn-gradient mt-5">
                      <Video className="h-4 w-4" /> Enable camera & mic
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="mt-3 block w-full text-xs text-stone hover:text-cream">…or upload a clip you already have</button>
                  </div>
                )}
              </div>
            )}

            {/* teleprompter overlay */}
            {camReady && phase !== 'review' && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[22%]">
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent" />
                {/* read-line guide: the eye reads at this band */}
                <div className="absolute inset-x-0 top-[38%] z-10 flex items-center gap-2 px-4 opacity-60">
                  <span className="h-px flex-1 bg-gradient-to-r from-transparent to-coral/70" />
                  <Play className="h-3 w-3 fill-coral text-coral" />
                  <span className="h-px flex-1 bg-gradient-to-l from-transparent to-coral/70" />
                </div>
                <div
                  ref={promptRef}
                  className="relative h-full overflow-hidden px-6 pb-8 pt-4"
                  style={{ maskImage: 'linear-gradient(to bottom, transparent, #000 14%, #000 86%, transparent)' }}
                >
                  {/* spacer pushes the first line down to the read guide */}
                  <div style={{ height: '34%' }} />
                  {/* Cap the prompter text to the viewport width on phones so the
                      default 38px doesn't overflow / collide on a 375px screen. */}
                  <div className="space-y-5 text-center" style={{ fontSize: `min(${fontPx}px, 7.2vw)` }}>
                    {lines.map((l, i) => (
                      <p
                        key={i}
                        ref={(el) => { lineEls.current[i] = el }}
                        className={cn(
                          'font-heading font-bold leading-tight transition-all duration-200',
                          i === active
                            ? 'scale-[1.04] text-cream opacity-100 [text-shadow:0_2px_12px_rgba(0,0,0,0.7)]'
                            : 'opacity-35',
                          l.kind === 'hook' && i === active && 'text-amber',
                        )}
                      >
                        {l.text}
                      </p>
                    ))}
                    <div className="h-[60%]" />
                  </div>
                </div>
              </div>
            )}

            {/* recording HUD */}
            {phase === 'recording' && (
              <div className="absolute left-3 top-3 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-coral/90 px-2.5 py-1 text-xs font-bold text-cream">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-cream" /> REC {elapsed.toFixed(1)}s
                </span>
                <AnimatePresence>
                  {inHook && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="rounded-full bg-amber/90 px-2.5 py-1 text-xs font-bold text-ink"
                    >
                      HOOK, land it now
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* countdown */}
            <AnimatePresence>
              {phase === 'countdown' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 grid place-items-center bg-black/50"
                >
                  <motion.span
                    key={count}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="font-display text-7xl text-cream sm:text-8xl"
                  >
                    {count === 0 ? 'GO' : count}
                  </motion.span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* review, show the edited render once ready, else the raw take */}
            {phase === 'review' && (takeUrl || editUrl) && (
              <div className="absolute inset-0 bg-black">
                <video
                  key={editUrl ?? takeUrl ?? ''}
                  src={editUrl ?? takeUrl ?? ''}
                  controls
                  playsInline
                  className="h-full w-full object-contain"
                />
                {editUrl && (
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-teal/90 px-2.5 py-1 text-xs font-bold text-ink">
                    <Check className="h-3.5 w-3.5" /> Auto-edited
                  </span>
                )}
                {editPhase === 'working' && (
                  <div className="absolute inset-0 grid place-items-center bg-ink/85 px-8 text-center backdrop-blur-sm">
                    <div className="w-full max-w-xs">
                      <Loader2 className="mx-auto h-7 w-7 animate-spin text-coral" />
                      <p className="mt-3 font-heading text-cream">{editStatus || 'Editing your video…'}</p>
                      {/* Real, moving progress bar so it never looks frozen/broken. */}
                      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber via-coral to-teal transition-all duration-700 ease-out"
                          style={{ width: `${editPct}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs font-medium text-stone">{editPct}%</p>
                      <p className="mt-3 text-[11px] leading-relaxed text-stone/80">Reading your words → directing the edit → cutting → rendering. Usually under a minute.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* transport bar */}
          {camReady && (
            <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-ink2/80 p-3">
              {phase === 'idle' && (
                <button onClick={startCountdown} className="btn-gradient">
                  <Circle className="h-4 w-4 fill-current" /> Start recording
                </button>
              )}
              {(phase === 'recording' || phase === 'countdown') && (
                <button onClick={stopRecording} className="btn-gradient">
                  <Square className="h-4 w-4 fill-current" /> Stop
                </button>
              )}
              {phase === 'review' && (
                <>
                  <button onClick={reshoot} className="btn-ghost" disabled={editPhase === 'working'}>
                    <RotateCcw className="h-4 w-4" /> Reshoot
                  </button>
                  {takeUrl && editPhase !== 'done' && (
                    <a href={takeUrl} download={`twinai-take-${id}.webm`} className="btn-ghost" title="Download the raw take">
                      <Download className="h-4 w-4" /> Download take
                    </a>
                  )}
                  {editPhase === 'done' && editUrl ? (
                    <>
                      <button onClick={runRemake} className="btn-ghost" disabled={editPhase !== 'done'} title="Re-edit with a fresh look, 1 recreation">
                        <Sparkles className="h-4 w-4" /> Remake · 1 recreation
                      </button>
                      <a href={editUrl} download={`twinai-edited-${id}.mp4`} className="btn-gradient">
                        <Download className="h-4 w-4" /> Download edited
                      </a>
                    </>
                  ) : (
                    <button onClick={runAutoEdit} className="btn-gradient" disabled={editPhase === 'working'}>
                      {editPhase === 'working' ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Editing…</>
                      ) : (
                        <><Sparkles className="h-4 w-4" /> Auto-edit this take</>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {editErr && (
            <p className="border-t border-white/10 bg-coral/10 px-4 py-2.5 text-center text-sm text-coral">{editErr}</p>
          )}
        </div>

        {/* ---------- side panel: prompter controls + script ---------- */}
        <div className="space-y-4">
          <div className="glass p-5">
            <h2 className="font-heading text-lg">Teleprompter</h2>
            <p className="mt-1 text-sm text-stone">Loaded from your blueprint, read it naturally.</p>

            <div className="mt-4 space-y-4">
              <Control icon={Play} label="Scroll">
                <button
                  onClick={() => setScrolling((v) => !v)}
                  className={cn('chip', scrolling && 'border-coral/60 bg-coral/10 text-cream')}
                  disabled={!camReady}
                >
                  {scrolling ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Play</>}
                </button>
                <button onClick={resetPrompt} className="chip" disabled={!camReady}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </button>
              </Control>

              <Control icon={Gauge} label={`Speed · ${speed}px/s`}>
                <Stepper onMinus={() => setSpeed((s) => Math.max(12, s - 6))} onPlus={() => setSpeed((s) => Math.min(120, s + 6))} />
              </Control>

              <Control icon={Plus} label={`Text size · ${fontPx}px`}>
                <Stepper onMinus={() => setFontPx((s) => Math.max(24, s - 3))} onPlus={() => setFontPx((s) => Math.min(72, s + 3))} />
              </Control>

              <Control icon={FlipHorizontal2} label="Mirror preview">
                <button
                  onClick={() => setMirror((v) => !v)}
                  className={cn('chip', mirror && 'border-coral/60 bg-coral/10 text-cream')}
                >
                  {mirror ? 'On' : 'Off'}
                </button>
              </Control>
            </div>
          </div>

          <div className="glass p-5">
            <h3 className="font-heading">Edit style</h3>
            <p className="mt-1 text-sm text-stone">How your auto-edit should feel.</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {EDIT_STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => chooseStyle(s.id)}
                  title={s.note}
                  className={cn(
                    'rounded-card border px-2 py-2.5 text-center text-xs font-medium transition-colors',
                    editStyle === s.id ? 'border-coral/55 bg-coral/10 text-cream' : 'border-white/8 bg-white/[0.02] text-stone hover:border-white/16',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-stone">{EDIT_STYLES.find((s) => s.id === editStyle)?.note}</p>
          </div>

          <div className="glass p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-heading">Full script</h3>
              <span className="text-xs text-stone">{gen.blueprint.script?.length ?? 0} lines</span>
            </div>
            <div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
              {gen.blueprint.hook_options?.[0] && (
                <p className="rounded-lg bg-amber/10 px-3 py-2 text-sm font-heading text-amber">
                  {gen.blueprint.hook_options[0]}
                </p>
              )}
              {gen.blueprint.script?.map((s, i) => (
                <div key={i} className="border-l-2 border-white/10 pl-3">
                  <div className="text-[10px] uppercase tracking-wider text-stone">{s.section}</div>
                  <p className="text-sm text-cream">{s.line}</p>
                  {s.direction && <p className="text-xs italic text-stone">( {s.direction} )</p>}
                </div>
              ))}
            </div>
          </div>

          {!camReady && !camError && (
            <p className="px-1 text-xs text-stone">
              <VideoOff className="mr-1 inline h-3.5 w-3.5" />
              Recording is private, your camera feed never leaves this device.
            </p>
          )}
        </div>
      </div>
    </main>
  )
}

function Control({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-sm text-sand">
        <Icon className="h-4 w-4 text-stone" /> {label}
      </span>
      <span className="flex items-center gap-2">{children}</span>
    </div>
  )
}

function Stepper({ onMinus, onPlus }: { onMinus: () => void; onPlus: () => void }) {
  return (
    <>
      <button onClick={onMinus} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 hover:border-white/20">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button onClick={onPlus} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 hover:border-white/20">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </>
  )
}
