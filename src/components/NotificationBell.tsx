import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Check, Clapperboard, MessageSquare, BadgeCheck } from 'lucide-react'
import { listNotifications, markNotificationsRead, type AppNotification } from '../lib/api'
import { cn } from '../lib/cn'

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  video_ready: Clapperboard,
  review_approved: BadgeCheck,
  review_changes: MessageSquare,
}

// In-app notification bell. Polls the notifications table (written server-side by
// the worker on render-done and by the review fn on a client decision) so a user
// who navigated away still learns their video is ready / a client signed off.
// Also fires a one-shot browser notification for newly-arrived items when the tab
// is open and permission was granted.
export function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const seen = useRef<Set<string>>(new Set())
  const primed = useRef(false) // skip browser-notifying the very first load

  const refresh = async () => {
    const next = await listNotifications(20)
    // Fire a browser notification for unread items we haven't seen this session.
    if (primed.current && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      for (const n of next) {
        if (!n.read && !seen.current.has(n.id)) {
          try { new Notification(n.title, { body: n.body ?? undefined }) } catch { /* ignore */ }
        }
      }
    }
    next.forEach((n) => seen.current.add(n.id))
    primed.current = true
    setItems(next)
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 45_000)
    return () => clearInterval(t)
  }, [])

  const unread = items.filter((n) => !n.read).length

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next) {
      // Opening counts as seeing them — request browser permission once, then mark read.
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        try { await Notification.requestPermission() } catch { /* ignore */ }
      }
      const unreadIds = items.filter((n) => !n.read).map((n) => n.id)
      if (unreadIds.length) {
        markNotificationsRead(unreadIds).catch(() => {})
        setItems((prev) => prev.map((n) => ({ ...n, read: true })))
      }
    }
  }

  const openItem = (n: AppNotification) => {
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        aria-label="Notifications"
        className="relative grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-sand transition-colors hover:text-cream"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-ink">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-white/10 bg-ink2/95 shadow-[0_12px_48px_-12px_rgba(0,0,0,.8)] backdrop-blur-xl"
            >
              <div className="border-b border-white/8 px-4 py-3 text-sm font-heading text-cream">Notifications</div>
              <div className="max-h-96 overflow-y-auto">
                {items.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-stone">You're all caught up.</div>
                ) : (
                  items.map((n) => {
                    const Icon = ICON[n.type] ?? Bell
                    return (
                      <button
                        key={n.id}
                        onClick={() => openItem(n)}
                        className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]', !n.read && 'bg-white/[0.02]')}
                      >
                        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5">
                          <Icon className="h-4 w-4 text-amber" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-cream">{n.title}</span>
                          {n.body && <span className="mt-0.5 block text-xs leading-snug text-stone">{n.body}</span>}
                        </span>
                        {!n.read && <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-teal" />}
                      </button>
                    )
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
