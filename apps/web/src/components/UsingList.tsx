import { useState } from 'react'
import { trialUser } from './ProductDetailsByKind'
import { supabase } from '../lib/supabase'

/**
 * WHAT TWIN USED (plan v5.4 item O). One row per item the script rests on —
 * her facts and stories, her words, her answers, the product, the brand,
 * outside items — read from `blueprint.line_sources` (each traced sentence's
 * `from[]`). Each row carries a source tag and two buttons, both served by the
 * `using_item` mode of generate-blueprint (usingBlock.ts):
 *   Remove     → the lines from that item leave THIS script, refilled by the
 *                panel-10 relevance rules; the page shows the new script.
 *   Never use  → the item joins her block list (any kind; a stored fact is also
 *                switched off), so Twin never uses it again. Not offered for
 *                "Your idea for this video" (that is the request itself).
 *
 * ⚖️ BEHIND THE TRIAL: only `VITE_TRIAL_USER_ID` sees it; `VITE_USING_LIST_KILL=1`
 * hides it for everyone; the edge refuses under `USING_ITEM_KILL=1`.
 */

export type UsingTag = 'Your fact' | 'Your words' | 'Your answer' | 'Product' | 'Brand' | 'Outside'
export interface UsingItemRef { kind: string; label: string; id?: string }
export interface UsingItem { key: string; tag: UsingTag; label: string; factId: string | null; lines: number; ref: UsingItemRef; blockable: boolean }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function tagOf(kind: string, label: string): UsingTag | null {
  switch (kind) {
    case 'fact': return 'Your fact'
    case 'her_words': return /^Your answer/i.test(label) ? 'Your answer' : 'Your words'
    case 'product': return 'Product'
    case 'brand': return 'Brand'
    case 'audience': case 'niche': case 'world': return 'Outside'
    default: return null
  }
}

export function usingItemsOf(bp: { line_sources?: unknown } | null | undefined): UsingItem[] {
  const lines = Array.isArray(bp?.line_sources) ? (bp!.line_sources as unknown[]) : []
  const out = new Map<string, UsingItem>()
  for (const l of lines) {
    const from = Array.isArray((l as { from?: unknown } | null)?.from) ? (l as { from: unknown[] }).from : []
    for (const f of from) {
      const h = f as { kind?: unknown; label?: unknown; id?: unknown } | null
      if (!h || typeof h.kind !== 'string' || typeof h.label !== 'string' || !h.label.trim()) continue
      const tag = tagOf(h.kind, h.label)
      if (!tag) continue
      const id = typeof h.id === 'string' && UUID.test(h.id) ? h.id : null
      const key = `${h.kind}:${id ?? h.label}`
      const prev = out.get(key)
      if (prev) prev.lines++
      else out.set(key, {
        key, tag, label: h.label.replace(/^Your answer:\s*/i, ''), factId: h.kind === 'fact' ? id : null, lines: 1,
        ref: { kind: h.kind, label: h.label, ...(id ? { id } : {}) },
        // Her idea for this video is the request itself: it can leave a script, not be blocked.
        blockable: !(h.kind === 'her_words' && !/^Your answer/i.test(h.label)),
      })
    }
  }
  return [...out.values()]
}

export function usingListVisible(userId: string | null | undefined): boolean {
  return trialUser(userId) && String(import.meta.env.VITE_USING_LIST_KILL ?? '').trim() !== '1'
}

export type UsingAction = 'remove' | 'never_use'
export interface UsingResult { ok: boolean; script?: unknown; line_sources?: unknown }
export type SendUsing = (generationId: string, item: UsingItemRef, action: UsingAction) => Promise<UsingResult>
export const sendUsingItem: SendUsing = async (generationId, item, action) => {
  try {
    const { data, error } = await supabase.functions.invoke('generate-blueprint', { body: { mode: 'using_item', generation_id: generationId, item, action } })
    const d = (data ?? null) as { ok?: unknown; script?: unknown; line_sources?: unknown } | null
    return { ok: !error && d?.ok === true, script: d?.script, line_sources: d?.line_sources }
  } catch { return { ok: false } }
}

export function UsingList({ userId, generationId, blueprint, send = sendUsingItem, onRemoved }: {
  userId: string | null | undefined
  generationId: string | null | undefined
  blueprint: { line_sources?: unknown } | null | undefined
  send?: SendUsing
  /** The new script and its trace after a Remove, for the page to show. */
  onRemoved?: (next: { script: unknown[]; line_sources: unknown }) => void
}) {
  const [never, setNever] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  if (!usingListVisible(userId) || !generationId) return null
  const items = usingItemsOf(blueprint)
  if (!items.length) return null
  const act = async (it: UsingItem, action: UsingAction) => {
    setBusy(`${it.key}:${action}`); setErr(null)
    const r = await send(generationId, it.ref, action)
    if (!r.ok) setErr("We couldn't save that — try again.")
    else if (action === 'never_use') setNever((n) => ({ ...n, [it.key]: true }))
    else if (Array.isArray(r.script)) onRemoved?.({ script: r.script, line_sources: r.line_sources ?? [] })
    setBusy(null)
  }
  return (
    <section aria-label="What Twin used" data-testid="using-list" className="rounded-xl border border-white/10 bg-ink2/40 p-3 text-xs text-sand">
      <h3 className="font-semibold text-cream">Using</h3>
      <p className="mt-1 text-stone">What Twin used to write this script.</p>
      <ul className="mt-2 space-y-2">
        {items.map((it) => (
          <li key={it.key} className="flex items-start gap-2">
            <span className="shrink-0 rounded-full border border-white/12 px-2 py-0.5 text-[11px] text-stone" data-testid="using-tag">{it.tag}</span>
            <span className="flex-1 text-cream">{it.label}</span>
            <button type="button" disabled={busy !== null} onClick={() => void act(it, 'remove')} className="text-[11px] text-stone underline">Remove</button>
            {it.blockable && (never[it.key]
              ? <span className="text-stone">Twin won't use this again</span>
              : <button type="button" disabled={busy !== null} onClick={() => void act(it, 'never_use')} className="text-[11px] text-stone underline">Never use</button>)}
          </li>
        ))}
      </ul>
      {err ? <p role="alert" className="mt-2 text-amber">{err}</p> : null}
    </section>
  )
}
