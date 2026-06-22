import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Wand2, LayoutGrid, Clapperboard, Send, Sparkles, ArrowUpRight, FileText, Loader2, TrendingUp, Zap,
  Gift, Copy, Check, Clock, Eye, Trophy,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getDashboardStats, getReferralCode, getBrandStats, listBrandVoices, listGenerations, listPosts, updatePostStats, type BrandStats, type DashboardStats, type Post } from '../lib/api'
import type { BrandVoice, Generation } from '../lib/types'
import { Aurora } from '../components/Aurora'
import { Reveal, Stagger, RevealItem } from '../components/motion'
import { Counter } from '../components/Counter'
import { cn } from '../lib/cn'

export default function Dashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recent, setRecent] = useState<Generation[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [voices, setVoices] = useState<BrandVoice[]>([])
  const [selectedBrand, setSelectedBrand] = useState('') // '' = all brands
  const [brandStats, setBrandStats] = useState<BrandStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const credits = profile?.credits ?? 0

  // Extracted so a failed load surfaces a real retry instead of leaving every
  // stat stuck on "…" with no way to recover.
  const load = () => {
    setLoading(true); setError(false)
    Promise.all([getDashboardStats(credits), listGenerations(), listPosts(), listBrandVoices().catch(() => [])])
      .then(([s, g, p, vs]) => {
        setStats(s)
        setRecent(g.slice(0, 5))
        setPosts(p)
        setVoices((vs as BrandVoice[]).filter((v) => v.status === 'ready'))
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credits])

  // Agency view: scope the headline counts to one client brand.
  useEffect(() => {
    if (!selectedBrand) { setBrandStats(null); return }
    getBrandStats(selectedBrand).then(setBrandStats).catch(() => setBrandStats(null))
  }, [selectedBrand])

  const brand = voices.find((v) => v.is_default) ?? voices[0] ?? null
  const scoped = !!(selectedBrand && brandStats)
  const bpVal = scoped ? brandStats!.blueprints : stats?.blueprints
  const edVal = scoped ? brandStats!.edits : stats?.edits
  const poVal = scoped ? brandStats!.posts : stats?.posts
  const streak = postingStreak(posts)
  // Creator-facing value: hours saved (30 min/blueprint + 90 min/edit) and the
  // top-performing post by their self-reported views.
  const hoursSaved = stats ? Math.round(((stats.blueprints ?? 0) * 0.5 + (stats.edits ?? 0) * 1.5)) : 0
  const topId = posts.reduce((best, p) => ((p.views ?? 0) > 0 && (p.views ?? 0) > (posts.find((x) => x.id === best)?.views ?? 0) ? p.id : best), '')

  const rawName = profile?.email?.split('@')[0] ?? 'creator'
  const name = rawName.charAt(0).toUpperCase() + rawName.slice(1)

  return (
    <main className="relative overflow-clip">
      <Aurora className="opacity-70" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-1/2 top-1/3 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-teal/10 blur-[180px]" />
      </div>
      <div className="relative mx-auto max-w-6xl px-5 py-14 lg:py-20">
        <Reveal>
          <p className="eyebrow tracking-widest">Dashboard</p>
          <h1 className="mt-4 font-display text-4xl leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            Welcome back,{' '}<span className="gradient-text">{name}</span>.
          </h1>
          <p className="mt-4 max-w-md text-base text-stone">
            Everything you've shipped, and what to make next.
          </p>
          {(brand || streak > 0 || hoursSaved > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {hoursSaved > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal/30 bg-teal/10 px-3 py-1.5 text-xs font-semibold text-teal">
                  <Clock className="h-3.5 w-3.5" /> ~{hoursSaved}h saved
                </span>
              )}
              {brand && (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-sand">
                  <Sparkles className="h-3.5 w-3.5 text-amber" /> Working as <span className="font-semibold text-cream">@{brand.handle}</span>
                  <Link to="/brands" className="text-amber transition-colors hover:text-cream">Switch →</Link>
                </span>
              )}
              {streak > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-amber/10 px-3 py-1.5 text-xs font-semibold text-amber">
                  <TrendingUp className="h-3.5 w-3.5" /> {streak}-day streak
                </span>
              )}
            </div>
          )}
        </Reveal>
        {error && !loading && (
          <div className="mt-6 flex flex-col gap-3 rounded-card border border-coral/30 bg-coral/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-cream">We couldn't load your dashboard just now — usually a brief connection hiccup.</p>
            <button onClick={load} className="btn-gradient shrink-0 self-start text-sm sm:self-auto">Try again</button>
          </div>
        )}
        {voices.length > 1 && (
          <Reveal>
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <span className="text-xs text-stone">View:</span>
              <button onClick={() => setSelectedBrand('')} className={cn('chip', !selectedBrand ? 'border-coral/60 bg-coral/10 text-cream' : 'hover:text-cream')}>All brands</button>
              {voices.map((v) => (
                <button key={v.id} onClick={() => setSelectedBrand(v.id)} className={cn('chip', selectedBrand === v.id ? 'border-coral/60 bg-coral/10 text-cream' : 'hover:text-cream')}>@{v.handle}</button>
              ))}
            </div>
          </Reveal>
        )}
        <Stagger className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4" gap={0.07}>
          <StatCard icon={FileText} glow="amber" label="Blueprints" value={bpVal} loading={loading} />
          <StatCard icon={Clapperboard} glow="coral" label="Edits rendered" value={edVal} loading={loading} />
          <StatCard icon={Send} glow="teal" label="Posts logged" value={poVal} loading={loading} />
          <StatCard icon={Sparkles} glow="amber" label="Remixes left" value={stats?.recreationsLeft} loading={loading} />
        </Stagger>
        <Reveal delay={0.1}>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <ActionCard to="/app" icon={Wand2} iconGlow="from-amber/40 to-coral/30" iconColor="text-amber" title="New blueprint" desc="Paste a reference and get a shootable script in seconds." primary />
            <ActionCard to="/gallery" icon={LayoutGrid} iconGlow="from-teal/40 to-teal/10" iconColor="text-teal" title="Find your next hit" desc="See what's winning in your niche, remix any of it in one tap." />
            <ActionCard to="/history" icon={FileText} iconGlow="from-stone/40 to-stone/10" iconColor="text-cream" title="Your library" desc="Every blueprint you've ever made, searchable." />
          </div>
        </Reveal>
        <InviteCard />
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <Reveal>
            <div className="glass relative h-full overflow-hidden p-6">
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber/15"><Clapperboard className="h-3.5 w-3.5 text-amber" /></span>
                  <h2 className="font-heading text-base text-cream">Recent blueprints</h2>
                </div>
                <Link to="/history" className="group flex items-center gap-1 text-xs text-stone transition-colors hover:text-cream">
                  View all <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-14 text-stone"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : recent.length === 0 ? <EmptyBlueprints /> : (
                <div className="relative mt-5 space-y-2">
                  {recent.map((g, i) => (
                    <motion.div key={g.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
                      <Link to={`/result/${g.id}`} className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3.5 transition-all duration-200 hover:border-white/[0.14] hover:bg-white/[0.05]">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber/20 to-coral/10"><Clapperboard className="h-4 w-4 text-amber" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-heading text-sm text-cream">{g.blueprint?.reference_read?.format_label ?? 'Blueprint'}</div>
                          <div className="mt-0.5 truncate text-xs text-stone">{g.reference_url}</div>
                        </div>
                        <span className="shrink-0 text-xs text-stone/70">{new Date(g.created_at).toLocaleDateString()}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-stone/50 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-cream" />
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </Reveal>
          <Reveal delay={0.06}>
            <div className="glass relative flex h-full flex-col overflow-hidden p-6">
              <div className="relative flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal/15"><Send className="h-3.5 w-3.5 text-teal" /></span>
                <h2 className="font-heading text-base text-cream">Publishing</h2>
              </div>
              {posts.length === 0 ? <EmptyPublishing /> : (
                <div className="relative mt-5 space-y-2">
                  {posts.slice(0, 6).map((p) => (
                    <PostRow key={p.id} p={p} isTop={p.id === topId} />
                  ))}
                </div>
              )}
              <div className="relative mt-auto pt-5">
                <div className="flex items-start gap-3 rounded-xl bg-gradient-to-r from-amber/10 to-amber/5 p-3.5 ring-1 ring-amber/20">
                  <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
                  <p className="text-xs leading-relaxed text-sand">
                    {streak > 0
                      ? `You're on a ${streak}-day posting streak. Ship one more today to keep it alive.`
                      : 'Consistent posting compounds. Log a publish today to start your streak.'}
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </main>
  )
}

const glowMap = { amber: 'from-amber/[0.12] via-amber/[0.06] to-transparent shadow-glow', coral: 'from-coral/[0.12] via-coral/[0.06] to-transparent', teal: 'from-teal/[0.12] via-teal/[0.06] to-transparent shadow-glow-teal' } as const
const iconBgMap = { amber: 'bg-amber/15', coral: 'bg-coral/15', teal: 'bg-teal/15' } as const
const iconColorMap = { amber: 'text-amber', coral: 'text-coral', teal: 'text-teal' } as const

function StatCard({ icon: Icon, glow, label, value, loading }: { icon: React.ComponentType<{ className?: string }>; glow: keyof typeof glowMap; label: string; value: number | undefined; loading: boolean }) {
  return (
    <RevealItem>
      <motion.div whileHover={{ y: -4, scale: 1.015 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }} className="h-full">
        <div className={cn('relative h-full overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br p-5 backdrop-blur-md transition-colors hover:border-white/[0.14]', glowMap[glow])}>
          <div className="absolute inset-0 -z-10 bg-ink2/80" />
          <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl', iconBgMap[glow])}>
            <Icon className={cn('h-[18px] w-[18px]', iconColorMap[glow])} />
          </span>
          <div className="mt-4 font-display text-4xl tracking-tight text-cream">
            {loading || value === undefined ? <span className="text-stone/50">…</span> : <Counter to={value} />}
          </div>
          <div className="mt-1.5 text-xs font-medium tracking-wide text-stone">{label}</div>
        </div>
      </motion.div>
    </RevealItem>
  )
}

function ActionCard({ to, icon: Icon, iconGlow, iconColor, title, desc, primary }: { to: string; icon: React.ComponentType<{ className?: string }>; iconGlow: string; iconColor: string; title: string; desc: string; primary?: boolean }) {
  return (
    <motion.div whileHover={{ y: -5, scale: 1.01 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="h-full">
      <Link to={to} className={cn('group relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl p-5 transition-all duration-200', primary ? 'gradient-border bg-ink2 shadow-glow' : 'border border-white/[0.08] bg-ink2/70 backdrop-blur-md hover:border-white/[0.16] hover:bg-white/[0.04]')}>
        {primary && <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-amber/15 blur-[50px]" />}
        <span className={cn('relative inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br', iconGlow)}><Icon className={cn('h-5 w-5', iconColor)} /></span>
        <div className="relative flex-1">
          <div className="flex items-center gap-2 font-heading text-sm text-cream">
            {title}{primary && <span className="rounded-full bg-amber/20 px-2 py-0.5 text-[10px] font-medium text-amber">Start here</span>}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-stone">{desc}</p>
        </div>
        <ArrowUpRight className={cn('h-4 w-4 self-end transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5', primary ? 'text-amber/70 group-hover:text-amber' : 'text-stone/50 group-hover:text-cream')} />
      </Link>
    </motion.div>
  )
}

function EmptyBlueprints() {
  return (
    <div className="relative mt-6 flex flex-col items-center justify-center py-12 text-center">
      <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
        <motion.div animate={{ scale: [1, 1.12, 1], opacity: [0.3, 0.5, 0.3] }} transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }} className="absolute inset-0 rounded-full bg-amber/20 blur-xl" />
        <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }} className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber/30 to-coral/20 ring-1 ring-white/10">
          <Zap className="h-6 w-6 text-amber" />
        </motion.div>
      </div>
      <p className="font-heading text-sm text-cream">No blueprints yet</p>
      <p className="mt-2 max-w-[220px] text-xs leading-relaxed text-stone">Paste any video link and get a shootable script tailored to your style.</p>
      <Link to="/app" className="btn-gradient mt-5 inline-flex items-center gap-2 text-sm"><Wand2 className="h-3.5 w-3.5" /> Make your first one</Link>
    </div>
  )
}

// A logged post with self-reported performance. The creator enters how it did
// (views) until real platform numbers are pulled in via OAuth later; the top
// performer is badged so they can see which format actually won.
function PostRow({ p, isTop }: { p: Post; isTop: boolean }) {
  const [views, setViews] = useState(p.views != null ? String(p.views) : '')
  const [saved, setSaved] = useState(false)
  const save = async () => {
    const n = parseInt(views.replace(/[^0-9]/g, ''), 10)
    if (!Number.isFinite(n)) return
    await updatePostStats(p.id, n)
    setSaved(true); setTimeout(() => setSaved(false), 1200)
  }
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border bg-white/[0.025] p-3 transition-colors', isTop ? 'border-amber/40' : 'border-white/[0.06] hover:border-white/[0.12]')}>
      <span className="w-14 shrink-0 font-heading text-xs capitalize text-teal">{p.platform}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-cream">{isTop && <Trophy className="mr-1 inline h-3.5 w-3.5 text-amber" />}{p.caption || 'Posted'}</span>
      <div className="flex shrink-0 items-center gap-1">
        <Eye className="h-3 w-3 text-stone" />
        <input
          value={views}
          onChange={(e) => setViews(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          inputMode="numeric"
          placeholder="views"
          className="w-16 border-b border-white/10 bg-transparent text-right text-xs text-cream outline-none transition-colors placeholder:text-stone/50 focus:border-teal"
        />
        {saved && <Check className="h-3 w-3 text-teal" />}
      </div>
    </div>
  )
}

// Consecutive-day posting streak from logged posts (anchored to today or
// yesterday so a not-yet-posted-today streak still counts).
function postingStreak(posts: Post[]): number {
  const days = new Set(posts.map((p) => new Date(p.posted_at ?? p.created_at).toDateString()))
  const d = new Date()
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1)
  let streak = 0
  while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1) }
  return streak
}

