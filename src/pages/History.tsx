import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Wand2, ArrowUpRight, Sparkles, Clapperboard, Loader2 } from 'lucide-react'
import { listGenerations } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { videosFromCredits } from '../lib/brand'
import type { Generation } from '../lib/types'
import { Aurora } from '../components/Aurora'
import { Reveal, Stagger, RevealItem } from '../components/motion'

export default function History() {
  const { profile } = useAuth()
  const [items, setItems] = useState<Generation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listGenerations()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

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
            <Stat icon={Clapperboard} label="Total blueprints" value={loading ? '—' : String(items.length)} />
            <Stat icon={Sparkles} label="Recreations left" value={String(left)} />
            <Stat icon={Wand2} label="Plan" value={(profile?.account_type ?? 'free').replace(/^\w/, (c) => c.toUpperCase())} />
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
          <Stagger className="mt-10 grid gap-4 sm:grid-cols-2" gap={0.06}>
            {items.map((g) => (
              <RevealItem key={g.id}>
                <Link to={`/result/${g.id}`} className="glass glass-hover group block h-full p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5">
                      <Clapperboard className="h-5 w-5 text-amber" />
                    </span>
                    <ArrowUpRight className="h-5 w-5 text-stone transition-colors group-hover:text-cream" />
                  </div>
                  <h3 className="mt-4 font-heading text-lg leading-snug">
                    {g.blueprint?.reference_read?.format_label ?? 'Blueprint'}
                  </h3>
                  <div className="mt-1 truncate text-sm text-stone">{g.reference_url}</div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-stone">
                    <span className="chip">{g.blueprint?.reference_read?.platform ?? 'video'}</span>
                    <span>{new Date(g.created_at).toLocaleDateString()}</span>
                  </div>
                </Link>
              </RevealItem>
            ))}
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
