import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight, Link2, ScanSearch, Wand2, Check, Plus, Minus, AtSign, Quote,
  Captions, Clapperboard, Mic, Calendar, ShieldCheck, Zap, Timer, TrendingUp,
  FileText, ListChecks, BarChart3, Building2, Users, Eye, Heart, Clock,
} from 'lucide-react'
import { BRAND, PLANS } from '../lib/brand'
import { Aurora } from '../components/Aurora'
import { HeroVisual } from '../components/HeroVisual'
import { LoopFlow } from '../components/LoopFlow'
import { Logo } from '../components/Logo'
import { Reveal, Stagger, RevealItem, EASE } from '../components/motion'
import { Tilt } from '../components/Tilt'
import { Counter } from '../components/Counter'
import { ReelCard, type Reel } from '../components/ReelCard'
import { cn } from '../lib/cn'

const MARQUEE = ['TikTok', 'Reels', 'Shorts', 'Hooks', 'Retention', 'Shot lists', 'Captions', 'B-roll', 'Voiceover', 'Schedules']

const STATS = [
  { to: 30, suffix: 's', label: 'From pasted link to full blueprint' },
  { to: 20, suffix: ' min', label: 'To shoot it — instead of 2 hours' },
  { to: 6, suffix: '', label: 'Outputs per link: hook → schedule' },
  { to: 0, suffix: '', label: 'Footage needed to start' },
]

const STEPS = [
  { icon: Link2, n: '01', t: 'Drop a reference', d: 'Paste any Reel, TikTok, Short or YouTube link you wish you’d made. That’s the whole input.' },
  { icon: ScanSearch, n: '02', t: 'We read why it works', d: 'TwinAI transcribes the actual video and maps its hook, pacing and retention beats — never the footage.' },
  { icon: Wand2, n: '03', t: 'Shoot, edit, post — guided', d: 'Blueprint in your voice, a teleprompter to record, one-click editing, scheduling and analytics. The full loop.' },
]

// The deep dive: every component of the product, what it does for you, and the
// payoff. This is the "explain everything" section.
const PIPELINE = [
  {
    id: 'voice',
    icon: AtSign,
    eyebrow: 'Step 1 · It learns you',
    title: 'Your voice, profiled from your real posts.',
    body: 'Paste your @handle once. TwinAI reads your recent posts — and even your spoken audio — to learn your tone, pacing, hook style, signature phrases and the CTAs you actually use. You confirm it in one tap.',
    bullets: [
      'Built from what you’ve already published — not a quiz',
      'Captures vocabulary, pacing and hook shape',
      'Editable any time; it’s your voice, you own it',
    ],
    payoff: 'Every script sounds like you — not a template, not a robot.',
    visual: 'voice',
  },
  {
    id: 'read',
    icon: ScanSearch,
    eyebrow: 'Step 2 · It reads the reference',
    title: 'A real breakdown of why that video worked.',
    body: 'We transcribe the actual clip and derive its structure: when the hook resolves, the narrative beats and their timing, the words-per-minute, where retention is won. Not vibes — the mechanics.',
    bullets: [
      'Hook window: the exact seconds that earn the watch',
      'Beat-by-beat map with retention goals',
      'Why-it-works, grounded in the real transcript',
    ],
    payoff: 'You stop guessing what to film. The format is proven; now it’s legible.',
    visual: 'read',
  },
  {
    id: 'blueprint',
    icon: FileText,
    eyebrow: 'Step 3 · You get the blueprint',
    title: 'The whole shoot, planned — not just a caption.',
    body: 'Hook options written your way. A full script with delivery directions. A shot list with framing. An edit checklist, an on-brand caption pack, and a 20-minute production sprint so you never stall.',
    bullets: [
      'Hooks · script · shot list · edit plan · captions',
      'A 20-minute sprint replaces the 2-hour scramble',
      'Copy any piece with one click',
    ],
    payoff: 'A two-hour filming-and-editing slog becomes a focused 20-minute sprint.',
    visual: 'blueprint',
  },
  {
    id: 'record',
    icon: Mic,
    eyebrow: 'Step 4 · It helps you shoot',
    title: 'Record it in one take, with a teleprompter.',
    body: 'Your script loads straight into a built-in teleprompter and camera. Read it naturally, hit your hook on time, and capture clean takes — no third-party app, no fumbling with notes off-screen.',
    bullets: [
      'Script scrolls at your pace while you film',
      'Hook timing markers so you nail the first 2 seconds',
      'Re-take any beat without losing the plan',
    ],
    payoff: 'The blueprint isn’t homework — you shoot it right here, the moment you’re inspired.',
    visual: 'record',
  },
  {
    id: 'edit',
    icon: Clapperboard,
    eyebrow: 'Step 5 · It edits for you',
    title: 'One click: captions, cuts and transitions.',
    body: 'TwinAI auto-edits the take using the reference’s rhythm and your brand style — burned-in caption overlays, hook text, dead-air trimmed, jump cuts and transitions placed where retention is won. Tweak anything; it’s yours.',
    bullets: [
      'Animated, on-brand caption overlays',
      'Dead air removed, cuts timed to the beats',
      'Export vertical, ready for every platform',
    ],
    payoff: 'A two-hour edit becomes one click — then a minute of polish if you want it.',
    visual: 'edit',
  },
  {
    id: 'analytics',
    icon: BarChart3,
    eyebrow: 'Step 6 · It closes the loop',
    title: 'Post, then learn what actually worked.',
    body: 'Publish on the schedule that builds momentum, then watch the numbers in one place: views, retention curve, comments and saves — with a plain-English read on why a video hit, feeding straight into your next blueprint.',
    bullets: [
      'Ready-to-paste captions + best posting times',
      'Views, retention, comments & saves in one view',
      'Before/after-TwinAI lift, so you see the difference',
    ],
    payoff: 'Every post teaches the system — so your next video starts smarter than your last.',
    visual: 'analytics',
  },
] as const

