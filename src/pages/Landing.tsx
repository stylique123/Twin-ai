import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight, Check, Plus, Minus, AtSign, Wand2, Captions, Mic, Clapperboard,
  ShieldCheck, Zap, Building2, Users, Clock, Eye, Heart, Play,
  FileText, Sparkles, Video, Star, TrendingUp,
} from 'lucide-react'
import { BRAND, PLANS } from '../lib/brand'
import { Aurora } from '../components/Aurora'
import { HeroVisual } from '../components/HeroVisual'
import { Logo } from '../components/Logo'
import { Reveal, Stagger, RevealItem, EASE } from '../components/motion'
import { Tilt } from '../components/Tilt'
import { Counter } from '../components/Counter'
import { cn } from '../lib/cn'

// ─── data ────────────────────────────────────────────────────────────────────

const TICKER = ['TikTok · Reels · Shorts', 'Hook in 2 seconds', 'Blueprint in 30s', 'Auto-edit', 'Your voice · not a template', 'B-roll cutaways', 'Word-sync captions', 'Teleprompter', 'Viral structure decoded']

const PAIN = [
  { n: '01', t: 'You see a video with 2M views', d: 'You know the format. You know your take. But you stare at a blank draft for an hour.' },
  { n: '02', t: 'You start scripting — it sounds wrong', d: "Either it sounds like the original or it sounds like nothing. Your voice doesn't come through." },
  { n: '03', t: 'You post anyway, and it flops', d: "The hook was weak. The edit was slow. You don't know what to fix next time." },
]

const STEPS = [
  {
    n: '01', icon: Play,
    t: "Paste a link you wish you'd made",
    d: "Drop any TikTok, Reel, or Short URL. That's the entire input. TwinAI downloads and transcribes the actual audio — not the caption, not a summary.",
  },
  {
    n: '02', icon: Wand2,
    t: 'We decode why it worked',
    d: 'We map the hook window (exact seconds it earns the watch), the narrative beats, the pacing, and the retention mechanics. Real analysis. Not vibes.',
  },
  {
    n: '03', icon: FileText,
    t: 'You get everything to shoot it',
    d: 'A hook written your way. A full script with delivery notes. A shot list with framing. Edit checklist. Caption pack. A 20-minute shoot plan. Then record, edit and post — all in one window.',
  },
]

const FEATURES = [
  {
    icon: AtSign,
    label: 'Voice DNA',
    heading: 'It sounds like you. Not a template.',
    body: 'Paste your @handle once. TwinAI reads your recent posts — captions, hooks, even your spoken audio — and builds a voice profile you confirm in one tap. Every script it writes comes out in your tone, your vocabulary, your cadence.',
    proof: 'Your voice is your moat. We just make it reproducible.',
    pills: ['Tone · pacing · hook style', 'Vocabulary and signature phrases', 'Editable any time'],
    visual: <VoiceVisual />,
  },
  {
    icon: FileText,
    label: 'Blueprint',
    heading: 'A complete shoot plan. Not just a caption.',
    body: 'One reference → six outputs: hook options, full script with delivery directions, a shot list with framing, an edit checklist, an on-brand caption pack, and a 20-minute production sprint. You never stall.',
    proof: 'The two-hour scripting + filming scramble becomes a focused 20-minute sprint.',
    pills: ['Hook → script → shot list', 'Edit checklist + caption pack', '20-min production sprint'],
    visual: <BlueprintVisual />,
  },
  {
    icon: Clapperboard,
    label: 'Record + Edit',
    heading: 'Record it here. Edit in one click.',
    body: "Your script loads into a built-in teleprompter. You film, hit record, nail the hook. Then one click: TwinAI burns in word-synced animated captions, trims the dead air, adds jump cuts timed to the beats, and exports vertical — ready to post.",
    proof: "A 2-hour edit becomes one click. Polish for a minute if you want — it's already done.",
    pills: ['In-app teleprompter + camera', 'Auto-captions, animated', 'Jump cuts + dead-air trim'],
    visual: <EditVisual />,
  },
]

