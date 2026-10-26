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
// ⚖️ OFFLINE NOW: product pages come only from SAVED FICTIONAL snapshots (the
// Audit Set v2 pages, `audit_snapshot` on a fixture product; only pages marked
// data-fictional are read), the pain map and the extras are FICTIONAL fixtures.
import { readFileSync, existsSync } from 'node:fs'
import {
  resolveCostMode, planProductPageRead, usablePainMap, estimatePanelBudget, budgetGate,
  costByCallerAndModel, ExtrasLedger, EXTRAS, redditScanV2Allowed, readFictionalSnapshot,
} from '../lib/realisticPanel.mjs'

const PAIN = new URL('./fixtures/fictional-pain-map.json', import.meta.url)
const EXTRAS_FILE = new URL('./fixtures/fictional-panel-extras.json', import.meta.url)
/** Where Audit Set v2 keeps its saved fictional pages (claude/creator-type-rules). */
export const SNAPSHOT_DIR = new URL('../../packages/shared/src/creator/fixtures/auditSetV2/', import.meta.url)
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
  const snapDir = env.REALISTIC_SNAPSHOT_DIR ? new URL(`file://${env.REALISTIC_SNAPSHOT_DIR.replace(/\/?$/, '/')}`) : SNAPSHOT_DIR
  const snapshotOf = (p) => (p?.audit_snapshot && /^[a-z0-9-]+$/.test(p.audit_snapshot) ? new URL(`${p.audit_snapshot}.html`, snapDir) : null)
  const extrasDoc = JSON.parse(readFileSync(EXTRAS_FILE, 'utf8'))
  const creators = new Map((fixture.creators ?? []).map((c) => [c.key, c]))
  const painDoc = JSON.parse(readFileSync(PAIN, 'utf8'))
  const painByCreator = new Map()
  const pages = { planned: 0, read: 0, refused: {}, facts: { speakable: 0, held_back: 0 }, by_field: {} }
  const seenPages = new Set()
  for (const sc of list) {
    const c = creators.get(sc.creator)
    if (!painByCreator.has(sc.creator)) {
      const niche = String(c?.voice?.niche ?? '')
      const map = (painDoc.maps ?? []).find((m) => m.niche === niche) ?? null
      painByCreator.set(sc.creator, usablePainMap(map, { decision, today, niche }))
    }
    const product = sc.product ? (c?.products ?? []).find((p) => p.key === sc.product) : null
    if (product?.product_url && !seenPages.has(product.product_url)) {
      seenPages.add(product.product_url)
      const file = snapshotOf(product)
      const p = planProductPageRead({ decision, url: product.product_url, offline, hasSnapshot: !!file && existsSync(file) })
      if (!p.read) { pages.refused[p.reason] = (pages.refused[p.reason] ?? 0) + 1; continue }
      pages.planned++
      if (p.source !== 'snapshot') continue // live reads go through #1320's guard at run time, never from here
      const r = readFictionalSnapshot(readFileSync(file, 'utf8'))
      if (!r.ok) { pages.refused[r.reason] = (pages.refused[r.reason] ?? 0) + 1; continue }
      pages.read++
      for (const f of r.facts) {
        pages.facts[f.speakable ? 'speakable' : 'held_back']++
        pages.by_field[f.field] = (pages.by_field[f.field] ?? 0) + 1
      }
    }
  }
  const budget = estimatePanelBudget({ decision, requests: list.length, pageReads: pages.planned, personas: decision.extras.personas ? PERSONAS_PER_SCRIPT : 0 })
  const gate = budgetGate(budget, env.PANEL_BUDGET_USD ?? 2.5)
  const scanV2 = redditScanV2Allowed({ account: 'panel', ownerFlag: env.REDDIT_SCAN_V2 })
  const extrasByCreator = new Map(Object.entries(extrasDoc.by_creator ?? {}))
  return { decision, offline, budget, gate, pages, painByCreator, extrasByCreator, scanV2, ledger: new ExtrasLedger(decision) }
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
  // The other extras, each only when its own flag is on (the edge re-checks and caps them).
  const ex = plan.extrasByCreator.get(sc.creator)
  if (ex) {
    const send = {}
    for (const k of ['outside_knowledge', 'audience_comments', 'niche_notes']) if (plan.decision.extras[k] && ex[k] && plan.ledger.charge(k, 0)) send[k] = ex[k]
    if (Object.keys(send).length) out.panel_extras = send
  }
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
