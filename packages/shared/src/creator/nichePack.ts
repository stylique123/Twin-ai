// NICHE PACK — a typed, data-only bundle of niche knowledge: angles, a question
// bank, vocabulary, banned claims and example hooks. Packs are JSON files under
// creator/fixtures/nichePacks (fictional only). Nothing reads packs at runtime
// yet; any future reader goes behind NICHE_PACKS (default OFF).
import { CREATOR_TYPES, isCreatorType, type CreatorType } from './creatorTypeRules'

export interface NicheAngle { id: string; title: string; why: string }
export interface NicheQuestion { id: string; question: string; angle_id?: string }
export interface NicheBannedClaim { pattern: string; reason: string }
export interface NicheExampleHook { text: string; hook_family: string; fictional: true }

export interface NichePack {
  schema_version: 1
  id: string
  niche: string
  creator_types: CreatorType[]
  fictional: true
  angles: NicheAngle[]
  question_bank: NicheQuestion[]
  vocabulary: { use: string[]; avoid: string[] }
  banned_claims: NicheBannedClaim[]
  example_hooks: NicheExampleHook[]
}

const str = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const arr = (v: unknown): v is unknown[] => Array.isArray(v)

export function validateNichePack(input: unknown): string[] {
  const e: string[] = []
  if (!input || typeof input !== 'object') return ['pack: not an object']
  const p = input as Record<string, unknown>
  if (p.schema_version !== 1) e.push('schema_version: must be 1')
  if (!str(p.id) || !/^[a-z0-9-]+$/.test(p.id)) e.push('id: lowercase slug required')
  if (!str(p.niche)) e.push('niche: required')
  if (p.fictional !== true) e.push('fictional: must be true (no real creator material)')
  if (!arr(p.creator_types) || !p.creator_types.length || !p.creator_types.every(isCreatorType)) {
    e.push(`creator_types: non-empty list of ${CREATOR_TYPES.join('|')}`)
  }
  const angleIds = new Set<string>()
  if (!arr(p.angles) || !p.angles.length) e.push('angles: non-empty list required')
  else p.angles.forEach((a, i) => {
    const x = a as Record<string, unknown>
    if (!str(x?.id) || !str(x.title) || !str(x.why)) e.push(`angles[${i}]: id, title, why required`)
    else if (angleIds.has(x.id)) e.push(`angles[${i}]: duplicate id ${x.id}`)
    else angleIds.add(x.id)
  })
  const qIds = new Set<string>()
  if (!arr(p.question_bank) || !p.question_bank.length) e.push('question_bank: non-empty list required')
  else p.question_bank.forEach((q, i) => {
    const x = q as Record<string, unknown>
    if (!str(x?.id) || !str(x.question)) { e.push(`question_bank[${i}]: id, question required`); return }
    if (qIds.has(x.id)) e.push(`question_bank[${i}]: duplicate id ${x.id}`)
    qIds.add(x.id)
    if (x.angle_id !== undefined && !angleIds.has(x.angle_id as string)) e.push(`question_bank[${i}]: unknown angle_id`)
  })
  const v = p.vocabulary as Record<string, unknown> | undefined
  if (!v || !arr(v.use) || !arr(v.avoid) || !v.use.every(str) || !v.avoid.every(str)) {
    e.push('vocabulary: { use: string[], avoid: string[] } required')
  } else {
    const avoid = new Set(v.avoid.map((s) => (s as string).toLowerCase()))
    for (const w of v.use) if (avoid.has((w as string).toLowerCase())) e.push(`vocabulary: "${w}" in both use and avoid`)
  }
  const banned: RegExp[] = []
  if (!arr(p.banned_claims)) e.push('banned_claims: list required')
  else p.banned_claims.forEach((b, i) => {
    const x = b as Record<string, unknown>
    if (!str(x?.pattern) || !str(x.reason)) { e.push(`banned_claims[${i}]: pattern, reason required`); return }
    try { banned.push(new RegExp(x.pattern, 'i')) } catch { e.push(`banned_claims[${i}]: invalid regex`) }
  })
  if (!arr(p.example_hooks) || !p.example_hooks.length) e.push('example_hooks: non-empty list required')
  else p.example_hooks.forEach((h, i) => {
    const x = h as Record<string, unknown>
    if (!str(x?.text) || !str(x.hook_family) || x.fictional !== true) {
      e.push(`example_hooks[${i}]: text, hook_family, fictional:true required`); return
    }
    if (banned.some((r) => r.test(x.text as string))) e.push(`example_hooks[${i}]: matches a banned claim`)
  })
  return e
}

export function loadNichePack(input: unknown): NichePack {
  const errs = validateNichePack(input)
  if (errs.length) throw new Error(`niche pack invalid: ${errs.join('; ')}`)
  return input as NichePack
}

/** Banned claims a line trips, by reason. Empty means none. */
export function bannedClaimsIn(pack: NichePack, line: string): string[] {
  return pack.banned_claims.filter((b) => new RegExp(b.pattern, 'i').test(line)).map((b) => b.reason)
}

export function nichePacksEnabled(env: Record<string, string | undefined> | undefined): boolean {
  return env?.NICHE_PACKS === 'on'
}
