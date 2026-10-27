// GENERATED FROM packages/shared/src/creator/writerGuidance.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// WRITER GUIDANCE FROM DATA — creator type rules (W12.2) and niche packs.
//
// ⚠️ NO IMPORTS, ON PURPOSE. This file is mirrored into the edge
// (supabase/functions/_shared/writerGuidance.ts) by
// scripts/ci/generate_shared_pilot_core.mjs, so the writer and the tests run the
// same code. The data comes in as an argument: the rules JSON is mirrored as a
// generated TS module, and niche packs come from a registry.
//
// BOTH BLOCKS ARE OFF BY DEFAULT. Each returns '' unless its flag is exactly
// 'on' (CREATOR_TYPE_RULES, NICHE_PACKS), so with the flags off the writer
// prompt is byte-identical to before.

export const CREATOR_TYPE_VALUES = ['coach', 'maker', 'local_business', 'educator', 'community', 'entertainer'] as const
export type CreatorTypeValue = (typeof CREATOR_TYPE_VALUES)[number]

/**
 * Older names for a creator's type, found in fixtures and eval settings, mapped
 * onto the W12.2 types. Software sellers are product sellers in the research
 * families (docs/research/niche-scripts-2026-10-01.md §4.3 A), so they map to maker.
 */
export const LEGACY_CREATOR_TYPES: Readonly<Record<string, CreatorTypeValue>> = {
  physical_product: 'maker',
  product_seller: 'maker',
  product: 'maker',
  software: 'maker',
  digital_product: 'maker',
  service_coach: 'coach',
  coach_consultant: 'coach',
  coach_expert: 'coach',
  consultant: 'coach',
  local: 'local_business',
  local_service: 'local_business',
  teacher: 'educator',
  personal_brand: 'community',
}

/** A stored or legacy value as a W12.2 creator type; null when unknown. */
export function normalizeCreatorType(v: unknown): CreatorTypeValue | null {
  if (typeof v !== 'string') return null
  const k = v.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if ((CREATOR_TYPE_VALUES as readonly string[]).includes(k)) return k as CreatorTypeValue
  return LEGACY_CREATOR_TYPES[k] ?? null
}

interface RuleLike { label?: unknown; hook_families?: unknown; beat_shape?: unknown; rules?: unknown; cta_default?: unknown }
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && !!s.trim()) : [])

/**
 * The writer's per-type hook block. '' when the flag is off, the type is unknown,
 * or the rules for it are missing or malformed: the writer then keeps today's
 * one-size HOOKS section.
 */
export function creatorTypeHookBlock(creatorType: unknown, flag: string | undefined, rules: unknown): string {
  if (flag !== 'on') return ''
  const t = normalizeCreatorType(creatorType)
  const types = (rules as { types?: Record<string, RuleLike> } | null)?.types
  const r = t && types ? types[t] : undefined
  if (!r) return ''
  const fams = strList(r.hook_families), beats = strList(r.beat_shape), lines = strList(r.rules)
  if (!fams.length || !beats.length || typeof r.label !== 'string') return ''
  return [
    `CREATOR TYPE: ${r.label}. These rules come from her stated type; her own DNA hook patterns still come first.`,
    `- Draw the five hooks from at least ${Math.min(3, fams.length)} of these hook families: ${fams.join(', ')}.`,
    `- Beat shape: ${beats.join(' -> ')}.`,
    ...lines.map((l) => `- ${l}`),
    `- Default close: ${String(r.cta_default ?? 'none').replace(/_/g, ' ')}.`,
  ].join('\n')
}

interface PackLike {
  id?: unknown; niche?: unknown; fictional?: unknown; creator_types?: unknown
  angles?: Array<{ title?: unknown }>; vocabulary?: { use?: unknown; avoid?: unknown }
  banned_claims?: Array<{ pattern?: unknown; reason?: unknown }>
}

/**
 * Picks the niche pack for a creator: a non-fictional pack whose niche words all
 * appear in her niche and that lists her type. Fictional packs (fixtures) are
 * never picked unless `allowFictional`, which only tests pass.
 */
export function pickNichePack(packs: readonly unknown[], niche: unknown, creatorType: unknown, allowFictional = false): PackLike | null {
  if (typeof niche !== 'string' || !niche.trim()) return null
  const n = niche.toLowerCase()
  const t = normalizeCreatorType(creatorType)
  for (const raw of packs) {
    const p = raw as PackLike
    if (!p || typeof p.niche !== 'string') continue
    if (p.fictional === true && !allowFictional) continue
    const words = p.niche.toLowerCase().replace(/\(.*?\)/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 3)
    if (!words.length || !words.every((w) => n.includes(w))) continue
    if (t && Array.isArray(p.creator_types) && !p.creator_types.includes(t)) continue
    return p
  }
  return null
}

/** The writer's niche-pack block, '' when the flag is off or no pack fits. */
export function nichePackBlock(pack: PackLike | null, flag: string | undefined): string {
  if (flag !== 'on' || !pack) return ''
  const angles = (pack.angles ?? []).map((a) => a?.title).filter((s): s is string => typeof s === 'string')
  const use = strList(pack.vocabulary?.use), avoid = strList(pack.vocabulary?.avoid)
  const banned = (pack.banned_claims ?? []).map((b) => b?.reason).filter((s): s is string => typeof s === 'string')
  const out = [`NICHE PACK (${String(pack.niche)}): general niche knowledge, never her own facts.`]
  if (angles.length) out.push(`- Angles that work in this niche: ${angles.join(' | ')}`)
  if (use.length) out.push(`- Niche words to use: ${use.join(', ')}`)
  if (avoid.length) out.push(`- Words to avoid: ${avoid.join(', ')}`)
  if (banned.length) out.push(`- Never make these kinds of claim: ${[...new Set(banned)].join(', ')}`)
  return out.join('\n')
}

/** Lines that trip a pack's banned claims, for a post-write check. */
export function bannedClaimHits(pack: PackLike | null, lines: readonly string[]): Array<{ line: number; reason: string }> {
  if (!pack) return []
  const hits: Array<{ line: number; reason: string }> = []
  for (const b of pack.banned_claims ?? []) {
    if (typeof b?.pattern !== 'string') continue
    let re: RegExp
    try { re = new RegExp(b.pattern, 'i') } catch { continue }
    lines.forEach((l, i) => { if (re.test(l)) hits.push({ line: i, reason: String(b.reason ?? '') }) })
  }
  return hits
}
