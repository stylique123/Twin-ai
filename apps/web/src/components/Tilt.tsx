import { useRef, type ReactNode } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'

// Pointer-tracking 3D tilt with a soft spring. Wrap any card to make it feel
// alive on hover. Disables itself gracefully on touch (no pointer move).
export function Tilt({
  children,
  className,
  max = 8,
}: {
  children: ReactNode
  className?: string
  max?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 220, damping: 18 })
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 220, damping: 18 })

  const onMove = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    px.set((e.clientX - r.left) / r.width)
    py.set((e.clientY - r.top) / r.height)
  }
  const reset = () => {
    px.set(0.5)
    py.set(0.5)
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d', transformPerspective: 900 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
