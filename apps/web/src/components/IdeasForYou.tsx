// IDEAS FOR YOU — "post these next", written daily by the niche brain.
//
// ⚖️ ON TOP OF CREATE, NEVER IN ITS WAY. When there are no ideas (new account,
// brain still reading, a failed read) this renders nothing and Create looks
// exactly as it did. One tap fills the idea box; nothing is generated or spent
// until she presses the usual button.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface IdeaRow {
  id: string
  title: string
  premise: string
  mode: string | null
  goal: string | null
  why: string | null
  product_id: string | null
}

const MODE_LABEL: Record<string, string> = {
  educate: 'Educate', entertain: 'Entertain', teach: 'Teach', inspire: 'Inspire', sell: 'Sell',
}

export function IdeasForYou({ onPick }: { onPick: (idea: IdeaRow) => void }) {
  const [ideas, setIdeas] = useState<IdeaRow[]>([])
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const { data } = await supabase
          .from('creator_ideas')
          .select('id, title, premise, mode, goal, why, product_id, batch_day')
          .is('used_at', null)
          .is('dismissed_at', null)
          .order('batch_day', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(6)
        if (alive && Array.isArray(data)) setIdeas(data as IdeaRow[])
      } catch { /* no ideas is a normal state */ }
    })()
    return () => { alive = false }
  }, [])

  if (ideas.length === 0) return null

  const mark = (id: string, field: 'used_at' | 'dismissed_at') => {
    setIdeas((xs) => xs.filter((x) => x.id !== id))
    void supabase.from('creator_ideas').update({ [field]: new Date().toISOString() }).eq('id', id).then(() => {}, () => {})
  }

  return (
    <section aria-label="Ideas for you" className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone">Ideas for you</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {ideas.map((i) => (
          <li key={i.id} className="glass rounded-xl p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium leading-snug">{i.title}</p>
              <button
                type="button"
                aria-label={`Hide idea: ${i.title}`}
                onClick={() => mark(i.id, 'dismissed_at')}
                className="shrink-0 text-xs text-stone hover:text-cream"
              >
                ✕
              </button>
            </div>
            {i.why && <p className="mt-1 text-xs leading-relaxed text-stone">{i.why}</p>}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wide text-stone">
                {[i.mode ? MODE_LABEL[i.mode] ?? i.mode : null, i.goal].filter(Boolean).join(' · ')}
              </span>
              <button
                type="button"
                onClick={() => { mark(i.id, 'used_at'); onPick(i) }}
                className="text-sm underline underline-offset-2 hover:text-cream"
              >
                Use this idea
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
