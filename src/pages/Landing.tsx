import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight, Link2, ScanSearch, Wand2, Check, Plus, Minus,
  Captions, Clapperboard, Mic, Calendar, Layers, ShieldCheck, Zap,
} from 'lucide-react'
import { BRAND, PLANS } from '../lib/brand'
import { Aurora } from '../components/Aurora'
import { HeroVisual } from '../components/HeroVisual'
import { Reveal, Stagger, RevealItem, EASE } from '../components/motion'
import { Tilt } from '../components/Tilt'
import { Counter } from '../components/Counter'
import { ReelCard, type Reel } from '../components/ReelCard'
import { cn } from '../lib/cn'

const STATS = [
  { to: 30, suffix: 's', label: 'Average time to a blueprint' },
  { to: 1, prefix: '', suffix: ' link', label: 'In — that’s all it takes' },
  { to: 5, suffix: ' outputs', label: 'Hook · script · shots · edit · schedule' },
  { to: 0, suffix: '', label: 'Footage you need to start' },
]

const REELS: Reel[] = [
  { poster: 'bg-gradient-to-br from-coral/35 via-ink2 to-ink', accent: 'text-amber', capLead: 'You’re 35 and think', capAccent: 'it’s late?', views: '2.1M', likes: '184K', platform: 'TikTok' },
  { poster: 'bg-gradient-to-br from-teal/30 via-ink2 to-ink', accent: 'text-teal', capLead: 'The one habit that', capAccent: 'changed everything', views: '880K', likes: '76K', platform: 'Reels' },
  { poster: 'bg-gradient-to-br from-amber/30 via-ink2 to-ink', accent: 'text-coral', capLead: 'Stop editing like', capAccent: 'it’s 2019', views: '1.4M', likes: '120K', platform: 'Shorts' },
  { poster: 'bg-gradient-to-br from-coral/25 via-ink2 to-ink', accent: 'text-amber', capLead: 'Read this before you', capAccent: 'post again', views: '640K', likes: '51K', platform: 'TikTok' },
]

const MARQUEE = ['TikTok', 'Reels', 'Shorts', 'Hooks', 'Retention', 'Shot lists', 'Captions', 'B-roll', 'Voiceover', 'Schedules']

const STEPS = [
  { icon: Link2, n: '01', t: 'Drop a reference', d: 'Paste any Reel, TikTok, Short or YouTube link you wish you’d made.' },
  { icon: ScanSearch, n: '02', t: 'We read why it works', d: 'TwinAI transcribes it and maps the hook, pacing, retention beats and format — never the footage.' },
  { icon: Wand2, n: '03', t: 'Get it in your voice', d: 'A personalized hook, script, shot list, edit plan and caption pack — shootable today.' },
]

const FEATURES = [
  { icon: ScanSearch, t: 'Real structural read', d: 'We transcribe the actual video and extract the hook window, beats and retention pattern — not a guess from the URL.', span: 'md:col-span-2' },
  { icon: Mic, t: 'Your true voice', d: 'Profiled from your real posts and spoken audio, so every script sounds like you.', span: '' },
  { icon: Clapperboard, t: 'Shot list + edit plan', d: 'Beat-by-beat timing, framing and cuts.', span: '' },
  { icon: Captions, t: 'On-brand captions', d: 'Auto-styled caption packs ready to drop on.', span: '' },
  { icon: Calendar, t: 'Publish + schedule', d: 'Post to every platform on a rhythm that keeps momentum.', span: 'md:col-span-2' },
]

const FAQ = [
  { q: 'Do you copy other people’s videos?', a: 'No. We read the structure of what works — hook shape, pacing, retention — and rebuild it as an original in your voice. We never clip or repost footage.' },
  { q: 'Will this make me go viral?', a: 'No guarantees — anyone who promises that is lying. We give you a proven structure and a fast, repeatable way to ship, so you get far more quality shots on goal.' },
  { q: 'How is this different from a clipper?', a: 'Clippers chop up footage you already have. TwinAI takes a reference you admire and makes it shootable as something new, in your voice.' },
  { q: 'What do I actually get back?', a: 'A complete blueprint: hook options, full script, shot list with timing, an edit plan, a caption pack, and a suggested posting schedule.' },
]

