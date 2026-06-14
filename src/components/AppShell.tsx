import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutDashboard, Wand2, LibraryBig, LayoutGrid, Sparkles, LogOut, Menu, X } from 'lucide-react'
import { Logo, LogoMark } from './Logo'
import { BrandSwitcher } from './BrandSwitcher'
import { useAuth } from '../context/AuthContext'
import { videosFromCredits } from '../lib/brand'
import { cn } from '../lib/cn'
import { EASE } from './motion'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, note: 'Your overview' },
  { to: '/app',       label: 'Studio',    icon: Wand2,            note: 'Make a blueprint' },
  { to: '/gallery',   label: 'Gallery',   icon: LayoutGrid,       note: 'Formats to remix' },
  { to: '/history',   label: 'Library',   icon: LibraryBig,       note: 'All your blueprints' },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const left = videosFromCredits(profile?.credits ?? 0)
  const isActive = (to: string) => to === '/app' ? pathname === '/app' || pathname.startsWith('/result') : pathname.startsWith(to)
  // Hard navigation (full reload), not SPA navigate(): a client-side route change
  // here raced the AnimatePresence route exit while `profile` was torn down,
  // leaving a blank screen on logout. A full reload guarantees a clean render.
  const doSignOut = async () => { await signOut(); window.location.assign('/') }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/8 bg-ink2/70 backdrop-blur-xl lg:flex">
        <div className="px-5 py-5"><Link to="/app"><Logo /></Link></div>
        <BrandSwitcher />
        <nav className="flex-1 space-y-1 px-3 pt-2">
          {NAV.map((n) => {
            const active = isActive(n.to)
            return (
              <Link key={n.to} to={n.to} className={cn('group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors', active ? 'bg-white/[0.06] text-cream' : 'text-sand hover:bg-white/[0.04] hover:text-cream')}>
                {active && <motion.span layoutId="side-active" className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-signature" transition={{ duration: 0.3, ease: EASE }} />}
                <n.icon className={cn('h-[18px] w-[18px]', active ? 'text-amber' : 'text-stone group-hover:text-sand')} />
                <span className="flex-1">{n.label}</span>
              </Link>
            )
          })}
        </nav>
        <div className="space-y-2 p-3">
          <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-ink2 p-4">
            <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full bg-amber/10 blur-[40px]" />
            <div className="relative">
              <div className="flex items-center gap-2 text-xs text-stone"><Sparkles className="h-3.5 w-3.5 text-amber" /> Recreations left</div>
              <div className="mt-1 font-display text-2xl text-cream">{left}</div>
              <div className="mt-1 text-[11px] text-stone">Resets monthly with your plan.</div>
            </div>
          </div>
          <button onClick={doSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-stone transition-colors hover:bg-white/[0.04] hover:text-cream">
            <LogOut className="h-[18px] w-[18px]" /> Sign out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/8 bg-ink/80 px-4 py-3 backdrop-blur-xl lg:hidden">
          <Link to="/app" className="inline-flex items-center gap-2">
            <LogoMark size={26} />
            <span className="font-bold tracking-tight text-cream">Twin<span className="text-amber">AI</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="chip"><Sparkles className="h-3.5 w-3.5 text-amber" /> {left}</span>
            <button className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5" onClick={() => setOpen((v) => !v)} aria-label="Menu">
              {open ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
            </button>
          </div>
        </header>
        <AnimatePresence>
          {open && (
            <motion.nav initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }} className="sticky top-[57px] z-40 overflow-hidden border-b border-white/8 bg-ink/95 backdrop-blur-xl lg:hidden">
              <div className="space-y-1 p-3">
                {NAV.map((n) => (
                  <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm', isActive(n.to) ? 'bg-white/[0.06] text-cream' : 'text-sand')}>
                    <n.icon className="h-[18px] w-[18px]" /> {n.label}
                    <span className="ml-auto text-xs text-stone">{n.note}</span>
                  </Link>
                ))}
                <button onClick={doSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-stone">
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
