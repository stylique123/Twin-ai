// OFFLINE QC ACCEPTANCE REPLAY (plan v6.8 §33). Runs the Quality Controller as
// the LAST stage over the stored, FICTIONAL panel 10/11/12 scripts with each
// request's ledger rebuilt from the committed fixture creators
// (scripts/ops/fixtures/fictional-panel.json; request n = requests[n]).
// No model, no network, no database. Output: ids and counts only.
import { buildLedger, type LedgerItem } from './inventionGate'
import { scoreCraft, blockingFlags, type BestOfNFlagCtx } from './craftJudge'
import { placeholderTokens } from '../spokenPlaceholders'
import { repeatCount, median, type ReplayCase } from './replayGuard'
import { runQualityController, qcProfileForSeconds, type QcReport } from './planner/qualityController'

export interface FixtureCreator {
  key: string
  voice?: { niche?: string; sub_niche?: string }
  stories?: Array<{ kind?: string; text?: string }>
  products?: Array<{ key: string; name?: string; offer?: string; facts?: Array<{ field?: string; value?: string }> }>
}
export interface FixtureRequest { id?: string; creator: string; note?: string; product?: string | null; goal?: string }
export interface QcReplayCase extends ReplayCase { creator: string; arm?: string | null }

export interface QcItem {
  batch: string
  n: number
  id: string
  arm: string | null
  words_before: number
  words_after: number
  judge_before: number
  judge_after: number
  placeholders: number
  repeats_before: number
  repeats_after: number
  flags_before: number
  flags_after: number
  report: QcReport
}

/** The request's ledger and context, rebuilt from the fixture (ids are stable fixture keys). */
export function caseContext(c: QcReplayCase, creators: readonly FixtureCreator[], requests: readonly FixtureRequest[]) {
  const req = requests[c.n]
  const cr = creators.find((x) => x.key === c.creator)
  if (!req || !cr || req.creator !== c.creator) throw new Error(`qc replay: ${c.batch} n=${c.n} does not match the fixture`)
  const target = req.product ?? null
  const prod = (cr.products ?? []).find((p) => p.key === target) ?? null
  const ledger: LedgerItem[] = buildLedger({
    knowledge: (cr.stories ?? []).map((s, i) => ({ id: `${cr.key}:s${i}`, kind: s.kind, text: s.text })),
    note: req.note ?? '',
    products: (cr.products ?? []).map((p) => ({ id: p.key, name: p.name, offer: p.offer, knowledge: (p.facts ?? []).map((f, i) => ({ id: `${p.key}:f${i}`, field: f.field, value: f.value })) })),
    targetProductId: target,
    offer: prod?.offer ?? '',
  })
  const flagCtx: BestOfNFlagCtx = { items: ledger, products: (cr.products ?? []).map((p) => ({ id: p.key, name: String(p.name ?? '') })), v2: true, wrongProduct: true }
  return { req, cr, target, prod, ledger, flagCtx, niche: [cr.voice?.niche, cr.voice?.sub_niche].filter(Boolean).join(' ') }
}

const linesOf = (s: ReadonlyArray<{ line?: unknown }>) => s.map((b) => (typeof b?.line === 'string' ? b.line.trim() : '')).filter(Boolean)
const words = (ls: readonly string[]) => ls.reduce((a, l) => a + l.split(/\s+/).filter(Boolean).length, 0)
const r2 = (x: number) => Math.round(x * 100) / 100

export function qcReplayCase(c: QcReplayCase, creators: readonly FixtureCreator[], requests: readonly FixtureRequest[]): QcItem {
  const x = caseContext(c, creators, requests)
  const before = linesOf(c.script)
  const out = runQualityController({
    script: c.script, ledger: x.ledger, targetProductId: x.target, profile: qcProfileForSeconds(c.target_seconds),
    topic: [x.req.note ?? '', x.prod?.name ?? ''].join(' ').trim(), angle: '', goal: c.goal ?? x.req.goal ?? '', niche: x.niche, product: x.prod?.name ?? '', flagCtx: x.flagCtx,
  })
  const after = linesOf(out.script)
  const hooks = (c.hook_options ?? []).filter((h) => typeof h === 'string')
  return {
    batch: c.batch, n: c.n, id: x.req.id ?? `n${c.n}`, arm: c.arm ?? null,
    words_before: words(before), words_after: words(after),
    judge_before: r2(before.length ? scoreCraft(before).raw : 0), judge_after: r2(after.length ? scoreCraft(after).raw : 0),
    placeholders: [...after, ...hooks].reduce((a, t) => a + placeholderTokens(t).length, 0),
    repeats_before: repeatCount(c.script), repeats_after: repeatCount(out.script),
    flags_before: blockingFlags(before, x.flagCtx).length, flags_after: blockingFlags(after, x.flagCtx).length,
    report: out.report,
  }
}

