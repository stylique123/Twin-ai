// The app shell, built from the Sidebar board (>=1024), size rule B's 72px
// icon rail (768-1023) and the M boards' bottom tab bar (<768).
import { useEffect, useId, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { logEvent, logSessionEvent, listBrandVoices } from '../lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { LogOut, Menu, X } from 'lucide-react'
import { LogoMark } from './Logo'
import { BrandSwitcher } from './BrandSwitcher'
import { BrandReminder } from './BrandReminder'
import { NotificationBell } from './NotificationBell'
import { useAuth } from '../context/AuthContext'
import { videosFromCredits } from '../lib/brand'
import { loadProductEntities, planFor, productsNeedingAttention, rowIsCreatorSupplied, type ProductEntityRecord } from '@twinai/shared'
import type { BrandVoice } from '../lib/types'
import { cn } from '../lib/cn'
import { EASE } from './motion'
import '../styles/onboarding.css'
import '../styles/app.css'

// Icon paths copied from the Sidebar board.
const D = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  create: 'M12 5v14M5 12h14',
  scripts: 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h6',
  gallery: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v5M16 3v5',
  twin: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  products: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  // Workspaces is not on the board (it is agency-only); a board-style people glyph.
  workspaces: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
}

type NavItem = { to: string; label: string; d: string; agencyOnly?: boolean }
// Board order. Routes are the app's existing ones.
const MAIN: NavItem[] = [
  { to: '/dashboard', label: 'Home', d: D.home },
  { to: '/app', label: 'Create', d: D.create },
  { to: '/history', label: 'Scripts', d: D.scripts },
  { to: '/gallery', label: 'Gallery', d: D.gallery },
  { to: '/calendar', label: 'Calendar', d: D.calendar },
]
const BRAND: NavItem[] = [
  { to: '/brain', label: 'My Twin', d: D.twin },
  { to: '/products', label: 'Brands & products', d: D.products },
  // Workspaces (one voice per client) only makes sense for agencies.
  { to: '/brands', label: 'Workspaces', d: D.workspaces, agencyOnly: true },
]
const FOOT: NavItem[] = [{ to: '/settings', label: 'Settings', d: D.settings }]
const NAV = [...MAIN, ...BRAND, ...FOOT]

// Phone tab bar (MHome board): Home, Scripts, raised Create, Gallery, My Twin.
const TABS = [
  { to: '/dashboard', label: 'Home', d: D.home },
  { to: '/history', label: 'Scripts', d: D.scripts },
  { to: '/app', label: 'Create', d: D.create, raised: true },
  { to: '/gallery', label: 'Gallery', d: D.gallery },
  { to: '/brain', label: 'My Twin', d: D.twin },
]
const TAB_PATHS = new Set(TABS.map((t) => t.to))

function Icon({ d, size = 17, width = 2 }: { d: string; size?: number; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d={d} />
    </svg>
  )
}

/** The board's logo glyph (two bars, gradient lower half). */
function BoardLogo() {
  // Unique per instance: the hidden sidebar's copy would otherwise own the id
  // and the rail's gradient would resolve to nothing.
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
      <defs><linearGradient id={id} x1="4" y1="12" x2="20" y2="20" gradientUnits="userSpaceOnUse"><stop stopColor="#FFB347" /><stop offset="0.5" stopColor="#FF5B7B" /><stop offset="1" stopColor="#65E5D8" /></linearGradient></defs>
      <rect x="6" y="4.6" width="12" height="2.7" rx="1.35" fill="#F6F1E9" /><rect x="10.65" y="7.3" width="2.7" height="4.7" fill="#F6F1E9" />
      <rect x="10.65" y="12" width="2.7" height="4.7" fill={`url(#${id})`} /><rect x="6" y="16.7" width="12" height="2.7" rx="1.35" fill={`url(#${id})`} />
    </svg>
  )
}

// ⚠️ THE SAME WALK THE PRODUCT LIBRARY DOES, AND IT MUST STAY THE SAME ONE.
// `productLifecycle` treats image evidence as a source, so a row with photos
// and no link is READING rather than NEEDS_SOURCE. Counting photos differently
// here would make the badge and the page disagree about which products are
// waiting — the exact drift `productAttention.ts` injects this function to
// avoid.
function photoCountOf(e: ProductEntityRecord): number {
  const ev = e.evidence
  if (!ev || ev === 'declined' || ev.form !== 'images') return 0
  return ev.sections.filter((x) => x.imagePath).length
}

