import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getGeneration } from '../lib/api'
import type { Generation } from '../lib/types'
import { GradientBar } from '../components/GradientBar'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass p-6">
      <p className="eyebrow">{title}</p>
      <div className="mt-3">{children}</div>
    </section>
  )
}

export default function Result() {
  const { id } = useParams()
  const [gen, setGen] = useState<Generation | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    getGeneration(id).then((g) => {
      setGen(g)
      setLoading(false)
    })
  }, [id])

  if (loading) return <main className="mx-auto max-w-3xl px-5 py-16 text-sand">Loading…</main>
  if (!gen) return <main className="mx-auto max-w-3xl px-5 py-16 text-coral">Not found.</main>

  const b = gen.blueprint

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <GradientBar />
      <div className="mt-8 flex items-center justify-between">
        <p className="eyebrow">Your blueprint</p>
        <Link to="/app" className="btn-ghost">
          New blueprint
        </Link>
      </div>

      <h1 className="mt-3 font-display text-3xl">{b.reference_read.format_label}</h1>
      <p className="mt-1 text-sand">
        Read as <span className="text-teal">{b.reference_read.platform}</span> · fidelity:{' '}
        {gen.fidelity}
      </p>

      <div className="mt-8 space-y-4">
        <Section title="Why it works">
          <ul className="list-disc space-y-1 pl-5 text-sand">
            {b.reference_read.why_it_works.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Section>

        <Section title="Retention map">
          <div className="space-y-2">
            {b.reference_read.retention_map.map((r, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <span className="chip shrink-0">{r.beat}</span>
                <span className="text-sand">{r.goal}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Hook options">
          <ul className="space-y-2">
            {b.hook_options.map((h, i) => (
              <li key={i} className="rounded-lg bg-white/5 p-3 text-cream">
                “{h}”
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Script">
          <div className="space-y-3">
            {b.script.map((s, i) => (
              <div key={i}>
                <div className="text-xs uppercase tracking-wider text-coral">{s.section}</div>
                <div className="text-cream">{s.line}</div>
                <div className="text-xs text-stone">▶ {s.direction}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Shot list">
          <div className="space-y-2">
            {b.shot_list.map((s, i) => (
              <div key={i} className="text-sm">
                <span className="font-heading text-cream">{s.shot}</span> ·{' '}
                <span className="text-teal">{s.framing}</span>
                <div className="text-stone">{s.notes}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Captions">
          <div className="flex flex-wrap gap-2">
            {b.captions.map((c, i) => (
              <span key={i} className="chip">
                {c}
              </span>
            ))}
          </div>
        </Section>

        <Section title="One-click edit checklist">
          <ul className="space-y-1 text-sand">
            {b.edit_checklist.map((c, i) => (
              <li key={i}>✓ {c}</li>
            ))}
          </ul>
        </Section>

        <Section title="Submagic packet">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-stone">Captions:</span> {b.submagic_packet.caption_style}
            </div>
            <div>
              <span className="text-stone">Pacing:</span> {b.submagic_packet.pacing}
            </div>
            <div>
              <span className="text-stone">Emphasis:</span> {b.submagic_packet.emphasis}
            </div>
            <div>
              <span className="text-stone">Export:</span> {b.submagic_packet.export}
            </div>
          </div>
        </Section>

        <Section title="20-minute production sprint">
          <div className="space-y-2">
            {b.production_sprint.map((p, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <span className="chip shrink-0">{p.minute}</span>
                <span className="text-sand">{p.task}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Publish plan">
          <div className="space-y-3">
            {b.publish_plan.map((p, i) => (
              <div key={i} className="rounded-lg bg-white/5 p-3">
                <div className="text-teal">{p.platform}</div>
                <div className="text-cream">{p.caption}</div>
                <div className="text-xs text-stone">
                  {p.hashtags.join(' ')} · best time: {p.best_time}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-stone">
            Direct auto-publish is on the roadmap — for now this is a ready-to-paste schedule.
          </p>
        </Section>
      </div>
    </main>
  )
}
