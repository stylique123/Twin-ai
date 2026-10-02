// WHAT TWIN LEARNED FROM YOU (0250). Every lesson the writer is given, with
// where it came from, so she can see her ratings working and switch off one
// that is wrong. Only the worker's learner writes lessons; she toggles them.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/cn'
import { groupLessons, GROUP_TITLE } from '../lib/lessonGroups'

interface Lesson {
  id: string; kind: string; text: string; phrase: string | null; source: string
  weight: number; heard: number; times_used: number; active: boolean
}

const FROM: Record<string, string> = {
  rating: 'your rating note', rating_tag: 'your rating tags', audience: 'your test viewers', hook_pick: 'a hook you picked', angle_pick: 'a direction you picked',
}

export function LearnedFromYou() {
  const [rows, setRows] = useState<Lesson[] | null>(null)
  // Lessons she had to correct AGAIN on a later script (0266): the writer had
  // the rule and did not follow it. Shown on the lesson, not buried.
  const [misses, setMisses] = useState<Record<string, number>>({})

  useEffect(() => {
    let alive = true
    void supabase.from('creator_lessons')
      .select('id, kind, text, phrase, source, weight, heard, times_used, active')
      .order('weight', { ascending: false }).limit(60)
      .then(({ data }) => { if (alive) setRows((data ?? []) as Lesson[]) }, () => { if (alive) setRows([]) })
    void supabase.from('lesson_misses').select('lesson_id').limit(500)
      .then(({ data }) => {
        if (!alive) return
        const m: Record<string, number> = {}
        for (const r of (data ?? []) as Array<{ lesson_id: string }>) m[r.lesson_id] = (m[r.lesson_id] ?? 0) + 1
        setMisses(m)
      }, () => {})
    return () => { alive = false }
  }, [])

  const toggle = async (l: Lesson) => {
    setRows((rs) => rs?.map((r) => (r.id === l.id ? { ...r, active: !l.active } : r)) ?? rs)
    const { error } = await supabase.from('creator_lessons').update({ active: !l.active }).eq('id', l.id)
    if (error) setRows((rs) => rs?.map((r) => (r.id === l.id ? { ...r, active: l.active } : r)) ?? rs)
  }

  if (rows === null) return null
  return (
    <section className="mt-8" data-testid="learned-from-you">
      <h2 className="font-display text-2xl tracking-tight">What Twin learned from you</h2>
      <p className="mt-1 text-sm text-stone">
        From your ratings, your test viewers and the hooks you pick. Every new script is written with the ones that are on.
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-stone">Nothing yet. Rate a script and say what you would change; Twin learns from it within a few minutes.</p>
      ) : (
        <div className="mt-3 space-y-5">
          {groupLessons(rows).map(({ group, items }) => (
            <div key={group} data-testid={`lesson-group-${group}`}>
              <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-stone">{GROUP_TITLE[group]}</h3>
              <ul className="mt-2 space-y-2">
                {items.slice(0, group === 'openings' ? 6 : 12).map((l) => (
                  <li key={l.id} className={cn('rounded-lg border px-3 py-2 text-sm', l.active ? 'border-white/12 text-cream' : 'border-white/5 text-stone')}>
                    <div className="flex items-start justify-between gap-3">
                      <span className={cn(!l.active && 'line-through')}>{l.shown}</span>
                      <button type="button" onClick={() => void toggle(l)} className="shrink-0 text-xs text-stone underline underline-offset-2 hover:text-cream">
                        {l.active ? 'Turn off' : 'Turn on'}
                      </button>
                    </div>
                    {(misses[l.id] ?? 0) > 0 && (
                      <span className="mt-1 block text-[12px] text-coral" data-testid="lesson-missed">
                        You had to correct this again {misses[l.id] === 1 ? 'once' : `${misses[l.id]} times`} after Twin learned it, so it now counts for more in every script, and the miss is flagged for review.
                      </span>
                    )}
                    <span className="mt-0.5 block text-[11px] text-stone">
                      From {FROM[l.source] ?? 'you'}{l.heard > 1 ? ` · heard ${l.heard}×` : ''}{l.times_used > 0 ? ` · used in ${l.times_used} script${l.times_used === 1 ? '' : 's'}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-[11px] text-stone">Twin's own rules — never invent a detail, a number or a quote you did not give — always apply and are not listed here.</p>
        </div>
      )}
    </section>
  )
}
