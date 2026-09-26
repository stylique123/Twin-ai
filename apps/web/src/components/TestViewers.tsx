// TEST VIEWERS — what ~10 pretend viewers from her audience said about this
// script, shown at the top of "Why it works".
//
// ⚖️ HONEST: counts ("8 of 10"), never a forecast percentage, and it says plainly
// that Twin played the viewers. While the test runs (a few seconds after the
// script appears) it shows a quiet "testing" line; if it never arrives, the tab
// shows exactly what it showed before.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Viewer { who: string; quote: string; stops_for: number; leaves_at: number; question: string | null }
interface Fix { issue: string; fix: string; beat: number; count: number }
interface Test {
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

export function TestViewers({ generationId, chosenHook, onPick }: {
  generationId: string
  chosenHook: string
  onPick: (hook: string) => void
}) {
  const [test, setTest] = useState<Test | null>(null)
  const [waiting, setWaiting] = useState(true)
  const [open, setOpen] = useState(false)

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

  if (!test) {
    return waiting
      ? <p className="text-xs text-stone">Testing this script on viewers like yours…</p>
      : null
  }
  if (test.status !== 'done' || test.viewers.length === 0) return null

  const n = test.panel_size ?? test.viewers.length
  const ranked = test.hooks.map((h, i) => ({ ...h, i })).sort((a, b) => b.stopped - a.stopped)

  return (
    <div className="space-y-5" data-testid="test-viewers">
      <div className="space-y-2">
        <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Pick your hook</h3>
        <p className="text-[11px] text-stone">
          {test.panel_voice_id
            ? `Twin tested this on your ${n} regular viewers, built from how your real posts performed.`
            : `Twin tested this on ${n} viewers like yours.`}
          {' '}Twin plays them, so treat it as a practice audience, not a promise.
        </p>
        <ul className="space-y-2">
          {ranked.map((h) => {
            const best = h.i === test.best_hook
            const chosen = h.hook === chosenHook
            const says = test.viewers.find((v) => v.stops_for === h.i)?.quote
            return (
              <li key={h.i}>
                <button
                  type="button"
                  onClick={() => onPick(h.hook)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${chosen ? 'border-teal bg-teal/10' : 'border-white/5 hover:border-white/15'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-sand">
                      {best ? '⭐ Recommended · ' : ''}{h.stopped} of {n} would stop
                    </span>
                    {chosen && <span className="text-[10px] font-semibold uppercase text-teal">Your pick</span>}
                  </div>
                  <p className="mt-1 text-xs text-cream">“{h.hook}”</p>
                  {says && <p className="mt-1 text-[11px] italic text-stone">A viewer: “{says}”</p>}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

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
