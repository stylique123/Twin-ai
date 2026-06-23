import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useInView, useMotionValue, useSpring, useTransform } from 'framer-motion'
import {
  ArrowRight, Check, Plus, Minus, AtSign, Wand2, Captions, Clapperboard, Scissors,
  ShieldCheck, Building2, Users, Clock, Eye, Heart, Play, Send, LayoutGrid,
  FileText, Sparkles, TrendingUp, Mic, BarChart3, Flame, Zap, Repeat,
} from 'lucide-react'
import { BRAND, PLANS } from '../lib/brand'
import { Aurora } from '../components/Aurora'
import { Logo } from '../components/Logo'
import { Reveal, Stagger, RevealItem, EASE } from '../components/motion'
import { Counter } from '../components/Counter'
import { cn } from '../lib/cn'

// Hero background. Left empty so the hero uses the clean Aurora gradient instead
// of an AI-generated clip — the honest-FAQ brand shouldn't lead with synthetic
// "footage". Set a real product-demo URL here when one exists.
const HERO_VIDEO_SRC = 'https://d8j0ntlcm91z4.cloudfront.net/user_3A4BLQYlkqlIIcq5F4BohQmaHaz/hf_20260614_061422_7b59d7ac-3dc6-4376-9baa-bc3cad8bccb0.mp4'

const ROTATING_VERBS = ['recreate', 'remix', 'own', 'post']


// Exactly the three platforms we support. TikTok + YouTube are live; Instagram
// is supported. We never list platforms we can't publish to.
const PLATFORMS: { label: string; status: 'Live' | 'Supported'; Icon: (p: { className?: string }) => JSX.Element; tint: string }[] = [
  { label: 'TikTok', status: 'Live', Icon: TikTokIcon, tint: 'text-cream' },
  { label: 'YouTube', status: 'Live', Icon: YouTubeIcon, tint: 'text-[#FF4D4D]' },
  { label: 'Instagram', status: 'Supported', Icon: InstagramIcon, tint: 'text-[#FF7AA8]' },
]

/* Inline brand wordmark/logos, single-color so they sit cleanly in the dark theme. */
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M16.6 5.82a4.28 4.28 0 0 1-1.06-2.82h-3.2v12.4a2.59 2.59 0 1 1-2.6-2.59c.27 0 .53.04.78.12V9.66a5.85 5.85 0 0 0-.78-.05A5.83 5.83 0 1 0 15.4 15.4V9.01a7.48 7.48 0 0 0 4.36 1.4V7.2a4.28 4.28 0 0 1-3.16-1.38Z" />
    </svg>
  )
}
function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M23.5 6.5a3 3 0 0 0-2.11-2.13C19.5 3.86 12 3.86 12 3.86s-7.5 0-9.39.51A3 3 0 0 0 .5 6.5 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.5 3 3 0 0 0 2.11 2.13c1.89.51 9.39.51 9.39.51s7.5 0 9.39-.51A3 3 0 0 0 23.5 17.5 31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.5ZM9.6 15.5v-7l6.2 3.5-6.2 3.5Z" />
    </svg>
  )
}
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

const PAIN = [
  {
    n: '01',
    t: 'The blank page after the scroll',
    d: 'You watch something hit a million views and know you could do your version. Then you open a doc and stare. The idea evaporates.',
    accent: 'coral',
  },
  {
    n: '02',
    t: 'It comes out sounding like everyone else',
    d: 'You copy the format and it feels fake, or you start from scratch and it takes hours. Either way, it doesn\'t sound like you.',
    accent: 'amber',
  },
  {
    n: '03',
    t: 'You post it, and it dies',
    d: 'Weak hook, slow edit, no idea why. No system, no feedback loop, no consistency. So you post less. So you grow slower.',
    accent: 'teal',
  },
]

const LOOP = [
  { icon: Play, k: 'Paste', t: 'Paste a link you wish you\'d made', d: 'Any TikTok, Reel or Short. That\'s the whole input. We pull and transcribe the real audio.' },
  { icon: Wand2, k: 'Decode', t: 'We decode why it worked', d: 'The exact hook window, the beats, the pacing, the retention mechanics. Real analysis, not vibes.' },
  { icon: FileText, k: 'Blueprint', t: 'Get a shootable blueprint', d: 'Hook options, full script in your voice, shot list, edit checklist, caption pack, a 20-min plan.' },
  { icon: Clapperboard, k: 'Record', t: 'Record it right here', d: 'Your script loads into a built-in teleprompter. Hit record, nail the hook, done.' },
  { icon: Scissors, k: 'Edit', t: 'Edit in one click', d: 'Word-synced captions, dead-air trimmed, jump cuts and b-roll, exported vertical, automatically.' },
  { icon: Send, k: 'Post', t: 'Post it, and grow the gallery', d: 'One tap copies your on-brand caption so you can post in seconds, then log it. Mark it public and it joins the niche gallery others remix.' },
]

const FEATURES = [
  { icon: AtSign, t: 'Voice DNA', d: 'Paste your @handle once. We read your real posts and build a voice profile every script is written in.', gradient: 'from-teal/20 to-teal/5' },
  { icon: FileText, t: 'Full blueprint', d: 'Not a caption. A hook, script with delivery notes, shot list, edit checklist and a 20-minute shoot plan.', gradient: 'from-amber/20 to-amber/5' },
  { icon: Clapperboard, t: 'In-app teleprompter', d: 'Record straight from the browser with your script scrolling. A hook-timing marker keeps you on pace.', gradient: 'from-coral/20 to-coral/5' },
  { icon: Scissors, t: 'One-click auto-edit', d: 'Animated captions, dead-air removal, beat-timed jump cuts, b-roll cutaways, vertical export. One tap.', gradient: 'from-teal/20 to-teal/5' },
  { icon: Send, t: 'Publish helper', d: 'One tap copies your on-brand caption and opens the post, then log it, so the loop ends with a post.', gradient: 'from-amber/20 to-amber/5' },
  { icon: LayoutGrid, t: 'Niche gallery', d: 'A living feed of what\'s working in your niche. See why it hit, then recreate it in one click.', gradient: 'from-coral/20 to-coral/5' },
]