const FORMATS: { cap: string; accent: string; views: string; platform: string; bg: string }[] = [
  { cap: 'Everyone said I needed 10K followers first.', accent: 'They were wrong.', views: '2.1M', platform: 'TikTok', bg: 'from-coral/30 via-ink2 to-ink' },
  { cap: 'The one daily habit that', accent: 'changed my numbers.', views: '880K', platform: 'Reels', bg: 'from-teal/25 via-ink2 to-ink' },
  { cap: 'Stop editing like', accent: "it's 2019.", views: '1.4M', platform: 'Shorts', bg: 'from-amber/25 via-ink2 to-ink' },
  { cap: 'Read this before you', accent: 'post again.', views: '640K', platform: 'TikTok', bg: 'from-coral/20 via-ink2 to-ink' },
]

const SOCIAL_PROOF = [
  { name: 'Marcus L.', handle: '@marcuslive', quote: 'I went from one video a week to four. Blueprint is genuinely the fastest part of my workflow now.', metric: '4× output' },
  { name: 'Priya K.', handle: '@priyakreates', quote: 'The voice profile is scary good. Scripts read exactly like how I talk — I stopped rewriting hooks entirely.', metric: 'Zero rewrites' },
  { name: 'Jake Finn', handle: '@jakefinnmedia', quote: 'Running 6 client brands. The workspaces feature alone saves my team 3 hours per client per week.', metric: '18h/wk saved' },
]

const FAQ = [
  { q: "Do you copy other people's videos?", a: 'No. We read the structure — hook shape, pacing, retention beats — and rebuild it as an original in your voice. We never clip or repost footage. The idea stays yours; the format becomes yours too.' },
  { q: 'Will this make me go viral?', a: "No guarantees — anyone who promises that is lying. We give you a proven structure and a fast, repeatable way to ship. More quality shots on goal. That's the honest version." },
  { q: 'How is this different from a clipper?', a: 'Clippers chop up footage you already have. TwinAI takes a reference you admire and makes it shootable as something new — in your voice, from scratch, with a complete script and shot list.' },
  { q: 'What do I get in one recreation?', a: 'A complete blueprint: hook options written in your voice, full script with delivery notes, shot list with framing, an edit checklist, a caption pack with hashtags, and a 20-minute production sprint. Then record it, edit in one click, and post.' },
  { q: 'How does it learn my voice?', a: 'You paste your @handle. We read your recent public posts — captions, hooks, and your spoken audio — and synthesise a voice profile. You confirm and can edit any piece of it. It upgrades as you create more.' },
  { q: 'Can I use this for clients?', a: 'Yes. The Agency plan gives you 15 separate brand voices — one per client — plus multi-brand workspaces. Switch contexts in one click, batch a week of content in an afternoon, and ship consistent quality across every account.' },
]

