import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, FileText, Clapperboard, Send, Eye, Clock } from 'lucide-react'
import { getBrandReport, type BrandReport } from '../lib/api'
import { Logo } from '../components/Logo'
import { Aurora } from '../components/Aurora'

// Login-free, white-label CLIENT REPORT. An agency shares /r/:token with a client;
// the client sees that brand's results — no account, no app access. Read-only and
// PII-free (the unguessable token is the access control; see migration 0035).
export default function ClientReport() {
  const { token = '' } = useParams()
  const [report, setReport] = useState<BrandReport | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')

  useEffect(() => {
    getBrandReport(token)
      .then((r) => { if (r) { setReport(r); setState('ok') } else setState('missing') })
      .catch(() => setState('missing'))
  }, [token])

  const fmt = (n: number) => n.toLocaleString()

  return (
    <main className="relative min-h-screen overflow-clip">
      <Aurora className="opacity-50" />
      <div className="relative mx-auto max-w-3xl px-5 py-14 lg:py-20">
        {state === 'loading' ? (
          <div className="grid min-h-[50vh] place-items-center text-sand">
            <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading report…</span>
          </div>
        ) : state === 'missing' ? (
          <div className="glass grid min-h-[50vh] place-items-center p-12 text-center">
            <div>
              <p className="font-heading text-lg text-cream">This report link isn't active.</p>
              <p className="mt-1 text-sm text-stone">Ask your team for a fresh link.</p>
            </div>
          </div>
        ) : report && (
          <>
            <div className="flex items-center justify-between">
              <p className="eyebrow">Performance report</p>
              <span className="inline-flex items-center gap-1.5 text-xs text-stone">Powered by <Logo className="h-4" /></span>
            </div>
            <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">
              <span className="gradient-text">{report.label}</span>
            </h1>
            <p className="mt-3 max-w-xl text-base text-sand">A snapshot of what we've produced and shipped for you.</p>

            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat icon={Eye} label="Views" value={fmt(report.views)} accent="text-teal" />
              <Stat icon={Send} label="Posts shipped" value={fmt(report.posts)} accent="text-coral" />
              <Stat icon={Clapperboard} label="Videos edited" value={fmt(report.edits)} accent="text-amber" />
              <Stat icon={FileText} label="Scripts written" value={fmt(report.blueprints)} accent="text-teal" />
              <Stat icon={Clock} label="Hours saved" value={`~${fmt(report.hours_saved)}`} accent="text-amber" />
            </div>

            <p className="mt-10 text-center text-[11px] text-stone">
              Views are reported by the team; platform-verified numbers coming soon. This link is private to you.
            </p>
          </>
        )}
      </div>
    </main>
  )
}

function Stat({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; accent: string }) {
  return (
    <div className="glass p-5">
      <Icon className={`h-5 w-5 ${accent}`} />
      <div className="mt-3 font-display text-4xl tracking-tight text-cream">{value}</div>
      <div className="mt-1 text-xs text-stone">{label}</div>
    </div>
  )
}
