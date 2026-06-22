import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wand2, Eye, Heart, Play, Search } from 'lucide-react'
import { Aurora } from '../components/Aurora'
import { Reveal, Stagger, RevealItem } from '../components/motion'
import { Tilt } from '../components/Tilt'
import { useAuth } from '../context/AuthContext'
import { listGalleryItems, listBrandVoices, logEvent, type GalleryItem } from '../lib/api'
import { cn } from '../lib/cn'

// Base niches we always seed the filter with. The live list GROWS beyond these
// as discovery brings in items tagged with new niches (see `nicheChips`).
const BASE_NICHES = ['Business', 'Fitness', 'Food', 'Education', 'Lifestyle', 'Beauty']

// Module-level thumbnail cache so navigating away and back to the gallery doesn't
// re-hit TikTok's oEmbed for every card again (survives component remounts).
const THUMB_CACHE = new Map<string, string>()

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

// Niches "related" to mine for the for-you feed's middle tier. Curated neighbors for
// the base niches; for any FRESHLY DISCOVERED niche we derive neighbors by shared
// significant words, so a new niche still gets an on-topic related tier instead of
// none. e.g. "AI Virtual Try-On" relates to "Fashion Tech" / "Virtual Styling".
const RELATED_STOPWORDS = new Set(['and', 'the', 'for', 'of', 'a', 'to', 'in', 'on', 'with', 'your', 'my', 'ai'])
function relatedNiches(myNiche: string, known: string[]): string[] {
  if (RELATED_NICHE[myNiche]) return RELATED_NICHE[myNiche]
  const words = (s: string) =>
    new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !RELATED_STOPWORDS.has(w)))
  const mine = words(myNiche)
  if (!mine.size) return []
  return known
    .filter((n) => n !== myNiche)
    .map((n) => ({ n, overlap: [...words(n)].filter((w) => mine.has(w)).length }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 3)
    .map((x) => x.n)
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

// Palette pool so EVERY niche gets a designed skin, not one shared default. Curated
// niches above keep their exact look; any freshly discovered niche is assigned a
// stable palette by hashing its name (same niche -> same skin every render).
const NICHE_PALETTES: { accent: string; poster: string }[] = [
  { accent: 'text-amber', poster: 'from-coral/30 via-ink2 to-ink' },
  { accent: 'text-coral', poster: 'from-coral/25 via-ink2 to-ink' },
  { accent: 'text-amber', poster: 'from-amber/30 via-ink2 to-ink' },
  { accent: 'text-teal',  poster: 'from-teal/30 via-ink2 to-ink' },
  { accent: 'text-coral', poster: 'from-amber/25 via-ink2 to-ink' },
  { accent: 'text-teal',  poster: 'from-teal/25 via-ink2 to-ink' },
  { accent: 'text-amber', poster: 'from-teal/20 via-ink2 to-ink' },
  { accent: 'text-coral', poster: 'from-coral/35 via-ink2 to-ink' },
]
function skinForNiche(niche: string): { accent: string; poster: string } {
  const curated = POSTER_BY_NICHE[niche]
  if (curated) return curated
  let h = 0
  for (let i = 0; i < niche.length; i++) h = (h * 31 + niche.charCodeAt(i)) >>> 0
  return NICHE_PALETTES[h % NICHE_PALETTES.length]
}

function fromDb(it: GalleryItem): Card {
  const skin = skinForNiche(it.niche)
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

// --- Opportunity Engine ----------------------------------------------------
// A personalized 0-100 score per reference: how likely THIS format is to win for
// THIS creator. Content-based (engagement rate + proven reach + niche fit) so it
// works on day one with zero interaction data. Once we log remix clicks it
// graduates to collaborative filtering. `fit` is 0..1 (sub-niche=1 → unrelated≈0.3).
interface Opp { score: number; tier: 'hot' | 'strong' | 'solid'; why: string; er: number }
function opportunity(reach: number, loves: number, fit: number): Opp {
  const er = reach > 0 ? loves / reach : 0
  const erScore = Math.min(1, er / 0.1) // a 10% like-rate maxes this factor
  const reachScore = reach > 0 ? Math.min(1, Math.log10(reach) / 7.5) : 0 // ~31M views ≈ max
  const raw = 0.4 * fit + 0.35 * erScore + 0.25 * reachScore
  const score = Math.round(42 + raw * 57) // 42..99 — even the floor reads as usable
  const tier: Opp['tier'] = score >= 85 ? 'hot' : score >= 70 ? 'strong' : 'solid'
  const reasons = [
    { k: fit, t: fit >= 0.95 ? 'dead-on for your niche' : fit >= 0.8 ? 'right in your niche' : fit >= 0.5 ? 'adjacent to your niche' : 'cross-niche idea' },
    { k: erScore, t: `${(er * 100).toFixed(1)}% like-rate` },
    { k: reachScore, t: 'proven at scale' },
  ].sort((a, b) => b.k - a.k)
  return { score, tier, why: `${reasons[0].t} · ${reasons[1].t}`, er }
}
const SCORE_SKIN: Record<Opp['tier'], string> = {
  hot: 'border-coral/50 bg-coral/20 text-coral',
  strong: 'border-amber/50 bg-amber/20 text-amber',
  solid: 'border-white/20 bg-white/10 text-sand',
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

  // Build each card's lowercased searchable text ONCE per gallery change, not on
  // every keystroke.
  const searchBlobs = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of all) m.set(c.id, `${c.niche} ${c.label} ${c.hook} ${c.why} ${c.creator}`.toLowerCase())
    return m
  }, [all])

  // Related niches depend only on the creator's niche + the known set, so memoize
  // them out of `shown` (which otherwise re-derives them on every keystroke/sort).
  const related = useMemo(() => relatedNiches(myNiche, knownNiches), [myNiche, knownNiches])

  // Opportunity score per card — what's most likely to win for THIS creator.
  const scores = useMemo(() => {
    const fitOf = (c: Card) => (c.niche === mySubNiche ? 1 : c.niche === myNiche ? 0.82 : related.includes(c.niche) ? 0.55 : 0.3)
    const m = new Map<string, Opp>()
    for (const c of all) m.set(c.id, opportunity(reachNum(c.reach), reachNum(c.loves), fitOf(c)))
    return m
  }, [all, myNiche, mySubNiche, related])

  const shown = useMemo(() => {
    let out = all
    if (q.trim()) {
      const needle = q.trim().toLowerCase()
      out = out.filter((c) => (searchBlobs.get(c.id) ?? '').includes(needle))
    }
    // Rank by the Opportunity score (engagement × reach × your-niche fit), not raw
    // reach — so the feed surfaces what's most likely to actually work for them.
    const byScore = (a: Card, b: Card) => (scores.get(b.id)?.score ?? 0) - (scores.get(a.id)?.score ?? 0)
    const isForYou = (!!mySubNiche && niche === mySubNiche) || (!!myNiche && niche === myNiche)
    if (niche !== 'All' && !isForYou) out = out.filter((c) => c.niche === niche)
    if (isForYou) {
      const rank = (c: Card) =>
        c.niche === mySubNiche ? 0 : c.niche === myNiche ? 1 : related.includes(c.niche) ? 2 : 3
      return [...out].sort((a, b) => rank(a) - rank(b) || byScore(a, b))
    }
    return sort === 'top' ? [...out].sort(byScore) : out
  }, [all, myNiche, mySubNiche, niche, q, sort, searchBlobs, related, scores])

  // Only the cards actually on screen need a thumbnail. YouTube thumbnails derive
  // straight from the video id; TikTok needs an oembed round-trip; Instagram keeps
  // the gradient fallback. Fetching only the visible slice (+ a cross-mount cache)
  // avoids a network request per card for the whole gallery on every visit.
  const visible = useMemo(() => (showAll ? shown : shown.slice(0, 9)), [shown, showAll])
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    async function fetchThumb(card: Card) {
      if (thumbnails[card.id]) return
      const cached = THUMB_CACHE.get(card.id)
      if (cached) {
        setThumbnails((prev) => ({ ...prev, [card.id]: cached }))
        return
      }
      const yt = ytId(card.url)
      if (yt) {
        const u = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`
        THUMB_CACHE.set(card.id, u)
        setThumbnails((prev) => ({ ...prev, [card.id]: u }))
        return
      }
      if (!card.url.includes('tiktok.com')) return
      try {
        const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(card.url)}`, { signal })
        if (!res.ok) return
        const data = await res.json()
        if (data?.thumbnail_url) {
          THUMB_CACHE.set(card.id, data.thumbnail_url)
          setThumbnails((prev) => ({ ...prev, [card.id]: data.thumbnail_url }))
        }
      } catch { /* keep gradient fallback */ }
    }
    visible.forEach(fetchThumb)
    return () => controller.abort()
  }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link into the Studio with the reference prefilled. Studio reads `ref`
  // from the query string, so pass it there (a `state` payload was silently
  // dropped, which left Studio empty when you clicked Remix).
  const remix = (c: Card) => {
    // The remix-click is the core interaction signal — logging it builds the data
    // set that lets discovery graduate from content-based to collaborative filtering.
    void logEvent('gallery_remix', { url: c.url, niche: c.niche, creator: c.creator, score: scores.get(c.id)?.score })
    navigate(`/app?ref=${encodeURIComponent(c.url)}`)
  }

  return (
    <main className="relative overflow-clip">
      <Aurora className="opacity-70" />
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-coral/8 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-14 lg:pt-20">
          <Reveal>
            <p className="eyebrow mb-3">Inspiration Gallery</p>
            <h1 className="font-display text-4xl leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Find what's working. <span className="gradient-text">Make it yours.</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-sand leading-relaxed">Proven viral formats, <span className="text-cream">scored for your niche</span> and ranked by what's most likely to win — rebuilt in your voice with one tap.</p>
          </Reveal>
        </div>
      </div>
      <div className="relative mx-auto max-w-6xl px-5 pb-16">
        <Reveal delay={0.04}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
              {nicheChips.map((n) => (
                <button key={n} onClick={() => { touched.current = true; setShowAll(false); setNiche(n) }} className={cn('chip shrink-0 transition-all duration-200', niche === n ? 'border-coral/60 bg-coral/10 text-cream shadow-[0_0_12px_rgba(255,91,123,0.2)]' : 'hover:border-white/20 hover:text-cream', isMine(n) && niche !== n && 'border-teal/40 text-cream')}>
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
          <div className="glass mt-10 grid place-items-center p-12 text-center text-sand">Nothing here for that yet. Try another niche, or paste a video you love in the Studio.</div>
        ) : (
          <Stagger immediate className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" gap={0.06}>
            {visible.map((c) => {
              const thumb = thumbnails[c.id]
              const glowClass = ACCENT_GLOW[c.accent] ?? 'hover:border-white/20'
              const opp = scores.get(c.id)
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
                        {opp && (
                          <span className={cn('absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold backdrop-blur-sm', SCORE_SKIN[opp.tier])} title="Opportunity score — how likely this format is to win for your niche">
                            {opp.tier === 'hot' ? '🔥' : '⚡'} {opp.score}
                          </span>
                        )}
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
                        {opp && <p className={cn('mt-1.5 text-[11px] font-medium', c.accent)}>Why for you · {opp.why}</p>}
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
