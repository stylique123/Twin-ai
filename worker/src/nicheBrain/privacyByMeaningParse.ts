// PRIVATE BY MEANING, NOT BY WORD LIST (owner, 2026-10-04).
//
// ⚠️ The word list (0273, 0278) is a backstop: each gap was found after a
// leak ("permits" was added after the permitting story reached a script;
// "zoning", "landlord", "diagnosis" would each leak next). A model reads each
// fact and decides whether it is a private matter a creator would not expect
// on camera unless she chose it. It can only ever mark a fact private; it
// never un-marks what the word list or she marked.

export const PRIVATE_CATEGORIES = [
  'health', 'money_hardship', 'legal_or_regulatory', 'family_or_relationships', 'housing_or_landlord',
  'identity_or_location', 'workplace_conflict', 'none',
] as const
export type PrivateCategory = (typeof PRIVATE_CATEGORIES)[number]

export const PRIVACY_SYSTEM = [
  'You decide, for each fact about a content creator, whether it is a PRIVATE matter: something she would not expect a script to say on camera unless she chose it.',
  'Private: health and bodies (illness, diagnosis, pregnancy, mental health, medication); money hardship (debt, bank balance, being broke, unpaid bills); legal or regulatory trouble or process (permits, zoning, licences, inspections, fines, lawsuits, police, courts); family and relationships (children, partners, exes, divorce, deaths); housing (landlords, eviction, home address); identity details (where she lives exactly, immigration status); conflicts at work.',
  'NOT private: her craft, her products, prices she advertises, her business milestones, opinions, public achievements, her niche topics.',
  'When unsure, choose private: a wrongly private fact can be turned on by her; a wrongly public one ends up on camera.',
  'Return one row per id.',
].join('\n')

export const PRIVACY_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: { id: { type: 'string' }, private: { type: 'boolean' }, category: { type: 'string', enum: [...PRIVATE_CATEGORIES] } },
    required: ['id', 'private', 'category'],
  },
}

export interface PrivacyVerdict { id: string; private: boolean; category: PrivateCategory }

/** Well-formed verdicts only; an unknown category with private=true stays private. */
export function cleanPrivacy(raw: unknown, ids: readonly string[]): Map<string, PrivacyVerdict> {
  const out = new Map<string, PrivacyVerdict>()
  const want = new Set(ids)
  for (const x of Array.isArray(raw) ? raw as Array<Record<string, unknown>> : []) {
    const id = String(x?.id ?? '')
    if (!want.has(id) || typeof x?.private !== 'boolean') continue
    const cat = (PRIVATE_CATEGORIES as readonly string[]).includes(String(x.category)) ? x.category as PrivateCategory : (x.private ? 'none' : 'none')
    out.set(id, { id, private: x.private, category: cat })
  }
  return out
}

/** The prompt rows, fenced as data. */
export function privacyPrompt(rows: ReadonlyArray<{ id: string; text: string; evidence?: string | null }>): string {
  const body = rows.map((r) => `id: ${r.id}\nfact: ${r.text}${r.evidence ? `\nher words: ${r.evidence.slice(0, 300)}` : ''}`).join('\n\n')
    .split('<<<UNTRUSTED_DATA').join('').split('END_UNTRUSTED_DATA>>>').join('')
  return `<<<UNTRUSTED_DATA facts\n${body}\nEND_UNTRUSTED_DATA>>>`
}
