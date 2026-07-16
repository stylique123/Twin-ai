import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wand2, FileText, Clapperboard, Loader2, Play, Video, Plus, Pencil, Share, Eye, CalendarDays } from 'lucide-react'
import { listGenerations, signEditUrls, listPosts } from '../lib/api'
import type { Generation } from '../lib/types'
import { Aurora } from '../components/Aurora'
import { Reveal, Stagger, RevealItem } from '../components/motion'
import { cn } from '../lib/cn'

// "My videos" (mock parity): one card per creation, grouped by day, with an
// HONEST status derived from real data — Draft (script only), Ready (finished
// render exists), Published (a posted post row references it). There is no
// "Processing" filter because job state isn't stored on the generation row;
// an in-flight edit shows live progress on its own screen instead.
type Filter = 'all' | 'draft' | 'ready' | 'published'
type Status = 'draft' | 'ready' | 'published'

const STATUS_SKIN: Record<Status, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'border-white/15 bg-white/[0.06] text-sand' },
  ready: { label: 'Ready', cls: 'border-coral/40 bg-coral/10 text-coral' },
  published: { label: 'Published', cls: 'border-teal/40 bg-teal/10 text-teal' },
}

// Stale-while-revalidate caches across remounts: re-opening the library paints
// instantly from the last load while a fresh fetch revalidates in the background.
let GENERATIONS_CACHE: Generation[] | null = null
let URLS_CACHE: Record<string, string> = {}
let PUBLISHED_CACHE: Set<string> | null = null

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

