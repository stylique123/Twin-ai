import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Video, VideoOff, Circle, Square, RotateCcw, Download, ArrowLeft, Loader2,
  Play, Pause, FlipHorizontal2, Minus, Plus, Gauge, Mic, AlertTriangle, Check, Sparkles, Upload,
  SlidersHorizontal,
} from 'lucide-react'
import { getGeneration, autoEditTake, remakeEdit, getJob, updateGenerationChoice, fetchEdl, listBrandVoices } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { BLUEPRINT_COST } from '../lib/brand'
import { RefinePanel } from '../components/RefinePanel'
import type { EditDecisionList, Generation } from '../lib/types'
import { cn } from '../lib/cn'

type Phase = 'idle' | 'countdown' | 'recording' | 'review'

// Hard cap on a single take. Short-form lives well under this; the cap protects
// both COGS (transcription + ffmpeg time, and the worker's download, all scale
// with take length) and the user from an accidental never-ending recording.
const MAX_RECORD_SECS = 180

// In-app Record: a teleprompter over a live camera, so the blueprint gets shot
// the moment inspiration hits. Everything stays client-side, the take is yours
// to download (Phase 6 will hand it to the auto-editor).
const EDIT_STYLES = [
  { id: 'punchy', label: 'Punchy', note: 'Fast jump-cuts, energetic captions', desc: 'Fast-paced, high-energy edits. Great for social media.', tint: 'from-coral/35 to-amber/20', popular: true },
  { id: 'clean', label: 'Clean', note: 'Tidy cuts, calm captions', desc: 'Clean cuts, natural pacing, a professional look.', tint: 'from-teal/35 to-teal/10', popular: false },
  { id: 'cinematic', label: 'Cinematic', note: 'Smoother pacing, softer captions', desc: 'Story-driven edits with smooth transitions and mood.', tint: 'from-amber/35 to-coral/10', popular: false },
] as const

