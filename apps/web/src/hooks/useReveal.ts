// Adds `.in` to every `.rv-up` element under `root` once it scrolls into view
// (the boards' reveal-on-scroll). With reduced motion the global rule makes the
// transition instant, so content simply appears.
import { useEffect } from 'react'
import type { RefObject } from 'react'

export function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const els = Array.from(root.current?.querySelectorAll<HTMLElement>('.rv-up') ?? [])
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target) } }),
      { rootMargin: '0px 0px -8% 0px' },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [root])
}
