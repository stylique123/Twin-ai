// THE REALISTIC PANEL MODE, PANEL SIDE (plan v6.8 §34): `COST_MODE=full`.
//
// panelRun.mjs (the fictional panel; every account is a seeded TEST account)
// calls `realisticPlan` before the run and `realisticBody` per request. The
// rules live in packages/shared/src/script/realisticPanel.ts; this file only
// applies them to the panel fixtures and prints COUNTS AND DOLLARS ONLY.
//
// ⚖️ BEFORE THE RUN: the per-panel Apify + AI budget is printed, and the run is
// REFUSED when it passes PANEL_BUDGET_USD (or AI_PAUSED is set and the plan
// needs live calls). AFTER: Apify and Gemini dollars by caller and model.
//
// ⚖️ OFFLINE NOW: product pages come only from saved snapshots (none are
// committed here; Audit Set v2 owns them), the pain map is the FICTIONAL one.
import { readFileSync } from 'node:fs'
import {
  resolveCostMode, planProductPageRead, usablePainMap, estimatePanelBudget, budgetGate,
  costByCallerAndModel, ExtrasLedger, EXTRAS, redditScanV2Allowed,
} from '../../packages/shared/src/script/realisticPanel.ts'

const PAIN = new URL('./fixtures/fictional-pain-map.json', import.meta.url)
const PERSONAS_PER_SCRIPT = 3

/** Flags per extra from the env: REALISTIC_<EXTRA>=off turns one extra off. */
export function extraFlagsFromEnv(env = process.env) {
  return Object.fromEntries(EXTRAS.map((e) => [e, env[`REALISTIC_${e.toUpperCase()}`]]))
}

/**
 * The plan for one panel run. `list` is panelScenarios' output, every one a
 * fictional TEST account (account kind 'panel'); `fixture` the panel fixture.
 */
export function realisticPlan({ fixture, list, env = process.env, today = new Date().toISOString().slice(0, 10) }) {
  const decision = resolveCostMode({ account: 'panel', requested: env.COST_MODE, flags: extraFlagsFromEnv(env) })
  const offline = !!env.AI_PAUSED || env.REALISTIC_OFFLINE !== 'off'
  const snapshots = new Set(String(env.REALISTIC_SNAPSHOT_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  const creators = new Map((fixture.creators ?? []).map((c) => [c.key, c]))
  const painDoc = JSON.parse(readFileSync(PAIN, 'utf8'))
  const painByCreator = new Map()
  const pages = { planned: 0, refused: {} }
  for (const sc of list) {
    const c = creators.get(sc.creator)
    if (!painByCreator.has(sc.creator)) {
      const niche = String(c?.voice?.niche ?? '')
      const map = (painDoc.maps ?? []).find((m) => m.niche === niche) ?? null
      painByCreator.set(sc.creator, usablePainMap(map, { decision, today, niche }))
    }
    const product = sc.product ? (c?.products ?? []).find((p) => p.key === sc.product) : null
    if (product?.url) {
      const p = planProductPageRead({ decision, url: product.url, offline, hasSnapshot: snapshots.has(product.url) })
      if (p.read) pages.planned++
      else pages.refused[p.reason] = (pages.refused[p.reason] ?? 0) + 1
    }
  }
  const budget = estimatePanelBudget({ decision, requests: list.length, pageReads: pages.planned, personas: decision.extras.personas ? PERSONAS_PER_SCRIPT : 0 })
  const gate = budgetGate(budget, env.PANEL_BUDGET_USD ?? 2.5)
  const scanV2 = redditScanV2Allowed({ account: 'panel', ownerFlag: env.REDDIT_SCAN_V2 })
  return { decision, offline, budget, gate, pages, painByCreator, scanV2, ledger: new ExtrasLedger(decision) }
}

/** Counts-only summary printed before the run. */
export function planSummary(plan) {
  const pain = [...plan.painByCreator.values()]
  return {
    cost_mode: plan.decision.mode,
    extras: plan.decision.extras,
    offline: plan.offline,
    budget: plan.budget,
    budget_gate: plan.gate.reason,
    product_pages: plan.pages,
    pain_map: { creators_with_map: pain.filter((p) => p.entries.length).length, entries: pain.reduce((a, p) => a + p.entries.length, 0), rejected: pain.reduce((a, p) => a + p.rejected, 0), fictional: pain.every((p) => !p.entries.length || p.fictional) },
    reddit_scan_v2: plan.scanV2.reason,
  }
}

/** The extra body fields for one request (empty unless `full`). */
export function realisticBody(plan, sc) {
  if (!plan.decision.applies || plan.decision.mode !== 'full') return {}
  const out = { cost_mode: 'full' }
  const pain = plan.painByCreator.get(sc.creator)
  if (pain?.entries.length && plan.ledger.charge('pain_map', 0)) out.panel_pain_map = { fictional: pain.fictional, entries: pain.entries }
  return out
}

/** Apify and Gemini dollars by caller and model (labels and numbers only). */
export async function realisticCostReport(admin, generationIds, sinceIso) {
  const rows = []
  if (generationIds.length) {
    const { data } = await admin.from('ai_cost_by_stage_script').select('stage, model, est_usd').in('generation_id', generationIds)
    for (const r of data ?? []) rows.push({ provider: 'gemini', caller: r.stage, model: r.model, usd: r.est_usd })
  }
  // #1320's ledger (0294). Absent until that migration is applied by hand: then nothing is listed.
  const ap = await admin.from('apify_spend_ledger').select('feature, actor, reserved_usd').gte('created_at', sinceIso).then((r) => r, () => ({ data: null }))
  for (const r of ap?.data ?? []) rows.push({ provider: 'apify', caller: r.feature, model: r.actor, usd: r.reserved_usd })
  return costByCallerAndModel(rows)
}
