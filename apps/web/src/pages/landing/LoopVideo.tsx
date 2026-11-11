// Board <video autoplay muted loop playsinline> for the Landing page, using the
// compressed media in /public/landing. Always has a poster; when the user
// prefers reduced motion it shows only the poster and never plays.
import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

export default function LoopVideo({ name, className }: { name: string; className?: string }) {
  const [still, setStill] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY)
    if (!mq) return
    const on = () => setStill(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  const poster = `/landing/${name}.jpg`
  if (still) return <img src={poster} alt="" aria-hidden="true" className={className} decoding="async" />
  return (
    <video
      key={name}
      className={className}
      src={`/landing/${name}.mp4`}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden="true"
    />
  )
}
