// CANARY FEEDBACK (Fast Path v1, Track B (3)) — what the owner thought of each
// canary script: a 1-10 rating, the script as he actually used it, posted yes
// or no with the link, and a free note.
//
// ⚖️ CANARY ONLY. Result.tsx renders this instead of RateThisScript only when
// the saved blueprint carries the server-set tag `canary: true`; the table's
// insert policy (0293) refuses a row for any other generation.
// ⚖️ ONE SOURCE FOR "POSTED". The link goes through markPosted into public.posts
// (generation_id + external_url), the same table every other post uses.
// ⚖️ READ BY: scripts/ops/canaryDailyReport.mjs (counts and averages only).
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { markPosted } from '../lib/api'

const PLATFORMS = ['TikTok', 'Instagram', 'YouTube', 'Other'] as const
const HTTPS = /^https:\/\/\S+$/i

export function CanaryFeedback({ generationId, ownerId, shippedScript }: {
  generationId: string
  ownerId: string | null
  /** The script exactly as Twin shipped it, one line per beat. */
  shippedScript: string
}) {
  const [rating, setRating] = useState(0)
  const [edited, setEdited] = useState(shippedScript)
  const [note, setNote] = useState('')
  const [posted, setPosted] = useState<'yes' | 'no' | null>(null)
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>('TikTok')
  const [link, setLink] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Re-open with his earlier answer, so a second visit edits rather than duplicates.
  useEffect(() => {
    if (!ownerId) return
    let alive = true
    void supabase.from('canary_feedback').select('rating, edited_script, note').eq('generation_id', generationId).maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return
        setRating(data.rating ?? 0)
        if (typeof data.edited_script === 'string') setEdited(data.edited_script)
        setNote(data.note ?? '')
        setSaved(true)
      }, () => {})
    return () => { alive = false }
  }, [generationId, ownerId])

  if (!ownerId) return null

  const linkOk = posted !== 'yes' || HTTPS.test(link.trim())
  const save = async () => {
    if (rating === 0 || !linkOk) return
    setSaving(true); setErr(null)
    const { error } = await supabase.from('canary_feedback').upsert({
      generation_id: generationId,
      owner_id: ownerId,
      rating,
      // Store his version only when it differs: an unchanged script is "no edits".
      edited_script: edited.trim() && edited.trim() !== shippedScript.trim() ? edited.trim().slice(0, 8000) : null,
      note: note.trim() ? note.trim().slice(0, 1000) : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'generation_id' })
    if (!error && posted === 'yes') {
      try { await markPosted({ generationId, platform, externalUrl: link.trim() }) } catch { setErr('Saved your rating, but the post link did not save. Try again.') }
    }
    setSaving(false)
    if (error) { setErr('Could not save. Try again.'); return }
    setSaved(true)
  }

  return (
    <section className="glass gradient-border mt-6 p-5" aria-label="Canary feedback">
      <h2 className="font-display text-xl tracking-tight">Your verdict on this script</h2>
      <p className="mt-1 text-sm text-stone">Canary: every answer here goes straight into tomorrow's fixes.</p>

      <div className="mt-4 flex flex-wrap gap-1" role="radiogroup" aria-label="Rating out of 10">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} onClick={() => setRating(n)}
            className={`h-9 w-9 rounded-lg border text-sm ${rating === n ? 'border-cream bg-cream/10 text-cream' : 'border-stone/40 text-stone'}`}>{n}</button>
        ))}
      </div>

      <label className="mt-4 block text-sm font-medium text-cream">
        The script as you used it (edit freely; leave it if you changed nothing)
        <textarea value={edited} onChange={(e) => setEdited(e.target.value)} rows={8} maxLength={8000}
          className="mt-1 w-full rounded-lg bg-ink/60 p-2 text-sm text-cream" />
      </label>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-cream">Did you post it?</legend>
        <div className="mt-1 flex gap-2">
          {(['yes', 'no'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={posted === v} onClick={() => setPosted(v)}
              className={`rounded-full border px-4 py-1 text-sm ${posted === v ? 'border-cream text-cream' : 'border-stone/40 text-stone'}`}>{v === 'yes' ? 'Yes' : 'Not yet'}</button>
          ))}
        </div>
        {posted === 'yes' && (
          <div className="mt-2 flex flex-wrap gap-2">
            <select value={platform} onChange={(e) => setPlatform(e.target.value as (typeof PLATFORMS)[number])}
              className="rounded-lg bg-ink/60 p-2 text-sm text-cream" aria-label="Platform">
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… link to the post"
              className="min-w-0 flex-1 rounded-lg bg-ink/60 p-2 text-sm text-cream" aria-label="Post link" />
          </div>
        )}
        {!linkOk && <p className="mt-1 text-xs text-stone">Paste the full link, starting with https://</p>}
      </fieldset>

      <label className="mt-4 block text-sm font-medium text-cream">
        Anything else?
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000}
          className="mt-1 w-full rounded-lg bg-ink/60 p-2 text-sm text-cream" placeholder="What worked, what didn't" />
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={save} disabled={rating === 0 || saving || !linkOk} className="btn-gradient disabled:opacity-50">
          {saving ? 'Saving…' : saved ? 'Update' : 'Save'}
        </button>
        {saved && !saving && !err && <span className="text-sm text-stone">Saved.</span>}
        {err && <span className="text-sm text-stone">{err}</span>}
      </div>
    </section>
  )
}
