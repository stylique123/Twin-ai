import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Wand2, LayoutGrid, Clapperboard, Send, Sparkles, ArrowUpRight, FileText, Loader2, TrendingUp,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getDashboardStats, listGenerations, listPosts, type DashboardStats, type Post } from '../lib/api'
import type { Generation } from '../lib/types'
import { Aurora } from '../components/Aurora'
import { Reveal, Stagger, RevealItem } from '../components/motion'
import { Counter } from '../components/Counter'
import { cn } from '../lib/cn'

export default function Dashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recent, setRecent] = useState<Generation[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  const credits = profile?.credits ?? 0

  useEffect(() => {
    Promise.all([getDashboardStats(credits), listGenerations(), listPosts()])
      .then(([s, g, p]) => {
        setStats(s)
        setRecent(g.slice(0, 5))
        setPosts(p)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credits])

  const name = profile?.email?.split('@')[0] ?? 'creator'

  return (
    <main className="relative overflow-clip">
      <Aurora className="opacity-60" />
      <div className="relative mx-auto max-w-6xl px-5 py-12 lg:py-16">
        <Reveal>
          <p className="eyebrow">Dashboard</p>
          <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">
            Welcome back, <span className="gradient-text">{name}</span>.
          </h1>
          <p className="mt-3 text-sand">Your whole loop at a glance — reference in, finished video out.</p>
        </Reveal>

        {/* Stat cards (real counts) */}
        <Stagger className="mt-9 grid grid-cols-2 gap-4 lg:grid-cols-4" gap={0.06}>
          <StatCard icon={FileText} tint="text-amber" label="Blueprints" value={stats?.blueprints} loading={loading} />
          <StatCard icon={Clapperboard} tint="text-coral" label="Edits rendered" value={stats?.edits} loading={loading} />
          <StatCard icon={Send} tint="text-teal" label="Posts logged" value={stats?.posts} loading={loading} />
          <StatCard icon={Sparkles} tint="text-amber" label="Recreations left" value={stats?.recreationsLeft} loading={loading} />
        </Stagger>

        {/* Quick actions */}
        <Reveal delay={0.08}>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <ActionCard to="/app" icon={Wand2} title="New blueprint" desc="Paste a reference and get it shootable." primary />
            <ActionCard to="/gallery" icon={LayoutGrid} title="Browse the gallery" desc="Proven formats, one-click remix." />
            <ActionCard to="/history" icon={FileText} title="Your library" desc="Every blueprint you've made." />
          </div>
        </Reveal>

        <div className="mt-10 grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
          {/* Recent blueprints */}
          <Reveal>
            <div className="glass h-full p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-lg">Recent blueprints</h2>
                <Link to="/history" className="text-sm text-stone hover:text-cream">View all</Link>
              </div>
              {loading ? (
                <div className="grid place-items-center py-10 text-sand">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : recent.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sand">No blueprints yet.</p>
                  <Link to="/app" className="btn-gradient mt-4 inline-flex">Make your first one</Link>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {recent.map((g) => (
                    <Link
                      key={g.id}
                      to={`/result/${g.id}`}
                      className="group flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3.5 transition-colors hover:border-white/16"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5">
                        <Clapperboard className="h-4.5 w-4.5 h-[18px] w-[18px] text-amber" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-heading text-sm text-cream">
                          {g.blueprint?.reference_read?.format_label ?? 'Blueprint'}
                        </div>
                        <div className="truncate text-xs text-stone">{g.reference_url}</div>
                      </div>
                      <span className="shrink-0 text-xs text-stone">{new Date(g.created_at).toLocaleDateString()}</span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-stone transition-colors group-hover:text-cream" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </Reveal>

          {/* Publishing / momentum */}
          <Reveal delay={0.05}>
            <div className="glass flex h-full flex-col p-6">
              <h2 className="font-heading text-lg">Publishing</h2>
              {posts.length === 0 ? (
                <div className="mt-4 flex flex-1 flex-col justify-center rounded-xl border border-dashed border-white/12 p-5 text-center">
                  <Send className="mx-auto h-5 w-5 text-stone" />
                  <p className="mt-3 text-sm text-sand">No posts logged yet.</p>
                  <p className="mt-1 text-xs text-stone">
                    Open a blueprint → <span className="text-cream">Publish</span> to copy captions and log when you post.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {posts.slice(0, 6).map((p) => (
                    <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                      <span className="w-16 shrink-0 text-xs font-heading capitalize text-teal">{p.platform}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-cream">{p.caption || 'Posted'}</span>
                      <span className="shrink-0 text-xs text-stone">
                        {new Date(p.posted_at ?? p.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-signature-soft p-3 text-xs text-cream">
                <TrendingUp className="h-4 w-4 shrink-0 text-amber" />
                Consistent posting compounds — log each one to keep your streak honest.
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </main>
  )
}

function StatCard({
  icon: Icon,
  tint,
  label,
  value,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>
  tint: string
  label: string
  value: number | undefined
  loading: boolean
}) {
  return (
    <RevealItem>
      <div className="glass glass-hover h-full p-5">
        <Icon className={cn('h-5 w-5', tint)} />
        <div className="mt-3 font-display text-3xl tracking-tight">
          {loading || value === undefined ? <span className="text-stone">—</span> : <Counter to={value} />}
        </div>
        <div className="mt-1 text-xs text-stone">{label}</div>
      </div>
    </RevealItem>
  )
}

function ActionCard({
  to,
  icon: Icon,
  title,
  desc,
  primary,
}: {
  to: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc: string
  primary?: boolean
}) {
  return (
    <motion.div whileHover={{ y: -3 }}>
      <Link
        to={to}
        className={cn(
          'flex h-full items-start gap-3 rounded-card p-5',
          primary ? 'gradient-border bg-ink2 shadow-glow' : 'glass glass-hover',
        )}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-signature-soft">
          <Icon className="h-5 w-5 text-cream" />
        </span>
        <div>
          <div className="font-heading">{title}</div>
          <div className="mt-0.5 text-sm text-stone">{desc}</div>
        </div>
      </Link>
    </motion.div>
  )
}
