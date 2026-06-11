import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wand2, LibraryBig, Mic2, Clapperboard, CalendarClock, Sparkles, LogOut, Menu, X,
} from 'lucide-react'
import { Logo, LogoMark } from './Logo'
import { useAuth } from '../context/AuthContext'
import { videosFromCredits } from '../lib/brand'
import { cn } from '../lib/cn'
import { EASE } from './motion'

const NAV = [
  { to: '/app', label: 'Studio', icon: Wand2, note: 'Make a blueprint' },
  { to: '/history', label: 'Library', icon: LibraryBig, note: 'All your blueprints' },
]

// Roadmap items live in the nav so the product feels bigger than today —
// honestly labeled "soon", never clickable into a dead end.
const SOON = [
  { label: 'Record', icon: Mic2 },
  { label: 'Auto-edit', icon: Clapperboard },
  { label: 'Publish', icon: CalendarClock },
]

// The authenticated dashboard frame: fixed sidebar on desktop, top bar + sheet
// on mobile. Marketing chrome (Nav/footer) never appears inside the app.
export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  const left = videosFromCredits(profile?.credits ?? 0)
  const isActive = (to: string) =>
    to === '/app' ? pathname === '/app' || pathname.startsWith('/result') : pathname.startsWith(to)

  const doSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <div className="flex min-h-screen">
      {/* ---- Desktop sidebar ---- */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/8 bg-ink2/70 backdrop-blur-xl lg:flex">
        <div className="px-5 py-5">
          <Link to="/app"><Logo /></Link>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-stone">Create</p>
          {NAV.map((n) => {
            const active = isActive(n.to)
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                  active ? 'bg-white/[0.06] text-cream' : 'text-sand hover:bg-white/[0.04] hover:text-cream',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="side-active"
                    className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-signature"
                    transition={{ duration: 0.3, ease: EASE }}
                  />
                )}
                <n.icon className={cn('h-4.5 w-4.5 h-[18px] w-[18px]', active ? 'text-amber' : 'text-stone group-hover:text-sand')} />
                <span className="flex-1">{n.label}</span>
              </Link>
            )
          })}

          <p className="px-3 pb-1 pt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-stone">Coming soon</p>
          {SOON.map((n) => (
            <div key={n.label} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-stone/70">
              <n.icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{n.label}</span>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide">soon</span>
            </div>
          ))}
        </nav>

        {/* Credits + sign out */}
        <div className="space-y-2 p-3">
          <div className="gradient-border relative rounded-card bg-ink p-4">
            <div className="flex items-center gap-2 text-xs text-stone">
              <Sparkles className="h-3.5 w-3.5 text-amber" /> Recreations left
            </div>
            <div className="mt-1 font-display text-2xl">{left}</div>
            <div className="mt-1 text-[11px] text-stone">Resets monthly with your plan.</div>
          </div>
          <button
            onClick={doSignOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-stone transition-colors hover:bg-white/[0.04] hover:text-cream"
          >
            <LogOut className="h-[18px] w-[18px]" /> Sign out
          </button>
        </div>
      </aside>

      {/* ---- Mobile top bar ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/8 bg-ink/80 px-4 py-3 backdrop-blur-xl lg:hidden">
          <Link to="/app" className="inline-flex items-center gap-2">
            <LogoMark size={26} />
            <span className="font-bold tracking-tight text-cream">Twin<span className="text-amber">AI</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="chip"><Sparkles className="h-3.5 w-3.5 text-amber" /> {left}</span>
            <button
              className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5"
              onClick={() => setOpen((v) => !v)}
              aria-label="Menu"
            >
              {open ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
            </button>
          </div>
        </header>

        <AnimatePresence>
          {open && (
            <motion.nav
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="sticky top-[57px] z-40 overflow-hidden border-b border-white/8 bg-ink/95 backdrop-blur-xl lg:hidden"
            >
              <div className="space-y-1 p-3">
                {NAV.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm',
                      isActive(n.to) ? 'bg-white/[0.06] text-cream' : 'text-sand',
                    )}
                  >
                    <n.icon className="h-[18px] w-[18px]" /> {n.label}
                    <span className="ml-auto text-xs text-stone">{n.note}</span>
                  </Link>
                ))}
                <button
                  onClick={doSignOut}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-stone"
                >
                  <LogOut className="h-[18px] w-[18px]" /> Sign out
                </button>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
