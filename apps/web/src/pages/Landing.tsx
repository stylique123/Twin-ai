import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useInView, useMotionValue, useSpring, useTransform } from 'framer-motion'
import {
  ArrowRight, Check, Plus, Minus, AtSign, Wand2, Captions, Clapperboard, Scissors,
  ShieldCheck, Building2, Users, Clock, Eye, Heart, Play, Send, LayoutGrid,
  FileText, Sparkles, TrendingUp, Mic, BarChart3, Flame, Zap, Repeat,
} from 'lucide-react'
import { BRAND, PLANS, PAYMENTS_LIVE } from '../lib/brand'
import { Aurora } from '../components/Aurora'
import { Logo } from '../components/Logo'
import { Reveal, Stagger, RevealItem, EASE } from '../components/motion'
import { Counter } from '../components/Counter'
import { cn } from '../lib/cn'

// Brand footage (generated in-house with Higgsfield). One CDN base, then the
// specific clips: an abstract liquid-light loop behind the hero + pain sections,
// and four different vertical creator reels so the device mocks + showcase show
// REAL, varied footage instead of one clip on repeat.
const HF = 'https://d8j0ntlcm91z4.cloudfront.net/user_3A4BLQYlkqlIIcq5F4BohQmaHaz/'
const HERO_VIDEO_SRC = HF + 'hf_20260614_061422_7b59d7ac-3dc6-4376-9baa-bc3cad8bccb0.mp4' // the original brand hero clip (hero + pain bg)
const HERO_PHONE_VIDEO = HF + 'hf_20260623_023132_98fe4f69-1b34-415e-8d5a-9627cec28c29.mp4' // founder talking-head, 9:16
const REEL = {
  founder: HF + 'hf_20260623_023132_98fe4f69-1b34-415e-8d5a-9627cec28c29.mp4',
  beauty:  HF + 'hf_20260623_023134_b4da463a-9a9b-45b7-ac53-7b7f30d4cf77.mp4',
  food:    HF + 'hf_20260623_023138_bc9b8790-daeb-44e5-9521-85f9bfa85a7d.mp4',
  fitness: HF + 'hf_20260623_023153_2e6a4b56-e474-439d-9e13-0c5b373425d8.mp4',
}



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
    t: "You don't know what to post",
    d: 'You save fifty videos you love, then stare at a blank screen with nowhere to start.',
    fix: 'Found one you love? Paste the link and make it yours. No link in mind? Start here — TwinAI shows you what\'s already winning in your niche. Pick one and go.',
    accent: 'coral',
  },
  {
    n: '02',
    t: "It never comes out like it did in your head",
    d: 'Copy the format and it feels fake. Build from scratch and you sound like everyone else.',
    fix: 'TwinAI rebuilds the idea in your voice — so it lands like you, not a template.',
    accent: 'amber',
  },
  {
    n: '03',
    t: 'One video eats your whole night across five apps',
    d: 'Script in one tab, record on your phone, edit in CapCut, captions somewhere else, then schedule in yet another tool. So you post less, and the algorithm forgets you.',
    fix: 'With TwinAI it\'s one window: paste → script → record → fully edit → render → post. You never switch apps. Minutes, not nights.',
    accent: 'teal',
  },
]

const LOOP = [
  { icon: Play, k: 'Paste', t: 'Paste any link', d: 'Drop the link to any TikTok, Reel or Short. No link in mind? Pick from what\'s trending in your niche.' },
  { icon: FileText, k: 'Get your script', t: 'Get your script', d: 'TwinAI reads the real video and rewrites it in your voice — hooks, full script, shot list, caption pack.' },
  { icon: Clapperboard, k: 'Record', t: 'Record', d: 'The built-in teleprompter walks you through it. Hit record, nail the hook, done.' },
  { icon: Scissors, k: 'Edit + render', t: 'Edit + render', d: 'Real editing — cuts, captions, polish — rendered inside the app. No CapCut, no exporting.' },
  { icon: Send, k: 'Post', t: 'Post', d: 'Caption, hashtags, best time, and one-tap posting. Right from here. You never leave the app.' },
]

