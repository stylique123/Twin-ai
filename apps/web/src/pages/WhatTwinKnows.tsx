// WHAT TWIN KNOWS — the library map of the niche brain, for the creator.
//
// ⚖️ READ-ONLY AND ADDITIVE. It shows what the brain has filed that is relevant
// to her: patterns from HER OWN posts (private notes), the strongest patterns
// in her niche, today's world moments for her niche, and the ideas written for
// her. Everything here is already what her scripts are built from, so the page
// is an honest window, not a separate feature. RLS decides what she can see.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listBrandVoices, nicheBucket } from '@twinai/shared'
import { supabase } from '../lib/supabase'

interface Note {
  id: string; kind: string; title: string; body: string | null; sub_niche: string | null
  times_seen: number; total_views: number | string; owner_id: string | null
}
interface Moment { name?: string; when?: string | null; angle?: string | null }

const KIND_LABEL: Record<string, string> = {
  topic: 'Topics', hook: 'Openings that work', angle: 'How the argument runs',
  proof: 'Proof viewers believe', objection: 'Objections to answer', cta: 'How to close',
}
const KINDS = ['topic', 'hook', 'angle', 'proof', 'objection', 'cta'] as const

function views(v: number | string): string {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return ''
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M views` : n >= 1e3 ? `${Math.round(n / 1e3)}K views` : `${n} views`
}

export default function WhatTwinKnows() {
  const [bucket, setBucket] = useState<string | null>(null)
  const [subNiche, setSubNiche] = useState<string | null>(null)
  const [mine, setMine] = useState<Note[]>([])
  const [niche, setNiche] = useState<Note[]>([])
  const [moments, setMoments] = useState<Moment[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const voices = await listBrandVoices()
        const v = voices.find((x) => x.is_default) ?? voices[0]
        const p = (v?.profile ?? {}) as { niche?: string; sub_niche?: string }
        const b = nicheBucket(p.niche ?? '')
        if (!alive) return
        setBucket(b); setSubNiche(p.sub_niche ?? null)
        const [own, shared, mom] = await Promise.all([
          supabase.from('brain_notes').select('id, kind, title, body, sub_niche, times_seen, total_views, owner_id')
            .not('owner_id', 'is', null).order('total_views', { ascending: false }).limit(60),
          b ? supabase.from('brain_notes').select('id, kind, title, body, sub_niche, times_seen, total_views, owner_id')
            .is('owner_id', null).eq('bucket', b).order('times_seen', { ascending: false }).limit(90)
            : Promise.resolve({ data: [] as Note[] }),
          b ? supabase.from('brain_moments').select('moments, day').eq('bucket', b).order('day', { ascending: false }).limit(1)
            : Promise.resolve({ data: [] as { moments: Moment[] }[] }),
        ])
        if (!alive) return
        setMine((own.data ?? []) as Note[])
        setNiche((shared.data ?? []) as Note[])
        const m = (mom.data ?? [])[0] as { moments?: Moment[] } | undefined
        setMoments(Array.isArray(m?.moments) ? m!.moments : [])
      } catch { /* an empty map is an honest answer */ }
      if (alive) setLoaded(true)
    })()
    return () => { alive = false }
  }, [])

  const byKind = useMemo(() => {
    const g = (rows: Note[]) => Object.fromEntries(KINDS.map((k) => [k, rows.filter((r) => r.kind === k)]))
    return { mine: g(mine), niche: g(niche) }
  }, [mine, niche])

  const section = (title: string, rows: Record<string, Note[]>, hers: boolean) => (
    <section className="mt-8">
      <h2 className="font-display text-2xl tracking-tight">{title}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {KINDS.filter((k) => rows[k]?.length).map((k) => (
          <div key={k} className="glass rounded-xl p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-stone">{KIND_LABEL[k]}</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {rows[k].slice(0, 6).map((n) => (
                <li key={n.id}>
                  {n.title}
                  <span className="ml-1 text-xs text-stone">
                    ({[hers ? 'your post' : n.times_seen > 1 ? `seen in ${n.times_seen} videos` : null, views(n.total_views)].filter(Boolean).join(', ')})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <p className="eyebrow">Your brain</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">What Twin knows</h1>
      <p className="mt-2 max-w-2xl text-sm text-stone">
        Everything below is what your scripts are built from{subNiche ? <> — tuned to <b>{subNiche}</b></> : null}.
        It grows every day from your own posts, videos in your niche, and what is happening in the world.
      </p>
      {!loaded && <p className="mt-8 text-sm text-stone">Loading…</p>}
      {loaded && mine.length === 0 && niche.length === 0 && moments.length === 0 && (
        <p className="mt-8 text-sm text-stone">
          Twin is still reading. Check back soon — or <Link to="/v2" className="underline">make a script</Link> now.
        </p>
      )}
      {moments.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-2xl tracking-tight">Happening now{bucket ? ` in ${bucket.replace('_', ' & ')}` : ''}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {moments.slice(0, 6).map((m, i) => (
              <li key={i} className="glass rounded-xl p-3">
                <b>{m.name}</b>{m.when ? <span className="text-stone"> · {m.when}</span> : null}
                {m.angle && <p className="mt-1 text-stone">{m.angle}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {mine.length > 0 && section('From your own posts', byKind.mine, true)}
      {niche.length > 0 && section('What works in your niche', byKind.niche, false)}
    </div>
  )
}
