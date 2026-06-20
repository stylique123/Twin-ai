import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Wand2, ArrowUpRight, FileText, Clapperboard, Loader2, Play, Video } from 'lucide-react'
import { listGenerations, signEditUrls } from '../lib/api'
import type { Generation } from '../lib/types'
import { Aurora } from '../components/Aurora'
import { Reveal, Stagger, RevealItem } from '../components/motion'

type Filter = 'all' | 'scripts' | 'videos'

export default function History() {
  const [items, setItems] = useState<Generation[]>([])
  const [loading, setLoading] = useState(true)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    listGenerations()
      .then(async (gens) => {
        setItems(gens)
        // Sign covers + renders so finished work shows in the library.
        const paths = gens.flatMap((g) => [g.thumb_path, g.edit_path].filter(Boolean) as string[])
        if (paths.length) setUrls(await signEditUrls(paths).catch(() => ({})))
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  const editedCount = items.filter((g) => g.edit_path).length
  const displayed = items.filter((g) =>
    filter === 'scripts' ? !g.edit_path : filter === 'videos' ? !!g.edit_path : true,
  )

  return (
    <main className="relative overflow-clip">
      <Aurora className="opacity-60" />
      <div className="relative mx-auto max-w-5xl px-5 py-12 lg:py-16">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Your library</p>
              <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">Scripts &amp; edits</h1>
              <p className="mt-2 max-w-md text-sm text-stone">
                Each item is one creation — a shootable script. Once you record and auto-edit it, the finished video lives on the same card.
              </p>
            </div>
            <Link to="/app" className="btn-gradient">
              <Wand2 className="h-4 w-4" /> New script
            </Link>
          </div>
        </Reveal>

        {/* Stat strip — no recreation counter here; that lives on the Dashboard. */}
        <Reveal delay={0.06}>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Stat icon={Clapperboard} label="Scripts" value={loading ? '…' : String(items.length)} />
            <Stat icon={Video} label="Rendered videos" value={loading ? '…' : String(editedCount)} />
          </div>
        </Reveal>

        {/* Type filter: see everything, only un-recorded scripts, or only finished videos. */}
        {!loading && items.length > 0 && (
          <Reveal delay={0.1}>
            <div className="mt-6 flex flex-wrap gap-2">
              {([
                ['all', `All (${items.length})`],
                ['scripts', `Scripts only (${items.length - editedCount})`],
                ['videos', `Rendered videos (${editedCount})`],
              ] as [Filter, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={
                    'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ' +
                    (filter === key
                      ? 'border-teal/50 bg-teal/15 text-cream'
                      : 'border-white/10 bg-white/5 text-stone hover:text-cream')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </Reveal>
        )}

        {loading ? (
          <div className="mt-12 grid place-items-center text-sand">
            <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</span>
          </div>
        ) : items.length === 0 ? (
          <Reveal delay={0.1}>
            <div className="glass mt-10 grid place-items-center p-12 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-signature-soft">
                <Wand2 className="h-6 w-6 text-cream" />
              </span>
              <p className="mt-4 font-heading text-lg">No blueprints yet.</p>
              <p className="mt-1 text-sm text-stone">Paste a reference link and get your first one in ~30 seconds.</p>
              <Link to="/app" className="btn-gradient mt-6">Make your first one</Link>
            </div>
          </Reveal>
        ) : (
          <Stagger immediate className="mt-10 grid gap-4 sm:grid-cols-2" gap={0.06}>
            {displayed.map((g) => {
              const cover = g.thumb_path ? urls[g.thumb_path] : undefined
              const render = g.edit_path ? urls[g.edit_path] : undefined
              // Title is the actual hook the creator is shooting — not the internal
              // format label (e.g. "RAPID FIRE"), which now shows as a small tag.
              const title = g.selected_hook || g.blueprint?.hook_options?.[0] || 'Untitled script'
              const formatTag = g.blueprint?.reference_read?.format_label
              return (
                <RevealItem key={g.id}>
                  <div className="glass glass-hover group flex h-full flex-col overflow-hidden">
                    <Link to={`/result/${g.id}`} className="block">
                      {/* Cover: the finished render's cover frame, or a branded fallback. */}
                      <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-coral/20 via-ink2 to-ink">
                        {cover ? (
                          <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="absolute inset-0 grid place-items-center">
                            <Clapperboard className="h-7 w-7 text-amber/70" />
                          </div>
                        )}
                        {g.edit_path ? (
                          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-teal/30 bg-ink/75 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-teal backdrop-blur-sm">
                            <Video className="h-3 w-3" /> Edited
                          </span>
                        ) : (
                          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-amber/30 bg-ink/75 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber backdrop-blur-sm">
                            <FileText className="h-3 w-3" /> Script
                          </span>
                        )}
                      </div>
                    </Link>
                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
                        <Link to={`/result/${g.id}`} className="min-w-0">
                          <h3 className="line-clamp-2 font-heading text-lg leading-snug">
                            {title}
                          </h3>
                        </Link>
                        <ArrowUpRight className="h-5 w-5 shrink-0 text-stone transition-colors group-hover:text-cream" />
                      </div>
                      <div className="mt-3 flex flex-1 items-end justify-between gap-2 text-xs text-stone">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="chip">{g.blueprint?.reference_read?.platform ?? 'video'}</span>
                          {formatTag && <span className="chip">{formatTag}</span>}
                          <span>{new Date(g.created_at).toLocaleDateString()}</span>
                        </div>
                        {render ? (
                          <a href={render} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-teal/30 bg-teal/10 px-2.5 py-1 font-medium text-teal transition-colors hover:bg-teal/20">
                            <Play className="h-3 w-3 fill-teal" /> Watch
                          </a>
                        ) : (
                          <Link to={`/record/${g.id}`} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-medium text-stone transition-colors hover:text-cream">
                            <Video className="h-3 w-3" /> Record
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </RevealItem>
              )
            })}
          </Stagger>
        )}
      </div>
    </main>
  )
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <motion.div whileHover={{ y: -3 }} className="glass flex items-center gap-3 p-4">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/5">
        <Icon className="h-5 w-5 text-teal" />
      </span>
      <div>
        <div className="text-xs uppercase tracking-wider text-stone">{label}</div>
        <div className="font-display text-xl">{value}</div>
      </div>
    </motion.div>
  )
}
