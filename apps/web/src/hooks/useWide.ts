import { useEffect, useState } from 'react'

/** True from 768px up: the desktop boards. Below that the M… boards (rule B). */
export function useWide(): boolean {
  const q = '(min-width: 768px)'
  const [w, setW] = useState(() => typeof window === 'undefined' || window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setW(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return w
}
