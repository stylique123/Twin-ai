import { motion } from 'framer-motion'
import { Play, Sparkles, Captions, Clapperboard } from 'lucide-react'
import { EASE } from './motion'

// The hero's product proof: a reference clip on the left "becoming" a structured,
// in-your-voice blueprint on the right. Floats gently; reveals on load.
export function HeroVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
      className="relative mx-auto w-full max-w-[440px]"
    >
      <div className="animate-float">
        {/* Reference → blueprint card */}
        <div className="gradient-border glass relative rounded-panel p-3 shadow-lift">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="chip">
              <Play className="h-3 w-3 text-coral" /> Reference
            </span>
            <span className="text-xs text-stone">retention map</span>
          </div>

          {/* faux video + retention curve */}
          <div className="relative overflow-hidden rounded-card bg-ink2">
            <div className="aspect-[16/10] bg-gradient-to-br from-coral/20 via-amber/10 to-teal/15" />
            <div className="absolute inset-x-0 bottom-0 flex items-end gap-1 px-3 pb-3">
              {[40, 72, 58, 90, 66, 80, 52, 74, 88, 60, 46, 70].map((h, i) => (
                <motion.span
                  key={i}
                  className="flex-1 rounded-sm bg-signature"
                  initial={{ height: 0 }}
                  animate={{ height: `${h * 0.55}px` }}
                  transition={{ duration: 0.6, ease: EASE, delay: 0.5 + i * 0.05 }}
                  style={{ opacity: 0.85 }}
                />
              ))}
            </div>
            <div className="absolute left-3 top-3 chip bg-ink/60 backdrop-blur">
              <Sparkles className="h-3 w-3 text-amber" /> Hook resolves @ 1.8s
            </div>
          </div>

          {/* blueprint rows */}
          <div className="space-y-2 p-2 pt-3">
            <Row icon={<Sparkles className="h-3.5 w-3.5 text-amber" />} label="Hook" value="“You're 35 and think it's late…”" />
            <Row icon={<Clapperboard className="h-3.5 w-3.5 text-coral" />} label="Shot list" value="3 beats · 17s · close-up" />
            <Row icon={<Captions className="h-3.5 w-3.5 text-teal" />} label="Captions" value="Auto, on-brand styling" />
          </div>
        </div>

        {/* floating "in your voice" badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotate: -6 }}
          animate={{ opacity: 1, scale: 1, rotate: -6 }}
          transition={{ duration: 0.6, ease: EASE, delay: 1 }}
          className="absolute -right-4 -top-5 rounded-2xl bg-signature px-3 py-2 text-xs font-bold text-ink shadow-glow"
        >
          In your voice ✦
        </motion.div>
      </div>
    </motion.div>
  )
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/5">{icon}</span>
      <span className="w-20 shrink-0 text-xs uppercase tracking-wider text-stone">{label}</span>
      <span className="truncate text-sm text-cream">{value}</span>
    </div>
  )
}
