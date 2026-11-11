import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { LogoMark } from './Logo'
import { useAuth } from '../context/AuthContext'
import { EASE } from './motion'

const LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#who', label: 'Who it’s for' },
  { href: '/#pricing', label: 'Pricing' },
]

// Navigation. On md+ it's the floating "bubble" pill lifted off the page,
// kreate.ai-style. On phones a floating pill reads as broken — page content
// visibly scrolls around/behind its rounded corners and the gaps beside it —
// so mobile gets a normal edge-to-edge solid bar that content scrolls UNDER.
// The dashboard has its own AppShell; app links never leak here.
export function Nav() {
  const { session } = useAuth()

  return (
    <motion.header
      initial={{ y: -28, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 md:top-5 md:px-4"
    >
      <div className="pointer-events-auto mx-auto flex max-w-[860px] items-center justify-between gap-2 border-b border-white/10 bg-ink/90 py-2 pl-4 pr-3 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl md:rounded-full md:border md:bg-ink2/70 md:pl-2.5 md:pr-2.5 md:pt-2 md:shadow-[0_8px_40px_-12px_rgba(0,0,0,.7)]">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2 rounded-full px-2 py-1 transition-opacity hover:opacity-90">
          <LogoMark size={26} />
          <span className="font-bold tracking-tight text-cream">Twin<span className="text-amber">AI</span></span>
        </Link>

        {/* Center links */}
        <nav className="hidden items-center md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full px-3.5 py-1.5 text-sm text-sand transition-colors hover:bg-white/5 hover:text-cream"
            >
              {l.label}
            </a>
          ))}
        </nav>

        {/* CTA */}
        <div className="hidden items-center gap-1 md:flex">
          {session ? (
            <Link to="/app" className="btn-gradient !rounded-full !py-2 text-sm">
              Open studio <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <>
              <Link to="/auth?mode=signin" className="rounded-full px-3.5 py-1.5 text-sm text-sand transition-colors hover:text-cream">
                Sign in
              </Link>
              <Link to="/auth?mode=signup" className="btn-gradient !rounded-full !py-2 text-sm">
                Start free
              </Link>
            </>
          )}
        </div>

        {/* Phone (MLanding board): Sign in + Start free right in the bar, no menu.
            The section links live in the footer. */}
        <div className="flex items-center gap-1 md:hidden">
          {session ? (
            <Link to="/app" className="btn-gradient !rounded-full !px-4 !py-2 text-sm">
              Open studio
            </Link>
          ) : (
            <>
              <Link to="/auth?mode=signin" className="flex min-h-11 items-center rounded-full px-3 text-sm text-sand hover:text-cream">
                Sign in
              </Link>
              <Link to="/auth?mode=signup" className="btn-gradient !rounded-full !px-4 !py-2 text-sm">
                Start free
              </Link>
            </>
          )}
        </div>
      </div>
    </motion.header>
  )
}
