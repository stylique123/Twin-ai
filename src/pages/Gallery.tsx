import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wand2, Eye, Heart, Play, Search, Plus, X, Trash2, Globe, Lock, Loader2,
} from 'lucide-react'
import { Aurora } from '../components/Aurora'
import { Reveal, Stagger, RevealItem, EASE } from '../components/motion'
import { Tilt } from '../components/Tilt'
import { useAuth } from '../context/AuthContext'
import { listGalleryItems, submitGalleryItem, deleteGalleryItem, type GalleryItem } from '../lib/api'
import { cn } from '../lib/cn'

type Niche = 'All' | 'Business' | 'Fitness' | 'Food' | 'Education' | 'Lifestyle'
const NICHES: Niche[] = ['All', 'Business', 'Fitness', 'Food', 'Education', 'Lifestyle']
const SUBMIT_NICHES = NICHES.filter((n) => n !== 'All') as Exclude<Niche, 'All'>[]
const PLATFORMS = ['TikTok', 'Reels', 'Shorts', 'YouTube'] as const

// Unified card the grid renders, whether the item is curated ("featured") or
// contributed by a user ("community").
interface Card {
  id: string
  niche: string
  platform: string
  label: string // format / type
  creator: string
  hook: string
  why: string
  reach: string
  loves: string
  accent: string
  poster: string
  url: string
  source: 'featured' | 'community'
  visibility?: 'public' | 'private'
  ownerId?: string | null
}

// --- curated seed (real public TikToks, real counts) -----------------------
const FEATURED: Omit<Card, 'source'>[] = [
  { id: 'f1', niche: 'Business', platform: 'TikTok', label: 'Reply → reframe → reassure', creator: 'GaryVee', hook: 'Answers a follower’s “what about me?” with a calm age-reframe and reassurance.', why: 'Uses a real comment as the cold open (instant relevance), then flips anxiety into perspective and lands on emotional relief — a loopable, share-because-it-helped structure.', reach: '32.2M', loves: '1.7M', accent: 'text-amber', poster: 'from-coral/35 via-ink2 to-ink', url: 'https://www.tiktok.com/@garyvee/video/7033061794172194053' },
  { id: 'f2', niche: 'Business', platform: 'TikTok', label: 'Aggressive motivational snippet', creator: 'GaryVee', hook: 'Provocative demographic call-out — “if you’re 35, you’re a baby.”', why: 'A counter-intuitive jab stops the scroll in <2s; a humble personal anecdote earns trust, then the comforting payoff loops back to the hook’s exact phrasing.', reach: '1.5M', loves: '111K', accent: 'text-teal', poster: 'from-teal/25 via-ink2 to-ink', url: 'https://www.tiktok.com/@garyvee/video/7528533857688243511' },
  { id: 'f3', niche: 'Fitness', platform: 'TikTok', label: 'Stitch callout → positivity', creator: 'Joey Swoll', hook: 'Reacts to a gym video, names the behavior, flips to a supportive lesson.', why: 'Borrowed footage gives instant context; the “I’m going to address this” framing creates an open loop, and the wholesome resolution drives comments and shares.', reach: '976K', loves: '157K', accent: 'text-coral', poster: 'from-coral/30 via-ink2 to-ink', url: 'https://www.tiktok.com/@thejoeyswoll/video/7649568372018941214' },
  { id: 'f4', niche: 'Food', platform: 'TikTok', label: 'Rapid pun gag', creator: 'Gordon Ramsay', hook: '“Boil ’em, mash ’em, stick ’em in a stew…” — instant, playful, fast.', why: 'Sub-12-second format with a familiar callback line and a celebrity cameo; the brevity itself maximizes completion rate and re-watches.', reach: '1.3M', loves: '262K', accent: 'text-amber', poster: 'from-amber/30 via-ink2 to-ink', url: 'https://www.tiktok.com/@gordonramsayofficial/video/7647208311900671234' },
  { id: 'f5', niche: 'Food', platform: 'TikTok', label: 'Comedic cook + reaction', creator: 'Lynja', hook: 'Hyper-edited cooking bit with punchy text overlays and sound design.', why: 'Jump-cut comedy keeps a beat every 1–2s so attention never resets; the personality + edits make a simple food clip endlessly re-watchable.', reach: '52M', loves: '1.8M', accent: 'text-teal', poster: 'from-amber/25 via-ink2 to-ink', url: 'https://www.tiktok.com/@cookingwithlynja/video/7322531619825257771' },
  { id: 'f6', niche: 'Education', platform: 'TikTok', label: 'Process reveal explainer', creator: 'Humphrey Yang', hook: 'Behind-the-scenes factory tour: how raw gold becomes products.', why: 'Curiosity-driven “how it’s made” framing with a clear visual payoff each step; satisfying, saveable, and easy to follow without sound.', reach: '4.3M', loves: '139K', accent: 'text-amber', poster: 'from-coral/25 via-ink2 to-ink', url: 'https://www.tiktok.com/@humphreytalks/video/7421658047539399967' },
  { id: 'f7', niche: 'Education', platform: 'TikTok', label: 'Authority insight clip', creator: 'Andrew Huberman', hook: '“What top performers do differently” — a single, specific takeaway.', why: 'Names a desirable outcome up front, delivers one concrete mechanism, and keeps it short — the format that makes expert clips feel actionable and saveable.', reach: '116K', loves: '3.9K', accent: 'text-teal', poster: 'from-teal/30 via-ink2 to-ink', url: 'https://www.tiktok.com/@hubermanlab/video/7591981806514162974' },
  { id: 'f8', niche: 'Lifestyle', platform: 'TikTok', label: 'Travel vlog micro-story', creator: 'Lynja', hook: 'Fast, funny day-in-Italy vlog with tight cuts and a payoff bit.', why: 'A mini narrative arc in under 20s — setup, escalation, punchline — with relentless pacing that rewards a full watch and a re-watch.', reach: '32.8M', loves: '923K', accent: 'text-coral', poster: 'from-coral/25 via-ink2 to-ink', url: 'https://www.tiktok.com/@cookingwithlynja/video/7322137035152706858' },
]