const FEATURES = [
  { icon: Mic, t: 'Voice from real audio', d: 'Your profile upgrades from your actual spoken videos, not just captions.' },
  { icon: Clapperboard, t: 'Shot list + edit plan', d: 'Beat-by-beat timing, framing and cuts you can follow on set.' },
  { icon: Captions, t: 'On-brand captions', d: 'Bold, chunked caption packs styled the way short-form wins.' },
  { icon: Timer, t: '20-minute sprint', d: 'A minute-by-minute plan so the idea never dies in a saved folder.' },
  { icon: Calendar, t: 'Publish plan', d: 'Platform captions, hashtags and best times for every blueprint.' },
  { icon: ShieldCheck, t: 'Original by design', d: 'Structure is borrowed; story is owned. We never clip or repost footage.' },
]

const REELS: Reel[] = [
  { poster: 'bg-gradient-to-br from-coral/35 via-ink2 to-ink', accent: 'text-amber', capLead: 'You’re 35 and think', capAccent: 'it’s late?', views: '2.1M', likes: '184K', platform: 'TikTok' },
  { poster: 'bg-gradient-to-br from-teal/30 via-ink2 to-ink', accent: 'text-teal', capLead: 'The one habit that', capAccent: 'changed everything', views: '880K', likes: '76K', platform: 'Reels' },
  { poster: 'bg-gradient-to-br from-amber/30 via-ink2 to-ink', accent: 'text-coral', capLead: 'Stop editing like', capAccent: 'it’s 2019', views: '1.4M', likes: '120K', platform: 'Shorts' },
  { poster: 'bg-gradient-to-br from-coral/25 via-ink2 to-ink', accent: 'text-amber', capLead: 'Read this before you', capAccent: 'post again', views: '640K', likes: '51K', platform: 'TikTok' },
]

const FAQ = [
  { q: 'Do you copy other people’s videos?', a: 'No. We read the structure of what works — hook shape, pacing, retention — and rebuild it as an original in your voice. We never clip or repost footage.' },
  { q: 'Will this make me go viral?', a: 'No guarantees — anyone who promises that is lying. We give you a proven structure and a fast, repeatable way to ship, so you get far more quality shots on goal.' },
  { q: 'How is this different from a clipper?', a: 'Clippers chop up footage you already have. TwinAI takes a reference you admire and makes it shootable as something new, in your voice.' },
  { q: 'What do I actually get back?', a: 'A complete blueprint: hook options, full script with directions, shot list with timing, an edit checklist, a caption pack, and a suggested posting schedule.' },
  { q: 'How does it learn my voice?', a: 'You paste your @handle. We read your recent posts — captions, hooks, even spoken audio — and synthesize a voice profile you confirm and can edit any time.' },
]

