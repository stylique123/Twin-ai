import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Sparkles, Type, Palette, Music, Clapperboard, Zap, X, Sliders } from 'lucide-react'
import { reEditWithEdl } from '../lib/api'
import { CAPTION_STYLE_OPTIONS, CAPTION_COLOR_OPTIONS, type EditDecisionList } from '../lib/types'
import { cn } from '../lib/cn'

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

  const changed = JSON.stringify(edl) !== JSON.stringify(initialEdl)

  const setCapStyle = (style: string) => setEdl((e) => e ? { ...e, captions: { ...e.captions, style } } : e)
  const setCapColor = (v: number) => setEdl((e) => e ? { ...e, variation: v, captions: { ...e.captions, variation: v } } : e)
  const setMusic = (on: boolean) => setEdl((e) => e ? { ...e, music: on } : e)
  const setEnergy = (en: 'high' | 'calm') => setEdl((e) => e ? { ...e, energy: en } : e)
  const setBrollKeep = (keep: boolean) => setEdl((e) => e ? { ...e, broll: keep ? (e.broll ?? { query: 'b-roll', start: 1.5, end: 4.5 }) : null } : e)
  const setBrollQuery = (q: string) => setEdl((e) => e && e.broll ? { ...e, broll: { ...e.broll, query: q } } : e)

  // Quick caption text editor
  const getWordsString = () => edl?.captions?.words?.map((w) => w.w).join(' ') || ''
  const handleUpdateWordsText = (text: string) => {
    const parts = text.trim().split(/\s+/)
    setEdl((e) => {
      if (!e) return e
      const oldWords = e.captions?.words || []
      const newWords = parts.map((w, idx) => {
        const old = oldWords[idx]
        return {
          w,
          start: old ? old.start : idx * 0.4,
          end: old ? old.end : (idx + 1) * 0.4,
        }
      })
      return {
        ...e,
        captions: {
          ...e.captions,
          words: newWords,
        },
      }
    })
  }

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
            className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-panel p-5 sm:rounded-panel sm:p-6 space-y-5"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-lg text-cream flex items-center gap-2">
                <Sliders className="h-5 w-5 text-coral" /> Refine your edit
              </h3>
              <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-stone hover:text-cream"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-stone mt-0">Tweak subtitles, timings and presets — re-rendering is free.</p>
            {err && <div className="rounded-card border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{err}</div>}

            {loading || !edl ? (
              <div className="grid place-items-center py-10 text-sm text-stone">
                <Loader2 className="mb-2 h-5 w-5 animate-spin text-coral" /> Loading this edit’s settings…
              </div>
            ) : (
              <div className="space-y-5">
                {/* Dynamic Visual Timeline representation */}
                <div className="space-y-2 bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-sand">Visual Edit Tracks</label>
                    <span className="text-[9px] font-mono text-stone bg-ink3/50 px-1.5 py-0.5 rounded border border-white/5">{edl.durationSec ? edl.durationSec.toFixed(1) : '0.0'}s total</span>
                  </div>
                  
                  <div className="space-y-3 pt-1">
                    {/* Caption segments track */}
                    <div className="flex items-center gap-3">
                      <span className="w-14 text-[9px] text-stone uppercase tracking-wider font-semibold">Captions</span>
                      <div className="flex-1 h-6 rounded bg-white/5 border border-white/5 relative overflow-hidden flex items-center justify-center">
                        {edl.captions?.words?.length > 0 ? (
                          <div className="absolute inset-0 bg-coral/15 rounded flex items-center justify-center text-[9px] font-mono text-coral font-bold uppercase tracking-wider border border-coral/20">
                            💬 {edl.captions.words.length} words synced
                          </div>
                        ) : (
                          <span className="text-[8px] text-stone">No captions</span>
                        )}
                      </div>
                    </div>

                    {/* B-Roll Track */}
                    <div className="flex items-center gap-3">
                      <span className="w-14 text-[9px] text-stone uppercase tracking-wider font-semibold">B-Roll</span>
                      <div className="flex-1 h-6 rounded bg-white/5 border border-white/5 relative overflow-hidden">
                        {edl.broll ? (
                          <div 
                            className="absolute bg-teal/15 border border-teal/30 rounded h-full top-0 flex items-center justify-center text-[9px] font-semibold text-teal truncate px-1.5"
                            style={{
                              left: `${Math.max(0, Math.min(90, (edl.broll.start / (edl.durationSec || 1)) * 100))}%`,
                              width: `${Math.max(10, Math.min(100, ((edl.broll.end - edl.broll.start) / (edl.durationSec || 1)) * 100))}%`
                            }}
                          >
                            🎬 {edl.broll.query}
                          </div>
                        ) : (
                          <span className="text-[8px] text-stone flex items-center h-full justify-center">No B-Roll overlays</span>
                        )}
                      </div>
                    </div>

                    {/* Music track */}
                    <div className="flex items-center gap-3">
                      <span className="w-14 text-[9px] text-stone uppercase tracking-wider font-semibold">Music</span>
                      <div className="flex-1 h-6 rounded bg-white/5 border border-white/5 relative overflow-hidden flex items-center px-2">
                        <div className={cn(
                          "h-1.5 rounded-full transition-all",
                          edl.music ? "w-[85%] bg-amber/35 animate-pulse" : "w-[30%] bg-stone/20"
                        )} />
                        <span className="text-[8px] font-mono text-stone ml-auto">{edl.music ? 'Ambient Beat' : 'Muted'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Subtitle Words Editor */}
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sand">
                    <Type className="h-3.5 w-3.5 text-amber" /> Correct Subtitles
                  </p>
                  <textarea
                    rows={3}
                    defaultValue={getWordsString()}
                    onBlur={(e) => handleUpdateWordsText(e.target.value)}
                    placeholder="Tweak the words here to fix transcription typos..."
                    className="field text-xs leading-relaxed"
                  />
                  <p className="text-[9px] text-stone">Typing edits updates words. Click outside the box to sync timeline changes.</p>
                </div>

                {/* Scene Cuts & Segments Editor */}
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sand">
                    <Clapperboard className="h-3.5 w-3.5 text-coral" /> Interactive Cuts &amp; Zooms
                  </p>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {edl.segments?.map((seg, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-xl p-2.5 text-xs">
                        <span className="font-mono text-stone">Segment {idx + 1}: {seg.start.toFixed(1)}s - {seg.end.toFixed(1)}s</span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setEdl((prev) => {
                                if (!prev) return prev
                                const nextSegs = prev.segments.map((s, i) => i === idx ? { ...s, zoom: !s.zoom } : s)
                                return { ...prev, segments: nextSegs }
                              })
                            }}
                            className={cn(
                              "px-2 py-1 rounded text-[10px] font-semibold transition-all border",
                              seg.zoom ? "bg-amber/15 border-amber text-amber" : "bg-white/5 border-white/10 text-stone"
                            )}
                          >
                            🔍 Zoom {seg.zoom ? 'On' : 'Off'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEdl((prev) => {
                                if (!prev) return prev
                                const nextSegs = prev.segments.filter((_, i) => i !== idx)
                                return { ...prev, segments: nextSegs }
                              })
                            }}
                            className="text-stone hover:text-coral transition-colors p-1"
                            title="Remove Cut"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {(!edl.segments || edl.segments.length === 0) && (
                      <p className="text-stone text-[10px] text-center py-2">No segments defined.</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Style selector */}
                  <div className="space-y-2">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sand">
                      <Palette className="h-3.5 w-3.5 text-teal" /> Subtitle Style
                    </p>
                    <select
                      value={edl.captions.style}
                      onChange={(e) => setCapStyle(e.target.value)}
                      className="field text-xs h-10"
                    >
                      {CAPTION_STYLE_OPTIONS.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Highlight Color */}
                  <div className="space-y-2">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sand">
                      <Palette className="h-3.5 w-3.5 text-coral" /> Highlight Color
                    </p>
                    <div className="flex gap-2 h-10 items-center">
                      {CAPTION_COLOR_OPTIONS.map((c) => (
                        <button 
                          key={c.id} 
                          onClick={() => setCapColor(c.id)} 
                          title={c.label}
                          type="button"
                          className={cn(
                            "h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-ink transition-all",
                            edl.variation === c.id ? 'ring-cream scale-110' : 'ring-transparent hover:ring-white/30'
                          )}
                          style={{ backgroundColor: c.hex }} 
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Pacing */}
                  <div className="space-y-2">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sand">
                      <Zap className="h-3.5 w-3.5 text-amber" /> Pacing
                    </p>
                    <div className="flex gap-2">
                      {(['calm', 'high'] as const).map((en) => (
                        <button key={en} onClick={() => setEnergy(en)} type="button"
                          className={cn(
                            "flex-1 rounded-xl border py-2.5 text-xs font-semibold transition-all",
                            edl.energy === en ? 'border-coral bg-coral/10 text-cream' : 'border-white/10 bg-white/5 text-stone'
                          )}>
                          {en === 'high' ? 'Punchy' : 'Clean'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Music — hidden when the render service says it has no music bed
                      configured (edl.features.music === false): a toggle that silently
                      no-ops is worse than no toggle. Old EDLs (no features field) keep it. */}
                  {edl.features?.music !== false && (
                  <div className="space-y-2">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sand">
                      <Music className="h-3.5 w-3.5 text-coral" /> Music Bed
                    </p>
                    <button onClick={() => setMusic(!edl.music)} type="button"
                      className={cn(
                        "w-full rounded-xl border py-2.5 text-xs font-semibold transition-all",
                        edl.music ? 'border-teal bg-teal/15 text-cream' : 'border-white/10 bg-white/5 text-stone'
                      )}>
                      {edl.music ? 'Enabled' : 'Muted'}
                    </button>
                  </div>
                  )}
                </div>

                {/* B-Roll panel — same honesty rule as Music above. */}
                {edl.features?.broll !== false && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sand">
                      <Clapperboard className="h-3.5 w-3.5 text-teal" /> B-roll Cutaway
                    </p>
                    <button onClick={() => setBrollKeep(!edl.broll)} type="button"
                      className={cn(
                        "rounded-full border px-3 py-1 text-[10px] font-semibold transition-colors",
                        edl.broll ? 'border-teal bg-teal/15 text-cream' : 'border-white/10 bg-white/5 text-stone'
                      )}>
                      {edl.broll ? 'Active' : 'Disabled'}
                    </button>
                  </div>
                  {edl.broll && (
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-3.5">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-stone uppercase block">Visual Query Directive</label>
                        <input className="field text-xs h-10" value={edl.broll.query} onChange={(e) => setBrollQuery(e.target.value)} placeholder="what the b-roll should show..." />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-bold text-stone uppercase block mb-1">Start Time (sec)</label>
                          <input 
                            type="number" 
                            step="0.1" 
                            min="0"
                            className="field text-xs font-mono h-10" 
                            value={edl.broll.start} 
                            onChange={(e) => {
                              const v = Number(e.target.value)
                              setEdl((prev) => prev && prev.broll ? { ...prev, broll: { ...prev.broll, start: v } } : prev)
                            }} 
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-stone uppercase block mb-1">End Time (sec)</label>
                          <input 
                            type="number" 
                            step="0.1" 
                            min="0"
                            className="field text-xs font-mono h-10" 
                            value={edl.broll.end} 
                            onChange={(e) => {
                              const v = Number(e.target.value)
                              setEdl((prev) => prev && prev.broll ? { ...prev, broll: { ...prev.broll, end: v } } : prev)
                            }} 
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                )}

                <button onClick={apply} disabled={applying || !takePath || !changed} className="btn-gradient w-full py-3 text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Apply &amp; re-render (free)
                </button>
                {!changed && <p className="text-center text-[10px] text-stone">Tweak a setting above to enable re-rendering.</p>}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
