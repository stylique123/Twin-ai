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
  /** What the viewers changed before she saw it (null on older tests). */
  /** Owner audit 2026-10-01: what worked, what only she can answer, what her facts do not back. */
  working?: Array<{ what: string; why: string; beat: number }>
  needs_her?: Array<{ question: string; why: string; beat: number; answer?: string; applied_at?: string | null; applied?: boolean }>
  unverified?: string[]
  out_of_scope?: number
  improved?: {
    before: { best: number; watched: number }
    after: { best: number; watched: number }
    hooks_added: number
    lines: Array<{ line: number; before: string; after: string }>
  } | null
}

const POLL_MS = 4000
// Hooks, then lines, each re-tested on the same viewers: allow for it.
export const GIVE_UP_MS = 180_000

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
/** Mirrors HOOKS_SHOWN in worker/src/nicheBrain/audienceParse.ts. */
export const HOOKS_SHOWN = 5

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
  // Quality over quantity (owner, 2026-09-28): only the best HOOKS_SHOWN are
  // listed; the rest were tested and lost, so they stay out of her way.
  byScore.filter((h) => !hidden.has(h)).slice(HOOKS_SHOWN).forEach((h) => hidden.add(h))
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
        .select('status, panel_size, hooks, best_hook, viewers, fixes, summary, panel_voice_id, improved, working, needs_her, unverified, out_of_scope')
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

const KIND_LABEL: Record<string, string> = {
  loyal_fan: 'Loyal fan', buyer: 'Buyer', sceptic: 'Sceptic', cold_scroller: 'New viewer', learner: 'Learner', peer: 'Peer in your trade',
}
interface PanelPersona { who: string; about: string; kind?: string | null; watches?: string[] }

/** Who the viewers are, in plain words (owner audit 2026-10-01: "who are the 10, actually?"). */
function usePanel(voiceId: string | null) {
  const [personas, setPersonas] = useState<PanelPersona[]>([])
  useEffect(() => {
    if (!voiceId) return
    let alive = true
    void supabase.from('audience_panels').select('personas').eq('voice_id', voiceId).maybeSingle()
      .then(({ data }) => { if (alive && Array.isArray(data?.personas)) setPersonas(data.personas as PanelPersona[]) }, () => {})
    return () => { alive = false }
  }, [voiceId])
  return personas
}

/** One question the viewers say only she can answer; her answer is written into the line. */
function AnswerCard({ generationId, index, q }: { generationId: string; index: number; q: NonNullable<Test['needs_her']>[number] }) {
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>(q.answer ? 'saved' : 'idle')
  const save = async () => {
    if (!text.trim()) return
    setState('saving')
    const { data, error } = await supabase.rpc('answer_panel_question', { p_generation: generationId, p_index: index, p_answer: text.trim() })
    setState(!error && data === true ? 'saved' : 'error')
  }
  return (
    <li className="rounded-lg border border-amber/30 p-2.5 text-xs" data-testid="panel-question">
      <p className="font-semibold text-cream">{q.question}</p>
      <p className="mt-0.5 text-[11px] text-stone">{q.why}{q.beat >= 0 ? ` (line ${q.beat + 1})` : ''}</p>
      {state === 'saved'
        ? <p className="mt-1.5 text-[11px] text-teal">{q.applied_at ? (q.applied ? 'Written into your script.' : 'Saved to what Twin knows about you.') : 'Saved. Twin is writing it into your script.'}</p>
        : (
          <div className="mt-1.5 flex gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={240} placeholder="Your answer, in your own words"
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs text-cream" />
            <button type="button" onClick={() => void save()} disabled={state === 'saving' || !text.trim()}
              className="rounded-md bg-teal px-2.5 py-1 text-[11px] font-semibold text-black disabled:opacity-40">Save</button>
          </div>
        )}
      {state === 'error' && <p className="mt-1 text-[11px] text-coral">That did not save. Try again.</p>}
    </li>
  )
}

/** The viewers' notes. Hook scores live on the hook picker itself now, so the
 *  audience informs the choice instead of following it. */
