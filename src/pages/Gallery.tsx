import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Wand2, Eye, Heart, Play, Sparkles, Search } from 'lucide-react'
import { Aurora } from '../components/Aurora'
import { Reveal, Stagger, RevealItem, EASE } from '../components/motion'
import { Tilt } from '../components/Tilt'
import { cn } from '../lib/cn'

// Curated inspiration feed: proven short-form FORMATS worth remixing, grouped by
// niche. These are starting points — paste your own link any time in the Studio.
// We show the format + why it works (the product's real value), never claim live
// per-account analytics. Reach figures are rounded, illustrative popularity bands.
type Niche = 'All' | 'Business' | 'Fitness' | 'Food' | 'Education' | 'Lifestyle'

interface Ref {
  niche: Exclude<Niche, 'All'>
  platform: 'TikTok' | 'Reels' | 'Shorts'
  format: string
  creator: string
  hook: string
  why: string
  reach: string
  loves: string
  accent: string
  poster: string
  url: string
}

// Every entry is a REAL public TikTok with real view/like counts (scraped at
// curation time). Remix works on all of them — they transcribe for real.
const REFS: Ref[] = [
  {
    niche: 'Business', platform: 'TikTok', format: 'Reply → reframe → reassure', creator: 'GaryVee',
    hook: 'Answers a follower’s “what about me?” with a calm age-reframe and reassurance.',
    why: 'Uses a real comment as the cold open (instant relevance), then flips anxiety into perspective and lands on emotional relief — a loopable, share-because-it-helped structure.',
    reach: '32.2M', loves: '1.7M', accent: 'text-amber', poster: 'from-coral/35 via-ink2 to-ink',
    url: 'https://www.tiktok.com/@garyvee/video/7033061794172194053',
  },
  {
    niche: 'Business', platform: 'TikTok', format: 'Aggressive motivational snippet', creator: 'GaryVee',
    hook: 'Provocative demographic call-out — “if you’re 35, you’re a baby.”',
    why: 'A counter-intuitive jab stops the scroll in <2s; a humble personal anecdote earns trust, then the comforting payoff loops back to the hook’s exact phrasing.',
    reach: '1.5M', loves: '111K', accent: 'text-teal', poster: 'from-teal/25 via-ink2 to-ink',
    url: 'https://www.tiktok.com/@garyvee/video/7528533857688243511',
  },
  {
    niche: 'Fitness', platform: 'TikTok', format: 'Stitch callout → positivity', creator: 'Joey Swoll',
    hook: 'Reacts to a gym video, names the behavior, flips to a supportive lesson.',
    why: 'Borrowed footage gives instant context; the “I’m going to address this” framing creates an open loop, and the wholesome resolution drives comments and shares.',
    reach: '976K', loves: '157K', accent: 'text-coral', poster: 'from-coral/30 via-ink2 to-ink',
    url: 'https://www.tiktok.com/@thejoeyswoll/video/7649568372018941214',
  },
  {
    niche: 'Food', platform: 'TikTok', format: 'Rapid pun gag', creator: 'Gordon Ramsay',
    hook: '“Boil ’em, mash ’em, stick ’em in a stew…” — instant, playful, fast.',
    why: 'Sub-12-second format with a familiar callback line and a celebrity cameo; the brevity itself maximizes completion rate and re-watches.',
    reach: '1.3M', loves: '262K', accent: 'text-amber', poster: 'from-amber/30 via-ink2 to-ink',
    url: 'https://www.tiktok.com/@gordonramsayofficial/video/7647208311900671234',
  },
  {
    niche: 'Food', platform: 'TikTok', format: 'Comedic cook + reaction', creator: 'Lynja',
    hook: 'Hyper-edited cooking bit with punchy text overlays and sound design.',
    why: 'Jump-cut comedy keeps a beat every 1–2s so attention never resets; the personality + edits make a simple food clip endlessly re-watchable.',
    reach: '52M', loves: '1.8M', accent: 'text-teal', poster: 'from-amber/25 via-ink2 to-ink',
    url: 'https://www.tiktok.com/@cookingwithlynja/video/7322531619825257771',
  },
  {
    niche: 'Education', platform: 'TikTok', format: 'Process reveal explainer', creator: 'Humphrey Yang',
    hook: 'Behind-the-scenes factory tour: how raw gold becomes products.',
    why: 'Curiosity-driven “how it’s made” framing with a clear visual payoff each step; satisfying, saveable, and easy to follow without sound.',
    reach: '4.3M', loves: '139K', accent: 'text-amber', poster: 'from-coral/25 via-ink2 to-ink',
    url: 'https://www.tiktok.com/@humphreytalks/video/7421658047539399967',
  },
  {
    niche: 'Education', platform: 'TikTok', format: 'Authority insight clip', creator: 'Andrew Huberman',
    hook: '“What top performers do differently” — a single, specific takeaway.',
    why: 'Names a desirable outcome up front, delivers one concrete mechanism, and keeps it short — the format that makes expert clips feel actionable and saveable.',
    reach: '116K', loves: '3.9K', accent: 'text-teal', poster: 'from-teal/30 via-ink2 to-ink',
    url: 'https://www.tiktok.com/@hubermanlab/video/7591981806514162974',
  },
  {
    niche: 'Lifestyle', platform: 'TikTok', format: 'Travel vlog micro-story', creator: 'Lynja',
    hook: 'Fast, funny day-in-Italy vlog with tight cuts and a payoff bit.',
    why: 'A mini narrative arc in under 20s — setup, escalation, punchline — with relentless pacing that rewards a full watch and a re-watch.',
    reach: '32.8M', loves: '923K', accent: 'text-coral', poster: 'from-coral/25 via-ink2 to-ink',
    url: 'https://www.tiktok.com/@cookingwithlynja/video/7322137035152706858',
  },
]