export default function Landing() {
  return (
    <main className="noise overflow-clip">
      {/* ---------------- HERO ---------------- */}
      <section className="relative">
        <Aurora />
        <div className="relative mx-auto grid max-w-content items-center gap-12 px-5 pt-20 pb-16 lg:grid-cols-[1.05fr_0.95fr] lg:pt-28 lg:pb-24">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-sand backdrop-blur"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-teal shadow-[0_0_10px_2px_rgba(101,229,216,.7)]" />
              {BRAND.category}
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE, delay: 0.06 }}
              className="mt-5 font-display text-5xl leading-[1.02] tracking-tight text-balance sm:text-6xl lg:text-7xl"
            >
              Remix any viral video{' '}
              <span className="gradient-text-animated">in seconds.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE, delay: 0.14 }}
              className="mt-6 max-w-xl text-lg text-sand"
            >
              {BRAND.subLine} TwinAI reads <em className="text-cream not-italic">why</em> a reference works and
              rebuilds it as an original hook, script, shot list and edit — in your voice.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE, delay: 0.22 }}
              className="mt-9 flex flex-wrap items-center gap-3"
            >
              <Link to="/auth" className="btn-gradient text-[15px]">
                Start free — 2 recreations <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#how" className="btn-ghost text-[15px]">See how it works</a>
              <span className="text-sm text-stone">No card required.</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.4 }}
              className="mt-8 flex items-center gap-5 text-xs text-stone"
            >
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-teal" /> Doesn’t copy footage</span>
              <span className="inline-flex items-center gap-1.5"><Zap className="h-4 w-4 text-amber" /> Blueprint in ~30s</span>
            </motion.div>
          </div>

          <HeroVisual />
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

      {/* ---------------- STATS BAND ---------------- */}
      <section className="mx-auto max-w-content px-5 py-16">
        <Stagger className="grid grid-cols-2 gap-4 md:grid-cols-4" gap={0.08}>
          {STATS.map((s) => (
            <RevealItem key={s.label}>
              <div className="glass glass-hover p-6 text-center">
                <div className="font-display text-4xl tracking-tight">
                  <Counter to={s.to} prefix={s.prefix} suffix={s.suffix} />
                </div>
                <div className="mt-2 text-xs text-stone">{s.label}</div>
              </div>
            </RevealItem>
          ))}
        </Stagger>
      </section>

      {/* ---------------- REEL WALL ---------------- */}
      <section className="mx-auto max-w-content px-5 py-12">
        <Reveal>
          <p className="eyebrow">Reference in · finished video out</p>
          <h2 className="mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
            The formats you scroll past — rebuilt as yours.
          </h2>
        </Reveal>
        <Stagger className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4" gap={0.08}>
          {REELS.map((r, i) => (
            <RevealItem key={i}>
              <Tilt className="group" max={10}>
                <ReelCard reel={r} />
              </Tilt>
            </RevealItem>
          ))}
        </Stagger>
      </section>

      {/* ---------------- HOW IT WORKS ---------------- */}
      <section id="how" className="mx-auto max-w-content px-5 py-24">
        <Reveal>
          <p className="eyebrow">How it works</p>
          <h2 className="mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
            From a link you admire to a video you can shoot.
          </h2>
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

      {/* ---------------- BEFORE / AFTER ---------------- */}
      <section className="mx-auto max-w-content px-5 py-12">
        <Reveal className="gradient-border glass overflow-hidden rounded-panel">
          <div className="grid md:grid-cols-2">
            <div className="border-b border-white/8 p-8 md:border-b-0 md:border-r">
              <p className="eyebrow text-stone">Other tools</p>
              <h3 className="mt-3 text-2xl font-heading text-sand">Clip the footage you already have.</h3>
              <ul className="mt-5 space-y-2.5 text-sand">
                {['Needs your own raw video first', 'Re-uses the same moments', 'No structural insight', 'Sounds like a template'].map((t) => (
                  <li key={t} className="flex items-center gap-2.5 text-stone">
                    <Minus className="h-4 w-4 shrink-0" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative p-8">
              <div className="absolute inset-0 bg-signature-soft opacity-40" />
              <div className="relative">
                <p className="eyebrow">TwinAI</p>
                <h3 className="mt-3 text-2xl font-heading">Make the references you admire — shootable.</h3>
                <ul className="mt-5 space-y-2.5">
                  {['Start from any link, no footage needed', 'Original, never a repost', 'Real hook + retention breakdown', 'Written in your actual voice'].map((t) => (
                    <li key={t} className="flex items-center gap-2.5 text-cream">
                      <Check className="h-4 w-4 shrink-0 text-teal" /> {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------------- FEATURES (BENTO) ---------------- */}
      <section id="features" className="mx-auto max-w-content px-5 py-24">
        <Reveal>
          <p className="eyebrow">Everything in one blueprint</p>
          <h2 className="mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
            Not a caption tool. The whole shoot, planned.
          </h2>
        </Reveal>

        <Stagger className="mt-12 grid gap-5 md:grid-cols-3" gap={0.07}>
          {FEATURES.map((f) => (
            <RevealItem key={f.t} className={f.span}>
              <div className="glass glass-hover h-full p-7">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/5">
                  <f.icon className="h-5 w-5 text-amber" />
                </span>
                <h3 className="mt-5 text-lg font-heading">{f.t}</h3>
                <p className="mt-2 text-sand">{f.d}</p>
              </div>
            </RevealItem>
          ))}
          <RevealItem>
            <div className="relative grid h-full place-items-center overflow-hidden rounded-card bg-signature p-7 text-ink">
              <div className="text-center">
                <Layers className="mx-auto h-7 w-7" />
                <p className="mt-3 text-lg font-heading">One reference in.</p>
                <p className="text-sm font-medium opacity-80">A full shoot out.</p>
              </div>
            </div>
          </RevealItem>
        </Stagger>
      </section>

      {/* ---------------- PRICING ---------------- */}
      <section id="pricing" className="relative mx-auto max-w-content px-5 py-24">
        <Reveal className="text-center">
          <p className="eyebrow">Pricing</p>
          <h2 className="mt-3 font-display text-4xl text-balance sm:text-5xl">Start free. Scale when it’s working.</h2>
          <p className="mx-auto mt-4 max-w-xl text-sand">Quality-first plans. You see a simple monthly recreation count — never a confusing credit meter.</p>
        </Reveal>

        <Stagger className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4" gap={0.06}>
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
                  <Link
                    to="/auth"
                    className={cn('mt-6 w-full', featured ? 'btn-gradient' : 'btn-ghost')}
                  >
                    {p.price === 0 ? 'Start free' : `Choose ${p.name}`}
                  </Link>
                </div>
              </RevealItem>
            )
          })}
        </Stagger>
      </section>

      {/* ---------------- FAQ ---------------- */}
      <section className="mx-auto max-w-3xl px-5 py-24">
        <Reveal className="text-center">
          <p className="eyebrow">The honest answers</p>
          <h2 className="mt-3 font-display text-4xl text-balance sm:text-5xl">No hype. Just how it works.</h2>
        </Reveal>
        <div className="mt-10 space-y-3">
          {FAQ.map((f, i) => <FaqItem key={i} q={f.q} a={f.a} />)}
        </div>
      </section>

      {/* ---------------- FINAL CTA ---------------- */}
      <section className="mx-auto max-w-content px-5 pb-24">
        <Reveal className="relative overflow-hidden rounded-panel border border-white/10 bg-ink2 px-6 py-16 text-center">
          <Aurora />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
              You bring the idea. <span className="gradient-text">TwinAI makes it shootable.</span>
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/auth" className="btn-gradient text-[15px]">
                Start free <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#pricing" className="btn-ghost text-[15px]">See pricing</a>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------------- FOOTER ---------------- */}
      <Footer />
    </main>
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

function Footer() {
  return (
    <footer className="border-t border-white/8">
      <div className="mx-auto flex max-w-content flex-col items-center justify-between gap-6 px-5 py-10 sm:flex-row">
        <div>
          <Logoish />
          <p className="mt-2 text-sm text-stone">{BRAND.oneLiner}</p>
        </div>
        <div className="flex items-center gap-6 text-sm text-stone">
          <a href="#how" className="hover:text-cream">How it works</a>
          <a href="#features" className="hover:text-cream">Features</a>
          <a href="#pricing" className="hover:text-cream">Pricing</a>
          <Link to="/auth" className="hover:text-cream">Sign in</Link>
        </div>
      </div>
      <div className="border-t border-white/8 py-5 text-center text-xs text-stone">
        © {new Date().getFullYear()} TwinAI · {BRAND.category}
      </div>
    </footer>
  )
}

function Logoish() {
  return (
    <span className="font-display text-lg">
      Twin<span className="text-amber">AI</span>
    </span>
  )
}
