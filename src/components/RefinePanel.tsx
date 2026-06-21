import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Sparkles, Type, Palette, Music, Clapperboard, Zap, X } from 'lucide-react'
import { reEditWithEdl } from '../lib/api'
import { CAPTION_STYLE_OPTIONS, CAPTION_COLOR_OPTIONS, type EditDecisionList } from '../lib/types'

// The easy 20% manual layer. Loads an edit's real decisions (EDL) and lets the
// creator tweak only what they want — caption style/color, pacing, music, b-roll
// — then re-renders FREE through the same pipeline (preview = the new render).
// Used from BOTH the Record review screen and the Result page so any video,
// past or fresh, can be refined.
export function RefinePanel({
  open,
  edl: initialEdl,
  loading,
  generationId,
  takePath,
  onClose,
  onApplied,
}: {
  open: boolean
  edl: EditDecisionList | null
  loading?: boolean
  generationId: string
  takePath: string | null
  onClose: () => void
  onApplied: (jobId: string) => void
}) {
  const [edl, setEdl] = useState<EditDecisionList | null>(initialEdl)
  const [applying, setApplying] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { setEdl(initialEdl) }, [initialEdl])

  const setCapStyle = (style: string) => setEdl((e) => e ? { ...e, captions: { ...e.captions, style } } : e)
  const setCapColor = (v: number) => setEdl((e) => e ? { ...e, variation: v, captions: { ...e.captions, variation: v } } : e)
  const setMusic = (on: boolean) => setEdl((e) => e ? { ...e, music: on } : e)
  const setEnergy = (en: 'high' | 'calm') => setEdl((e) => e ? { ...e, energy: en } : e)
  const setBrollKeep = (keep: boolean) => setEdl((e) => e ? { ...e, broll: keep ? (e.broll ?? { query: 'b-roll', start: 2, end: 4.2 }) : null } : e)
  const setBrollQuery = (q: string) => setEdl((e) => e && e.broll ? { ...e, broll: { ...e.broll, query: q } } : e)

  const apply = async () => {
    if (!edl || !takePath) { setErr('This edit can’t be refined (missing source take).'); return }
    setApplying(true); setErr(null)
    try {
      const jobId = await reEditWithEdl(generationId, takePath, edl)
      onApplied(jobId)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start the refine.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 backdrop-blur-sm sm:items-center sm:p-5"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
            className="glass max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-panel p-5 sm:rounded-panel sm:p-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-lg text-cream">Refine your edit</h3>
              <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-stone hover:text-cream"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-1 text-sm text-stone">Tweak only what you want — re-rendering is free.</p>
            {err && <div className="mt-3 rounded-card border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{err}</div>}

            {loading || !edl ? (
              <div className="mt-6 grid place-items-center py-10 text-sm text-stone">
                <Loader2 className="mb-2 h-5 w-5 animate-spin" /> Loading this edit’s settings…
              </div>
            ) : (
              <div className="mt-5 space-y-6">
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sand"><Type className="h-3.5 w-3.5 text-amber" /> Caption style</p>
                  <div className="flex flex-wrap gap-2">
                    {CAPTION_STYLE_OPTIONS.map((s) => (
                      <button key={s.id} onClick={() => setCapStyle(s.id)}
                        className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${edl.captions.style === s.id ? 'border-coral/60 bg-coral/15 text-cream' : 'border-white/10 bg-white/5 text-stone hover:text-cream'}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sand"><Palette className="h-3.5 w-3.5 text-teal" /> Highlight color</p>
                  <div className="flex flex-wrap gap-2.5">
                    {CAPTION_COLOR_OPTIONS.map((c) => (
                      <button key={c.id} onClick={() => setCapColor(c.id)} title={c.label}
                        className={`h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-ink transition-all ${edl.variation === c.id ? 'ring-cream scale-110' : 'ring-transparent hover:ring-white/30'}`}
                        style={{ backgroundColor: c.hex }} />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sand"><Zap className="h-3.5 w-3.5 text-amber" /> Pacing</p>
                  <div className="flex gap-2">
                    {(['calm', 'high'] as const).map((en) => (
                      <button key={en} onClick={() => setEnergy(en)}
                        className={`flex-1 rounded-card border px-3 py-2 text-sm font-medium capitalize transition-colors ${edl.energy === en ? 'border-coral/60 bg-coral/15 text-cream' : 'border-white/10 bg-white/5 text-stone hover:text-cream'}`}>
                        {en === 'high' ? 'Punchy (zoom cuts)' : 'Clean cuts'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sand"><Music className="h-3.5 w-3.5 text-coral" /> Music bed</p>
                  <button onClick={() => setMusic(!edl.music)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${edl.music ? 'border-teal/50 bg-teal/15 text-cream' : 'border-white/10 bg-white/5 text-stone'}`}>
                    {edl.music ? 'On' : 'Off'}
                  </button>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sand"><Clapperboard className="h-3.5 w-3.5 text-teal" /> B-roll cutaway</p>
                    <button onClick={() => setBrollKeep(!edl.broll)}
                      className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${edl.broll ? 'border-teal/50 bg-teal/15 text-cream' : 'border-white/10 bg-white/5 text-stone'}`}>
                      {edl.broll ? 'On' : 'Off'}
                    </button>
                  </div>
                  {edl.broll && (
                    <input className="field mt-2 text-sm" value={edl.broll.query} onChange={(e) => setBrollQuery(e.target.value)} placeholder="what the b-roll should show" />
                  )}
                </div>

                <button onClick={apply} disabled={applying || !takePath} className="btn-gradient w-full">
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Apply &amp; re-render (free)
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
