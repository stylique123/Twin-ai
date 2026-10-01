// WHAT TWIN KNOWS — the library map of the niche brain, for the creator.
//
// ⚖️ READ-ONLY AND ADDITIVE. It shows what the brain has filed that is relevant
// to her: patterns from HER OWN posts (private notes), the strongest patterns
// in her niche, today's world moments for her niche, and the ideas written for
// her. Everything here is already what her scripts are built from, so the page
// is an honest window, not a separate feature. RLS decides what she can see.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listBrandVoices, nicheBucket, isPrivate } from '@twinai/shared'
import { supabase } from '../lib/supabase'
import { LearnedFromYou } from '../components/LearnedFromYou'

interface Note {
  id: string; kind: string; title: string; body: string | null; sub_niche: string | null; sources?: unknown
  times_seen: number; total_views: number | string; owner_id: string | null
}
interface Moment { name?: string; when?: string | null; angle?: string | null }
interface Topic { text: string; times_seen: number; covered: boolean }
interface OpenQuestion { id: string; kind: string; text: string; times_asked: number; likes: number; post_url: string | null }
interface MyProduct { id: string; name: string | null }
interface Mention { id: string; kind: string; title: string; outlet: string; url: string }
interface Shift { id: string; summary: string; earlier_text: string; later_text: string; earlier_at: string; later_at: string }

// ── YOUR TOPIC MAP (24-ideas #6): what she keeps coming back to, with how many
// of her videos said it, and whether she has already made the video. Read from
// her own knowledge (RLS: only her rows). A count is how many videos, never a
// score.
export function topicMap(rows: ReadonlyArray<{ kind: string; text: string; times_seen: number | null }>): Topic[] {
  const covered = rows.filter((r) => r.kind === 'covered').map((r) => r.text.toLowerCase())
  const seen = new Map<string, Topic>()
  for (const r of rows) {
    if (r.kind !== 'topic') continue
    const key = r.text.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    const words = key.split(/\s+/).filter((w) => w.length > 3)
    // ⚠️ AUDIT 2026-09-30: two near-identical "what you talk about" topics
    // showed side by side. A topic sharing most of its words with one already
    // listed is the same topic; the higher count stands.
    const twin = [...seen.values()].find((t) => {
      const tw = new Set(t.text.toLowerCase().split(/\s+/).filter((w) => w.length > 3))
      const shared = words.filter((w) => tw.has(w)).length
      return shared > 0 && shared / Math.min(words.length || 1, tw.size || 1) >= 0.6
    })
    if (twin) { twin.times_seen = Math.max(twin.times_seen, Math.max(1, Number(r.times_seen) || 1)); continue }
    seen.set(key, {
      text: r.text.trim(), times_seen: Math.max(1, Number(r.times_seen) || 1),
      covered: covered.some((c) => words.length > 0 && words.filter((w) => c.includes(w)).length >= Math.ceil(words.length / 2)),
    })
  }
  return [...seen.values()].sort((a, b) => b.times_seen - a.times_seen).slice(0, 16)
}

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