export default function Landing() {
  return (
    <main className="noise overflow-clip">
      {/* ================= HERO — centered ================= */}
      <section className="relative">
        <Aurora />
        <div className="relative mx-auto max-w-content px-5 pb-14 pt-16 text-center sm:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-sand backdrop-blur"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-teal shadow-[0_0_10px_2px_rgba(112,228,213,.7)]" />
            {BRAND.category}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.06 }}
            className="mx-auto mt-6 max-w-4xl font-display text-[2.75rem] leading-[1.04] tracking-tight text-balance sm:text-6xl lg:text-7xl"
          >
            Remix any viral video <span className="gradient-text-animated">in seconds.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.14 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-sand"
          >
            Paste a link you wish you’d made. TwinAI reads <em className="not-italic text-cream">why it works</em> and
            writes it in <em className="not-italic text-cream">your</em> voice — then helps you{' '}
            <em className="not-italic text-cream">record it, auto-edit it, post it, and read the analytics.</em> The whole
            loop, one window.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.22 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-3"
          >
            <Link to="/auth" className="btn-gradient text-[15px]">
              Start free — 2 recreations <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#how" className="btn-ghost text-[15px]">See how it works</a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.4 }}
            className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-stone"
          >
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-teal" /> Never copies footage</span>
            <span className="inline-flex items-center gap-1.5"><Zap className="h-4 w-4 text-amber" /> Blueprint in ~30s</span>
            <span>No card required</span>
          </motion.div>

          {/* Product proof — centered under the message */}
          <div className="mt-14">
            <HeroVisual />
          </div>
        </div>

        {/* trust marquee */}
        <div className="relative border-y border-white/8 bg-ink2/60 py-5">
          <div className="mask-fade-x flex overflow-hidden">
            <div className="flex shrink-0 animate-marquee items-center gap-10 pr-10">
              {[...MARQUEE, ...MARQUEE].map((w, i) => (
                <span key={i} className="whitespace-nowrap text-sm font-medium uppercase tracking-wider text-stone">
                  {w} <span className="ml-10 text-white/15">✦</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================= STATS ================= */}
      <section className="mx-auto max-w-content px-5 py-16">
        <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4" gap={0.08}>
          {STATS.map((s) => (
            <RevealItem key={s.label}>
              <div className="glass glass-hover h-full p-6 text-center">
                <div className="font-display text-4xl tracking-tight">
                  <Counter to={s.to} suffix={s.suffix} />
                </div>
                <div className="mt-2 text-xs leading-relaxed text-stone">{s.label}</div>
              </div>
            </RevealItem>
          ))}
        </Stagger>
      </section>

      {/* ================= HOW IT WORKS — centered ================= */}
      <section id="how" className="mx-auto max-w-content scroll-mt-24 px-5 py-20">
        <Reveal className="text-center">
          <p className="eyebrow">How it works</p>
          <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
            From a link you admire to a video you can shoot.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sand">Three steps. One window. No tool-switching, no lost momentum.</p>
        </Reveal>

        <Stagger className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <RevealItem key={s.n}>
              <Tilt className="h-full" max={6}>
                <div className="glass glass-hover h-full p-7">
                  <div className="flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-signature-soft">
                      <s.icon className="h-5 w-5 text-cream" />
                    </span>
                    <span className="font-mono text-sm text-stone">{s.n}</span>
                  </div>
                  <h3 className="mt-5 text-xl font-heading">{s.t}</h3>
                  <p className="mt-2 text-sand">{s.d}</p>
                </div>
              </Tilt>
            </RevealItem>
          ))}
        </Stagger>
      </section>

      {/* ================= THE COMPLETE LOOP — animated, connected ================= */}
      <section id="loop" className="relative mx-auto max-w-content scroll-mt-24 px-5 py-20">
        <Reveal className="text-center">
          <p className="eyebrow">The complete loop</p>
          <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
            Not a caption generator. The entire video, end to end.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sand">
            Most tools hand you text and wish you luck. TwinAI walks every step with you — and each one feeds the next.
          </p>
        </Reveal>
        <div className="mt-14">
          <LoopFlow />
        </div>
      </section>

      {/* ================= PIPELINE — every component, explained ================= */}
      <section id="pipeline" className="mx-auto max-w-content scroll-mt-24 px-5 py-12">
        <Reveal className="text-center">
          <p className="eyebrow">What you get</p>
          <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
            Every piece, connected. Here’s exactly how it helps.
          </h2>
        </Reveal>

        <div className="mt-14 space-y-20">
          {PIPELINE.map((p, i) => (
            <Reveal key={p.id}>
              <div className={cn('grid items-center gap-10 lg:grid-cols-2', i % 2 === 1 && 'lg:[&>*:first-child]:order-2')}>
                {/* Copy side */}
                <div>
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-signature-soft">
                    <p.icon className="h-5 w-5 text-cream" />
                  </span>
                  <p className="eyebrow mt-4">{p.eyebrow}</p>
                  <h3 className="mt-3 font-display text-3xl leading-tight text-balance">{p.title}</h3>
                  <p className="mt-3 text-sand">{p.body}</p>
                  <ul className="mt-5 space-y-2.5">
                    {p.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2.5 text-sm text-sand">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> {b}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-5 border-l-2 border-coral/60 pl-4 text-sm font-medium text-cream">{p.payoff}</p>
                </div>

                {/* Visual side */}
                <Tilt max={5}>
                  <PipelineVisual kind={p.visual} />
                </Tilt>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ================= REEL WALL ================= */}
      <section className="mx-auto max-w-content px-5 py-20">
        <Reveal className="text-center">
          <p className="eyebrow">Reference in · finished video out</p>
          <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
            The formats you scroll past — rebuilt as yours.
          </h2>
        </Reveal>
        <Stagger className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4" gap={0.08}>
          {REELS.map((r, i) => (
            <RevealItem key={i}>
              <Tilt className="group" max={10}>
                <ReelCard reel={r} />
              </Tilt>
            </RevealItem>
          ))}
        </Stagger>
      </section>

      {/* ================= MORE IN THE BOX ================= */}
      <section id="features" className="mx-auto max-w-content scroll-mt-24 px-5 py-12">
        <Reveal className="text-center">
          <p className="eyebrow">Also in every plan</p>
          <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
            Not a caption tool. The whole loop.
          </h2>
        </Reveal>
        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" gap={0.06}>
          {FEATURES.map((f) => (
            <RevealItem key={f.t}>
              <div className="glass glass-hover h-full p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/5">
                  <f.icon className="h-5 w-5 text-amber" />
                </span>
                <h3 className="mt-4 font-heading text-lg">{f.t}</h3>
                <p className="mt-1.5 text-sm text-sand">{f.d}</p>
              </div>
            </RevealItem>
          ))}
        </Stagger>
      </section>

      {/* ================= AGENCIES ================= */}
      <section id="agencies" className="relative mx-auto max-w-content scroll-mt-24 px-5 py-12">
        <Reveal className="overflow-hidden rounded-panel border border-white/10 bg-ink2">
          <div className="grid lg:grid-cols-2">
            {/* pitch */}
            <div className="relative p-8 sm:p-12">
              <Aurora />
              <div className="relative">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-signature-soft">
                  <Building2 className="h-5 w-5 text-cream" />
                </span>
                <p className="eyebrow mt-5">For agencies & teams</p>
                <h2 className="mt-3 font-display text-4xl leading-tight text-balance">
                  Run every client’s content like <span className="gradient-text">one machine.</span>
                </h2>
                <p className="mt-4 text-sand">
                  Spin up a separate brand voice per client, turn proven references into shootable blueprints in seconds,
                  and ship more reels across more accounts — without growing the team. One workspace, every brand, the
                  whole loop.
                </p>
                <ul className="mt-6 space-y-2.5">
                  {[
                    'A distinct voice profile for each client brand',
                    'Batch references into a week of content in an afternoon',
                    'Consistent quality across every account — no off-brand misses',
                    'Show clients the lift: views, engagement, time saved',
                  ].map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-sm text-sand">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> {b}
                    </li>
                  ))}
                </ul>
                <Link to="/auth" className="btn-gradient mt-8">
                  Start an agency workspace <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* the dream, in numbers */}
            <div className="grid grid-cols-2 gap-px bg-white/8">
              {[
                { icon: Clock, to: 12, suffix: 'h', label: 'Saved per client, per week', sub: 'vs. scripting & editing by hand' },
                { icon: Eye, to: 3, suffix: '×', label: 'More posts shipped', sub: 'same headcount, more shots on goal' },
                { icon: Heart, to: 47, suffix: '%', label: 'More engagement', sub: 'proven hooks, on-brand every time' },
                { icon: Users, to: 8, suffix: '+', label: 'Brands in one workspace', sub: 'each with its own voice' },
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
                Illustrative targets from early workflows — your mileage depends on niche, cadence and offer. No guaranteed results.
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================= PRICING ================= */}
      <section id="pricing" className="relative mx-auto max-w-content scroll-mt-24 px-5 py-20">
        <Reveal className="text-center">
          <p className="eyebrow">Pricing</p>
          <h2 className="mt-3 font-display text-4xl text-balance sm:text-5xl">Start free. Scale when it’s working.</h2>
          <p className="mx-auto mt-4 max-w-xl text-sand">Simple monthly recreation counts — never a confusing credit meter.</p>
        </Reveal>

        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" gap={0.06}>
          {PLANS.map((p) => {
            const featured = !!p.badge && p.id === 'professional'
            return (
              <RevealItem key={p.id}>
                <div
                  className={cn(
                    'relative flex h-full flex-col rounded-panel p-6',
                    featured ? 'gradient-border bg-ink2 shadow-glow' : 'glass glass-hover',
                  )}
                >
                  {p.badge && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-signature px-3 py-1 text-xs font-bold text-ink shadow-glow">
                      {p.badge}
                    </span>
                  )}
                  <h3 className="text-lg font-heading">{p.name}</h3>
                  <p className="mt-1 text-sm text-stone">{p.blurb}</p>
                  <div className="mt-4 flex items-end gap-1">
                    <span className="font-display text-4xl">${p.price}</span>
                    <span className="pb-1 text-sm text-stone">/mo</span>
                  </div>
                  {p.annual ? (
                    <div className="text-xs text-stone">${p.annual}/mo billed annually</div>
                  ) : (
                    <div className="text-xs text-stone">&nbsp;</div>
                  )}
                  <ul className="mt-5 flex-1 space-y-2 text-sm text-sand">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link to="/auth" className={cn('mt-6 w-full', featured ? 'btn-gradient' : 'btn-ghost')}>
                    {p.price === 0 ? 'Start free' : `Choose ${p.name}`}
                  </Link>
                </div>
              </RevealItem>
            )
          })}
        </Stagger>
      </section>

      {/* ================= FAQ ================= */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-5 py-20">
        <Reveal className="text-center">
          <p className="eyebrow">The honest answers</p>
          <h2 className="mt-3 font-display text-4xl text-balance sm:text-5xl">No hype. Just how it works.</h2>
        </Reveal>
        <div className="mt-10 space-y-3">
          {FAQ.map((f, i) => <FaqItem key={i} q={f.q} a={f.a} />)}
        </div>
      </section>

      {/* ================= FINAL CTA ================= */}
      <section className="mx-auto max-w-content px-5 pb-24">
        <Reveal className="relative overflow-hidden rounded-panel border border-white/10 bg-ink2 px-6 py-16 text-center">
          <Aurora />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
              You bring the idea. <span className="gradient-text">TwinAI makes it shootable.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sand">2 free recreations. A full blueprint in ~30 seconds. No card.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/auth" className="btn-gradient text-[15px]">
                Start free <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#pricing" className="btn-ghost text-[15px]">See pricing</a>
            </div>
          </div>
        </Reveal>
      </section>

      <Footer />
    </main>
  )
}

