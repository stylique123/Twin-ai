import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Sparkles, FileText, Clapperboard, Send, Gift, Clock, Activity, Loader2, ShieldAlert } from 'lucide-react'
import { getMetrics, getCaseStudy, type MetricsOverview, type CaseStudy } from '../lib/api'
import { Aurora } from '../components/Aurora'
import { Reveal, Stagger, RevealItem } from '../components/motion'
import { Counter } from '../components/Counter'
import { cn } from '../lib/cn'

// Live data-room dashboard. Admin-gated server-side (admin-metrics edge fn); a
// non-admin just sees the access notice.
export default function Metrics() {
  const [m, setM] = useState<MetricsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [csEmail, setCsEmail] = useState('')
  const [cs, setCs] = useState<CaseStudy | null>(null)
  const [csBusy, setCsBusy] = useState(false)
  const [csErr, setCsErr] = useState('')

  const lookup = async () => {
    if (!csEmail.trim()) return
    setCsBusy(true); setCsErr(''); setCs(null)
    const r = await getCaseStudy(csEmail.trim())
    if (r) setCs(r); else setCsErr('No user with that email, or no activity yet.')
    setCsBusy(false)
  }

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
    <main className="relative min-h-screen overflow-clip">
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
                <div className="mt-4 font-display text-4xl tracking-tight text-cream"><Counter to={c.value} /></div>
                <div className="mt-1.5 text-xs font-medium tracking-wide text-stone">{c.label}</div>
              </div>
            </RevealItem>
          ))}
        </Stagger>
        {m.funnel && (() => {
          const f = m.funnel!
          const steps = [
            { label: 'Signed up', v: f.signup }, { label: 'Onboarded', v: f.onboarded },
            { label: 'Built a voice', v: f.voice }, { label: 'Made a blueprint', v: f.blueprint },
            { label: 'Rendered an edit', v: f.edit }, { label: 'Logged a post', v: f.post },
          ]
          const base = Math.max(1, f.signup)
          return (
            <Reveal delay={0.08}>
              <div className="glass mt-8 p-6">
                <h2 className="font-heading text-base text-cream">Activation funnel</h2>
                <div className="mt-4 space-y-2.5">
                  {steps.map((s, i) => {
                    const pct = Math.round((s.v / base) * 100)
                    const prev = i > 0 ? steps[i - 1].v : s.v
                    const drop = prev > 0 ? Math.round((s.v / prev) * 100) : 100
                    return (
                      <div key={s.label}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-sand">{s.label}</span>
                          <span className="text-stone">{s.v.toLocaleString()} · {pct}%{i > 0 && <span className="text-stone/60"> ({drop}% of prev)</span>}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/8">
                          <div className="h-full rounded-full bg-gradient-to-r from-amber via-coral to-teal" style={{ width: `${Math.max(2, pct)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Reveal>
          )
        })()}
        {m.retention && (() => {
          const r = m.retention!
          const wins = [{ label: 'D1', w: r.d1 }, { label: 'D7', w: r.d7 }, { label: 'D30', w: r.d30 }]
          return (
            <Reveal delay={0.1}>
              <div className="glass mt-6 p-6">
                <h2 className="font-heading text-base text-cream">Retention</h2>
                <div className="mt-4 grid grid-cols-3 gap-4">
                  {wins.map(({ label, w }) => {
                    const pct = w.eligible > 0 ? Math.round((w.retained / w.eligible) * 100) : 0
                    return (
                      <div key={label} className="rounded-xl border border-white/8 bg-white/[0.02] p-4 text-center">
                        <div className="font-display text-3xl text-cream">{pct}%</div>
                        <div className="mt-1 text-xs font-medium text-stone">{label} retention</div>
                        <div className="mt-0.5 text-[10px] text-stone/60">{w.retained}/{w.eligible} eligible</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Reveal>
          )
        })()}
        {m.health && (
          <Reveal delay={0.11}>
            <div className="glass mt-6 p-6">
              <h2 className="font-heading text-base text-cream">System health</h2>
              <div className="mt-4 grid grid-cols-3 gap-4">
                {[
                  { label: 'Failed jobs', v: m.health.failed_jobs },
                  { label: 'Stuck building', v: m.health.stuck_building },
                  { label: 'Ops events (24h)', v: m.health.ops_24h },
                ].map(({ label, v }) => (
                  <div key={label} className={cn('rounded-xl border p-4 text-center', v > 0 ? 'border-coral/40 bg-coral/10' : 'border-white/8 bg-white/[0.02]')}>
                    <div className={cn('font-display text-3xl', v > 0 ? 'text-coral' : 'text-cream')}>{v}</div>
                    <div className="mt-1 text-xs text-stone">{label}</div>
                  </div>
                ))}
              </div>
              {m.health.recent_ops.length > 0 && (
                <div className="mt-3 space-y-1">
                  {m.health.recent_ops.map((o, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-1.5 text-[11px]">
                      <span className="font-medium text-coral">{o.severity} · {o.kind}</span>
                      <span className="text-stone">{new Date(o.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Reveal>
        )}
        <Reveal delay={0.12}>
          <div className="glass mt-6 p-6">
            <h2 className="font-heading text-base text-cream">Case-study lookup</h2>
            <p className="mt-1 text-xs text-stone">Pull one creator's numbers for an investor one-pager.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input value={csEmail} onChange={(e) => setCsEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void lookup() }} placeholder="creator@email.com" className="field sm:max-w-xs" />
              <button onClick={lookup} disabled={csBusy} className="btn-gradient text-sm disabled:opacity-60">
                {csBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Look up
              </button>
            </div>
            {csErr && <p className="mt-2 text-xs text-coral">{csErr}</p>}
            {cs && (
              <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-heading text-cream">{cs.name || cs.email}</span>
                  <span className="text-xs text-stone">{cs.plan} · joined {new Date(cs.joined).toLocaleDateString()}</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {[
                    { l: 'Hours saved', v: cs.hours_saved }, { l: 'Blueprints', v: cs.blueprints }, { l: 'Edits', v: cs.edits },
                    { l: 'Posts', v: cs.posts }, { l: 'Voices', v: cs.voices }, { l: 'Remixes', v: cs.remixes }, { l: 'Active days', v: cs.active_days },
                  ].map((s) => (
                    <div key={s.l} className="rounded-lg border border-white/8 bg-white/[0.02] p-3 text-center">
                      <div className="font-display text-2xl text-cream">{s.v}</div>
                      <div className="mt-0.5 text-[10px] text-stone">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Reveal>
        <p className="mt-8 text-xs text-stone">Funnel = distinct users per step. Retention = active ≥ N days after first touch. Query analytics_events for deeper cohorts.</p>
      </div>
    </main>
  )
}