const FEATURES = [
  { icon: AtSign, t: 'Voice DNA', d: 'Paste your @handle once. We read your real posts and build a voice profile every script is written in.', gradient: 'from-teal/20 to-teal/5' },
  { icon: FileText, t: 'Full script', d: 'Not a caption. A hook, script with delivery notes, shot list, edit checklist and a 20-minute shoot plan.', gradient: 'from-amber/20 to-amber/5' },
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
  { tag: 'Solo creators', title: 'Always know what to post', body: 'Start from a format that already works and get a shootable script in your voice in minutes, not hours.' },
  { tag: 'Educators & founders', title: 'Show up consistently, without the grind', body: 'Batch a week of on-brand videos in one sitting, so your cadence stops depending on a spark of inspiration.' },
  { tag: 'Agencies', title: 'A distinct voice for every client', body: 'Keep every client sounding like themselves, switch brands in a tap, and ship across accounts without growing the team.' },
]

const FAQ = [
  { q: 'Do you copy other people\'s videos?', a: 'No. We read the structure (hook shape, pacing, retention beats) and rebuild it as an original in your voice. We never clip or repost footage. The idea stays yours; the format becomes yours too.' },
  { q: 'Will this make me go viral?', a: 'No honest tool can promise that. We give you a proven structure and a fast, repeatable way to ship, with more quality shots on goal, in less time. That\'s the real edge.' },
  { q: 'How is this different from a clipper?', a: 'Clippers chop footage you already have. TwinAI takes a reference you admire and makes it shootable as something new, in your voice, from scratch, with a full script, shot list, edit and post.' },
  { q: 'What do I actually get from one link?', a: 'A complete script (hooks, script, shot list, edit checklist, caption pack, 20-minute plan), an in-app teleprompter to record it, a one-click edit, and publishing. The whole loop in one window.' },
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
      <PasteDemoSection />
      <GalleryShowcase />
      <FeaturesSection />
      <AgencySection />
      <ValueStack />
      <PricingSection />
      <ReferralSection />
      <TestimonialsSection />
      <FAQSection />
      <CTASection />
      <Footer />
    </main>
  )
}

/* ─── Hero ───────────────────────────────────────────────────────────── */

