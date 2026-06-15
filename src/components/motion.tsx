import { motion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'

// Shared easing, the "expo-out" curve used everywhere for a premium feel.
export const EASE = [0.22, 1, 0.36, 1] as const

const reveal: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
}

// Entrance reveal on scroll-into-view (once).
export function Reveal({
  children,
  className,
  delay = 0,
  y = 22,
}: {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

// Stagger container, children use <RevealItem/>.
// `immediate` animates on mount instead of on scroll-into-view, the right mode
// for filterable content grids (a scroll trigger leaves cards stuck invisible
// when the grid sits near/below the fold or when filtering changes its height).
export function Stagger({
  children,
  className,
  gap = 0.09,
  immediate = false,
}: {
  children: ReactNode
  className?: string
  gap?: number
  immediate?: boolean
}) {
  const trigger = immediate
    ? { animate: 'show' as const }
    : { whileInView: 'show' as const, viewport: { once: true, margin: '-80px' } }
  return (
    <motion.div
      className={className}
      initial="hidden"
      {...trigger}
      variants={{ show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  )
}

export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={reveal}>
      {children}
    </motion.div>
  )
}
