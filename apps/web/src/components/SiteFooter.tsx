// Public-site footer from the redesign (Landing, Privacy, Terms).
// Logo + line + copyright on the left; Product / Account / Legal columns.
// Stacks to one column on phones, 2 columns from sm, 4 from lg.
import { Link } from 'react-router-dom'
import { Logo } from './Logo'

type FooterLink = { label: string; to: string }

const COLUMNS: { heading: string; links: FooterLink[] }[] = [
  {
    heading: 'Product',
    links: [
      { label: 'How it works', to: '/#how' },
      { label: 'Who it’s for', to: '/#who' },
      { label: 'Pricing', to: '/#pricing' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Start free', to: '/auth?mode=signup' },
      { label: 'Sign in', to: '/auth?mode=signin' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms of Use', to: '/terms' },
    ],
  },
]

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.07] bg-ink">
      <div className="mx-auto grid max-w-content grid-cols-1 gap-10 px-4 pt-14 pb-[max(3rem,env(safe-area-inset-bottom))] sm:grid-cols-2 sm:px-5 lg:grid-cols-[minmax(0,1fr)_170px_170px_170px]">
        <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-1">
          <Link to="/" aria-label="TwinAI home" className="self-start">
            <Logo />
          </Link>
          <p className="max-w-[280px] text-sm leading-relaxed text-stone">The human touch, at the speed of AI.</p>
          <p className="mt-auto pt-4 text-xs text-stone-dim">© 2026 Twin Studios LLC. All Rights Reserved.</p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.heading} aria-label={col.heading} className="flex flex-col gap-1">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-stone-dim">{col.heading}</p>
            {col.links.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                className="flex min-h-11 items-center text-[14.5px] text-sand-muted transition-colors hover:text-cream sm:min-h-8"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
    </footer>
  )
}
