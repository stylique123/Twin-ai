import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Sparkles, FileText, Clapperboard, Send, Gift, Clock, Activity, Loader2, ShieldAlert } from 'lucide-react'
import { getMetrics, type MetricsOverview } from '../lib/api'
import { Aurora } from '../components/Aurora'
import { Reveal, Stagger, RevealItem } from '../components/motion'
import { Counter } from '../components/Counter'

// Live data-room dashboard. Admin-gated server-side (admin-metrics edge fn); a
// non-admin just sees the access notice.
export default function Metrics() {
  const [m, setM] = useState<MetricsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    getMetrics()
      .then((d) => (d ? setM(d) : setDenied(true)))
      .catch(() => setDenied(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading)
    return (
      <main className="grid min-h-[60vh] place-items-center text-sand">
        <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading metrics…</span>
      </main>
    )

  if (denied || !m)
    return (
      <main className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-5 text-center">
        <div>
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-coral/15"><ShieldAlert className="h-6 w-6 text-coral" /></span>
          <p className="mt-4 font-heading text-lg text-cream">Admin only</p>
          <p className="mt-2 text-sm text-stone">This dashboard is restricted to platform admins.</p>
          <Link to="/dashboard" className="btn-gradient mt-6 inline-flex">Back to Dashboard</Link>
        </div>
      </main>
    )

  const cards: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; glow: 'amber' | 'teal' | 'coral'; suffix?: string }[] = [
    { label: 'Total users', value: m.total_users, icon: Users, glow: 'amber' },
    { label: 'Onboarded', value: m.onboarded_users, icon: Sparkles, glow: 'teal' },
    { label: 'Voices built', value: m.voices_built, icon: Activity, glow: 'coral' },
    { label: 'Blueprints', value: m.blueprints_generated, icon: FileText, glow: 'amber' },
    { label: 'Edits rendered', value: m.edits_rendered, icon: Clapperboard, glow: 'coral' },
    { label: 'Posts logged', value: m.posts_logged, icon: Send, glow: 'teal' },
    { label: 'Referrals', value: m.referrals_redeemed, icon: Gift, glow: 'teal' },
    { label: 'Hours saved', value: m.total_hours_saved, icon: Clock, glow: 'amber' },
    { label: 'WAU (7d)', value: m.wau, icon: Activity, glow: 'teal' },
    { label: 'MAU (30d)', value: m.mau, icon: Activity, glow: 'coral' },
  ]
  const glowMap = { amber: 'bg-amber/15 text-amber', teal: 'bg-teal/15 text-teal', coral: 'bg-coral/15 text-coral' }

  return (
    <main className="relative overflow-clip">
      <Aurora className="opacity-60" />
      <div className="relative mx-auto max-w-6xl px-5 py-14 lg:py-20">
        <Reveal>
          <p className="eyebrow tracking-widest">Data room</p>
          <h1 className="mt-4 font-display text-4xl leading-[1.1] tracking-tight sm:text-5xl">Live metrics</h1>
          <p className="mt-4 max-w-md text-base text-stone">The headline KPIs, updated in real time. Backed by the analytics_events stream.</p>
        </Reveal>
        <Stagger className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" gap={0.05}>
          {cards.map((c) => (
            <RevealItem key={c.label}>
              <div className="relative h-full overflow-hidden rounded-2xl border border-white/8 bg-ink2/70 p-5 backdrop-blur-md">
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${glowMap[c.glow]}`}>
                  <c.icon className="h-[18px] w-[18px]" />
                </span>
                <div className="mt-4 font-display text-3xl tracking-tight text-cream"><Counter to={c.value} /></div>
                <div className="mt-1.5 text-xs font-medium tracking-wide text-stone">{c.label}</div>
              </div>
            </RevealItem>
          ))}
        </Stagger>
        <p className="mt-8 text-xs text-stone">Activation funnel: signup → onboarded → voice → blueprint → edit → post. Query analytics_events for cohorts, retention, and per-user case studies.</p>
      </div>
    </main>
  )
}
