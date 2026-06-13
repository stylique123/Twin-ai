import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronsUpDown, Check, Plus, Building2, Loader2 } from 'lucide-react'
import { listBrandVoices, setDefaultBrandVoice } from '../lib/api'
import { cn } from '../lib/cn'
import { EASE } from './motion'
import type { BrandVoice } from '../lib/types'

// Compact active-brand switcher for the app sidebar. Switching the active
// brand here changes the voice Studio writes in — no page change needed.
export function BrandSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const [voices, setVoices] = useState<BrandVoice[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const load = async () => {
    try {
      setVoices(await listBrandVoices())
    } catch {
      /* silent — sidebar stays minimal if it can't load */
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const ready = voices.filter((v) => v.status === 'ready')
  const active = voices.find((v) => v.is_default) ?? ready[0]

  // Nothing to switch yet — don't clutter the sidebar.
  if (voices.length === 0) return null

  const name = (v: BrandVoice) => v.label ?? `@${v.handle}`

  const switchTo = async (id: string) => {
    setBusy(true)
    try {
      await setDefaultBrandVoice(id)
      await load()
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={ref} className="relative px-3 pb-2">
      <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-stone">Active brand</p>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-white/16"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-signature-soft">
          <Building2 className="h-3.5 w-3.5 text-cream" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-cream">{active ? name(active) : 'No brand yet'}</span>
          <span className="block truncate text-[11px] text-stone">
            {ready.length > 1 ? `${ready.length} brands` : active ? `@${active.handle}` : 'Add one to start'}
          </span>
        </span>
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-stone" /> : <ChevronsUpDown className="h-4 w-4 shrink-0 text-stone" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="absolute inset-x-3 z-50 mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-ink2 p-1.5 shadow-lift"
          >
            <div className="max-h-64 overflow-y-auto">
              {ready.map((v) => (
                <button
                  key={v.id}
                  onClick={() => switchTo(v.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                    v.is_default ? 'bg-white/[0.06] text-cream' : 'text-sand hover:bg-white/[0.04] hover:text-cream',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{name(v)}</span>
                  {v.is_default && <Check className="h-4 w-4 shrink-0 text-teal" />}
                </button>
              ))}
              {ready.length === 0 && (
                <p className="px-2.5 py-2 text-xs text-stone">Your brand voice is still building…</p>
              )}
            </div>
            <Link
              to="/brands"
              onClick={() => { setOpen(false); onNavigate?.() }}
              className="mt-1 flex items-center gap-2 rounded-lg border-t border-white/8 px-2.5 py-2 text-sm text-amber transition-colors hover:bg-white/[0.04]"
            >
              <Plus className="h-4 w-4" /> Add / manage brands
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