/**
 * How many products are waiting on their owner, for the nav badge.
 *
 * ⚖️ FETCHED ONCE PER MOUNT, NOT PER ROUTE. `AppShell` wraps every app page, so
 * keying this to `pathname` would issue a products request on every navigation
 * to pay for a number that changes only when she edits a product.
 *
 * ⚠️ AND IT FAILS TO ZERO, SILENTLY. This is decoration on a nav item; a
 * products request that 500s must not take the shell down with it.
 */
function useProductsWaiting(): number {
  const [waiting, setWaiting] = useState(0)
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const rows = await loadProductEntities()
        // ⚠️⚠️ ONLY THE ROWS SHE CAN SEE, OR THE BADGE POINTS AT NOTHING.
        if (live) setWaiting(productsNeedingAttention(rows.filter(rowIsCreatorSupplied), photoCountOf))
      } catch { /* decoration only — never break the shell over a badge */ }
    })()
    return () => { live = false }
  }, [])
  return waiting
}

/** The active brand voice, for the account row. Fails to null. */
function useActiveVoice(): BrandVoice | null {
  const [v, setV] = useState<BrandVoice | null>(null)
  useEffect(() => {
    let live = true
    listBrandVoices().then((vs) => {
      const ready = vs.filter((x) => x.status === 'ready')
      if (live) setV(ready.find((x) => x.is_default) ?? ready[0] ?? null)
    }).catch(() => {})
    return () => { live = false }
  }, [])
  return v
}

