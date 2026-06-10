import { Link } from 'react-router-dom'
import { GradientBar } from '../components/GradientBar'
import { BRAND, PLANS } from '../lib/brand'

const STEPS = [
  { n: '01', t: 'Drop a reference', d: 'Paste any Reel, TikTok, Short or YouTube link you wish you’d made.' },
  { n: '02', t: 'We read why it works', d: 'TwinAI breaks down the hook, pacing, retention map and format — not the footage.' },
  { n: '03', t: 'Get it in your voice', d: 'A personalized hook, script, shot list, edit plan and schedule — shootable today.' },
]

export default function Landing() {
  return (
    <main className="mx-auto max-w-6xl px-5">
      {/* Hero */}
      <section className="pt-16 pb-10">
        <GradientBar />
        <div className="mt-10 max-w-3xl">
          <p className="eyebrow">{BRAND.category}</p>
          <h1 className="mt-4 font-display text-5xl leading-[1.05] sm:text-6xl">
            Remix any viral video <span className="gradient-text">in seconds.</span>
          </h1>
          <p className="mt-5 text-lg text-sand">{BRAND.subLine}</p>
          <p className="mt-3 max-w-2xl text-stone">{BRAND.positioning}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/auth" className="btn-primary">
              Start free — 2 recreations
            </Link>
            <a href="#how" className="btn-ghost">
              See how it works
            </a>
            <span className="text-sm text-stone">No card required.</span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-14">
        <p className="eyebrow">How it works</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="glass p-6">
              <div className="font-mono text-coral">{s.n}</div>
              <h3 className="mt-3 text-xl font-heading">{s.t}</h3>
              <p className="mt-2 text-sand">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-14">
        <p className="eyebrow">Pricing</p>
        <h2 className="mt-3 font-display text-3xl">Start free. Scale when it’s working.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {PLANS.map((p) => (
            <div key={p.id} className={`glass relative p-6 ${p.badge ? 'ring-1 ring-coral/40' : ''}`}>
              {p.badge && (
                <span className="absolute -top-2 right-4 rounded-full bg-signature px-2 py-0.5 text-xs font-bold text-ink">
                  {p.badge}
                </span>
              )}
              <h3 className="text-lg font-heading">{p.name}</h3>
              <div className="mt-2 text-3xl font-display">
                ${p.price}
                <span className="text-sm font-normal text-stone">/mo</span>
              </div>
              {p.annual && <div className="text-xs text-stone">${p.annual}/mo billed annually</div>}
              <ul className="mt-4 space-y-1.5 text-sm text-sand">
                {p.features.map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              <Link to="/auth" className="btn-ghost mt-5 block text-center">
                {p.price === 0 ? 'Start free' : `Choose ${p.name}`}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Honest answers */}
      <section className="py-14">
        <p className="eyebrow">The honest answers</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="glass p-6">
            <h3 className="font-heading">Do you copy other people’s videos?</h3>
            <p className="mt-2 text-sand">
              No. We read the <em>structure</em> of what works — hook shape, pacing, retention — and rebuild
              it as an original in your voice. We don’t clip or repost footage.
            </p>
          </div>
          <div className="glass p-6">
            <h3 className="font-heading">Will this make me go viral?</h3>
            <p className="mt-2 text-sand">
              No guarantees — anyone who promises that is lying. We give you a proven structure and a fast,
              repeatable way to ship, so you get more shots on goal.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 py-10 text-sm text-stone">
        © {new Date().getFullYear()} TwinAI · {BRAND.oneLiner}
      </footer>
    </main>
  )
}