export function TestViewers({ generationId }: { generationId: string }) {
  const { test, waiting } = useAudienceTest(generationId)
  const [open, setOpen] = useState(false)
  const personas = usePanel(test?.panel_voice_id ?? null)

  if (!test) {
    return waiting
      ? <p className="text-xs text-stone">Testing this script on viewers like yours…</p>
      : null
  }
  if (test.status !== 'done' || test.viewers.length === 0) return null

  const n = test.panel_size ?? test.viewers.length
  // ⚠️ AUDIT 2026-09-30: the useful part was buried under a dense paragraph.
  // Lead with the two things she acts on: how the best hook scored, and the
  // one line most worth fixing. The method note and the rest sit behind a tap.
  const bestStopped = Math.max(0, ...test.hooks.map((h) => h.stopped))
  const topFix = [...test.fixes].sort((a, b) => b.count - a.count)[0] ?? null
  const otherFixes = topFix ? test.fixes.filter((f) => f !== topFix) : test.fixes

  const questions = test.needs_her ?? []
  const working = test.working ?? []
  const unverified = test.unverified ?? []

  return (
    <div className="space-y-5" data-testid="test-viewers">
      {questions.length > 0 && (
        <div className="space-y-2" data-testid="panel-questions">
          <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-amber">Before you film: only you know this</h3>
          <ul className="space-y-2">
            {questions.map((q, i) => <AnswerCard key={i} generationId={generationId} index={i} q={q} />)}
          </ul>
        </div>
      )}
      <div className="space-y-2" data-testid="test-viewers-lead">
        {test.hooks.length > 0 && (
          <p className="font-heading text-sm text-cream">
            Your best hook stopped <span className="font-semibold text-teal">{bestStopped} of {n}</span> test viewers.
          </p>
        )}
        {topFix && (
          <p className="text-xs text-sand leading-relaxed">
            <span className="font-semibold text-coral">The one line to fix{topFix.beat >= 0 ? ` (line ${topFix.beat + 1})` : ''}: </span>
            {topFix.fix}
          </p>
        )}
      </div>

      <details className="group">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-teal">How this was tested</summary>
      <p className="mt-2 text-[11px] text-stone">
        {test.panel_voice_id
          ? `Twin tested this on your ${n} regular viewers, built from how your real posts performed.`
          : `Twin tested this on ${n} viewers like yours.`}
        {test.improved && (test.improved.hooks_added > 0 || test.improved.lines.length > 0) && (
          <>{' '}Before showing it to you, Twin rewrote {[
            test.improved.hooks_added > 0 ? `${test.improved.hooks_added} hook${test.improved.hooks_added === 1 ? '' : 's'}` : '',
            test.improved.lines.length > 0 ? `${test.improved.lines.length} line${test.improved.lines.length === 1 ? '' : 's'}` : '',
          ].filter(Boolean).join(' and ')} and re-tested: best hook {test.improved.before.best} → {test.improved.after.best} of {n} stopped, {test.improved.before.watched} → {test.improved.after.watched} of {n} watched to the end.</>
        )}
        {(test.out_of_scope ?? 0) > 0 && <>{' '}{test.out_of_scope} of your viewers only watch other kinds of your videos, so they were left out of this score.</>}
        {' '}Twin plays them, so treat it as a practice audience, not a promise. Their hook scores are on the hooks above. They judge whether people stay past the opening; numbers in the rest of the script are checked separately against what you gave Twin.
      </p>
      </details>

      {personas.length > 0 && (
        <details className="group" data-testid="panel-who">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-teal">Who your {personas.length} test viewers are</summary>
          <ul className="mt-2 space-y-1.5">
            {personas.map((p, i) => (
              <li key={i} className="text-[11px] text-sand leading-relaxed">
                <span className="font-semibold text-cream">{p.who}</span>
                {p.kind && KIND_LABEL[p.kind] && <span className="text-stone"> · {KIND_LABEL[p.kind]}</span>}
                {' '}— {p.about}
              </li>
            ))}
          </ul>
        </details>
      )}

      {working.length > 0 && (
        <div className="space-y-2" data-testid="panel-working">
          <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">What's working</h3>
          <ul className="space-y-2">
            {working.map((w, i) => (
              <li key={i} className="text-xs text-sand leading-relaxed">
                {w.beat >= 0 && <span className="text-stone">Line {w.beat + 1}: </span>}
                <span className="text-cream">{w.what}</span> — {w.why}
              </li>
            ))}
          </ul>
        </div>
      )}

      {unverified.length > 0 && (
        <p className="text-[11px] text-coral leading-relaxed" data-testid="panel-unverified">
          Not backed by anything you told Twin, so the viewers gave it no credit: {unverified.map((u) => `“${u}”`).join(', ')}. Keep it only if it is true.
        </p>
      )}

      {otherFixes.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Also flagged</h3>
          <ul className="space-y-2">
            {otherFixes.map((f, i) => (
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
