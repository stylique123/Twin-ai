import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Check, type LucideIcon } from 'lucide-react'
import { EASE } from './motion'
import { cn } from '../lib/cn'

// A live, never-frozen build indicator shared by the Blueprint (Studio) and
// Brand-DNA (Brands) flows. The two reasons a long AI step *feels* slow are a
// static spinner and a bar stuck at one value — so this component always keeps the
// active stage's bar gently creeping and rotates a stage-specific status line, even
// while we wait on a single ~40s model call. It works in two modes:
//   • controlled — pass `active` (the real phase index) when the backend reports it.
//   • auto       — omit `active`; stages advance on their `est` (estimated seconds).
export interface BuildStage {
  label: string
  icon: LucideIcon
  est?: number // expected seconds — paces the bar + auto-advance (default 12)
  flavor?: string[] // micro-status lines that rotate while this stage is active
}

export function BuildProgress({
  stages,
  active,
  footer,
}: {
  stages: BuildStage[]
  active?: number
  footer?: string
}) {
  const [now, setNow] = useState(() => Date.now())
  const start = useRef(now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])
  const elapsed = (now - start.current) / 1000

  // Cumulative end-time of each stage (auto mode + bar pacing).
  const cum: number[] = []
  stages.reduce((a, s, i) => (cum[i] = a + (s.est ?? 12)), 0)
  const autoActive = (() => {
    for (let i = 0; i < stages.length; i++) if (elapsed < cum[i]) return i
    return stages.length - 1
  })()
  const cur = Math.min(active ?? autoActive, stages.length - 1)

  // Reset the within-stage timer whenever the active stage changes, so the creep
  // is measured from when THIS stage actually began (not from mount).
  const stageEnteredAt = useRef(start.current)
  const prevCur = useRef(cur)
  if (cur !== prevCur.current) {
    prevCur.current = cur
    stageEnteredAt.current = now
  }
  const sinceStage = (now - stageEnteredAt.current) / 1000
  const stageLen = stages[cur]?.est ?? 12
  // Ease toward — but never reach — the end of the current stage until it advances,
  // so the bar moves the whole time yet never lies about being "done".
  const within = Math.min(0.92, sinceStage / stageLen)
  const pct = Math.min(99, ((cur + within) / stages.length) * 100)

  const flavor = stages[cur]?.flavor ?? []
  const flavorLine = flavor.length ? flavor[Math.floor(elapsed / 2.5) % flavor.length] : null

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="space-y-3 text-left">
        {stages.map((s, i) => {
          const isDone = i < cur
          const isActive = i === cur
          return (
            <div key={s.label} className="flex items-center gap-3">
              <span
                className={cn(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-colors',
                  isDone
                    ? 'border-teal bg-teal/15 text-teal'
                    : isActive
                      ? 'border-coral bg-coral/15 text-coral'
                      : 'border-white/12 text-stone',
                )}
              >
                {isDone ? (
                  <Check className="h-4 w-4" />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <s.icon className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0">
                <span
                  className={cn(
                    'block text-sm transition-colors',
                    isDone ? 'text-sand' : isActive ? 'font-heading text-cream' : 'text-stone',
                  )}
                >
                  {s.label}
                </span>
                {isActive && flavorLine && (
                  <motion.span
                    key={flavorLine}
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="block text-xs text-stone"
                  >
                    {flavorLine}
                  </motion.span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-white/8">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-coral to-amber"
          animate={{ width: `${Math.max(6, pct)}%` }}
          transition={{ duration: 0.5, ease: EASE }}
        />
      </div>
      {footer && <p className="mt-3 text-center text-xs text-stone">{footer}</p>}
    </div>
  )
}
