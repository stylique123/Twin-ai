import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Copy, Check, Sparkles, Activity, Quote, FileText, Clapperboard,
  Captions, ListChecks, Wand2, Timer, Send, Loader2, Video, ExternalLink,
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
import { Reveal, EASE } from '../components/motion'
import { cn } from '../lib/cn'

export default function Result() {
  const { id } = useParams()
  const { profile } = useAuth()
  const [gen, setGen] = useState<Generation | null>(null)
  const [loading, setLoading] = useState(true)
  const [chosenHook, setChosenHook] = useState('')
  const [approved, setApproved] = useState(false)
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

  return (
    <main className="relative min-h-screen overflow-clip pb-20">
      {/* Hero header */}
      <section className="relative border-b border-white/8">
        <Aurora className="opacity-70" />
        <div className="relative mx-auto max-w-3xl px-5 pb-10 pt-12">
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
              <p className="mt-3 max-w-2xl font-heading text-lg leading-snug text-cream/90">
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

      <div className="mx-auto max-w-3xl space-y-4 px-5 py-8">
        {isAgency && <ClientApprovalCard gen={gen} />}
        <Section icon={Activity} title="Why this format works">
          <ul className="space-y-2">
            {b.reference_read.why_it_works.map((w, i) => (
              <li key={i} className="flex gap-2.5 text-sand">
                <Check className="mt-1 h-4 w-4 shrink-0 text-teal" /> {w}
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={Activity} title="Estimated retention pattern">
          <p className="mb-3 text-xs text-stone">A structural read of how the original holds attention beat-by-beat — estimated from the content, not measured analytics.</p>
          <ol className="relative ml-1 space-y-3 border-l border-white/10 pl-5">
            {b.reference_read.retention_map.map((r, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full bg-signature" />
                <div className="text-sm font-heading text-cream">{r.beat}</div>
                <div className="text-sm text-sand">{r.goal}</div>
                {r.tactic && (
                  <div className="mt-0.5 text-xs text-coral">{r.tactic}</div>
                )}
              </li>
            ))}
          </ol>
        </Section>

        <Section icon={Quote} title="Hook options">
          <p className="mb-3 text-sm text-stone">Pick the one you’ll shoot, your teleprompter, cover and b-roll all follow it.</p>
          <div className="space-y-2.5">
            {b.hook_options.map((h, i) => {
              const isChosen = h === chosenHook
              return (
                <div
                  key={i}
                  className={cn(
                    'group flex items-start justify-between gap-3 rounded-card border p-3.5 transition-colors',
                    isChosen ? 'border-coral/55 bg-coral/10' : 'border-white/8 bg-white/[0.02] hover:border-white/16',
                  )}
                >
                  <button onClick={() => pickHook(h)} className="flex min-w-0 items-start gap-2.5 text-left">
                    <span className={cn('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border', isChosen ? 'border-coral bg-coral' : 'border-white/30')}>
                      {isChosen && <Check className="h-3 w-3 text-ink" />}
                    </span>
                    <span className="min-w-0">
                      {i === 0 && <span className="mr-1.5 rounded-full bg-amber/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber">Recommended</span>}
                      <span className="text-cream">“{h}”</span>
                    </span>
                  </button>
                  <CopyButton text={h} />
                </div>
              )
            })}
          </div>
        </Section>

        <Section icon={FileText} title="Script">
          <div className="space-y-4">
            {b.script.map((s, i) => (
              <div key={i} className="rounded-card border border-white/8 bg-white/[0.02] p-4">
                <div className="text-xs uppercase tracking-wider text-coral">{s.section}</div>
                <div className="mt-1 text-cream">{s.line}</div>
                <div className="mt-1.5 text-xs text-stone">▶ {s.direction}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section icon={Clapperboard} title="Shot list">
          <div className="space-y-2.5">
            {b.shot_list.map((s, i) => (
              <div key={i} className="rounded-card border border-white/8 bg-white/[0.02] p-3.5 text-sm">
                <span className="font-heading text-cream">{s.shot}</span>
                <span className="mx-2 text-stone">·</span>
                <span className="text-teal">{s.framing}</span>
                <div className="mt-1 text-stone">{s.notes}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section icon={Captions} title="Captions">
          <div className="flex flex-wrap gap-2">
            {b.captions.map((c, i) => (
              <span key={i} className="chip">{c}</span>
            ))}
          </div>
        </Section>

        <Section icon={ListChecks} title="One-click edit checklist">
          <ul className="space-y-2">
            {b.edit_checklist.map((c, i) => (
              <li key={i} className="flex gap-2.5 text-sand">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> {c}
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={Wand2} title="Caption & edit spec">
          <div className="grid gap-3 sm:grid-cols-2">
            <Spec label="Captions" value={cap.caption_style} />
            <Spec label="Pacing" value={cap.pacing} />
            <Spec label="Emphasis" value={cap.emphasis} />
            <Spec label="Export" value={cap.export} />
          </div>
          <p className="mt-3 text-xs text-stone">Drives TwinAI’s own one-click auto-captioner, on the roadmap, no third-party tool.</p>
        </Section>

        <Section icon={Timer} title="20-minute production sprint">
          <div className="space-y-2">
            {b.production_sprint.map((p, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="chip shrink-0 font-mono">{p.minute}</span>
                <span className="text-sand">{p.task}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section icon={Send} title="Publish plan">
          <div className="space-y-3">
            {b.publish_plan.map((p, i) => (
              <PublishRow key={i} generationId={gen.id} platform={p.platform} caption={p.caption} hashtags={p.hashtags} bestTime={p.best_time} />
            ))}
          </div>
          <p className="mt-3 text-xs text-stone">
            Copy a caption, post it, then log it, your Dashboard tracks what you’ve shipped. One-click auto-publish is on the roadmap.
          </p>
        </Section>
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

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <Reveal>
      <section className="glass p-5 sm:p-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5">
            <Icon className="h-4 w-4 text-amber" />
          </span>
          <p className="eyebrow !text-sand">{title}</p>
        </div>
        <div className="mt-4">{children}</div>
      </section>
    </Reveal>
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch { /* clipboard blocked */ }
  }
  return (
    <button
      onClick={copy}
      className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-1.5 text-stone transition-colors hover:text-cream"
      aria-label="Copy hook"
    >
      {copied ? <Check className="h-4 w-4 text-teal" /> : <Copy className="h-4 w-4" />}
    </button>
  )
}

