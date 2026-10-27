// TEMPLATE SKELETON: the writer's template brief, filled by CODE (quality sprint).
//
// Owner 2026-10-13: writer attempts carrying the long template prose took ~50s
// (max 73s) against a 75s timeout. Here the beat skeleton is built from the
// plan `planTemplate` already filled: each slot line is the ledger item's own
// text, slots with nothing on file are left out (the question still reaches
// her through `plan.questions`), and the writer only POLISHES the wording.
//
// ⚖️ Pure, no I/O. Trial only (the edge calls it under `trialOn`). No line here
// is a placeholder or a bracket: an unfilled slot is simply absent.

import { HOOK_MOVES } from '../scriptFamily.js'
import { DURATION_PROFILES, type DurationProfile } from './templateData.js'
import type { TemplatePlan } from './scriptTemplates.js'
import { isScaffoldText, type LedgerItem } from '../inventionGate.js'

export const TEMPLATE_SKELETON_MODE = 'skeleton' as const

export interface SkeletonLine { role: string; text: string; item_id: string }

/** Slot lines in beat order, each the ledger item's own text (brackets/quotes flattened). */
export function skeletonLines(plan: TemplatePlan, ledger: readonly LedgerItem[]): SkeletonLine[] {
  const byId = new Map(ledger.map((it) => [it.id, it]))
  const out: SkeletonLine[] = []
  for (const s of plan.slots) {
    if (!s.item_id || s.fill === 'asked' || s.fill === 'empty' || s.fill === 'skipped') continue
    const it = byId.get(s.item_id)
    const text = String(it?.text ?? '').replace(/[[\]{}<>]/g, '').replace(/"/g, "'").replace(/\s+/g, ' ').trim().slice(0, 200)
    if (!text || isScaffoldText(text)) continue
    // Another person's words stay theirs: never polished into her voice.
    const quoted = /testimonial|review|quote/i.test(it?.field ?? '')
    out.push({ role: plan.template.beats[s.beat]?.role ?? 'build', text: quoted ? `a customer's own words, quoted as theirs and only as written: '${text}'` : text, item_id: s.item_id })
  }
  return out
}

const ROLE_PURPOSE: Record<string, string> = {
  hook: 'stop the scroll', promise: 'why stay', build: 'one new piece', turn: 'the change',
  anchor: 'her proof', offer: 'confirmed facts', close: 'one CTA, last',
}

/** The short writer brief: a numbered skeleton to polish, the hook shapes, the budget, the count. */
export function renderTemplateSkeleton(plan: TemplatePlan, profile: DurationProfile, ledger: readonly LedgerItem[]): string {
  const t = plan.template
  const lines = skeletonLines(plan, ledger)
  const builds = lines.filter((l) => l.role === 'build').length
  const out = [
    `TEMPLATE ${t.id}, about ${DURATION_PROFILES[profile].words} words. Polish each line below into her voice, one script entry each, section = role. Keep every fact, add none, keep the order.`,
    ...lines.map((l, i) => `${i + 1}. ${l.role}: ${l.text}`),
  ]
  if (t.promise.kind === 'count' && builds > 0) out.push(`Hook promises exactly ${builds}; number the build lines out loud.`)
  // ⚖️ Plan v7.1 S2/S3: the skeleton named roles but not what each is FOR, and
  // none of the 13 templates had a re-hook. Each role used gets its purpose;
  // past Sprint, one re-hook line is asked for before the offer or close. It
  // re-uses a specific already in the lines above, so "add none" still holds.
  const used = [...new Set(lines.map((l) => l.role))]
  out.push(`Roles: ${used.map((r) => `${r} = ${ROLE_PURPOSE[r] ?? r}`).join('; ')}.`)
  const rehook = profile !== 'sprint' && lines.length >= 4 ? ' Before offer/close add ONE rehook line reusing a specific above, no new fact.' : ''
  out.push(`Each line pulls into the next.${rehook}`)
  out.push(`Hook shapes (hook_moves): ${t.hook_shapes.map((id) => `${id} (${HOOK_MOVES[id]?.how ?? id})`).join('; ')}.`)
  return out.join('\n')
}
