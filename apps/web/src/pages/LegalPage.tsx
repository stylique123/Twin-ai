// Public legal page, built one for one from Privacy.dc.html / Terms.dc.html.
// Board column is 880px; below that it keeps 16px gutters (rule B). Public:
// NOT in App.tsx's inApp list.
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogoMark } from '../components/Logo'
import SiteFooter from '../components/SiteFooter'
import { useReveal } from '../hooks/useReveal'
import { cn } from '../lib/cn'
import {
  LEGAL_CONTACT_EMAIL, LEGAL_DELETION_WINDOW, LEGAL_GOVERNING_LAW, LEGAL_LAST_UPDATED,
} from '../content/legal/types'
import type { LegalDoc, LegalRun } from '../content/legal/types'

const DOT = { teal: 'bg-teal', amber: 'bg-amber', coral: 'bg-coral', 'teal-soft': 'bg-teal-soft' } as const

/** Board placeholder pill: amber on amber/12, radius 6, .92em. */
function Ph({ children }: { children: ReactNode }) {
  return <span className="rounded-[6px] bg-[rgba(255,179,71,.12)] px-[7px] py-[1px] text-[max(12px,.92em)] text-amber">{children}</span>
}

function filled(t: string): string | null {
  if (/timeframe/i.test(t)) return LEGAL_DELETION_WINDOW
  if (/jurisdiction/i.test(t)) return LEGAL_GOVERNING_LAW
  return null
}

function Run({ r }: { r: LegalRun }) {
  if (r.contact) {
    return LEGAL_CONTACT_EMAIL
      ? <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-coral-soft no-underline">{LEGAL_CONTACT_EMAIL}</a>
      : <Ph>[contact email]</Ph>
  }
  if (r.placeholder) return <>{filled(r.t) ?? <Ph>{r.t}</Ph>}</>
  return r.b ? <b className="font-semibold text-cream">{r.t}</b> : <>{r.t}</>
}

function Section({ s, open, onToggle }: { s: LegalDoc['sections'][number]; open: boolean; onToggle: () => void }) {
  const id = `legal-sec-${s.n}`
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[18px] border bg-card transition-[border-color,background] duration-[250ms] ease-in-out',
        open ? 'border-[rgba(255,91,123,0.35)]' : 'border-white/[0.07] hover:border-white/[.14]',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full cursor-pointer items-center gap-[18px] border-0 bg-transparent px-4 py-5 text-left font-[inherit] text-cream sm:px-6"
      >
        <span
          className={cn(
            'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] text-[13.5px] font-extrabold',
            open ? 'bg-[linear-gradient(135deg,#FFB347,#FF5B7B)] text-ink' : 'bg-white/[0.06] text-sand-muted',
          )}
          aria-hidden="true"
        >
          {s.n}
        </span>
        <span className="flex flex-grow flex-col gap-[3px]">
          <span className="text-[17px] font-[650]">{s.h}</span>
          <span className="text-[14px] text-label">{s.sum}</span>
        </span>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.12] text-[18px] text-sand-soft transition-transform duration-300 ease-in-out"
          style={{ transform: `rotate(${open ? 45 : 0}deg)` }}
          aria-hidden="true"
        >
          +
        </span>
      </button>
      {open && (
        <div id={id} className="mx-4 flex animate-popin flex-col gap-[14px] pb-6 pt-1 sm:mx-6 sm:pl-[52px]">
          {s.blocks.map((b, i) => {
            const runs = b.runs.map((r, k) => <Run key={k} r={r} />)
            if (b.kind === 'key') {
              return <p key={i} className="m-0 rounded-[12px] border border-[rgba(101,229,216,0.2)] bg-[rgba(101,229,216,0.06)] px-4 py-[13px] text-[15px] leading-[1.65] text-key-text">{runs}</p>
            }
            if (b.kind === 'li') {
              return (
                <p key={i} className="m-0 flex gap-3 text-[15px] leading-[1.65] text-sand">
                  <span className="mt-[10px] h-[5px] w-[5px] shrink-0 rounded-[9px] bg-coral" aria-hidden="true" />
                  <span>{runs}</span>
                </p>
              )
            }
            return <p key={i} className="m-0 text-[15px] leading-[1.7] text-sand">{runs}</p>
          })}
        </div>
      )}
    </div>
  )
}

