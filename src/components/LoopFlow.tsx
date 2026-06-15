import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { AtSign, Search, FileText, Mic2, Clapperboard, Send, BarChart3, RotateCw } from 'lucide-react'
import { EASE } from './motion'
import { cn } from '../lib/cn'

// The complete loop, the spine of the pitch. Seven stages that visibly connect:
// a progress line draws itself as you scroll, each node lights up in sequence,
// and the loop closes back to the start (analytics → better next video).
const STAGES = [
  { icon: AtSign, t: 'Learn your voice', d: 'We read your @handle, posts & spoken audio, and profile exactly how you sound.', tint: 'coral' },
  { icon: Search, t: 'Pick a reference', d: 'Drop any viral Reel, TikTok or Short you wish you’d made.', tint: 'amber' },
  { icon: FileText, t: 'Get the blueprint', d: 'Hooks, script, shot list, captions, written in your voice, ready to shoot.', tint: 'teal' },
  { icon: Mic2, t: 'Record it', d: 'Built-in teleprompter so you film it confidently, in one take.', tint: 'coral' },
  { icon: Clapperboard, t: 'Auto-edit', d: 'One click: caption overlays, jump cuts, dead-air trimmed, on-brand.', tint: 'amber' },
  { icon: Send, t: 'Publish', d: 'Post to every platform on the schedule that builds momentum.', tint: 'teal' },
  { icon: BarChart3, t: 'See what worked', d: 'Analytics on views, retention & engagement, fuel for the next one.', tint: 'coral' },
]

const TINT: Record<string, string> = {
  coral: 'text-coral',
  amber: 'text-amber',
  teal: 'text-teal',
}

export function LoopFlow() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.8', 'end 0.4'] })
  // The vertical progress line height tracks scroll.
  const lineH = useTransform(scrollYProgress, [0, 1], ['0%', '100%'])

  return (
    <div ref={ref} className="relative mx-auto max-w-3xl">
      {/* spine */}
      <div className="absolute bottom-0 left-[27px] top-2 w-px bg-white/10 sm:left-1/2 sm:-translate-x-1/2" />
      <motion.div
        style={{ height: lineH }}
        className="absolute left-[27px] top-2 w-px bg-gradient-to-b from-coral via-amber to-teal sm:left-1/2 sm:-translate-x-1/2"
      />

      <div className="space-y-6 sm:space-y-3">
        {STAGES.map((s, i) => (
          <Stage key={s.t} stage={s} index={i} side={i % 2 === 0 ? 'left' : 'right'} />
        ))}
      </div>

      {/* loop-closes badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative mt-8 flex justify-center"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-signature-soft px-4 py-2 text-sm text-cream">
          <RotateCw className="h-4 w-4 text-amber" /> Every video makes the next one smarter
        </span>
      </motion.div>
    </div>
  )
}

function Stage({
  stage,
  index,
  side,
}: {
  stage: (typeof STAGES)[number]
  index: number
  side: 'left' | 'right'
}) {
  const Icon = stage.icon
  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, ease: EASE }}
      className={cn(
        'relative flex items-start gap-5 sm:w-1/2',
        side === 'right' ? 'sm:ml-auto sm:flex-row sm:pl-10' : 'sm:flex-row-reverse sm:pr-10 sm:text-right',
      )}
    >
      {/* node */}
      <span
        className={cn(
          'relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/10 bg-ink2 shadow-lift',
          'sm:absolute sm:top-1',
          side === 'right' ? 'sm:-left-7' : 'sm:-right-7',
        )}
      >
        <span className="absolute -z-10 h-full w-full rounded-2xl bg-signature opacity-20 blur-md" />
        <Icon className={cn('h-6 w-6', TINT[stage.tint])} />
        <span className="absolute -bottom-2 -right-2 grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] font-bold text-stone ring-1 ring-white/10">
          {index + 1}
        </span>
      </span>

      <div className="glass glass-hover flex-1 p-5">
        <h3 className="font-heading text-lg">{stage.t}</h3>
        <p className="mt-1 text-sm text-sand">{stage.d}</p>
      </div>
    </motion.div>
  )
}
