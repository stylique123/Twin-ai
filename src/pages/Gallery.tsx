import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wand2, Eye, Heart, Play, Search } from 'lucide-react'
import { Aurora } from '../components/Aurora'
import { Reveal, Stagger, RevealItem } from '../components/motion'
import { Tilt } from '../components/Tilt'
import { useAuth } from '../context/AuthContext'
import { listGalleryItems, listBrandVoices, type GalleryItem } from '../lib/api'
import { cn } from '../lib/cn'

// Base niches we always seed the filter with. The live list GROWS beyond these
// as discovery brings in items tagged with new niches (see `nicheChips`).
const BASE_NICHES = ['Business', 'Fitness', 'Food', 'Education', 'Lifestyle', 'Beauty']

// A creator's real niche is almost never one of the bucket names ("Gen Z lifestyle
// and relatable comedy", "luxury resale", "virtual try-on for fashion brands"). We
// score their free-text niche against these keyword signals and pick the closest
// bucket, so the gallery opens on something RELEVANT instead of falling back to All.
const NICHE_SIGNALS: Record<string, string[]> = {
  Business: ['business', 'entrepreneur', 'founder', 'startup', 'marketing', 'sales', 'money', 'finance', 'ecommerce', 'e-commerce', 'commerce', 'agency', 'saas', 'b2b', 'resale', 'luxury', 'retail', 'shopify', 'returns', 'conversion', 'sell'],
  Fitness: ['fitness', 'gym', 'workout', 'health', 'wellness', 'nutrition', 'training', 'athlete', 'yoga', 'run', 'lifting', 'weight'],
  Food: ['food', 'recipe', 'cook', 'chef', 'baking', 'restaurant', 'meal', 'kitchen', 'snack'],
  Education: ['education', 'learn', 'tutorial', 'explain', 'teach', 'science', 'history', 'study', 'how to', 'coding', 'developer', 'tech', 'software'],
  Lifestyle: ['lifestyle', 'vlog', 'travel', 'comedy', 'relatable', 'gen z', 'genz', 'funny', 'day in the life', 'routine', 'aesthetic', 'mom', 'dating', 'creator'],
  Beauty: ['beauty', 'makeup', 'skincare', 'skin', 'cosmetic', 'hair', 'nails', 'glow', 'try-on', 'try on', 'virtual try', 'fashion', 'style', 'outfit', 'wardrobe', 'grwm'],
}

// Natural neighbors: when the creator's own niche is sparse, surface these next so
// the feed stays on-topic instead of going random. (The "related to my niche" ask.)
const RELATED_NICHE: Record<string, string[]> = {
  Business: ['Education', 'Lifestyle'],
  Fitness: ['Lifestyle', 'Beauty'],
  Food: ['Lifestyle', 'Education'],
  Education: ['Business', 'Lifestyle'],
  Lifestyle: ['Beauty', 'Business'],
  Beauty: ['Lifestyle', 'Fitness'],
}

// Resolve a creator's free-text niche to the closest KNOWN gallery niche: exact
// bucket name, else best keyword-signal score, else loose substring.
function resolveNiche(userNiche: string, known: string[]): string {
  const u = userNiche.trim().toLowerCase()
  if (!u) return ''
  const exact = known.find((n) => n.toLowerCase() === u)
  if (exact) return exact
  let best = ''
  let bestScore = 0
  for (const n of known) {
    const sig = NICHE_SIGNALS[n] ?? [n.toLowerCase()]
    // Longer keyword hits win, so a specific signal beats a generic one.
    const score = sig.reduce((s, k) => s + (u.includes(k) ? k.length : 0), 0)
    if (score > bestScore) { bestScore = score; best = n }
  }
  if (best) return best
  return known.find((n) => u.includes(n.toLowerCase()) || n.toLowerCase().includes(u)) ?? ''
}

interface Card {
  id: string; niche: string; platform: string; label: string; creator: string
  hook: string; why: string; reach: string; loves: string; accent: string; poster: string; url: string
}

