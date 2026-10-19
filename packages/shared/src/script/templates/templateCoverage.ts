// TEMPLATE COVERAGE HARNESS (Twin plan v5.1 item I; trial tooling only).
//
// Deterministic: no I/O, no clock (the caller passes `now`), no model call.
// It replays the edge's template choice (chooseTemplates, then duration from
// material and fitProfile, as in generate-blueprint) over the FICTIONAL panel
// fixture and reports, for each of T1–T13, which fixture request and duration
// reaches it, and which templates the fixture never reaches.
//
// ⚖️ DATED SLOTS FILL ONLY FROM VERIFIED DATED ITEMS. A fixture `outside` item
// reaches the ledger only when it is marked `verified: true`; every dated slot
// a chosen plan fills is re-checked (origin is outside moment/research or live
// urgency, and the item's own text carries a day-level date). A violation is
// reported, never silently counted as coverage.

import { buildLedger, type LedgerItem } from '../inventionGate.js'
import { hasEventDate } from '../writerGuards.js'
import { SCRIPT_TEMPLATES, type DurationProfile } from './templateData.js'
import { chooseTemplates } from './scriptTemplates.js'
import { chooseDuration, countsFromLedger, fitProfile } from './durationFromMaterial.js'

export const TEMPLATE_COVERAGE_VERSION = 'template-coverage-v1'

export interface FixtureFact { field?: string; value?: string; expires_at?: string; source?: string; trust?: string }
export interface FixtureProduct { key: string; name?: string; offer?: string; facts?: FixtureFact[] }
export interface FixtureCreator {
  key: string
  stories?: Array<{ kind?: string; text?: string }>
  answers?: Record<string, string>
  products?: FixtureProduct[]
}
export interface FixtureOutside { kind?: string; text?: string; verified?: boolean }
export interface FixtureRequest {
  id: string; creator: string; goal: string; note: string; product?: string; profile?: string; template?: string
  /** The idea angle kind (ideaQuestions ANGLE_KINDS) the request was made from, when it names one. */
  angle?: string | null
  outside?: FixtureOutside[]
}
export interface PanelFixture { creators: FixtureCreator[]; requests: FixtureRequest[] }

const PROFILES: readonly DurationProfile[] = ['sprint', 'standard', 'deep']
const DAY = 86_400_000

/** 't5_timely_hook' → 'T5'. */
export const shortTemplateId = (id: string): string => {
  const m = /^t(\d+)_/.exec(id)
  return m ? `T${m[1]}` : id
}

/** 'LIVE_PLUS_<n>_DAYS' resolves against `now` (as seedFictionalPanel.mjs does). */
function resolveExpiry(v: unknown, now: number): string {
  const m = /^LIVE_PLUS_(\d+)_DAYS$/.exec(String(v ?? ''))
  return m ? new Date(now + Number(m[1]) * DAY).toISOString() : String(v ?? '')
}

/** The ledger the edge would build for one fixture request. Unverified outside items never enter. */
export function fixtureLedger(fx: PanelFixture, r: FixtureRequest, now: number): { ledger: LedgerItem[]; target: string | null } {
  const c = fx.creators.find((x) => x.key === r.creator)
  if (!c) throw new Error(`coverage: unknown creator ${r.creator}`)
  const target = r.product ? `${c.key}:${r.product}` : null
  const product = r.product ? (c.products ?? []).find((p) => p.key === r.product) : null
  const ledger = buildLedger({
    knowledge: (c.stories ?? []).map((s, n) => ({ id: `${c.key}:story:${n}`, kind: s.kind, text: s.text })),
    answers: { ...(c.answers ?? {}) },
    note: r.note,
    products: (c.products ?? []).map((p) => ({
      id: `${c.key}:${p.key}`, name: p.name, offer: p.offer,
      knowledge: (p.facts ?? []).map((f) => ({ ...f, expires_at: resolveExpiry(f.expires_at, now) })),
    })),
    targetProductId: target,
    offer: product?.offer ?? '',
    outside: (r.outside ?? []).filter((o) => o.verified === true).map((o, n) => ({ id: `${r.id}:outside:${n}`, kind: o.kind, text: o.text })),
    now,
  })
  return { ledger, target }
}

/** Is this ledger item a verified dated item (what a `dated` slot may hold)? */
export const isVerifiedDated = (it: LedgerItem): boolean =>
  (it.origin === 'urgency' ? it.live : it.origin === 'outside_moment' || it.origin === 'outside_research') && hasEventDate(it.text)

export interface CoverageHit { request: string; requested: DurationProfile; profile: DurationProfile }
export interface CoverageReport {
  version: string
  /** T1..T13 → the (request, requested duration) pairs that reach it. */
  reached: Record<string, CoverageHit[]>
  /** Templates no fixture request reaches at any duration. */
  unreached: string[]
  /** Requests whose intended `template` is never chosen at its own profile. */
  missed_intended: Array<{ request: string; intended: string; got: string }>
  /** Dated slots filled from something other than a verified dated item (must be empty). */
  dated_violations: Array<{ request: string; template: string; slot: string; item_id: string | null }>
}

/** The template the edge would use for one request at one requested duration, or null. */
export function chooseForRequest(fx: PanelFixture, r: FixtureRequest, requested: DurationProfile, now: number, rank: 'v1' | 'v2' = 'v2') {
  const { ledger, target } = fixtureLedger(fx, r, now)
  const choices = chooseTemplates({ goal: r.goal, angle: r.angle ?? null, ledger, targetProductId: target, rank })
  const duration = chooseDuration(requested, countsFromLedger(ledger, target))
  const fit = choices.map((p) => ({ p, prof: fitProfile(p.template.duration_profiles, duration.chosen) })).find((x) => x.prof !== null)
  return { plan: fit?.p ?? null, profile: fit?.prof ?? null, ledger }
}

export function templateCoverage(fx: PanelFixture, now: number, requests: readonly FixtureRequest[] = fx.requests, rank: 'v1' | 'v2' = 'v2'): CoverageReport {
  const reached: Record<string, CoverageHit[]> = Object.fromEntries(SCRIPT_TEMPLATES.map((t) => [shortTemplateId(t.id), []]))
  const missed: CoverageReport['missed_intended'] = []
  const violations: CoverageReport['dated_violations'] = []
  for (const r of requests) {
    for (const requested of PROFILES) {
      const { plan, profile, ledger } = chooseForRequest(fx, r, requested, now, rank)
      if (requested === r.profile && r.template) {
        const got = plan ? shortTemplateId(plan.template.id) : 'none'
        if (got !== r.template) missed.push({ request: r.id, intended: r.template, got })
      }
      if (!plan || !profile) continue
      const byId = new Map(ledger.map((it) => [it.id, it]))
      for (const s of plan.slots) {
        const slotDef = plan.template.beats[s.beat]?.slots.find((x) => x.name === s.slot)
        if (slotDef?.evidence !== 'dated') continue
        const it = s.item_id ? byId.get(s.item_id) : undefined
        if (!it || !isVerifiedDated(it)) violations.push({ request: r.id, template: plan.template.id, slot: s.slot, item_id: s.item_id })
      }
      reached[shortTemplateId(plan.template.id)]!.push({ request: r.id, requested, profile })
    }
  }
  return {
    version: TEMPLATE_COVERAGE_VERSION,
    reached,
    unreached: Object.entries(reached).filter(([, h]) => h.length === 0).map(([k]) => k),
    missed_intended: missed,
    dated_violations: violations,
  }
}
