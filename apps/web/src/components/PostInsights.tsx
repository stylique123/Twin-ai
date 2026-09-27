// ONE POST'S NUMBERS, SHAPED BY WHAT THE NETWORK REALLY GIVES (owner's blueprint).
//
// Instagram / LinkedIn → a views-over-time line from Twin's own snapshots, plus
// the comment text. TikTok / YouTube → lifetime totals only, and the comment
// text section is replaced by a plain note, because those platforms do not let
// a third party read comment text through the posting service.
import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { postInsights, type PostInsights, type Post } from '../lib/api'

const fmt = (n: number | null | undefined) => (typeof n === 'number' ? n.toLocaleString() : '—')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Views over time, one series: 2px line, hover crosshair + tooltip. */
export function ViewsLine({ points }: { points: Array<{ at: string; v: number }> }) {
  const [hover, setHover] = useState<number | null>(null)
  if (points.length < 2) return <p className="text-xs text-stone">The chart appears after the second reading.</p>
  const W = 480, H = 140, P = 8
  const max = Math.max(...points.map((p) => p.v), 1)
  const x = (i: number) => P + (i / (points.length - 1)) * (W - 2 * P)
  const y = (v: number) => H - P - (v / max) * (H - 2 * P)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const h = hover === null ? null : points[hover]
  return (
    <div className="relative" data-testid="views-line">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" role="img" aria-label="Views over time"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const rel = ((e.clientX - r.left) / r.width) * W
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(((rel - P) / (W - 2 * P)) * (points.length - 1)))))
        }}>
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} className="stroke-white/10" strokeWidth={1} />
        <path d={d} fill="none" className="stroke-coral" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {h && hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={P} y2={H - P} className="stroke-white/20" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(h.v)} r={4} className="fill-coral stroke-ink" strokeWidth={2} />
          </>
        )}
      </svg>
      {h && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-md border border-white/10 bg-ink/90 px-2 py-1 text-[11px] text-cream">
          {new Date(h.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' })}: {h.v.toLocaleString()} views
        </div>
      )}
    </div>
  )
}

export function PostInsightsPanel({ post, onClose }: { post: Post; onClose: () => void }) {
  const [data, setData] = useState<PostInsights | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    postInsights(post.id).then((d) => { if (alive) setData(d) }, (e) => { if (alive) setErr(e instanceof Error ? e.message : 'Could not load') })
    return () => { alive = false }
  }, [post.id])

  const tiles = data ? ([
    ['Views', data.latest.views], ['Likes', data.latest.likes], ['Comments', data.latest.comments], ['Shares', data.latest.shares],
    ...(data.chart === 'timeseries' ? [['Saves', data.latest.saves], ['Impressions', data.latest.impressions]] as const : []),
  ] as ReadonlyArray<readonly [string, number | null]>).filter(([, v]) => v !== null) : []

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/85 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass relative max-h-[88vh] w-full max-w-lg overflow-y-auto p-6" onClick={(e) => e.stopPropagation()} data-testid="post-insights">
        <button aria-label="Close" onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-stone hover:bg-white/5 hover:text-cream"><X className="h-4 w-4" /></button>
        <h2 className="font-display text-2xl tracking-tight">{cap(post.platform)} post</h2>
        {post.external_url && <a href={post.external_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-stone underline">Open on {cap(post.platform)}</a>}
        {!data && !err && <p className="mt-6 inline-flex items-center gap-2 text-sand"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
        {err && <p className="mt-6 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{err}</p>}
        {data && (
          <>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-stone">
              {data.chart === 'timeseries' ? 'Performance' : 'Lifetime totals'}
            </p>
            {tiles.length ? (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {tiles.map(([label, v]) => (
                  <div key={label} className="rounded-card border border-white/8 bg-white/[0.02] p-3">
                    <div className="text-[11px] text-stone">{label}</div>
                    <div className="mt-0.5 font-heading text-xl text-cream">{fmt(v)}</div>
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 text-sm text-stone">No numbers yet — they arrive a few hours after posting.</p>}
            {data.chart === 'timeseries' && (
              <div className="mt-4">
                <ViewsLine points={data.history.filter((h) => typeof h.views === 'number').map((h) => ({ at: h.taken_at, v: h.views as number }))} />
              </div>
            )}
            <p className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-stone">Comments</p>
            {data.commentsReadable ? (
              data.comments && data.comments.length ? (
                <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto" data-testid="comment-feed">
                  {data.comments.map((c) => (
                    <li key={c.id} className="rounded-card border border-white/8 bg-white/[0.02] p-2.5 text-sm">
                      {c.username && <span className="font-medium text-cream">{c.username} </span>}
                      <span className="text-sand">{c.text}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-stone">No comments yet.</p>
            ) : (
              <p className="mt-2 text-sm text-stone" data-testid="comments-restricted">
                Comment stream viewing is restricted natively by this platform's third-party integration policies.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
