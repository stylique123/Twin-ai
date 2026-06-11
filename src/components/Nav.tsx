import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, Sparkles } from 'lucide-react'
import { Logo } from './Logo'
import { useAuth } from '../context/AuthContext'
import { videosFromCredits } from '../lib/brand'
import { cn } from '../lib/cn'
import { EASE } from './motion'

export function Nav() {
  const { session, profile, signOut } = useAuth()
  const navigate = useNavigate()
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
        <Link to={session ? '/app' : '/'} className="transition-opacity hover:opacity-90">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1.5 text-sm md:flex">
          {session ? (
            <>
              {profile && (
                <span className="chip mr-1" title="Recreations left">
                  <Sparkles className="h-3.5 w-3.5 text-amber" />
                  {videosFromCredits(profile.credits)} left
                </span>
              )}
              <NavLink to="/app" active={pathname === '/app'}>Studio</NavLink>
              <NavLink to="/history" active={pathname === '/history'}>History</NavLink>
              <button
                className="btn-ghost ml-1 py-2"
                onClick={async () => {
                  await signOut()
                  navigate('/')
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <NavAnchor href="/#how">How it works</NavAnchor>
              <NavAnchor href="/#features">Features</NavAnchor>
              <NavAnchor href="/#pricing">Pricing</NavAnchor>
              <Link to="/auth" className="btn-gradient ml-2 py-2">Start free</Link>
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
              {session ? (
                <>
                  <MobileLink to="/app">Studio</MobileLink>
                  <MobileLink to="/history">History</MobileLink>
                  <button
                    className="btn-ghost mt-2"
                    onClick={async () => {
                      await signOut()
                      navigate('/')
                    }}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <a href="/#how" className="rounded-lg px-3 py-2.5 text-sand hover:bg-white/5">How it works</a>
                  <a href="/#features" className="rounded-lg px-3 py-2.5 text-sand hover:bg-white/5">Features</a>
                  <a href="/#pricing" className="rounded-lg px-3 py-2.5 text-sand hover:bg-white/5">Pricing</a>
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

function NavLink({ to, active, children }: { to: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={cn(
        'relative rounded-lg px-3 py-2 transition-colors',
        active ? 'text-cream' : 'text-sand hover:text-cream',
      )}
    >
      {children}
      {active && (
        <motion.span
          layoutId="nav-underline"
          className="absolute inset-x-3 -bottom-px h-px bg-signature"
          transition={{ duration: 0.3, ease: EASE }}
        />
      )}
    </Link>
  )
}

function NavAnchor({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="rounded-lg px-3 py-2 text-sand transition-colors hover:text-cream">
      {children}
    </a>
  )
}

function MobileLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="rounded-lg px-3 py-2.5 text-sand hover:bg-white/5">
      {children}
    </Link>
  )
}