export interface QcPanelMetrics {
  cases: number
  median_words_before: number
  median_words_after: number
  judge_mean_before: number
  judge_mean_after: number
  placeholders: number
  repeats_before: number
  repeats_after: number
  flags_before: number
  flags_after: number
  extended: number
  asked: number
  short_sprint: number
  under_floor_after: number
}

export function qcMetrics(items: readonly QcItem[]): QcPanelMetrics {
  const mean = (xs: number[]) => (xs.length ? r2(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)
  const sum = (f: (i: QcItem) => number) => items.reduce((a, i) => a + f(i), 0)
  return {
    cases: items.length,
    median_words_before: median(items.map((i) => i.words_before)),
    median_words_after: median(items.map((i) => i.words_after)),
    judge_mean_before: mean(items.map((i) => i.judge_before)),
    judge_mean_after: mean(items.map((i) => i.judge_after)),
    placeholders: sum((i) => i.placeholders),
    repeats_before: sum((i) => i.repeats_before), repeats_after: sum((i) => i.repeats_after),
    flags_before: sum((i) => i.flags_before), flags_after: sum((i) => i.flags_after),
    extended: items.filter((i) => i.report.added.length > 0).length,
    asked: items.filter((i) => i.report.thin === 'asked').length,
    short_sprint: items.filter((i) => i.report.thin === 'short_sprint').length,
    under_floor_after: items.filter((i) => i.report.under_floor_after).length,
  }
}

export function qcReplayAll(cases: readonly QcReplayCase[], creators: readonly FixtureCreator[], requests: readonly FixtureRequest[]) {
  const items = cases.map((c) => qcReplayCase(c, creators, requests))
  const panels: Record<string, QcPanelMetrics> = {}
  for (const b of [...new Set(items.map((i) => i.batch))].sort()) panels[b] = qcMetrics(items.filter((i) => i.batch === b))
  return { items, panels, all: qcMetrics(items) }
}

/** Free-judge mean of each panel after QC vs the P10 baseline (stored P10 scripts) on the SAME requests (n). */
export function judgeVsP10(items: readonly QcItem[]): Record<string, { cases: number; p10_baseline: number; before: number; after: number }> {
  const p10 = new Map(items.filter((i) => i.batch === 'panel-current-10').map((i) => [i.n, i.judge_before]))
  const mean = (xs: number[]) => (xs.length ? r2(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)
  const out: Record<string, { cases: number; p10_baseline: number; before: number; after: number }> = {}
  for (const b of [...new Set(items.map((i) => i.batch))].sort()) {
    const its = items.filter((i) => i.batch === b && p10.has(i.n))
    out[b] = { cases: its.length, p10_baseline: mean(its.map((i) => p10.get(i.n)!)), before: mean(its.map((i) => i.judge_before)), after: mean(its.map((i) => i.judge_after)) }
  }
  return out
}

/** Acceptance (§33): median >= 90, each panel's judge not below the P10 baseline on the same requests,
 *  0 placeholders and repeats, blocking flags (invented / wrong-product proxies) not worse. */
export function qcAcceptance(all: QcPanelMetrics, vsP10: ReturnType<typeof judgeVsP10>): string[] {
  const v: string[] = []
  if (all.median_words_after < 90) v.push(`median words ${all.median_words_after} < 90`)
  for (const [b, j] of Object.entries(vsP10)) if (j.after < j.p10_baseline) v.push(`${b}: judge ${j.after} < P10 baseline ${j.p10_baseline} (same ${j.cases} requests)`)
  if (all.placeholders > 0) v.push(`placeholders ${all.placeholders} > 0`)
  if (all.repeats_after > 0) v.push(`repeats ${all.repeats_after} > 0`)
  if (all.flags_after > all.flags_before) v.push(`blocking flags ${all.flags_after} > baseline ${all.flags_before}`)
  return v
}

/** The replay guard's QC-stage invariants, per panel (scripts/ci/check_replay_guard.mjs). */
export function qcGuardViolations(panels: Record<string, QcPanelMetrics>): string[] {
  const v: string[] = []
  for (const [p, m] of Object.entries(panels)) {
    if (m.placeholders > 0) v.push(`${p}: QC placeholders ${m.placeholders} > 0`)
    if (m.repeats_after > 0) v.push(`${p}: QC repeats ${m.repeats_after} > 0`)
    if (m.flags_after > m.flags_before) v.push(`${p}: QC blocking flags ${m.flags_after} > stored ${m.flags_before}`)
    if (m.median_words_after < m.median_words_before && m.median_words_after < 90) v.push(`${p}: QC median words ${m.median_words_after} < stored ${m.median_words_before} and < 90`)
  }
  return v
}