// Viral loop: a two-sided referral. The "2 free remixes" copy mirrors the
// REFERRAL_REWARD_CREDITS default (20 credits) on the referral edge function.
function InviteCard() {
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => { getReferralCode().then(setCode).catch(() => {}) }, [])
  const link = code ? `${window.location.origin}/auth?mode=signup&ref=${code}` : ''
  const copy = async () => {
    if (!link) return
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* clipboard blocked */ }
  }
  return (
    <Reveal delay={0.08}>
      <div className="glass relative mt-6 overflow-hidden p-6">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal/15"><Gift className="h-5 w-5 text-teal" /></span>
            <div>
              <h2 className="font-heading text-base text-cream">Invite a creator, you both get 2 free remixes</h2>
              <p className="mt-1 text-sm text-stone">Share your link. When they sign up, you each get 2 remixes on us.</p>
            </div>
          </div>
          <button onClick={copy} disabled={!code} className="btn-gradient shrink-0 text-sm disabled:opacity-50">
            {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy invite link</>}
          </button>
        </div>
        {code && (
          <div className="relative mt-3 truncate rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-xs text-stone">{link}</div>
        )}
      </div>
    </Reveal>
  )
}

function EmptyPublishing() {
  return (
    <div className="relative mt-5 flex flex-1 flex-col items-center justify-center py-10 text-center">
      <div className="relative mb-4 flex h-16 w-16 items-center justify-center">
        <motion.div animate={{ scale: [1, 1.15, 1], opacity: [0.25, 0.45, 0.25] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} className="absolute inset-0 rounded-full bg-teal/25 blur-xl" />
        <motion.div animate={{ scale: [1, 1.07, 1] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }} className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal/30 to-teal/10 ring-1 ring-white/10">
          <Send className="h-5 w-5 text-teal" />
        </motion.div>
      </div>
      <p className="font-heading text-sm text-cream">Nothing published yet</p>
      <p className="mt-1.5 max-w-[190px] text-xs leading-relaxed text-stone">Open a blueprint, then hit <span className="text-cream">Publish</span> to log your post here.</p>
    </div>
  )
}