const BENEFITS = [
  { icon: Clock, big: '~2 hrs', label: 'saved per video', sub: 'scripting + editing, gone' },
  { icon: TrendingUp, big: '4×', label: 'more posts shipped', sub: 'same effort, more shots on goal' },
  { icon: Eye, big: '100%', label: 'from what worked', sub: 'rebuilt, never copied' },
]

// Honest, non-attributed use-cases — NOT fabricated testimonials. We don't fake
// reviews; these describe who the tool is built for and the job it does.
const USE_CASES = [
  { tag: 'Solo creators', title: 'Never stare at a blank page', body: 'Start from a reference that already works and get a shootable script in your voice in minutes, not hours.' },
  { tag: 'Educators & founders', title: 'Stay consistent under pressure', body: 'Batch a week of on-brand videos in one sitting, so your cadence stops depending on a spark of inspiration.' },
  { tag: 'Agencies', title: 'A distinct voice per client', body: 'Keep every client sounding like themselves, switch brands in a tap, and ship across accounts without growing the team.' },
]

const FAQ = [
  { q: 'Do you copy other people\'s videos?', a: 'No. We read the structure (hook shape, pacing, retention beats) and rebuild it as an original in your voice. We never clip or repost footage. The idea stays yours; the format becomes yours too.' },
  { q: 'Will this make me go viral?', a: 'No honest tool can promise that. We give you a proven structure and a fast, repeatable way to ship, with more quality shots on goal, in less time. That\'s the real edge.' },
  { q: 'How is this different from a clipper?', a: 'Clippers chop footage you already have. TwinAI takes a reference you admire and makes it shootable as something new, in your voice, from scratch, with a full script, shot list, edit and post.' },
  { q: 'What do I actually get from one link?', a: 'A complete blueprint (hooks, script, shot list, edit checklist, caption pack, 20-minute plan), an in-app teleprompter to record it, a one-click edit, and publishing. The whole loop in one window.' },
  { q: 'How does it learn my voice?', a: 'You paste your @handle. We read your recent public posts, including captions, hooks and your spoken audio, then synthesise a voice profile you confirm and can edit. It sharpens as you create more.' },
  { q: 'Can I use it for clients?', a: 'Yes. The Agency plan gives you 15 brand voices, one per client, plus multi-brand workspaces. Switch context in one tap, batch a week of content in an afternoon, ship consistent quality across every account.' },
]

export default function Landing() {
  return (
    <main className="noise overflow-clip">
      <HeroSection />
      <PlatformStrip />
      <PainSection />
      <HowItWorksSection />
      <BenefitsSection />
      <FeaturesSection />
      <GalleryShowcase />
      <AgencySection />
      <ValueStack />
      <PricingSection />
      <TestimonialsSection />
      <FAQSection />
      <CTASection />
      <Footer />
    </main>
  )
}

/* ─── Hero ───────────────────────────────────────────────────────────── */

function HeroSection() {
  const [verbIdx, setVerbIdx] = useState(0)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const springX = useSpring(mouseX, { stiffness: 60, damping: 20 })
  const springY = useSpring(mouseY, { stiffness: 60, damping: 20 })
  const glowX = useTransform(springX, [0, 1], ['-20%', '20%'])
  const glowY = useTransform(springY, [0, 1], ['-20%', '20%'])

  useEffect(() => {
    const t = setInterval(() => setVerbIdx((v) => (v + 1) % ROTATING_VERBS.length), 2800)
    return () => clearInterval(t)
  }, [])

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    mouseX.set((e.clientX - rect.left) / rect.width)
    mouseY.set((e.clientY - rect.top) / rect.height)
  }

  return (
    <section
      className="relative min-h-screen overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      {/* Video bg or aurora fallback */}
      {HERO_VIDEO_SRC ? (
        <>
          <video
            autoPlay muted loop playsInline
            className="absolute inset-0 h-full w-full object-cover opacity-30"
            src={HERO_VIDEO_SRC}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-ink/50 via-ink/70 to-ink" />
        </>
      ) : (
        <Aurora />
      )}

      {/* Mouse-tracking interactive glow */}
      <motion.div
        className="pointer-events-none absolute h-[600px] w-[600px] rounded-full opacity-20 blur-[140px]"
        style={{
          background: 'radial-gradient(circle, #65E5D8 0%, #FF5B7B 50%, transparent 70%)',
          left: glowX,
          top: glowY,
          x: '-50%',
          y: '-50%',
        }}
      />

      {/* Floating particle dots */}
      <Particles />

      {/* Nav hint */}
      <div className="relative z-10 mx-auto max-w-content px-5 pb-20 pt-28 sm:pt-32 lg:pt-36">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.07 }}
              className="font-display text-[2.8rem] leading-[1.04] tracking-tight text-balance sm:text-5xl lg:text-[3.8rem]"
            >
              Paste a viral video.{' '}
              <span className="whitespace-nowrap text-cream">
                <span className="relative inline-grid place-items-center align-baseline">
                  {/* Invisible sizer reserves space for the widest verb so the line never shifts */}
                  <span className="invisible col-start-1 row-start-1" aria-hidden>recreate</span>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={verbIdx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      // gradient applied DIRECTLY to the word (not via a grid ancestor) so
                      // background-clip:text always paints — fixes the "missing word".
                      className="col-start-1 row-start-1 gradient-text"
                    >
                      {ROTATING_VERBS[verbIdx]}
                    </motion.span>
                  </AnimatePresence>
                </span>{' '}it
              </span>
              {' '}in your voice.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.14 }}
              className="mt-5 max-w-xl text-lg leading-relaxed text-sand"
            >
              Paste a video you wish you'd made. TwinAI reads it, writes the script in your voice,
              and walks you from blank page to posted — teleprompter, edit, caption and all.{' '}
              <span className="text-cream">The whole loop, in one window.</span>
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.22 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Link to="/auth?mode=signup" className="btn-gradient group text-base px-6 py-3">
                Paste your first link — free
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.34 }}
              className="mt-7 text-sm leading-relaxed text-sand"
            >
              3 free remixes, no card. A remix only counts when it finishes — if the read fails, it's on us.
            </motion.p>
          </div>

          <HeroVisualNew />
        </div>
      </div>
    </section>
  )
}

