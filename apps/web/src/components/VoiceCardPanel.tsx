import { useEffect, useState } from 'react'
import { trialUser } from './ProductDetailsByKind'
import { voiceCardRequest, type VoiceCardResult, type VoiceCardEditsDto, type VoiceCardViewDto } from '../lib/api'

/**
 * THIS IS HOW YOU SOUND (plan v5.1 item L). Her voice card, counted from her
 * own videos and answers: she can remove anything that is not her, and add a
 * phrase she never says. A thin creator sees why there is no card yet.
 *
 * ⚖️ BEHIND THE TRIAL: only the account in `VITE_TRIAL_USER_ID` sees it, and
 * `VITE_VOICE_CARD_KILL=1` hides it for everyone. Every other account gets
 * `null`. The server enforces the same (test accounts only, VOICE_CARD_ENABLED).
 */

export function voiceCardVisible(userId: string | null | undefined): boolean {
  return trialUser(userId) && String(import.meta.env.VITE_VOICE_CARD_KILL ?? '').trim() !== '1'
}

type RemoveKey = keyof NonNullable<VoiceCardEditsDto['remove']>
const REMOVABLE = new Set<string>(['openers', 'uses', 'signatures', 'never_says', 'avoids'])

/** Her edits with one item removed (pure). */
export function withRemoved(edits: VoiceCardEditsDto, key: RemoveKey, item: string): VoiceCardEditsDto {
  const remove = { ...(edits.remove ?? {}) }
  remove[key] = [...new Set([...(remove[key] ?? []), item])]
  return { ...edits, remove }
}

type Load = (action: 'get' | 'edit', edits?: VoiceCardEditsDto) => Promise<VoiceCardResult>

export function VoiceCardPanel({ userId, load = voiceCardRequest }: { userId: string | null | undefined; load?: Load }) {
  const visible = voiceCardVisible(userId)
  const [res, setRes] = useState<VoiceCardResult | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!visible) return
    let alive = true
    load('get').then((r) => { if (alive) setRes(r) }).catch(() => { if (alive) setErr("We couldn't load your voice card.") })
    return () => { alive = false }
  }, [visible, load])
  if (!visible || !res || res.disabled) return err && visible ? <p role="alert" className="text-sm text-red-600">{err}</p> : null
  const save = async (edits: VoiceCardEditsDto) => {
    setBusy(true); setErr(null)
    try { setRes(await load('edit', edits)); setDraft('') } catch { setErr("We couldn't save that — try again.") } finally { setBusy(false) }
  }
  const card: VoiceCardViewDto | null = res.card
  if (!card) {
    return (
      <section aria-label="This is how you sound" className="mt-4 rounded-xl border p-4 space-y-2">
        <h3 className="font-semibold">This is how you sound</h3>
        <p className="text-sm">{res.reason === 'thin'
          ? 'Not enough of your own words yet. Twin needs about 15 minutes of your videos or 10 answers before it can describe your voice, so for now scripts use the general version.'
          : 'No voice card yet.'}</p>
      </section>
    )
  }
  const edits = res.edits ?? {}
  return (
    <section aria-label="This is how you sound" className="mt-4 rounded-xl border p-4 space-y-3">
      <h3 className="font-semibold">{card.title}</h3>
      {card.manual ? (
        <p data-testid="voice-card-manual" className="text-xs">Set up by hand from {card.counted_from}. No AI was used; Twin will rebuild it once it has your videos.</p>
      ) : (
        <p className="text-xs">Counted from {card.counted_from}.</p>
      )}
      {card.sections.map((s) => (
        <div key={s.key} data-testid={`voice-${s.key}`} className="space-y-1">
          <p className="text-sm font-medium">{s.label}</p>
          <p className="text-xs">{s.summary}</p>
          {s.items.length ? (
            <ul className="flex flex-wrap gap-2">
              {s.items.map((it) => (
                <li key={it} className="rounded border px-2 py-0.5 text-xs">
                  {it}
                  {s.editable && REMOVABLE.has(s.key) ? (
                    <button type="button" aria-label={`Remove ${it}`} disabled={busy} className="ml-1" onClick={() => save(withRemoved(edits, s.key as RemoveKey, it))}>×</button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
      <div className="flex gap-2">
        <input aria-label="A phrase you never say" className="flex-1 rounded border p-1 text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="button" disabled={busy || !draft.trim()} onClick={() => save({ ...edits, never_says_add: [...(edits.never_says_add ?? []), draft.trim()] })}>I never say this</button>
      </div>
      {err ? <p role="alert" className="text-sm text-red-600">{err}</p> : null}
    </section>
  )
}
