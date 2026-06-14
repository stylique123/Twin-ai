import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, ArrowRight } from 'lucide-react'
import { LogoMark } from './Logo'
import { useAuth } from '../context/AuthContext'
import { EASE } from './motion'

const LINKS = [
  { href: '/#loop', label: 'How it works' },
  { href: '/#features', label: 'What you get' },
  { href: '/#agencies', label: 'Agencies' },
  { href: '/#pricing', label: 'Pricing' },
]

// Floating "bubble" navigation — a centered glass pill that lifts off the page,
// kreate.ai-style. The dashboard has its own AppShell; app links never leak here.
export function Nav() {
  const { session } = useAuth()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  useEffect(() => setOpen(false), [pathname])

  return (
    <motion.header
      initial={{ y: -28, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="pointer-events-none fixed inset-x-0 top-3 z-50 px-4 sm:top-5"
    >
      <div className="pointer-events-auto mx-auto flex max-w-3xl items-center justify-between gap-2 rounded-full border border-white/10 bg-ink2/70 py-2 pl-2.5 pr-2.5 shadow-[0_8px_40px_-12px_rgba(0,0,0,.7)] backdrop-blur-xl">
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

        {/* Mobile toggle */}
        <button
          className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-cream md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu"
        >
          {open ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
        </button>
      </div>

      {/* Mobile sheet */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="pointer-events-auto mx-auto mt-2 max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-ink2/95 p-3 backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col gap-1 text-sm">
              {LINKS.map((l) => (
                <a key={l.href} href={l.href} className="rounded-xl px-3 py-2.5 text-sand hover:bg-white/5">
                  {l.label}
                </a>
              ))}
              {session ? (
                <Link to="/app" className="btn-gradient mt-1 !rounded-xl">Open studio</Link>
              ) : (
                <>
                  <Link to="/auth?mode=signin" className="rounded-xl px-3 py-2.5 text-sand hover:bg-white/5">Sign in</Link>
                  <Link to="/auth?mode=signup" className="btn-gradient mt-1 !rounded-xl">Start free</Link>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
