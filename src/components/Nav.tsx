import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, ArrowRight } from 'lucide-react'
import { Logo } from './Logo'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/cn'
import { EASE } from './motion'

const LINKS = [
  { href: '/#loop', label: 'The loop' },
  { href: '/#pipeline', label: 'What you get' },
  { href: '/#agencies', label: 'Agencies' },
  { href: '/#pricing', label: 'Pricing' },
]

// Marketing-site navigation ONLY. The dashboard has its own AppShell sidebar —
// app links and credit counts never leak onto the landing page.
export function Nav() {
  const { session } = useAuth()
  const { pathname } = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => setOpen(false), [pathname])

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: EASE }}
      className={cn(
        'sticky top-0 z-50 transition-colors duration-300',
        scrolled ? 'border-b border-white/10 bg-ink/70 backdrop-blur-xl' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex max-w-content items-center justify-between px-5 py-3.5">
        <Link to="/" className="transition-opacity hover:opacity-90">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1.5 text-sm md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sand transition-colors hover:text-cream">
              {l.label}
            </a>
          ))}
          {session ? (
            <Link to="/app" className="btn-gradient ml-2 py-2">
              Open studio <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <>
              <Link to="/auth" className="rounded-lg px-3 py-2 text-sand transition-colors hover:text-cream">
                Sign in
              </Link>
              <Link to="/auth" className="btn-gradient ml-1 py-2">Start free</Link>
            </>
          )}
        </nav>

        <button
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden border-t border-white/10 bg-ink/95 backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col gap-1 px-5 py-4 text-sm">
              {LINKS.map((l) => (
                <a key={l.href} href={l.href} className="rounded-lg px-3 py-2.5 text-sand hover:bg-white/5">
                  {l.label}
                </a>
              ))}
              {session ? (
                <Link to="/app" className="btn-gradient mt-2">Open studio</Link>
              ) : (
                <>
                  <Link to="/auth" className="rounded-lg px-3 py-2.5 text-sand hover:bg-white/5">Sign in</Link>
                  <Link to="/auth" className="btn-gradient mt-2">Start free</Link>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
