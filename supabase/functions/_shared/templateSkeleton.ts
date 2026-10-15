// GENERATED FROM packages/shared/src/script/templates/templateSkeleton.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
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

import { HOOK_MOVES } from './scriptFamily.ts'
import { DURATION_PROFILES, type DurationProfile } from './templateData.ts'
import type { TemplatePlan } from './scriptTemplates.ts'
import type { LedgerItem } from './inventionGate.ts'

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
    if (!text) continue
    out.push({ role: plan.template.beats[s.beat]?.role ?? 'build', text, item_id: s.item_id })
  }
  return out
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
  out.push(`Hook shapes (hook_moves): ${t.hook_shapes.map((id) => `${id} (${HOOK_MOVES[id]?.how ?? id})`).join('; ')}.`)
  return out.join('\n')
}