const FEATURED: Card[] = [
  { id: 'f1', niche: 'Business', platform: 'TikTok', label: 'Reply, reframe, reassure', creator: 'GaryVee', hook: 'Answers a follower’s “what about me?” with a calm age-reframe.', why: 'Uses a real comment as the cold open for instant relevance, flips anxiety into perspective. A loopable, share-because-it-helped structure.', reach: '32.2M', loves: '1.7M', accent: 'text-amber', poster: 'from-coral/35 via-ink2 to-ink', url: 'https://www.tiktok.com/@garyvee/video/7033061794172194053' },
  { id: 'f2', niche: 'Business', platform: 'TikTok', label: 'Aggressive motivational snippet', creator: 'GaryVee', hook: 'Provocative call-out: “if you’re 35, you’re a baby.”', why: 'A counter-intuitive jab stops the scroll fast. A humble anecdote earns trust, then the comforting payoff loops back to the hook line.', reach: '1.5M', loves: '111K', accent: 'text-teal', poster: 'from-teal/25 via-ink2 to-ink', url: 'https://www.tiktok.com/@garyvee/video/7528533857688243511' },
  { id: 'f3', niche: 'Fitness', platform: 'TikTok', label: 'Stitch callout to positivity', creator: 'Joey Swoll', hook: 'Reacts to a gym video, names the behavior, flips to a supportive lesson.', why: 'Borrowed footage gives instant context. The framing opens a loop, and the wholesome resolution drives comments and shares.', reach: '976K', loves: '157K', accent: 'text-coral', poster: 'from-coral/30 via-ink2 to-ink', url: 'https://www.tiktok.com/@thejoeyswoll/video/7649568372018941214' },
  { id: 'f4', niche: 'Food', platform: 'TikTok', label: 'Rapid pun gag', creator: 'Gordon Ramsay', hook: '“Boil ’em, mash ’em, stick ’em in a stew.” Instant, playful, fast.', why: 'A sub-12-second format with a familiar callback line. Brevity itself maximizes completion rate and re-watches.', reach: '1.3M', loves: '262K', accent: 'text-amber', poster: 'from-amber/30 via-ink2 to-ink', url: 'https://www.tiktok.com/@gordonramsayofficial/video/7647208311900671234' },
  { id: 'f5', niche: 'Food', platform: 'TikTok', label: 'Comedic cook and reaction', creator: 'Lynja', hook: 'Hyper-edited cooking bit with punchy text overlays and sound design.', why: 'Jump-cut comedy keeps a beat every 1-2 seconds so attention never resets. The personality makes a simple food clip endlessly re-watchable.', reach: '52M', loves: '1.8M', accent: 'text-teal', poster: 'from-amber/25 via-ink2 to-ink', url: 'https://www.tiktok.com/@cookingwithlynja/video/7322531619825257771' },
  { id: 'f6', niche: 'Education', platform: 'TikTok', label: 'Process reveal explainer', creator: 'Humphrey Yang', hook: 'Behind-the-scenes factory tour: how raw gold becomes products.', why: 'Curiosity-driven framing with a clear visual payoff each step. Satisfying, saveable, and easy to follow without sound.', reach: '4.3M', loves: '139K', accent: 'text-amber', poster: 'from-coral/25 via-ink2 to-ink', url: 'https://www.tiktok.com/@humphreytalks/video/7421658047539399967' },
  { id: 'f7', niche: 'Education', platform: 'TikTok', label: 'Authority insight clip', creator: 'Andrew Huberman', hook: '“What top performers do differently.” One specific takeaway.', why: 'Names a desirable outcome up front, delivers one concrete mechanism, keeps it short. The format that makes expert clips feel actionable.', reach: '116K', loves: '3.9K', accent: 'text-teal', poster: 'from-teal/30 via-ink2 to-ink', url: 'https://www.tiktok.com/@hubermanlab/video/7591981806514162974' },
  { id: 'f8', niche: 'Lifestyle', platform: 'TikTok', label: 'Travel vlog micro-story', creator: 'Lynja', hook: 'Fast, funny day-in-Italy vlog with tight cuts and a payoff bit.', why: 'A mini narrative arc in under 20 seconds: setup, escalation, punchline. Relentless pacing rewards a full watch and a re-watch.', reach: '32.8M', loves: '923K', accent: 'text-coral', poster: 'from-coral/25 via-ink2 to-ink', url: 'https://www.tiktok.com/@cookingwithlynja/video/7322137035152706858' },
]