const NICHES: Niche[] = ['All', 'Business', 'Fitness', 'Food', 'Education', 'Lifestyle']

// "32.2M" / "976K" → a sortable number, so "Top" surfaces the biggest hits.
function reachNum(s: string): number {
  const m = s.trim().match(/^([\d.]+)\s*([KMB]?)/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase() as 'K' | 'M' | 'B'] ?? 1
  return n * mult
}

export default function Gallery() {
  const navigate = useNavigate()
  const [niche, setNiche] = useState<Niche>('All')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'top' | 'all'>('top')

  const shown = useMemo(() => {
    const out = REFS.filter((r) => niche === 'All' || r.niche === niche).filter((r) =>
      !q.trim()
        ? true
        : (r.format + r.hook + r.why + r.niche + r.creator).toLowerCase().includes(q.trim().toLowerCase()),
    )
    // "Top" = best-in-niche first (by reach); "All" = leave curated order.
    return sort === 'top' ? [...out].sort((a, b) => reachNum(b.reach) - reachNum(a.reach)) : out
  }, [niche, q, sort])

  const remix = (r: Ref) => navigate(`/app?ref=${encodeURIComponent(r.url)}`)

  return (
    <main className="relative overflow-clip">
      <Aurora className="opacity-60" />
      <div className="relative mx-auto max-w-6xl px-5 py-12 lg:py-16">
        <Reveal>
          <p className="eyebrow">Inspiration gallery</p>
          <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight sm:text-5xl">
            Proven formats, <span className="gradient-text">ready to remix.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sand">
            Hand-picked short-form structures that reliably work — with the read on <em className="not-italic text-cream">why</em>.
            Tap <span className="text-cream">Remix</span> to rebuild any one in your voice, or paste your own link in the Studio.
          </p>
        </Reveal>

        {/* Controls */}
        <Reveal delay={0.06}>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {NICHES.map((n) => (
                <button
                  key={n}
                  onClick={() => setNiche(n)}
                  className={cn(
                    'chip transition-all duration-200',
                    niche === n && 'border-coral/60 bg-coral/10 text-cream',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {/* Top vs All */}
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
            Nothing matches that yet — try another niche or paste your own link in the Studio.
          </div>
        ) : (
          <Stagger className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" gap={0.06}>
            {shown.map((r, i) => (
              <RevealItem key={r.format + i}>
                <Tilt max={6} className="h-full">
                  <div className="glass glass-hover flex h-full flex-col overflow-hidden">
                    {/* poster */}
                    <div className={cn('relative grid aspect-video place-items-center bg-gradient-to-br', r.poster)}>
                      <motion.span
                        initial={{ scale: 0.85, opacity: 0 }}
                        whileInView={{ scale: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, ease: EASE }}
                        className="grid h-12 w-12 place-items-center rounded-full bg-ink/70 backdrop-blur"
                      >
                        <Play className="h-5 w-5 translate-x-0.5 text-cream" />
                      </motion.span>
                      <span className="absolute left-3 top-3 rounded-full bg-ink/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-cream backdrop-blur">
                        {r.platform}
                      </span>
                      <div className="absolute bottom-3 left-3 flex gap-3 text-[11px] text-cream/90">
                        <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {r.reach}</span>
                        <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {r.loves}</span>
                      </div>
                    </div>

                    {/* body */}
                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn('text-xs font-bold uppercase tracking-wider', r.accent)}>{r.format}</span>
                        <span className="shrink-0 text-xs text-stone">@{r.creator}</span>
                      </div>
                      <p className="mt-2 font-heading leading-snug text-cream">{r.hook}</p>
                      <p className="mt-2 flex-1 text-sm text-sand">
                        <span className="text-stone">Why it works — </span>{r.why}
                      </p>
                      <button onClick={() => remix(r)} className="btn-gradient mt-4 w-full">
                        <Wand2 className="h-4 w-4" /> Remix in my voice
                      </button>
                    </div>
                  </div>
                </Tilt>
              </RevealItem>
            ))}
          </Stagger>
        )}

        <Reveal delay={0.1}>
          <div className="glass mt-8 flex flex-col items-center gap-3 p-6 text-center sm:flex-row sm:justify-between sm:text-left">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-signature-soft">
                <Sparkles className="h-5 w-5 text-amber" />
              </span>
              <p className="text-sm text-sand">
                Have a specific video in mind? Skip the gallery — paste any link straight into the Studio.
              </p>
            </div>
            <button onClick={() => navigate('/app')} className="btn-ghost shrink-0">
              Open the Studio
            </button>
          </div>
        </Reveal>

        <p className="mt-6 text-center text-[11px] text-stone">
          Every clip is a real public TikTok; view/like counts were captured at curation time and may shift.
        </p>
      </div>
    </main>
  )
}
