// 14.3 MB OF VIDEO ON FIRST PAINT — this is the fix.
//
// The landing page renders three `<video autoPlay muted loop playsInline>`
// elements between them referencing both files in public/media:
//
//   reel-creator.mp4       12 MB
//   hero-talkinghead.mp4  2.3 MB
//
// With `autoPlay` set and no `preload`, the browser fetches enough to start
// playing immediately — so a first-time visitor on a phone pulls ~14 MB before
// the page settles, and sees blank boxes while it happens because there is no
// `poster` either.
//
// ── THE COMMENT ALREADY PROMISED THIS AND NOTHING IMPLEMENTED IT ──────────
//
// Landing.tsx says, above the constants:
//
//   "the heavier creator clip only loads when the playbook scrolls into view"
//
// It does not. The `<video src>` is in the DOM from first render, so it fetches
// straight away. That is the same defect this codebase spent yesterday removing
// from the backend — a comment asserting behaviour the code does not have — and
// it is worth naming, because the comment is why nobody looked.
//
// ── WHY MOUNTING LATE, RATHER THAN preload="none" ─────────────────────────
//
// `preload="none"` and `autoPlay` contradict each other: autoplay requires data,
// so the browser ignores the hint and fetches anyway. The only reliable way to
// not fetch a video is to not have it in the DOM. So this renders a placeholder
// until the element is near the viewport, then mounts the real `<video>`.
//
// ── WHAT THIS DOES NOT FIX ────────────────────────────────────────────────
//
// A 12 MB file for a 4:5 card is the real problem; this defers the cost, it does
// not remove it. Anyone who scrolls to the gallery still pays it. The durable
// fix is re-encoding the asset (a 4:5 loop of a few seconds has no business
// being 12 MB) — which needs ffmpeg and is not something this component can do.
// `scripts/ci/check_web_asset_budget.mjs` now fails the build if an asset that
// size lands again, so the next one is caught at the door rather than in
// production.

import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface LazyVideoProps {
  src: string
  className?: string
  /** Shown until the video mounts — a gradient or still, never a blank box. */
  placeholder?: ReactNode
  /** How far outside the viewport to start loading. One screen ahead by default. */
  rootMargin?: string
  /** Escape hatch for above-the-fold video that genuinely should load at once. */
  eager?: boolean
}

export default function LazyVideo({
  src, className, placeholder, rootMargin = '200px', eager = false,
}: LazyVideoProps) {
  const [show, setShow] = useState(eager)
  const holder = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (show) return
    const el = holder.current
    // NO IntersectionObserver — an old browser, or a test environment — means
    // showing the video rather than hiding it forever. Degrading to today's
    // behaviour is the safe direction; degrading to a permanently empty box is
    // not.
    if (!el || typeof IntersectionObserver === 'undefined') { setShow(true); return }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setShow(true); io.disconnect() }
    }, { rootMargin })
    io.observe(el)
    return () => io.disconnect()
  }, [show, rootMargin])

  return (
    <div ref={holder} className={className}>
      {show
        ? <video autoPlay muted loop playsInline preload="metadata" className="h-full w-full object-cover" src={src} />
        : placeholder}
    </div>
  )
}