export default function Record() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const uploadMode = params.get('upload') === '1'
  const { profile, refreshProfile } = useAuth()
  // Free exports carry a watermark — surface the removal upsell ON the finished
  // video, where the user feels it, not buried on the pricing page.
  const isFree = (profile?.plan ?? 'free') === 'free'
  // A remix is spent at blueprint time; the FIRST edit of it is bundled/free. A Remake
  // is a NEW paid look, so it needs another remix — block it (and a new generation) when
  // they're out. The already-finished video is still theirs to download.
  const outOfRemixes = (profile?.credits ?? 0) < BLUEPRINT_COST
  const [gen, setGen] = useState<Generation | null>(null)
  const [loading, setLoading] = useState(true)
  const [editStyle, setEditStyle] = useState('punchy')
  const [selectedHook, setSelectedHook] = useState('')
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
  const takeUrlRef = useRef<string | null>(null) // mirror of takeUrl for unmount revoke
  const takeBlobRef = useRef<Blob | null>(null)

  // auto-edit state
  const [editPhase, setEditPhase] = useState<'none' | 'working' | 'done' | 'error'>('none')
  const [editStatus, setEditStatus] = useState('')
  const [editPct, setEditPct] = useState(0)
  // The ffmpeg edit is the INSTANT result; while Revideo upgrades it to premium
  // captions, we show the instant render playing with a subtle "Polishing" badge.
  const [polishing, setPolishing] = useState(false)
  const [edlPath, setEdlPath] = useState<string | null>(null)
  const [refineOpen, setRefineOpen] = useState(false)
  const [refineEdl, setRefineEdl] = useState<EditDecisionList | null>(null)
  const [refineLoading, setRefineLoading] = useState(false)
  const [editUrl, setEditUrl] = useState<string | null>(null)
  const [editErr, setEditErr] = useState<string | null>(null)
  const takePathRef = useRef<string | null>(null)
  const submitting = useRef(false) // blocks double-submit of a charged edit
  const [variation, setVariation] = useState(0)
  // Per-shot capture: record each shot as its own segment via MediaRecorder
  // pause/resume. shotBoundsRef holds the recorded-seconds at each cut, so the editor
  // can cut exactly there and caption each shot from its script line.
  const [shotIdx, setShotIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const shotBoundsRef = useRef<number[]>([])

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
      .then((g) => {
        setGen(g)
        if (g?.edit_style) setEditStyle(g.edit_style)
        // The script + hook are now picked here (one screen), so seed the chosen
        // hook from the saved choice or the first option, and persist that default.
        const hooks = (g?.blueprint?.hook_options ?? []) as string[]
        const hook = g?.selected_hook ?? hooks[0] ?? ''
        setSelectedHook(hook)
        if (!g?.selected_hook && hook) void updateGenerationChoice(id, { selected_hook: hook })
      })
      .catch(() => setGen(null))
      .finally(() => setLoading(false))
  }, [id])

  // Default the caption highlight color to the workspace brand kit, so the first
  // edit comes out in the creator's brand color (still tweakable per-video in Refine).
  useEffect(() => {
    listBrandVoices()
      .then((vs) => {
        const def = vs.find((v) => v.is_default && v.status === 'ready') ?? vs.find((v) => v.status === 'ready')
        const c = def?.brand_kit?.color
        if (typeof c === 'number') setVariation(c)
      })
      .catch(() => {})
  }, [])

  // Teleprompter shows ONLY what the creator speaks (chosen hook + script lines).
  // The hook is the one the creator picked on the blueprint (selected_hook), so
  // the prompter opens with exactly what they decided to shoot.
  const lines = useMemo(() => {
    const b = gen?.blueprint
    type Beat = { kind: 'hook' | 'line'; text: string; shot: number; label: string; note?: string }
    if (!b) return [] as Beat[]
    const out: Beat[] = []
    const hook = gen?.selected_hook ?? b.hook_options?.[0]
    if (hook) out.push({ kind: 'hook', text: hook, shot: 1, label: 'Hook', note: b.shot_list?.[0]?.framing?.slice(0, 90) })
    for (const s of b.script ?? []) {
      if (s.line?.trim()) out.push({ kind: 'line', text: s.line, shot: out.length + 1, label: s.section || 'Shot', note: s.direction?.slice(0, 90) || undefined })
    }
    return out
  }, [gen])

  const chooseStyle = (s: string) => {
    setEditStyle(s)
    if (id) void updateGenerationChoice(id, { edit_style: s })
  }

  // Pick which hook to open on. Drives the teleprompter lead, the generated cover,
  // and the b-roll keywords on the edit — so it has to be chosen before recording.
  const pickHook = (h: string) => {
    setSelectedHook(h)
    if (id) void updateGenerationChoice(id, { selected_hook: h })
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

  useEffect(() => { takeUrlRef.current = takeUrl }, [takeUrl])
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      // Use the ref, not the stale closured takeUrl, so a recorded/uploaded take's
      // object URL is actually revoked on navigate-away (was leaking before).
      if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current)
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
      // Guard against an empty/failed recording producing an unplayable take.
      if (blob.size < 1024) {
        setCamError('That recording came out empty — check your camera/mic and try again.')
        setPhase('idle'); setScrolling(false)
        return
      }
      takeBlobRef.current = blob
      setTakeUrl(URL.createObjectURL(blob))
      setEditPhase('none')
      setEditUrl(null)
      setEditErr(null)
      setPhase('review')
    }
    rec.onerror = () => {
      setCamError('Recording failed. Reload and try again, or upload a clip instead.')
      setPhase('idle'); setScrolling(false)
    }
    recorderRef.current = rec
    rec.start()
    setPhase('recording')
    setElapsed(0)
    setShotIdx(0)
    setPaused(false)
    shotBoundsRef.current = []
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

  // elapsed timer while recording — auto-stops at the max length so a take can
  // never run away (and land the user with a huge upload + slow, costly edit).
  useEffect(() => {
    if (phase !== 'recording' || paused) return
    const t = setInterval(() => setElapsed((e) => {
      const next = e + 0.1
      if (next >= MAX_RECORD_SECS) { recorderRef.current?.stop(); setScrolling(false) }
      return next
    }), 100)
    return () => clearInterval(t)
  }, [phase, paused])

  const startCountdown = () => {
    setCount(3)
    setPhase('countdown')
  }
  const stopRecording = () => {
    recorderRef.current?.stop()
    setScrolling(false)
  }

  // Per-shot capture: pause after the current shot so the creator can reset / reposition /
  // change location, then resume for the next. Each pause records the cut point (recorded
  // seconds so far). MediaRecorder pause/resume yields ONE clean stitched video.
  const nextShot = () => {
    const rec = recorderRef.current
    if (!rec || rec.state !== 'recording') return
    rec.pause()
    shotBoundsRef.current = [...shotBoundsRef.current, Number(elapsed.toFixed(2))]
    setPaused(true)
    setScrolling(false)
    setShotIdx((s) => Math.min(s + 1, Math.max(0, lines.length - 1)))
  }
  const resumeShot = () => {
    const rec = recorderRef.current
    if (!rec || rec.state !== 'paused') return
    rec.resume()
    setPaused(false)
    setScrolling(true)
  }

  // Jump the prompter to the shot you're about to record when it advances.
  useEffect(() => {
    const el = promptRef.current
    const tgt = lineEls.current[shotIdx]
    if (el && tgt) {
      offsetRef.current = Math.max(0, tgt.offsetTop - el.clientHeight * 0.34)
      el.scrollTop = offsetRef.current
      setActive(shotIdx)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotIdx])
  const reshoot = () => {
    setPhase('idle')
    resetPrompt()
    setShotIdx(0)
    setPaused(false)
    shotBoundsRef.current = []
    setEditPhase('none')
    setEditUrl(null)
    if (editUrl) URL.revokeObjectURL(editUrl)
  }

  // ---- poll a queued edit job to completion ----
  const pollEdit = async (jobId: string) => {
    setEditStatus('Queued…'); setEditPct(8); setPolishing(false)
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const job = await getJob(jobId)
      if (!job) continue
      if (job.status === 'done' && job.result?.output_url) {
        try { if (id) localStorage.removeItem('twinai_edit_' + id) } catch { /* storage off */ }
        setEditPct(100)
        setEditUrl(job.result.output_url)
        setEdlPath(job.result.edl_path ?? null)
        setPolishing(false)
        setEditPhase('done')
        return
      }
      if (job.status === 'failed') {
        try { if (id) localStorage.removeItem('twinai_edit_' + id) } catch { /* storage off */ }
        throw new Error(job.error || 'The edit could not finish.')
      }
      // Show the REAL stage the worker reports (Reading words → Directing → Cutting
      // → Rendering → Finishing) so it never looks frozen.
      const p = job.result?.progress
      if (p && p.label) { setEditStatus(p.label); setEditPct(Math.max(8, Math.min(99, p.pct))) }
      else setEditStatus(job.status === 'running' ? 'Editing your video…' : 'Queued…')
      // One flow: the moment the instant ffmpeg edit is ready, play it while the
      // premium captions render in the background — never make the creator wait.
      if (p?.instant_url) { setEditUrl(p.instant_url); setPolishing(true) }
    }
    throw new Error('The edit is taking longer than expected, check your Library shortly.')
  }

  // Resumability: if the creator left mid-edit, the job kept running on the worker and
  // the remix is already spent — re-attach to it on return so they pick up at the same
  // step instead of paying again. Runs once when the page loads with a saved job.
  useEffect(() => {
    if (!id) return
    let jobId: string | null = null
    try { jobId = localStorage.getItem('twinai_edit_' + id) } catch { /* storage off */ }
    if (!jobId) return
    setCamReady(true); setPhase('review'); setEditPhase('working'); setEditStatus('Resuming your edit…')
    pollEdit(jobId).catch((err) => { setEditErr(err instanceof Error ? err.message : 'Could not resume the edit.'); setEditPhase('error') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ---- first auto-edit: FREE (bundled with the blueprint) ----
  const runAutoEdit = async () => {
    // Synchronous guard: `disabled` lags a fast double-click and would fire two
    // uploads + two charged enqueues. The ref blocks the second instantly.
    if (!takeBlobRef.current || !id || submitting.current) return
    submitting.current = true
    setEditErr(null)
    setEditPhase('working')
    setEditStatus('Uploading your take…'); setEditPct(3)
    try {
      // Per-shot capture: hand the editor the cut points + the script line per shot so
      // it cuts exactly where the creator did and captions each segment from the script.
      const shots = shotBoundsRef.current.length
        ? { bounds: shotBoundsRef.current, total: Number(elapsed.toFixed(2)), lines: lines.map((l) => l.text) }
        : undefined
      const { jobId, takePath } = await autoEditTake(id, takeBlobRef.current, shots)
      takePathRef.current = takePath
      // Persist the in-flight job so a reload / leaving resumes this exact edit (the
      // remix is already spent — never charge twice). Cleared when it finishes.
      try { localStorage.setItem('twinai_edit_' + id, jobId) } catch { /* storage off */ }
      await pollEdit(jobId)
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : 'Auto-edit failed.')
      setEditPhase('error')
    } finally {
      submitting.current = false
    }
  }

  // One flow: the moment a take exists (recorded OR uploaded) it edits automatically —
  // no "now go find the Auto-edit button" dead-end. Record → stop → edit → finished
  // video, in one move. editPhase flips to 'working' inside runAutoEdit so this never
  // double-fires; an error leaves editPhase 'error' (not 'none') so it won't loop.
  useEffect(() => {
    if (phase === 'review' && editPhase === 'none' && takeBlobRef.current && !submitting.current) {
      void runAutoEdit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, editPhase])

  // ---- remake: a fresh look, costs one recreation ----
  const runRemake = async () => {
    if (!takePathRef.current || !id || submitting.current) return
    submitting.current = true
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
    } finally {
      submitting.current = false
    }
  }

  // ---- Refine: open the panel with the edit's real decisions loaded ----
  const openRefine = async () => {
    setRefineOpen(true)
    if (!edlPath) { setRefineEdl(null); return }
    setRefineLoading(true)
    try {
      const e = await fetchEdl(edlPath)
      setRefineEdl(e)
    } catch { setRefineEdl(null) } finally { setRefineLoading(false) }
  }

  // When the shared RefinePanel kicks off a re-render, poll it like any edit.
  const onRefineApplied = (jobId: string) => {
    setEditErr(null)
    setEditPhase('working')
    setEditStatus('Applying your changes…'); setEditPct(3)
    if (editUrl) URL.revokeObjectURL(editUrl)
    setEditUrl(null)
    pollEdit(jobId).catch((e) => {
      setEditErr(e instanceof Error ? e.message : 'Refine failed.'); setEditPhase('error')
    })
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
        <p className="font-heading text-lg">We couldn’t load that script.</p>
        <Link to="/history" className="btn-gradient mt-6 inline-flex">Back to Library</Link>
      </div>
    )

  return (
    <main className="relative mx-auto max-w-6xl px-5 py-8 lg:py-10">
      <div className="relative flex items-center justify-between gap-3">
        <Link to={`/result/${id}`} className="inline-flex items-center gap-1.5 text-sm text-stone hover:text-cream">
          <ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Full blueprint</span>
        </Link>
        <div className="absolute left-1/2 -translate-x-1/2 text-center">
          <div className="font-heading text-base leading-tight text-cream">{uploadMode ? 'Edit your clip' : 'Record studio'}</div>
          <div className="text-[11px] text-stone">{uploadMode ? 'Add or replace your clip' : "You're ready to record"}</div>
        </div>
        <span className="chip text-[11px]"><Mic className="h-3.5 w-3.5 text-coral" /> Private</span>
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

            {/* Teleprompter status pill (idle only — the REC badge takes over while recording). */}
            {camReady && !uploadMode && phase === 'idle' && (
              <span className="absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-cream backdrop-blur">
                Teleprompter <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />
              </span>
            )}
            {/* teleprompter overlay — only while recording yourself, never over an
                uploaded clip and never on the review/edited result. */}
            {camReady && !uploadMode && phase !== 'review' && (
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
                      <div key={i}>
                        {/* Scene cut: tell the creator to pause — that pause becomes a clean
                            cut in the edit — then line up the next shot. */}
                        {i > 0 && (
                          <div className="mb-3 flex items-center justify-center gap-2 text-[0.3em] font-semibold uppercase tracking-[0.18em] text-coral/80">
                            <span className="h-px w-[1.1em] bg-coral/45" /> Cut · pause — line up shot {l.shot} <span className="h-px w-[1.1em] bg-coral/45" />
                          </div>
                        )}
                        <div className="mb-1 text-[0.3em] font-semibold uppercase tracking-[0.12em] text-amber/90">
                          Shot {l.shot} · {l.label}{l.note ? ` — ${l.note}` : ''}
                        </div>
                        <p
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
                      </div>
                    ))}
                    <div className="h-[60%]" />
                  </div>
                </div>
              </div>
            )}

            {/* recording HUD */}
            {phase === 'recording' && (
              <div className="absolute left-3 top-3 flex items-center gap-2">
                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-cream', paused ? 'bg-black/70' : 'bg-coral/90')}>
                  <span className={cn('h-2 w-2 rounded-full bg-cream', !paused && 'animate-pulse')} /> {paused ? 'PAUSED' : `REC ${elapsed.toFixed(1)}s`}
                </span>
                {lines.length > 1 && (
                  <span className="rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-amber">
                    {paused ? `Line up shot ${shotIdx + 1}` : `Shot ${shotIdx + 1} of ${lines.length}`}
                  </span>
                )}
                {MAX_RECORD_SECS - elapsed <= 15 && (
                  <span className="rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-amber">
                    Wrapping at {MAX_RECORD_SECS}s · {Math.max(0, Math.ceil(MAX_RECORD_SECS - elapsed))}s left
                  </span>
                )}
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
            {phase === 'review' && (takeUrl || editUrl || editPhase === 'working') && (
              <div className="absolute inset-0 bg-black">
                <video
                  key={editUrl ?? takeUrl ?? ''}
                  src={editUrl ?? takeUrl ?? ''}
                  controls
                  playsInline
                  className="h-full w-full object-contain"
                />
                {editUrl && !polishing && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-1 bg-gradient-to-b from-ink/85 via-ink/40 to-transparent px-4 pb-9 pt-4 text-center">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber to-coral px-3 py-1 text-xs font-bold text-ink shadow-glow">
                      <Check className="h-3.5 w-3.5" /> Your video is ready!
                    </span>
                    <p className="text-[11px] font-medium text-cream/85">Optimized and ready to share — download or post it below.</p>
                  </div>
                )}
                {/* Premium pass: instant edit is playable, premium captions polishing. */}
                {polishing && (
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-coral/90 px-2.5 py-1 text-xs font-bold text-cream">
                    <Sparkles className="h-3.5 w-3.5 animate-pulse" /> Polishing premium captions…
                  </span>
                )}
                {editPhase === 'working' && !polishing && (
                  <div className="absolute inset-0 overflow-y-auto bg-ink/92 px-6 py-7 backdrop-blur-md">
                    <div className="mx-auto w-full max-w-sm">
                      <div className="flex items-center justify-between">
                        <p className="font-heading text-cream">Creating your video</p>
                        <span className="text-sm font-semibold text-coral">{editPct}%</span>
                      </div>
                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-gradient-to-r from-amber via-coral to-teal transition-all duration-700 ease-out" style={{ width: `${editPct}%` }} />
                      </div>
                      {/* The checklist is driven by the REAL worker progress: editPct decides
                          which stage is active, and the active stage shows the worker's live label. */}
                      <div className="mt-5 space-y-3">
                        {(() => {
                          const steps: [string, string][] = [
                            ['Uploading your recording', 'Sending it up securely'],
                            ['Analyzing speech', 'Detecting words and pauses'],
                            ['Generating captions', 'Accurate, synced captions'],
                            ['Enhancing visuals', 'Color, sharpness & framing'],
                            ['Adding b-roll & transitions', 'Finding the perfect moments'],
                            ['Finalizing & rendering', 'Bringing it all together'],
                          ]
                          const active = editPct < 8 ? 0 : editPct < 42 ? 1 : editPct < 58 ? 2 : editPct < 72 ? 3 : editPct < 85 ? 4 : 5
                          return steps.map(([t, s], i) => {
                            const done = i < active, now = i === active
                            return (
                              <div key={t} className="flex items-center gap-3 text-left">
                                <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full border', done ? 'border-transparent bg-gradient-to-br from-amber to-coral' : now ? 'border-coral/70' : 'border-dashed border-white/15')}>
                                  {done ? <Check className="h-4 w-4 text-ink" /> : now ? <Loader2 className="h-3.5 w-3.5 animate-spin text-coral" /> : null}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className={cn('text-sm font-semibold', done || now ? 'text-cream' : 'text-stone')}>{t}</div>
                                  <div className="truncate text-[11px] text-stone">{now ? (editStatus || s) : s}</div>
                                </div>
                                <span className={cn('shrink-0 text-[11px] font-semibold', done ? 'text-teal' : now ? 'text-amber' : 'text-stone/60')}>
                                  {done ? 'Done' : now ? 'In progress' : 'Pending'}
                                </span>
                              </div>
                            )
                          })
                        })()}
                      </div>
                      <p className="mt-5 rounded-card border border-white/8 bg-white/[0.03] px-3 py-2.5 text-[11px] leading-relaxed text-stone">
                        Good things take a little time. You can leave this screen — it keeps rendering and picks up right here when you're back.
                      </p>
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
                <>
                  {paused ? (
                    <button onClick={resumeShot} className="btn-gradient">
                      <Circle className="h-4 w-4 fill-current" /> Record shot {shotIdx + 1}
                    </button>
                  ) : shotIdx < lines.length - 1 ? (
                    <button onClick={nextShot} className="btn-ghost" title="Pause, reposition / change location, then record the next shot">
                      <Pause className="h-4 w-4" /> Cut · next shot
                    </button>
                  ) : null}
                  <button onClick={stopRecording} className="btn-gradient">
                    <Square className="h-4 w-4 fill-current" /> Finish
                  </button>
                </>
              )}
              {phase === 'review' && (
                <>
                  <button onClick={reshoot} className="btn-ghost" disabled={editPhase === 'working'}>
                    <RotateCcw className="h-4 w-4" /> {uploadMode ? 'Replace clip' : 'Reshoot'}
                  </button>
                  {editPhase === 'done' && editUrl ? (
                    <>
                      <button onClick={openRefine} disabled={refineLoading} className="btn-ghost" title="Manually edit captions, colors, cuts & b-roll — free">
                        {refineLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SlidersHorizontal className="h-4 w-4" />} Edit manually
                      </button>
                      <button onClick={runRemake} className="btn-ghost" disabled={editPhase !== 'done' || outOfRemixes} title={outOfRemixes ? 'Out of remixes — upgrade to remake' : 'Re-edit with a fresh look, 1 remix'}>
                        <Sparkles className="h-4 w-4" /> Remake · 1 remix
                      </button>
                      <a href={editUrl} download={`twinai-edited-${id}.mp4`} className="btn-gradient">
                        <Download className="h-4 w-4" /> Download edited
                      </a>
                      {isFree && (
                        <Link to="/settings" className="chip border-amber/40 text-amber" title="Free exports include a watermark">
                          <Sparkles className="h-3.5 w-3.5" /> Remove watermark
                        </Link>
                      )}
                      {outOfRemixes && (
                        <p className="w-full text-center text-[11px] text-stone">
                          This video is yours — download it. Out of remixes for a new one? <Link to="/settings" className="text-amber hover:text-cream">Upgrade</Link>.
                        </p>
                      )}
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
            <p className="mt-1 text-sm text-stone">Directs you shot by shot — read a beat, <span className="text-coral">pause at each Cut</span> to reset or change location, then continue. Your pauses become clean scene cuts in the edit.</p>

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
                <input
                  type="range"
                  min={12}
                  max={120}
                  step={2}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-28 cursor-pointer accent-coral"
                  aria-label="Teleprompter scroll speed"
                />
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
            <h3 className="font-heading">Choose edit style</h3>
            <p className="mt-1 text-sm text-stone">This helps us edit your video the way you want.</p>
            <div className="mt-3 space-y-2">
              {EDIT_STYLES.map((s) => {
                const active = editStyle === s.id
                return (
                  <button
                    key={s.id}
                    onClick={() => chooseStyle(s.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-card border p-3 text-left transition-colors',
                      active ? 'border-coral/55 bg-coral/10' : 'border-white/8 bg-white/[0.02] hover:border-white/16',
                    )}
                  >
                    <span className={cn('h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br', s.tint)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-sm font-semibold', active ? 'text-cream' : 'text-sand')}>{s.label}</span>
                        {s.popular && <span className="rounded-full bg-coral/20 px-1.5 py-0.5 text-[10px] font-bold text-coral">Popular</span>}
                      </div>
                      <div className="text-[11px] leading-snug text-stone">{s.desc}</div>
                    </div>
                    <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border', active ? 'border-coral bg-coral' : 'border-white/20')}>
                      {active && <Check className="h-3 w-3 text-ink" />}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="glass p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-heading">Full script</h3>
              <span className="text-xs text-stone">{gen.blueprint.script?.length ?? 0} lines</span>
            </div>
            <div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
              {gen.blueprint.hook_options && gen.blueprint.hook_options.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-stone">Pick your hook</div>
                  {gen.blueprint.hook_options.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => pickHook(h)}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm font-heading transition-colors',
                        selectedHook === h ? 'bg-amber/15 text-amber ring-1 ring-amber/40' : 'bg-white/[0.03] text-sand hover:bg-white/[0.06]',
                      )}
                    >
                      <Check className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', selectedHook === h ? 'text-amber' : 'text-transparent')} />
                      {h}
                    </button>
                  ))}
                </div>
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
      {/* ---- shared Refine panel (same editor used on the Result page) ---- */}
      <RefinePanel
        open={refineOpen}
        edl={refineEdl}
        loading={refineLoading}
        generationId={id ?? ''}
        takePath={takePathRef.current}
        onClose={() => setRefineOpen(false)}
        onApplied={onRefineApplied}
      />
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
