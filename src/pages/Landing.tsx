import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import {
  ArrowRight, Check, Plus, Minus, AtSign, Wand2, Captions, Clapperboard, Scissors,
  ShieldCheck, Zap, Building2, Users, Clock, Eye, Heart, Play, Send, LayoutGrid,
  FileText, Sparkles, Star, TrendingUp, Mic, BarChart3,
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

const TICKER = [
  'Paste any link', 'Decode the hook', 'Script in your voice', 'Built-in teleprompter',
  'One-click edit', 'Word-synced captions', 'Publish anywhere', 'Niche gallery', 'Track what works',
]

const PAIN = [
  {
    n: '01',
    t: 'The blank page after the scroll',
    d: 'You watch something hit a million views and know you could do your version. Then you open a doc and stare. The idea evaporates.',
  },
  {
    n: '02',
    t: 'It comes out sounding like everyone else',
    d: 'You copy the format and it feels fake — or you start from scratch and it takes hours. Either way, it doesn’t sound like you.',
  },
  {
    n: '03',
    t: 'You post it, and it dies',
    d: 'Weak hook, slow edit, no idea why. No system, no feedback loop, no consistency. So you post less. So you grow slower.',
  },
]

// The one-loop sequence — the heart of the page.
const LOOP = [
  { icon: Play, k: 'Paste', t: 'Paste a link you wish you’d made', d: 'Any TikTok, Reel or Short. That’s the whole input — we pull and transcribe the real audio.' },
  { icon: Wand2, k: 'Decode', t: 'We decode why it worked', d: 'The exact hook window, the beats, the pacing, the retention mechanics. Real analysis, not vibes.' },
  { icon: FileText, k: 'Blueprint', t: 'Get a shootable blueprint', d: 'Hook options, full script in your voice, shot list, edit checklist, caption pack — a 20-min plan.' },
  { icon: Clapperboard, k: 'Record', t: 'Record it right here', d: 'Your script loads into a built-in teleprompter. Hit record, nail the hook, done.' },
  { icon: Scissors, k: 'Edit', t: 'Edit in one click', d: 'Word-synced captions, dead-air trimmed, jump cuts and b-roll, exported vertical — automatically.' },
  { icon: Send, k: 'Post', t: 'Post it — and grow the gallery', d: 'Publish to your accounts. Mark it public and it joins the niche gallery others learn from and remix.' },
]

const FEATURES = [
  { icon: AtSign, t: 'Voice DNA', d: 'Paste your @handle once. We read your real posts and build a voice profile every script is written in.' },
  { icon: FileText, t: 'Full blueprint', d: 'Not a caption — a hook, script with delivery notes, shot list, edit checklist and a 20-minute shoot plan.' },
  { icon: Clapperboard, t: 'In-app teleprompter', d: 'Record straight from the browser with your script scrolling. A hook-timing marker keeps you on pace.' },
  { icon: Scissors, t: 'One-click auto-edit', d: 'Animated captions, dead-air removal, beat-timed jump cuts, b-roll cutaways, vertical export. One tap.' },
  { icon: Send, t: 'Publish & schedule', d: 'Push finished videos to your accounts or queue them — the loop ends with a post, not a download.' },
  { icon: LayoutGrid, t: 'Niche gallery', d: 'A living feed of what’s working in your niche — see why it hit, then recreate it in one click.' },
]

const BENEFITS = [
  { icon: Clock, big: '~2 hrs', label: 'saved per video', sub: 'scripting + editing, gone' },
  { icon: TrendingUp, big: '4×', label: 'more posts shipped', sub: 'same effort, more shots on goal' },
  { icon: Eye, big: 'Proven', label: 'structures only', sub: 'rebuilt from what already won' },
]

const SOCIAL_PROOF = [
  { name: 'Marcus L.', handle: '@marcuslive', quote: 'I went from one video a week to four. The blueprint is the fastest part of my workflow now.', metric: '4× output' },
  { name: 'Priya K.', handle: '@priyakreates', quote: 'The voice profile is scary good. Scripts read exactly like how I talk — I stopped rewriting hooks.', metric: 'Zero rewrites' },
  { name: 'Jake Finn', handle: '@jakefinnmedia', quote: 'Running 6 client brands. The workspaces feature alone saves my team hours every week.', metric: '18h/wk saved' },
]

const FAQ = [
  { q: 'Do you copy other people’s videos?', a: 'No. We read the structure — hook shape, pacing, retention beats — and rebuild it as an original in your voice. We never clip or repost footage. The idea stays yours; the format becomes yours too.' },
  { q: 'Will this make me go viral?', a: 'No honest tool can promise that. We give you a proven structure and a fast, repeatable way to ship — more quality shots on goal, in less time. That’s the real edge.' },
  { q: 'How is this different from a clipper?', a: 'Clippers chop footage you already have. TwinAI takes a reference you admire and makes it shootable as something new — in your voice, from scratch, with a full script, shot list, edit and post.' },
  { q: 'What do I actually get from one link?', a: 'A complete blueprint (hooks, script, shot list, edit checklist, caption pack, 20-minute plan), an in-app teleprompter to record it, a one-click edit, and publishing — the whole loop in one window.' },
  { q: 'How does it learn my voice?', a: 'You paste your @handle. We read your recent public posts — captions, hooks and your spoken audio — and synthesise a voice profile you confirm and can edit. It sharpens as you create more.' },
  { q: 'Can I use it for clients?', a: 'Yes. The Agency plan gives you 15 brand voices — one per client — plus multi-brand workspaces. Switch context in one tap, batch a week of content in an afternoon, ship consistent quality across every account.' },
]

// ─── page ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    <main className="noise overflow-clip">

      {/* ══════ HERO ══════ */}
      <section className="relative">
        <Aurora />
        <div className="relative mx-auto max-w-content px-5 pb-16 pt-28 sm:pt-32 lg:pt-36">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
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
                className="mt-6 font-display text-[2.6rem] leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-[3.6rem]"
              >
                You know what goes viral.{' '}
                <span className="gradient-text-animated">Now make your version</span> — in minutes.
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.14 }}
                className="mt-5 max-w-xl text-lg leading-relaxed text-sand"
              >
                You scroll past a video with millions of views and think <em className="not-italic text-cream">“I could’ve made that.”</em>{' '}
                Paste the link. TwinAI turns it into a ready-to-shoot blueprint in your voice, films it with you,
                edits it in one click, and helps you post it. <span className="text-cream">The whole loop — one window.</span>
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.22 }}
                className="mt-8 flex flex-wrap gap-3"
              >
                <Link to="/auth" className="btn-gradient text-base">
                  Start free — 2 recreations <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="#loop" className="btn-ghost text-base">See how it works</a>
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

            <HeroVisual />
          </div>
        </div>

        {/* Ticker */}
        <div className="relative border-y border-white/8 bg-ink2/60 py-4">
          <div className="mask-fade-x flex overflow-hidden">
            <div className="flex shrink-0 animate-marquee items-center gap-8 pr-8">
              {[...TICKER, ...TICKER].map((w, i) => (
                <span key={i} className="inline-flex items-center gap-8 whitespace-nowrap text-xs font-semibold uppercase tracking-widest text-stone">
                  {w} <span className="h-1 w-1 rounded-full bg-white/20" />
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════ PAIN ══════ */}
      <section className="mx-auto max-w-content px-5 py-20 sm:py-24">
        <Reveal className="text-center">
          <p className="eyebrow">The creator’s trap</p>
          <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
            More content isn’t the problem. <span className="gradient-text">Making it fast enough is.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sand">Every creator hits the same three walls. TwinAI tears all three down.</p>
        </Reveal>
        <Stagger className="mt-12 grid gap-5 md:grid-cols-3" gap={0.08}>
          {PAIN.map((p) => (
            <RevealItem key={p.n}>
              <div className="glass h-full p-7">
                <span className="font-mono text-sm text-coral">{p.n}</span>
                <h3 className="mt-3 text-lg font-heading text-cream">{p.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sand">{p.d}</p>
              </div>
            </RevealItem>
          ))}
        </Stagger>
      </section>

      {/* ══════ THE LOOP ══════ */}
      <section id="loop" className="relative scroll-mt-24 py-12 sm:py-16">
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

      {/* ══════ BENEFITS STRIP ══════ */}
      <section className="mx-auto max-w-content px-5 py-8">
        <Stagger className="grid gap-4 sm:grid-cols-3" gap={0.07}>
          {BENEFITS.map((b) => (
            <RevealItem key={b.label}>
              <div className="glass flex items-center gap-4 p-5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-signature-soft">
                  <b.icon className="h-5 w-5 text-cream" />
                </span>
                <div>
                  <div className="font-display text-2xl leading-none">{b.big}</div>
                  <div className="mt-1 text-sm font-medium text-cream">{b.label}</div>
                  <div className="text-xs text-stone">{b.sub}</div>
                </div>
              </div>
            </RevealItem>
          ))}
        </Stagger>
      </section>

      {/* ══════ WHAT YOU GET ══════ */}
      <section id="features" className="mx-auto max-w-content scroll-mt-24 px-5 py-20 sm:py-24">
        <Reveal className="text-center">
          <p className="eyebrow">What you get</p>
          <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
            Six tools that used to be six apps.
          </h2>
        </Reveal>
        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" gap={0.06}>
          {FEATURES.map((f) => (
            <RevealItem key={f.t}>
              <Tilt className="h-full" max={6}>
                <div className="glass glass-hover h-full p-7">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-signature-soft">
                    <f.icon className="h-5 w-5 text-cream" />
                  </span>
                  <h3 className="mt-5 text-lg font-heading text-cream">{f.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-sand">{f.d}</p>
                </div>
              </Tilt>
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
                  Run every client like <span className="gradient-text">one machine.</span>
                </h2>
                <p className="mt-4 text-sand">
                  A separate brand voice per client, proven references turned into shootable blueprints in seconds,
                  and more reels across more accounts — without growing the team. Workspaces start included; add more any time.
                </p>
                <ul className="mt-6 space-y-2.5">
                  {[
                    'A distinct voice profile for each client brand',
                    'Switch the active workspace in one tap',
                    'Batch a week of content in an afternoon',
                    'Consistent quality across every account',
                    'Add extra brand voices as you grow',
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
                { icon: Clock, to: 12, suffix: 'h', label: 'Saved / client / week', sub: 'vs. scripting + editing by hand' },
                { icon: Eye, to: 3, suffix: '×', label: 'More posts shipped', sub: 'same headcount, more output' },
                { icon: Heart, to: 47, suffix: '%', label: 'More engagement', sub: 'proven hooks, on-brand' },
                { icon: Users, to: 15, suffix: '+', label: 'Brands per workspace', sub: 'each with its own voice' },
              ].map((m) => (
                <div key={m.label} className="bg-ink2 p-7">
                  <m.icon className="h-5 w-5 text-amber" />
                  <div className="mt-4 font-display text-4xl tracking-tight"><Counter to={m.to} suffix={m.suffix} /></div>
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
      <section id="pricing" className="relative mx-auto max-w-content scroll-mt-24 px-5 py-20 sm:py-24">
        <Reveal className="text-center">
          <p className="eyebrow">Pricing</p>
          <h2 className="mt-3 font-display text-4xl text-balance sm:text-5xl">Start free. Scale when it’s working.</h2>
          <p className="mx-auto mt-4 max-w-xl text-sand">Simple monthly recreation counts — no per-action billing, no confusing credits. Cancel any time.</p>
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
                  {p.annual ? <div className="text-xs text-stone">${p.annual}/mo billed annually</div> : <div className="h-4" />}
                  <ul className="mt-5 flex-1 space-y-2 text-sm text-sand">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> {f}</li>
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

      {/* ══════ SOCIAL PROOF ══════ */}
      <section className="mx-auto max-w-content px-5 py-12">
        <Reveal className="text-center">
          <p className="eyebrow">What creators say</p>
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
                <p className="mt-4 text-sm leading-relaxed text-sand">“{s.quote}”</p>
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
            <p className="mx-auto mt-4 max-w-md text-sand">2 free recreations. No card. Blueprint in ~30 seconds. The whole loop — one window.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/auth" className="btn-gradient text-[15px]">Start free — no card <ArrowRight className="h-4 w-4" /></Link>
              <a href="#pricing" className="btn-ghost text-[15px]">See pricing</a>
            </div>
          </div>
        </Reveal>
      </section>

      <Footer />
    </main>
  )
}

// ─── The Loop sequence (auto-cycling stepper + live phone) ─────────────────────
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
                  'relative z-10 flex w-full items-start gap-4 rounded-2xl p-3 text-left transition-colors',
                  on ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]',
                )}
              >
                <span className={cn(
                  'grid h-11 w-11 shrink-0 place-items-center rounded-full border transition-colors',
                  on ? 'border-transparent bg-signature text-ink' : done ? 'border-teal/40 bg-teal/10 text-teal' : 'border-white/12 bg-ink2 text-stone',
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

      <div className="order-1 flex justify-center lg:order-2">
        <div className="relative w-[230px]">
          <div className="relative overflow-hidden rounded-[40px] border-[6px] border-white/15 bg-ink shadow-[0_40px_90px_-20px_rgba(0,0,0,.8)]">
            <div className="flex justify-center bg-ink pt-3 pb-1">
              <div className="h-[18px] w-[80px] rounded-full bg-black/60" />
            </div>
            <div className="relative h-[420px] overflow-hidden bg-gradient-to-b from-coral/25 via-ink2 to-ink">
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

          <motion.div
            key={`chip-${active}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute -right-4 top-10 z-20 flex items-center gap-1.5 rounded-full bg-signature px-3 py-1.5 text-xs font-bold text-ink shadow-glow"
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
        <Bar label="Hook window" v="0.0–1.8s" />
        <Bar label="Retention" v="62%" />
        <div className="mt-1 flex items-end gap-1" style={{ height: 90 }}>
          {[40, 70, 55, 85, 60, 95, 72, 50].map((h, i) => (
            <motion.span key={i} initial={{ height: 0 }} animate={{ height: h }} transition={{ delay: i * 0.05 }} className="w-full rounded-sm bg-gradient-to-t from-coral to-amber" />
          ))}
        </div>
      </div>
    )
  }
  if (index === 2) {
    return (
      <div className="flex h-full flex-col gap-2 p-5 pt-8">
        <div className="text-[10px] uppercase tracking-wider text-stone">Your blueprint</div>
        {([[Sparkles, 'Hook · “Everyone says post more. Wrong.”'], [FileText, 'Script · 6 beats, in your voice'], [Captions, 'Shot list · 3 setups + b-roll'], [Mic, 'Caption pack · on-brand']] as const).map(([Ic, t], i) => (
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
            <p className="mt-1 font-heading text-sm leading-tight text-cream">“You’re 35 and think it’s too late? Watch this.”</p>
          </div>
          <div className="mt-3 flex justify-center"><div className="h-9 w-9 rounded-full border-4 border-coral bg-white/90" /></div>
        </div>
      </div>
    )
  }
  if (index === 4) {
    return (
      <div className="flex h-full flex-col justify-center gap-3 p-5">
        <div className="grid aspect-[9/13] place-items-center overflow-hidden rounded-xl border border-white/8 bg-gradient-to-b from-coral/25 to-ink">
          <span className="rounded-lg bg-ink/80 px-3 py-1.5 font-heading text-base text-cream shadow-lift">post <span className="text-amber">smarter</span></span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-[9px] text-sand">
          {['Captions', 'Jump cuts', 'B-roll'].map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-md border border-white/8 bg-white/[0.03] px-1.5 py-1"><Check className="h-3 w-3 text-teal" />{t}</span>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-5">
      <div className="text-[10px] uppercase tracking-wider text-stone">Published</div>
      <div className="flex items-center gap-2 rounded-xl bg-teal/10 px-3 py-2.5 text-xs text-teal"><Check className="h-4 w-4" /> Posted to TikTok + Reels</div>
      <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-xs text-sand"><LayoutGrid className="h-4 w-4 text-amber" /> Added to your niche gallery</div>
      <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-xs text-sand"><BarChart3 className="h-4 w-4 text-coral" /> Tracking views &amp; saves</div>
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

// ─── FAQ ───────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Reveal>
      <button onClick={() => setOpen((v) => !v)} className="glass w-full p-5 text-left transition-colors hover:border-white/16">
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

// ─── Footer ───────────────────────────────────────────────────
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
            <li><a href="/#loop" className="hover:text-cream">How it works</a></li>
            <li><a href="/#features" className="hover:text-cream">What you get</a></li>
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