export function AppShell({ children, mobileChrome = true }: { children: React.ReactNode; mobileChrome?: boolean }) {
  const { profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  // Engagement depth: log a page_view per route, and open every page at the top.
  useEffect(() => {
    void logEvent('page_view', { path: pathname })
    window.scrollTo(0, 0)
    setOpen(false)
  }, [pathname])
  // ⚖️ pagehide, NOT beforeunload: beforeunload does not fire reliably on
  // mobile Safari, where a phone-first product is actually used.
  useEffect(() => {
    const onHide = () => { void logSessionEvent('session_abandoned', { path: pathname }) }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [pathname])
  const left = videosFromCredits(profile?.credits ?? 0)
  const plan = planFor(profile?.plan)
  const productsWaiting = useProductsWaiting()
  const voice = useActiveVoice()
  const isAgency = profile?.plan === 'agency'
  const navItems = NAV.filter((n) => !n.agencyOnly || isAgency)
  // Create links to /app, which redirects into /v2; both (plus an open result)
  // count as "in Create".
  const isActive = (to: string) => to === '/app' ? pathname === '/app' || pathname.startsWith('/v2') : to === '/history' ? pathname.startsWith('/history') || pathname.startsWith('/result') : pathname.startsWith(to)
  // Hard navigation (full reload), not SPA navigate(): a client-side route change
  // here raced the AnimatePresence route exit while `profile` was torn down.
  const doSignOut = async () => { await signOut(); window.location.assign('/') }

  const who = profile?.display_name?.trim() || (voice?.handle ? `@${voice.handle}` : '') || profile?.email?.split('@')[0] || ''
  const initial = (who.replace(/^@/, '')[0] ?? '').toUpperCase()
  const sub = voice?.handle && who !== `@${voice.handle}` ? `@${voice.handle}` : `${plan.name} plan`
  // "N of M" only when it is true: top-ups can take the balance past the plan.
  const ofTotal = left <= plan.videos ? ` of ${plan.videos}` : ''
  const fill = plan.videos > 0 ? Math.min(1, left / plan.videos) : 0

  const badge = (n: NavItem) => n.to === '/products' && productsWaiting > 0 && (
    <span
      aria-label={`${productsWaiting} ${productsWaiting === 1 ? 'product needs' : 'products need'} your attention`}
      title="Open Brands & products to see what each one still needs — a link, a price, or facts to check."
      className="text-[12px] text-label"
    >
      {/* ⚠️ "N needs you", not a bare number: a bare "1" next to "products"
          read as an inventory (reported 2026-09-22). */}
      {productsWaiting} need{productsWaiting === 1 ? 's' : ''} you
    </span>
  )

  const row = (n: NavItem) => {
    const on = isActive(n.to)
    return (
      <Link key={n.to} to={n.to} aria-current={on ? 'page' : undefined}
        className={cn('flex items-center gap-[11px] rounded-[9px] px-3 py-[9px] text-[14px] no-underline', on ? 'bg-white/[0.07] font-semibold text-cream' : 'font-medium text-sand-muted app-hover-row')}>
        <Icon d={n.d} />
        <span className="flex-grow">{n.label}</span>
        {badge(n)}
      </Link>
    )
  }

  const railItem = (n: NavItem) => {
    const on = isActive(n.to)
    return (
      <Link key={n.to} to={n.to} aria-label={n.label} title={n.label} aria-current={on ? 'page' : undefined}
        className={cn('relative flex h-11 w-11 items-center justify-center rounded-[9px] no-underline', on ? 'bg-white/[0.07] text-cream' : 'text-sand-muted app-hover-row')}>
        <Icon d={n.d} size={19} />
        {n.to === '/products' && productsWaiting > 0 && (
          <span aria-label={`${productsWaiting} ${productsWaiting === 1 ? 'product needs' : 'products need'} your attention`}
            className="absolute right-[5px] top-[5px] h-[7px] w-[7px] rounded-full bg-amber" />
        )}
      </Link>
    )
  }

  return (
    <div className="flex min-h-[100dvh] bg-ink leading-[normal]">
      {/* >=1024: the Sidebar board, 248px. */}
      <nav aria-label="Main" className="sticky top-0 hidden h-[100dvh] w-[248px] shrink-0 flex-col overflow-y-auto border-r border-white/[0.06] bg-[#0E0E12] px-[14px] pb-[18px] pt-[22px] text-cream lg:flex">
        <Link to="/dashboard" className="flex items-center gap-[9px] px-[10px] pb-[26px] pt-1 text-cream no-underline">
          <BoardLogo />
          <span className="text-[16px] font-bold tracking-[-0.01em]">Twin<span className="text-amber">AI</span></span>
        </Link>
        {isAgency && <div className="-mx-[14px] -mt-3 pb-2"><BrandSwitcher /></div>}
        <div className="flex flex-col gap-[2px]">
          {MAIN.map(row)}
          <span className="px-3 pb-[6px] pt-5 text-[12px] font-bold tracking-[.12em] text-stone-dim">YOUR BRAND</span>
          {BRAND.filter((n) => !n.agencyOnly || isAgency).map(row)}
        </div>
        <div className="mt-auto flex flex-col gap-3 pt-6">
          {FOOT.map(row)}
          <div className="flex flex-col gap-2 rounded-[12px] border border-white/[0.06] bg-[#15151A] p-[14px]">
            <div className="flex justify-between text-[13px]">
              <span className="text-sand-muted">{profile?.plan === 'free' ? 'Free videos left' : 'Videos left'}</span>
              <span className="font-semibold">{left}{ofTotal}</span>
            </div>
            <div className="h-1 rounded-full bg-white/[0.06]">
              <div className="h-1 rounded-full bg-[linear-gradient(90deg,#FFB347,#FF5B7B)]" style={{ width: `${fill * 100}%` }} />
            </div>
            <Link to="/dashboard#invite" className="text-[13px] font-semibold text-amber no-underline">Invite a creator, you both get 2</Link>
          </div>
          <div className="flex items-center gap-[10px] px-2 py-[6px]">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#3A2A22] text-[13px] font-bold text-amber" aria-hidden="true">{initial}</div>
            <div className="flex min-w-0 flex-grow flex-col">
              <span className="truncate text-[13px] font-semibold">{who}</span>
              <span className="truncate whitespace-nowrap text-[12px] text-label">{sub}</span>
            </div>
            <NotificationBell />
            <button type="button" onClick={doSignOut} aria-label="Sign out" title="Sign out"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border-0 bg-transparent text-label app-hover-row">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* 768-1023: rule B's 72px icon rail. Never a hamburger. */}
      <nav aria-label="Main" className="sticky top-0 hidden h-[100dvh] w-[72px] shrink-0 flex-col items-center overflow-y-auto border-r border-white/[0.06] bg-[#0E0E12] pb-[18px] pt-[22px] text-cream md:flex lg:hidden">
        <Link to="/dashboard" aria-label="TwinAI home" className="mb-5 flex h-11 w-11 items-center justify-center"><BoardLogo /></Link>
        <div className="flex flex-col items-center gap-[2px]">
          {MAIN.map(railItem)}
          <span className="my-3 h-px w-8 bg-white/[0.08]" aria-hidden="true" />
          {BRAND.filter((n) => !n.agencyOnly || isAgency).map(railItem)}
        </div>
        <div className="mt-auto flex flex-col items-center gap-2 pt-6">
          {FOOT.map(railItem)}
          <NotificationBell />
          <button type="button" onClick={doSignOut} aria-label="Sign out" title="Sign out"
            className="flex h-11 w-11 items-center justify-center rounded-[9px] border-0 bg-transparent text-label app-hover-row">
            <LogOut className="h-[18px] w-[18px]" />
          </button>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3A2A22] text-[13px] font-bold text-amber" title={who} aria-hidden="true">{initial}</div>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* <768, pages other than Home: a slim top bar for what the tab bar
            does not hold (Calendar, Brands & products, Settings, sign out).
            Home's own header (MHome) carries the avatar that opens the same
            sheet, so the bar is skipped there. */}
        {mobileChrome && (
          <div className={cn('sticky top-0 z-40 md:hidden', pathname.startsWith('/dashboard') && 'hidden')}>
            <header className="flex items-center justify-between border-b border-white/[0.07] bg-[rgba(11,11,14,0.94)] px-5 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-[14px]">
              <Link to="/dashboard" className="inline-flex items-center gap-2 text-cream no-underline">
                <LogoMark size={24} />
                <span className="text-[15px] font-bold">Twin<span className="text-amber">AI</span></span>
              </Link>
              <div className="flex items-center gap-2">
                <NotificationBell />
                <button type="button" className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-white/10 bg-white/5" onClick={() => setOpen((v) => !v)} aria-label="More" aria-expanded={open}>
                  {open ? <X className="h-[18px] w-[18px]" /> : <Menu className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </header>
          </div>
        )}
        <main className={cn('min-w-0 flex-1', mobileChrome && 'pb-[calc(84px+env(safe-area-inset-bottom))] md:pb-0')}>
          <BrandReminder />
          {children}
        </main>

        {/* <768: the More sheet (secondary destinations + sign out). Opened from
            the top bar, or from the avatar on Home (event below). */}
        <AnimatePresence>
          {open && mobileChrome && (
            <>
              <motion.button type="button" aria-label="Close" onClick={() => setOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 border-0 bg-black/60 md:hidden" />
              <motion.nav aria-label="More" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ duration: 0.3, ease: EASE }}
                className="fixed inset-x-0 bottom-0 z-50 rounded-t-[20px] border-t border-white/[0.08] bg-[#111115] px-3 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 md:hidden">
                <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
                {isAgency && <BrandSwitcher onNavigate={() => setOpen(false)} />}
                {navItems.filter((n) => !TAB_PATHS.has(n.to)).map((n) => (
                  <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className={cn('flex min-h-11 items-center gap-3 rounded-[12px] px-3 py-3 text-[15px] no-underline', isActive(n.to) ? 'bg-white/[0.07] text-cream' : 'text-sand')}>
                    <Icon d={n.d} size={20} /> <span className="flex-grow">{n.label}</span>{badge(n)}
                  </Link>
                ))}
                <button type="button" onClick={doSignOut} className="flex min-h-11 w-full items-center gap-3 rounded-[12px] border-0 bg-transparent px-3 py-3 text-[15px] text-label">
                  <LogOut className="h-5 w-5" /> Sign out
                </button>
              </motion.nav>
            </>
          )}
        </AnimatePresence>
        <ShellMenuBridge onOpen={() => setOpen(true)} />

        {/* <768: the MHome tab bar. */}
        {mobileChrome && (
          <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex items-start border-t border-white/[0.07] bg-[rgba(11,11,14,0.94)] px-2 pb-[max(26px,env(safe-area-inset-bottom))] pt-[10px] backdrop-blur-[14px] md:hidden">
            {TABS.map((t) => {
              const on = isActive(t.to)
              if (t.raised) {
                return (
                  <Link key={t.to} to={t.to} aria-label="Create a script" className="flex flex-1 justify-center no-underline">
                    <span className="ob-gbtn ob-cta -mt-[22px] flex h-14 w-14 items-center justify-center rounded-[18px] text-ink shadow-[0_12px_30px_-10px_rgba(255,91,123,0.9),0_0_0_6px_#0B0B0E]">
                      <Icon d={t.d} size={24} width={2.6} />
                    </span>
                  </Link>
                )
              }
              return (
                <Link key={t.to} to={t.to} aria-current={on ? 'page' : undefined}
                  className={cn('flex min-h-11 flex-1 flex-col items-center gap-[3px] text-[12px] font-semibold no-underline', on ? 'text-cream' : 'text-label')}>
                  <Icon d={t.d} size={22} />
                  {t.label}
                  <span className={cn('h-1 w-1 rounded-full', on && 'bg-coral')} aria-hidden="true" />
                </Link>
              )
            })}
          </nav>
        )}
      </div>
    </div>
  )
}

/** Home's avatar (MHome header) opens the shell's More sheet. */
export const OPEN_SHELL_MENU = 'twinai:open-shell-menu'
function ShellMenuBridge({ onOpen }: { onOpen: () => void }) {
  useEffect(() => {
    window.addEventListener(OPEN_SHELL_MENU, onOpen)
    return () => window.removeEventListener(OPEN_SHELL_MENU, onOpen)
  }, [onOpen])
  return null
}