export default function LegalPage({ doc, kind }: { doc: LegalDoc; kind: 'privacy' | 'terms' }) {
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true })
  const all = doc.sections.every((_, i) => open[i])
  const root = useRef<HTMLDivElement>(null)
  useReveal(root)

  useEffect(() => {
    document.title = `${doc.title} · TwinAI`
    window.scrollTo(0, 0)
  }, [doc.title])

  const other = kind === 'privacy' ? { to: '/terms', label: 'Terms of Use' } : { to: '/privacy', label: 'Privacy Policy' }
  const col = 'relative mx-auto w-full max-w-[912px] px-4'

  return (
    <div ref={root} className="page-glow relative flex min-h-[100dvh] flex-col overflow-x-clip bg-ink leading-[normal] text-cream">
      <div
        className="pointer-events-none absolute left-1/2 top-[-360px] -ml-[500px] h-[760px] w-[1000px] rounded-full bg-[radial-gradient(ellipse,rgba(255,91,123,0.10),rgba(255,91,123,0)_65%)]"
        aria-hidden="true"
      />

      <div className="relative flex flex-col items-center gap-4 px-4 pt-[110px] text-center md:pt-[150px]">
        <nav aria-label="Legal pages" className="pin d1 flex gap-1 rounded-full border border-white/[0.08] bg-card p-1">
          {(['privacy', 'terms'] as const).map((k) => (
            <Link
              key={k}
              to={`/${k}`}
              aria-current={k === kind ? 'page' : undefined}
              className={cn(
                'rounded-full px-[18px] py-[9px] text-[14px] font-semibold no-underline [@media(pointer:coarse)]:flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center',
                k === kind ? 'bg-cream text-ink' : 'text-sand-muted',
              )}
            >
              {k === 'privacy' ? 'Privacy Policy' : 'Terms of Use'}
            </Link>
          ))}
        </nav>
        <span className="pin d1 mt-[14px] text-[12px] font-bold tracking-[.14em] text-amber">{doc.eyebrow.toUpperCase()}</span>
        <h1 className="pin d2 m-0 text-[44px] font-bold leading-[1.02] tracking-[-0.045em] md:text-[60px]">{doc.title}</h1>
        <p className="pin d3 m-0 max-w-[640px] text-[18px] leading-[1.6] text-sand-muted">{doc.lede}</p>
        <span className="pin d4 text-[13px] text-stone-dim">
          Twin Studios LLC · Last updated {LEGAL_LAST_UPDATED ?? <Ph>[date]</Ph>}
        </span>
      </div>

      <section aria-labelledby="glance" className={cn(col, 'mt-[50px] flex flex-col gap-[14px]')}>
        <h2 id="glance" className="m-0 text-center text-[12px] font-bold tracking-[.14em] text-stone-dim">AT A GLANCE</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {doc.glance.map((g, i) => (
            <div key={g.title} className={`rv-up rv-d${i} flex flex-col gap-2 rounded-[18px] border border-white/[0.07] bg-card p-5`}>
              <span className={cn('h-2 w-2 rounded-[9px]', DOT[g.tone])} aria-hidden="true" />
              <span className="text-[16px] font-[650] leading-[1.3]">{g.title}</span>
              <span className="text-[13.5px] leading-[1.5] text-label">{g.body}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="full" className={cn(col, 'mt-14 flex flex-col gap-[10px]')}>
        <div className="flex items-center justify-between gap-3 px-1 pb-[6px]">
          <h2 id="full" className="m-0 text-[12px] font-bold tracking-[.14em] text-stone-dim">
            {doc.full.toUpperCase()} · {doc.sections.length} SECTIONS
          </h2>
          <button
            type="button"
            onClick={() => setOpen(all ? {} : Object.fromEntries(doc.sections.map((_, i) => [i, true])))}
            className="shrink-0 cursor-pointer rounded-full border border-white/[0.12] bg-transparent px-[14px] py-[7px] font-[inherit] text-[13px] text-sand-soft [@media(pointer:coarse)]:min-h-11"
          >
            {all ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
        {doc.sections.map((s, i) => (
          <Section key={s.n} s={s} open={!!open[i]} onToggle={() => setOpen((o) => ({ ...o, [i]: !o[i] }))} />
        ))}
      </section>

      <div className={cn(col, 'mb-20 mt-10')}>
        <aside className="flex flex-col items-start gap-[18px] rounded-[20px] border border-white/[0.08] bg-[linear-gradient(135deg,rgba(255,179,71,0.08),rgba(255,91,123,0.06)_50%,rgba(101,229,216,0.05))] px-7 py-[26px] sm:flex-row sm:items-center">
          <LogoMark size={34} />
          <span className="flex flex-grow flex-col gap-1">
            <span className="text-[17px] font-[650]">Questions about this page?</span>
            <span className="text-[14px] text-sand-muted">
              Write to us and a real person will answer. Or read our{' '}
              <Link to={other.to} className="text-coral-soft no-underline">{other.label}</Link>.
            </span>
          </span>
          {LEGAL_CONTACT_EMAIL ? (
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="btn-light no-underline">Contact us</a>
          ) : (
            <span className="btn-light cursor-not-allowed opacity-60" title="Contact email not set yet">Contact us</span>
          )}
        </aside>
      </div>

      <SiteFooter longTagline />
    </div>
  )
}