function HeroSection() {
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const springX = useSpring(mouseX, { stiffness: 60, damping: 20 })
  const springY = useSpring(mouseY, { stiffness: 60, damping: 20 })
  const glowX = useTransform(springX, [0, 1], ['-20%', '20%'])
  const glowY = useTransform(springY, [0, 1], ['-20%', '20%'])

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
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
          <div>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold tracking-wide text-sand backdrop-blur"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber" /> Reference to posted. One platform. Your voice.
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.07 }}
              className="font-display text-left text-[2.35rem] leading-[1.02] -tracking-[0.02em] sm:text-[4.8rem] sm:leading-[0.98] lg:text-[6.2rem]"
            >
              Steal the format.<br /><span className="gradient-text">Keep your voice.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.14 }}
              className="mt-5 max-w-xl text-base leading-relaxed text-sand sm:mt-6 sm:text-lg"
            >
              {/* Phones get the short pitch; the full feature run-on only where
                  there's room to read it (sm+). Same message, less wall-of-words. */}
              Paste any video you wish you'd made. TwinAI rebuilds it in your voice, fully edits it, and
              posts it<span className="hidden sm:inline"> — <span className="text-cream">script, teleprompter, real editing, render, caption,
              hashtags and one-tap posting, all without leaving the app</span></span>.{' '}
              The video that took a pro a full day takes you minutes.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.22 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Link to="/auth?mode=signup" className="btn-gradient group px-7 py-3.5 text-base">
                Start free — 3 remixes on us
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.34 }}
              className="mt-3 text-xs text-stone"
            >
              No card. No other apps. Refer a friend, get 2 more.
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
          className="absolute right-full top-8 z-20 mr-4 hidden w-44 rounded-2xl border border-white/12 bg-ink2/95 p-3.5 shadow-lift backdrop-blur lg:block"
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
          className="relative w-[280px] shrink-0 sm:w-[330px] overflow-hidden rounded-[3.2rem] border-[10px] border-[#1a1a22] bg-ink p-0"
          style={{ boxShadow: '0 0 0 2px rgba(255,255,255,.06), 0 40px 110px -16px rgba(0,0,0,.92), 0 0 70px -20px rgba(101,229,216,.18)' }}
        >
          <div className="overflow-hidden rounded-[2.4rem] bg-ink">
          <div className="relative aspect-[9/19.5] overflow-hidden bg-gradient-to-b from-coral/30 via-ink2 to-ink">
            {/* Dynamic Island */}
            <div className="absolute left-1/2 top-2.5 z-30 h-[26px] w-[92px] -translate-x-1/2 rounded-full bg-black" />
            {/* Real footage playing inside the device, so the phone reads as a live
                recording — not an empty mock. The teleprompter + script overlay sit
                on top, exactly like the in-app record screen. */}
            <video autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" src={HERO_PHONE_VIDEO} />
            <div className="absolute inset-0 bg-gradient-to-b from-ink/35 via-ink/30 to-ink/85" />
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
            {/* home indicator, inside the screen like a modern iPhone */}
            <div className="absolute bottom-2 left-1/2 z-30 h-1 w-28 -translate-x-1/2 rounded-full bg-white/45" />
          </div>
          </div>
        </motion.div>

        {/* "In your voice" badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1, rotate: -3 }}
          transition={{ delay: 1.5, duration: 0.5, ease: EASE }}
          className="absolute top-[44%] -right-3 z-30 hidden -translate-y-1/2 rounded-2xl bg-signature px-3.5 py-2 text-xs font-bold text-ink shadow-glow sm:block lg:-right-5"
        >
          In your voice
        </motion.div>

        {/* Blueprint chip, hidden on the narrowest screens to avoid overlap. */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.7, duration: 0.5, ease: EASE }}
          className="absolute right-full bottom-16 z-20 mr-4 hidden space-y-1.5 rounded-2xl border border-white/10 bg-ink2/95 p-3 shadow-lift backdrop-blur text-[10px] lg:block"
        >
          <div className="flex items-center gap-1.5 text-teal font-semibold">
            <Sparkles className="h-2.5 w-2.5" /> Script ready
          </div>
          <div className="flex items-center gap-1.5 text-sand"><FileText className="h-2.5 w-2.5 text-stone" /> Script + shot list</div>
          <div className="flex items-center gap-1.5 text-sand"><Captions className="h-2.5 w-2.5 text-stone" /> Auto-captions</div>
        </motion.div>

        {/* Glow ring behind phone */}
        <div className="absolute inset-0 -z-10 mx-auto my-auto h-[380px] w-[380px] rounded-full bg-teal/10 blur-[100px]" />
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
  // A quiet running ticker, not a big banner: a small label, then the platforms
  // scrolling by on a loop. The row is rendered twice and slid -50% so it loops
  // seamlessly.
  const stream = [...PLATFORMS, ...PLATFORMS, ...PLATFORMS, ...PLATFORMS]
  return (
    <section className="border-y border-white/8 bg-ink2/40 py-6">
      <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-widest text-stone">
        Make it for every feed
      </p>
      <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <motion.div
          className="flex w-max gap-12 whitespace-nowrap"
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
        >
          {stream.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-2.5 text-cream">
              <p.Icon className={cn('h-4 w-4', p.tint)} />
              <span className="text-sm font-semibold">{p.label}</span>
            </span>
          ))}
          <span className="inline-flex items-center gap-2 text-stone">
            LinkedIn · X <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">soon</span>
          </span>
        </motion.div>
      </div>
    </section>
  )
}

/* ─── Paste demo ─────────────────────────────────────────────────────── */