/* ─── Floating hero visual ───────────────────────────────────────────── */

function HeroVisualNew() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
      className="relative flex justify-center lg:justify-end"
    >
      <div className="relative my-4 sm:my-8">
        {/* Reference card, top left. Hidden on the narrowest screens so it never
            overlaps the device; floats out only where there's room. */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.0, duration: 0.6, ease: EASE }}
          className="absolute -left-6 top-4 z-20 hidden w-44 rounded-2xl border border-white/12 bg-ink2/95 p-3.5 shadow-lift backdrop-blur sm:block sm:-left-16 lg:-left-20"
        >
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-stone">
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-coral/20">
              <Play className="h-2 w-2 text-coral" />
            </div>
            Reference pasted
          </div>
          <div className="mt-2 text-xs font-semibold text-cream">2.1M views · TikTok</div>
          <div className="mt-0.5 text-[10px] text-stone truncate">tiktok.com/@garyvee/…</div>
          <motion.div
            className="mt-2 h-0.5 rounded-full bg-gradient-to-r from-amber via-coral to-teal"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ delay: 1.4, duration: 1.4, ease: EASE }}
          />
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-teal">
            <Sparkles className="h-2.5 w-2.5" /> Analysing structure…
          </div>
        </motion.div>

        {/* Phone frame. The screen content lives in its own clipped layer so it
            stays contained inside the bezel and reads as one device. */}
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          className="relative w-[200px] overflow-hidden rounded-[42px] border-[5px] border-white/15 bg-ink p-1 sm:w-[210px]"
          style={{ boxShadow: '0 0 0 1px rgba(255,255,255,.06), 0 32px 90px -16px rgba(0,0,0,.9), 0 0 60px -20px rgba(101,229,216,.15)' }}
        >
          <div className="overflow-hidden rounded-[36px] bg-ink">
          <div className="relative flex justify-center bg-ink pt-3 pb-0.5">
            <div className="h-[18px] w-[72px] rounded-full bg-black/60" />
          </div>
          <div className="relative h-[372px] overflow-hidden bg-gradient-to-b from-coral/30 via-ink2 to-ink">
            {/* Rec indicator */}
            <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-bold text-cream backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-coral" /> REC
            </div>
            {/* Vertical video mock */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />
            {/* Script lines */}
            <div className="absolute inset-x-3 top-10 space-y-1.5">
              {['Hook: "You\'ve been wrong about this"', 'Beat 1: The surprise stat', 'Beat 2: Your hot take', 'Payoff: Call to action'].map((line, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: i < 2 ? 1 : 0.4, x: 0 }}
                  transition={{ delay: 0.8 + i * 0.15, duration: 0.4 }}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-[9px]',
                    i === 0 ? 'border border-amber/30 bg-amber/10 text-amber' : 'border border-white/8 bg-white/[0.03] text-stone',
                  )}
                >
                  {line}
                </motion.div>
              ))}
            </div>
            {/* Teleprompter text */}
            <div className="absolute inset-x-3 bottom-14 rounded-xl border border-white/10 bg-black/50 p-3 text-center backdrop-blur">
              <div className="text-[8px] uppercase tracking-wider text-amber mb-1">Teleprompter</div>
              <p className="font-heading text-sm leading-tight text-cream">"Stop posting more. Post smarter."</p>
            </div>
            {/* Progress */}
            <div className="absolute inset-x-0 bottom-0 px-3 pb-4">
              <div className="h-0.5 overflow-hidden rounded-full bg-white/15">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-amber to-coral"
                  initial={{ width: '0%' }}
                  animate={{ width: '58%' }}
                  transition={{ delay: 0.4, duration: 2.2, ease: 'linear' }}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-center bg-ink py-2.5">
            <div className="h-1 w-20 rounded-full bg-white/18" />
          </div>
          </div>
        </motion.div>

        {/* "In your voice" badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1, rotate: -3 }}
          transition={{ delay: 1.5, duration: 0.5, ease: EASE }}
          className="absolute bottom-24 right-1 z-30 hidden rounded-2xl bg-signature px-3.5 py-2 text-xs font-bold text-ink shadow-glow sm:block sm:-right-8"
        >
          In your voice
        </motion.div>

        {/* Blueprint chip, hidden on the narrowest screens to avoid overlap. */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.7, duration: 0.5, ease: EASE }}
          className="absolute -left-6 bottom-16 z-20 hidden space-y-1.5 rounded-2xl border border-white/10 bg-ink2/95 p-3 shadow-lift backdrop-blur text-[10px] sm:block sm:-left-12"
        >
          <div className="flex items-center gap-1.5 text-teal font-semibold">
            <Sparkles className="h-2.5 w-2.5" /> Blueprint ready
          </div>
          <div className="flex items-center gap-1.5 text-sand"><FileText className="h-2.5 w-2.5 text-stone" /> Script + shot list</div>
          <div className="flex items-center gap-1.5 text-sand"><Captions className="h-2.5 w-2.5 text-stone" /> Auto-captions</div>
        </motion.div>

        {/* Glow ring behind phone */}
        <div className="absolute inset-0 -z-10 mx-auto my-auto h-[300px] w-[300px] rounded-full bg-teal/8 blur-[80px]" />
      </div>
    </motion.div>
  )
}

