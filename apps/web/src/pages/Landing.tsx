// Landing page. Built from the Landing (>=768) and MLanding (<768) boards: each
// width shows its own board's layout and words (owner decision). The two
// layouts are generated one for one from the boards by
// design-handoff/tools/board2tsx.py; state is ported in useLandingState.
import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SiteFooter from '../components/SiteFooter'
import LandingDesktop from './landing/LandingDesktop'
import LandingPhone from './landing/LandingPhone'
import { useLandingDesktop, useLandingPhone } from './landing/useLandingState'
import './landing/landing.css'

function useWide() {
  const q = '(min-width: 768px)'
  const [wide, setWide] = useState(() => typeof window === 'undefined' || window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

/** The boards' reveal-on-scroll: adds `.in` to every lp-rv-* element in view. */
function useBoardReveal(deps: unknown) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const els = Array.from(root.current?.querySelectorAll<HTMLElement>('[class*="lp-rv-"]') ?? [])
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }), { rootMargin: '0px 0px -8% 0px' })
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [deps])
  return root
}

/** Fixed-size illustration stages (class lp-fit, data-fit-w = board width) are
 *  scaled down with CSS zoom when their section is narrower than the board
 *  (768-1279). At 1280+ they render at exactly the board size. */
function useFitStages(root: React.RefObject<HTMLDivElement | null>, deps: unknown) {
  useEffect(() => {
    const fit = () => {
      root.current?.querySelectorAll<HTMLElement>('.lp-fit').forEach((el) => {
        const w = Number(el.dataset.fitW)
        el.style.zoom = ''
        // Layout offsets, not getBoundingClientRect: the reveal animations
        // transform sections, which would skew the measurement.
        const sec = el.closest('section')
        if (!sec) return
        let x = 0
        for (let n: HTMLElement | null = el; n && n !== sec; n = n.offsetParent as HTMLElement | null) x += n.offsetLeft
        const left = Math.max(24, x)
        const z = Math.min(1, (sec.clientWidth - 24 - left) / w)
        el.style.zoom = z < 1 ? String(z) : ''
      })
    }
    fit()
    window.addEventListener('resize', fit)
    document.fonts?.ready.then(fit)
    const ro = new ResizeObserver(() => fit())
    if (root.current) ro.observe(root.current)
    return () => { window.removeEventListener('resize', fit); ro.disconnect() }
  }, [root, deps])
}

function Desktop() {
  const v = useLandingDesktop()
  return <LandingDesktop v={v} />
}
function Phone() {
  const v = useLandingPhone()
  return <LandingPhone v={v} />
}

export default function Landing() {
  const { session } = useAuth()
  const wide = useWide()
  const root = useBoardReveal(wide)
  useFitStages(root, wide)
  // A logged-in creator never lands on the marketing page (kept from before).
  if (session) return <Navigate to="/dashboard" replace />
  return (
    <div ref={root} className="lp-root bg-ink leading-[normal] text-cream">
      {wide ? <Desktop /> : <Phone />}
      <SiteFooter />
    </div>
  )
}
