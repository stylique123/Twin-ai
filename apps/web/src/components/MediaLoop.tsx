// Silent looping marketing video for the public Landing page ONLY (media in
// /public/landing, see design-handoff/assets/ASSETS.md). In-app screens show the
// user's real camera and clips, never these.
// Always muted + playsInline + loop + preload="metadata" with a poster. When the
// user prefers reduced motion it renders the poster image only and never plays.
import { useEffect, useState } from 'react'
import { cn } from '../lib/cn'

function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const on = () => setReduced(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}

export default function MediaLoop({
  name,
  className,
  alt = '',
}: {
  /** File stem in /public/landing, e.g. "creator-coach-talking" (needs .mp4 + .jpg). */
  name: string
  className?: string
  /** Leave empty when decorative (the default). */
  alt?: string
}) {
  const reduced = usePrefersReducedMotion()
  const src = `/landing/${name}.mp4`
  const poster = `/landing/${name}.jpg`
  const cls = cn('h-full w-full bg-placeholder object-cover', className)

  if (reduced) {
    return <img src={poster} alt={alt} className={cls} loading="lazy" decoding="async" aria-hidden={alt ? undefined : true} />
  }
  return (
    <video
      className={cls}
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden={alt ? undefined : true}
      aria-label={alt || undefined}
    />
  )
}
