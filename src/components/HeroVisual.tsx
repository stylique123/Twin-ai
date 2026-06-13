import { motion } from 'framer-motion'
import { Play, Sparkles, FileText, Captions } from 'lucide-react'
import { EASE } from './motion'

// Hero right-side: a phone showing your finished reel + a floating reference card above it.
// Visualises the core promise: paste a reference (card), get your video (phone).
export function HeroVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, ease: EASE, delay: 0.18 }}
      className="relative flex justify-center"
    >
      <div className="relative">
        {/* ---- Floating "reference in" card (top-left) ---- */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1, duration: 0.5, ease: EASE }}
          className="absolute -left-20 top-10 z-20 w-44 rounded-2xl border border-white/12 bg-ink2/90 p-3 shadow-lift backdrop-blur"
        >
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-stone">
            <Play className="h-2.5 w-2.5 text-coral" /> Reference pasted
          </div>
          <div className="mt-1.5 text-xs font-medium text-cream">2.1M views · TikTok</div>
          <div className="mt-1 text-[10px] text-stone truncate">tiktok.com/@garyvee/…</div>
          <motion.div
            className="mt-2 h-0.5 rounded-full bg-signature"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ delay: 1.3, duration: 1.2, ease: EASE }}
          />
          <div className="mt-1.5 text-[10px] text-teal">Analysing structure…</div>
        </motion.div>

        {/* ---- Phone frame ---- */}
        <div className="relative w-[200px] overflow-hidden rounded-[38px] border-[5px] border-white/15 bg-ink shadow-[0_32px_80px_-12px_rgba(0,0,0,.7)]">
          {/* notch */}
          <div className="flex justify-center bg-ink pt-3 pb-0.5">
            <div className="h-[18px] w-[72px] rounded-full bg-black/60" />
          </div>

          {/* screen — vertical video mock */}
          <div className="relative h-[360px] overflow-hidden bg-gradient-to-b from-coral/30 via-ink2 to-ink">
            {/* "rec" indicator */}
            <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-bold text-cream backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-coral" /> 0:14
            </div>

            {/* animated caption pop */}
            <div className="absolute inset-x-4 bottom-16 text-center">
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="font-heading text-xl leading-tight text-cream"
              >
                Stop posting more.
              </motion.p>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.0, duration: 0.5 }}
                className="font-heading text-xl leading-tight"
              >
                Post <span className="text-amber">smarter.</span>
              </motion.p>
            </div>

            {/* progress bar */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 px-3 pb-4 pt-6">
              <div className="overflow-hidden rounded-full bg-white/15 h-0.5">
                <motion.div
                  className="h-full rounded-full bg-white/70"
                  initial={{ width: '0%' }}
                  animate={{ width: '62%' }}
                  transition={{ delay: 0.4, duration: 2, ease: 'linear' }}
                />
              </div>
            </div>
          </div>

          {/* home bar */}
          <div className="flex justify-center bg-ink py-2">
            <div className="h-1 w-20 rounded-full bg-white/18" />
          </div>
        </div>

        {/* ---- "In your voice" badge ---- */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7, rotate: -4 }}
          animate={{ opacity: 1, scale: 1, rotate: -4 }}
          transition={{ delay: 1.4, duration: 0.5, ease: EASE }}
          className="absolute -right-8 bottom-24 z-20 rounded-2xl bg-signature px-3 py-2 text-xs font-bold text-ink shadow-glow"
        >
          In your voice ✦
        </motion.div>

        {/* ---- Blueprint chip (bottom-left) ---- */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.6, duration: 0.5, ease: EASE }}
          className="absolute -left-16 bottom-16 z-20 space-y-1.5 rounded-2xl border border-white/10 bg-ink2/90 p-2.5 shadow-lift backdrop-blur text-[10px]"
        >
          <div className="flex items-center gap-1.5 text-teal">
            <Sparkles className="h-2.5 w-2.5" /> Blueprint ready
          </div>
          <div className="flex items-center gap-1.5 text-sand"><FileText className="h-2.5 w-2.5 text-stone" /> Script + shot list</div>
          <div className="flex items-center gap-1.5 text-sand"><Captions className="h-2.5 w-2.5 text-stone" /> Auto-captions</div>
        </motion.div>
      </div>
    </motion.div>
  )
}
