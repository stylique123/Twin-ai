import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Sparkles, Type, Palette, Music, Clapperboard, Zap, X, Sliders, ChevronDown } from 'lucide-react'
import { reEditWithEdl } from '../lib/api'
import { CAPTION_STYLE_OPTIONS, CAPTION_COLOR_OPTIONS, type EditDecisionList } from '../lib/types'
import { cn } from '../lib/cn'

// Round a raw seconds float to 1 decimal for display (kills the "3.4000000000000004"
// that read as a bug to every user on the panel).
const s1 = (n: number) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0)

type Word = { w: string; start: number; end: number }
// One editable caption phrase: its original words + its fixed time window. Editing the
// text NEVER touches other lines — the whole point of the per-line rebuild.
type CapLine = { start: number; end: number; original: Word[]; text: string }

// Group the flat word list into readable phrases (~5 words, break on sentence/clause
// punctuation) — the same phrasing the burned captions use, so a "line" here matches
// what the viewer sees on screen.
function groupWords(words: Word[]): CapLine[] {
  const lines: CapLine[] = []
  let cur: Word[] = []
  const flush = () => {
    if (!cur.length) return
    lines.push({ start: cur[0].start, end: cur[cur.length - 1].end, original: cur, text: cur.map((w) => w.w).join(' ') })
    cur = []
  }
  for (const w of words) {
    cur.push(w)
    if (cur.length >= 5 || /[.!?,;:]$/.test(w.w)) flush()
  }
  flush()
  return lines
}

