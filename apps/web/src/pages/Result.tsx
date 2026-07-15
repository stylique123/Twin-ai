import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Copy, Check, Quote, FileText, Clapperboard,
  Wand2, Send, Loader2, Video, ExternalLink,
  SlidersHorizontal, Play, BadgeCheck, Link2, MessageSquare, Users,
  TrendingUp, User, Download,
} from 'lucide-react'

// Phase-0 guided publishing: deep-link straight into each platform's uploader.
// (Real one-click auto-post needs per-platform OAuth + app review — staged later.)
const UPLOAD_URLS: Record<string, string> = {
  tiktok: 'https://www.tiktok.com/upload',
  youtube: 'https://studio.youtube.com/',
  instagram: 'https://www.instagram.com/',
}
import { getGeneration, markPosted, updateGenerationChoice, setGenerationApproved, createReviewLink, fetchEdl, logEvent, generateThumbnail, signEditUrls, pollEditJob, listPosts } from '../lib/api'

// Stale-while-revalidate cache so reopening a plan is INSTANT instead of showing a
// full-screen "Loading your script…" every time (the plan page had no cache; the
// Library does). Keyed by generation id; module-scoped so it survives route changes.
const GEN_CACHE: Record<string, Generation> = {}
import { useAuth } from '../context/AuthContext'
import type { Generation, EditDecisionList } from '../lib/types'
import { Aurora } from '../components/Aurora'
import { RefinePanel } from '../components/RefinePanel'
import { EASE } from '../components/motion'
import { cn } from '../lib/cn'

const MOCK_BLUEPRINT = {
  reference_read: {
    platform: 'instagram',
    format_label: 'The Hook-Switch Strategy',
    why_it_works: [
      'High-contrast pattern interrupt hooks stop scrolling immediately.',
      'Frequent frame changes and visual cues keep attention high in the middle.',
      'Strong self-relevance naming calls out the exact target audience.'
    ],
    retention_map: [
      { beat: '0-3s Hook', goal: 'Stop the scroll by calling out a specific creator problem', tactic: 'Curiosity loop + Pattern interrupt' },
      { beat: '4-10s Setup', goal: 'Deliver the core concept immediately without fluff', tactic: 'Visual change every 2 seconds' },
      { beat: '11-20s Middle Re-hook', goal: 'Re-open curiosity loop before interest sags', tactic: 'Contrarian claim' },
      { beat: '21-30s CTA / Payoff', goal: 'Drive high-conversion saves and comments', tactic: 'Comment-bait question' }
    ]
  },
  b_roll_stats: {
    original_b_roll_count: '2',
    suggested_b_roll_count: '2'
  },
  hook_options: [
    'Here is the part nobody tells you about building AI agents...',
    'Stop building AI agents like a school project. Do this instead.',
    'I built 10 AI agents this week, and this is my biggest mistake.',
    'If you are not using this specific prompt format, your agents will fail.',
    'The secret to making your AI agents look premium in under 2 minutes.'
  ],
  script: [
    {
      section: 'Hook',
      line: 'Here is the part nobody tells you about building AI agents...',
      direction: 'Zoom in slowly on creator sitting in front of a dark screen with warm backlight',
      background: 'Sleek dark room, desk with warm amber ambient strip light, monitor displaying code editor in background.',
      action_posing: 'Lean forward slightly, make direct eye contact with the camera, point finger index for emphasis.',
      cuts_info: 'Start wide, cut to a tight punchy chest-up shot exactly as the first word is spoken.'
    },
    {
      section: 'Setup',
      line: 'They tell you it is all about the model. But actually, it is about the system design.',
      direction: 'Cut to high-resolution product demo showing visual canvas editor',
      background: 'Clean desktop screen-recording showing code flows and visual builder.',
      action_posing: 'Maintain voiceover with high energy and pacing, point to screen features with cursor.',
      cuts_info: 'Slide transition to screen recording, crop and zoom in on key code blocks.'
    },
    {
      section: 'Re-hook',
      line: 'But here is the part where most creators get stuck and fail.',
      direction: 'Cut back to creator looking concerned, shaking head slightly',
      background: 'Sleek dark room, warm amber lighting.',
      action_posing: 'Shake head slowly, hands open in a posture of warning, maintain intense eye contact.',
      cuts_info: 'Jump cut to slightly tighter framing on the word "stuck".'
    },
    {
      section: 'CTA',
      line: 'Comment "AGENT" and I will send you my complete design blueprint for free.',
      direction: 'Display kinetic text overlay on screen: AGENT',
      background: 'Sleek dark room, warm lighting with a teal highlight glow.',
      action_posing: 'Smile confidently, gesture with hands bringing them together, point at the screen.',
      cuts_info: 'Slow zoom out, display big bold teal colored captions in the center.'
    }
  ],
  shot_list: [
    {
      shot: 'Cover Frame',
      framing: 'Medium close up, holding phone like a mic',
      notes: 'Creator posture: Inquisitive look. Background: Ambient studio.',
      shot_type: 'cover_frame',
      b_roll_type: 'none',
      b_roll_visual: '',
      spoken_text: ''
    },
    {
      shot: 'Talking Head A',
      framing: 'Chest-up shot',
      notes: 'Camera position: Chest-up. Creator posture: Lean forward slightly. Background: Remain same.',
      shot_type: 'talking_head',
      b_roll_type: 'none',
      b_roll_visual: '',
      spoken_text: 'Here is the part nobody tells you about building AI agents...'
    },
    {
      shot: 'B roll Insert 1',
      framing: 'B-Roll Overlay',
      notes: 'Camera position: Replaced by B-roll. Creator: Voiceover only.',
      shot_type: 'b_roll',
      b_roll_type: 'replicate',
      b_roll_visual: 'Real screen recording of system design workflow showing drag-and-drop nodes connecting.',
      spoken_text: 'They tell you it is all about the model. But actually, it is about the system design.'
    },
    {
      shot: 'Talking Head B',
      framing: 'Close-up shot',
      notes: 'Camera position: Move to Close-up. Creator posture: Concern, shake head. Background: Remain same.',
      shot_type: 'talking_head',
      b_roll_type: 'none',
      b_roll_visual: '',
      spoken_text: 'But here is the part where most creators get stuck and fail.'
    },
    {
      shot: 'B roll Insert 2',
      framing: 'B-Roll Overlay',
      notes: 'Camera position: Replaced by B-roll. Creator: Voiceover only.',
      shot_type: 'b_roll',
      b_roll_type: 'stock',
      b_roll_visual: 'Close up shot of hands typing keyboard, overlay with glowing kinetic text AGENT in teal.',
      spoken_text: ''
    },
    {
      shot: 'Talking Head C',
      framing: 'Chest-up shot',
      notes: 'Camera position: Move back to Chest-up. Creator posture: Smile confidently, gesture. Background: Remain same.',
      shot_type: 'talking_head',
      b_roll_type: 'none',
      b_roll_visual: '',
      spoken_text: 'Comment "AGENT" and I will send you my complete design blueprint for free.'
    }
  ],
  captions: ['AI Agents', 'System Design', 'Creator Blueprint', 'Coding Tips'],
  edit_checklist: [
    'Cut out all silent gaps and filler words immediately.',
    'Dampen background music to -20dB during spoken dialogue.',
    'Apply teal colored word highlights on keywords: AGENT, STUCK, FAIL.'
  ],
  caption_packet: {
    caption_style: 'Cinematic word-by-word',
    pacing: 'Fast cuts, bold emphasis',
    emphasis: 'Teal word glow',
    export: '9:16 vertical MP4, 60fps'
  },
  publish_plan: [
    { platform: 'instagram', caption: 'Stop building basic AI agents. Comment AGENT to get my blueprint.', hashtags: ['#ai', '#coding', '#build'], best_time: '12:00 PM' },
    { platform: 'tiktok', caption: 'The secret to premium AI agents.', hashtags: ['#ai', '#tech', '#developer'], best_time: '5:00 PM' }
  ],
  production_sprint: [
    { minute: '0:00 - 5:00', task: 'Setup amber/teal lighting and adjust camera framing.' },
    { minute: '5:00 - 10:00', task: 'Record 3 takes of the script with hook options.' },
    { minute: '10:00 - 20:00', task: 'Upload to Stylique and export final cut.' }
  ]
}

