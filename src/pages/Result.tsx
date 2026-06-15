import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Copy, Check, Sparkles, Activity, Quote, FileText, Clapperboard,
  Captions, ListChecks, Wand2, Timer, Send, Loader2, Video,
} from 'lucide-react'
import { getGeneration, markPosted } from '../lib/api'
import type { Generation } from '../lib/types'
import { Aurora } from '../components/Aurora'
import { Reveal, EASE } from '../components/motion'
import { cn } from '../lib/cn'

export default function Result() {
  const { id } = useParams()
  const [gen, setGen] = useState<Generation | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    getGeneration(id)
      .then((g) => setGen(g))
      .catch(() => setGen(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading)
    return (
      <main className="grid min-h-[60vh] place-items-center text-sand">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your blueprint…
        </span>
      </main>
    )
  if (!gen) return <main className="mx-auto max-w-3xl px-5 py-16 text-coral">Not found.</main>

  // Defensive normalization: an older or partial blueprint can be missing fields,
  // and calling .map on an undefined field would unmount the page (black screen).
  // Default every field so the result always renders something sensible.
  const raw = (gen.blueprint ?? {}) as Partial<Generation['blueprint']>
  const rr = raw.reference_read ?? ({} as NonNullable<Generation['blueprint']>['reference_read'])
  const b = {
    ...raw,
    reference_read: {
      format_label: rr.format_label ?? 'Your blueprint',
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
    <main className="relative overflow-clip pb-20">
      {/* Hero header */}
      <section className="relative border-b border-white/8">
        <Aurora className="opacity-70" />
        <div className="relative mx-auto max-w-3xl px-5 pb-10 pt-12">
          <div className="flex items-center justify-between">
            <Link to="/history" className="inline-flex items-center gap-1.5 text-sm text-stone hover:text-cream">
              <ArrowLeft className="h-4 w-4" /> History
            </Link>
            <div className="flex items-center gap-2">
              <Link to={`/record/${gen.id}`} className="btn-ghost py-2 text-sm">
                <Video className="h-4 w-4" /> Record this
              </Link>
              <Link to="/app" className="btn-gradient py-2 text-sm">
                <Wand2 className="h-4 w-4" /> New blueprint
              </Link>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <p className="eyebrow mt-8">Your blueprint</p>
            <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight sm:text-5xl">
              {b.reference_read.format_label}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="chip"><Sparkles className="h-3.5 w-3.5 text-amber" /> {b.reference_read.platform}</span>
              <span className="chip">fidelity · {gen.fidelity}</span>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="mx-auto max-w-3xl space-y-4 px-5 py-8">
        <Section icon={Activity} title="Why this format works">
          <ul className="space-y-2">
            {b.reference_read.why_it_works.map((w, i) => (
              <li key={i} className="flex gap-2.5 text-sand">
                <Check className="mt-1 h-4 w-4 shrink-0 text-teal" /> {w}
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={Activity} title="Retention pattern">
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
          <div className="space-y-2.5">
            {b.hook_options.map((h, i) => (
              <CopyRow key={i} text={h}>
                <span className="text-cream">“{h}”</span>
              </CopyRow>
            ))}
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
  const [posted, setPosted] = useState(false)
  const [busy, setBusy] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked, ignore */
    }
  }
  const logPosted = async () => {
    setBusy(true)
    try {
      await markPosted({ generationId, platform, caption })
      setPosted(true)
    } catch {
      /* posts table may not be migrated yet, fail soft */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-card border border-white/8 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-heading capitalize text-teal">{platform}</div>
        <span className="text-xs text-stone">best time: {bestTime}</span>
      </div>
      <div className="mt-1 text-cream">{caption}</div>
      <div className="mt-1 text-xs text-stone">{hashtags.join(' ')}</div>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={copy} className="chip">
          {copied ? <><Check className="h-3.5 w-3.5 text-teal" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy caption</>}
        </button>
        <button onClick={logPosted} disabled={busy || posted} className={cn('chip', posted && 'border-teal/50 text-teal')}>
          {posted ? <><Check className="h-3.5 w-3.5" /> Posted</> : busy ? 'Saving…' : <><Send className="h-3.5 w-3.5" /> Mark as posted</>}
        </button>
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <Reveal>
      <section className="glass p-6">
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

function CopyRow({ text, children }: { text: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard blocked, ignore */
    }
  }
  return (
    <div className="group flex items-start justify-between gap-3 rounded-card border border-white/8 bg-white/[0.02] p-3.5">
      <div className="min-w-0">{children}</div>
      <button
        onClick={copy}
        className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-1.5 text-stone transition-colors hover:text-cream"
        aria-label="Copy"
      >
        {copied ? <Check className="h-4 w-4 text-teal" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  )
}
