import { useEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'
import { EASE } from './motion'

// Count-up number that animates once it scrolls into view.
export function Counter({
  to,
  suffix = '',
  prefix = '',
  duration = 1.4,
  decimals = 0,
}: {
  to: number
  suffix?: string
  prefix?: string
  duration?: number
  decimals?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const [val, setVal] = useState(0)

  useEffect(() => {
    if (!inView) return
    let raf = 0
    const start = performance.now()
    const ease = (t: number) => 1 - Math.pow(1 - t, 3) // expo-out, matches EASE feel
    void EASE
    const tick = (now: number) => {
      const p = Math.min((now - start) / (duration * 1000), 1)
      setVal(to * ease(p))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, to, duration])

  return (
    <span ref={ref}>
      {prefix}
      {val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  )
}