const POSTER_BY_NICHE: Record<string, { accent: string; poster: string }> = {
  Business: { accent: 'text-amber', poster: 'from-coral/30 via-ink2 to-ink' },
  Fitness:  { accent: 'text-coral', poster: 'from-coral/25 via-ink2 to-ink' },
  Food:     { accent: 'text-amber', poster: 'from-amber/30 via-ink2 to-ink' },
  Education:{ accent: 'text-teal',  poster: 'from-teal/30 via-ink2 to-ink' },
  Lifestyle:{ accent: 'text-coral', poster: 'from-amber/25 via-ink2 to-ink' },
  Other:    { accent: 'text-teal',  poster: 'from-teal/25 via-ink2 to-ink' },
}

function fromDb(it: GalleryItem): Card {
  const skin = POSTER_BY_NICHE[it.niche] ?? POSTER_BY_NICHE.Other
  return { id: it.id, niche: it.niche, platform: it.platform, label: it.title || 'Community pick', creator: it.creator || 'creator', hook: it.title || it.url, why: it.why || 'Shared by a TwinAI creator.', reach: it.reach || '·', loves: it.likes || '·', accent: skin.accent, poster: skin.poster, url: it.url }
}

function ytId(url: string): string | null {
  const m = url.match(/[?&]v=([\w-]+)/) || url.match(/youtu\.be\/([\w-]+)/) || url.match(/shorts\/([\w-]+)/)
  return m ? m[1] : null
}

function reachNum(s: string): number {
  const m = s.trim().match(/^([\d.]+)\s*([KMB]?)/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase() as 'K' | 'M' | 'B'] ?? 1
  return n * mult
}

const ACCENT_GLOW: Record<string, string> = {
  'text-amber': 'hover:border-amber/40 hover:shadow-[0_0_24px_rgba(255,179,71,0.15)]',
  'text-teal':  'hover:border-teal/40 hover:shadow-[0_0_24px_rgba(101,229,216,0.15)]',
  'text-coral': 'hover:border-coral/40 hover:shadow-[0_0_24px_rgba(255,91,123,0.15)]',
}