// A simple "this is how it starts" beat: a real input where you drop a link (or
// type the idea), and a Remix button that carries you to sign-up — prefilling the
// reference so the Studio opens on what you pasted.
function PasteDemoSection() {
  const nav = useNavigate()
  const [val, setVal] = useState('')
  // Stash the pasted link so it survives signup → onboarding → Studio. We do NOT
  // put it on ?ref= — that param is the REFERRAL code on /auth, and a video URL
  // there both breaks referral redemption and never reaches the Studio.
  const go = () => {
    if (val.trim()) { try { localStorage.setItem('twinai_pending_remix', val.trim()) } catch { /* storage off */ } }
    nav('/auth?mode=signup')
  }
  return (
    <section className="mx-auto max-w-content px-5 py-16 sm:py-20">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="eyebrow">How it starts</p>
        <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
          Drop a link. Get your first remix.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sand">
          Paste any TikTok, Reel or Short you wish you'd made, or just type the idea. Hit Remix and we take it from there.
        </p>
        <div className="glass mx-auto mt-8 flex max-w-xl flex-col gap-2.5 p-2.5 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-card bg-ink/40 px-3.5 py-3">
            <Play className="h-4 w-4 shrink-0 text-coral" />
            <input
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && go()}
              placeholder="Paste a link, or type a video idea…"
              className="w-full bg-transparent text-sm text-cream placeholder:text-stone focus:outline-none"
            />
          </div>
          <button onClick={go} className="btn-gradient group shrink-0 px-6 py-3 text-base">
            <Wand2 className="h-4 w-4" /> Remix
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        </div>
        <p className="mt-3 text-xs text-stone">Your first of <span className="text-cream">3 free remixes</span>. No card required.</p>
        <PasteMicroDemo />
      </Reveal>
    </section>
  )
}

/* Live "paste → script" micro-demo under the Drop-a-link input: a reference card
   on the left analysing, a script in-your-voice materialising on the right. The
   progress bar loops; the script lines stagger in when scrolled into view, so the
   transformation reads at a glance without a video. */
