import { useEffect, useState } from 'react'

const Q = '(min-width: 768px)'
const mql = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(Q) : null

/** True from 768px up: the desktop boards. Below that the M… boards (rule B).
 *  Where matchMedia is missing (old browsers, jsdom) it reads as desktop. */
export function useWide(): boolean {
  const [w, setW] = useState(() => mql()?.matches ?? true)
  useEffect(() => {
    const mq = mql()
    if (!mq) return
    const on = () => setW(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return w
}