export default function WhatTwinKnows({ view = 'you' }: { view?: 'you' | 'niche' }) {
  const [bucket, setBucket] = useState<string | null>(null)
  const [subNiche, setSubNiche] = useState<string | null>(null)
  const [mine, setMine] = useState<Note[]>([])
  const [niche, setNiche] = useState<Note[]>([])
  const [captions, setCaptions] = useState<Record<string, string>>({})
  const [moments, setMoments] = useState<Moment[]>([])
  const [loaded, setLoaded] = useState(false)
  const [topics, setTopics] = useState<Topic[]>([])
  const [asked, setAsked] = useState<OpenQuestion[]>([])
  const [products, setProducts] = useState<MyProduct[]>([])
  const [drafts, setDrafts] = useState<Record<string, { answer: string; product: string }>>({})
  const [mentions, setMentions] = useState<Mention[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])

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
        const [own, shared, mom, know, qs, men, sh] = await Promise.all([
          supabase.from('brain_notes').select('id, kind, title, body, sub_niche, times_seen, total_views, owner_id, sources')
            .not('owner_id', 'is', null).order('total_views', { ascending: false }).limit(60),
          b ? supabase.from('brain_notes').select('id, kind, title, body, sub_niche, times_seen, total_views, owner_id')
            .is('owner_id', null).eq('bucket', b).order('times_seen', { ascending: false }).limit(90)
            : Promise.resolve({ data: [] as Note[] }),
          b ? supabase.from('brain_moments').select('moments, day').eq('bucket', b).order('day', { ascending: false }).limit(1)
            : Promise.resolve({ data: [] as { moments: Moment[] }[] }),
          supabase.from('creator_knowledge').select('kind, text, times_seen')
            .in('kind', ['topic', 'covered']).order('times_seen', { ascending: false }).limit(200),
          // ⚖️ OWNER BRIEF 2026-10-01: real comments under her posts, as CANDIDATES.
          // Nothing here reaches a script until she says it is real.
          supabase.from('comment_candidates').select('id, kind, text, times_asked, likes, post_url')
            .eq('status', 'found').order('times_asked', { ascending: false }).order('likes', { ascending: false }).limit(12),
          supabase.from('creator_mentions').select('id, kind, title, outlet, url')
            .eq('status', 'found').order('created_at', { ascending: false }).limit(6),
          supabase.from('creator_shifts').select('id, summary, earlier_text, later_text, earlier_at, later_at')
            .eq('status', 'found').order('created_at', { ascending: false }).limit(4),
        ])
        if (!alive) return
        // Private matter she marked off-limits is never listed as something to answer.
        setMine(((own.data ?? []) as Note[]).filter((n) => !isPrivate(`${n.title} ${n.body ?? ''}`)))
        // ⚠️ HER REAL WORDS, NOT ONLY THE PATTERN. A note like "[Thrifted/cheap
        // material] 🤝 [aesthetic upgrade]" read as invented; it came from her
        // caption "thrifted tiles 🤝 coffeebar backsplash". Show that caption.
        const ids = [...new Set(((own.data ?? []) as Note[]).flatMap((n) =>
          Array.isArray(n.sources) ? (n.sources as unknown[]).map(String) : []))].slice(0, 120)
        if (ids.length) {
          const { data: posts } = await supabase.from('scraped_posts').select('id, caption').in('id', ids)
          if (alive) setCaptions(Object.fromEntries(((posts ?? []) as Array<{ id: string; caption: string | null }>)
            .map((p) => [p.id, (p.caption ?? '').replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/#\S+/g, '').replace(/\s+/g, ' ').trim()])
            .filter(([, c]) => c)))
        }
        setNiche((shared.data ?? []) as Note[])
        const m = (mom.data ?? [])[0] as { moments?: Moment[] } | undefined
        setMoments(Array.isArray(m?.moments) ? m!.moments : [])
        setTopics(topicMap((know.data ?? []) as Array<{ kind: string; text: string; times_seen: number | null }>))
        setAsked((qs.data ?? []) as OpenQuestion[])
        if ((qs.data ?? []).length) {
          const { data: ps } = await supabase.from('product_entities').select('id, name').is('archived_at', null).limit(40)
          if (alive) setProducts(((ps ?? []) as MyProduct[]).filter((p) => p.name))
        }
        setMentions((men.data ?? []) as Mention[])
        setShifts((sh.data ?? []) as Shift[])
      } catch { /* an empty map is an honest answer */ }
      if (alive) setLoaded(true)
    })()
    return () => { alive = false }
  }, [])

  // One page now ("My Twin"); the old /brain/niche link lands on its second half.
  useEffect(() => {
    if (view === 'niche' && loaded) document.getElementById('around-you')?.scrollIntoView({ block: 'start' })
  }, [view, loaded])

  // She decides whether each one is her. Only a "yes" ever reaches a script.
  const decide = async (id: string, isMe: boolean) => {
    setMentions((m) => m.filter((x) => x.id !== id))
    await supabase.rpc('decide_mention', { p_id: id, p_is_me: isMe })
  }

  // She decides; only a "use it" is ever filed, with her answer and product if given.
  const decideComment = async (id: string, use: boolean) => {
    const d = drafts[id] ?? { answer: '', product: '' }
    setAsked((m) => m.filter((x) => x.id !== id))
    await supabase.rpc('decide_comment', { p_id: id, p_use: use, p_product: d.product || null, p_answer: d.answer.trim() || null })
  }

  const decideShift = async (id: string, isReal: boolean) => {
    setShifts((m) => m.filter((x) => x.id !== id))
    await supabase.rpc('decide_shift', { p_id: id, p_is_real: isReal })
  }
  const month = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })

  const byKind = useMemo(() => {
    const g = (rows: Note[]) => Object.fromEntries(KINDS.map((k) => [k, rows.filter((r) => r.kind === k)]))
    return { mine: g(mine), niche: g(niche) }
  }, [mine, niche])

  // ⚠️ AUDIT 2026-09-30: one caption was quoted as proof for six patterns,
  // each labelled "your post". A pattern now says how many of her posts it
  // rests on, and a caption is quoted under one pattern only.
  const postsLabel = (n: Note) => {
    const c = Array.isArray(n.sources) ? new Set((n.sources as unknown[]).map(String)).size : 0
    return c > 1 ? `from ${c} of your posts` : 'from 1 post'
  }
  const quoteFor = useMemo(() => {
    const used = new Set<string>()
    const out: Record<string, string> = {}
    for (const n of mine) {
      const ids = Array.isArray(n.sources) ? (n.sources as unknown[]).map(String) : []
      const id = ids.find((x) => captions[x] && !used.has(captions[x]!))
      if (id) { used.add(captions[id]!); out[n.id] = captions[id]! }
    }
    return out
  }, [mine, captions])

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
                    ({[hers ? postsLabel(n) : n.times_seen > 1 ? `seen in ${n.times_seen} other creators' videos` : null, views(n.total_views)].filter(Boolean).join(', ')})
                  </span>
                  {hers && (() => {
                    const said = quoteFor[n.id]
                    return said ? <span className="mt-0.5 block text-xs italic text-sand/80">You wrote: “{said.slice(0, 140)}”</span> : null
                  })()}
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
      <p className="eyebrow">What Twin knows</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">My Twin</h1>
      <p className="mt-2 max-w-2xl text-sm text-stone">
        First, what Twin learned from your own posts and answers — this is you. Then, further down, what is happening around you: ideas from other creators, never facts about you.
      </p>
      {!loaded && <p className="mt-8 text-sm text-stone">Loading…</p>}
      {loaded && mine.length === 0 && niche.length === 0 && moments.length === 0 && topics.length === 0 && (
        <p className="mt-8 text-sm text-stone">
          Twin is still reading. Check back soon — or <Link to="/v2" className="underline">make a script</Link> now.
        </p>
      )}
      {(
        <>
      {/* ⚠️ TWO KINDS OF KNOWLEDGE, NOW VISIBLY APART. Everything in "About
          you" is read from her own posts and answers; "Around you" is other
          creators and the calendar — ideas, never facts about her. */}
      <LearnedFromYou />
      {topics.length > 0 && (
        <section className="mt-8" data-testid="topic-map">
          <h2 className="font-display text-2xl tracking-tight">What you talk about</h2>
          <p className="mt-1 text-sm text-stone">From your own videos. The number is how many of them said it.</p>
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {topics.map((t) => (
              <li key={t.text} className="glass rounded-full px-3 py-1.5">
                {t.text}
                <span className="ml-1.5 text-xs text-stone">
                  {t.times_seen > 1 ? `${t.times_seen} videos` : '1 video'}{t.covered ? ' · already made' : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {asked.length > 0 && (
        <section className="mt-8" data-testid="open-questions">
          <h2 className="font-display text-2xl tracking-tight">What your audience asks</h2>
          <p className="mt-1 text-sm text-stone">Real comments under your posts. Nothing here is used until you say it is worth answering. Add your answer and Twin can build a video around it.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {asked.map((q) => {
              const d = drafts[q.id] ?? { answer: '', product: '' }
              const set = (patch: Partial<typeof d>) => setDrafts((m) => ({ ...m, [q.id]: { ...d, ...patch } }))
              return (
                <li key={q.id} className="glass rounded-xl p-3">
                  <p className="text-cream">“{q.text}”</p>
                  <p className="mt-0.5 text-xs text-stone">
                    {q.kind === 'request' ? 'A request' : 'A question'}{q.times_asked > 1 ? ` · asked ${q.times_asked} times` : ''}{q.likes > 0 ? ` · ${q.likes} likes` : ''}
                    {q.post_url ? <> · <a href={q.post_url} target="_blank" rel="noreferrer" className="underline">see post</a></> : null}
                  </p>
                  <input value={d.answer} maxLength={240} onChange={(e) => set({ answer: e.target.value })}
                    placeholder="Your answer (optional)" className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5" />
                  {products.length > 0 && (
                    <select value={d.product} onChange={(e) => set({ product: e.target.value })} aria-label="Which product is this about?"
                      className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5">
                      <option value="">Not about one product</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  )}
                  <span className="mt-2 flex gap-2">
                    <button onClick={() => void decideComment(q.id, true)} className="rounded border px-3 py-1">Use it</button>
                    <button onClick={() => void decideComment(q.id, false)} className="rounded px-3 py-1 text-stone">Not useful</button>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {shifts.length > 0 && (
        <section className="mt-8" data-testid="changed-your-mind">
          <h2 className="font-display text-2xl tracking-tight">Did your view change?</h2>
          <p className="mt-1 text-sm text-stone">From your own videos, months apart. A real change of mind makes a great story — only a yes is ever used.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {shifts.map((x) => (
              <li key={x.id} className="glass rounded-xl p-3">
                <p className="text-cream">{x.summary}</p>
                <p className="mt-1 text-xs text-stone">{month(x.earlier_at)}: “{x.earlier_text}”</p>
                <p className="text-xs text-stone">{month(x.later_at)}: “{x.later_text}”</p>
                <span className="mt-2 flex gap-2">
                  <button onClick={() => void decideShift(x.id, true)} className="rounded border px-3 py-1">Yes, I changed my mind</button>
                  <button onClick={() => void decideShift(x.id, false)} className="rounded px-3 py-1 text-stone">No</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {mentions.length > 0 && (
        <section className="mt-8" data-testid="found-you-elsewhere">
          <h2 className="font-display text-2xl tracking-tight">Is this you?</h2>
          <p className="mt-1 text-sm text-stone">Twin found these online. Nothing here is used until you say it is you.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {mentions.map((m) => (
              <li key={m.id} className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl p-3">
                <span>
                  <span className="text-xs uppercase tracking-wide text-stone">{m.kind}</span>{' '}
                  <a href={m.url} target="_blank" rel="noreferrer" className="underline">{m.title}</a>
                  <span className="text-stone"> · {m.outlet}</span>
                </span>
                <span className="flex gap-2">
                  <button onClick={() => void decide(m.id, true)} className="rounded border px-3 py-1">Yes, that's me</button>
                  <button onClick={() => void decide(m.id, false)} className="rounded px-3 py-1 text-stone">Not me</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {mine.length > 0 && section('Your patterns', byKind.mine, true)}
        </>
      )}
      {(
        <>
      <h2 id="around-you" className="mt-12 scroll-mt-6 border-t border-white/10 pt-8 font-display text-3xl tracking-tight">Around you</h2>
      <p className="mt-1 text-sm text-stone">What other creators{subNiche ? <> in <b>{subNiche}</b></> : null} and the world are doing. Ideas for your scripts — never facts about you or your business.</p>
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
      {niche.length > 0 && section('What works for other creators in your niche', byKind.niche, false)}
        </>
      )}
    </div>
  )
}
