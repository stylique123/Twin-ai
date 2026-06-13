import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Video, VideoOff, Circle, Square, RotateCcw, Download, ArrowLeft, Loader2,
  Play, Pause, FlipHorizontal2, Minus, Plus, Gauge, Mic, AlertTriangle, Check, Sparkles,
} from 'lucide-react'
import { getGeneration, autoEditTake, remakeEdit, getJob } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { Generation } from '../lib/types'
import { cn } from '../lib/cn'

type Phase = 'idle' | 'countdown' | 'recording' | 'review'

// In-app Record: a teleprompter over a live camera, so the blueprint gets shot
// the moment inspiration hits. Everything stays client-side — the take is yours
// to download (Phase 6 will hand it to the auto-editor).
export default function Record() {
  const { id } = useParams()
  const { refreshProfile } = useAuth()
  const [gen, setGen] = useState<Generation | null>(null)
  const [loading, setLoading] = useState(true)

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
  const [editUrl, setEditUrl] = useState<string | null>(null)
  const [editErr, setEditErr] = useState<string | null>(null)
  const takePathRef = useRef<string | null>(null)
  const [variation, setVariation] = useState(0)

  // teleprompter controls
  const [scrolling, setScrolling] = useState(false)
  const [speed, setSpeed] = useState(38) // px/sec
  const [fontPx, setFontPx] = useState(30)
  const [mirror, setMirror] = useState(false)

  useEffect(() => {
    if (!id) return
    getGeneration(id).then(setGen).catch(() => setGen(null)).finally(() => setLoading(false))
  }, [id])

  // Build the teleprompter script from the real blueprint.
  const lines = useMemo(() => {
    const b = gen?.blueprint
    if (!b) return [] as { kind: 'hook' | 'line' | 'dir'; text: string }[]
    const out: { kind: 'hook' | 'line' | 'dir'; text: string }[] = []
    if (b.hook_options?.[0]) out.push({ kind: 'hook', text: b.hook_options[0] })
    for (const s of b.script ?? []) {
      out.push({ kind: 'line', text: s.line })
      if (s.direction) out.push({ kind: 'dir', text: s.direction })
    }
    return out
  }, [gen])

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
      }
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [scrolling, speed])

  const resetPrompt = () => {
    offsetRef.current = 0
    if (promptRef.current) promptRef.current.scrollTop = 0
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
    setEditStatus('Editing — captions, framing & audio…')
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      const job = await getJob(jobId)
      if (!job) continue
      if (job.status === 'done' && job.result?.output_url) {
        setEditUrl(job.result.output_url)
        setEditPhase('done')
        return
      }
      if (job.status === 'failed') throw new Error(job.error || 'The edit could not finish.')
      setEditStatus(job.status === 'running' ? 'Editing — captions, framing & audio…' : 'Queued…')
    }
    throw new Error('The edit is taking longer than expected — check your Library shortly.')
  }

  // ---- first auto-edit: FREE (bundled with the blueprint) ----
  const runAutoEdit = async () => {
    if (!takeBlobRef.current || !id) return
    setEditErr(null)
    setEditPhase('working')
    setEditStatus('Uploading your take…')
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
    setEditStatus('Remaking — a fresh edit…')
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
        <span className="chip"><Mic className="h-3.5 w-3.5 text-coral" /> Record studio</span>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        {/* ---------- camera + teleprompter ---------- */}
        <div className="relative overflow-hidden rounded-panel border border-white/10 bg-black shadow-lift">
          <div className="relative aspect-[9/16] max-h-[72vh] w-full sm:aspect-video">
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
                    <button onClick={startCamera} className="btn-ghost mt-5">Try again</button>
                  </div>
                ) : (
                  <div>
                    <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-signature-soft">
                      <Video className="h-6 w-6 text-cream" />
                    </span>
                    <p className="mt-4 font-heading text-lg">Turn on your camera to record</p>
                    <p className="mt-1 text-sm text-stone">Stays on your device — nothing is uploaded.</p>
                    <button onClick={startCamera} className="btn-gradient mt-5">
                      <Video className="h-4 w-4" /> Enable camera & mic
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* teleprompter overlay */}
            {camReady && phase !== 'review' && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 top-1/3">
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent" />
                <div
                  ref={promptRef}
                  className="relative h-full overflow-hidden px-6 pb-8 pt-4"
                  style={{ maskImage: 'linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent)' }}
                >
                  <div className="space-y-4" style={{ fontSize: fontPx }}>
                    {lines.map((l, i) => (
                      <p
                        key={i}
                        className={cn(
                          'font-heading leading-snug',
                          l.kind === 'hook' && 'text-amber',
                          l.kind === 'line' && 'text-cream',
                          l.kind === 'dir' && 'text-sm italic text-stone',
                        )}
                      >
                        {l.kind === 'dir' ? `( ${l.text} )` : l.text}
                      </p>
                    ))}
                    <div className="h-40" />
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
                      HOOK — land it now
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
                    className="font-display text-8xl text-cream"
                  >
                    {count === 0 ? 'GO' : count}
                  </motion.span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* review — show the edited render once ready, else the raw take */}
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
                  <div className="absolute inset-0 grid place-items-center bg-ink/80 text-center">
                    <div>
                      <Loader2 className="mx-auto h-7 w-7 animate-spin text-coral" />
                      <p className="mt-3 font-heading text-cream">{editStatus}</p>
                      <p className="mt-1 text-xs text-stone">Captions are timed to your words — this takes a minute.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* transport bar */}
          {camReady && (
            <div className="flex items-center justify-center gap-3 border-t border-white/10 bg-ink2/80 p-3">
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
                  {editPhase === 'done' && editUrl ? (
                    <>
                      <button onClick={runRemake} className="btn-ghost" disabled={editPhase !== 'done'} title="Re-edit with a fresh look — 1 recreation">
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
            <p className="mt-1 text-sm text-stone">Loaded from your blueprint — read it naturally.</p>

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
                <Stepper onMinus={() => setSpeed((s) => Math.max(12, s - 6))} onPlus={() => setSpeed((s) => Math.min(90, s + 6))} />
              </Control>

              <Control icon={Plus} label={`Text size · ${fontPx}px`}>
                <Stepper onMinus={() => setFontPx((s) => Math.max(18, s - 2))} onPlus={() => setFontPx((s) => Math.min(54, s + 2))} />
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
              Recording is private — your camera feed never leaves this device.
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
      <button onClick={onMinus} className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 bg-white/5 hover:border-white/20">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button onClick={onPlus} className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 bg-white/5 hover:border-white/20">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </>
  )
}