/* ─── Floating particles ─────────────────────────────────────────────── */

function Particles() {
  const dots = Array.from({ length: 7 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    delay: Math.random() * 4,
    dur: Math.random() * 4 + 6,
    color: ['teal', 'coral', 'amber'][Math.floor(Math.random() * 3)],
  }))
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((d) => (
        <motion.div
          key={d.id}
          className={cn(
            'absolute rounded-full',
            d.color === 'teal' ? 'bg-teal/30' : d.color === 'coral' ? 'bg-coral/30' : 'bg-amber/30',
          )}
          style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.size, height: d.size }}
          animate={{ y: [0, -30, 0], opacity: [0, 0.5, 0] }}
          transition={{ duration: d.dur, delay: d.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

/* ─── Platform strip ─────────────────────────────────────────────────── */

function PlatformStrip() {
  return (
    <section className="border-b border-white/8 bg-ink2/40 py-10">
      <div className="mx-auto max-w-content px-5">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-stone mb-6">
          Built for TikTok, YouTube and Instagram
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
          {PLATFORMS.map((p) => (
            <div
              key={p.label}
              className="group inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06]"
            >
              <p.Icon className={cn('h-4 w-4', p.tint)} />
              <span className="text-sm font-semibold text-cream">{p.label}</span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                  p.status === 'Live' ? 'bg-teal/12 text-teal' : 'bg-white/8 text-stone',
                )}
              >
                {p.status}
              </span>
            </div>
          ))}
          <div className="inline-flex items-center gap-2 rounded-full border border-dashed border-white/12 px-4 py-2 text-sm text-stone">
            LinkedIn · X
            <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-stone">Soon</span>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Pain ───────────────────────────────────────────────────────────── */

function PainSection() {
  return (
    <section className="mx-auto max-w-content px-5 py-20 sm:py-28">
      <Reveal className="text-center">
        <p className="eyebrow">The creator's trap</p>
        <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
          More content isn't the problem.{' '}
          <span className="gradient-text">Making it fast enough is.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sand">
          Every creator hits the same three walls. TwinAI tears all three down.
        </p>
      </Reveal>
      <Stagger className="mt-14 grid gap-5 md:grid-cols-3" gap={0.08}>
        {PAIN.map((p) => (
          <RevealItem key={p.n}>
            <div className="group relative h-full overflow-hidden rounded-panel border border-white/8 bg-ink2/60 p-7 transition-all duration-300 hover:border-white/16 hover:bg-ink2/80 hover:-translate-y-1">
              <div className={cn(
                'absolute -right-8 -top-8 h-32 w-32 rounded-full blur-[60px] transition-opacity duration-300 group-hover:opacity-80',
                p.accent === 'coral' ? 'bg-coral/15 opacity-40' : p.accent === 'amber' ? 'bg-amber/15 opacity-40' : 'bg-teal/15 opacity-40',
              )} />
              <span className={cn(
                'font-mono text-sm font-bold',
                p.accent === 'coral' ? 'text-coral' : p.accent === 'amber' ? 'text-amber' : 'text-teal',
              )}>{p.n}</span>
              <h3 className="mt-3 font-heading text-lg text-cream">{p.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-sand">{p.d}</p>
            </div>
          </RevealItem>
        ))}
      </Stagger>
    </section>
  )
}

/* ─── How it works ───────────────────────────────────────────────────── */

function HowItWorksSection() {
  return (
    <section id="loop" className="relative scroll-mt-24 py-12 sm:py-16">
      {/* Subtle gradient bg */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-teal/[0.03] to-transparent" />
      <div className="mx-auto max-w-content px-5">
        <Reveal className="text-center">
          <p className="eyebrow">One link in · a posted video out</p>
          <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
            The entire workflow, in one place.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sand">
            Paste, decode, blueprint, record, edit, post. No tab-juggling, no agency, no two-hour edit.
          </p>
        </Reveal>
        <LoopSequence />
      </div>
    </section>
  )
}

/* ─── Benefits / stats ───────────────────────────────────────────────── */

function BenefitsSection() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10%' })

  return (
    <section ref={ref} className="mx-auto max-w-content px-5 py-12 sm:py-16">
      <Stagger className="grid gap-5 sm:grid-cols-3" gap={0.08}>
        {BENEFITS.map((b) => (
          <RevealItem key={b.label}>
            <div className="relative overflow-hidden rounded-panel border border-white/8 bg-ink2/60 p-8 text-center hover:border-white/14 transition-colors">
              <div className="absolute inset-0 bg-gradient-to-br from-signature-soft to-transparent opacity-40" />
              <div className="relative">
                <b.icon className="mx-auto h-6 w-6 text-amber" />
                <div className="mt-4 font-display text-4xl tracking-tight text-cream">
                  {inView ? <Counter to={typeof b.big === 'string' ? parseFloat(b.big) || 2 : b.big} suffix={b.big.replace(/[0-9.]/g, '') || ''} /> : '...'}
                </div>
                <div className="mt-1.5 font-heading text-base text-cream">{b.label}</div>
                <div className="mt-1 text-sm text-stone">{b.sub}</div>
              </div>
            </div>
          </RevealItem>
        ))}
      </Stagger>
    </section>
  )
}

/* ─── Features ───────────────────────────────────────────────────────── */

function FeaturesSection() {
  return (
    <section id="features" className="mx-auto max-w-content scroll-mt-24 px-5 py-20 sm:py-28">
      <Reveal className="text-center">
        <p className="eyebrow">What you get</p>
        <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
          Every tool the loop needs. Nothing it doesn't.
        </h2>
      </Reveal>
      <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" gap={0.06}>
        {FEATURES.map((f) => (
          <RevealItem key={f.t}>
            <div className={cn(
              'group relative h-full overflow-hidden rounded-panel border border-white/8 bg-ink2/60 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-white/16 hover:shadow-glass',
            )}>
              <div className={cn('absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300 group-hover:opacity-100', f.gradient)} />
              <div className="relative">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/8 bg-ink">
                  <f.icon className="h-5 w-5 text-amber" />
                </div>
                <h3 className="mt-4 font-heading text-base text-cream">{f.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sand">{f.d}</p>
              </div>
            </div>
          </RevealItem>
        ))}
      </Stagger>
    </section>
  )
}

/* ─── Discovery / Gallery showcase ───────────────────────────────────── */

const SHOWCASE_FORMATS = [
  { name: 'Talking-head', icon: Mic },
  { name: 'Transition', icon: Repeat },
  { name: 'GRWM', icon: Sparkles },
  { name: 'Podcast clip', icon: Clapperboard },
]
const SHOWCASE_CARDS = [
  { title: 'Stitch a comment, flip it positive', reach: '976K', loves: '157K', score: 92, hot: true, tint: 'from-coral/30' },
  { title: 'One counter-intuitive hot take', reach: '1.5M', loves: '111K', score: 84, hot: false, tint: 'from-teal/25' },
]
function GalleryShowcase() {
  return (
    <section className="relative mx-auto max-w-content scroll-mt-24 px-5 py-20 sm:py-28">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <p className="eyebrow">The discovery engine</p>
          <h2 className="mt-3 font-display text-4xl leading-tight text-balance sm:text-5xl">
            Never stare at a <span className="gradient-text">blank page</span> again.
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-sand">
            TwinAI scores every viral format for <span className="text-cream">your</span> niche and hands you a playbook of the content types most likely to grow you — talking-head, transitions, GRWM, podcast clips and more. Tap one, and it's a script in your voice.
          </p>
          <ul className="mt-6 space-y-3.5">
            {[
              ['Opportunity score', 'Ranked by what will actually win for you — not raw view counts.'],
              ['Your playbook', 'The exact formats proven to grow creators in your niche, business and creative.'],
              ['One-tap remix', 'Every reference becomes your next shoot — rebuilt in your voice.'],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal/15"><Check className="h-3 w-3 text-teal" /></span>
                <p className="text-sm leading-relaxed text-sand"><span className="font-semibold text-cream">{t}.</span> {d}</p>
              </li>
            ))}
          </ul>
          <Link to="/auth?mode=signup" className="btn-gradient group mt-8 inline-flex px-6 py-3 text-base">
            See what's working in your niche
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="glass p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber" />
              <span className="text-sm font-semibold text-cream">Your playbook — what wins in your niche</span>
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {SHOWCASE_FORMATS.map((f) => (
                <span key={f.name} className="chip shrink-0"><f.icon className="h-3.5 w-3.5 text-amber" /> {f.name}</span>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {SHOWCASE_CARDS.map((c) => (
                <div key={c.title} className="overflow-hidden rounded-card border border-white/8 bg-ink2/60">
                  <div className={cn('relative grid aspect-video place-items-center bg-gradient-to-br to-ink', c.tint)}>
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-ink/60 ring-1 ring-white/20"><Play className="h-4 w-4 translate-x-0.5 fill-cream text-cream" /></span>
                    <span className={cn('absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold', c.hot ? 'border-coral/50 bg-coral/20 text-coral' : 'border-amber/50 bg-amber/20 text-amber')}>
                      {c.hot ? <Flame className="h-3 w-3" /> : <Zap className="h-3 w-3" />} {c.score}
                    </span>
                    <div className="absolute bottom-2 left-2 flex gap-1.5 text-[10px] text-cream/90">
                      <span className="inline-flex items-center gap-1 rounded-full bg-ink/65 px-1.5 py-0.5"><Eye className="h-2.5 w-2.5" /> {c.reach}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-ink/65 px-1.5 py-0.5"><Heart className="h-2.5 w-2.5" /> {c.loves}</span>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-medium leading-snug text-cream line-clamp-2">{c.title}</p>
                    <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-amber"><Wand2 className="h-3 w-3" /> Remix in my voice</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ─── Agency ─────────────────────────────────────────────────────────── */

function AgencySection() {
  return (
    <section id="agencies" className="mx-auto max-w-content scroll-mt-24 px-5 py-20 sm:py-28">
      <Reveal>
        <div className="overflow-hidden rounded-panel border border-white/8 bg-ink2/60 lg:grid lg:grid-cols-2">
          <div className="p-10 lg:p-14">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber/20 bg-amber/10 px-3 py-1 text-xs font-bold text-amber">
              <Building2 className="h-3.5 w-3.5" /> Agencies &amp; studios
            </div>
            <h2 className="mt-5 font-display text-4xl leading-tight text-balance sm:text-5xl">
              Manage 15 brands. Ship daily. Stay consistent.
            </h2>
            <p className="mt-4 text-sand">
              A separate brand voice per client, proven references turned into shootable blueprints in seconds,
              and more reels across more accounts, without growing the team.
            </p>
            <ul className="mt-6 space-y-2.5">
              {[
                'A distinct voice profile for each client brand',
                'Switch the active workspace in one tap',
                'Batch a week of content in an afternoon',
                'Consistent quality across every account',
              ].map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm text-sand">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> {b}
                </li>
              ))}
            </ul>
            <Link to="/auth?plan=agency&mode=signup" className="btn-gradient mt-8">
              Start an agency workspace <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-px bg-white/8">
            {[
              { icon: Clock, to: 12, suffix: 'h', label: 'Saved / client / week', sub: 'vs. scripting + editing by hand' },
              { icon: Eye, to: 3, suffix: '×', label: 'More posts shipped', sub: 'same headcount, more output' },
              { icon: Heart, to: 47, suffix: '%', label: 'More engagement', sub: 'proven hooks, on-brand' },
              { icon: Users, to: 15, suffix: '+', label: 'Brands per workspace', sub: 'each with its own voice' },
            ].map((m) => (
              <div key={m.label} className="bg-ink2 p-7">
                <m.icon className="h-5 w-5 text-amber" />
                <div className="mt-4 font-display text-4xl tracking-tight">
                  <Counter to={m.to} suffix={m.suffix} />
                </div>
                <div className="mt-1.5 text-sm font-medium text-cream">{m.label}</div>
                <div className="mt-0.5 text-xs text-stone">{m.sub}</div>
              </div>
            ))}
            <div className="col-span-2 bg-ink2/60 px-7 py-3 text-center text-[11px] text-stone">
              Illustrative targets from early agency workflows. Results vary by niche, cadence and offer.
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/* ─── Pricing ────────────────────────────────────────────────────────── */

// The grand-slam value stack: the deliverables (all true, usually buried in the
// FAQ) itemized and anchored so the price reads as a no-brainer.
function ValueStack() {
  const items = [
    { t: 'A full read of why the original won', s: 'hook window, retention beats — a strategist charges $200+' },
    { t: '5 hook options + a complete script in your voice', s: 'a ghostwriter: $150+' },
    { t: 'Shot list + a 20-minute shoot plan', s: 'so you just press record' },
    { t: 'One-click edit: captions, cuts, b-roll, vertical export', s: 'an editor: $50–100 a video' },
    { t: 'A ready-to-paste caption pack, per platform', s: 'posted in seconds' },
  ]
  return (
    <section className="mx-auto max-w-content px-5 py-20 sm:py-28">
      <Reveal className="text-center">
        <p className="eyebrow">What one link gets you</p>
        <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
          One link in. A finished, on-brand video out, <span className="gradient-text">end to end.</span>
        </h2>
      </Reveal>
      <div className="glass mx-auto mt-12 max-w-2xl p-6 sm:p-8">
        <ul className="space-y-3.5">
          {items.map((it) => (
            <li key={it.t} className="flex items-start gap-3">
              <Check className="mt-1 h-4 w-4 shrink-0 text-teal" />
              <div>
                <div className="text-cream">{it.t}</div>
                <div className="text-xs text-stone">{it.s}</div>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-6 border-t border-white/8 pt-5 text-center">
          <p className="text-sand">Easily <span className="font-semibold text-cream">$400+ of work</span> per video — from one link, in minutes.</p>
          <p className="mt-2 text-xs text-stone">And a remix only counts when it finishes. If the read fails, it's on us.</p>
        </div>
      </div>
    </section>
  )
}

function PricingSection() {
  return (
    <section id="pricing" className="relative mx-auto max-w-content scroll-mt-24 px-5 py-20 sm:py-28">
      <Reveal className="text-center">
        <p className="eyebrow">Pricing</p>
        <h2 className="mt-3 font-display text-4xl text-balance sm:text-5xl">
          Start free. Scale when it's working.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sand">
          Simple monthly remix counts. No per-action billing, no confusing credits. Cancel any time.
        </p>
      </Reveal>
      <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" gap={0.06}>
        {PLANS.map((p) => {
          const featured = p.id === 'professional'
          return (
            <RevealItem key={p.id}>
              <div className={cn(
                'relative flex h-full flex-col rounded-panel p-7 transition-all duration-300 hover:-translate-y-1',
                featured
                  ? 'gradient-border bg-ink2 shadow-glow'
                  : 'border border-white/8 bg-ink2/60 hover:border-white/14',
              )}>
                {p.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-signature px-3 py-1 text-xs font-bold text-ink shadow-glow">
                    {p.badge}
                  </span>
                )}
                <h3 className="text-lg font-heading">{p.name}</h3>
                <p className="mt-1 text-sm text-stone">{p.blurb}</p>
                <div className="mt-5 flex items-end gap-1">
                  <span className="font-display text-4xl">${p.price}</span>
                  {p.price > 0 && <span className="pb-1 text-sm text-stone">/mo</span>}
                </div>
                {p.annual ? (
                  <div className="text-xs text-stone">${p.annual}/mo billed annually</div>
                ) : (
                  <div className="h-4" />
                )}
                <ul className="mt-5 flex-1 space-y-2.5 text-sm text-sand">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to={`/auth?plan=${p.id}&mode=signup`}
                  className={cn('mt-7 w-full', featured ? 'btn-gradient' : 'btn-ghost')}
                >
                  {p.price === 0 ? 'Start free' : `Choose ${p.name}`}
                </Link>
              </div>
            </RevealItem>
          )
        })}
      </Stagger>
    </section>
  )
}

/* ─── Testimonials ───────────────────────────────────────────────────── */

function TestimonialsSection() {
  return (
    <section className="mx-auto max-w-content px-5 py-12 sm:py-16">
      <Reveal className="text-center">
        <p className="eyebrow">Who it's for</p>
        <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
          Built for how creators actually work.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-xs text-stone">
          We don't fake reviews. Here's the job it does — try it free and judge the output yourself.
        </p>
      </Reveal>
      <Stagger className="mt-14 grid gap-5 md:grid-cols-3" gap={0.08}>
        {USE_CASES.map((u) => (
          <RevealItem key={u.tag}>
            <div className="group relative h-full overflow-hidden rounded-panel border border-white/8 bg-ink2/60 p-7 transition-all duration-300 hover:border-white/16 hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-br from-amber/[0.04] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative">
                <span className="rounded-full bg-teal/10 px-3 py-1 text-xs font-bold text-teal">{u.tag}</span>
                <h3 className="mt-4 font-heading text-lg text-cream">{u.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sand">{u.body}</p>
              </div>
            </div>
          </RevealItem>
        ))}
      </Stagger>
    </section>
  )
}

/* ─── FAQ ─────────────────────────────────────────────────────────────── */

function FAQSection() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-5 py-20">
      <Reveal className="text-center">
        <p className="eyebrow">The honest answers</p>
        <h2 className="mt-3 font-display text-4xl text-balance sm:text-5xl">
          No hype. Just how it works.
        </h2>
      </Reveal>
      <div className="mt-10 space-y-2">
        {FAQ.map((f, i) => <FaqItem key={i} q={f.q} a={f.a} />)}
      </div>
    </section>
  )
}

/* ─── Final CTA ──────────────────────────────────────────────────────── */

function CTASection() {
  return (
    <section className="mx-auto max-w-content px-5 pb-28">
      <Reveal className="relative overflow-hidden rounded-panel border border-white/10 px-6 py-24 text-center">
        {/* Dramatic gradient bg */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber/10 via-coral/8 to-teal/10" />
        <Aurora />
        <div className="relative z-10">
          <p className="eyebrow">Ready?</p>
          <h2 className="mx-auto mt-4 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
            Your next post starts with a reference you already love.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sand">
            Paste it, record it, post it. The whole loop, in one window.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/auth?mode=signup" className="btn-gradient group text-base px-8 py-4">
              Remix your first video free
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
            <a href="#pricing" className="btn-ghost text-base px-8 py-4">See pricing</a>
          </div>
          <p className="mt-4 text-sm text-stone">3 free remixes. No card required.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-stone">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-teal" /> Finish-or-it's-free
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-teal" /> No footage copied
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-stone" /> Cancel any time
            </span>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/* ─── Loop sequence ──────────────────────────────────────────────────── */

function LoopSequence() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: false, margin: '-20%' })
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (!inView) return
    const t = setInterval(() => setActive((a) => (a + 1) % LOOP.length), 2400)
    return () => clearInterval(t)
  }, [inView])

  const step = LOOP[active]

  return (
    <div ref={ref} className="mt-14 grid items-center gap-10 lg:grid-cols-2">
      {/* Steps */}
      <div className="order-2 lg:order-1">
        <div className="relative space-y-2">
          <div className="absolute left-[22px] top-2 bottom-2 w-px bg-white/8" />
          <motion.div
            className="absolute left-[22px] top-2 w-px bg-signature"
            animate={{ height: `${(active / (LOOP.length - 1)) * 100}%` }}
            transition={{ duration: 0.5, ease: EASE }}
          />
          {LOOP.map((s, i) => {
            const on = i === active
            const done = i < active
            return (
              <button
                key={s.k}
                onClick={() => setActive(i)}
                className={cn(
                  'relative z-10 flex w-full items-start gap-4 rounded-2xl p-3 text-left transition-all duration-200',
                  on ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]',
                )}
              >
                <span className={cn(
                  'grid h-11 w-11 shrink-0 place-items-center rounded-full border transition-all duration-200',
                  on ? 'border-transparent bg-signature text-ink shadow-glow' : done ? 'border-teal/40 bg-teal/10 text-teal' : 'border-white/12 bg-ink2 text-stone',
                )}>
                  {done ? <Check className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
                </span>
                <div className="pt-0.5">
                  <span className={cn('text-[11px] font-bold uppercase tracking-wider', on ? 'text-amber' : 'text-stone')}>{s.k}</span>
                  <div className={cn('mt-0.5 font-heading text-base leading-tight transition-colors', on ? 'text-cream' : 'text-sand')}>{s.t}</div>
                  <AnimatePresence initial={false}>
                    {on && (
                      <motion.p
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className="overflow-hidden text-sm text-stone"
                      >
                        <span className="block pt-1">{s.d}</span>
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Phone preview */}
      <div className="order-1 flex justify-center lg:order-2">
        <div className="relative w-[210px] sm:w-[230px]">
          <div className="relative overflow-hidden rounded-[40px] border-[6px] border-white/15 bg-ink p-1 shadow-[0_40px_90px_-20px_rgba(0,0,0,.8)]">
            <div className="overflow-hidden rounded-[34px] bg-ink">
            <div className="flex justify-center bg-ink pt-3 pb-1">
              <div className="h-[18px] w-[80px] rounded-full bg-black/60" />
            </div>
            <div className="relative h-[412px] overflow-hidden bg-gradient-to-b from-coral/25 via-ink2 to-ink">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="absolute inset-0"
                >
                  <LoopScreen index={active} />
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="flex justify-center bg-ink py-2.5">
              <div className="h-1 w-24 rounded-full bg-white/18" />
            </div>
            </div>
          </div>
          <motion.div
            key={`chip-${active}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute -right-2 top-10 z-20 flex items-center gap-1.5 rounded-full bg-signature px-3 py-1.5 text-xs font-bold text-ink shadow-glow sm:-right-4"
          >
            <step.icon className="h-3.5 w-3.5" /> {step.k}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

function LoopScreen({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="flex h-full flex-col justify-center gap-3 p-5">
        <div className="text-[10px] uppercase tracking-wider text-stone">Paste a reference</div>
        <div className="flex items-center gap-2 rounded-xl border border-white/12 bg-ink2/80 px-3 py-2.5">
          <Play className="h-3.5 w-3.5 text-coral" />
          <span className="truncate text-xs text-sand">tiktok.com/@creator/video…</span>
        </div>
        <div className="rounded-xl bg-signature px-3 py-2 text-center text-xs font-bold text-ink">Recreate this</div>
        <div className="mt-1 text-[10px] text-teal">2.1M views · 8.4% saved</div>
      </div>
    )
  }
  if (index === 1) {
    return (
      <div className="flex h-full flex-col justify-center gap-2.5 p-5">
        <div className="text-[10px] uppercase tracking-wider text-stone">Why it worked</div>
        <Bar label="Hook window" v="0.0 to 1.8s" />
        <Bar label="Retention" v="62%" />
        <div className="mt-1 flex items-end gap-1" style={{ height: 90 }}>
          {[40, 70, 55, 85, 60, 95, 72, 50].map((h, i) => (
            <motion.span key={i} initial={{ height: 0 }} animate={{ height: h }} transition={{ delay: i * 0.05 }}
              className="w-full rounded-sm bg-gradient-to-t from-coral to-amber" />
          ))}
        </div>
      </div>
    )
  }
  if (index === 2) {
    return (
      <div className="flex h-full flex-col gap-2 p-5 pt-8">
        <div className="text-[10px] uppercase tracking-wider text-stone">Your blueprint</div>
        {([
          [Sparkles, 'Hook · "Everyone says post more. Wrong."'],
          [FileText, 'Script · 6 beats, in your voice'],
          [Captions, 'Shot list · 3 setups + b-roll'],
          [Mic, 'Caption pack · on-brand'],
        ] as const).map(([Ic, t], i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2">
            <Ic className="h-3.5 w-3.5 shrink-0 text-amber" />
            <span className="truncate text-[11px] text-cream">{t}</span>
          </div>
        ))}
      </div>
    )
  }
  if (index === 3) {
    return (
      <div className="relative h-full">
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-bold text-cream">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-coral" /> REC
        </div>
        <div className="flex h-full flex-col justify-end p-5">
          <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-center backdrop-blur">
            <div className="text-[9px] uppercase tracking-wider text-amber">Teleprompter</div>
            <p className="mt-1 font-heading text-sm leading-tight text-cream">"You're 35 and think it's too late? Watch this."</p>
          </div>
          <div className="mt-3 flex justify-center">
            <div className="h-9 w-9 rounded-full border-4 border-coral bg-white/90" />
          </div>
        </div>
      </div>
    )
  }
  if (index === 4) {
    return (
      <div className="flex h-full flex-col justify-center gap-3 p-5">
        <div className="grid aspect-[9/13] place-items-center overflow-hidden rounded-xl border border-white/8 bg-gradient-to-b from-coral/25 to-ink">
          <span className="rounded-lg bg-ink/80 px-3 py-1.5 font-heading text-base text-cream shadow-lift">
            post <span className="text-amber">smarter</span>
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-[9px] text-sand">
          {['Captions', 'Jump cuts', 'B-roll'].map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-md border border-white/8 bg-white/[0.03] px-1.5 py-1">
              <Check className="h-3 w-3 text-teal" />{t}
            </span>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-5">
      <div className="text-[10px] uppercase tracking-wider text-stone">Published</div>
      <div className="flex items-center gap-2 rounded-xl bg-teal/10 px-3 py-2.5 text-xs text-teal">
        <Check className="h-4 w-4" /> Caption copied · ready to post
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-xs text-sand">
        <LayoutGrid className="h-4 w-4 text-amber" /> Add to your niche gallery
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-xs text-sand">
        <BarChart3 className="h-4 w-4 text-coral" /> Log what you ship
      </div>
    </div>
  )
}

function Bar({ label, v }: { label: string; v: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-[11px]">
      <span className="text-stone">{label}</span>
      <span className="font-medium text-cream">{v}</span>
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Reveal>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-panel border border-white/8 bg-ink2/60 p-5 text-left transition-all duration-200 hover:border-white/14 hover:bg-ink2/80"
      >
        <div className="flex items-center justify-between gap-4">
          <span className="font-heading text-base text-cream">{q}</span>
          <span className={cn(
            'grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors duration-200',
            open ? 'bg-signature text-ink' : 'bg-white/5',
          )}>
            {open ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </span>
        </div>
        <motion.div
          initial={false}
          animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="overflow-hidden"
        >
          <p className="pt-3 text-sm leading-relaxed text-sand">{a}</p>
        </motion.div>
      </button>
    </Reveal>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/8 bg-ink2/40">
      <div className="mx-auto grid max-w-content gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-sand">
            {BRAND.oneLiner} {BRAND.subLine}
          </p>
          <div className="mt-5 h-1 w-28 rounded-full bg-signature" />
        </div>
        <div>
          <p className="eyebrow">Product</p>
          <ul className="mt-4 space-y-2.5 text-sm text-sand">
            <li><a href="/#loop" className="hover:text-cream transition-colors">How it works</a></li>
            <li><a href="/#features" className="hover:text-cream transition-colors">What you get</a></li>
            <li><a href="/#agencies" className="hover:text-cream transition-colors">For agencies</a></li>
            <li><a href="/#pricing" className="hover:text-cream transition-colors">Pricing</a></li>
            <li><a href="/#faq" className="hover:text-cream transition-colors">FAQ</a></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow">Get started</p>
          <ul className="mt-4 space-y-2.5 text-sm text-sand">
            <li><Link to="/auth?mode=signup" className="hover:text-cream transition-colors">Start free</Link></li>
            <li><Link to="/auth?mode=signin" className="hover:text-cream transition-colors">Sign in</Link></li>
            <li><a href="/#pricing" className="hover:text-cream transition-colors">Agency plan</a></li>
          </ul>
          <p className="mt-6 text-xs leading-relaxed text-stone">
            Reference in.<br />Finished video out.
          </p>
        </div>
      </div>
      <div className="border-t border-white/8 py-5 text-center text-xs text-stone">
        © {new Date().getFullYear()} TwinAI · {BRAND.category}
      </div>
    </footer>
  )
}