// Flatten edited lines back to timed words. An UNCHANGED line keeps its exact original
// per-word timings; only a line whose text actually changed is re-timed — and it is
// spread ONLY across its own [start,end] window, so a typo fix can never shift the rest
// of the video's captions (the drift bug).
function flattenLines(lines: CapLine[]): Word[] {
  const out: Word[] = []
  for (const ln of lines) {
    const toks = ln.text.trim().split(/\s+/).filter(Boolean)
    const orig = ln.original.map((w) => w.w)
    const unchanged = toks.length === orig.length && toks.every((t, i) => t === orig[i])
    if (unchanged) { out.push(...ln.original); continue }
    if (!toks.length) continue // emptied line → drop its words
    const span = Math.max(0.3, ln.end - ln.start)
    const per = span / toks.length
    toks.forEach((t, i) => out.push({ w: t, start: ln.start + i * per, end: ln.start + (i + 1) * per }))
  }
  return out
}

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
  // Progressive disclosure: the panel review found the cut/zoom timecodes + b-roll
  // controls scared non-technical creators and read as "an editor I can't use". They
  // live under Advanced now; the default view is just the friendly cosmetic choices.
  const [advanced, setAdvanced] = useState(false)
  // Caption phrases, edited per-line. Rebuilt only when a NEW edit loads (initialEdl),
  // so each line's input keeps a stable identity while the creator types.
  const [capLines, setCapLines] = useState<CapLine[]>([])

  useEffect(() => {
    setEdl(initialEdl)
    setCapLines(groupWords((initialEdl?.captions?.words ?? []) as Word[]))
  }, [initialEdl])

  const changed = JSON.stringify(edl) !== JSON.stringify(initialEdl)

  // Commit one line's text edit: update that line only, reflow just its window, and
  // push the rebuilt (locally-retimed) word list into the EDL.
  const commitLine = (idx: number, text: string) => {
    setCapLines((prev) => {
      const next = prev.map((ln, i) => (i === idx ? { ...ln, text } : ln))
      const words = flattenLines(next)
      setEdl((e) => (e ? { ...e, captions: { ...e.captions, words } } : e))
      return next
    })
  }

  const setCapStyle = (style: string) => setEdl((e) => e ? { ...e, captions: { ...e.captions, style } } : e)
  const setCapColor = (v: number) => setEdl((e) => e ? { ...e, variation: v, captions: { ...e.captions, variation: v } } : e)
  const setMusic = (on: boolean) => setEdl((e) => e ? { ...e, music: on } : e)
  const setEnergy = (en: 'high' | 'calm') => setEdl((e) => e ? { ...e, energy: en } : e)
  const setBrollKeep = (keep: boolean) => setEdl((e) => e ? { ...e, broll: keep ? (e.broll ?? { query: '', start: 1.5, end: 4.5 }) : null } : e)
  const setBrollQuery = (q: string) => setEdl((e) => e && e.broll ? { ...e, broll: { ...e.broll, query: q } } : e)

  // Label a cut by the WORDS spoken in it (recognition), not "Segment 3: 12.4–15.8s"
  // (recall against timecodes) — the #1 fix the panel review asked for on cuts.
  const segmentLabel = (start: number, end: number): string => {
    const words = (edl?.captions?.words ?? []).filter((w) => w.start >= start - 0.15 && w.start < end)
    const text = words.slice(0, 5).map((w) => w.w).join(' ')
    return text ? `“${text}${words.length > 5 ? '…' : ''}”` : 'Silent moment'
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

  const hasSegments = (edl?.segments?.length ?? 0) > 0
  const showBroll = edl?.features?.broll !== false

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
                <Sliders className="h-5 w-5 text-coral" /> Fine-tune your video
              </h3>
              <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-stone hover:text-cream"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-stone mt-0">Your video’s ready — tweak only if you want. Every change re-renders for free.</p>
            {err && <div className="rounded-card border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{err}</div>}

            {loading || !edl ? (
              <div className="grid place-items-center py-10 text-sm text-stone">
                <Loader2 className="mb-2 h-5 w-5 animate-spin text-coral" /> Loading this edit’s settings…
              </div>
            ) : (
              <div className="space-y-5">
                {/* ---- CAPTION LOOK (style + highlight colour together) ---- */}
                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sand">
                    <Palette className="h-3.5 w-3.5 text-teal" /> Caption look
                  </p>
                  <select
                    value={edl.captions.style}
                    onChange={(e) => setCapStyle(e.target.value)}
                    className="field text-sm h-11"
                  >
                    {CAPTION_STYLE_OPTIONS.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-stone">Highlight</span>
                    <div className="flex gap-2">
                      {CAPTION_COLOR_OPTIONS.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setCapColor(c.id)}
                          title={c.label}
                          type="button"
                          className={cn(
                            'h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-ink transition-all',
                            edl.variation === c.id ? 'ring-cream scale-110' : 'ring-transparent hover:ring-white/30'
                          )}
                          style={{ backgroundColor: c.hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* ---- EDITING STYLE + MUSIC (two friendly one-tap choices) ---- */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sand">
                      <Zap className="h-3.5 w-3.5 text-amber" /> Editing style
                    </p>
                    <div className="flex gap-2">
                      {(['calm', 'high'] as const).map((en) => (
                        <button key={en} onClick={() => setEnergy(en)} type="button"
                          className={cn(
                            'flex-1 rounded-xl border py-2.5 text-xs font-semibold transition-all',
                            edl.energy === en ? 'border-coral bg-coral/10 text-cream' : 'border-white/10 bg-white/5 text-stone'
                          )}>
                          {en === 'high' ? 'Snappy' : 'Relaxed'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Music — hidden when the render service has no music bed configured
                      (a toggle that silently no-ops is worse than no toggle). */}
                  {edl.features?.music !== false && (
                    <div className="space-y-2">
                      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sand">
                        <Music className="h-3.5 w-3.5 text-coral" /> Background music
                      </p>
                      <button onClick={() => setMusic(!edl.music)} type="button"
                        className={cn(
                          'w-full rounded-xl border py-2.5 text-xs font-semibold transition-all',
                          edl.music ? 'border-teal bg-teal/15 text-cream' : 'border-white/10 bg-white/5 text-stone'
                        )}>
                        {edl.music ? 'On' : 'Off'}
                      </button>
                    </div>
                  )}
                </div>

                {/* ---- FIX CAPTIONS (per phrase — fixing one line never re-times the rest) ---- */}
                {capLines.length > 0 && (
                  <div className="space-y-2">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sand">
                      <Type className="h-3.5 w-3.5 text-amber" /> Fix captions
                    </p>
                    <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                      {capLines.map((ln, idx) => (
                        <input
                          key={idx}
                          defaultValue={ln.text}
                          onBlur={(e) => commitLine(idx, e.target.value)}
                          aria-label={`Caption phrase ${idx + 1}`}
                          className="field text-sm h-10"
                        />
                      ))}
                    </div>
                    <p className="text-[10px] text-stone">Each line is one caption. Fixing a word only re-times that line — the rest stay put. Saves when you tap outside.</p>
                  </div>
                )}

                {/* ---- ADVANCED (cuts / zoom / cutaways) ---- */}
                {(hasSegments || showBroll) && (
                  <div className="rounded-2xl border border-white/5 bg-white/[0.02]">
                    <button
                      type="button"
                      onClick={() => setAdvanced((v) => !v)}
                      className="flex w-full items-center justify-between px-4 py-3 text-xs font-bold uppercase tracking-wider text-stone hover:text-cream"
                    >
                      <span>Advanced — cuts, zooms &amp; cutaways</span>
                      <ChevronDown className={cn('h-4 w-4 transition-transform', advanced && 'rotate-180')} />
                    </button>

                    {advanced && (
                      <div className="space-y-5 border-t border-white/5 px-4 pb-4 pt-4">
                        {/* Cuts & zooms — labelled by the WORDS in each cut, not raw seconds. */}
                        {hasSegments && (
                          <div className="space-y-2">
                            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-sand">
                              <Clapperboard className="h-3.5 w-3.5 text-coral" /> Cuts &amp; zoom effects
                            </p>
                            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                              {edl.segments.map((seg, idx) => (
                                <div key={idx} className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-xs">
                                  <div className="min-w-0">
                                    <p className="truncate text-cream">{segmentLabel(seg.start, seg.end)}</p>
                                    <p className="font-mono text-[10px] text-stone">{s1(seg.start).toFixed(1)}s – {s1(seg.end).toFixed(1)}s</p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setEdl((prev) => prev ? { ...prev, segments: prev.segments.map((s, i) => i === idx ? { ...s, zoom: !s.zoom } : s) } : prev)}
                                      className={cn(
                                        'rounded px-2 py-1 text-[10px] font-semibold transition-all border',
                                        seg.zoom ? 'bg-amber/15 border-amber text-amber' : 'bg-white/5 border-white/10 text-stone'
                                      )}
                                    >
                                      🔍 Zoom {seg.zoom ? 'On' : 'Off'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEdl((prev) => prev ? { ...prev, segments: prev.segments.filter((_, i) => i !== idx) } : prev)}
                                      className="p-1 text-stone transition-colors hover:text-coral"
                                      title="Remove this moment"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <p className="text-[10px] text-stone">Removing a moment drops it from the video.</p>
                          </div>
                        )}

                        {/* Cutaway clip — renamed from "Visual Query Directive", seconds rounded. */}
                        {showBroll && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-sand">
                                <Clapperboard className="h-3.5 w-3.5 text-teal" /> Cutaway clip
                              </p>
                              <button onClick={() => setBrollKeep(!edl.broll)} type="button"
                                className={cn(
                                  'rounded-full border px-3 py-1 text-[10px] font-semibold transition-colors',
                                  edl.broll ? 'border-teal bg-teal/15 text-cream' : 'border-white/10 bg-white/5 text-stone'
                                )}>
                                {edl.broll ? 'On' : 'Off'}
                              </button>
                            </div>
                            {edl.broll && (
                              <div className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                                <div className="space-y-1">
                                  <label className="block text-[9px] font-bold uppercase text-stone">What to show on screen</label>
                                  <input className="field text-sm h-10" value={edl.broll.query} onChange={(e) => setBrollQuery(e.target.value)} placeholder="e.g. a busy city street at night" />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="mb-1 block text-[9px] font-bold uppercase text-stone">Show from (sec)</label>
                                    <input
                                      type="number" step="0.1" min="0"
                                      className="field text-sm font-mono h-10"
                                      value={s1(edl.broll.start)}
                                      onChange={(e) => { const v = Number(e.target.value); setEdl((prev) => prev && prev.broll ? { ...prev, broll: { ...prev.broll, start: v } } : prev) }}
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-[9px] font-bold uppercase text-stone">Until (sec)</label>
                                    <input
                                      type="number" step="0.1" min="0"
                                      className="field text-sm font-mono h-10"
                                      value={s1(edl.broll.end)}
                                      onChange={(e) => { const v = Number(e.target.value); setEdl((prev) => prev && prev.broll ? { ...prev, broll: { ...prev.broll, end: v } } : prev) }}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
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
