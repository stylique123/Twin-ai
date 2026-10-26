// W12.2 — CREATOR TYPE, WITH THE PER-TYPE WRITING RULES AS DATA.
//
// Spec source: docs/research/niche-scripts-2026-10-01.md §4.3 (A, B, D). The
// per-type hook families, beat shapes and rules live in creatorTypeRules.json,
// not in code branches. This module only loads and checks that file.
//
// Behind CREATOR_TYPE_RULES, default OFF: with the flag off `rulesForCreator`
// returns null and callers keep today's one-size behaviour. Nothing reads it yet.
import raw from './creatorTypeRules.json'

export const CREATOR_TYPES = ['coach', 'maker', 'local_business', 'educator', 'community', 'entertainer'] as const
export type CreatorType = (typeof CREATOR_TYPES)[number]

export const CTA_DEFAULTS = ['soft_offer', 'where_to_buy', 'visit_or_book', 'invite_replies', 'none'] as const
export type CtaDefault = (typeof CTA_DEFAULTS)[number]

export interface CreatorTypeRule {
  label: string
  hook_families: string[]
  beat_shape: string[]
  rules: string[]
  cta_default: CtaDefault
}

export interface CreatorTypeRuleSet {
  version: 1
  types: Record<CreatorType, CreatorTypeRule>
}

export function isCreatorType(v: unknown): v is CreatorType {
  return typeof v === 'string' && (CREATOR_TYPES as readonly string[]).includes(v)
}

const nonEmptyStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string' && s.trim().length > 0)

/** Schema check. Returns every problem found; an empty list means valid. */
export function validateCreatorTypeRules(input: unknown): string[] {
  const errs: string[] = []
  if (!input || typeof input !== 'object') return ['rules: not an object']
  const o = input as Record<string, unknown>
  if (o.version !== 1) errs.push('version: must be 1')
  const types = o.types
  if (!types || typeof types !== 'object') return [...errs, 'types: missing']
  const t = types as Record<string, unknown>
  for (const k of Object.keys(t)) if (!isCreatorType(k)) errs.push(`types.${k}: unknown creator type`)
  for (const k of CREATOR_TYPES) {
    const r = t[k] as Record<string, unknown> | undefined
    if (!r || typeof r !== 'object') { errs.push(`types.${k}: missing`); continue }
    if (typeof r.label !== 'string' || !r.label.trim()) errs.push(`types.${k}.label: required`)
    for (const f of ['hook_families', 'beat_shape', 'rules'] as const) {
      if (!nonEmptyStrings(r[f])) errs.push(`types.${k}.${f}: non-empty string list required`)
    }
    if (nonEmptyStrings(r.hook_families) && new Set(r.hook_families).size !== r.hook_families.length) {
      errs.push(`types.${k}.hook_families: duplicates`)
    }
    if (!(CTA_DEFAULTS as readonly unknown[]).includes(r.cta_default)) errs.push(`types.${k}.cta_default: invalid`)
  }
  return errs
}

/** Loads and checks a rule set; throws with every problem listed when invalid. */
export function loadCreatorTypeRules(input: unknown = raw): CreatorTypeRuleSet {
  const errs = validateCreatorTypeRules(input)
  if (errs.length) throw new Error(`creator type rules invalid: ${errs.join('; ')}`)
  return input as CreatorTypeRuleSet
}

/** Flag, default OFF. Only the exact value 'on' enables it. */
export function creatorTypeRulesEnabled(env: Record<string, string | undefined> | undefined): boolean {
  return env?.CREATOR_TYPE_RULES === 'on'
}

/**
 * The rules for a creator's stored type, or null when the flag is off, the type
 * is absent or unknown. Null means "keep today's behaviour".
 */
export function rulesForCreator(
  creatorType: unknown,
  env: Record<string, string | undefined> | undefined,
  rules: CreatorTypeRuleSet = loadCreatorTypeRules(),
): CreatorTypeRule | null {
  if (!creatorTypeRulesEnabled(env) || !isCreatorType(creatorType)) return null
  return rules.types[creatorType]
}
