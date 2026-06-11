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
  hook: string
  why: string
  reach: string
  loves: string
  accent: string
  poster: string
  url: string
}

const REFS: Ref[] = [
  {
    niche: 'Business', platform: 'TikTok', format: 'Myth → Flip → Proof',
    hook: '“Everyone says post more. That’s why you’re stuck.”',
    why: 'Opens an open loop in 2s by attacking common advice, then pays it off with a counter-intuitive fix.',
    reach: '2.1M', loves: '184K', accent: 'text-amber', poster: 'from-coral/35 via-ink2 to-ink',
    url: 'https://www.tiktok.com/@garyvee/video/7528533857688243511',
  },
  {
    niche: 'Fitness', platform: 'Reels', format: 'One-habit transformation',
    hook: '“The one habit that changed my body — it’s not the gym.”',
    why: 'Curiosity gap + identity promise; withholds the answer until a quick proof montage lands.',
    reach: '880K', loves: '76K', accent: 'text-teal', poster: 'from-teal/30 via-ink2 to-ink',
    url: 'https://www.instagram.com/reel/EXAMPLE_FITNESS',
  },
  {
    niche: 'Food', platform: 'Shorts', format: '3-ingredient reveal',
    hook: '“You’ve been making this wrong your whole life.”',
    why: 'Accusation hook + fast ASMR cuts; payoff arrives before the 3-second skip window.',
    reach: '1.4M', loves: '120K', accent: 'text-coral', poster: 'from-amber/30 via-ink2 to-ink',
    url: 'https://www.youtube.com/shorts/EXAMPLE_FOOD',
  },
  {
    niche: 'Education', platform: 'TikTok', format: 'Whiteboard explainer',
    hook: '“Read this before you post another video.”',
    why: 'Direct command hook; numbered structure keeps retention as the viewer waits for each point.',
    reach: '640K', loves: '51K', accent: 'text-amber', poster: 'from-coral/25 via-ink2 to-ink',
    url: 'https://www.tiktok.com/@EXAMPLE_EDU/video/1',
  },
  {
    niche: 'Business', platform: 'Reels', format: 'Day-in-the-life → lesson',
    hook: '“I made $0 for 2 years. Here’s what nobody tells you.”',
    why: 'Vulnerability + stakes; the loss frame earns trust before the lesson is delivered.',
    reach: '1.1M', loves: '98K', accent: 'text-teal', poster: 'from-teal/25 via-ink2 to-ink',
    url: 'https://www.instagram.com/reel/EXAMPLE_BIZ',
  },
  {
    niche: 'Lifestyle', platform: 'Shorts', format: 'Before/after glow-up',
    hook: '“6 months ago I quit one thing. Watch what happened.”',
    why: 'Time-jump promise; the visual contrast does the persuading while VO adds the why.',
    reach: '720K', loves: '64K', accent: 'text-coral', poster: 'from-amber/25 via-ink2 to-ink',
    url: 'https://www.youtube.com/shorts/EXAMPLE_LIFE',
  },
  {
    niche: 'Fitness', platform: 'TikTok', format: 'Mistake callout',
    hook: '“Stop doing this at the gym — it’s killing your gains.”',
    why: 'Negative hook targets a fear; quick demo of right vs. wrong holds to the end.',
    reach: '950K', loves: '81K', accent: 'text-amber', poster: 'from-coral/30 via-ink2 to-ink',
    url: 'https://www.tiktok.com/@EXAMPLE_FIT/video/1',
  },
  {
    niche: 'Education', platform: 'Reels', format: 'Story → framework',
    hook: '“This 10-second trick rewired how I study.”',
    why: 'Specific, low-effort promise; a named framework makes it feel saveable and shareable.',
    reach: '540K', loves: '47K', accent: 'text-teal', poster: 'from-teal/30 via-ink2 to-ink',
    url: 'https://www.instagram.com/reel/EXAMPLE_EDU2',
  },
]

const NICHES: Niche[] = ['All', 'Business', 'Fitness', 'Food', 'Education', 'Lifestyle']

export default function Gallery() {
  const navigate = useNavigate()
  const [niche, setNiche] = useState<Niche>('All')
  const [q, setQ] = useState('')

  const shown = useMemo(
    () =>
      REFS.filter((r) => (niche === 'All' || r.niche === niche))
        .filter((r) =>
          !q.trim()
            ? true
            : (r.format + r.hook + r.why + r.niche).toLowerCase().includes(q.trim().toLowerCase()),
        ),
    [niche, q],
  )

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
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone" />
              <input
                className="field pl-9"
                placeholder="Search formats…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
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
                      <span className={cn('text-xs font-bold uppercase tracking-wider', r.accent)}>{r.format}</span>
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
          Reach figures are rounded popularity bands for illustration, not live per-account analytics.
        </p>
      </div>
    </main>
  )
}
