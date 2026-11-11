// Public-site header, built one for one from the <header> in Landing.dc.html,
// Privacy/Terms.dc.html (>=768) and MLanding.dc.html (<768).
// Desktop: floating pill, 858px on Landing and 768px on the legal pages.
// Phone: sticky text bar, wordmark + Sign in + Start free, no menu.
import { Link, useLocation } from 'react-router-dom'
import { LogoMark } from './Logo'
import { useAuth } from '../context/AuthContext'

const LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#who', label: 'Who it’s for' },
  { href: '/#pricing', label: 'Pricing' },
]

const CTA_BG = 'bg-[linear-gradient(110deg,#FFB347,#FF5B7B_55%,#65E5D8)]'
const TAP = '[@media(pointer:coarse)]:min-h-11'

export function Nav() {
  const { session } = useAuth()
  const { pathname } = useLocation()
  const wide = pathname === '/'
  const pill = 'rounded-full px-[14px] py-[6px] text-[14px] text-sand no-underline'

  return (
    <>
      {/* Phone (<768): MLanding.dc.html */}
      <header className="sticky top-0 z-50 flex items-center justify-between bg-[rgba(7,7,10,0.85)] px-5 pb-[10px] pt-[max(10px,env(safe-area-inset-top))] leading-[normal] text-cream backdrop-blur-[14px] md:hidden">
        <Link to="/" className="text-[17px] font-bold text-cream no-underline">
          Twin<span className="text-amber">AI</span>
        </Link>
        <span className="flex items-center gap-[14px] text-[14px]">
          {session ? (
            <Link to="/app" className={`rounded-full px-4 py-2 font-bold text-ink no-underline ${CTA_BG}`}>Open studio</Link>
          ) : (
            <>
              <Link to="/auth?mode=signin" className={`flex items-center text-sand no-underline ${TAP}`}>Sign in</Link>
              <Link to="/auth?mode=signup" className={`flex items-center rounded-full px-4 py-2 font-bold text-ink no-underline ${CTA_BG} ${TAP}`}>Start free</Link>
            </>
          )}
        </span>
      </header>

      {/* >=768: Landing / Privacy / Terms boards */}
      <header className="fixed inset-x-0 top-5 z-50 hidden justify-center px-4 leading-[normal] md:flex">
        <div
          className={`box-border flex w-full items-center justify-between rounded-full border border-white/10 bg-[rgba(12,12,17,0.70)] px-[10px] py-2 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur-[20px] ${wide ? 'max-w-[858px]' : 'max-w-[768px]'}`}
        >
          <Link to="/" className="flex items-center gap-2 rounded-full px-2 py-1 no-underline">
            <LogoMark size={26} />
            <span className="font-bold tracking-[-0.01em] text-cream">Twin<span className="text-amber">AI</span></span>
          </Link>
          <nav className="flex items-center">
            {LINKS.map((l) => <a key={l.href} href={l.href} className={`${pill} hover:text-cream`}>{l.label}</a>)}
          </nav>
          <div className="flex items-center gap-1">
            {session ? (
              <Link to="/app" className={`inline-flex items-center rounded-full px-[22px] py-2 text-[14px] font-bold text-ink no-underline ${CTA_BG}`}>Open studio</Link>
            ) : (
              <>
                <Link to="/auth?mode=signin" className={`${pill} hover:text-cream`}>Sign in</Link>
                <Link to="/auth?mode=signup" className={`inline-flex items-center rounded-full px-[22px] py-2 text-[14px] font-bold text-ink no-underline ${CTA_BG}`}>Start free</Link>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  )
}