const MOCK_GENERATION = {
  id: 'demo',
  user_id: 'demo-user',
  reference_url: 'https://instagram.com/reel/demo',
  reference_note: 'A premium showcase script',
  fidelity: 'balanced',
  blueprint: MOCK_BLUEPRINT,
  selected_hook: 'Here is the part nobody tells you about building AI agents...',
  edit_style: 'cinematic',
  approved: false
}

export default function Result() {
  const { id } = useParams()
  const { profile } = useAuth()
  const [gen, setGen] = useState<Generation | null>(() => (id ? GEN_CACHE[id] ?? null : null))
  // Only block on the full-screen loader when we have NOTHING cached to show.
  const [loading, setLoading] = useState(() => !(id && GEN_CACHE[id]))
  const [posted, setPosted] = useState(false)
  const [chosenHook, setChosenHook] = useState('')
  const [approved, setApproved] = useState(false)
  const [mobileTab, setMobileTab] = useState<'script' | 'strategy' | 'spec' | 'publish'>('script')
  const [activeTab, setActiveTab] = useState<'strategy' | 'spec' | 'publish'>('strategy')
  // On-demand AI thumbnail (parity with the V2 plan): signed URL + busy/error.
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [thumbBusy, setThumbBusy] = useState(false)
  const [thumbErr, setThumbErr] = useState<string | null>(null)
  useEffect(() => {
    const p = gen?.ai_thumb_path
    // Don't force-null when the path is absent — that would wipe a thumbnail we just
    // generated this session if a lagged gen refetch briefly returns ai_thumb_path=null.
    if (!p) return
    let live = true
    signEditUrls([p]).then((m) => { if (live && m[p]) setThumbUrl(m[p]) }).catch(() => {})
    return () => { live = false }
  }, [gen?.ai_thumb_path])
  // The FINISHED video (once recorded + edited) — sign its path so it plays right
  // here on the plan/Library screen, instead of the screen only ever offering
  // "Record / Upload" as if nothing had been made yet.
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  useEffect(() => {
    const p = gen?.edit_path
    if (!p) { setVideoUrl(null); return }
    let live = true
    signEditUrls([p]).then((m) => { if (live) setVideoUrl(m[p] ?? null) }).catch(() => {})
    return () => { live = false }
  }, [gen?.edit_path])
  const downloadVideo = () => {
    if (!videoUrl) return
    const href = videoUrl + (videoUrl.includes('?') ? '&' : '?') + 'download=twinai-video.mp4'
    const a = document.createElement('a'); a.href = href; a.rel = 'noopener'
    document.body.appendChild(a); a.click(); a.remove()
  }
  const genThumb = async () => {
    if (!gen) return
    setThumbErr(null); setThumbBusy(true)
    try {
      const r = await generateThumbnail(gen.id)
      setThumbUrl(r.url)
      // Persist the new path into local gen so it survives refetches + shows in Library.
      setGen((prev) => (prev ? { ...prev, ai_thumb_path: r.path } : prev))
    }
    catch (e) { setThumbErr(e instanceof Error ? e.message : 'Could not generate the thumbnail.') }
    finally { setThumbBusy(false) }
  }
  // Agency approval workflow: agencies mark a blueprint client-approved before it's
  // recorded/posted. Soft status (no hard block) so solo creators are unaffected.
  const isAgency = profile?.plan === 'agency'
  const toggleApproved = async () => {
    if (!gen) return
    const next = !approved
    setApproved(next)
    const ok = await setGenerationApproved(gen.id, next)
    if (!ok) setApproved(!next) // revert on failure
  }
  // Live across the long refine poll so we don't setState (or keep polling) after
  // the user navigates away mid-render.
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])
  // Refine-from-Result: re-edit a finished video right from its blueprint page.
  const [refineOpen, setRefineOpen] = useState(false)
  const [refineEdl, setRefineEdl] = useState<EditDecisionList | null>(null)
  const [refineLoading, setRefineLoading] = useState(false)
  const [refineStatus, setRefineStatus] = useState('')
  const [refineUrl, setRefineUrl] = useState<string | null>(null)

  const openRefine = async () => {
    setRefineOpen(true); setRefineUrl(null)
    if (!gen?.edl_path) { setRefineEdl(null); return }
    setRefineLoading(true)
    try { setRefineEdl(await fetchEdl(gen.edl_path)) } catch { setRefineEdl(null) } finally { setRefineLoading(false) }
  }
  const onRefineApplied = async (jobId: string) => {
    setRefineStatus('Re-rendering your edit…')
    // Shared terminal-poll loop (same one V2Review uses) instead of a hand-rolled copy.
    const job = await pollEditJob(jobId, (label) => { if (label) setRefineStatus(label) }, { shouldStop: () => !alive.current })
    if (!alive.current) return // navigated away — don't setState
    if (job?.status === 'done' && job.result?.output_url) {
      setRefineStatus(''); setRefineUrl(job.result.output_url)
      getGeneration(id!).then((g) => g && alive.current && setGen(g)).catch(() => {})
    } else if (job?.status === 'failed') {
      setRefineStatus('Refine failed — try again.')
    } else {
      setRefineStatus('Still rendering — check your Library shortly.')
    }
  }

  useEffect(() => {
    if (!id) return
    // Demo mock is a DEV-only convenience — production users always get real data
    // (or a real error), never a fabricated blueprint.
    if (import.meta.env.DEV && id === 'demo') {
      setGen(MOCK_GENERATION as any)
      setApproved(false)
      setChosenHook(MOCK_GENERATION.selected_hook)
      setLoading(false)
      return
    }
    // Know whether this video's already been posted, to swap the header CTA
    // (Post now ↔ Posted). Best-effort — never blocks the page.
    listPosts().then((posts) => {
      if (alive.current) setPosted(posts.some((p) => p.generation_id === id && p.status === 'posted'))
    }).catch(() => {})
    getGeneration(id)
      .then((g) => {
        if (!g) {
          // Real id that didn't resolve (deleted, foreign, or RLS-blocked) →
          // leave gen null so the honest "We couldn't find that script" state
          // renders. NEVER substitute the demo blueprint for a real id.
          return
        }
        GEN_CACHE[id] = g
        setGen(g)
        setApproved(!!g?.approved)
        // Default the shooting hook to the saved choice, else the recommended (1st).
        const hooks = (g?.blueprint?.hook_options ?? []) as string[]
        const initial = g?.selected_hook ?? hooks[0] ?? ''
        setChosenHook(initial)
        // Capture the default the first time, so the gallery's learning signal isn't
        // empty when a creator shoots without explicitly tapping a hook (was 1/15).
        if (id && !g?.selected_hook && initial) void updateGenerationChoice(id, { selected_hook: initial })
      })
      .catch(() => {
        // Load error (network / RLS) → leave gen null for the not-found state
        // rather than fabricating the demo blueprint as the user's own script.
      })
      .finally(() => setLoading(false))
  }, [id])

  // Pick which hook to shoot: persist it so the teleprompter, cover and b-roll all
  // use THIS hook. Optimistic — the UI updates immediately.
  const pickHook = (h: string) => {
    setChosenHook(h)
    if (id) void updateGenerationChoice(id, { selected_hook: h })
  }
  // "Post now" → reveal the posting options (the "Where to post" tab on both layouts).
  const goPost = () => {
    setActiveTab('publish'); setMobileTab('publish')
    setTimeout(() => document.getElementById('post-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  if (loading)
    return (
      <main className="grid min-h-[60vh] place-items-center text-sand">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your script…
        </span>
      </main>
    )
  if (!gen)
    return (
      <main className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-5 text-center">
        <div>
          <p className="font-heading text-lg text-cream">We couldn’t find that script.</p>
          <p className="mt-2 text-sm text-stone">It may have been removed, or the link is out of date.</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link to="/history" className="btn-gradient inline-flex">
              <ArrowLeft className="h-4 w-4" /> Back to Library
            </Link>
            <Link to="/app" className="btn-ghost inline-flex justify-center">
              Make a new video
            </Link>
          </div>
        </div>
      </main>
    )

  // Defensive normalization: an older or partial blueprint can be missing fields,
  // and calling .map on an undefined field would unmount the page (black screen).
  // Default every field so the result always renders something sensible.
  const raw = (gen.blueprint ?? {}) as Partial<Generation['blueprint']>
  const rr = raw.reference_read ?? ({} as NonNullable<Generation['blueprint']>['reference_read'])
  const br = raw.b_roll_stats ?? { original_b_roll_count: '0', suggested_b_roll_count: '0' }
  const b = {
    ...raw,
    reference_read: {
      format_label: rr.format_label ?? 'Your script',
      platform: rr.platform ?? '',
      why_it_works: Array.isArray(rr.why_it_works) ? rr.why_it_works : [],
      retention_map: Array.isArray(rr.retention_map) ? rr.retention_map : [],
    },
    b_roll_stats: {
      original_b_roll_count: br.original_b_roll_count ?? '0',
      suggested_b_roll_count: br.suggested_b_roll_count ?? '0',
    },
    hook_options: Array.isArray(raw.hook_options) ? raw.hook_options : [],
    script: Array.isArray(raw.script) ? raw.script : [],
    shot_list: Array.isArray(raw.shot_list) ? raw.shot_list : [],
    captions: Array.isArray(raw.captions) ? raw.captions : [],
    edit_checklist: Array.isArray(raw.edit_checklist) ? raw.edit_checklist : [],
    production_sprint: Array.isArray(raw.production_sprint) ? raw.production_sprint : [],
    publish_plan: Array.isArray(raw.publish_plan) ? raw.publish_plan : [],
  } as Generation['blueprint']
  const cap = b.caption_packet ?? b.submagic_packet ?? { caption_style: '', pacing: '', emphasis: '', export: '' }

  // A script line that is just a bracket token ("[Hook Option 1]", "[Insert
  // selected hook from above]") is a broken placeholder that must never render as
  // real dialogue. Server-side normalization now prevents new ones; this repairs
  // any already stored: swap the opening hook beat for the chosen/best hook, and
  // blank any stray placeholder elsewhere rather than showing the raw token.
  const isPlaceholder = (l: string) => {
    const t = l.trim()
    return t === '' || /^\[[^\]]*\]$/.test(t) || /\b(hook option\s*\d*|selected hook|insert (the )?hook|your hook (above|here)|hook from above)\b/i.test(t)
  }
  const hookText = chosenHook || b.hook_options[0] || ''
  const updatedScript = b.script.map((s, i) => {
    if (i === 0 && hookText) {
      if (isPlaceholder(s.line)) return { ...s, line: hookText }
      const sentences = s.line.split(/(?<=[.!?])\s+/)
      if (sentences.length > 1) return { ...s, line: `${hookText.trim()} ${sentences.slice(1).join(' ')}` }
      return { ...s, line: hookText }
    }
    if (isPlaceholder(s.line)) return { ...s, line: hookText || s.line }
    return s
  })

  return (
    <main className="relative min-h-screen overflow-clip bg-ink text-sand pb-20">
      {/* Aurora Glow */}
      <Aurora className="opacity-45 pointer-events-none" />

      {/* Hero Header */}
      <section className="relative border-b border-white/5 bg-ink2/30 backdrop-blur-sm">
        <div className="relative mx-auto max-w-7xl px-6 pb-10 pt-12">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link to="/history" className="inline-flex items-center gap-1.5 text-xs text-stone hover:text-cream transition-colors">
              <ArrowLeft className="h-4 w-4" /> Library
            </Link>
            
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {/* Once the video is DONE, the only actions are edit it and post it — no
                  "Watch" (it's right there) and no "Re-record" (the edit is final). */}
              {gen.edit_path ? (
                <>
                  {gen.take_path && (
                    <button onClick={openRefine} className="btn-ghost py-2 text-xs font-medium">
                      <SlidersHorizontal className="h-3.5 w-3.5" /> Edit your video
                    </button>
                  )}
                  {posted ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-teal/40 bg-teal/10 px-3.5 py-2 text-xs font-semibold text-teal">
                      <Check className="h-3.5 w-3.5" /> Posted
                    </span>
                  ) : (
                    <button onClick={goPost} className="btn-gradient py-2 text-xs font-semibold">
                      <Send className="h-3.5 w-3.5" /> Post now
                    </button>
                  )}
                </>
              ) : (
                <>
                  <Link to={`/record/${gen.id}`} className="btn-gradient py-2 text-xs font-semibold"><Video className="h-3.5 w-3.5" /> Record Script</Link>
                  <Link to={`/record/${gen.id}?mode=upload`} className="btn-ghost py-2 text-xs font-medium"><Wand2 className="h-3.5 w-3.5" /> Upload Take</Link>
                </>
              )}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="mt-8"
          >
            <h1 className="mt-3 font-display text-3xl leading-tight tracking-tight text-cream sm:text-4xl">
              {b.reference_read.format_label}
            </h1>
            {chosenHook && (
              <p className="mt-4 max-w-4xl font-heading text-base leading-relaxed text-cream/90 italic pl-3 border-l border-white/10">
                “{chosenHook}”
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="chip text-xs">
                <ExternalLink className="h-3.5 w-3.5 text-stone" /> {b.reference_read.platform}
              </span>
              <span className="chip text-xs">Fidelity · {gen.fidelity}</span>
              {isAgency && (
                <button
                  onClick={toggleApproved}
                  className={cn(
                    'chip text-xs transition-colors',
                    approved ? 'border-teal/50 bg-teal/5 text-teal' : 'hover:border-white/10 hover:text-cream'
                  )}
                  title="Mark approved"
                >
                  <BadgeCheck className={cn('h-3.5 w-3.5', approved ? 'text-teal' : 'text-stone')} />
                  {approved ? 'Approved' : 'Mark Approved'}
                </button>
              )}
            </div>
          </motion.div>

          {/* MEDIA ROW — the finished video and its AI cover image, side by side, each
              hugging its own frame. The cover lives HERE (not inside the Title card) so
              generating one never balloons the concept/title cards. */}
          {(gen.edit_path || b.packaging?.thumbnail) && (
            <div className="mt-8 flex flex-wrap items-start gap-4">
              {gen.edit_path && (
                <div id="your-video" className="w-full max-w-[280px] scroll-mt-24 rounded-card border border-teal/25 bg-ink2/70 p-3 backdrop-blur-sm">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-cream"><span className="h-2 w-2 rounded-full bg-teal" /> Your video</div>
                    {videoUrl && <button onClick={downloadVideo} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-cream hover:bg-white/10"><Download className="h-3.5 w-3.5" /> Download</button>}
                  </div>
                  <div className="flex aspect-[9/16] w-full items-center justify-center overflow-hidden rounded-2xl bg-black">
                    {videoUrl
                      ? <video src={videoUrl} controls playsInline className="h-full w-full object-contain" poster={thumbUrl ?? undefined} />
                      : <Loader2 className="h-6 w-6 animate-spin text-white/40" />}
                  </div>
                </div>
              )}
              {b.packaging?.thumbnail && (
                <div className="w-full max-w-[280px] rounded-card border border-amber/25 bg-ink2/70 p-3 backdrop-blur-sm">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-cream"><span className="h-2 w-2 rounded-full bg-amber" /> Cover image</div>
                    {thumbUrl && (
                      <a href={thumbUrl + (thumbUrl.includes('?') ? '&' : '?') + 'download=twinai-thumbnail.png'}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-cream hover:bg-white/10"><Download className="h-3.5 w-3.5" /> Download</a>
                    )}
                  </div>
                  {/* Same 9:16 frame as the video so the two cards read as one set. */}
                  <div className="aspect-[9/16] w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
                    {thumbUrl ? (
                      <img src={thumbUrl} alt="AI-generated cover" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-ink3/40 px-5 text-center">
                        <div>
                          <Quote className="mx-auto h-6 w-6 text-stone/60" />
                          <p className="mt-2 text-xs text-stone">A ready-to-post cover image for this video.</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <button onClick={genThumb} disabled={thumbBusy}
                    className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 py-2.5 text-sm font-semibold text-cream transition hover:bg-white/20 disabled:opacity-60">
                    {thumbBusy ? 'Making your cover…' : thumbUrl ? 'Regenerate' : 'Generate cover image'}
                  </button>
                  {thumbErr && <p className="mt-1 text-xs text-coral">{thumbErr}. The image engine is occasionally busy — tap again.</p>}
                </div>
              )}
            </div>
          )}

          {/* Concept + packaging — the video idea and the title/thumbnail that earn
              the click, shown before the script in EVERY blueprint view (parity with
              the V2 plan). Full width so it renders on both mobile and desktop. */}
          {(b.concept?.premise || (b.packaging?.titles?.length ?? 0) > 0) && (
            <div className="mt-6 grid items-start gap-3 lg:grid-cols-2">
              {b.concept?.premise && (
                <div className="flex flex-col rounded-card border border-teal/25 bg-teal/[0.06] p-4">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-teal">Your video idea</div>
                  <p className="text-sm font-semibold leading-snug text-cream">{b.concept.premise}</p>
                  {b.concept.your_scale && <p className="mt-1.5 text-xs leading-snug text-sand/85"><span className="text-stone">Film it solo: </span>{b.concept.your_scale}</p>}
                  {b.concept.translations?.length ? (
                    <div className="mt-2 space-y-1">
                      {b.concept.translations.map((t, i) => (
                        <div key={i} className="text-xs leading-snug"><span className="text-stone">{t.theirs}</span><span className="text-teal"> → </span><span className="text-cream">{t.yours}</span></div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
              {(b.packaging?.titles?.length ?? 0) > 0 && (
                <div className="flex flex-col rounded-card border border-amber/25 bg-amber/[0.06] p-4">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber">Title &amp; cover image</div>
                  <p className="text-[10px] uppercase tracking-wide text-stone">Suggested title</p>
                  <p className="text-sm font-bold leading-snug text-cream">{b.packaging!.titles[0]}</p>
                  {b.packaging!.titles.length > 1 && (
                    <div className="mt-1.5 space-y-0.5">{b.packaging!.titles.slice(1).map((t, i) => <p key={i} className="text-xs text-sand/80">{t}</p>)}</div>
                  )}
                  {b.packaging!.thumbnail && (
                    <div className="mt-2 space-y-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-xs">
                      <p className="text-[10px] uppercase tracking-wide text-stone">Cover photo to take</p>
                      <p className="text-cream"><span className="text-stone">Big words: </span>“{b.packaging!.thumbnail.text_overlay}”</p>
                      <p className="text-sand/85"><span className="text-stone">The photo: </span>{b.packaging!.thumbnail.concept}</p>
                      <p className="text-sand/85"><span className="text-stone">How to frame it: </span>{b.packaging!.thumbnail.composition}</p>
                      <p className="text-sand/85"><span className="text-stone">Colours: </span>{b.packaging!.thumbnail.colors}</p>
                      <p className="pt-1 text-[10px] text-stone">Generate the cover image at the top ↑</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* iOS-Style Segmented Control for Mobile Navigation */}
          <div className="mt-8 block lg:hidden">
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-ink3 p-1 border border-white/5 shadow-inner">
              {(['script', 'strategy', 'spec', 'publish'] as const).map((tab) => {
                const active = mobileTab === tab
                return (
                  <button
                    key={tab}
                    onClick={() => setMobileTab(tab)}
                    className={cn(
                      'rounded-lg py-2.5 text-center text-[10px] sm:text-xs font-semibold uppercase tracking-normal sm:tracking-wider transition-all duration-200',
                      active
                        ? 'bg-ink2 text-cream shadow border border-white/5'
                        : 'text-stone hover:text-sand'
                    )}
                  >
                    {tab === 'script' ? 'Script' : tab === 'strategy' ? 'Why it works' : tab === 'spec' ? 'Film & edit' : 'Post it'}
                  </button>
                )
              })}
            </div>
          </div>

        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-10">
        {isAgency && <div className="mb-8"><ClientApprovalCard gen={gen} /></div>}
        
        {/* Desktop Layout: Workspace on Left, Tabbed Inspector Panel on Right */}
        <div className="hidden lg:grid grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Script Workspace (7 cols) */}
          <div className="col-span-7 space-y-10">
            {/* Hook Selector */}
            <div className="rounded-card border border-white/5 bg-ink2/85 p-6 space-y-4 shadow-glass backdrop-blur-md">
              <div className="flex items-center gap-2">
                <Quote className="h-4.5 w-4.5 text-amber" />
                <span className="font-heading text-xs font-semibold text-cream tracking-wide uppercase">Pick your opening line</span>
              </div>
              <p className="text-xs text-stone">Pick an opening line — it updates your script below.</p>
              <div className="grid grid-cols-1 gap-3">
                {b.hook_options.map((h, i) => {
                  const isChosen = h === chosenHook
                  return (
                    <button
                      key={i}
                      onClick={() => pickHook(h)}
                      className={cn(
                        'relative w-full text-left flex items-start gap-4 rounded-card p-5 text-sm sm:text-base font-medium transition-all duration-300 hover:-translate-y-0.5 shadow-sm',
                        isChosen
                          ? 'bg-ink3 text-cream shadow-glow'
                          : 'bg-ink3/45 border border-white/5 text-sand hover:border-white/10 hover:bg-ink3/75'
                      )}
                    >
                      {isChosen && <div className="absolute inset-0 rounded-card gradient-border pointer-events-none" />}
                      <span className={cn('mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors', isChosen ? 'border-coral bg-coral text-ink' : 'border-white/20')}>
                        {isChosen && <Check className="h-3 w-3 text-ink stroke-[3]" />}
                      </span>
                      <div className="flex-1 min-w-0 leading-relaxed">
                        {i === 0 && <span className="mr-2 inline-block rounded-full bg-amber/10 border border-amber/20 px-2 py-0.5 text-[9px] font-bold text-amber uppercase tracking-widest">Recommended</span>}
                        <span className="italic font-semibold text-cream">“{h}”</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Script Teleprompter */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-xs font-semibold tracking-wide uppercase text-stone flex items-center gap-2">
                  <FileText className="h-4 w-4 text-stone" /> Script teleprompter
                </h2>
                <span className="text-xs text-stone">{updatedScript.length} scenes</span>
              </div>
              
              <div className="space-y-6">
                {updatedScript.map((s, i) => {
                  const isHook = s.section?.toLowerCase().includes('hook')
                  const isRehook = s.section?.toLowerCase().includes('re-hook') || s.section?.toLowerCase().includes('rehook')
                  const isCta = s.section?.toLowerCase().includes('cta')
                  const tagColor = isHook ? 'border-amber/20 bg-amber/5 text-amber'
                                 : isRehook ? 'border-coral/20 bg-coral/5 text-coral'
                                 : isCta ? 'border-teal/20 bg-teal/5 text-teal'
                                 : 'border-white/5 bg-ink2/40 text-sand'

                  return (
                    <div key={i} className="rounded-card border border-white/5 bg-ink2/85 p-6 space-y-4 shadow-glass backdrop-blur-md">
                      <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-3">
                        <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider', tagColor)}>
                          {plainSection(s.section, i)}
                        </span>
                        <span className="text-xs font-mono text-stone">Scene {i + 1}</span>
                      </div>
                      
                      {/* Dialogue line */}
                      <div className="font-display text-base leading-relaxed text-cream pl-3 border-l border-white/10">
                        “{s.line}”
                      </div>
                      
                      {/* Scene Parameters list (integrated design instead of sheet grids) */}
                      <div className="pt-5 mt-4 border-t border-white/[0.04] space-y-4 text-xs text-sand">
                        <div className="flex items-start gap-3">
                          <Video className="h-4 w-4 text-amber shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-cream uppercase tracking-wider text-[10px] block mb-0.5">Where to film</span>
                            <span className="text-sand/90 leading-relaxed">{s.background || 'Visual context matching scene.'}</span>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <User className="h-4 w-4 text-coral shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-cream uppercase tracking-wider text-[10px] block mb-0.5">How to stand & move</span>
                            <span className="text-sand/90 leading-relaxed">{s.action_posing || s.direction || 'Camera-facing presence.'}</span>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <SlidersHorizontal className="h-4 w-4 text-teal shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-cream uppercase tracking-wider text-[10px] block mb-0.5">Camera moves & cuts</span>
                            <span className="text-sand/90 leading-relaxed">{s.cuts_info || 'Cut pacing instructions.'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Shot List */}
            <div className="space-y-4">
              <h2 className="font-heading text-xs font-semibold tracking-wide uppercase text-stone flex items-center gap-2">
                <Clapperboard className="h-4 w-4 text-stone" /> Shots & extra clips
              </h2>
              <div className="grid grid-cols-1 gap-4">
                {b.shot_list.map((s, i) => {
                  const isBroll = s.shot_type === 'b_roll'
                  const isTalkingHead = s.shot_type === 'talking_head'
                  const isReplicate = s.b_roll_type === 'replicate'

                  return (
                    <div
                      key={i}
                      className={cn(
                        "relative isolate overflow-hidden rounded-card border p-5 space-y-3.5 shadow-glass backdrop-blur-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between",
                        isReplicate
                          ? "border-amber/35 bg-amber/[0.08]"
                          : isBroll
                            ? "border-coral/25 bg-ink2/85"
                            : isTalkingHead
                              ? "border-teal/25 bg-ink2/85"
                              : "border-white/10 bg-ink2/85"
                      )}
                    >
                      <div className="space-y-2">
                        {/* Title & Framing Badge */}
                        <div className="space-y-1.5">
                          <span className="font-heading text-cream text-sm font-semibold block">{s.shot}</span>
                          <span className="inline-block rounded bg-ink3 border border-white/10 px-2 py-0.5 text-[10px] text-sand font-mono leading-snug">
                            {s.framing}
                          </span>
                        </div>

                        {/* Shot Type & B-Roll Type Badges */}
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {s.shot_type && (
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 border",
                              isBroll
                                ? "border-coral/20 bg-coral/5 text-coral"
                                : isTalkingHead
                                  ? "border-teal/20 bg-teal/5 text-teal"
                                  : "border-stone/20 bg-stone/5 text-stone"
                            )}>
                              {isBroll ? (
                                <>
                                  <Video className="h-2.5 w-2.5" /> Extra clip
                                </>
                              ) : isTalkingHead ? (
                                <>
                                  <User className="h-2.5 w-2.5" /> You talking
                                </>
                              ) : (
                                <>
                                  <Quote className="h-2.5 w-2.5" /> Cover shot
                                </>
                              )}
                            </span>
                          )}

                          {isBroll && s.b_roll_type && (
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border",
                              isReplicate
                                ? "border-amber/20 bg-amber/5 text-amber"
                                : "border-stone/20 bg-stone/5 text-stone"
                            )}>
                              {isReplicate ? 'Copy theirs' : 'Stock clip'}
                            </span>
                          )}
                        </div>

                        {/* Shot Notes / Description */}
                        <p className="text-xs text-stone leading-relaxed pt-1">{s.notes}</p>

                        {/* B-Roll Visual Description */}
                        {isBroll && s.b_roll_visual && (
                          <div className="bg-ink3/30 border border-white/5 rounded-lg p-2.5 mt-2">
                            <span className="text-[9px] font-bold text-cream uppercase tracking-wider block mb-0.5">On-screen text & graphics</span>
                            <span className="text-xs text-sand/85 leading-relaxed">{s.b_roll_visual}</span>
                          </div>
                        )}
                      </div>

                      {/* Spoken Dialog Overlay (if B-roll has spoken words, or if it's Talking Head) */}
                      {s.spoken_text && s.spoken_text.trim() !== '' && (
                        <div className="border-t border-white/[0.04] pt-3 mt-3">
                          <span className="text-[9px] font-bold text-stone uppercase tracking-wider block mb-1">What to say</span>
                          <p className="text-xs italic text-sand pl-2 border-l border-teal/30 leading-relaxed">
                            “{s.spoken_text}”
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

          </div>

          {/* Right Column: Tabbed Inspector Panel (5 cols) */}
          <div id="post-section" className="col-span-5 space-y-6 sticky top-6 scroll-mt-6">
            
            {/* Tab Swapper */}
            <div className="rounded-xl bg-ink3 p-1 border border-white/5 shadow-inner flex">
              {(['strategy', 'spec', 'publish'] as const).map((tab) => {
                const active = activeTab === tab
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      'flex-1 rounded-lg py-2 text-center text-xs font-semibold uppercase tracking-wider transition-all duration-200',
                      active
                        ? 'bg-ink2 text-cream shadow border border-white/5'
                        : 'text-stone hover:text-sand'
                    )}
                  >
                    {tab === 'strategy' ? 'Why it works' : tab === 'spec' ? 'Film & edit' : 'Post it'}
                  </button>
                )
              })}
            </div>

            <AnimatePresence mode="wait">
              {activeTab === 'strategy' && (
                <motion.div
                  key="strategy"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="rounded-card border border-white/5 bg-ink2/85 p-6 space-y-6 shadow-glass backdrop-blur-md"
                >
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-stone" />
                      <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Why it works</h3>
                    </div>
                    <ul className="space-y-3">
                      {b.reference_read.why_it_works.map((w, i) => (
                        <li key={i} className="flex gap-2.5 text-xs text-sand leading-relaxed">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> {w}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Retention Map Visual Timeline */}
                  <div className="border-t border-white/[0.04] pt-6 space-y-4">
                    <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Where people keep watching</h3>
                    <div className="relative pl-6 space-y-6">
                      {/* Vertical line connecting steps */}
                      <div className="absolute left-[9px] top-2 bottom-2 w-px border-l border-dashed border-white/10" />
                      {b.reference_read.retention_map.map((r, i) => (
                        <div key={i} className="relative group">
                          {/* Indicator dot */}
                          <span className="absolute left-[-23px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-ink bg-coral shadow-glow transition-transform duration-300 group-hover:scale-125" />
                          <div className="text-xs font-heading text-cream transition-colors duration-200 group-hover:text-coral">{r.beat}</div>
                          <div className="text-xs text-sand leading-relaxed mt-1">{r.goal}</div>
                          {r.tactic && (
                            <div className="mt-1 text-[10px] text-teal font-semibold uppercase tracking-wide">↳ {r.tactic}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'spec' && (
                <motion.div
                  key="spec"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="rounded-card border border-white/5 bg-ink2/85 p-6 space-y-6 shadow-glass backdrop-blur-md"
                >
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4 text-stone" />
                      <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Editing settings</h3>
                    </div>
                    <div className="grid gap-2.5 grid-cols-2">
                      <Spec label="Captions" value={cap.caption_style} />
                      <Spec label="Speed" value={cap.pacing} />
                      <Spec label="Highlights" value={cap.emphasis} />
                      <Spec label="Save" value={cap.export} />
                    </div>
                  </div>

                  {b.b_roll_stats && (
                    <div className="border-t border-white/[0.04] pt-6 space-y-3">
                      <h4 className="text-xs text-stone font-heading uppercase tracking-wider flex items-center gap-1.5">
                        <Video className="h-3.5 w-3.5" /> Extra clips
                      </h4>
                      <div className="grid gap-2.5 grid-cols-2">
                        <div className="bg-ink3/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between">
                          <span className="text-[10px] text-stone font-heading uppercase tracking-wider">Extra clips in their video</span>
                          <span className="text-xl font-bold font-heading text-sand mt-1">{b.b_roll_stats.original_b_roll_count}</span>
                        </div>
                        <div className="bg-ink3/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between">
                          <span className="text-[10px] text-stone font-heading uppercase tracking-wider">Extra clips to film yourself</span>
                          <span className="text-xl font-bold font-heading text-teal mt-1">{b.b_roll_stats.suggested_b_roll_count}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="border-t border-white/[0.04] pt-6 space-y-3">
                    <h4 className="text-xs text-stone font-heading uppercase tracking-wider">Editing Checklist</h4>
                    <div className="space-y-3">
                      {b.edit_checklist.map((c, i) => (
                        <div key={i} className="flex gap-2.5 text-xs text-sand leading-relaxed">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> {c}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Production Sprint Timeline */}
                  <div className="border-t border-white/[0.04] pt-6 space-y-4">
                    <h4 className="text-xs text-stone font-heading uppercase tracking-wider">Filming schedule</h4>
                    <div className="relative pl-6 space-y-5">
                      <div className="absolute left-[9px] top-2 bottom-2 w-px border-l border-dashed border-white/10" />
                      {b.production_sprint.map((p, i) => (
                        <div key={i} className="relative group">
                          <span className="absolute left-[-23px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-ink bg-amber shadow-glow transition-transform duration-300 group-hover:scale-125" />
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-amber bg-amber/10 border border-amber/20 px-2 py-0.5 rounded-md uppercase tracking-wider">{p.minute}</span>
                            <span className="text-xs font-semibold text-cream leading-relaxed">{p.task}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'publish' && (
                <motion.div
                  key="publish"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="rounded-card border border-white/5 bg-ink2/85 p-6 space-y-4 shadow-glass backdrop-blur-md"
                >
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-stone" />
                    <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Where to post</h3>
                  </div>
                  <div className="space-y-4">
                    {b.publish_plan.map((p, i) => (
                      <PublishRow key={i} generationId={gen.id} platform={p.platform} caption={p.caption} hashtags={p.hashtags} bestTime={p.best_time} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
          
        </div>

        {/* Mobile Tab-Based View (Single column) */}
        <div className="block lg:hidden space-y-6">
          {mobileTab === 'script' && (
            <div className="space-y-6">
              {/* Hook Selector */}
              <div className="rounded-card border border-white/5 bg-ink2/85 p-5 space-y-4 shadow-glass backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <Quote className="h-4.5 w-4.5 text-amber" />
                  <span className="font-heading text-xs font-semibold text-cream tracking-wide uppercase">Pick your opening line</span>
                </div>
                <p className="text-xs text-stone">Pick an opening line — it updates your script below.</p>
                <div className="grid grid-cols-1 gap-3">
                  {b.hook_options.map((h, i) => {
                    const isChosen = h === chosenHook
                    return (
                      <button
                        key={i}
                        onClick={() => pickHook(h)}
                        className={cn(
                          'relative w-full text-left flex items-start gap-4 rounded-card p-5 text-sm sm:text-base font-medium transition-all duration-300 shadow-sm',
                          isChosen
                            ? 'bg-ink3 text-cream shadow-glow'
                            : 'bg-ink3/40 border border-white/5 text-sand hover:border-white/10 hover:bg-ink3/70'
                        )}
                      >
                        {isChosen && <div className="absolute inset-0 rounded-card gradient-border pointer-events-none" />}
                        <span className={cn('mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors', isChosen ? 'border-coral bg-coral text-ink' : 'border-white/20')}>
                          {isChosen && <Check className="h-3 w-3 text-ink stroke-[3]" />}
                        </span>
                        <div className="flex-1 min-w-0 leading-relaxed">
                          {i === 0 && <span className="mr-2 inline-block rounded-full bg-amber/10 border border-amber/20 px-2 py-0.5 text-[9px] font-bold text-amber uppercase tracking-widest">Recommended</span>}
                          <span className="italic font-semibold text-cream">“{h}”</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Script Teleprompter */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-heading text-xs font-semibold tracking-wide uppercase text-stone flex items-center gap-2">
                    <FileText className="h-4 w-4 text-stone" /> Script teleprompter
                  </h2>
                  <span className="text-xs text-stone">{updatedScript.length} scenes</span>
                </div>
                
                <div className="space-y-4">
                  {updatedScript.map((s, i) => {
                    const isHook = s.section?.toLowerCase().includes('hook')
                    const isRehook = s.section?.toLowerCase().includes('re-hook') || s.section?.toLowerCase().includes('rehook')
                    const isCta = s.section?.toLowerCase().includes('cta')
                    const tagColor = isHook ? 'border-amber/20 bg-amber/5 text-amber'
                                   : isRehook ? 'border-coral/20 bg-coral/5 text-coral'
                                   : isCta ? 'border-teal/20 bg-teal/5 text-teal'
                                   : 'border-white/5 bg-ink2/40 text-sand'

                    return (
                      <div key={i} className="rounded-card border border-white/5 bg-ink2/85 p-5 space-y-4 shadow-glass backdrop-blur-md">
                        <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-3">
                          <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider', tagColor)}>
                            {plainSection(s.section, i)}
                          </span>
                          <span className="text-xs font-mono text-stone">Scene {i + 1}</span>
                        </div>
                        
                        {/* Dialogue line */}
                        <div className="font-display text-base leading-relaxed text-cream pl-3 border-l border-white/10">
                          “{s.line}”
                        </div>

                        {/* Scene Parameters Integrated List */}
                        <div className="pt-4 mt-3 border-t border-white/[0.04] space-y-4 text-xs text-sand">
                          <div className="flex items-start gap-3">
                            <Video className="h-4 w-4 text-amber shrink-0 mt-0.5" />
                            <div>
                              <span className="font-semibold text-cream uppercase tracking-wider text-[10px] block mb-0.5">Where to film</span>
                              <span className="text-sand/90 leading-relaxed">{s.background || 'Visual context matching scene.'}</span>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <User className="h-4 w-4 text-coral shrink-0 mt-0.5" />
                            <div>
                              <span className="font-semibold text-cream uppercase tracking-wider text-[10px] block mb-0.5">How to stand & move</span>
                              <span className="text-sand/90 leading-relaxed">{s.action_posing || s.direction || 'Camera-facing presence.'}</span>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <SlidersHorizontal className="h-4 w-4 text-teal shrink-0 mt-0.5" />
                            <div>
                              <span className="font-semibold text-cream uppercase tracking-wider text-[10px] block mb-0.5">Camera moves & cuts</span>
                              <span className="text-sand/90 leading-relaxed">{s.cuts_info || 'Cut pacing instructions.'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Shot List */}
              <div className="space-y-4">
                <h2 className="font-heading text-xs font-semibold tracking-wide uppercase text-stone flex items-center gap-2">
                  <Clapperboard className="h-4 w-4 text-stone" /> Shots & extra clips
                </h2>
                <div className="grid grid-cols-1 gap-4">
                  {b.shot_list.map((s, i) => {
                    const isBroll = s.shot_type === 'b_roll'
                    const isTalkingHead = s.shot_type === 'talking_head'
                    const isReplicate = s.b_roll_type === 'replicate'

                    return (
                      <div
                        key={i}
                        className={cn(
                          "relative isolate overflow-hidden rounded-card border p-5 space-y-3.5 shadow-glass backdrop-blur-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between",
                          isReplicate
                            ? "border-amber/35 bg-amber/[0.08]"
                            : isBroll
                              ? "border-coral/25 bg-ink2/85"
                              : isTalkingHead
                                ? "border-teal/25 bg-ink2/85"
                                : "border-white/10 bg-ink2/85"
                        )}
                      >
                        <div className="space-y-2">
                          <div className="space-y-1.5">
                            <span className="font-heading text-cream text-sm font-semibold block">{s.shot}</span>
                            <span className="inline-block rounded bg-ink3 border border-white/10 px-2 py-0.5 text-[10px] text-sand font-mono leading-snug">
                              {s.framing}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {s.shot_type && (
                              <span className={cn(
                                "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 border",
                                isBroll
                                  ? "border-coral/20 bg-coral/5 text-coral"
                                  : isTalkingHead
                                    ? "border-teal/20 bg-teal/5 text-teal"
                                    : "border-stone/20 bg-stone/5 text-stone"
                              )}>
                                {isBroll ? (
                                  <>
                                    <Video className="h-2.5 w-2.5" /> Extra clip
                                  </>
                                ) : isTalkingHead ? (
                                  <>
                                    <User className="h-2.5 w-2.5" /> You talking
                                  </>
                                ) : (
                                  <>
                                    <Quote className="h-2.5 w-2.5" /> Cover shot
                                  </>
                                )}
                              </span>
                            )}

                            {isBroll && s.b_roll_type && (
                              <span className={cn(
                                "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border",
                                isReplicate
                                  ? "border-amber/20 bg-amber/5 text-amber"
                                  : "border-stone/20 bg-stone/5 text-stone"
                              )}>
                                {isReplicate ? 'Copy theirs' : 'Stock clip'}
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-stone leading-relaxed pt-1">{s.notes}</p>

                          {isBroll && s.b_roll_visual && (
                            <div className="bg-ink3/30 border border-white/5 rounded-lg p-2.5 mt-2">
                              <span className="text-[9px] font-bold text-cream uppercase tracking-wider block mb-0.5">On-screen text & graphics</span>
                              <span className="text-xs text-sand/85 leading-relaxed">{s.b_roll_visual}</span>
                            </div>
                          )}
                        </div>

                        {s.spoken_text && s.spoken_text.trim() !== '' && (
                          <div className="border-t border-white/[0.04] pt-3 mt-3">
                            <span className="text-[9px] font-bold text-stone uppercase tracking-wider block mb-1">What to say</span>
                            <p className="text-xs italic text-sand pl-2 border-l border-teal/30 leading-relaxed">
                              “{s.spoken_text}”
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {mobileTab === 'strategy' && (
            <div className="rounded-card border border-white/5 bg-ink2/85 p-5 space-y-6 shadow-glass backdrop-blur-md">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-stone" />
                  <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Why it works</h3>
                </div>
                <ul className="space-y-2.5">
                  {b.reference_read.why_it_works.map((w, i) => (
                    <li key={i} className="flex gap-2 text-xs text-sand leading-relaxed">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" /> {w}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-white/5 pt-4 space-y-3">
                <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Where people keep watching</h3>
                <div className="relative pl-6 space-y-5">
                  <div className="absolute left-[9px] top-2 bottom-2 w-px border-l border-dashed border-white/10" />
                  {b.reference_read.retention_map.map((r, i) => (
                    <div key={i} className="relative group">
                      <span className="absolute -left-[23px] top-1 h-3.5 w-3.5 rounded-full border-2 border-ink bg-coral shadow-glow" />
                      <div className="text-xs font-heading text-cream">{r.beat}</div>
                      <div className="text-xs text-sand leading-relaxed mt-0.5">{r.goal}</div>
                      {r.tactic && (
                        <div className="mt-1 text-[10px] text-teal font-semibold uppercase tracking-wide">↳ {r.tactic}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {mobileTab === 'spec' && (
            <div className="rounded-card border border-white/5 bg-ink2/85 p-5 space-y-6 shadow-glass backdrop-blur-md">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-stone" />
                  <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Editing settings</h3>
                </div>
                <div className="grid gap-2.5 grid-cols-2">
                  <Spec label="Captions" value={cap.caption_style} />
                  <Spec label="Speed" value={cap.pacing} />
                  <Spec label="Highlights" value={cap.emphasis} />
                  <Spec label="Save" value={cap.export} />
                </div>
              </div>
              
              <div className="border-t border-white/5 pt-4 space-y-2.5">
                <h4 className="text-xs text-stone font-heading uppercase tracking-wider">Editing Checklist</h4>
                <div className="space-y-3">
                  {b.edit_checklist.map((c, i) => (
                    <div key={i} className="flex gap-2 text-xs text-sand leading-relaxed">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" /> {c}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-white/5 pt-4 space-y-3">
                <h4 className="text-xs text-stone font-heading uppercase tracking-wider">Filming schedule</h4>
                <div className="relative pl-6 space-y-5">
                  <div className="absolute left-[9px] top-2 bottom-2 w-px border-l border-dashed border-white/10" />
                  {b.production_sprint.map((p, i) => (
                    <div key={i} className="relative group">
                      <span className="absolute -left-[23px] top-1 h-3.5 w-3.5 rounded-full border-2 border-ink bg-amber shadow-glow" />
                      <div className="flex items-center gap-2">
                        <span className="chip shrink-0 font-mono text-[10px] py-0.5 px-2 bg-ink3 border-white/10">{p.minute}</span>
                        <span className="text-xs font-semibold text-cream leading-relaxed">{p.task}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {mobileTab === 'publish' && (
            <div className="space-y-6">
              {/* Publishing Plan Card */}
              <div className="rounded-card border border-white/5 bg-ink2/85 p-5 space-y-4 shadow-glass backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-stone" />
                  <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Where to post</h3>
                </div>
                <div className="space-y-4">
                  {b.publish_plan.map((p, i) => (
                    <PublishRow key={i} generationId={gen.id} platform={p.platform} caption={p.caption} hashtags={p.hashtags} bestTime={p.best_time} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Refine re-render status / watch-the-update banner */}
      {(refineStatus || refineUrl) && (
        <div className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center gap-3 rounded-card border border-white/10 bg-ink2/95 px-4 py-3 shadow-lift backdrop-blur-xl">
          {refineUrl ? (
            <>
              <Check className="h-5 w-5 shrink-0 text-teal" />
              <span className="flex-1 text-sm text-cream">Your refined video is ready.</span>
              <a href={refineUrl} target="_blank" rel="noopener noreferrer" className="btn-gradient py-1.5 text-xs"><Play className="h-3.5 w-3.5 fill-current" /> Watch</a>
            </>
          ) : (
            <>
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-coral" />
              <span className="flex-1 text-sm text-sand">{refineStatus}</span>
            </>
          )}
        </div>
      )}

      <RefinePanel
        open={refineOpen}
        edl={refineEdl}
        loading={refineLoading}
        generationId={gen.id}
        takePath={gen.take_path ?? null}
        onClose={() => setRefineOpen(false)}
        onApplied={onRefineApplied}
      />
    </main>
  )
}

// Per-platform publish row: copy the full caption, then log when you post it.
function PublishRow({
  generationId,
  platform,
  caption,
  hashtags,
  bestTime,
}: {
  generationId: string
  platform: string
  caption: string
  hashtags: string[]
  bestTime: string
}) {
  const full = `${caption}\n\n${hashtags.join(' ')}`.trim()
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [posted, setPosted] = useState(false)
  const [postErr, setPostErr] = useState(false)
  const [opened, setOpened] = useState(false)
  const [busy, setBusy] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full)
      setCopied(true); setCopyFailed(false)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard is commonly blocked (incognito / Safari / permissions off).
      // Never fail silently — tell the user to copy manually.
      setCopyFailed(true)
      setTimeout(() => setCopyFailed(false), 4000)
    }
  }
  const logPosted = async () => {
    setBusy(true); setPostErr(false)
    try {
      await markPosted({ generationId, platform, caption })
      setPosted(true)
      void logEvent('post_logged', { platform, generation_id: generationId })
    } catch {
      setPostErr(true)
    } finally {
      setBusy(false)
    }
  }

  const uploadUrl = UPLOAD_URLS[platform.toLowerCase()]
  // One tap: open the platform's uploader AND copy the caption. Open first, inside
  // the click gesture, so the popup isn't blocked after the async clipboard write.
  const copyAndOpen = () => {
    if (uploadUrl) window.open(uploadUrl, '_blank', 'noopener,noreferrer')
    setOpened(true)
    void copy()
  }

  return (
    <div className="rounded-card border border-white/8 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="text-sm font-heading capitalize text-teal">{platform}</div>
        <span className="text-xs text-stone">best time: {bestTime}</span>
      </div>
      <div className="mt-1 text-cream">{caption}</div>
      <div className="mt-1 text-xs text-stone">{hashtags.join(' ')}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {uploadUrl && (
          <button onClick={copyAndOpen} className="btn-gradient py-2 text-sm capitalize">
            <ExternalLink className="h-4 w-4" /> Open {platform} &amp; copy
          </button>
        )}
        <button onClick={copy} className="chip">
          {copied ? <><Check className="h-3.5 w-3.5 text-teal" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy caption</>}
        </button>
        <button onClick={logPosted} disabled={busy || posted} className={cn('chip', posted && 'border-teal/50 text-teal')}>
          {posted ? <><Check className="h-3.5 w-3.5" /> Posted</> : busy ? 'Saving…' : <><Send className="h-3.5 w-3.5" /> Mark as posted</>}
        </button>
      </div>
      {copyFailed && (
        <p className="mt-2 text-[11px] text-coral">Couldn’t copy automatically — select the caption above and copy it manually.</p>
      )}
      {postErr && (
        <p className="mt-2 text-[11px] text-coral">Couldn’t log that post — tap “Mark as posted” to try again.</p>
      )}
      {/* Guide them back: opening the uploader is a dead-end without this. */}
      {opened && !posted && (
        <p className="mt-2 text-[11px] text-amber">Posted it on {platform}? Hit “Mark as posted” so your streak and library stay in sync.</p>
      )}
      {/* Close the loop — the highest-intent moment to start the next video. */}
      {posted && (
        <p className="mt-2 text-[11px] text-teal">
          Logged. <Link to="/gallery" className="font-semibold underline-offset-2 hover:underline">Remix your next one →</Link>
        </p>
      )}
      {uploadUrl && (
        <p className="mt-2 text-[11px] text-stone">
          We copy your caption to the clipboard and open the {platform} uploader — paste it there, post, then mark it here.
        </p>
      )}
    </div>
  )
}

// Translate the AI's script-section names (Hook / Setup / Re-hook / CTA) into plain
// words a first-timer reads once and gets. Unknown sections pass through.
function plainSection(section: string | undefined, i: number): string {
  const s = (section ?? '').toLowerCase()
  if (s.includes('re-hook') || s.includes('rehook')) return 'Grab them again'
  if (s.includes('hook')) return 'Opening line'
  if (s.includes('cta') || s.includes('call to action')) return 'Ask them to act'
  if (s.includes('setup')) return 'Set it up'
  if (s.includes('body') || s.includes('middle')) return 'Main point'
  if (s.includes('outro') || s.includes('close') || s.includes('end')) return 'Wrap up'
  return section || `Part ${i + 1}`
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-white/8 bg-white/[0.02] p-3.5">
      <div className="text-xs uppercase tracking-wider text-stone">{label}</div>
      <div className="mt-1 text-sm text-cream">{value || '·'}</div>
    </div>
  )
}

// Agency → client approval. Mints (idempotently) a login-free /review/:token link
// the client opens to watch the finished reel and Approve / Request changes; the
// decision flows back into review_status (and the internal `approved` flag).
function ClientApprovalCard({ gen }: { gen: Generation }) {
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const status = gen.review_status ?? 'none'

  const make = async () => {
    setBusy(true)
    const url = await createReviewLink(gen.id)
    setBusy(false)
    if (!url) return
    setLink(url)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard blocked — link is shown to copy manually */ }
  }

  const badge =
    status === 'approved' ? { cls: 'border-teal/40 bg-teal/10 text-teal', icon: BadgeCheck, label: 'Client approved' }
    : status === 'changes' ? { cls: 'border-amber/40 bg-amber/10 text-amber', icon: MessageSquare, label: 'Changes requested' }
    : status === 'pending' ? { cls: 'border-white/15 bg-white/5 text-sand', icon: Loader2, label: 'Waiting on your client' }
    : null

  return (
    <div className="rounded-card border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 font-heading text-cream">
          <Users className="h-4 w-4 text-amber" /> Client approval
        </p>
        {badge && (
          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', badge.cls)}>
            <badge.icon className="h-3.5 w-3.5" /> {badge.label}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm text-stone">
        Send your client a private link to watch this video and sign off — no account needed. Their decision shows up right here.
      </p>

      {status === 'changes' && gen.review_note && (
        <p className="mt-3 rounded-lg bg-amber/10 px-3 py-2 text-sm text-sand">“{gen.review_note}”</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={make} className="btn-ghost py-2 text-sm" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          {link ? 'Copy approval link' : status === 'none' ? 'Create approval link' : 'Copy approval link'}
        </button>
        {copied && <span className="inline-flex items-center gap-1 text-xs text-teal"><Check className="h-3.5 w-3.5" /> Copied to clipboard</span>}
      </div>
      {link && (
        <p className="mt-2 break-all rounded-lg border border-white/8 bg-ink/40 px-3 py-2 text-xs text-stone">{link}</p>
      )}
    </div>
  )
}