const POSTER_BY_NICHE: Record<string, { accent: string; poster: string }> = {
  Business: { accent: 'text-amber', poster: 'from-coral/30 via-ink2 to-ink' },
  Fitness: { accent: 'text-coral', poster: 'from-coral/25 via-ink2 to-ink' },
  Food: { accent: 'text-amber', poster: 'from-amber/30 via-ink2 to-ink' },
  Education: { accent: 'text-teal', poster: 'from-teal/30 via-ink2 to-ink' },
  Lifestyle: { accent: 'text-coral', poster: 'from-amber/25 via-ink2 to-ink' },
  Other: { accent: 'text-teal', poster: 'from-teal/25 via-ink2 to-ink' },
}

function fromDb(it: GalleryItem): Card {
  const skin = POSTER_BY_NICHE[it.niche] ?? POSTER_BY_NICHE.Other
  return {
    id: it.id,
    niche: it.niche,
    platform: it.platform,
    label: it.title || 'Community pick',
    creator: it.creator || 'creator',
    hook: it.title || it.url,
    why: it.why || 'Submitted by a TwinAI creator.',
    reach: it.reach || '—',
    loves: it.likes || '—',
    accent: skin.accent,
    poster: skin.poster,
    url: it.url,
    source: 'community',
    visibility: it.visibility,
    ownerId: it.owner_id,
  }
}

function reachNum(s: string): number {
  const m = s.trim().match(/^([\d.]+)\s*([KMB]?)/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase() as 'K' | 'M' | 'B'] ?? 1
  return n * mult
}

type Source = 'all' | 'featured' | 'community' | 'mine'

