// Public legal page (Privacy Policy / Terms of Use) from the Privacy and Terms
// boards: centred column, a switcher between the two, an "At a glance" row, and
// numbered sections that open and close. Public: NOT in App.tsx's inApp list.
import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { LogoMark } from '../components/Logo'
import SiteFooter from '../components/SiteFooter'
import { cn } from '../lib/cn'
import { LEGAL_CONTACT_EMAIL, LEGAL_LAST_UPDATED } from '../content/legal/types'
import type { LegalDoc, LegalRun } from '../content/legal/types'

const TONE = { teal: 'bg-teal', amber: 'bg-amber', coral: 'bg-coral' } as const

function Placeholder({ children }: { children: string }) {
  return <span className="rounded-md bg-amber/15 px-1.5 py-0.5 text-amber-soft">{children}</span>
}

function Run({ r }: { r: LegalRun }) {
  if (r.contact) {
    return (
      <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-coral-soft underline-offset-2 hover:underline">
        {LEGAL_CONTACT_EMAIL}
      </a>
    )
  }
  if (r.placeholder) return <Placeholder>{r.t}</Placeholder>
  return r.b ? <strong className="font-semibold text-cream">{r.t}</strong> : <>{r.t}</>
}

function Section({ s, open, onToggle }: { s: LegalDoc['sections'][number]; open: boolean; onToggle: () => void }) {
  const bodyId = useId()
  const items = s.blocks
  return (
    <section
      className={cn(
        'rounded-card border bg-ink2 transition-colors',
        open ? 'border-coral/35' : 'border-white/[0.07]',
      )}
    >
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex w-full items-center gap-4 rounded-card px-4 py-5 text-left sm:px-6"
        >
          <span
            className={cn(
              'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-9 text-sm font-bold',
              open ? 'bg-signature text-ink' : 'bg-white/[0.06] text-sand-muted',
            )}
            aria-hidden="true"
          >
            {s.n}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[17px] font-semibold text-cream">{s.h}</span>
            <span className="text-sm text-stone">{s.sum}</span>
          </span>
          <span
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-white/10 text-cream"
            aria-hidden="true"
          >
            <Plus className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-45')} />
          </span>
        </button>
      </h3>
      <div id={bodyId} hidden={!open} className="space-y-3 px-4 pb-6 text-[15px] leading-relaxed text-sand sm:pl-[78px] sm:pr-8">
        {items.map((b, i) => {
          if (b.kind === 'li') {
            // Group consecutive list items into one <ul>.
            if (items[i - 1]?.kind === 'li') return null
            const run: typeof items = []
            for (let j = i; j < items.length && items[j].kind === 'li'; j++) run.push(items[j])
            return (
              <ul key={i} className="list-disc space-y-2 pl-5 marker:text-stone">
                {run.map((li, k) => (
                  <li key={k}>{li.runs.map((r, m) => <Run key={m} r={r} />)}</li>
                ))}
              </ul>
            )
          }
          return (
            <p
              key={i}
              className={cn(b.kind === 'key' && 'rounded-xl border-l-2 border-teal/60 bg-teal/[0.06] px-4 py-3')}
            >
              {b.runs.map((r, m) => <Run key={m} r={r} />)}
            </p>
          )
        })}
      </div>
    </section>
  )
}

export default function LegalPage({ doc, kind }: { doc: LegalDoc; kind: 'privacy' | 'terms' }) {
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true })
  const all = doc.sections.every((_, i) => open[i])

  useEffect(() => {
    document.title = `${doc.title} · TwinAI`
    window.scrollTo(0, 0)
  }, [doc.title])

  const other = kind === 'privacy' ? { to: '/terms', label: 'Terms of Use' } : { to: '/privacy', label: 'Privacy Policy' }

  return (
    <div className="page-glow min-h-screen">
      <main className="mx-auto w-full max-w-[880px] px-4 pt-28 sm:px-5 sm:pt-32">
        <nav aria-label="Legal pages" className="flex justify-center">
          <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
            {(['privacy', 'terms'] as const).map((k) => (
              <Link
                key={k}
                to={`/${k}`}
                aria-current={k === kind ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors sm:min-h-9',
                  k === kind ? 'bg-cream text-ink' : 'text-sand hover:text-cream',
                )}
              >
                {k === 'privacy' ? 'Privacy Policy' : 'Terms of Use'}
              </Link>
            ))}
          </div>
        </nav>

        <header className="mt-9 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber">{doc.eyebrow}</p>
          <h1 className="mt-3 font-display text-[44px] leading-[1.05] tracking-tight text-cream sm:text-6xl">{doc.title}</h1>
          <p className="mx-auto mt-4 max-w-xl text-[17px] text-sand">{doc.lede}</p>
          <p className="mt-4 text-[13px] text-stone">
            Twin Studios LLC · Last updated{' '}
            {LEGAL_LAST_UPDATED ?? <Placeholder>[date]</Placeholder>}
          </p>
        </header>

        <section aria-labelledby="glance" className="mt-14">
          <h2 id="glance" className="text-center text-xs font-bold uppercase tracking-[0.18em] text-stone">At a glance</h2>
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {doc.glance.map((g) => (
              <li key={g.title} className="rounded-card border border-white/[0.07] bg-ink2 p-5">
                <span className={cn('block h-2 w-2 rounded-full', TONE[g.tone])} aria-hidden="true" />
                <p className="mt-3 text-base font-semibold leading-snug text-cream">{g.title}</p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-stone">{g.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="full" className="mt-14">
          <div className="flex items-center justify-between gap-3">
            <h2 id="full" className="text-xs font-bold uppercase tracking-[0.18em] text-stone">
              {doc.full} · {doc.sections.length} sections
            </h2>
            <button
              type="button"
              onClick={() =>
                setOpen(all ? {} : Object.fromEntries(doc.sections.map((_, i) => [i, true])))
              }
              className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-white/10 px-4 text-[13px] text-cream transition-colors hover:border-white/20 sm:min-h-9"
            >
              {all ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
          <div className="mt-4 space-y-2.5">
            {doc.sections.map((s, i) => (
              <Section key={s.n} s={s} open={!!open[i]} onToggle={() => setOpen((o) => ({ ...o, [i]: !o[i] }))} />
            ))}
          </div>
        </section>

        <aside className="mb-20 mt-10 flex flex-col gap-4 rounded-[20px] border border-white/[0.08] bg-[linear-gradient(135deg,rgba(255,179,71,0.08),rgba(255,91,123,0.06)_50%,rgba(101,229,216,0.05))] p-6 sm:flex-row sm:items-center sm:gap-5">
          <LogoMark size={34} />
          <div className="flex-1">
            <p className="text-[17px] font-semibold text-cream">Questions about this page?</p>
            <p className="mt-1 text-sm text-sand-muted">
              Write to us and a real person will answer. Or read our{' '}
              <Link to={other.to} className="text-coral-soft hover:underline">{other.label}</Link>.
            </p>
          </div>
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="btn-primary w-full sm:w-auto">Contact us</a>
        </aside>
      </main>
      <SiteFooter />
    </div>
  )
}
