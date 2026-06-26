import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Copy, Check, Sparkles, Activity, Quote, FileText, Clapperboard,
  Wand2, Timer, Send, Loader2, Video, ExternalLink,
  SlidersHorizontal, Play, BadgeCheck, Link2, MessageSquare, Users,
} from 'lucide-react'

// Phase-0 guided publishing: deep-link straight into each platform's uploader.
// (Real one-click auto-post needs per-platform OAuth + app review — staged later.)
const UPLOAD_URLS: Record<string, string> = {
  tiktok: 'https://www.tiktok.com/upload',
  youtube: 'https://studio.youtube.com/',
  instagram: 'https://www.instagram.com/',
}
import { getGeneration, markPosted, updateGenerationChoice, setGenerationApproved, createReviewLink, fetchEdl, getJob, logEvent } from '../lib/api'
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
    { shot: 'Opener Hook', framing: 'Chest-up shot', notes: 'Warm amber backlight, direct lens look.' },
    { shot: 'Product Canvas', framing: 'Screen recording', notes: 'Zoomed-in highlight on coding steps.' },
    { shot: 'Warning Beat', framing: 'Close-up shot', notes: 'Creator warns audience about main failure points.' },
    { shot: 'Closing Offer', framing: 'Chest-up shot', notes: 'Teal accent glow, callout text on screen.' }
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
    { minute: '10:00 - 20:00', task: 'Upload to TwinAI and export final cut.' }
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
  const [gen, setGen] = useState<Generation | null>(null)
  const [loading, setLoading] = useState(true)
  const [chosenHook, setChosenHook] = useState('')
  const [approved, setApproved] = useState(false)
  const [activeTab, setActiveTab] = useState<'strategy' | 'spec' | 'publish'>('strategy')
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
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const job = await getJob(jobId)
      if (!job) continue
      if (job.status === 'done' && job.result?.output_url) {
        setRefineStatus(''); setRefineUrl(job.result.output_url)
        getGeneration(id!).then((g) => g && setGen(g)).catch(() => {})
        return
      }
      if (job.status === 'failed') { setRefineStatus('Refine failed — try again.'); return }
      const p = job.result?.progress
      if (p?.label) setRefineStatus(p.label)
    }
    setRefineStatus('Still rendering — check your Library shortly.')
  }

  useEffect(() => {
    if (!id) return
    if (id === 'demo') {
      setGen(MOCK_GENERATION as any)
      setApproved(false)
      setChosenHook(MOCK_GENERATION.selected_hook)
      setLoading(false)
      return
    }
    getGeneration(id)
      .then((g) => {
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
      .catch(() => setGen(null))
      .finally(() => setLoading(false))
  }, [id])

  // Pick which hook to shoot: persist it so the teleprompter, cover and b-roll all
  // use THIS hook. Optimistic — the UI updates immediately.
  const pickHook = (h: string) => {
    setChosenHook(h)
    if (id) void updateGenerationChoice(id, { selected_hook: h })
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
          <Link to="/history" className="btn-gradient mt-6 inline-flex">
            <ArrowLeft className="h-4 w-4" /> Back to Library
          </Link>
          <div className="mt-6 border-t border-white/5 pt-6">
            <p className="text-xs text-stone mb-2">Local database not configured yet?</p>
            <Link to="/result/demo" className="btn-ghost py-2.5 text-xs w-full inline-flex justify-center">
              ⚡ View Interactive Demo Workspace
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
  const b = {
    ...raw,
    reference_read: {
      format_label: rr.format_label ?? 'Your script',
      platform: rr.platform ?? '',
      why_it_works: Array.isArray(rr.why_it_works) ? rr.why_it_works : [],
      retention_map: Array.isArray(rr.retention_map) ? rr.retention_map : [],
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

  const updatedScript = b.script.map((s, i) => {
    if (i === 0 && chosenHook) {
      return { ...s, line: chosenHook }
    }
    return s
  })

  return (
    <main className="relative min-h-screen overflow-clip pb-20">
      {/* Hero header */}
      <section className="relative border-b border-white/8">
        <Aurora className="opacity-70" />
        <div className="relative mx-auto max-w-7xl px-5 pb-10 pt-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link to="/history" className="inline-flex items-center gap-1.5 text-sm text-stone hover:text-cream">
              <ArrowLeft className="h-4 w-4" /> History
            </Link>
            {/* Record is the real next step → primary; bring-your-own-clip is the
                alternate path → secondary. Stacks full-width on mobile. */}
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {/* If this blueprint already has a finished edit, let them re-edit it
                  here (caption style/color, cuts, b-roll) without re-recording. */}
              {gen.edit_path && gen.take_path && (
                <button onClick={openRefine} className="btn-ghost py-2 text-sm">
                  <SlidersHorizontal className="h-4 w-4" /> Refine edit
                </button>
              )}
              <Link to={`/record/${gen.id}`} className="btn-gradient py-2 text-sm">
                <Video className="h-4 w-4" /> Record with teleprompter
              </Link>
              <Link to={`/record/${gen.id}?upload=1`} className="btn-ghost py-2 text-sm">
                <Wand2 className="h-4 w-4" /> Upload your own clip
              </Link>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            {/* Celebrate the arrival — this is the payoff moment (the AI read a
                real viral video and wrote THIS creator a script). Make it feel like one. */}
            <motion.span
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.18, duration: 0.5, ease: EASE }}
              className="mt-8 inline-flex items-center gap-1.5 rounded-full border border-teal/30 bg-teal/10 px-3 py-1 text-xs font-bold text-teal"
            >
              <Sparkles className="h-3.5 w-3.5" /> Reading complete — your script is ready
            </motion.span>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6, ease: EASE }}
              className="mt-3 font-display text-4xl leading-tight tracking-tight sm:text-5xl"
            >
              {b.reference_read.format_label}
            </motion.h1>
            {/* Surface the hook the creator is shooting right in the hero, so they
                don't have to scroll past 3 sections to see their own choice. */}
            {chosenHook && (
              <p className="mt-3 max-w-4xl font-heading text-lg leading-snug text-cream/90">
                “{chosenHook}”
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="chip"><Sparkles className="h-3.5 w-3.5 text-amber" /> {b.reference_read.platform}</span>
              <span className="chip">fidelity · {gen.fidelity}</span>
              {isAgency && (
                <button
                  onClick={toggleApproved}
                  className={cn('chip transition-colors', approved ? 'border-teal/50 bg-teal/10 text-teal' : 'hover:border-white/20 hover:text-cream')}
                  title="Mark this script client-approved before it's recorded or posted"
                >
                  <BadgeCheck className={cn('h-3.5 w-3.5', approved ? 'text-teal' : 'text-stone')} />
                  {approved ? 'Client-approved' : 'Mark approved'}
                </button>
              )}
            </div>
            <p className="mt-3 text-xs text-stone">
              Camera-shy? You don't have to film your face — <Link to={`/record/${gen.id}?upload=1`} className="text-amber hover:text-cream">upload a screen-recording or any clip</Link> and we'll auto-edit it.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 py-8 animate-in fade-in duration-500">
        {isAgency && <div className="mb-6"><ClientApprovalCard gen={gen} /></div>}
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Script Workspace (7 columns) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Hook Selector inline */}
            <div className="rounded-card border border-white/8 bg-zinc-950/20 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Quote className="h-4 w-4 text-amber animate-pulse" />
                <span className="font-heading text-xs font-semibold text-cream tracking-wide uppercase">Hook Angle Selector</span>
              </div>
              <p className="text-xs text-stone">The teleprompter script and your generated video will adopt your selected hook. Tap one to preview the updated script flow.</p>
              <div className="grid grid-cols-1 gap-2.5">
                {b.hook_options.map((h, i) => {
                  const isChosen = h === chosenHook
                  return (
                    <button
                      key={i}
                      onClick={() => pickHook(h)}
                      className={cn(
                        'w-full text-left flex items-start gap-3.5 rounded-lg border p-4 text-xs transition-all duration-300',
                        isChosen
                          ? 'border-coral/55 bg-coral/10 text-cream shadow-lg shadow-coral/5'
                          : 'border-white/5 bg-white/[0.01] text-sand hover:border-white/12 hover:bg-white/[0.03]'
                      )}
                    >
                      <span className={cn('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border', isChosen ? 'border-coral bg-coral text-ink' : 'border-white/30')}>
                        {isChosen && <Check className="h-2.5 w-2.5 text-zinc-950 stroke-[3.5]" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        {i === 0 && <span className="mr-1.5 rounded-full bg-amber/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber">Recommended</span>}
                        <span className="italic font-medium">“{h}”</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Interactive Script Workspace */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-sm font-semibold tracking-wide uppercase text-cream flex items-center gap-2">
                  <FileText className="h-4 w-4 text-coral" /> Interactive Script Teleprompter
                </h2>
                <span className="text-xs text-stone">{updatedScript.length} script beats</span>
              </div>
              
              <div className="space-y-4">
                {updatedScript.map((s, i) => {
                  const isHook = s.section?.toLowerCase().includes('hook')
                  const isRehook = s.section?.toLowerCase().includes('re-hook') || s.section?.toLowerCase().includes('rehook')
                  const isCta = s.section?.toLowerCase().includes('cta')
                  const tagColor = isHook ? 'border-amber/30 bg-amber/10 text-amber'
                                 : isRehook ? 'border-coral/30 bg-coral/10 text-coral'
                                 : isCta ? 'border-teal/30 bg-teal/10 text-teal'
                                 : 'border-white/10 bg-white/5 text-sand'

                  return (
                    <div key={i} className="group rounded-card border border-white/8 bg-zinc-950/20 p-5 hover:border-white/16 transition-all duration-300">
                      <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-3">
                        <span className={cn('rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider', tagColor)}>
                          {s.section || `Beat ${i + 1}`}
                        </span>
                        <span className="text-[10px] font-mono text-stone">Scene {i + 1}</span>
                      </div>
                      
                      {/* Spoken dialogue line in a large, premium look */}
                      <div className="mt-4 font-display text-lg leading-relaxed text-cream pl-3 border-l-2 border-amber/30">
                        “{s.line}”
                      </div>

                      {/* Detailed scene parameters grid */}
                      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-white/5">
                        {/* Background settings card */}
                        <div className="rounded-lg bg-white/[0.01] p-3.5 border border-white/5 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-stone">
                            <Video className="h-3.5 w-3.5 text-amber shrink-0" />
                            <span className="text-[9px] font-heading uppercase tracking-wider">Background</span>
                          </div>
                          <p className="text-xs text-sand leading-relaxed">
                            {s.background || 'Visual setup matching scene context.'}
                          </p>
                        </div>

                        {/* Action and posing card */}
                        <div className="rounded-lg bg-white/[0.01] p-3.5 border border-white/5 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-stone">
                            <Activity className="h-3.5 w-3.5 text-coral shrink-0" />
                            <span className="text-[9px] font-heading uppercase tracking-wider">Posing & Action</span>
                          </div>
                          <p className="text-xs text-sand leading-relaxed">
                            {s.action_posing || s.direction || 'Natural gestures and lens presence.'}
                          </p>
                        </div>

                        {/* Pacing and Cuts card */}
                        <div className="rounded-lg bg-white/[0.01] p-3.5 border border-white/5 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-stone">
                            <SlidersHorizontal className="h-3.5 w-3.5 text-teal shrink-0" />
                            <span className="text-[9px] font-heading uppercase tracking-wider">Cuts & Transitions</span>
                          </div>
                          <p className="text-xs text-sand leading-relaxed">
                            {s.cuts_info || 'Cut timing aligned with speech rhythm.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Strategy, Spec, and Publishing (5 columns) */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-6">
            <div className="rounded-card border border-white/8 bg-zinc-950/20 overflow-hidden">
              {/* Tab headers */}
              <div className="flex border-b border-white/10 bg-white/[0.02]">
                {(['strategy', 'spec', 'publish'] as const).map((tab) => {
                  const isSelected = activeTab === tab
                  const label = tab === 'strategy' ? 'Strategy' : tab === 'spec' ? 'Production' : 'Publishing'
                  const Icon = tab === 'strategy' ? Activity : tab === 'spec' ? SlidersHorizontal : Send
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        'flex-1 py-3.5 text-[10px] font-heading uppercase tracking-wider flex items-center justify-center gap-1.5 border-b-2 transition-all duration-300',
                        isSelected ? 'border-amber text-amber font-bold bg-white/[0.01]' : 'border-transparent text-stone hover:text-sand'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  )
                })}
              </div>

              {/* Tab contents */}
              <div className="p-5 space-y-5">
                {activeTab === 'strategy' && (
                  <div className="space-y-5">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Activity className="h-4 w-4 text-amber" />
                        <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Why this format works</h3>
                      </div>
                      <ul className="space-y-2.5">
                        {b.reference_read.why_it_works.map((w, i) => (
                          <li key={i} className="flex gap-2.5 text-xs text-sand leading-relaxed">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" /> {w}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="border-t border-white/5 pt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Activity className="h-4 w-4 text-amber" />
                        <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Estimated retention pattern</h3>
                      </div>
                      <p className="mb-4 text-[11px] text-stone leading-relaxed">
                        A structural read of how the original holds attention beat-by-beat — estimated from the content.
                      </p>
                      <ol className="relative ml-1 space-y-4 border-l border-white/10 pl-5">
                        {b.reference_read.retention_map.map((r, i) => (
                          <li key={i} className="relative">
                            <span className="absolute -left-[25px] top-1.5 h-1.5 w-1.5 rounded-full bg-signature" />
                            <div className="text-xs font-heading text-cream">{r.beat}</div>
                            <div className="text-xs text-sand leading-relaxed mt-0.5">{r.goal}</div>
                            {r.tactic && (
                              <div className="mt-1 text-[10px] text-coral font-medium">↳ {r.tactic}</div>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                )}

                {activeTab === 'spec' && (
                  <div className="space-y-5">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Clapperboard className="h-4 w-4 text-amber" />
                        <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Shot list</h3>
                      </div>
                      <div className="space-y-2">
                        {b.shot_list.map((s, i) => (
                          <div key={i} className="rounded-lg border border-white/6 bg-white/[0.01] p-3 text-xs leading-relaxed">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-heading text-cream text-[11px] font-medium">{s.shot}</span>
                              <span className="rounded bg-teal/10 border border-teal/20 px-1.5 py-0.5 text-[9px] text-teal font-mono shrink-0">{s.framing}</span>
                            </div>
                            <div className="mt-1.5 text-stone text-[11px]">{s.notes}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-white/5 pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <SlidersHorizontal className="h-4 w-4 text-amber" />
                        <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Editing Spec & checklist</h3>
                      </div>
                      <div className="grid gap-2.5 grid-cols-2 mb-4">
                        <Spec label="Captions" value={cap.caption_style} />
                        <Spec label="Pacing" value={cap.pacing} />
                        <Spec label="Emphasis" value={cap.emphasis} />
                        <Spec label="Export" value={cap.export} />
                      </div>
                      <div className="border-t border-white/5 pt-3 space-y-2">
                        <p className="text-[10px] text-stone font-heading mb-1.5 uppercase tracking-wider">Editing Checklist</p>
                        {b.edit_checklist.map((c, i) => (
                          <div key={i} className="flex gap-2 text-[11px] text-sand leading-relaxed">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" /> {c}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-white/5 pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Timer className="h-4 w-4 text-amber" />
                        <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">20-minute production sprint</h3>
                      </div>
                      <div className="space-y-2">
                        {b.production_sprint.map((p, i) => (
                          <div key={i} className="flex items-start gap-2.5 text-[11px] leading-relaxed">
                            <span className="chip shrink-0 font-mono text-[9px] py-0.5 px-1 bg-white/5 border-white/10">{p.minute}</span>
                            <span className="text-sand">{p.task}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'publish' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Send className="h-4 w-4 text-amber" />
                      <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Platform publish plans</h3>
                    </div>
                    <div className="space-y-3">
                      {b.publish_plan.map((p, i) => (
                        <PublishRow key={i} generationId={gen.id} platform={p.platform} caption={p.caption} hashtags={p.hashtags} bestTime={p.best_time} />
                      ))}
                    </div>
                    <p className="text-[10px] text-stone mt-2 leading-relaxed">
                      Copy a caption and post. Your metrics update on the Dashboard as you publish.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
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


