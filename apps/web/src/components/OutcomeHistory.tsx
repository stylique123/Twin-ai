// §7b's log, shown — the reason it is a log and not a column.
//
// `posts.views` can answer "how many views does this have?". It can never
// answer "how fast did it get them?" or "did it keep going?", because each save
// destroyed the previous number. This renders the readings instead: every one
// that was taken, when it was TRUE, where it came from, and the change between
// the first and the last.
//
// ── THE THREE STATES, WHICH ARE NOT TWO ──────────────────────────────────
//
//   recording, with readings   the series
//   recording, none yet        "no readings yet" — a true statement
//   not recording              NOTHING, because we do not know
//
// The third exists because 0105 may not be applied. Rendering it as the second
// would tell a creator their log is empty while their numbers are being
// overwritten — the exact failure the log was built to end.
import { useEffect, useState } from 'react'
import { listPostObservations, seriesByMetric, type MetricSeries } from '../lib/api'

const DAY_MS = 86_400_000

/** "in 2 days" / "in 6 hours". Deliberately coarse: the span is context for the
 *  change, not a measurement, and a precise-looking figure would invite it to
 *  be read as one. */
function spanLabel(ms: number): string {
  if (ms >= DAY_MS) {
    const d = Math.round(ms / DAY_MS)
    return `in ${d} day${d === 1 ? '' : 's'}`
  }
  const h = Math.max(1, Math.round(ms / 3_600_000))
  return `in ${h} hour${h === 1 ? '' : 's'}`
}

const METRIC_LABEL: Record<string, string> = {
  views: 'Views', likes: 'Likes', comments: 'Comments', shares: 'Shares', saves: 'Saves',
  watch_time_ms: 'Watch time', retention_pct_milli: 'Retention',
  clicks: 'Clicks', leads: 'Leads', sales: 'Sales', revenue_minor: 'Revenue',
}

/** How the number arrived, shown rather than flattened. A creator typing what
 *  they saw is not an API read, and the difference matters to anyone deciding
 *  what to conclude from the series. */
const SOURCE_LABEL: Record<string, string> = {
  platform_api: 'from the platform', manual: 'you entered it', import: 'imported',
}

function formatValue(metric: string, value: number): string {
  if (metric === 'watch_time_ms') return `${Math.round(value / 1000).toLocaleString()}s`
  if (metric === 'retention_pct_milli') return `${(value / 1000).toFixed(1)}%`
  return value.toLocaleString()
}

export function OutcomeHistory({ postId }: { postId: string }) {
  const [state, setState] = useState<{ known: boolean; series: MetricSeries[] } | null>(null)

  useEffect(() => {
    let alive = true
    listPostObservations(postId).then((read) => {
      if (alive) setState({ known: read.known, series: seriesByMetric(read.readings) })
    })
    return () => { alive = false }
  }, [postId])

  if (!state) return null
  // Not recording, or the read failed: say nothing. An empty state here would
  // be a claim about the log that this component did not learn.
  if (!state.known) return null
  if (state.series.length === 0) {
    return <p className="px-3 pb-3 text-[11px] text-stone">No readings recorded yet.</p>
  }

  return (
    <div className="space-y-2 px-3 pb-3">
      {state.series.map((s) => (
        <div key={s.metric}>
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sand/70">
              {METRIC_LABEL[s.metric] ?? s.metric}
            </span>
            {/* Only shown when there are two readings and time between them.
                One reading has no rate, and "+12,000" from a single point would
                be the total wearing a delta's clothes. */}
            {s.change && (
              <span className="text-[11px] text-teal">
                {s.change.delta >= 0 ? '+' : ''}{formatValue(s.metric, s.change.delta)}
                {' '}{spanLabel(s.change.spanMs)}
              </span>
            )}
          </div>
          <ul className="mt-1 space-y-0.5">
            {s.points.map((p) => (
              <li key={`${p.observedAt}-${p.source}`} className="flex items-baseline gap-2 text-[11px] text-stone">
                <span className="w-20 shrink-0 tabular-nums text-cream">
                  {formatValue(s.metric, p.value)}
                </span>
                <span>{new Date(p.observedAt).toLocaleDateString()}</span>
                <span className="text-stone/60">· {SOURCE_LABEL[p.source] ?? p.source}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
