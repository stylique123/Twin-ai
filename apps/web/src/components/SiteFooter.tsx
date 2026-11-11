// Site footer. Built one for one from the <footer> in Landing.dc.html (>=768px)
// and MLanding.dc.html (<768px). Text under 12px is raised to 12px (rule 1.3).
// 768-1023: the 4-column grid drops to 2 columns (rule B).
import { Link } from 'react-router-dom'
import { LogoMark } from './Logo'

const COLUMNS: { heading: string; links: { label: string; to: string }[] }[] = [
  {
    heading: 'PRODUCT',
    links: [
      { label: 'How it works', to: '/#how' },
      { label: 'Who it’s for', to: '/#who' },
      { label: 'Pricing', to: '/#pricing' },
    ],
  },
  {
    heading: 'ACCOUNT',
    links: [
      { label: 'Start free', to: '/auth?mode=signup' },
      { label: 'Sign in', to: '/auth?mode=signin' },
    ],
  },
  {
    heading: 'LEGAL',
    links: [
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms of Use', to: '/terms' },
    ],
  },
]

const SHORT = 'The human touch, at the speed of AI. '
const LONG = 'The human touch, at the speed of AI. Twin writes it in your voice. You bring the face.'

function Brand() {
  return (
    <Link to="/" className="inline-flex items-center gap-[9px] self-start no-underline">
      {/* Measured: 26px on the desktop board, 24px on the phone board. */}
      <span className="block h-6 w-6 md:h-[26px] md:w-[26px] [&>svg]:!h-full [&>svg]:!w-full">
        <LogoMark />
      </span>
      <span className="text-[17px] font-bold tracking-[-0.01em] text-cream">
        Twin<span className="text-amber">AI</span>
      </span>
    </Link>
  )
}

function Column({ col, gap }: { col: (typeof COLUMNS)[number]; gap: string }) {
  return (
    <nav aria-label={col.heading.toLowerCase()} className={`flex flex-col ${gap}`}>
      <span className="text-[12px] font-bold tracking-[.12em] text-stone-dim">{col.heading}</span>
      {col.links.map((l) => (
        <Link key={l.label} to={l.to} className="leading-[1.3] text-sand-muted no-underline hover:text-cream [@media(pointer:coarse)]:flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center">
          {l.label}
        </Link>
      ))}
    </nav>
  )
}

/** `longTagline`: the desktop Landing board uses the short line; Privacy/Terms
 *  use the long one. Phone (MLanding) always uses the long one. */
export default function SiteFooter({ longTagline = false }: { longTagline?: boolean }) {
  return (
    <footer className="mt-2 border-t border-white/[0.07] bg-footer leading-[normal] md:mt-0">
      {/* Phone: MLanding.dc.html */}
      <div className="flex flex-col gap-[26px] px-5 pb-[max(38px,env(safe-area-inset-bottom))] pt-[34px] text-[14px] md:hidden">
        <div className="flex flex-col gap-[10px]">
          <Brand />
          <span className="max-w-[280px] text-[14px] leading-[1.55] text-label">{LONG}</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {COLUMNS.map((c) => <Column key={c.heading} col={c} gap="gap-[11px]" />)}
        </div>
        <span className="text-[12.5px] text-stone-dim">© 2026 Twin Studios LLC. All Rights Reserved.</span>
      </div>

      {/* >=768: Landing.dc.html */}
      <div className="mx-auto hidden max-w-[1120px] grid-cols-2 gap-10 px-6 pb-12 pt-14 text-[14.5px] md:grid lg:grid-cols-[minmax(0,1fr)_170px_170px_170px] min-[1168px]:px-0">
        <div className="col-span-2 flex flex-col gap-3 lg:col-span-1">
          <Brand />
          <span className="max-w-[280px] text-[14px] leading-[1.55] text-label">{longTagline ? LONG : SHORT}</span>
          <span className="min-h-[18px] flex-grow" />
          <span className="text-[12.5px] text-stone-dim">© 2026 Twin Studios LLC. All Rights Reserved.</span>
        </div>
        {COLUMNS.map((c) => <Column key={c.heading} col={c} gap="gap-[13px]" />)}
      </div>
    </footer>
  )
}
