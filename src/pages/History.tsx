import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Wand2, ArrowUpRight, Sparkles, Clapperboard, Loader2, Play, Video } from 'lucide-react'
import { listGenerations, signEditUrls } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { videosFromCredits } from '../lib/brand'
import type { Generation } from '../lib/types'
import { Aurora } from '../components/Aurora'
import { Reveal, Stagger, RevealItem } from '../components/motion'

export default function History() {
  const { profile } = useAuth()
  const [items, setItems] = useState<Generation[]>([])
  const [loading, setLoading] = useState(true)
  const [urls, setUrls] = useState<Record<string, string>>({})

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

  const left = videosFromCredits(profile?.credits ?? 0)

  return (
    <main className="relative overflow-clip">
      <Aurora className="opacity-60" />
      <div className="relative mx-auto max-w-5xl px-5 py-12 lg:py-16">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Your library</p>
              <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">Blueprints</h1>
            </div>
            <Link to="/app" className="btn-gradient">
              <Wand2 className="h-4 w-4" /> New blueprint
            </Link>
          </div>
        </Reveal>

        {/* Stat strip */}
        <Reveal delay={0.06}>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Stat icon={Clapperboard} label="Total blueprints" value={loading ? '…' : String(items.length)} />
            <Stat icon={Video} label="Finished edits" value={loading ? '…' : String(editedCount)} />
            <Stat icon={Sparkles} label="Recreations left" value={String(left)} />
          </div>
        </Reveal>

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
            {items.map((g) => {
              const cover = g.thumb_path ? urls[g.thumb_path] : undefined
              const render = g.edit_path ? urls[g.edit_path] : undefined
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
                        {g.edit_path && (
                          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-teal/30 bg-ink/75 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-teal backdrop-blur-sm">
                            <Video className="h-3 w-3" /> Edited
                          </span>
                        )}
                      </div>
                    </Link>
                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
                        <Link to={`/result/${g.id}`} className="min-w-0">
                          <h3 className="font-heading text-lg leading-snug">
                            {g.blueprint?.reference_read?.format_label ?? 'Blueprint'}
                          </h3>
                        </Link>
                        <ArrowUpRight className="h-5 w-5 shrink-0 text-stone transition-colors group-hover:text-cream" />
                      </div>
                      <div className="mt-1 truncate text-sm text-stone">{g.reference_url}</div>
                      <div className="mt-3 flex flex-1 items-end justify-between gap-2 text-xs text-stone">
                        <div className="flex items-center gap-2">
                          <span className="chip">{g.blueprint?.reference_read?.platform ?? 'video'}</span>
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