export default function Gallery() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const uid = session?.user?.id ?? null

  const [niche, setNiche] = useState<Niche>('All')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'top' | 'all'>('top')
  const [source, setSource] = useState<Source>('all')
  const [community, setCommunity] = useState<Card[]>([])
  const [showSubmit, setShowSubmit] = useState(false)

  useEffect(() => {
    listGalleryItems().then((items) => setCommunity(items.map(fromDb))).catch(() => setCommunity([]))
  }, [])

  const all: Card[] = useMemo(
    () => [...FEATURED.map((c) => ({ ...c, source: 'featured' as const })), ...community],
    [community],
  )

  const shown = useMemo(() => {
    let out = all
    if (source === 'featured') out = out.filter((c) => c.source === 'featured')
    else if (source === 'community') out = out.filter((c) => c.source === 'community')
    else if (source === 'mine') out = out.filter((c) => c.ownerId && c.ownerId === uid)
    out = out.filter((c) => niche === 'All' || c.niche === niche)
    if (q.trim()) {
      const needle = q.trim().toLowerCase()
      out = out.filter((c) => (c.label + c.hook + c.why + c.niche + c.creator).toLowerCase().includes(needle))
    }
    return sort === 'top' ? [...out].sort((a, b) => reachNum(b.reach) - reachNum(a.reach)) : out
  }, [all, source, niche, q, sort, uid])

  const remix = (c: Card) => navigate(`/app?ref=${encodeURIComponent(c.url)}`)

  const onDelete = async (c: Card) => {
    setCommunity((prev) => prev.filter((x) => x.id !== c.id))
    await deleteGalleryItem(c.id).catch(() => {})
  }

  const SOURCES: { id: Source; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'featured', label: 'Featured' },
    { id: 'community', label: 'Community' },
    { id: 'mine', label: 'Mine' },
  ]

  return (
    <main className="relative overflow-clip">
      <Aurora className="opacity-60" />
      <div className="relative mx-auto max-w-6xl px-5 py-12 lg:py-16">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Inspiration gallery</p>
              <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight sm:text-5xl">
                Proven formats, <span className="gradient-text">ready to remix.</span>
              </h1>
              <p className="mt-3 max-w-2xl text-sand">
                Featured viral picks + a growing community feed. Tap <span className="text-cream">Remix</span> to rebuild
                any one in your voice — or <span className="text-cream">post your own</span> (public or private).
              </p>
            </div>
            <button onClick={() => setShowSubmit(true)} className="btn-gradient shrink-0">
              <Plus className="h-4 w-4" /> Post to gallery
            </button>
          </div>
        </Reveal>

        {/* Source tabs */}
        <Reveal delay={0.04}>
          <div className="mt-7 flex rounded-card border border-white/10 bg-white/5 p-0.5 w-fit">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                onClick={() => setSource(s.id)}
                className={cn(
                  'rounded-[10px] px-4 py-1.5 text-sm font-medium transition-colors',
                  source === s.id ? 'bg-coral/20 text-cream' : 'text-stone hover:text-cream',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Reveal>

        {/* Controls */}
        <Reveal delay={0.06}>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {NICHES.map((n) => (
                <button
                  key={n}
                  onClick={() => setNiche(n)}
                  className={cn('chip transition-all duration-200', niche === n && 'border-coral/60 bg-coral/10 text-cream')}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-card border border-white/10 bg-white/5 p-0.5">
                {(['top', 'all'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSort(s)}
                    className={cn(
                      'rounded-[10px] px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                      sort === s ? 'bg-coral/20 text-cream' : 'text-stone hover:text-cream',
                    )}
                  >
                    {s === 'top' ? 'Top' : 'All'}
                  </button>
                ))}
              </div>
              <div className="relative sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone" />
                <input
                  className="field pl-9"
                  placeholder="Search niche or @creator…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            </div>
          </div>
        </Reveal>

        {/* Grid */}
        {shown.length === 0 ? (
          <div className="glass mt-10 grid place-items-center p-12 text-center text-sand">
            {source === 'mine'
              ? 'You haven’t posted anything yet — hit “Post to gallery”.'
              : 'Nothing matches that yet — try another filter or post your own.'}
          </div>
        ) : (
          <Stagger className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" gap={0.06}>
            {shown.map((c) => (
              <RevealItem key={c.id}>
                <Tilt max={6} className="h-full">
                  <div className="glass glass-hover flex h-full flex-col overflow-hidden">
                    <div className={cn('relative grid aspect-video place-items-center bg-gradient-to-br', c.poster)}>
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-ink/70 backdrop-blur">
                        <Play className="h-5 w-5 translate-x-0.5 text-cream" />
                      </span>
                      <span className="absolute left-3 top-3 rounded-full bg-ink/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-cream backdrop-blur">
                        {c.platform}
                      </span>
                      {c.source === 'community' && (
                        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-ink/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-teal backdrop-blur">
                          {c.visibility === 'private' ? <><Lock className="h-3 w-3" /> Private</> : <><Globe className="h-3 w-3" /> Community</>}
                        </span>
                      )}
                      <div className="absolute bottom-3 left-3 flex gap-3 text-[11px] text-cream/90">
                        <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {c.reach}</span>
                        <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {c.loves}</span>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn('text-xs font-bold uppercase tracking-wider', c.accent)}>{c.label}</span>
                        <span className="shrink-0 text-xs text-stone">@{c.creator}</span>
                      </div>
                      <p className="mt-2 font-heading leading-snug text-cream line-clamp-2">{c.hook}</p>
                      <p className="mt-2 flex-1 text-sm text-sand line-clamp-3">
                        <span className="text-stone">Why it works — </span>{c.why}
                      </p>
                      <div className="mt-4 flex gap-2">
                        <button onClick={() => remix(c)} className="btn-gradient flex-1">
                          <Wand2 className="h-4 w-4" /> Remix in my voice
                        </button>
                        {c.ownerId && c.ownerId === uid && (
                          <button
                            onClick={() => onDelete(c)}
                            title="Delete"
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-stone hover:border-coral/40 hover:text-coral"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </Tilt>
              </RevealItem>
            ))}
          </Stagger>
        )}

        <p className="mt-6 text-center text-[11px] text-stone">
          Featured counts are real public TikTok figures captured at curation time. Community items are creator-submitted.
        </p>
      </div>

      <AnimatePresence>
        {showSubmit && (
          <SubmitModal
            onClose={() => setShowSubmit(false)}
            onDone={(item) => {
              setCommunity((prev) => [fromDb(item), ...prev])
              setShowSubmit(false)
              setSource('mine')
            }}
          />
        )}
      </AnimatePresence>
    </main>
  )
}

// --- submit modal ----------------------------------------------------------
function SubmitModal({ onClose, onDone }: { onClose: () => void; onDone: (item: GalleryItem) => void }) {
  const [url, setUrl] = useState('')
  const [platform, setPlatform] = useState<string>('TikTok')
  const [niche, setNiche] = useState<string>('Business')
  const [creator, setCreator] = useState('')
  const [title, setTitle] = useState('')
  const [why, setWhy] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    setErr(null)
    if (!/^https?:\/\//i.test(url.trim())) return setErr('Paste a valid video link (https://…).')
    if (!title.trim()) return setErr('Add a short title / the hook line.')
    setBusy(true)
    try {
      const item = await submitGalleryItem({
        url: url.trim(),
        platform,
        niche,
        creator: creator.trim() || undefined,
        title: title.trim(),
        why: why.trim() || undefined,
        visibility,
      })
      onDone(item)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not post. Try again.')
      setBusy(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4 backdrop-blur"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.3, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        className="glass w-full max-w-lg rounded-panel p-6 sm:p-7"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Post to the gallery</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-stone">Share a viral reference or your own recreation. Recreatable by one click.</p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="eyebrow">Video link</label>
            <input className="field mt-2" placeholder="https://www.tiktok.com/@…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="eyebrow">Platform</label>
              <select className="field mt-2" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="eyebrow">Niche</label>
              <select className="field mt-2" value={niche} onChange={(e) => setNiche(e.target.value)}>
                {SUBMIT_NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="eyebrow">Creator (optional)</label>
              <input className="field mt-2" placeholder="@handle" value={creator} onChange={(e) => setCreator(e.target.value)} />
            </div>
            <div>
              <label className="eyebrow">Title / hook</label>
              <input className="field mt-2" placeholder="The hook in a line" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="eyebrow">Why it works (optional)</label>
            <textarea className="field mt-2 resize-none" rows={2} placeholder="What makes this format hit?" value={why} onChange={(e) => setWhy(e.target.value)} />
          </div>

          {/* visibility */}
          <div>
            <label className="eyebrow">Visibility</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['public', 'private'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  className={cn(
                    'flex items-center gap-2 rounded-card border p-3 text-left transition-all',
                    visibility === v ? 'border-coral/50 bg-coral/10 text-cream' : 'border-white/8 bg-white/[0.03] text-sand',
                  )}
                >
                  {v === 'public' ? <Globe className="h-4 w-4 text-teal" /> : <Lock className="h-4 w-4 text-amber" />}
                  <span className="text-sm">
                    <span className="block font-heading capitalize text-cream">{v}</span>
                    <span className="text-xs text-stone">{v === 'public' ? 'Everyone can see + remix' : 'Only you can see it'}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {err && <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{err}</p>}

          <button onClick={submit} disabled={busy} className="btn-gradient w-full">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Posting…</> : <><Plus className="h-4 w-4" /> Post to gallery</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
