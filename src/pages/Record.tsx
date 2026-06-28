import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Video, VideoOff, Circle, Square, RotateCcw, Download, ArrowLeft, Loader2,
  Play, Pause, FlipHorizontal2, Minus, Plus, Gauge, Mic, AlertTriangle, Check, Sparkles, Upload,
  SlidersHorizontal, Clapperboard, ChevronRight, Folder, Share2,
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

const MOCK_GENERATION: Generation = {
  id: 'mock-123',
  user_id: 'mock-user',
  reference_url: null,
  reference_note: null,
  fidelity: 'balanced',
  selected_hook: 'As a fashion brand owner, your biggest enemy is the money you lose every month on unrealistic models.',
  edit_style: 'punchy',
  created_at: new Date().toISOString(),
  blueprint: {
    reference_read: {
      platform: 'tiktok',
      format_label: 'Fashion Brand Painpoint Escalator',
      why_it_works: ['Direct pain point hook builds strong viewer alignment.', 'Visual contrast between high agency costs and fast AI generation.'],
      retention_map: [
        { beat: 'Hook', goal: 'Establish visual anchor with phone mic pose', tactic: 'Direct gaze' },
        { beat: 'Escalation', goal: 'Escalate catalog shoot costs', tactic: 'Fast cut cadence' }
      ]
    },
    hook_options: [
      'As a fashion brand owner, your biggest enemy is the money you lose every month on unrealistic models.',
      'Why waste thousands of dollars on physical photoshoots when AI models look this realistic?',
      'Stop paying agency fees for fashion models who do not match your brand aesthetic.'
    ],
    script: [
      {
        section: 'Hook',
        line: 'As a fashion brand owner, your biggest enemy is the money you lose every month on unrealistic models.',
        direction: 'Direct inquisitive look at the camera, holding phone like a mic.'
      },
      {
        section: 'Problem',
        line: 'Photoshoots cost a fortune, booking agencies is a nightmare, and lead times are weeks long.',
        direction: 'Express frustration, dynamic hand gestures.'
      },
      {
        section: 'Solution',
        line: 'But with Stylique, you can generate stunning, realistic fashion models in seconds for a fraction of the cost.',
        direction: 'Smile, point to screen representing ease of use.'
      },
      {
        section: 'Outro',
        line: 'Upload your clothing clips now and let Stylique transform your catalog.',
        direction: 'Call to action, friendly wave.'
      }
    ],
    shot_list: [
      {
        shot: 'Cover Frame',
        framing: 'Medium close up, holding phone like a mic',
        shot_type: 'cover_frame',
        notes: 'Creator posture: Inquisitive look. Background: Ambient studio.'
      },
      {
        shot: 'Physical Model Shoot Pain',
        framing: 'Medium Close Up (Remain same)',
        shot_type: 'talking_head',
        notes: 'Creator posture: Express frustration, dynamic hand gestures. Background: Remain same.'
      },
      {
        shot: 'Endless Cardboard Boxes',
        framing: 'B-Roll Overlay',
        shot_type: 'b_roll',
        notes: 'Camera position: Replaced by B-roll. Creator: Voiceover only.',
        b_roll_type: 'replicate',
        b_roll_visual: 'Endless stacks of fashion cardboard boxes in a high-contrast warehouse grid.'
      },
      {
        shot: 'AI Model Generator Demo',
        framing: 'B-Roll Overlay',
        shot_type: 'b_roll',
        notes: 'Camera position: Replaced by B-roll. Creator: Voiceover only.',
        b_roll_type: 'replicate',
        b_roll_visual: 'Splitscreen showing user uploading a flat-lay photo and Stylique generating a gorgeous model wearing it.'
      },
      {
        shot: 'Stylique Dashboard Solution',
        framing: 'Medium Close Up (Remain same)',
        shot_type: 'talking_head',
        notes: 'Creator posture: Smile, point to screen representing ease. Background: Remain same.'
      },
      {
        shot: 'Outro & CTA',
        framing: 'Medium Close Up (Remain same)',
        shot_type: 'talking_head',
        notes: 'Creator posture: Friendly wave, direct look. Background: Remain same.'
      }
    ],
    captions: [],
    edit_checklist: [],
    caption_packet: {
      caption_style: 'bold-pop',
      pacing: 'balanced',
      emphasis: 'high',
      export: 'mp4'
    },
    publish_plan: [],
    production_sprint: []
  }
}

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolling, setScrolling] = useState(false)
  const [speed, setSpeed] = useState(42) // px/sec
  const [fontPx, setFontPx] = useState(38)
  const [mirror, setMirror] = useState(false)
  const [active, setActive] = useState(0) // line currently at the read line
  const lineEls = useRef<(HTMLParagraphElement | null)[]>([])
  const prevActiveRef = useRef(0) // track previous active for scene boundary detection
  const [showFinishConfirm, setShowFinishConfirm] = useState(false)
  const [selectedAspect, setSelectedAspect] = useState<'9:16' | '1:1'>('9:16')

  const phaseRef = useRef(phase)
  useEffect(() => { phaseRef.current = phase }, [phase])

  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])

  const activeRef = useRef(active)
  useEffect(() => { activeRef.current = active }, [active])


  // Scene transition: when auto-pause fires, this holds the upcoming beat info
  const [sceneTransition, setSceneTransition] = useState<{
    completedShot: number
    nextLabel: string
    nextKind: string
    nextNote?: string
    nextBrollVisual?: string
    nextFraming?: string
    nextBackground?: string
  } | null>(null)

  useEffect(() => {
    if (!id) return
    getGeneration(id)
      .then((g) => {
        if (!g) {
          const fallback = MOCK_GENERATION
          setGen(fallback)
          setEditStyle(fallback.edit_style || 'punchy')
          setSelectedHook(fallback.selected_hook || '')
          return
        }
        setGen(g)
        if (g?.edit_style) setEditStyle(g.edit_style)
        // The script + hook are now picked here (one screen), so seed the chosen
        // hook from the saved choice or the first option, and persist that default.
        const hooks = (g?.blueprint?.hook_options ?? []) as string[]
        const hook = g?.selected_hook ?? hooks[0] ?? ''
        setSelectedHook(hook)
        if (!g?.selected_hook && hook) void updateGenerationChoice(id, { selected_hook: hook })
      })
      .catch(() => {
        const fallback = MOCK_GENERATION
        setGen(fallback)
        setEditStyle(fallback.edit_style || 'punchy')
        setSelectedHook(fallback.selected_hook || '')
      })
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
    type Beat = {
      kind: 'hook' | 'talking_head' | 'voiceover'
      text: string
      shot: number
      label: string
      note?: string
      is_voiceover?: boolean
      b_roll_visual?: string
      auto_pause?: boolean   // teleprompter should auto-pause AFTER this beat
      framing?: string
      background?: string
    }
    if (!b) return [] as Beat[]
    const out: Beat[] = []
    const chosenHook = gen?.selected_hook ?? b.hook_options?.[0]
    const shotList = b.shot_list ?? []
    const brollShots = shotList.filter(s => s.shot_type === 'b_roll')

    let shotNum = 1
    const scriptItems = b.script ?? []
    scriptItems.forEach((s, idx) => {
      if (!s.line?.trim()) return

      let lineText = s.line
      const isFirstScene = idx === 0
      if (isFirstScene && chosenHook) {
        const sentences = s.line.split(/(?<=[.!?])\s+/)
        lineText = sentences.length > 1
          ? `${chosenHook.trim()} ${sentences.slice(1).join(' ')}`
          : chosenHook
      }

      // Check if this script line corresponds to a B-roll overlay
      const matchingBroll = brollShots.find(shot =>
        shot.spoken_text?.trim() &&
        (lineText.toLowerCase().includes(shot.spoken_text.trim().toLowerCase()) ||
         shot.spoken_text.trim().toLowerCase().includes(lineText.toLowerCase()))
      )

      const kind: Beat['kind'] = isFirstScene ? 'hook'
        : matchingBroll ? 'voiceover'
        : 'talking_head'

      const nextScript = scriptItems[idx + 1]
      const isLastScene = !nextScript || !nextScript.line?.trim()

      const correspondingShot = shotList.find(shot => {
        const sec = s.section?.toLowerCase() || ''
        const name = shot.shot.toLowerCase()
        if (name.includes(sec)) return true
        if (sec === 'hook' && (name.includes('cover') || name.includes('establish'))) return true
        if (sec === 'problem' && (name.includes('pain') || name.includes('shoot'))) return true
        if (sec === 'setup' && (name.includes('intro') || name.includes('problem'))) return true
        if (sec === 're-hook' && (name.includes('middle') || name.includes('talking head b'))) return true
        if (sec === 'solution' && (name.includes('dashboard') || name.includes('twin'))) return true
        if (sec === 'outro' && (name.includes('cta') || name.includes('wave'))) return true
        return false
      }) || shotList[shotNum - 1]

      out.push({
        kind,
        text: lineText,
        shot: shotNum,
        label: s.section || (isFirstScene ? 'Hook' : `Shot ${shotNum}`),
        note: s.direction || undefined,
        is_voiceover: !!matchingBroll,
        b_roll_visual: matchingBroll?.b_roll_visual,
        auto_pause: !isLastScene, // auto-pause after every scene section
        framing: matchingBroll?.framing || correspondingShot?.framing || s.direction || undefined,
        background: s.background || correspondingShot?.notes || undefined,
      })
      shotNum++
    })

    return out
  }, [gen])

  const linesRef = useRef<any[]>([])
  useEffect(() => { linesRef.current = lines }, [lines])

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
  // Also triggers auto-pause at scene boundaries during recording.
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

    const prev = activeRef.current
    const currentPhase = phaseRef.current
    const isPaused = pausedRef.current
    const currentLines = linesRef.current

    // 1. Auto-stop at the end of the final line (outro) during active recording
    if (best === currentLines.length - 1 && currentPhase === 'recording' && !isPaused) {
      const lastEl = lineEls.current[currentLines.length - 1]
      if (lastEl) {
        const lastElBottom = lastEl.getBoundingClientRect().bottom
        // Only trigger if layout is ready (bottom > 0) and the text bottom scrolls above the read guide
        if (lastElBottom > 0 && lastElBottom < readY - 40) {
          recorderRef.current?.stop()
          setScrolling(false)
        }
      }
    }

    // 2. Scene boundary detection: if we've advanced to a new beat during recording
    if (best !== prev && best > prev && currentPhase === 'recording' && !isPaused) {
      const prevBeat = currentLines[prev]
      if (prevBeat?.auto_pause) {
        // Auto-pause: fire the scene transition
        const nextBeat = currentLines[best]
        const rec = recorderRef.current
        if (rec && rec.state === 'recording') {
          rec.pause()
          shotBoundsRef.current = [...shotBoundsRef.current, Number(elapsed.toFixed(2))]
          setPaused(true)
          setScrolling(false)
          setShotIdx(best)
          setSceneTransition({
            completedShot: prevBeat.shot,
            nextLabel: nextBeat?.label ?? 'Next Shot',
            nextKind: nextBeat?.kind ?? 'talking_head',
            nextNote: nextBeat?.note,
            nextBrollVisual: nextBeat?.b_roll_visual,
            nextFraming: nextBeat?.framing,
            nextBackground: nextBeat?.background,
          })
        }
      }
    }

    if (best !== prev) {
      prevActiveRef.current = best
      setActive(best)
    }
  }

  // ---- camera lifecycle ----
  const startCamera = async () => {
    setCamError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1080, min: 720 },
          height: { ideal: 1920, min: 1280 },
          frameRate: { ideal: 30, min: 24 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        },
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
          if (phaseRef.current === 'recording') {
            recorderRef.current?.stop()
          }
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
    const rec = new MediaRecorder(streamRef.current, {
      mimeType: mime || undefined,
      videoBitsPerSecond: 5_000_000,
      audioBitsPerSecond: 128_000
    })
    rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data)
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime || 'video/webm' })
      // Guard against an empty/failed recording producing an unplayable take.
      if (blob.size < 1024) {
        setCamError('That recording came out empty — check your camera/mic and try again.')
        setPhase('idle'); setScrolling(false)
        return
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      setCamReady(false)
      takeBlobRef.current = blob
      setTakeUrl(URL.createObjectURL(blob))
      setEditPhase('none')
      setEditUrl(null)
      setEditErr(null)
      setShowFinishConfirm(true)
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
    setSceneTransition(null)
  }

  const retakeScene = () => {
    if (!sceneTransition) return
    if (shotBoundsRef.current.length > 0) {
      shotBoundsRef.current = shotBoundsRef.current.slice(0, -1)
    }
    const completedIdx = lines.findIndex(l => l.shot === sceneTransition.completedShot)
    if (completedIdx !== -1) {
      setShotIdx(completedIdx)
      setActive(completedIdx)
      const el = promptRef.current
      const tgt = lineEls.current[completedIdx]
      if (el && tgt) {
        offsetRef.current = Math.max(0, tgt.offsetTop - el.clientHeight * 0.34)
        el.scrollTop = offsetRef.current
      }
    }
    setSceneTransition(null)
    setPaused(true)
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
    startCamera()
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
      // ONE output: keep the processing checklist running through the FULL edit
      // (cuts + captions + b-roll + the premium pass) and reveal the single finished
      // video only when it's done — no instant preview that swaps under the creator.
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
      const { jobId, takePath } = await autoEditTake(id, takeBlobRef.current, shots, selectedAspect)
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
  // Manual trigger via "Auto-edit this take" button lets the creator review the raw video and choose an edit style first.

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
    <main className="relative mx-auto max-w-6xl px-0 sm:px-5 py-4 lg:py-10">
      <div className="relative flex items-center justify-between gap-3 px-4 sm:px-0">
        <Link to={`/result/${id}`} className="inline-flex items-center gap-1.5 text-sm text-stone hover:text-cream">
          <ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Full blueprint</span>
        </Link>
        <div className="absolute left-1/2 -translate-x-1/2 text-center">
          <div className="font-heading text-base leading-tight text-cream">{uploadMode ? 'Edit your clip' : 'Record studio'}</div>
          <div className="text-[11px] text-stone">{uploadMode ? 'Add or replace your clip' : "You're ready to record"}</div>
        </div>
        <div className="flex items-center gap-2">
          {phase !== 'review' && (
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden chip text-[11px] border-white/20 bg-white/5 hover:bg-white/10 text-cream"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-amber" /> Script &amp; Teleprompter
            </button>
          )}
          <span className="chip text-[11px]"><Mic className="h-3.5 w-3.5 text-coral" /> Private</span>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => onUploadFile(e.target.files?.[0])}
      />

      <div className="mt-4 grid gap-5 lg:grid-cols-[1.15fr_0.85fr] items-start">
        {/* ---------- camera + teleprompter ---------- */}
        <div className={cn(
          "relative overflow-hidden rounded-none sm:rounded-panel border-0 sm:border border-white/10 bg-black shadow-lift transition-all duration-300 w-full max-w-full mx-auto",
          phase === 'review' && selectedAspect === '1:1'
            ? "aspect-square h-auto sm:max-h-[60vh] max-w-[60vh]"
            : "aspect-[9/16] h-[calc(100vh-170px)] sm:h-auto sm:max-h-[78vh]"
        )}>
          {/* Always 9:16 or 1:1 based on outer parent */}
          <div className="relative h-full w-full">
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
                  <div className="w-full max-w-sm p-8 rounded-panel bg-ink2/60 border border-white/5 shadow-glass backdrop-blur-md space-y-6">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber/10 to-coral/10 border border-coral/20">
                      <Upload className="h-7 w-7 text-coral" />
                    </div>
                    <div>
                      <h2 className="font-heading text-lg text-cream">Upload your clip to auto-edit</h2>
                      <p className="mt-2 text-xs text-stone leading-relaxed">We will add synchronized captions, jump-cuts, framing, sound-ducking &amp; a cover automatically. Supports MP4 or MOV.</p>
                    </div>
                    <button onClick={() => fileInputRef.current?.click()} className="btn-gradient w-full py-3 text-sm">
                      <Upload className="h-4 w-4" /> Choose a video
                    </button>
                    <button onClick={startCamera} className="text-xs text-stone hover:text-cream transition-colors block mx-auto underline underline-offset-4">
                      Or record with the teleprompter instead
                    </button>
                  </div>
                ) : (
                  <div className="w-full max-w-sm p-8 rounded-panel bg-ink2/60 border border-white/5 shadow-glass backdrop-blur-md space-y-6">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber/10 to-teal/10 border border-teal/20">
                      <Video className="h-7 w-7 text-teal" />
                    </div>
                    <div>
                      <h2 className="font-heading text-lg text-cream">Turn on your camera to record</h2>
                      <p className="mt-2 text-xs text-stone leading-relaxed">Record directly inside the browser using our teleprompter. Footage stays on your device, nothing is uploaded without your approval.</p>
                    </div>
                    <button onClick={startCamera} className="btn-gradient w-full py-3 text-sm">
                      <Video className="h-4 w-4" /> Enable camera &amp; mic
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="text-xs text-stone hover:text-cream transition-colors block mx-auto underline underline-offset-4">
                      Or upload a clip you already have
                    </button>
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
                        {/* Scene cut divider between beats */}
                        {i > 0 && (
                          <div className="mb-3 flex items-center justify-center gap-2 text-[0.3em] font-semibold uppercase tracking-[0.18em] text-coral/80">
                            <span className="h-px w-[1.1em] bg-coral/45" /> Cut · scene {l.shot} <span className="h-px w-[1.1em] bg-coral/45" />
                          </div>
                        )}
                        {/* Shot label + direction */}
                        <div className="mb-1 text-[0.3em] font-semibold uppercase tracking-[0.12em] text-amber/90">
                          Shot {l.shot} · {l.label}{l.note ? ` — ${l.note}` : ''}
                        </div>
                        {/* Voiceover badge for spoken B-rolls */}
                        {l.is_voiceover && i === active && (
                          <div className="mb-2 flex items-center justify-center gap-1 text-[0.28em] font-bold uppercase tracking-[0.15em] text-coral animate-pulse">
                            <Mic className="h-3 w-3 shrink-0" /> Voiceover Mode · Audio Only
                          </div>
                        )}
                        {/* B-roll overlay visual indicator */}
                        {l.b_roll_visual && (
                          <div className={cn(
                            "mb-2 mx-auto max-w-sm rounded-lg border px-3 py-1.5 transition-all text-center",
                            i === active
                              ? "border-amber/40 bg-amber/5 text-cream"
                              : "border-white/5 bg-white/[0.02] opacity-35"
                          )}>
                            <span className="text-[0.25em] font-bold uppercase tracking-wider text-amber block mb-0.5">B-Roll Visual Overlay</span>
                            <span className="text-[0.45em] text-sand font-medium leading-tight block">{l.b_roll_visual}</span>
                          </div>
                        )}
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
                    <div className="h-[80vh]" />
                  </div>
                </div>
              </div>
            )}

            {/* Scene transition card: shown when auto-paused between scenes */}
            {sceneTransition && phase === 'recording' && paused && (
              <div className="pointer-events-auto absolute inset-0 z-30 grid place-items-center bg-black/70 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-[85%] max-w-sm rounded-2xl border border-white/10 bg-ink2/95 p-6 shadow-lift backdrop-blur-xl space-y-4 text-center"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-teal to-coral">
                      <Check className="h-4 w-4 text-ink" />
                    </span>
                    <span className="text-sm font-semibold text-cream">Shot {sceneTransition.completedShot} Complete</span>
                  </div>
                  <div className="border-t border-white/5 pt-4 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-stone">Next Up</div>
                    <div className="text-base font-heading font-semibold text-cream">
                      {sceneTransition.nextKind === 'b_roll_pause' ? 'B-Roll Insert' : sceneTransition.nextLabel}
                    </div>
                    {sceneTransition.nextBrollVisual && (
                      <div className="rounded-lg border border-coral/20 bg-coral/5 p-3">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-coral block mb-1">Visual Asset Required</span>
                        <span className="text-xs text-sand leading-relaxed">{sceneTransition.nextBrollVisual}</span>
                      </div>
                    )}
                    {sceneTransition.nextNote && !sceneTransition.nextBrollVisual && (
                      <p className="text-xs text-stone italic leading-relaxed">"{sceneTransition.nextNote}"</p>
                    )}
                    {/* Camera Angle & Framing Environment details */}
                    {(sceneTransition.nextFraming || sceneTransition.nextBackground) && (
                      <div className="mt-3 grid grid-cols-2 gap-2 text-left bg-white/[0.02] border border-white/5 rounded-xl p-3">
                        {sceneTransition.nextFraming && (
                          <div className="space-y-0.5 border-r border-white/5 pr-2">
                            <span className="text-[8px] font-bold uppercase tracking-wider text-teal">Camera Framing</span>
                            <p className="text-[10px] text-cream font-mono leading-tight">{sceneTransition.nextFraming}</p>
                          </div>
                        )}
                        {sceneTransition.nextBackground && (
                          <div className="space-y-0.5 pl-1">
                            <span className="text-[8px] font-bold uppercase tracking-wider text-amber">Scene Setup</span>
                            <p className="text-[10px] text-sand leading-tight line-clamp-2" title={sceneTransition.nextBackground}>{sceneTransition.nextBackground}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 pt-2">
                    <button onClick={resumeShot} className="btn-gradient w-full py-3 text-sm flex items-center justify-center gap-1.5">
                      <Circle className="h-4 w-4 fill-current" /> Continue Recording
                    </button>
                    <button onClick={retakeScene} className="btn-ghost w-full py-2.5 text-xs text-stone hover:text-coral border border-white/5 bg-white/5 rounded-xl transition-all flex items-center justify-center gap-1.5">
                      <RotateCcw className="h-3.5 w-3.5" /> Retake scene {sceneTransition.completedShot}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {/* Take Complete / Finish Confirmation overlay */}
            {showFinishConfirm && (
              <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-black/75 backdrop-blur-md">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-[85%] max-w-sm rounded-2xl border border-white/10 bg-ink2/95 p-6 shadow-lift text-center space-y-4"
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber to-coral">
                    <Check className="h-6 w-6 text-ink font-bold" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-heading font-bold text-cream">Take Complete!</h3>
                    <p className="text-xs text-stone leading-relaxed">You have recorded the entire script. What would you like to do next?</p>
                  </div>
                  <div className="flex flex-col gap-2 pt-2">
                    <button
                      onClick={() => {
                        setShowFinishConfirm(false)
                        setPhase('review')
                      }}
                      className="btn-gradient w-full py-3 text-sm flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="h-4 w-4" /> Move to AI Editing
                    </button>
                    <button
                      onClick={() => {
                        setShowFinishConfirm(false)
                        reshoot()
                      }}
                      className="btn-ghost w-full py-2.5 text-xs text-stone hover:text-coral border border-white/5 bg-white/5 rounded-xl transition-all flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Retake video
                    </button>
                  </div>
                </motion.div>
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
                  className={cn(
                    "h-full w-full transition-all duration-300",
                    selectedAspect === '1:1' ? "object-cover" : "object-contain"
                  )}
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

          {/* Mobile Configurator & Status checklist (lg:hidden) */}
          {phase === 'review' && (
            <div className="block lg:hidden border-t border-white/10 bg-ink2/90 p-5 space-y-4">
              {/* Aspect Ratio */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-sand">Aspect Ratio</label>
                  <span className="text-[8px] text-stone bg-ink3/50 px-1.5 py-0.5 rounded border border-white/5 font-semibold">Live Preview</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedAspect('9:16')}
                    className={cn(
                      "flex-1 rounded-xl border py-2.5 text-center text-xs font-semibold transition-all",
                      selectedAspect === '9:16'
                        ? "border-coral bg-coral/10 text-cream"
                        : "border-white/10 bg-white/5 text-stone"
                    )}
                  >
                    9:16 Portrait
                  </button>
                  <button
                    onClick={() => setSelectedAspect('1:1')}
                    className={cn(
                      "flex-1 rounded-xl border py-2.5 text-center text-xs font-semibold transition-all",
                      selectedAspect === '1:1'
                        ? "border-coral bg-coral/10 text-cream"
                        : "border-white/10 bg-white/5 text-stone"
                    )}
                  >
                    1:1 Square
                  </button>
                </div>
              </div>

              {editPhase === 'none' && (
                <div className="space-y-4">

                  {/* Preset Styles */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-sand">Preset Style</label>
                    <div className="grid grid-cols-3 gap-2">
                      {EDIT_STYLES.map((s) => {
                        const active = editStyle === s.id
                        return (
                          <button
                            key={s.id}
                            onClick={() => chooseStyle(s.id)}
                            className={cn(
                              'p-2.5 rounded-xl border text-center transition-all duration-200',
                              active
                                ? 'border-coral bg-coral/10 text-cream'
                                : 'border-white/10 bg-white/5 text-stone'
                            )}
                          >
                            <span className="text-xs font-semibold block">{s.label}</span>
                            <span className="text-[7px] text-stone block mt-0.5 uppercase tracking-wider">{s.note}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Progress Circle & checklist on Mobile */}
              {editPhase === 'working' && (
                <div className="flex items-center gap-4 bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                  <div className="relative h-14 w-14 shrink-0 flex items-center justify-center">
                    <span className="text-xs font-bold text-cream">{editPct}%</span>
                    <svg className="h-full w-full rotate-[-90deg]">
                      <circle cx="28" cy="28" r="23" className="stroke-white/10 fill-none stroke-2" />
                      <circle cx="28" cy="28" r="23" className="stroke-coral fill-none stroke-2 transition-all duration-300" strokeDasharray={`${2 * Math.PI * 23}`} strokeDashoffset={`${2 * Math.PI * 23 * (1 - editPct / 100)}`} stroke="currentColor" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <span className="text-xs font-semibold text-cream animate-pulse block">{editStatus}</span>
                    <span className="text-[10px] text-stone block">AI editing in progress...</span>
                  </div>
                </div>
              )}

              {/* Manual adjustments on Mobile when Done */}
              {editPhase === 'done' && editUrl && (
                <div className="flex gap-2">
                  <button
                    onClick={openRefine}
                    disabled={refineLoading}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs text-cream hover:bg-white/10 transition-all"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5 text-teal" /> Subtitles
                  </button>
                  <button
                    onClick={() => alert("Timeline cut editor opened!")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs text-cream hover:bg-white/10 transition-all"
                  >
                    <Clapperboard className="h-3.5 w-3.5 text-coral" /> Cut List
                  </button>
                </div>
              )}
            </div>
          )}

          {/* transport bar */}
          {camReady && (
            <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-ink2/80 p-3">
              {phase === 'idle' && (
                <button onClick={startCountdown} className="btn-gradient w-full py-3.5 text-base">
                  <Circle className="h-4 w-4 fill-current" /> Start recording
                </button>
              )}
              {(phase === 'recording' || phase === 'countdown') && (
                <>
                  {paused ? (
                    <button onClick={resumeShot} className="btn-gradient">
                      <Play className="h-4 w-4 fill-current" /> Resume
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        const rec = recorderRef.current
                        if (rec && rec.state === 'recording') {
                          rec.pause()
                          setPaused(true)
                          setScrolling(false)
                        }
                      }}
                      className="btn-ghost"
                      title="Pause teleprompter and video recording"
                    >
                      <Pause className="h-4 w-4" /> Pause
                    </button>
                  )}
                  {!paused && shotIdx < lines.length - 1 && (
                    <button onClick={nextShot} className="btn-ghost" title="Pause, reposition / change location, then record the next shot">
                      <Pause className="h-4 w-4" /> Cut · next shot
                    </button>
                  )}
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
        {phase !== 'review' && (
          <div className="hidden lg:block space-y-4">
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
            <div className="flex items-center justify-between">
              <h3 className="font-heading">Full script</h3>
              <span className="text-xs text-stone">{gen.blueprint.script?.length ?? 0} lines</span>
            </div>
            <div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
               {gen.blueprint.hook_options && gen.blueprint.hook_options.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-stone">Pick your hook</div>
                  {gen.blueprint.hook_options.map((h, i) => {
                    const isChosen = selectedHook === h
                    return (
                      <button
                        key={i}
                        onClick={() => pickHook(h)}
                        className={cn(
                          'relative w-full text-left flex items-start gap-4 rounded-xl p-5 text-sm sm:text-base font-medium transition-all duration-300 hover:-translate-y-0.5 shadow-sm',
                          isChosen
                            ? 'bg-ink3 text-cream shadow-glow'
                            : 'bg-ink3/40 border border-white/5 text-sand hover:border-white/10 hover:bg-ink3/75'
                        )}
                      >
                        {isChosen && <div className="absolute inset-0 rounded-xl gradient-border pointer-events-none" />}
                        <span className={cn('mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors z-10', isChosen ? 'border-coral bg-coral text-ink' : 'border-white/20')}>
                          {isChosen && <Check className="h-3 w-3 text-ink stroke-[3]" />}
                        </span>
                        <div className="flex-1 min-w-0 z-10 italic font-semibold text-cream leading-relaxed">
                          “{h}”
                        </div>
                      </button>
                    )
                  })}
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

          <div className="glass p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-heading flex items-center gap-1.5">
                <Clapperboard className="h-4 w-4 text-stone" /> Shot List & B-Rolls
              </h3>
              <span className="text-xs text-stone">{gen.blueprint.shot_list?.length ?? 0} items</span>
            </div>
            <div className="mt-3 max-h-72 space-y-3.5 overflow-y-auto pr-1">
              {gen.blueprint.shot_list?.map((s, i) => {
                const isBroll = s.shot_type === 'b_roll'
                const isTalkingHead = s.shot_type === 'talking_head'
                const isReplicate = s.b_roll_type === 'replicate'

                return (
                  <div key={i} className={cn(
                    "border-l-2 pl-3 py-1 space-y-1.5 transition-all duration-200",
                    isReplicate
                      ? "border-amber/40 bg-amber/[0.02]"
                      : isBroll
                        ? "border-coral/30 bg-coral/[0.01]"
                        : isTalkingHead
                          ? "border-teal/30 bg-teal/[0.01]"
                          : "border-white/10"
                  )}>
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-cream leading-relaxed block">{s.shot}</span>
                      <span className="inline-block text-[9px] font-mono text-stone bg-ink3/50 border border-white/5 rounded px-1.5 py-0.5 leading-snug">{s.framing}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {s.shot_type && (
                        <span className={cn(
                          "text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-0.5",
                          isBroll ? "bg-coral/10 text-coral" : isTalkingHead ? "bg-teal/10 text-teal" : "bg-stone/10 text-stone"
                        )}>
                          {isBroll ? 'B-Roll' : isTalkingHead ? 'Talking Head' : 'Cover'}
                        </span>
                      )}
                      {isBroll && s.b_roll_type && (
                        <span className={cn(
                          "text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                          isReplicate ? "bg-amber/10 text-amber border border-amber/10" : "bg-stone/10 text-stone"
                        )}>
                          {isReplicate ? 'Replicate' : 'Stock'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone leading-relaxed">{s.notes}</p>
                    {isBroll && s.b_roll_visual && (
                      <div className="bg-ink3/40 border border-white/5 rounded p-2.5 mt-1 text-[10px] text-sand/90">
                        <span className="font-bold text-cream uppercase text-[8px] tracking-wider block mb-0.5">Asset directive:</span>
                        {s.b_roll_visual}
                      </div>
                    )}
                    {s.spoken_text && s.spoken_text.trim() !== '' && (
                      <div className="text-[10px] text-teal/95 italic pl-2 border-l border-teal/20 mt-1.5 leading-relaxed">
                        “{s.spoken_text}”
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {!camReady && !camError && (
            <p className="px-1 text-xs text-stone">
              <VideoOff className="mr-1 inline h-3.5 w-3.5" />
              Recording is private, your camera feed never leaves this device.
            </p>
          )}
        </div>
        )}

        {/* ---------- side panel: AI Edit Configurator & Post Production (Review Phase) ---------- */}
        {phase === 'review' && (
          <div className="hidden lg:block space-y-4">
            {/* Aspect Ratio Selector (Permanently visible in Review) */}
            <div className="glass p-5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-sand">Aspect Ratio</label>
                <span className="text-[10px] text-stone bg-ink3/50 px-2 py-0.5 rounded border border-white/5 font-semibold">Live Preview</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedAspect('9:16')}
                  className={cn(
                    "flex-1 rounded-xl border py-2.5 text-center text-xs font-semibold transition-all",
                    selectedAspect === '9:16'
                      ? "border-coral bg-coral/10 text-cream"
                      : "border-white/10 bg-white/5 text-stone hover:text-cream"
                  )}
                >
                  9:16 Portrait
                </button>
                <button
                  onClick={() => setSelectedAspect('1:1')}
                  className={cn(
                    "flex-1 rounded-xl border py-2.5 text-center text-xs font-semibold transition-all",
                    selectedAspect === '1:1'
                      ? "border-coral bg-coral/10 text-cream"
                      : "border-white/10 bg-white/5 text-stone hover:text-cream"
                  )}
                >
                  1:1 Square
                </button>
              </div>
            </div>

            {/* Phase 1: Pre-edit Style Selection */}
            {editPhase === 'none' && (
              <div className="glass p-5 space-y-5">
                <div>
                  <h2 className="font-heading text-lg text-cream">AI Edit Configurator</h2>
                  <p className="mt-1 text-xs text-stone leading-relaxed">Customize your video format and automated styling presets.</p>
                </div>

                {/* Edit presets card grid */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-sand">Editing Preset Style</label>
                  <div className="space-y-2.5">
                    {EDIT_STYLES.map((s) => {
                      const active = editStyle === s.id
                      return (
                        <button
                          key={s.id}
                          onClick={() => chooseStyle(s.id)}
                          className={cn(
                            'w-full text-left p-4 rounded-xl border transition-all duration-200 space-y-1',
                            active
                              ? 'border-coral bg-coral/10 text-cream shadow-sm'
                              : 'border-white/10 bg-white/5 text-sand hover:bg-white/10'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-cream">{s.label}</span>
                            {s.popular && <span className="rounded-full bg-coral/20 px-2 py-0.5 text-[8px] font-bold text-coral">POPULAR</span>}
                          </div>
                          <p className="text-[10px] text-stone leading-relaxed">
                            {s.id === 'punchy' && 'Removes silence, zooms in on keywords, and adds active pop-up subtitles. Best for high-energy social media.'}
                            {s.id === 'clean' && 'Removes filler words and pauses with tidy cuts and neat subtitles. Best for professional/educational videos.'}
                            {s.id === 'cinematic' && 'Smoother pacing, slow camera zooms, and elegant lowercase text overlays. Best for storytelling.'}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <button onClick={runAutoEdit} className="btn-gradient w-full py-3.5 text-sm flex items-center justify-center gap-2">
                  <Sparkles className="h-4 w-4" /> Start AI Editing
                </button>
              </div>
            )}

            {/* Phase 2: Live Progress Checklist */}
            {editPhase === 'working' && (
              <div className="glass p-5 space-y-6">
                <div>
                  <h2 className="font-heading text-lg text-cream">AI Rendering Studio</h2>
                  <p className="mt-1 text-xs text-stone">Please wait while the Stylique model designs your final video take.</p>
                </div>

                {/* Progress Circle & Status */}
                <div className="flex flex-col items-center justify-center p-6 border border-white/5 rounded-2xl bg-white/[0.02]">
                  <div className="relative h-20 w-20 flex items-center justify-center">
                    <span className="absolute text-sm font-bold text-cream">{editPct}%</span>
                    <svg className="h-full w-full rotate-[-90deg]">
                      <circle cx="40" cy="40" r="34" className="stroke-white/10 fill-none stroke-2" />
                      <circle cx="40" cy="40" r="34" className="stroke-coral fill-none stroke-2 transition-all duration-300" strokeDasharray={`${2 * Math.PI * 34}`} strokeDashoffset={`${2 * Math.PI * 34 * (1 - editPct / 100)}`} stroke="currentColor" />
                    </svg>
                  </div>
                  <span className="mt-3 text-xs font-semibold text-cream animate-pulse">{editStatus}</span>
                </div>

                {/* Live Checklist */}
                <div className="space-y-3.5 pt-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-stone">Processing checklist</label>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-teal" />
                      <span className="text-cream">Syncing spoken timeline</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {editPct >= 35 ? <Check className="h-4 w-4 text-teal" /> : <Loader2 className="h-4 w-4 text-coral animate-spin" />}
                      <span className={editPct >= 35 ? "text-cream" : "text-stone"}>Removing silence &amp; filler words</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {editPct >= 65 ? <Check className="h-4 w-4 text-teal" /> : editPct >= 35 ? <Loader2 className="h-4 w-4 text-coral animate-spin" /> : <div className="h-4 w-4 rounded-full border border-white/20" />}
                      <span className={editPct >= 65 ? "text-cream" : "text-stone"}>Inserting matched B-roll overlays</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {editPct >= 95 ? <Check className="h-4 w-4 text-teal" /> : editPct >= 65 ? <Loader2 className="h-4 w-4 text-coral animate-spin" /> : <div className="h-4 w-4 rounded-full border border-white/20" />}
                      <span className={editPct >= 95 ? "text-cream" : "text-stone"}>Generating styled captions</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Phase 3: Post Production controls */}
            {editPhase === 'done' && editUrl && (
              <div className="glass p-5 space-y-5">
                <div>
                  <h2 className="font-heading text-lg text-cream">AI Edit Finished!</h2>
                  <p className="mt-1 text-xs text-stone">Your video is ready. Preview it on the left player or fine-tune details below.</p>
                </div>

                {/* Fine-Tuning Toolkit */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-sand">Manual Refinement</label>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={openRefine}
                      disabled={refineLoading}
                      className="w-full flex items-center justify-between p-3.5 rounded-xl border border-white/10 bg-white/5 text-xs text-cream hover:bg-white/10 transition-all text-left"
                    >
                      <span className="flex items-center gap-2">
                        <SlidersHorizontal className="h-4 w-4 text-teal" /> Adjust Subtitles &amp; Styles
                      </span>
                      <ChevronRight className="h-4 w-4 text-stone" />
                    </button>
                    <button
                      onClick={openRefine}
                      disabled={refineLoading}
                      className="w-full flex items-center justify-between p-3.5 rounded-xl border border-white/10 bg-white/5 text-xs text-cream hover:bg-white/10 transition-all text-left"
                    >
                      <span className="flex items-center gap-2">
                        <Clapperboard className="h-4 w-4 text-coral" /> Interactive Cut List
                      </span>
                      <ChevronRight className="h-4 w-4 text-stone" />
                    </button>
                  </div>
                </div>

                {/* Save and Publish Toolkit */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <label className="text-xs font-bold uppercase tracking-wider text-sand">Save &amp; Share</label>
                  <div className="flex flex-col gap-2">
                    <a href={editUrl} download={`stylique-edited-${id}.mp4`} className="btn-gradient w-full py-3 text-sm flex items-center justify-center gap-1.5">
                      <Download className="h-4 w-4" /> Download High-Res Video
                    </a>
                    <button className="btn-ghost w-full py-2.5 text-xs text-stone hover:text-cream border border-white/10 bg-white/5 rounded-xl flex items-center justify-center gap-1.5 transition-all">
                      <Folder className="h-3.5 w-3.5" /> Save to Private Library
                    </button>
                    <button className="btn-ghost w-full py-2.5 text-xs text-stone hover:text-cream border border-white/10 bg-white/5 rounded-xl flex items-center justify-center gap-1.5 transition-all">
                      <Share2 className="h-3.5 w-3.5 text-teal" /> Publish to Connected Socials
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {/* Mobile Drawer Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            {/* Drawer Content */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="absolute bottom-0 inset-x-0 max-h-[85vh] overflow-y-auto rounded-t-panel border-t border-white/10 bg-ink2/95 p-6 shadow-lift space-y-6"
            >
              <div className="flex items-center justify-between">
                <span className="font-heading text-base text-cream">Script &amp; Controls</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-full bg-white/5 border border-white/10 p-2 text-stone hover:text-cream hover:bg-white/10 transition-all"
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>

              {/* Teleprompter controls */}
              <div className="space-y-4">
                <h3 className="font-heading text-xs font-semibold tracking-wide uppercase text-stone flex items-center gap-1.5">
                  Teleprompter Controls
                </h3>
                <div className="bg-ink3/45 rounded-xl border border-white/5 p-4 space-y-4">
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

              {/* Full Script */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading text-xs font-semibold tracking-wide uppercase text-stone">Full script</h3>
                  <span className="text-xs text-stone">{gen.blueprint.script?.length ?? 0} lines</span>
                </div>
                <div className="max-h-60 space-y-3 overflow-y-auto pr-1 bg-ink3/45 rounded-xl border border-white/5 p-4">
                  {gen.blueprint.hook_options && gen.blueprint.hook_options.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-stone">Pick your hook</div>
                      {gen.blueprint.hook_options.map((h, i) => {
                        const isChosen = selectedHook === h
                        return (
                          <button
                            key={i}
                            onClick={() => pickHook(h)}
                            className={cn(
                              'relative w-full text-left flex items-start gap-4 rounded-xl p-4 text-sm font-medium transition-all duration-300 shadow-sm',
                              isChosen
                                ? 'bg-ink3 text-cream shadow-glow border border-coral/35'
                                : 'bg-ink3/40 border border-white/5 text-sand hover:border-white/10 hover:bg-ink3/75'
                            )}
                          >
                            <span className={cn('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors z-10', isChosen ? 'border-coral bg-coral text-ink' : 'border-white/20')}>
                              {isChosen && <Check className="h-2.5 w-2.5 text-ink stroke-[3]" />}
                            </span>
                            <div className="flex-1 min-w-0 z-10 italic text-cream leading-relaxed text-xs">
                              “{h}”
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {gen.blueprint.script?.map((s, i) => (
                    <div key={i} className="border-l-2 border-white/10 pl-3">
                      <div className="text-[10px] uppercase tracking-wider text-stone">{s.section}</div>
                      <p className="text-xs text-cream">{s.line}</p>
                      {s.direction && <p className="text-[10px] italic text-stone">( {s.direction} )</p>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Shot List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading text-xs font-semibold tracking-wide uppercase text-stone flex items-center gap-1.5">
                    <Clapperboard className="h-3.5 w-3.5 text-stone" /> Shot List &amp; B-Rolls
                  </h3>
                  <span className="text-xs text-stone">{gen.blueprint.shot_list?.length ?? 0} items</span>
                </div>
                <div className="max-h-60 space-y-3.5 overflow-y-auto pr-1 bg-ink3/45 rounded-xl border border-white/5 p-4">
                  {gen.blueprint.shot_list?.map((s, i) => {
                    const isBroll = s.shot_type === 'b_roll'
                    const isTalkingHead = s.shot_type === 'talking_head'
                    const isReplicate = s.b_roll_type === 'replicate'

                    return (
                      <div key={i} className={cn(
                        "border-l-2 pl-3 py-1 space-y-1.5 transition-all duration-200",
                        isReplicate
                          ? "border-amber/40 bg-amber/[0.02]"
                          : isBroll
                            ? "border-coral/30 bg-coral/[0.01]"
                            : isTalkingHead
                              ? "border-teal/30 bg-teal/[0.01]"
                              : "border-white/10"
                      )}>
                        <div className="space-y-1">
                          <span className="text-xs font-semibold text-cream leading-relaxed block">{s.shot}</span>
                          <span className="inline-block text-[9px] font-mono text-stone bg-ink3/50 border border-white/5 rounded px-1.5 py-0.5 leading-snug">{s.framing}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {s.shot_type && (
                            <span className={cn(
                              "text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-0.5",
                              isBroll ? "bg-coral/10 text-coral" : isTalkingHead ? "bg-teal/10 text-teal" : "bg-stone/10 text-stone"
                            )}>
                              {isBroll ? 'B-Roll' : isTalkingHead ? 'Talking Head' : 'Cover'}
                            </span>
                          )}
                          {isBroll && s.b_roll_type && (
                            <span className={cn(
                              "text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                              isReplicate ? "bg-amber/10 text-amber border border-amber/10" : "bg-stone/10 text-stone"
                            )}>
                              {isReplicate ? 'Replicate' : 'Stock'}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-stone leading-relaxed">{s.notes}</p>
                        {isBroll && s.b_roll_visual && (
                          <div className="bg-ink3/40 border border-white/5 rounded p-2 mt-1 text-[9px] text-sand/90">
                            <span className="font-bold text-cream uppercase text-[8px] tracking-wider block mb-0.5">Asset directive:</span>
                            {s.b_roll_visual}
                          </div>
                        )}
                        {s.spoken_text && s.spoken_text.trim() !== '' && (
                          <div className="text-[9px] text-teal/95 italic pl-2 border-l border-teal/20 mt-1.5 leading-relaxed">
                            “{s.spoken_text}”
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
