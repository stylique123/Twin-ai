import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays, Plus, Check, Trash2, ChevronLeft, ChevronRight, Loader2, X,
  Clapperboard, Video, Send, Clock,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { listPosts, listGenerations, schedulePost, markScheduledPosted, deletePost, type Post } from '../lib/api'
import type { Generation, Platform } from '../lib/types'
import { Aurora } from '../components/Aurora'
import { Reveal } from '../components/motion'
import { cn } from '../lib/cn'

const PLATFORM_SKIN: Record<string, string> = {
  tiktok: 'bg-cream/15 text-cream',
  instagram: 'bg-coral/15 text-coral',
  youtube: 'bg-[#FF4D4D]/15 text-[#FF6B6B]',
}
const ALL_PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Module-level stale-while-revalidate cache (matches Gallery/Library) so re-opening
// the calendar paints instantly instead of refetching.
let POSTS_CACHE: Post[] | null = null
let GENS_CACHE: Generation[] | null = null

const genTitle = (g: Generation) => g.selected_hook || g.blueprint?.hook_options?.[0] || 'Untitled script'

function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function sameDay(a: Date, b: Date) { return ymd(a) === ymd(b) }

export default function Calendar() {
  const { profile } = useAuth()
  const [posts, setPosts] = useState<Post[]>(POSTS_CACHE ?? [])
  const [gens, setGens] = useState<Generation[]>(GENS_CACHE ?? [])
  const [loading, setLoading] = useState(POSTS_CACHE === null)
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [composeFor, setComposeFor] = useState<Date | null>(null)

  // Which platforms this creator makes for (their DNA), else all three.
  const platforms = (profile?.dna?.platforms?.length ? profile.dna.platforms : ALL_PLATFORMS) as Platform[]

  const load = () => {
    if (POSTS_CACHE === null) setLoading(true)
    Promise.all([listPosts(), listGenerations().catch(() => [])])
      .then(([p, g]) => { POSTS_CACHE = p; GENS_CACHE = g; setPosts(p); setGens(g) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  // Scheduled posts keyed by day (yyyy-mm-dd) for fast calendar lookup.
  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>()
    for (const p of posts) {
      const when = p.scheduled_for ?? p.posted_at
      if (!when) continue
      const k = ymd(new Date(when))
      m.set(k, [...(m.get(k) ?? []), p])
    }
    return m
  }, [posts])

  const upcoming = useMemo(
    () => posts
      .filter((p) => p.status === 'scheduled' && p.scheduled_for)
      .sort((a, b) => +new Date(a.scheduled_for!) - +new Date(b.scheduled_for!)),
    [posts],
  )

  // Build the month grid (leading blanks so the 1st lands on the right weekday).
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    const lead = first.getDay()
    const out: (Date | null)[] = Array.from({ length: lead }, () => null)
    for (let d = 1; d <= days; d++) out.push(new Date(cursor.getFullYear(), cursor.getMonth(), d))
    return out
  }, [cursor])

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const today = new Date()

  const refresh = () => { POSTS_CACHE = null; load() }

  return (
    <main className="relative min-h-screen overflow-clip">
      <Aurora className="opacity-60" />
      <div className="relative mx-auto max-w-5xl px-5 py-12 lg:py-16">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Publishing</p>
              <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">Content calendar</h1>
              <p className="mt-2 max-w-md text-sm text-stone">
                Schedule your finished videos across platforms, see your week and month at a glance, and never miss a posting day.
              </p>
            </div>
            <button onClick={() => setComposeFor(new Date())} className="btn-gradient">
              <Plus className="h-4 w-4" /> Schedule a post
            </button>
          </div>
        </Reveal>

        {/* Connected platforms */}
        <Reveal delay={0.05}>
          <section className="glass mt-8 p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow !text-sand">Your platforms</p>
              <span className="text-[11px] text-stone">One-click auto-post is coming. For now we hold each post ready so you publish on time.</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {ALL_PLATFORMS.map((p) => {
                const active = platforms.includes(p)
                return (
                  <span key={p} className={cn('inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm', active ? 'border-teal/40 bg-teal/[0.06] text-cream' : 'border-white/10 bg-white/[0.02] text-stone')}>
                    <span className={cn('h-2 w-2 rounded-full', active ? 'bg-teal' : 'bg-white/25')} />
                    {cap(p)}
                    <span className="text-[10px] uppercase tracking-wider text-stone">{active ? 'Active' : 'Add in settings'}</span>
                  </span>
                )
              })}
            </div>
          </section>
        </Reveal>

        {/* Month calendar */}
        <Reveal delay={0.1}>
          <section className="glass mt-5 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg text-cream">{monthLabel}</h2>
              <div className="flex items-center gap-1">
                <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-stone hover:text-cream"><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)) }} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-sand hover:text-cream">Today</button>
                <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-stone hover:text-cream"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-1.5">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={i} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-stone">{d}</div>
              ))}
              {cells.map((d, i) => {
                if (!d) return <div key={i} />
                const dayPosts = byDay.get(ymd(d)) ?? []
                const isToday = sameDay(d, today)
                const isPast = d < new Date(today.getFullYear(), today.getMonth(), today.getDate())
                return (
                  <button
                    key={i}
                    onClick={() => setComposeFor(d)}
                    className={cn(
                      'group flex min-h-[68px] flex-col rounded-lg border p-1.5 text-left transition-colors sm:min-h-[84px]',
                      isToday ? 'border-amber/40 bg-amber/[0.04]' : 'border-white/8 bg-white/[0.01] hover:border-white/16 hover:bg-white/[0.03]',
                      isPast && 'opacity-55',
                    )}
                  >
                    <span className={cn('text-[11px] font-semibold', isToday ? 'text-amber' : 'text-sand')}>{d.getDate()}</span>
                    <div className="mt-1 space-y-1">
                      {dayPosts.slice(0, 2).map((p) => (
                        <span key={p.id} className={cn('block truncate rounded px-1 py-0.5 text-[9px] font-medium', PLATFORM_SKIN[p.platform] ?? 'bg-white/10 text-sand')}>
                          {p.status === 'posted' ? '✓ ' : ''}{cap(p.platform)}
                        </span>
                      ))}
                      {dayPosts.length > 2 && <span className="block px-1 text-[9px] text-stone">+{dayPosts.length - 2} more</span>}
                    </div>
                    <Plus className="mt-auto h-3 w-3 self-end text-stone opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                )
              })}
            </div>
          </section>
        </Reveal>

        {/* Upcoming list */}
        <Reveal delay={0.15}>
          <section className="mt-5">
            <h2 className="font-heading text-lg text-cream">Upcoming</h2>
            {loading ? (
              <div className="mt-4 inline-flex items-center gap-2 text-sand"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : upcoming.length === 0 ? (
              <div className="glass mt-4 grid place-items-center p-10 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-signature-soft"><CalendarDays className="h-5 w-5 text-cream" /></span>
                <p className="mt-3 font-heading">Nothing scheduled yet.</p>
                <p className="mt-1 text-sm text-stone">Pick a day above, or schedule your first post from a finished video.</p>
                <button onClick={() => setComposeFor(new Date())} className="btn-gradient mt-5"><Plus className="h-4 w-4" /> Schedule a post</button>
              </div>
            ) : (
              <div className="mt-4 space-y-2.5">
                {upcoming.map((p) => {
                  const g = gens.find((x) => x.id === p.generation_id)
                  return (
                    <div key={p.id} className="glass flex items-center gap-3 p-3.5">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5">
                        {g?.edit_path ? <Video className="h-5 w-5 text-teal" /> : <Clapperboard className="h-5 w-5 text-amber" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-cream">{g ? genTitle(g) : (p.caption ?? 'Scheduled post')}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-stone">
                          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', PLATFORM_SKIN[p.platform] ?? 'bg-white/10 text-sand')}>{cap(p.platform)}</span>
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(p.scheduled_for!).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        </div>
                      </div>
                      <button onClick={async () => { await markScheduledPosted(p.id); refresh() }} title="Mark as posted" className="btn-ghost text-xs"><Check className="h-3.5 w-3.5" /> Posted</button>
                      <button onClick={async () => { await deletePost(p.id); refresh() }} title="Remove" className="grid h-8 w-8 place-items-center rounded-lg text-stone hover:bg-white/5 hover:text-coral"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </Reveal>
      </div>

      {composeFor && (
        <ScheduleModal
          day={composeFor}
          gens={gens}
          platforms={platforms}
          onClose={() => setComposeFor(null)}
          onScheduled={() => { setComposeFor(null); refresh() }}
        />
      )}
    </main>
  )
}

/* ─── Schedule modal ─────────────────────────────────────────────────── */

function ScheduleModal({ day, gens, platforms, onClose, onScheduled }: {
  day: Date
  gens: Generation[]
  platforms: Platform[]
  onClose: () => void
  onScheduled: () => void
}) {
  const [genId, setGenId] = useState<string>(gens[0]?.id ?? '')
  const [platform, setPlatform] = useState<Platform>(platforms[0] ?? 'tiktok')
  const [date, setDate] = useState(ymd(day))
  const [time, setTime] = useState('18:00')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const selected = gens.find((g) => g.id === genId)
  // Prefill the caption from the script's publish plan for the chosen platform.
  const caption = selected?.blueprint?.publish_plan?.find((pp) => pp.platform === platform)?.caption
    ?? selected?.blueprint?.publish_plan?.[0]?.caption ?? ''

  const save = async () => {
    if (!genId) { setErr('Pick a video to schedule.'); return }
    setBusy(true); setErr(null)
    try {
      const scheduledFor = new Date(`${date}T${time}:00`).toISOString()
      await schedulePost({ generationId: genId, platform, scheduledFor, caption })
      onScheduled()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not schedule. Try again.')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/85 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass relative max-h-[88vh] w-full max-w-lg overflow-y-auto p-6 sm:p-7" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-stone hover:bg-white/5 hover:text-cream"><X className="h-4 w-4" /></button>
        <h2 className="font-display text-2xl tracking-tight">Schedule a post</h2>
        <p className="mt-1 text-sm text-stone">Pick a finished video, a platform and a time.</p>

        {gens.length === 0 ? (
          <div className="mt-6 rounded-card border border-white/8 bg-white/[0.02] p-6 text-center">
            <p className="text-sm text-sand">You don't have any videos yet.</p>
            <Link to="/app" className="btn-gradient mt-4 inline-flex">Make your first one</Link>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div>
              <label className="eyebrow mb-1.5 block">Video from your library</label>
              <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-card border border-white/8 bg-ink/30 p-1.5">
                {gens.map((g, i) => (
                  <button
                    key={g.id}
                    onClick={() => setGenId(g.id)}
                    className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors', g.id === genId ? 'bg-white/[0.07]' : 'hover:bg-white/[0.03]')}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/5 text-[11px] font-bold text-stone">{i + 1}</span>
                    {g.edit_path ? <Video className="h-4 w-4 shrink-0 text-teal" /> : <Clapperboard className="h-4 w-4 shrink-0 text-amber" />}
                    <span className="min-w-0 flex-1 truncate text-sm text-cream">{genTitle(g)}</span>
                    {g.id === genId && <Check className="h-4 w-4 shrink-0 text-teal" />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="eyebrow mb-1.5 block">Account</label>
              <div className="flex flex-wrap gap-2">
                {ALL_PLATFORMS.map((p) => (
                  <button key={p} onClick={() => setPlatform(p)} className={cn('chip capitalize', p === platform ? 'border-coral/60 bg-coral/10 text-cream' : 'hover:border-white/20 hover:text-cream', !platforms.includes(p) && 'opacity-60')}>
                    {p === platform && <Check className="h-3.5 w-3.5 text-coral" />} {cap(p)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="eyebrow mb-1.5 block">Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
              </div>
              <div>
                <label className="eyebrow mb-1.5 block">Time</label>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="field" />
              </div>
            </div>

            {caption && (
              <div className="rounded-card border border-white/8 bg-white/[0.02] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-stone">Caption (from your script)</p>
                <p className="mt-1 line-clamp-2 text-sm text-sand">{caption}</p>
              </div>
            )}

            {err && <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{err}</p>}

            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className="btn-gradient flex-1">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Schedule
              </button>
              <button onClick={onClose} className="btn-ghost">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
