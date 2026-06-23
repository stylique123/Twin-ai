import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wand2, Eye, Heart, Play, Search, Mic, Repeat, Layers, Film, Sparkles, TrendingUp, ChevronRight, Flame, Zap, X, ExternalLink } from 'lucide-react'
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

// --- The Playbook (the "brain") --------------------------------------------
// What KINDS of videos actually grow THIS creator — not just reference clips, but
// the formats most likely to win in their niche. Each format carries a search term
// (`q`) so tapping it surfaces real examples of that format in the feed below.
interface Format { name: string; why: string; q: string; icon: typeof Mic }
const PLAYBOOK: Record<string, Format[]> = {
  Business: [
    { name: 'Talking-head hot take', why: 'A sharp, contrarian POV straight to camera — the fastest, highest-trust format for founders.', q: 'hook', icon: Mic },
    { name: 'Podcast / soundbite clip', why: 'A 30-second answer to one real question. Repurposable and authority-building.', q: 'insight', icon: Film },
    { name: 'Case-study breakdown', why: 'A before → after result with the steps. Buyers save and share proof.', q: 'process', icon: TrendingUp },
    { name: '“3 ways to…” listicle', why: 'Numbered value holds retention and is dead-simple to script.', q: 'explain', icon: Layers },
  ],
  Fitness: [
    { name: 'Transformation transition', why: 'A clean before/after cut on the beat — the most-shared fitness format.', q: 'transition', icon: Repeat },
    { name: 'Form-check talking head', why: 'Fix one common mistake to camera. Saves + “sending this to my gym buddy.”', q: 'callout', icon: Mic },
    { name: 'Day-of-eating / routine', why: 'A relatable POV walkthrough that builds the para-social bond that retains.', q: 'routine', icon: Film },
    { name: 'Myth-buster hot take', why: 'Name the bad advice, flip it. Comment-bait that drives reach.', q: 'hook', icon: TrendingUp },
  ],
  Beauty: [
    { name: 'GRWM + a story', why: 'Get-ready-with-me while you talk — high completion, easy to film daily.', q: 'grwm', icon: Mic },
    { name: 'Try-on / transition', why: 'Outfit or product transitions on the beat — the signature beauty/fashion win.', q: 'transition', icon: Repeat },
    { name: 'Step-by-step tutorial', why: 'A clear how-to with a satisfying payoff. Saveable and re-watchable.', q: 'tutorial', icon: Layers },
    { name: 'First-impression reaction', why: 'Honest real-time reactions earn trust and comments.', q: 'reaction', icon: Film },
  ],
  Food: [
    { name: 'Jump-cut recipe', why: 'A beat every 1-2 seconds so attention never resets — the Lynja effect.', q: 'cook', icon: Repeat },
    { name: 'ASMR / process reveal', why: 'Satisfying sound + visuals carry the watch with no script needed.', q: 'process', icon: Film },
    { name: 'Taste-test reaction', why: 'Genuine reactions are inherently loopable and shareable.', q: 'reaction', icon: Mic },
    { name: '3-ingredient / quick', why: 'Low-effort promise = high saves. Easy series to sustain.', q: 'recipe', icon: Layers },
  ],
  Education: [
    { name: 'Explainer w/ visuals', why: 'One idea, clear payoff, no fluff — the format that makes expertise feel actionable.', q: 'explain', icon: Layers },
    { name: '“Did you know” hook', why: 'A surprising fact cold-open that stops the scroll fast.', q: 'hook', icon: Sparkles },
    { name: 'Process / how-it’s-made', why: 'Curiosity-driven step reveals are deeply saveable.', q: 'process', icon: Film },
    { name: 'Authority insight clip', why: 'Name the outcome, give one concrete mechanism, keep it short.', q: 'insight', icon: Mic },
  ],
  Lifestyle: [
    { name: 'Day-in-the-life', why: 'A micro-narrative arc builds the para-social bond that drives follows.', q: 'vlog', icon: Film },
    { name: 'Relatable POV skit', why: 'A shared “that’s so me” moment — the most shareable lifestyle format.', q: 'relatable', icon: Sparkles },
    { name: 'Get-ready chat', why: 'Talk to camera while doing something — high completion, low effort.', q: 'routine', icon: Mic },
    { name: 'Story-time transition', why: 'Setup → escalation → payoff with tight cuts rewards a full watch.', q: 'story', icon: Repeat },
  ],
}
const DEFAULT_PLAYBOOK: Format[] = [
  { name: 'Talking-head hot take', why: 'A clear POV to camera is the fastest, highest-trust video to make in any niche.', q: 'hook', icon: Mic },
  { name: 'On-beat transition', why: 'A satisfying before/after or scene cut on the beat — universally shareable.', q: 'transition', icon: Repeat },
  { name: '“3 things” listicle', why: 'Numbered value is easy to script and holds retention.', q: 'explain', icon: Layers },
  { name: 'Story-time', why: 'Setup → tension → payoff keeps people to the end.', q: 'story', icon: Film },
]
function playbookFor(niche: string): Format[] {
  return PLAYBOOK[niche] ?? DEFAULT_PLAYBOOK
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
  // Multi-keyword matching: a brand is never one keyword. Resolve the niche from
  // the niche PLUS the audience + product/offer, so a vague niche still routes
  // correctly via its other signals (the "3-4 keywords, nearest if one misses" ask).
  const userNiche = [voiceNiche || profile?.dna?.niche, profile?.dna?.audience, profile?.dna?.product]
    .filter(Boolean).join(' ').trim()
  const userSubNiche = voiceSubNiche.trim()
  const [niche, setNiche] = useState<string>('All')
  const [q, setQ] = useState('')
  // Playbook format filter (no longer hijacks the search box — that left "hook"
  // stuck in search). null = no format filter.
  const [activeFormat, setActiveFormat] = useState<{ name: string; q: string } | null>(null)
  const [community, setCommunity] = useState<Card[]>([])
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [showAll, setShowAll] = useState(false)
  const [detail, setDetail] = useState<Card | null>(null)
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
    // Curated, short list for the dropdown: the creator's niches + All + the core
    // buckets only — NOT every niche discovery has ever surfaced (that made the
    // dropdown a mile-long list of irrelevant options).
    const core = BASE_NICHES.filter((n) => !mine.includes(n))
    return Array.from(new Set([...mine, 'All', ...core]))
  }, [myNiche, mySubNiche])

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
    // Playbook format: a SOFT boost (not a hard filter) — examples of the chosen
    // format float to the top, but the feed never goes empty when the small seed
    // pool has no exact keyword match (the "Transition shows nothing" bug).
    const fmtBoost = (c: Card) => {
      if (!activeFormat) return 0
      return (searchBlobs.get(c.id) ?? '').includes(activeFormat.q.toLowerCase()) ? 1 : 0
    }
    // Always rank by the Opportunity score (engagement × reach × your-niche fit) —
    // the redundant Top/All toggle is gone. Format matches are boosted first.
    const byScore = (a: Card, b: Card) =>
      (fmtBoost(b) - fmtBoost(a)) || ((scores.get(b.id)?.score ?? 0) - (scores.get(a.id)?.score ?? 0))
    const isForYou = (!!mySubNiche && niche === mySubNiche) || (!!myNiche && niche === myNiche)
    if (niche !== 'All' && !isForYou) out = out.filter((c) => c.niche === niche)
    if (isForYou) {
      const rank = (c: Card) =>
        c.niche === mySubNiche ? 0 : c.niche === myNiche ? 1 : related.includes(c.niche) ? 2 : 3
      const relevant = out.filter((c) => rank(c) < 3)
      const base = relevant.length >= 6 ? relevant : out
      return [...base].sort((a, b) => rank(a) - rank(b) || byScore(a, b))
    }
    return [...out].sort(byScore)
  }, [all, myNiche, mySubNiche, niche, q, activeFormat, searchBlobs, related, scores])

  // Only the cards actually on screen need a thumbnail. YouTube thumbnails derive
  // straight from the video id; TikTok needs an oembed round-trip; Instagram keeps
  // the gradient fallback. Fetching only the visible slice (+ a cross-mount cache)
  // avoids a network request per card for the whole gallery on every visit.
  const visible = useMemo(() => (showAll ? shown : shown.slice(0, 12)), [shown, showAll])
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
    <main className="relative min-h-screen overflow-clip">
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
      {/* The Playbook — the "brain": what FORMATS will actually grow this creator,
          not just reference clips. Tap one to surface real examples in the feed. */}
      <div className="relative mx-auto max-w-6xl px-5 pb-6">
        <Reveal delay={0.03}>
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber" />
            <h2 className="font-heading text-lg text-cream">
              Your playbook{myNiche ? <> — what wins in <span className="text-amber">{myNiche}</span></> : ' — formats that grow you'}
            </h2>
          </div>
          <p className="mb-3 -mt-2 text-xs text-stone">Tap a format to see real examples of it below.</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {playbookFor(myNiche).map((f) => {
              const on = activeFormat?.name === f.name
              return (
              <button
                key={f.name}
                title={f.why}
                onClick={() => { touched.current = true; setShowAll(false); setActiveFormat(on ? null : { name: f.name, q: f.q }) }}
                className={cn('inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-all duration-200', on ? 'border-amber/60 bg-amber/15 text-cream' : 'border-white/10 bg-white/[0.03] text-sand hover:border-amber/30 hover:text-cream')}
              >
                <f.icon className={cn('h-3.5 w-3.5', on ? 'text-amber' : 'text-stone')} /> {f.name}
              </button>
              )
            })}
          </div>
        </Reveal>
      </div>
      <div className="relative mx-auto max-w-6xl px-5 pb-16">
        <Reveal delay={0.04}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {/* Niches as a single dropdown instead of a long chip row. */}
              <div className="relative">
                <select
                  value={niche}
                  onChange={(e) => { touched.current = true; setShowAll(false); setNiche(e.target.value) }}
                  className="field cursor-pointer appearance-none pr-9"
                >
                  {nicheChips.map((n) => (
                    <option key={n} value={n} className="bg-ink2 text-cream">{n}{isMine(n) ? ' (you)' : ''}</option>
                  ))}
                </select>
                <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-stone" />
              </div>
              {activeFormat && (
                <button onClick={() => setActiveFormat(null)} className="chip border-amber/40 text-cream" title="Clear format filter">
                  {activeFormat.name} <span className="text-stone">✕</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
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
          <Stagger immediate className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" gap={0.05}>
            {visible.map((c) => {
              const thumb = thumbnails[c.id]
              const glowClass = ACCENT_GLOW[c.accent] ?? 'hover:border-white/20'
              const opp = scores.get(c.id)
              return (
                <RevealItem key={c.id}>
                  <Tilt max={5} className="h-full">
                    {/* Reel-shaped (9:16) tile — the gallery now browses like a
                        feed of vertical videos. The WHOLE tile opens the detail
                        modal; Play opens the original; Remix deep-links the Studio. */}
                    <div onClick={() => setDetail(c)} className={cn('group relative flex aspect-[9/16] cursor-pointer flex-col justify-end overflow-hidden rounded-card border border-white/8 transition-all duration-300 hover:-translate-y-0.5', glowClass)}>
                      {/* Backdrop: gradient skin, a soft shimmer while the thumb
                          loads (so an empty tile reads as "loading", not broken),
                          then the real cover frame fades in. */}
                      <div className={cn('absolute inset-0 bg-gradient-to-br', c.poster)} />
                      {!thumb && <div className="absolute inset-0 animate-pulse bg-gradient-to-t from-white/[0.06] via-transparent to-white/[0.03]" />}
                      {thumb && <img src={thumb} alt={c.label} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/10" />

                      {/* Top badges */}
                      <span className="absolute left-2.5 top-2.5 rounded-full border border-white/15 bg-ink/75 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-cream backdrop-blur-sm">{c.platform}</span>
                      {opp && (
                        <span className={cn('absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-bold backdrop-blur-sm', SCORE_SKIN[opp.tier])} title="Opportunity score">
                          {opp.tier === 'hot' ? <Flame className="h-3 w-3" /> : <Zap className="h-3 w-3" />} {opp.score}
                        </span>
                      )}

                      {/* Play (original) — surfaces on hover, centred over the reel. */}
                      <div className="absolute inset-0 grid place-items-center">
                        <button type="button" onClick={(e) => { e.stopPropagation(); window.open(c.url, '_blank', 'noopener,noreferrer') }} aria-label="Open the original video" className="grid h-12 w-12 place-items-center rounded-full bg-ink/55 ring-1 ring-white/25 backdrop-blur-sm transition-all duration-200 group-hover:scale-110 group-hover:bg-ink/70">
                          <Play className="h-4 w-4 translate-x-0.5 fill-cream text-cream" />
                        </button>
                      </div>

                      {/* Bottom overlay: stats, hook, creator, and the remix CTA. */}
                      <div className="relative z-10 flex flex-col gap-2 p-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-ink/65 px-1.5 py-0.5 text-[10px] font-medium text-cream/90 backdrop-blur-sm"><Eye className="h-2.5 w-2.5 opacity-70" /> {c.reach}</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-ink/65 px-1.5 py-0.5 text-[10px] font-medium text-cream/90 backdrop-blur-sm"><Heart className="h-2.5 w-2.5 opacity-70" /> {c.loves}</span>
                        </div>
                        <span className={cn('truncate text-[10px] font-bold uppercase tracking-wider', c.accent)}>{c.label}</span>
                        <p className="font-heading text-sm leading-snug text-cream line-clamp-2">{c.hook}</p>
                        <p className="text-[11px]"><span className={cn('font-semibold', c.accent)}>@{c.creator}</span></p>
                        <button onClick={(e) => { e.stopPropagation(); remix(c) }} className="btn-gradient mt-0.5 flex w-full items-center justify-center gap-1.5 !py-2 text-xs">
                          <Wand2 className="h-3.5 w-3.5 shrink-0" /> Remix in my voice
                        </button>
                      </div>
                    </div>
                  </Tilt>
                </RevealItem>
              )
            })}
          </Stagger>
        )}
        {!showAll && shown.length > 12 && (
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

      {/* Card detail modal — opens on click instead of jumping straight to the video.
          Explains WHY it works + stats, then lets you remix it or open the original. */}
      {detail && (() => {
        const opp = scores.get(detail.id)
        return (
          <div className="fixed inset-0 z-50 grid place-items-center bg-ink/85 p-4 backdrop-blur-sm" onClick={() => setDetail(null)}>
            <div className="glass relative max-h-[88vh] w-full max-w-lg overflow-y-auto p-6 sm:p-7" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setDetail(null)} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-stone hover:bg-white/5 hover:text-cream"><X className="h-4 w-4" /></button>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/15 bg-ink/75 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-cream">{detail.platform}</span>
                {opp && <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold', SCORE_SKIN[opp.tier])}>{opp.tier === 'hot' ? <Flame className="h-3 w-3" /> : <Zap className="h-3 w-3" />} {opp.score} score</span>}
              </div>
              <p className={cn('mt-3 text-[11px] font-bold uppercase tracking-wider', detail.accent)}>{detail.label}</p>
              <h3 className="mt-1 font-heading text-lg leading-snug text-cream">{detail.hook}</h3>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-stone">
                <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {detail.reach}</span>
                <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {detail.loves}</span>
                <span className={cn('font-semibold', detail.accent)}>@{detail.creator}</span>
              </div>
              <div className="mt-4 rounded-card border border-white/8 bg-white/[0.02] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-stone">Why it works</p>
                <p className="mt-1.5 text-sm leading-relaxed text-sand">{detail.why}</p>
              </div>
              {opp && <p className={cn('mt-3 text-xs font-medium', detail.accent)}>Why for you · {opp.why}</p>}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button onClick={() => { remix(detail); setDetail(null) }} className="btn-gradient flex-1"><Wand2 className="h-4 w-4" /> Remix in my voice</button>
                <button onClick={() => window.open(detail.url, '_blank', 'noopener,noreferrer')} className="btn-ghost flex-1"><ExternalLink className="h-4 w-4" /> Open original</button>
              </div>
            </div>
          </div>
        )
      })()}
    </main>
  )
}