function PasteMicroDemo() {
  const lines = [
    'Hook: "Everyone gets this wrong…"',
    'Beat 1 — bust the myth, fast',
    'Beat 2 — the real reason',
    'Payoff — your one-liner',
    'CTA: follow for part 2',
  ]
  return (
    <div className="mx-auto mt-9 grid grid-cols-1 max-w-2xl items-stretch gap-3 text-left sm:grid-cols-[1fr_auto_1.1fr] sm:items-center">
      <div className="rounded-card border border-white/10 bg-ink2/70 p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-stone">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-coral/20"><Play className="h-2 w-2 text-coral" /></span> Reference pasted
        </div>
        <div className="mt-2 text-sm font-semibold text-cream">2.1M views · TikTok</div>
        <div className="mt-0.5 truncate text-[11px] text-stone">tiktok.com/@creator/…</div>
        <motion.div
          className="mt-3 h-1 rounded-full bg-gradient-to-r from-amber via-coral to-teal"
          initial={{ width: '4%' }}
          animate={{ width: ['4%', '100%', '100%'] }}
          transition={{ duration: 3, repeat: Infinity, times: [0, 0.55, 1], ease: EASE }}
        />
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-teal"><Sparkles className="h-2.5 w-2.5" /> Reading the structure…</div>
      </div>
      <div className="flex items-center justify-center py-1">
        <motion.div animate={{ x: [0, 5, 0] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}>
          <ArrowRight className="h-5 w-5 rotate-90 text-amber sm:rotate-0" />
        </motion.div>
      </div>
      <div className="rounded-card border border-teal/20 bg-ink2/70 p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-stone">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-teal/20"><FileText className="h-2 w-2 text-teal" /></span> Script in your voice
        </div>
        <div className="mt-2.5 space-y-1.5">
          {lines.map((l, i) => (
            <motion.div
              key={l}
              className="flex items-center gap-1.5 text-[11px] text-sand"
              initial={{ opacity: 0, x: 8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ duration: 0.45, delay: 0.15 + i * 0.18, ease: EASE }}
            >
              <Check className="h-3 w-3 shrink-0 text-teal" /> {l}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Pain ───────────────────────────────────────────────────────────── */

function PainSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Live video backdrop — the same footage from the hero, dimmed almost to a
          texture, so the "system problem" beat breathes instead of sitting on flat
          ink. A heavy scrim keeps the copy crisp. */}
      {HERO_VIDEO_SRC && (
        <>
          <video autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover opacity-[0.08]" src={HERO_VIDEO_SRC} />
          <div className="absolute inset-0 bg-gradient-to-b from-ink via-ink/85 to-ink" />
        </>
      )}
      <div className="relative mx-auto max-w-content px-5 py-14 sm:py-28">
      <Reveal className="text-center">
        <p className="eyebrow">Sound familiar?</p>
        <h2 className="mx-auto mt-3 max-w-2xl font-display text-3xl leading-tight sm:text-5xl">
          You don't have a motivation problem.{' '}
          {/* Continuous gradient shimmer pulls the eye straight to the turn. */}
          <motion.span
            className="bg-gradient-to-r from-amber via-coral to-teal bg-clip-text text-transparent"
            style={{ backgroundSize: '220% 100%' }}
            animate={{ backgroundPositionX: ['0%', '220%'] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
          >
            You have a system problem.
          </motion.span>
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-sand">
          Every creator hits the same three walls. TwinAI tears down all three.
        </p>
      </Reveal>
      <Stagger className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3" gap={0.08}>
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
              <div className="mt-4 flex items-start gap-2 border-t border-white/8 pt-3">
                <Check className={cn('mt-0.5 h-4 w-4 shrink-0', p.accent === 'coral' ? 'text-coral' : p.accent === 'amber' ? 'text-amber' : 'text-teal')} />
                <p className="text-sm font-medium text-cream">{p.fix}</p>
              </div>
            </div>
          </RevealItem>
        ))}
      </Stagger>
      </div>
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
          <h2 className="mx-auto mt-3 max-w-2xl font-display text-3xl leading-tight sm:text-5xl">
            The entire workflow, in one place.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sand">
            Paste, script, record, edit + render, post. No tab-juggling, no agency, no two-hour edit.
          </p>
        </Reveal>
        <LoopSequence />
        <Reveal className="mt-12 text-center">
          <p className="font-heading text-lg text-cream">The whole loop. One platform. Reference to posted.</p>
          <Link to="/auth?mode=signup" className="btn-gradient group mt-5 inline-flex px-6 py-3 text-base">
            Get your first remix free <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </Reveal>
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
      <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-3" gap={0.08}>
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
    <section id="features" className="mx-auto max-w-content scroll-mt-24 px-5 py-14 sm:py-28">
      <Reveal className="text-center">
        <p className="eyebrow">What you get</p>
        <h2 className="mx-auto mt-3 max-w-2xl font-display text-3xl leading-tight sm:text-5xl">
          Every tool the loop needs. Nothing it doesn't.
        </h2>
      </Reveal>
      <Stagger className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" gap={0.06}>
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
  { title: 'Jump-cut recipe, beat every second', reach: '976K', loves: '157K', score: 92, hot: true, tint: 'from-coral/30', video: REEL.food },
  { title: 'Form-check hot take to camera', reach: '1.5M', loves: '111K', score: 84, hot: false, tint: 'from-teal/25', video: REEL.fitness },
]
function GalleryShowcase() {
  return (
    <section id="gallery" className="relative mx-auto max-w-content scroll-mt-24 px-5 py-14 sm:py-28">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <p className="eyebrow">No link in mind? Start here.</p>
          <h2 className="mt-3 font-display text-3xl leading-tight sm:text-5xl">
            Stop hunting for ideas. <span className="gradient-text">We've got you covered.</span>
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-sand sm:mt-5 sm:text-lg">
            TwinAI already <span className="text-cream">understands your brand</span> and keeps a live gallery of what's{' '}
            <span className="text-cream">actually working in your niche</span>, scored for you. Pick one, and it's a script in your voice.
            <span className="hidden sm:inline"> That's the whole search, gone.</span>
          </p>
          <ul className="mt-6 space-y-3.5">
            {[
              ['It knows your brand', 'Built from your handle and DNA, so every pick fits how you sound.'],
              ['What\'s working now', 'A live feed of proven formats in your niche, scored by what will win for you, not raw views.'],
              ['Nothing left to find', 'No more saved-folder graveyard. The idea is already waiting, so remix it in one tap.'],
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
              <span className="text-sm font-semibold text-cream">Your playbook · what wins in your niche</span>
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {SHOWCASE_FORMATS.map((f) => (
                <span key={f.name} className="chip shrink-0"><f.icon className="h-3.5 w-3.5 text-amber" /> {f.name}</span>
              ))}
            </div>
            {/* Two compact cards side-by-side even on phones — one giant full-width
                4:5 poster per screen is the "endless scroll" feeling. */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              {SHOWCASE_CARDS.map((c) => (
                <div key={c.title} className="group overflow-hidden rounded-card border border-white/8 bg-ink2/60 transition-all duration-300 hover:-translate-y-1 hover:border-white/16 hover:shadow-glass">
                  <div className={cn('relative grid aspect-[4/5] place-items-center overflow-hidden bg-gradient-to-br to-ink', c.tint)}>
                    <video autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" src={c.video} />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-ink/20" />
                    <span className="relative grid h-10 w-10 place-items-center rounded-full bg-ink/55 ring-1 ring-white/25 backdrop-blur-sm"><Play className="h-4 w-4 translate-x-0.5 fill-cream text-cream" /></span>
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
    <section id="agencies" className="mx-auto max-w-content scroll-mt-24 px-5 py-14 sm:py-28">
      <Reveal>
        <div className="overflow-hidden rounded-panel border border-white/8 bg-ink2/60 lg:grid lg:grid-cols-2">
          <div className="p-6 sm:p-10 lg:p-14">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber/20 bg-amber/10 px-3 py-1 text-xs font-bold text-amber">
              <Building2 className="h-3.5 w-3.5" /> Agencies &amp; studios
            </div>
            <h2 className="mt-5 font-display text-3xl leading-tight sm:text-5xl">
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
              {PAYMENTS_LIVE ? 'Start an agency workspace' : 'Start your agency free — 3 remixes'}
              <ArrowRight className="h-4 w-4" />
            </Link>
            {!PAYMENTS_LIVE && (
              <p className="mt-2 text-xs text-stone">
                Build a client voice and remix today. Agency billing opens soon — no card needed.
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-white/8">
            {[
              { icon: Clock, to: 12, suffix: 'h', label: 'Saved / client / week', sub: 'vs. scripting + editing by hand' },
              { icon: Eye, to: 3, suffix: '×', label: 'More posts shipped', sub: 'same headcount, more output' },
              { icon: Heart, to: 47, suffix: '%', label: 'More engagement', sub: 'proven hooks, on-brand' },
              { icon: Users, to: 15, suffix: '+', label: 'Brands per workspace', sub: 'each with its own voice' },
            ].map((m) => (
              <div key={m.label} className="bg-ink2 p-5 sm:p-7">
                <m.icon className="h-5 w-5 text-amber" />
                <div className="mt-4 font-display text-4xl tracking-tight">
                  <Counter to={m.to} suffix={m.suffix} />
                </div>
                <div className="mt-1.5 text-sm font-medium text-cream">{m.label}</div>
                <div className="mt-0.5 text-xs text-stone">{m.sub}</div>
              </div>
            ))}
            <div className="col-span-1 sm:col-span-2 bg-ink2/60 px-7 py-3 text-center text-[11px] text-stone">
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
  // The grand-slam stack: each deliverable next to what that job costs when you
  // hire it out, anchored so the total ($490) makes one subscription feel obvious.
  const items = [
    { icon: Wand2, t: 'A full breakdown of why it worked', s: 'Hook, pacing and the retention beats — decoded, not guessed.', who: 'Strategist', price: '$200' },
    { icon: FileText, t: '5 hooks + a full script in your voice', s: 'A shootable script with delivery notes, not just a caption.', who: 'Ghostwriter', price: '$150' },
    { icon: Clapperboard, t: 'Shot list + a 20-minute shoot plan', s: 'Walk in, hit record, walk out. Zero guesswork.', who: 'Producer', price: '$40' },
    { icon: Scissors, t: 'One-click edit — captions, cuts, b-roll, vertical', s: 'Dead air gone, beat-timed cuts, exported ready to post.', who: 'Editor', price: '$75' },
    { icon: Send, t: 'A caption pack tuned per platform', s: 'On-brand copy and hashtags, ready to paste and post.', who: 'Copywriter', price: '$25' },
  ]
  return (
    <section className="mx-auto max-w-content px-5 py-14 sm:py-28">
      <Reveal className="text-center">
        <p className="eyebrow">What one link gets you</p>
        <h2 className="mx-auto mt-3 max-w-2xl font-display text-3xl leading-tight sm:text-5xl">
          One link in. A finished, on-brand video out, <span className="gradient-text">end to end.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-sand">Five jobs you'd normally hire a team for — strategist, writer, producer, editor, copywriter — all done from a single paste, in minutes.</p>
      </Reveal>

      <div className="glass mx-auto mt-12 max-w-2xl overflow-hidden p-0">
        <Stagger className="divide-y divide-white/8" gap={0.06}>
          {items.map((it) => (
            <RevealItem key={it.t}>
              <div className="group flex items-center gap-4 p-4 transition-colors hover:bg-white/[0.02] sm:p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/8 bg-ink">
                  <it.icon className="h-[18px] w-[18px] text-amber" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-heading text-[15px] leading-snug text-cream">{it.t}</div>
                  <div className="mt-0.5 text-xs text-stone">{it.s}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] uppercase tracking-wider text-stone">{it.who}</div>
                  <div className="font-display text-lg text-sand line-through decoration-coral/60">{it.price}</div>
                </div>
              </div>
            </RevealItem>
          ))}
        </Stagger>

        {/* Total bar — the anchor everything above adds up to, against your price. */}
        <div className="grid grid-cols-1 gap-px bg-white/8 sm:grid-cols-2">
          <div className="bg-ink2 p-5 text-center sm:text-left">
            <div className="text-[11px] uppercase tracking-wider text-stone">Hire it all out</div>
            <div className="mt-1 font-display text-3xl text-sand line-through decoration-coral/60">$490<span className="text-lg">/video</span></div>
          </div>
          <div className="relative overflow-hidden bg-ink2 p-5 text-center sm:text-left">
            <div className="absolute inset-0 bg-gradient-to-br from-amber/12 via-coral/8 to-teal/12" />
            <div className="relative">
              <div className="text-[11px] uppercase tracking-wider text-amber">With TwinAI</div>
              <div className="mt-1 font-display text-3xl text-cream">from $9<span className="text-lg text-stone">/month</span></div>
            </div>
          </div>
        </div>
      </div>

      <p className="mx-auto mt-5 flex max-w-2xl items-center justify-center gap-2 text-center text-xs text-stone">
        <ShieldCheck className="h-3.5 w-3.5 text-teal" />
        You only spend a remix when it finishes. If the read fails, it's on us.
      </p>
    </section>
  )
}

function PricingSection() {
  return (
    <section id="pricing" className="relative mx-auto max-w-content scroll-mt-24 px-5 py-14 sm:py-28">
      <Reveal className="text-center">
        <p className="eyebrow">Pricing</p>
        <h2 className="mt-3 font-display text-3xl sm:text-5xl">
          Start free. Scale when it's working.
        </h2>
      </Reveal>

      <Stagger className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" gap={0.05}>
        {PLANS.filter((p) => !p.hidden).map((p) => {
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
                {/* Until paid checkout is live, EVERY plan starts the same free
                    signup — no dead "Coming soon" wall. The chosen plan is still
                    stamped so we can honour the intent when billing opens, and
                    every signup gets the 3 free remixes to try right now. */}
                <Link
                  to={`/auth?plan=${p.id}&mode=signup`}
                  className="btn-ghost mt-7 w-full"
                >
                  {PAYMENTS_LIVE
                    ? (p.price === 0 ? 'Start free' : `Choose ${p.name}`)
                    : 'Start free'}
                </Link>
                {!PAYMENTS_LIVE && p.price > 0 && (
                  <p className="mt-2 text-center text-xs text-stone">
                    {p.name} billing opens soon — no card needed today.
                  </p>
                )}
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
        <h2 className="mx-auto mt-3 max-w-2xl font-display text-3xl leading-tight sm:text-5xl">
          Made for the way you already create.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-xs text-stone">
          We don't fake reviews. Here's the job it does. Try it free and judge the output yourself.
        </p>
      </Reveal>
      <Stagger className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3" gap={0.08}>
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
        <h2 className="mt-3 font-display text-3xl sm:text-5xl">
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

/* ─── Referral (loud) ────────────────────────────────────────────────── */

function ReferralSection() {
  return (
    <section className="mx-auto max-w-content px-5 py-16 sm:py-20">
      <Reveal>
        <div className="relative overflow-hidden rounded-panel border border-white/10 bg-gradient-to-br from-coral/12 via-ink2 to-teal/12 p-8 text-center sm:p-12">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber/15 blur-[70px]" />
          <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-teal/15 blur-[70px]" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-amber"><Repeat className="h-3.5 w-3.5" /> Referrals</span>
            <h2 className="mx-auto mt-4 max-w-2xl font-display text-3xl leading-tight sm:text-5xl">
              Love it? Your friends get you free remixes.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sand">
              Every creator you bring in unlocks <span className="text-cream">2 more free remixes</span> — instantly, no limit. Three referrals and your first week basically runs itself.
            </p>
            <Link to="/auth?mode=signup" className="btn-gradient group mt-7 inline-flex px-7 py-3.5 text-base">
              Get my referral link <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
            <p className="mt-3 text-xs text-stone">They get 3 free. You get 2 more for each one who joins.</p>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/* ─── Final CTA ──────────────────────────────────────────────────────── */

function CTASection() {
  return (
    <section className="mx-auto max-w-content px-5 pb-28">
      <Reveal className="relative overflow-hidden rounded-panel border border-white/10 px-5 py-14 text-center sm:px-6 sm:py-24">
        {/* Dramatic gradient bg */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber/10 via-coral/8 to-teal/10" />
        <Aurora />
        <div className="relative z-10">
          <p className="eyebrow">Ready?</p>
          <h2 className="mx-auto mt-4 max-w-2xl font-display text-3xl leading-tight sm:text-5xl">
            Your next viral video is already in your saved folder.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-sm text-sand sm:text-base">
            You've watched it ten times. Stop wishing you'd made it. Paste it, edit it, post it — tonight, from one app.
            <span className="hidden sm:inline"> No link in mind? Start from what's already working in your niche.</span>
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 sm:mt-10">
            <Link to="/auth?mode=signup" className="btn-gradient group text-base px-8 py-4">
              Claim your 3 free remixes
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
            <a href="#pricing" className="btn-ghost text-base px-8 py-4">See pricing</a>
          </div>
          <p className="mt-4 text-sm text-stone">Free to start. No card. Refer a creator, unlock 2 more.</p>
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
    <div ref={ref} className="mt-14 grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
      {/* Steps */}
      <div className="order-2 lg:order-1">
        <div className="relative space-y-2">
          {/* Static rail aligned to the icon centres (12px row padding + 22px half-
              icon = 34px). The animated height-fill was removed — it couldn't track
              the active row's variable height, so it looked broken on every step. The
              coloured nodes (done = teal, active = gradient) carry the progress now. */}
          <div className="absolute left-[34px] top-6 bottom-6 w-px bg-gradient-to-b from-white/5 via-white/10 to-white/5" />
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
        <Bar label="Est. retention" v="~62%" />
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
        <div className="text-[10px] uppercase tracking-wider text-stone">Your script</div>
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
      <div className="mx-auto grid grid-cols-1 max-w-content gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
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