/* ---------------- pipeline visuals — compact product mocks ---------------- */
function PipelineVisual({ kind }: { kind: string }) {
  if (kind === 'voice')
    return (
      <Frame label="Voice profile · @you">
        <div className="space-y-3">
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3.5">
            <div className="text-xs uppercase tracking-wider text-stone">Summary</div>
            <div className="mt-1 text-sm text-cream">Direct, warm, a little punchy. Hooks with a bold claim, lands with proof.</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MiniSpec k="Tone" v="Confident, friendly" />
            <MiniSpec k="Pacing" v="Fast, no dead air" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-stone">Signature words</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {['honestly', 'here’s the thing', 'zero fluff', 'let’s go'].map((w) => (
                <span key={w} className="chip">{w}</span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-teal/10 p-3 text-sm text-teal">
            <Check className="h-4 w-4" /> Confirmed — this is me
          </div>
        </div>
      </Frame>
    )
  if (kind === 'read')
    return (
      <Frame label="Reference read · 17s clip">
        <div className="space-y-3">
          <div className="flex items-end gap-1 rounded-xl border border-white/8 bg-ink p-3 pt-6">
            {[42, 74, 60, 92, 68, 82, 54, 76, 90, 62, 48, 72].map((h, i) => (
              <motion.span
                key={i}
                className="flex-1 rounded-sm bg-signature opacity-85"
                initial={{ height: 4 }}
                whileInView={{ height: h * 0.5 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease: EASE, delay: i * 0.04 }}
              />
            ))}
          </div>
          <MiniSpec k="Hook resolves" v="1.8s — bold claim, instant payoff" />
          <MiniSpec k="Beats" v="Claim → flip @4s → proof @9s → CTA @15s" />
          <MiniSpec k="Pace" v="168 words / min" />
        </div>
      </Frame>
    )
  if (kind === 'blueprint')
    return (
      <Frame label="Your blueprint">
        <div className="space-y-2.5">
          <BlueRow icon={Quote} k="Hook" v="“Everyone tells you to post more. Wrong.”" />
          <BlueRow icon={FileText} k="Script" v="6 lines · with delivery directions" />
          <BlueRow icon={Clapperboard} k="Shots" v="3 setups · close-up · b-roll insert" />
          <BlueRow icon={Captions} k="Captions" v="Chunked, on-brand, accent word timed" />
          <BlueRow icon={ListChecks} k="Edit" v="Cut dead air · zoom @hook · end-card" />
          <BlueRow icon={Timer} k="Sprint" v="20 minutes, minute-by-minute" />
        </div>
      </Frame>
    )
  if (kind === 'record')
    return (
      <Frame label="Teleprompter · recording">
        <div className="relative overflow-hidden rounded-xl border border-white/8 bg-ink p-5">
          <div className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-coral/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-coral">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-coral" /> Rec
          </div>
          <div className="space-y-2 pt-2">
            <p className="text-sm text-stone">Everyone tells you to post more.</p>
            <motion.p
              className="text-lg font-heading text-cream"
              initial={{ opacity: 0.4 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              That’s exactly why you’re stuck. Here’s the fix →
            </motion.p>
            <p className="text-sm text-stone/70">Three things changed everything for me…</p>
          </div>
          <div className="mt-5 flex items-center gap-2">
            <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-bold text-amber">HOOK · 0:02</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full bg-signature"
                initial={{ width: '0%' }}
                whileInView={{ width: '64%' }}
                viewport={{ once: true }}
                transition={{ duration: 1.4, ease: EASE }}
              />
            </div>
          </div>
        </div>
      </Frame>
    )
  if (kind === 'edit')
    return (
      <Frame label="Auto-edit · one click">
        <div className="space-y-3">
          <div className="relative grid aspect-[16/10] place-items-center overflow-hidden rounded-xl border border-white/8 bg-gradient-to-br from-coral/25 via-ink2 to-ink">
            <motion.span
              initial={{ scale: 0.7, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: EASE }}
              className="rounded-lg bg-ink/80 px-3 py-1.5 font-heading text-lg text-cream shadow-lift"
            >
              post <span className="text-amber">smarter</span>, not more
            </motion.span>
            <span className="absolute bottom-2 left-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-cream">auto-captions</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[Captions, ListChecks, Clapperboard].map((Ic, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.03] px-2 py-2 text-[11px] text-sand">
                <Ic className="h-3.5 w-3.5 text-teal" /> {['Captions', 'Trim air', 'Cuts'][i]}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-teal/10 p-2.5 text-sm text-teal">
            <Check className="h-4 w-4" /> Rendered vertical · ready to post
          </div>
        </div>
      </Frame>
    )
  if (kind === 'analytics')
    return (
      <Frame label="Analytics · after posting">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { k: 'Views', v: '128K' },
              { k: 'Retention', v: '61%' },
              { k: 'Saves', v: '4.2K' },
            ].map((s) => (
              <div key={s.k} className="rounded-xl border border-white/8 bg-white/[0.03] p-3 text-center">
                <div className="font-display text-xl text-cream">{s.v}</div>
                <div className="text-[10px] uppercase tracking-wider text-stone">{s.k}</div>
              </div>
            ))}
          </div>
          <div className="flex items-end gap-1 rounded-xl border border-white/8 bg-ink p-3 pt-6">
            {[30, 38, 52, 60, 72, 80, 88, 96].map((h, i) => (
              <motion.span
                key={i}
                className="flex-1 rounded-sm bg-gradient-to-t from-coral to-amber"
                initial={{ height: 4 }}
                whileInView={{ height: h * 0.5 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease: EASE, delay: i * 0.05 }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-signature-soft p-2.5 text-sm text-cream">
            <TrendingUp className="h-4 w-4 text-amber" /> +217% vs. your last 30 days
          </div>
        </div>
      </Frame>
    )
  return (
    <Frame label="Publish plan">
      <div className="space-y-3">
        {[
          { p: 'TikTok', t: 'Tue 7:30 PM', c: 'Stop posting more. Post smarter →' },
          { p: 'Reels', t: 'Wed 12:15 PM', c: 'The 20-minute video system' },
          { p: 'Shorts', t: 'Thu 5:45 PM', c: 'Proven format, your voice' },
        ].map((row) => (
          <div key={row.p} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3.5">
            <span className="w-16 shrink-0 text-sm font-heading text-teal">{row.p}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-cream">{row.c}</span>
            <span className="shrink-0 text-xs text-stone">{row.t}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-xl bg-signature-soft p-3 text-sm text-cream">
          <TrendingUp className="h-4 w-4 text-amber" /> 3 posts this week · momentum kept
        </div>
      </div>
    </Frame>
  )
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="gradient-border glass rounded-panel p-5 shadow-lift">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-stone">{label}</span>
        <span className="flex gap-1.5">
          <i className="h-2 w-2 rounded-full bg-amber/70" />
          <i className="h-2 w-2 rounded-full bg-coral/70" />
          <i className="h-2 w-2 rounded-full bg-teal/70" />
        </span>
      </div>
      {children}
    </div>
  )
}

function MiniSpec({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3.5">
      <div className="text-xs uppercase tracking-wider text-stone">{k}</div>
      <div className="mt-1 text-sm text-cream">{v}</div>
    </div>
  )
}

function BlueRow({ icon: Icon, k, v }: { icon: React.ComponentType<{ className?: string }>; k: string; v: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5">
        <Icon className="h-3.5 w-3.5 text-amber" />
      </span>
      <span className="w-16 shrink-0 text-xs uppercase tracking-wider text-stone">{k}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-cream">{v}</span>
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Reveal>
      <button
        onClick={() => setOpen((v) => !v)}
        className="glass w-full p-5 text-left transition-colors hover:border-white/16"
      >
        <div className="flex items-center justify-between gap-4">
          <span className="font-heading text-lg">{q}</span>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5">
            {open ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </span>
        </div>
        <motion.div
          initial={false}
          animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="overflow-hidden"
        >
          <p className="pt-3 text-sand">{a}</p>
        </motion.div>
      </button>
    </Reveal>
  )
}

/* ---------------- footer — real, useful ---------------- */
function Footer() {
  return (
    <footer className="border-t border-white/8 bg-ink2/40">
      <div className="mx-auto grid max-w-content gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-sand">{BRAND.oneLiner} {BRAND.subLine}</p>
          <div className="mt-5 h-1 w-28 rounded-full bg-signature" />
        </div>
        <div>
          <p className="eyebrow">Product</p>
          <ul className="mt-4 space-y-2.5 text-sm text-sand">
            <li><a href="/#how" className="hover:text-cream">How it works</a></li>
            <li><a href="/#loop" className="hover:text-cream">The complete loop</a></li>
            <li><a href="/#pipeline" className="hover:text-cream">What you get</a></li>
            <li><a href="/#agencies" className="hover:text-cream">For agencies</a></li>
            <li><a href="/#pricing" className="hover:text-cream">Pricing</a></li>
            <li><a href="/#faq" className="hover:text-cream">FAQ</a></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow">Get started</p>
          <ul className="mt-4 space-y-2.5 text-sm text-sand">
            <li><Link to="/auth" className="hover:text-cream">Start free</Link></li>
            <li><Link to="/auth" className="hover:text-cream">Sign in</Link></li>
            <li><a href="/#pricing" className="hover:text-cream">For agencies</a></li>
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
