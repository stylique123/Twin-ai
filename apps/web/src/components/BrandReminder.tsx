import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { listBrandVoices, type BrandVoice } from '../lib/api'
import { Palette, ImageIcon, Sparkles, X } from 'lucide-react'

// Brand-completeness reminder. Twin NEVER invents a brand it can't confirm — no
// random colors, no guessed logo. When the creator's colors / logo / voice can't be
// confirmed (a scan was blocked, or they never set them), we say so plainly and guide
// them to Settings to add them by hand. Dismissible, with a persistent reminder until
// it's resolved — never a hard wall.
const HEX = /^#[0-9a-fA-F]{6}$/

interface BrandGaps { colors: boolean; logo: boolean; voice: boolean }
function computeGaps(v: BrandVoice | null | undefined): BrandGaps {
  const kit = (v?.brand_kit ?? {}) as { palette?: Record<string, unknown> | null; palette_source?: string; logo_path?: unknown }
  // A palette only "counts" if it holds a real hex AND wasn't left in the `pending`
  // (scan-couldn't-read) state — we never treat a blocked scan as if colors exist.
  const paletteHasReal = !!kit.palette && Object.values(kit.palette).some((x) => typeof x === 'string' && HEX.test(x))
  const colors = kit.palette_source === 'pending' || !paletteHasReal
  const logo = !(typeof kit.logo_path === 'string' && kit.logo_path.length > 0)
  const prof = (v?.profile ?? null) as { niche?: unknown; tone?: unknown; summary?: unknown } | null
  const status = (v as { status?: unknown } | null)?.status
  const voice = !v || status === 'failed' || !(prof && (prof.niche || prof.tone || prof.summary))
  return { colors, logo, voice }
}

const DISMISS_KEY = 'twinai_brand_reminder_dismissed_v1'

export function BrandReminder() {
  const { pathname } = useLocation()
  const [gaps, setGaps] = useState<BrandGaps | null>(null)
  // Dismissed for THIS session only (sessionStorage) — it returns next sign-in until
  // the brand is actually completed, so it reminds without nagging every page load.
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1')
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    let alive = true
    listBrandVoices()
      .then((voices) => {
        if (!alive) return
        const def = voices.find((v) => (v as { is_default?: boolean }).is_default) ?? voices[0] ?? null
        const g = computeGaps(def)
        setGaps(g)
        if ((g.colors || g.logo || g.voice) && sessionStorage.getItem(DISMISS_KEY) !== '1') setShowModal(true)
      })
      .catch(() => { /* never block the app on a brand read */ })
    return () => { alive = false }
  }, [])

  const dismiss = () => { sessionStorage.setItem(DISMISS_KEY, '1'); setDismissed(true); setShowModal(false) }

  const incomplete = gaps && (gaps.colors || gaps.logo || gaps.voice)
  // Don't show on Settings itself — that's where they fix it.
  if (!incomplete || pathname.startsWith('/settings')) return null

  const missing: string[] = []
  if (gaps!.voice) missing.push('brand voice')
  if (gaps!.colors) missing.push('colours')
  if (gaps!.logo) missing.push('logo')
  const missingLabel = missing.length === 1 ? missing[0] : missing.slice(0, -1).join(', ') + ' and ' + missing[missing.length - 1]

  // First appearance this session: a clear popup that explains + routes to Settings.
  if (showModal && !dismissed) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-ink2 p-6 shadow-2xl">
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-amber/15"><Sparkles className="h-5 w-5 text-amber" /></div>
          <h2 className="text-lg font-bold text-cream">Finish your brand so your videos look like you</h2>
          <p className="mt-2 text-sm text-sand">
            Twin only uses a brand it can confirm — it will <span className="text-cream">never invent colours or a logo</span>.
            We couldn’t confirm your <span className="text-cream">{missingLabel}</span> (a scan can be blocked by Instagram/TikTok, or you may not have set it yet).
            Add it in Settings and it’ll be used on every video.
          </p>
          <div className="mt-5 flex gap-3">
            <Link to="/settings" onClick={dismiss} className="flex-1 rounded-xl bg-signature px-4 py-2.5 text-center text-sm font-semibold text-ink transition-opacity hover:opacity-90">
              Set up my brand
            </Link>
            <button onClick={dismiss} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-stone transition-colors hover:text-cream">
              Later
            </button>
          </div>
        </div>
      </div>
    )
  }

  // After dismiss: a slim, persistent reminder until the brand is completed.
  return (
    <div className="flex items-center gap-3 border-b border-amber/20 bg-amber/[0.06] px-4 py-2.5 text-sm">
      {gaps!.colors ? <Palette className="h-4 w-4 shrink-0 text-amber" /> : <ImageIcon className="h-4 w-4 shrink-0 text-amber" />}
      <span className="min-w-0 flex-1 text-sand">
        Twin doesn’t have your <span className="text-cream">{missingLabel}</span> yet — it won’t guess.{' '}
        <Link to="/settings" className="font-semibold text-amber underline-offset-2 hover:underline">Add it in Settings</Link>
      </span>
      <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 rounded-lg p-1 text-stone transition-colors hover:text-cream"><X className="h-4 w-4" /></button>
    </div>
  )
}
