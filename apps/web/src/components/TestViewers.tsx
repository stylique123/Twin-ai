// TEST VIEWERS — what ~10 pretend viewers from her audience said about this
// script, shown at the top of "Why it works".
//
// ⚖️ HONEST: counts ("8 of 10"), never a forecast percentage, and it says plainly
// that Twin played the viewers. While the test runs (a few seconds after the
// script appears) it shows a quiet "testing" line; if it never arrives, the tab
// shows exactly what it showed before.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Viewer { who: string; quote: string; stops_for: number; leaves_at: number; question: string | null; would_stop?: number[] }
interface Fix { issue: string; fix: string; beat: number; count: number }
export interface Test {
  status: 'done' | 'failed'
  panel_size: number | null
  hooks: Array<{ hook: string; stopped: number }>
  best_hook: number | null
  viewers: Viewer[]
  fixes: Fix[]
  summary: string | null
  panel_voice_id: string | null
}

const POLL_MS = 4000
const GIVE_UP_MS = 90_000

/** Words of a hook, for telling near-duplicates apart. */
const words = (h: string) => new Set(h.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter((w) => w.length > 2))
/** ⚖️ TWO HOOKS SAYING THE SAME THING ARE ONE OPTION. Measured: five options
 *  presented, four ideas tested. Share of the smaller hook's words. */
export function sameIdea(a: string, b: string): boolean {
  const A = words(a), B = words(b)
  if (!A.size || !B.size) return false
  let n = 0
  for (const w of A) if (B.has(w)) n++
  return n / Math.min(A.size, B.size) >= 0.6
}

/** ⚖️ THE ONE PLACE A HOOK IS "RECOMMENDED": the most viewers stopped for it.
 *  The picker used to star option #1 regardless — which scored 0 of 10 on
 *  three live runs while another option scored 4–6. Returns per-hook counts
 *  keyed by hook text, and which near-duplicates to hide. */
export function hookVerdicts(options: string[], test: Test | null) {
  if (!test || test.status !== 'done' || !test.viewers.length) return null
  const n = test.panel_size ?? test.viewers.length
  const stopped = new Map(test.hooks.map((h) => [h.hook, h.stopped]))
  const best = test.best_hook !== null ? test.hooks[test.best_hook]?.hook ?? null : null
  const hidden = new Set<string>()
  const byScore = [...options].sort((a, b) => (stopped.get(b) ?? -1) - (stopped.get(a) ?? -1))
  byScore.forEach((h, i) => {
    if (hidden.has(h)) return
    for (const lower of byScore.slice(i + 1)) if (sameIdea(h, lower)) hidden.add(lower)
  })
  return { n, stopped, best, hidden }
}

export function useAudienceTest(generationId: string) {
  const [test, setTest] = useState<Test | null>(null)
  const [waiting, setWaiting] = useState(true)
  useEffect(() => {
    let alive = true
    const started = Date.now()
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = () => {
      void supabase.from('audience_tests')
        .select('status, panel_size, hooks, best_hook, viewers, fixes, summary, panel_voice_id')
        .eq('generation_id', generationId).maybeSingle()
        .then(({ data }) => {
          if (!alive) return
          if (data) { setTest(data as Test); setWaiting(false); return }
          if (Date.now() - started > GIVE_UP_MS) { setWaiting(false); return }
          timer = setTimeout(load, POLL_MS)
        }, () => { if (alive) setWaiting(false) })
    }
    load()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [generationId])
  return { test, waiting }
}

/** The viewers' notes. Hook scores live on the hook picker itself now, so the
 *  audience informs the choice instead of following it. */
export function TestViewers({ generationId }: { generationId: string }) {
  const { test, waiting } = useAudienceTest(generationId)
  const [open, setOpen] = useState(false)

  if (!test) {
    return waiting
      ? <p className="text-xs text-stone">Testing this script on viewers like yours…</p>
      : null
  }
  if (test.status !== 'done' || test.viewers.length === 0) return null

  const n = test.panel_size ?? test.viewers.length

  return (
    <div className="space-y-5" data-testid="test-viewers">
      <p className="text-[11px] text-stone">
        {test.panel_voice_id
          ? `Twin tested this on your ${n} regular viewers, built from how your real posts performed.`
          : `Twin tested this on ${n} viewers like yours.`}
        {' '}Twin plays them, so treat it as a practice audience, not a promise. Their hook scores are on the hooks above. They judge whether people stay past the opening; numbers in the rest of the script are checked separately against what you gave Twin.
      </p>

      {test.fixes.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">What your viewers flagged</h3>
          <ul className="space-y-2">
            {test.fixes.map((f, i) => (
              <li key={i} className="text-xs text-sand leading-relaxed">
                {f.count > 0 && <span className="font-semibold text-coral">{f.count} of {n} · </span>}
                {f.beat >= 0 && <span className="text-stone">Line {f.beat + 1}: </span>}
                {f.fix}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <button type="button" onClick={() => setOpen(!open)} className="text-[11px] font-semibold uppercase tracking-wider text-teal">
          {open ? 'Hide' : 'See'} what each viewer said
        </button>
        {open && (
          <ul className="mt-2 space-y-2">
            {test.viewers.map((v, i) => (
              <li key={i} className="rounded-lg border border-white/5 p-2.5 text-xs">
                <span className="font-semibold text-cream">{v.who}: </span>
                <span className="text-sand">“{v.quote}”</span>
                {v.leaves_at >= 0 && <span className="block text-[11px] text-stone">Would scroll away at line {v.leaves_at + 1}</span>}
                {v.question && <span className="block text-[11px] text-stone">Would ask: {v.question}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