// ─── page ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    <main className="noise overflow-clip">

      {/* ══════ HERO ══════ */}
      <section className="relative">
        <Aurora />
        <div className="relative mx-auto max-w-content px-5 pb-16 pt-12 sm:pt-20 lg:pt-28">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">

            {/* Copy — left */}
            <div>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-sand backdrop-blur"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-teal shadow-[0_0_10px_2px_rgba(112,228,213,.7)]" />
                {BRAND.category}
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.07 }}
                className="mt-6 font-display text-[2.6rem] leading-[1.06] tracking-tight text-balance sm:text-5xl lg:text-[3.5rem]"
              >
                Turn any viral video into{' '}
                <span className="gradient-text-animated">your next post.</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.14 }}
                className="mt-5 max-w-lg text-lg leading-relaxed text-sand"
              >
                Paste a link you admire. TwinAI reads <em className="not-italic text-cream">why it went viral</em>, rewrites it{' '}
                <em className="not-italic text-cream">in your exact voice</em>, and walks you through recording, editing
                and posting it — in one window, in{' '}
                <em className="not-italic text-cream">under 30 seconds</em>.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.22 }}
                className="mt-8 flex flex-wrap gap-3"
              >
                <Link to="/auth" className="btn-gradient text-base">
                  Get your first blueprint free <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="#how" className="btn-ghost text-base">See how it works</a>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 0.45 }}
                className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone"
              >
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-teal" /> Never copies footage</span>
                <span className="inline-flex items-center gap-1.5"><Zap className="h-4 w-4 text-amber" /> Blueprint in ~30s</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-stone" /> No card required</span>
              </motion.div>
            </div>

            {/* Visual — right */}
            <HeroVisual />
          </div>
        </div>

        {/* Ticker */}
        <div className="relative border-y border-white/8 bg-ink2/60 py-4">
          <div className="mask-fade-x flex overflow-hidden">
            <div className="flex shrink-0 animate-marquee items-center gap-10 pr-10">
              {[...TICKER, ...TICKER].map((w, i) => (
                <span key={i} className="whitespace-nowrap text-xs font-semibold uppercase tracking-widest text-stone">
                  {w} <span className="ml-10 text-white/15">✦</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════ PAIN POINTS ══════ */}
      <section className="mx-auto max-w-content px-5 py-20">
        <Reveal className="text-center">
          <p className="eyebrow">Sound familiar?</p>
          <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
            You know the format. You can't make it fast enough.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sand">
            Every creator hits the same wall. TwinAI tears it down.
          </p>
        </Reveal>
        <Stagger className="mt-12 grid gap-5 md:grid-cols-3" gap={0.08}>
          {PAIN.map((p) => (
            <RevealItem key={p.n}>
              <div className="glass h-full p-7">
                <span className="font-mono text-sm text-stone">{p.n}</span>
                <h3 className="mt-3 text-lg font-heading text-cream">{p.t}</h3>
                <p className="mt-2 text-sand text-sm leading-relaxed">{p.d}</p>
              </div>
            </RevealItem>
          ))}
        </Stagger>
        <Reveal className="mt-8 text-center">
          <Link to="/auth" className="btn-gradient">
            Fix it — try TwinAI free <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </section>

      {/* ══════ HOW IT WORKS ══════ */}
      <section id="how" className="relative scroll-mt-24 py-20">
        <div className="mx-auto max-w-content px-5">
          <Reveal className="text-center">
            <p className="eyebrow">How it works</p>
            <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
              From a link you admire to a video you can shoot. Three steps.
            </h2>
          </Reveal>
          <Stagger className="mt-14 grid gap-6 md:grid-cols-3" gap={0.1}>
            {STEPS.map((s, i) => (
              <RevealItem key={s.n}>
                <Tilt className="h-full" max={5}>
                  <div className="glass glass-hover relative h-full p-8">
                    <div className="flex items-start justify-between">
                      <span className="grid h-12 w-12 place-items-center rounded-xl bg-signature-soft">
                        <s.icon className="h-5 w-5 text-cream" />
                      </span>
                      <span className="font-mono text-sm text-stone">{s.n}</span>
                    </div>
                    <h3 className="mt-5 text-xl font-heading">{s.t}</h3>
                    <p className="mt-3 text-sand text-sm leading-relaxed">{s.d}</p>
                    {i < STEPS.length - 1 && (
                      <div className="absolute -right-3 top-1/2 hidden -translate-y-1/2 md:block">
                        <ArrowRight className="h-5 w-5 text-stone/40" />
                      </div>
                    )}
                  </div>
                </Tilt>
              </RevealItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ══════ FEATURES (3 key, alternating) ══════ */}
      <section id="features" className="mx-auto max-w-content scroll-mt-24 px-5 py-12">
        <Reveal className="text-center">
          <p className="eyebrow">What you get</p>
          <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
            Every piece, connected. Here's exactly how it helps.
          </h2>
        </Reveal>

        <div className="mt-16 space-y-24">
          {FEATURES.map((f, i) => (
            <Reveal key={f.label}>
              <div className={cn('grid items-center gap-10 lg:grid-cols-2', i % 2 === 1 && 'lg:[&>*:first-child]:order-2')}>
                {/* Copy */}
                <div>
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-signature-soft">
                    <f.icon className="h-5 w-5 text-cream" />
                  </span>
                  <p className="eyebrow mt-4">{f.label}</p>
                  <h3 className="mt-3 font-display text-3xl leading-tight text-balance">{f.heading}</h3>
                  <p className="mt-4 text-sand leading-relaxed">{f.body}</p>
                  <ul className="mt-5 space-y-2">
                    {f.pills.map((pill) => (
                      <li key={pill} className="flex items-center gap-2.5 text-sm text-sand">
                        <Check className="h-4 w-4 shrink-0 text-teal" /> {pill}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-6 border-l-2 border-coral/60 pl-4 text-sm font-medium italic text-cream">{f.proof}</p>
                </div>
                {/* Visual */}
                <Tilt max={5}>{f.visual}</Tilt>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══════ FORMAT WALL ══════ */}
      <section className="mx-auto max-w-content px-5 py-20">
        <Reveal className="text-center">
          <p className="eyebrow">Reference in · your video out</p>
          <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
            The formats that blow up — rebuilt in your voice.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sand">Paste any of these links. Get a complete blueprint you can shoot today.</p>
        </Reveal>
        <Stagger className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4" gap={0.07}>
          {FORMATS.map((f, i) => (
            <RevealItem key={i}>
              <Tilt className="group" max={10}>
                <FormatCard f={f} />
              </Tilt>
            </RevealItem>
          ))}
        </Stagger>
      </section>

      {/* ══════ SOCIAL PROOF ══════ */}
      <section className="mx-auto max-w-content px-5 py-12">
        <Reveal className="text-center">
          <p className="eyebrow">What creators are saying</p>
          <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
            The results speak louder than the features.
          </h2>
        </Reveal>
        <Stagger className="mt-12 grid gap-5 md:grid-cols-3" gap={0.08}>
          {SOCIAL_PROOF.map((s) => (
            <RevealItem key={s.name}>
              <div className="glass glass-hover h-full p-7">
                <div className="flex items-center gap-1 text-amber">
                  {[...Array(5)].map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-current" />)}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-sand">"{s.quote}"</p>
                <div className="mt-6 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-heading text-cream">{s.name}</div>
                    <div className="text-xs text-stone">{s.handle}</div>
                  </div>
                  <span className="rounded-full bg-teal/10 px-2.5 py-1 text-xs font-bold text-teal">{s.metric}</span>
                </div>
              </div>
            </RevealItem>
          ))}
        </Stagger>
      </section>

      {/* ══════ AGENCIES ══════ */}
      <section id="agencies" className="relative mx-auto max-w-content scroll-mt-24 px-5 py-12">
        <Reveal className="overflow-hidden rounded-panel border border-white/10 bg-ink2">
          <div className="grid lg:grid-cols-2">
            <div className="relative p-8 sm:p-12">
              <Aurora />
              <div className="relative">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-signature-soft">
                  <Building2 className="h-5 w-5 text-cream" />
                </span>
                <p className="eyebrow mt-5">For agencies &amp; teams</p>
                <h2 className="mt-3 font-display text-4xl leading-tight text-balance">
                  Run every client's content like <span className="gradient-text">one machine.</span>
                </h2>
                <p className="mt-4 text-sand">
                  Spin up a separate brand voice per client, turn proven references into shootable blueprints in seconds,
                  and ship more reels across more accounts — without growing the team.
                </p>
                <ul className="mt-6 space-y-2.5">
                  {[
                    'A distinct voice profile for each client brand',
                    'Batch a week of content in an afternoon',
                    'Consistent quality across every account',
                    'Show clients the lift: time saved and engagement lift',
                    'Multi-brand workspaces + team seats',
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
            <div className="grid grid-cols-2 gap-px bg-white/8">
              {[
                { icon: Clock, to: 12, suffix: 'h', label: 'Saved per client / week', sub: 'vs. scripting and editing by hand' },
                { icon: Eye, to: 3, suffix: '×', label: 'More posts shipped', sub: 'same headcount, more shots on goal' },
                { icon: Heart, to: 47, suffix: '%', label: 'More engagement', sub: 'proven hooks, on-brand every time' },
                { icon: Users, to: 15, suffix: '+', label: 'Brands in one workspace', sub: 'each with its own distinct voice' },
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

      {/* ══════ PRICING ══════ */}
      <section id="pricing" className="relative mx-auto max-w-content scroll-mt-24 px-5 py-20">
        <Reveal className="text-center">
          <p className="eyebrow">Pricing</p>
          <h2 className="mt-3 font-display text-4xl text-balance sm:text-5xl">
            Start free. Scale when it's working.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sand">
            Simple monthly recreation counts. No per-action billing, no confusing credit meters. Cancel any time.
          </p>
        </Reveal>
        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" gap={0.06}>
          {PLANS.map((p) => {
            const featured = p.id === 'professional'
            return (
              <RevealItem key={p.id}>
                <div className={cn(
                  'relative flex h-full flex-col rounded-panel p-6',
                  featured ? 'gradient-border bg-ink2 shadow-glow' : 'glass glass-hover',
                )}>
                  {p.badge && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-signature px-3 py-1 text-xs font-bold text-ink shadow-glow">
                      {p.badge}
                    </span>
                  )}
                  <h3 className="text-lg font-heading">{p.name}</h3>
                  <p className="mt-1 text-sm text-stone">{p.blurb}</p>
                  <div className="mt-4 flex items-end gap-1">
                    <span className="font-display text-4xl">${p.price}</span>
                    {p.price > 0 && <span className="pb-1 text-sm text-stone">/mo</span>}
                  </div>
                  {p.annual ? (
                    <div className="text-xs text-stone">${p.annual}/mo billed annually</div>
                  ) : (
                    <div className="h-4" />
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

      {/* ══════ FAQ ══════ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-5 py-20">
        <Reveal className="text-center">
          <p className="eyebrow">The honest answers</p>
          <h2 className="mt-3 font-display text-4xl text-balance sm:text-5xl">No hype. Just how it works.</h2>
        </Reveal>
        <div className="mt-10 space-y-2">
          {FAQ.map((f, i) => <FaqItem key={i} q={f.q} a={f.a} />)}
        </div>
      </section>

      {/* ══════ FINAL CTA ══════ */}
      <section className="mx-auto max-w-content px-5 pb-24">
        <Reveal className="relative overflow-hidden rounded-panel border border-white/10 bg-ink2 px-6 py-20 text-center">
          <Aurora />
          <div className="relative">
            <p className="eyebrow">Ready?</p>
            <h2 className="mx-auto mt-4 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
              Your next viral post starts with a link you already know.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sand">
              2 free blueprints. No card. Blueprint in ~30 seconds. The whole loop — one window.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/auth" className="btn-gradient text-[15px]">
                Start free — no card <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#pricing" className="btn-ghost text-[15px]">See pricing</a>
            </div>
            <p className="mt-6 text-xs text-stone">
              2 free recreations · Blueprint in ~30s · Cancel any time
            </p>
          </div>
        </Reveal>
      </section>

      <Footer />
    </main>
  )
}

// ─── Feature visuals ──────────────────────────────────────────────────────────

function VoiceVisual() {
  return (
    <div className="gradient-border glass rounded-panel p-5 shadow-lift">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-stone">Voice profile · @you</span>
        <Dots />
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-[10px] uppercase tracking-wider text-stone">Summary</div>
          <div className="mt-1.5 text-sm text-cream">Direct, warm, a little punchy. Hooks with a bold claim, lands with proof. Zero fluff.</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Spec k="Tone" v="Confident, friendly" />
          <Spec k="Pacing" v="Fast, no dead air" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-stone">Signature phrases</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {["honestly", "here's the thing", "zero fluff", "let's go"].map((w) => (
              <span key={w} className="chip">{w}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-teal/10 p-3 text-sm text-teal">
          <Check className="h-4 w-4" /> Confirmed — this is me
        </div>
      </div>
    </div>
  )
}

function BlueprintVisual() {
  return (
    <div className="gradient-border glass rounded-panel p-5 shadow-lift">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-stone">Your blueprint</span>
        <Dots />
      </div>
      <div className="space-y-2.5">
        {[
          { icon: Sparkles, k: 'Hook', v: '"Everyone tells you to post more. Wrong."', accent: 'text-amber' },
          { icon: FileText, k: 'Script', v: '6 beats · with delivery directions', accent: 'text-coral' },
          { icon: Video, k: 'Shots', v: '3 setups · close-up · b-roll insert', accent: 'text-teal' },
          { icon: Captions, k: 'Captions', v: 'Chunked, on-brand, accent word timed', accent: 'text-teal' },
          { icon: TrendingUp, k: 'Sprint', v: '20-minute plan, minute by minute', accent: 'text-amber' },
        ].map(({ icon: Icon, k, v, accent }) => (
          <div key={k} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5">
              <Icon className={cn('h-3.5 w-3.5', accent)} />
            </span>
            <span className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-stone">{k}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-cream">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EditVisual() {
  return (
    <div className="gradient-border glass rounded-panel p-5 shadow-lift">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-stone">Auto-edit · one click</span>
        <Dots />
      </div>
      <div className="space-y-3">
        <div className="relative grid aspect-[9/14] max-h-40 place-items-center overflow-hidden rounded-xl border border-white/8 bg-gradient-to-b from-coral/25 via-ink2 to-ink">
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, ease: EASE }}
            className="rounded-lg bg-ink/80 px-3 py-1.5 font-heading text-lg text-cream shadow-lift"
          >
            post <span className="text-amber">smarter</span>
          </motion.span>
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/50 px-1.5 py-0.5 text-[9px] text-cream">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-coral" /> 0:18 · vertical 9:16
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            [Captions, 'Captions'],
            [Mic, 'Loudnorm'],
            [Clapperboard, 'Jump cuts'],
          ].map(([Ic, label]) => (
            <div key={String(label)} className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.03] px-2 py-2 text-[10px] text-sand">
              {/* @ts-expect-error icon */}
              <Ic className="h-3.5 w-3.5 text-teal" /> {label}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-teal/10 p-2.5 text-sm text-teal">
          <Check className="h-4 w-4" /> Rendered vertical · ready to post
        </div>
      </div>
    </div>
  )
}

// ─── Format card ─────────────────────────────────────────────────────────────

function FormatCard({ f }: { f: typeof FORMATS[0] }) {
  return (
    <div className={cn('relative flex aspect-[9/16] flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-b p-4', f.bg)}>
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <div className="relative">
        <p className="text-sm leading-tight text-cream/80">{f.cap}</p>
        <p className="mt-0.5 text-sm font-heading leading-tight text-cream">{f.accent}</p>
        <div className="mt-3 flex items-center justify-between text-[10px] text-stone">
          <span>{f.platform}</span>
          <span>{f.views} views</span>
        </div>
      </div>
    </div>
  )
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Reveal>
      <button
        onClick={() => setOpen((v) => !v)}
        className="glass w-full p-5 text-left transition-colors hover:border-white/16"
      >
        <div className="flex items-center justify-between gap-4">
          <span className="font-heading text-base text-cream">{q}</span>
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
          <p className="pt-3 text-sm leading-relaxed text-sand">{a}</p>
        </motion.div>
      </button>
    </Reveal>
  )
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Dots() {
  return (
    <span className="flex gap-1.5">
      <i className="h-2 w-2 rounded-full bg-amber/70" />
      <i className="h-2 w-2 rounded-full bg-coral/70" />
      <i className="h-2 w-2 rounded-full bg-teal/70" />
    </span>
  )
}

function Spec({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3.5">
      <div className="text-[10px] uppercase tracking-wider text-stone">{k}</div>
      <div className="mt-1 text-sm text-cream">{v}</div>
    </div>
  )
}

// ─── Footer ──────────────────────────────────────────────────────────────────

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
            <li><a href="/#features" className="hover:text-cream">Features</a></li>
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
            <li><a href="/#pricing" className="hover:text-cream">Agency plan</a></li>
          </ul>
          <p className="mt-6 text-xs leading-relaxed text-stone">Reference in.<br />Finished video out.</p>
        </div>
      </div>
      <div className="border-t border-white/8 py-5 text-center text-xs text-stone">
        © {new Date().getFullYear()} TwinAI · {BRAND.category}
      </div>
    </footer>
  )
}
