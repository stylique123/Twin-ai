// RATE THIS SCRIPT — one tap when the script appears.
//
// ⚖️ WHY IT EXISTS: her stars and her "what would you change?" are the most
// direct signal the niche brain can get. The words steer HER next scripts; the
// stars credit or discredit the patterns this script was built from, so what
// works rises for everyone in her niche.
//
// ⚖️ NEVER IN HER WAY. It appears a few seconds after the script has loaded,
// once per script, and "Later" closes it for good on this device. Nothing about
// the script changes when she answers.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const TAGS = [
  'Love it', 'Strong hook', 'Sounds like me',
  'Hook is weak', 'Too long', 'Too salesy', 'Not my voice', 'Wrong product facts', 'Hard to film',
] as const

const LATER_KEY = (id: string) => `twinai_rated_later_${id}`

export function RateThisScript({ generationId, ownerId }: { generationId: string; ownerId: string | null }) {
  const [open, setOpen] = useState(false)
  const [stars, setStars] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!ownerId) return
    let alive = true
    try { if (localStorage.getItem(LATER_KEY(generationId))) return } catch { /* private mode */ }
    const timer = setTimeout(() => {
      void supabase.from('script_ratings').select('generation_id').eq('generation_id', generationId).maybeSingle()
        .then(({ data, error }) => { if (alive && !error && !data) setOpen(true) }, () => {})
    }, 6000)
    return () => { alive = false; clearTimeout(timer) }
  }, [generationId, ownerId])

  if (!open) return null

  const later = () => {
    try { localStorage.setItem(LATER_KEY(generationId), '1') } catch { /* ignore */ }
    setOpen(false)
  }
  const toggle = (t: string) => setTags((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t]))
  const save = async () => {
    if (!ownerId || stars === 0) return
    setSaving(true)
    const { error } = await supabase.from('script_ratings').upsert({
      generation_id: generationId, owner_id: ownerId, stars, tags,
      change_note: note.trim() ? note.trim().slice(0, 1000) : null, updated_at: new Date().toISOString(),
    }, { onConflict: 'generation_id' })
    setSaving(false)
    if (error) return
    setDone(true)
    setTimeout(() => setOpen(false), 1400)
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/70 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Rate this script">
      <div className="glass gradient-border w-full max-w-md p-6">
        {done ? (
          <p className="text-center text-sm text-cream">Thanks — Twin will use this in your next scripts.</p>
        ) : (
          <>
            <h2 className="font-display text-2xl tracking-tight">How is this script?</h2>
            <p className="mt-1 text-sm text-stone">Your answer shapes your next scripts.</p>
            <div className="mt-4 flex gap-1" role="radiogroup" aria-label="Stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  onClick={() => setStars(n)}
                  className={`text-3xl leading-none ${n <= stars ? 'text-cream' : 'text-stone/40'}`}>★</button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {TAGS.map((t) => (
                <button key={t} type="button" onClick={() => toggle(t)} aria-pressed={tags.includes(t)}
                  className={`rounded-full border px-3 py-1 text-xs ${tags.includes(t) ? 'border-cream text-cream' : 'border-stone/40 text-stone'}`}>{t}</button>
              ))}
            </div>
            <label className="mt-4 block text-sm text-stone">
              What would you change?
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000}
                className="mt-1 w-full rounded-lg bg-ink/60 p-2 text-sm text-cream" placeholder="e.g. open with the price, less formal, shorter middle" />
            </label>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={save} disabled={stars === 0 || saving} className="btn-gradient flex-1 disabled:opacity-50">
                {saving ? 'Saving…' : 'Send'}
              </button>
              <button type="button" onClick={later} className="btn-ghost flex-1">Later</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
