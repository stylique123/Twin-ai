import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { logEvent } from '../lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutDashboard, Wand2, LibraryBig, LayoutGrid, Sparkles, LogOut, Menu, X, Settings, Users, CalendarDays } from 'lucide-react'
import { Logo, LogoMark } from './Logo'
import { BrandSwitcher } from './BrandSwitcher'
import { useAuth } from '../context/AuthContext'
import { videosFromCredits } from '../lib/brand'
import { cn } from '../lib/cn'
import { EASE } from './motion'

const NAV = [
  { to: '/dashboard', label: 'Dashboard',  icon: LayoutDashboard, note: 'Your overview' },
  { to: '/app',       label: 'Studio',     icon: Wand2,           note: 'Make a script' },
  { to: '/gallery',   label: 'Gallery',    icon: LayoutGrid,      note: 'Formats to remix' },
  // Workspaces (one voice per client) only makes sense for agencies — hidden for
  // solo/aspiring/pro, whose single voice is managed in Settings.
  { to: '/brands',    label: 'Workspaces', icon: Users,           note: 'Your clients', agencyOnly: true },
  { to: '/history',   label: 'Library',    icon: LibraryBig,      note: 'All your scripts' },
  { to: '/calendar',  label: 'Calendar',   icon: CalendarDays,    note: 'Schedule posts' },
  { to: '/settings',  label: 'Settings',   icon: Settings,        note: 'Account & DNA' },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  // Engagement depth: log a page_view per route (best-effort, never blocks).
  useEffect(() => { void logEvent('page_view', { path: pathname }) }, [pathname])
  const left = videosFromCredits(profile?.credits ?? 0)
  // Hide agency-only items (Workspaces) from solo/aspiring/pro plans.
  const navItems = NAV.filter((n) => !n.agencyOnly || profile?.plan === 'agency')
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
          {navItems.map((n) => {
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
          {/* Quiet usage hint only — the full picture lives on the Dashboard.
              Recreations are a back-of-house meter, not a number we put front and
              center, so it's a single subtle line here. */}
          <Link to="/dashboard" className="flex items-center justify-between rounded-xl px-3 py-2 text-[11px] text-stone transition-colors hover:text-sand">
            <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-amber/70" /> Remixes</span>
            <span className="text-sand">{left}</span>
          </Link>
          <button onClick={doSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-stone transition-colors hover:bg-white/[0.04] hover:text-cream">
            <LogOut className="h-[18px] w-[18px]" /> Sign out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky mobile chrome: header + dropdown in ONE sticky container so the
            menu always opens directly under the header — no safe-area magic number,
            no sliding-under-the-notch overlap. */}
        <div className="sticky top-0 z-40 lg:hidden">
          <header className="flex items-center justify-between border-b border-white/8 bg-ink/80 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
            <Link to="/app" className="inline-flex items-center gap-2">
              <LogoMark size={26} />
              <span className="font-bold tracking-tight text-cream">Twin<span className="text-amber">AI</span></span>
            </Link>
            <button className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 active:bg-white/10" onClick={() => setOpen((v) => !v)} aria-label="Menu">
              {open ? <X className="h-[18px] w-[18px]" /> : <Menu className="h-[18px] w-[18px]" />}
            </button>
          </header>
          <AnimatePresence>
            {open && (
              <motion.nav initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }} className="overflow-hidden border-b border-white/8 bg-ink/95 backdrop-blur-xl">
                <div className="space-y-1 p-3">
                  {/* Agencies switch the active client from here on a phone. */}
                  <BrandSwitcher />
                  {navItems.map((n) => (
                    <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className={cn('flex items-center gap-3 rounded-xl px-3 py-3 text-sm', isActive(n.to) ? 'bg-white/[0.06] text-cream' : 'text-sand')}>
                      <n.icon className="h-[18px] w-[18px]" /> {n.label}
                      <span className="ml-auto text-xs text-stone">{n.note}</span>
                    </Link>
                  ))}
                  <button onClick={doSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-stone">
                    <LogOut className="h-[18px] w-[18px]" /> Sign out
                  </button>
                </div>
              </motion.nav>
            )}
          </AnimatePresence>
        </div>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