export default function History() {
  const [items, setItems] = useState<Generation[]>(GENERATIONS_CACHE ?? [])
  const [loading, setLoading] = useState(GENERATIONS_CACHE === null)
  const [error, setError] = useState(false)
  const [urls, setUrls] = useState<Record<string, string>>(URLS_CACHE)
  const [published, setPublished] = useState<Set<string>>(PUBLISHED_CACHE ?? new Set())
  const [filter, setFilter] = useState<Filter>('all')

  // Pulled out so the error state can offer a real retry. A failed fetch must NOT
  // fall through to the empty state — a network blip would otherwise look exactly
  // like "you have no work yet" and scare a returning creator.
  const load = () => {
    if (GENERATIONS_CACHE === null) setLoading(true)
    setError(false)
    listGenerations()
      .then(async (gens) => {
        GENERATIONS_CACHE = gens
        setItems(gens)
        const paths = gens.flatMap((g) => [g.thumb_path, g.ai_thumb_path, g.edit_path].filter(Boolean) as string[])
        if (paths.length) {
          const signed = await signEditUrls(paths).catch(() => ({}))
          URLS_CACHE = { ...URLS_CACHE, ...signed }
          setUrls(URLS_CACHE)
        }
      })
      .catch(() => { if (GENERATIONS_CACHE === null) setError(true) })
      .finally(() => setLoading(false))
    // Published = a posted post row references the generation (best-effort).
    listPosts()
      .then((posts) => {
        PUBLISHED_CACHE = new Set(posts.filter((p) => p.status === 'posted' && p.generation_id).map((p) => p.generation_id as string))
        setPublished(PUBLISHED_CACHE)
      })
      .catch(() => {})
  }

  useEffect(() => { load() }, [])

  const statusOf = (g: Generation): Status =>
    published.has(g.id) ? 'published' : g.edit_path ? 'ready' : 'draft'

  const counts = useMemo(() => {
    const c = { all: items.length, draft: 0, ready: 0, published: 0 }
    for (const g of items) c[statusOf(g)]++
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, published])

  const displayed = items.filter((g) => filter === 'all' || statusOf(g) === filter)

  // Group by day, newest first (listGenerations is already newest-first).
  const groups = useMemo(() => {
    const out: { label: string; items: Generation[] }[] = []
    for (const g of displayed) {
      const label = dayLabel(g.created_at)
      const last = out[out.length - 1]
      if (last && last.label === label) last.items.push(g)
      else out.push({ label, items: [g] })
    }
    return out
  }, [displayed])

  const CHIPS: [Filter, string][] = [
    ['all', 'All'],
    ['draft', `Drafts${counts.draft ? ` (${counts.draft})` : ''}`],
    ['ready', `Ready${counts.ready ? ` (${counts.ready})` : ''}`],
    ['published', `Published${counts.published ? ` (${counts.published})` : ''}`],
  ]

  return (
    <main className="relative min-h-screen overflow-clip">
      <Aurora className="opacity-60" />
      <div className="relative mx-auto max-w-5xl px-5 py-10 lg:py-16">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl tracking-tight sm:text-5xl">My remixes</h1>
              <p className="mt-2 text-sm text-stone">Every remix you've made — drafts, ready to post, and published — in one place.</p>
            </div>
            <Link to="/app" className="btn-gradient">
              <Plus className="h-4 w-4" /> New video
            </Link>
          </div>
        </Reveal>

        {/* Status filter chips (mock parity). */}
        <Reveal delay={0.06}>
          <div className="mt-6 flex flex-wrap gap-2">
            {CHIPS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                  filter === key ? 'border-coral/60 bg-coral/10 text-cream' : 'border-white/10 bg-white/[0.03] text-stone hover:text-cream',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Reveal>

        {loading ? (
          <div className="mt-12 grid place-items-center text-sand">
            <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</span>
          </div>
        ) : error ? (
          <Reveal delay={0.1}>
            <div className="glass mt-10 grid place-items-center p-12 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-coral/15">
                <Video className="h-6 w-6 text-coral" />
              </span>
              <p className="mt-4 font-heading text-lg">Couldn't load your videos.</p>
              <p className="mt-1 text-sm text-stone">This is usually a brief connection hiccup — your work is safe.</p>
              <button onClick={load} className="btn-gradient mt-6">Try again</button>
            </div>
          </Reveal>
        ) : items.length === 0 ? (
          <Reveal delay={0.1}>
            <div className="glass mt-10 grid place-items-center p-12 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-signature-soft">
                <Wand2 className="h-6 w-6 text-cream" />
              </span>
              <p className="mt-4 font-heading text-lg">No remixes yet.</p>
              <p className="mt-1 text-sm text-stone">Paste a reference link and get your first one in ~30 seconds.</p>
              <Link to="/app" className="btn-gradient mt-6">Make your first one</Link>
            </div>
          </Reveal>
        ) : displayed.length === 0 ? (
          <div className="glass mt-10 grid place-items-center p-12 text-center text-sand">
            Nothing here yet — switch to “All” to see everything.
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {groups.map((group) => (
              <section key={group.label}>
                <h2 className="text-sm font-semibold text-stone">{group.label}</h2>
                <Stagger immediate className="mt-3 space-y-3" gap={0.04}>
                  {group.items.map((g) => {
                    const status = statusOf(g)
                    const skin = STATUS_SKIN[status]
                    const cover = (g.thumb_path && urls[g.thumb_path]) || (g.ai_thumb_path && urls[g.ai_thumb_path]) || undefined
                    const title = g.selected_hook || g.blueprint?.hook_options?.[0] || 'Untitled video'
                    const when = new Date(g.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                    return (
                      <RevealItem key={g.id}>
                        <div className="glass glass-hover flex gap-4 p-3.5 sm:p-4">
                          {/* Thumbnail */}
                          <Link to={`/result/${g.id}`} className="relative block h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-coral/20 via-ink2 to-ink sm:h-28 sm:w-44">
                            {cover ? (
                              <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                            ) : (
                              <div className="absolute inset-0 grid place-items-center"><Clapperboard className="h-6 w-6 text-amber/70" /></div>
                            )}
                            {status !== 'draft' && (
                              <span className="absolute inset-0 grid place-items-center">
                                <span className="grid h-9 w-9 place-items-center rounded-full bg-ink/60 ring-1 ring-white/25 backdrop-blur-sm"><Play className="h-4 w-4 translate-x-0.5 fill-cream text-cream" /></span>
                              </span>
                            )}
                          </Link>

                          {/* Body */}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link to={`/result/${g.id}`} className="min-w-0">
                                <h3 className="line-clamp-2 font-heading text-base leading-snug sm:text-lg">{title}</h3>
                              </Link>
                              <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold', skin.cls)}>{skin.label}</span>
                            </div>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-stone">
                              <CalendarDays className="h-3 w-3" /> {when}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {status === 'draft' ? (
                                <>
                                  <Link to={`/result/${g.id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.05] px-3.5 py-1.5 text-xs font-semibold text-cream hover:bg-white/10">
                                    <Pencil className="h-3 w-3" /> Edit
                                  </Link>
                                  <Link to={`/record/${g.id}`} className="btn-gradient !rounded-xl !px-3.5 !py-1.5 text-xs">
                                    <Video className="h-3 w-3" /> Record
                                  </Link>
                                </>
                              ) : (
                                <>
                                  <Link to={`/result/${g.id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.05] px-3.5 py-1.5 text-xs font-semibold text-cream hover:bg-white/10">
                                    <Eye className="h-3 w-3" /> View
                                  </Link>
                                  <Link to={`/result/${g.id}`} className="btn-gradient !rounded-xl !px-3.5 !py-1.5 text-xs">
                                    <Share className="h-3 w-3" /> {status === 'published' ? 'Share again' : 'Export'}
                                  </Link>
                                  <Link to={`/result/${g.id}`} className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-medium text-stone hover:text-cream">
                                    <FileText className="h-3 w-3" /> Script
                                  </Link>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </RevealItem>
                    )
                  })}
                </Stagger>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