export default function Gallery() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [voiceNiche, setVoiceNiche] = useState('')
  const [voiceSubNiche, setVoiceSubNiche] = useState('')
  // The creator's real niche lives in their default BRAND VOICE (the handle scan),
  // not the onboarding quiz. Handle-based users have an empty profile.dna, which is
  // why the gallery was stuck on "All" and showed unrelated niches. Prefer the voice
  // niche; fall back to the quiz dna for older quiz-only users.
  const userNiche = (voiceNiche || profile?.dna?.niche || '').trim()
  const userSubNiche = voiceSubNiche.trim()
  const [niche, setNiche] = useState<string>('All')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'top' | 'all'>('top')
  const [community, setCommunity] = useState<Card[]>([])
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [showAll, setShowAll] = useState(false)
  const touched = useRef(false)

  useEffect(() => {
    listGalleryItems()
      .then((items) => setCommunity(items.filter((i) => i.visibility === 'public').map(fromDb)))
      .catch(() => setCommunity([]))
    // Pull the creator's real niche from their default brand voice.
    listBrandVoices()
      .then((vs) => {
        const def = vs.find((v) => v.is_default && v.status === 'ready') ?? vs.find((v) => v.status === 'ready')
        if (def?.profile?.niche) setVoiceNiche(def.profile.niche)
        if (def?.profile?.sub_niche) setVoiceSubNiche(def.profile.sub_niche)
      })
      .catch(() => {})
  }, [])

  const all: Card[] = useMemo(() => [...FEATURED, ...community], [community])

  // The live niche universe = base set ∪ whatever niches discovery has added.
  const knownNiches = useMemo(
    () => Array.from(new Set([...BASE_NICHES, ...community.map((c) => c.niche).filter(Boolean)])),
    [community],
  )
  // The creator's own niche, resolved to a canonical chip (front-loaded + default).
  const myNiche = useMemo(() => resolveNiche(userNiche, knownNiches), [userNiche, knownNiches])
  // The creator's SPECIFIC sub-niche, surfaced ABOVE the broad niche when it exists
  // and resolves to its own distinct chip.
  const mySubNiche = useMemo(() => {
    const s = resolveNiche(userSubNiche, knownNiches)
    return s && s !== myNiche ? s : ''
  }, [userSubNiche, knownNiches, myNiche])
  const isMine = (n: string) => n === mySubNiche || n === myNiche
  // Ordered chips: the creator's sub-niche first (most specific), then their broad
  // niche, then All, then everything else discovery has surfaced.
  const nicheChips = useMemo(() => {
    const mine = [mySubNiche, myNiche].filter(Boolean)
    const rest = knownNiches.filter((n) => !mine.includes(n)).sort()
    return [...mine, 'All', ...rest]
  }, [knownNiches, myNiche, mySubNiche])

  // Open on the creator's sub-niche (most specific), else their niche, until they
  // touch the filter.
  useEffect(() => {
    const open = mySubNiche || myNiche
    if (touched.current || !open) return
    setNiche(open)
  }, [mySubNiche, myNiche])

  // Posters for every card (featured + freshly discovered). YouTube thumbnails are
  // derivable straight from the video id; TikTok needs an oembed round-trip. Instagram
  // keeps the gradient fallback (its oembed needs an app token).
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    async function fetchThumb(card: Card) {
      if (thumbnails[card.id]) return
      const yt = ytId(card.url)
      if (yt) {
        setThumbnails((prev) => ({ ...prev, [card.id]: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` }))
        return
      }
      if (!card.url.includes('tiktok.com')) return
      try {
        const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(card.url)}`, { signal })
        if (!res.ok) return
        const data = await res.json()
        if (data?.thumbnail_url) setThumbnails((prev) => ({ ...prev, [card.id]: data.thumbnail_url }))
      } catch { /* keep gradient fallback */ }
    }
    all.forEach(fetchThumb)
    return () => controller.abort()
  }, [all]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => {
    let out = all
    if (q.trim()) {
      const needle = q.trim().toLowerCase()
      out = out.filter((c) => (c.niche + ' ' + c.label + ' ' + c.hook + ' ' + c.why + ' ' + c.creator).toLowerCase().includes(needle))
    }
    const byReach = (a: Card, b: Card) => reachNum(b.reach) - reachNum(a.reach)
    // The creator's own chip is a personalized "for you" feed, not a hard filter:
    // their niche's videos first, then RELATED niches, then everything else. A
    // specific bucket chip hard-filters; "All" is a neutral browse.
    const isForYou = (!!mySubNiche && niche === mySubNiche) || (!!myNiche && niche === myNiche)
    if (niche !== 'All' && !isForYou) out = out.filter((c) => c.niche === niche)
    if (isForYou) {
      // Sub-niche first (most specific), then the broad niche, then related, then rest.
      const related = RELATED_NICHE[myNiche] ?? []
      const rank = (c: Card) =>
        c.niche === mySubNiche ? 0 : c.niche === myNiche ? 1 : related.includes(c.niche) ? 2 : 3
      return [...out].sort((a, b) => rank(a) - rank(b) || byReach(a, b))
    }
    return sort === 'top' ? [...out].sort(byReach) : out
  }, [all, myNiche, mySubNiche, niche, q, sort])

  // Deep-link into the Studio with the reference prefilled. Studio reads `ref`
  // from the query string, so pass it there (a `state` payload was silently
  // dropped, which left Studio empty when you clicked Remix).
  const remix = (c: Card) => navigate(`/app?ref=${encodeURIComponent(c.url)}`)

  return (
    <main className="relative overflow-clip">
      <Aurora className="opacity-70" />
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-coral/8 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-14 lg:pt-20">
          <Reveal>
            <p className="eyebrow mb-3">Inspiration Gallery</p>
            <h1 className="font-display text-4xl leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Proven formats, <span className="gradient-text">ready to remix.</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-sand leading-relaxed">Real viral formats from top creators, rebuilt in your voice with one tap.</p>
          </Reveal>
        </div>
      </div>
      <div className="relative mx-auto max-w-6xl px-5 pb-16">
        <Reveal delay={0.04}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {nicheChips.map((n) => (
                <button key={n} onClick={() => { touched.current = true; setShowAll(false); setNiche(n) }} className={cn('chip transition-all duration-200', niche === n ? 'border-coral/60 bg-coral/10 text-cream shadow-[0_0_12px_rgba(255,91,123,0.2)]' : 'hover:border-white/20 hover:text-cream', isMine(n) && niche !== n && 'border-teal/40 text-cream')}>
                  {n}{isMine(n) ? ' ✦' : ''}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-[12px] border border-white/10 bg-white/5 p-0.5">
                {(['top', 'all'] as const).map((s) => (
                  <button key={s} onClick={() => setSort(s)} className={cn('rounded-[10px] px-3 py-1.5 text-xs font-medium capitalize transition-colors', sort === s ? 'bg-coral/20 text-cream' : 'text-stone hover:text-cream')}>
                    {s === 'top' ? 'Top' : 'All'}
                  </button>
                ))}
              </div>
              <div className="relative sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone" />
                <input className="field pl-9" placeholder="Search a niche or topic…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
          </div>
        </Reveal>
        {shown.length === 0 ? (
          <div className="glass mt-10 grid place-items-center p-12 text-center text-sand">Nothing matches that yet. Try another filter.</div>
        ) : (
          <Stagger immediate className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" gap={0.06}>
            {(showAll ? shown : shown.slice(0, 9)).map((c) => {
              const thumb = thumbnails[c.id]
              const glowClass = ACCENT_GLOW[c.accent] ?? 'hover:border-white/20'
              return (
                <RevealItem key={c.id}>
                  <Tilt max={6} className="h-full">
                    <div className={cn('glass flex h-full flex-col overflow-hidden border border-white/8 transition-all duration-300 hover:-translate-y-0.5', glowClass)}>
                      <button
                        type="button"
                        onClick={() => window.open(c.url, '_blank', 'noopener,noreferrer')}
                        aria-label={`Watch ${c.creator} on ${c.platform}`}
                        className="group/poster relative aspect-video w-full overflow-hidden text-left"
                      >
                        <div className={cn('absolute inset-0 bg-gradient-to-br', c.poster)} />
                        {thumb && <img src={thumb} alt={c.label} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
                        <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/20 to-transparent" />
                        <div className="absolute inset-0 grid place-items-center">
                          <span className="grid h-11 w-11 place-items-center rounded-full bg-ink/60 ring-1 ring-white/20 backdrop-blur-sm transition-transform duration-200 hover:scale-110">
                            <Play className="h-4 w-4 translate-x-0.5 fill-cream text-cream" />
                          </span>
                        </div>
                        <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-ink/75 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-cream backdrop-blur-sm">{c.platform}</span>
                        <div className="absolute bottom-3 left-3 flex gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-ink/65 px-2 py-0.5 text-[11px] font-medium text-cream/90 backdrop-blur-sm"><Eye className="h-3 w-3 opacity-70" /> {c.reach}</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-ink/65 px-2 py-0.5 text-[11px] font-medium text-cream/90 backdrop-blur-sm"><Heart className="h-3 w-3 opacity-70" /> {c.loves}</span>
                        </div>
                      </button>
                      <div className="flex flex-1 flex-col p-5">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn('text-[11px] font-bold uppercase tracking-wider', c.accent)}>{c.label}</span>
                          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-stone">{c.niche}</span>
                        </div>
                        <p className="mt-2 font-heading leading-snug text-cream line-clamp-2">{c.hook}</p>
                        <p className="mt-2 flex-1 text-sm text-sand line-clamp-3"><span className="font-medium text-stone">Why it works. </span>{c.why}</p>
                        <p className="mt-3 text-xs"><span className={cn('font-semibold', c.accent)}>@{c.creator}</span></p>
                        <div className="mt-4">
                          <button onClick={() => remix(c)} className="btn-gradient flex w-full items-center justify-center gap-2">
                            <Wand2 className="h-4 w-4 shrink-0" /> Remix in my voice
                          </button>
                        </div>
                      </div>
                    </div>
                  </Tilt>
                </RevealItem>
              )
            })}
          </Stagger>
        )}
        {!showAll && shown.length > 9 && (
          <div className="mt-8 flex justify-center">
            <button onClick={() => setShowAll(true)} className="chip hover:border-coral/40 hover:text-cream">
              View all {shown.length} →
            </button>
          </div>
        )}
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <p className="text-[11px] text-stone">Featured counts are real public TikTok figures captured at curation time.</p>
          <button onClick={() => navigate('/app')} className="text-sm text-stone transition-colors hover:text-cream">Got a format you love? Remix it into your voice →</button>
        </div>
      </div>
    </main>
  )
}
