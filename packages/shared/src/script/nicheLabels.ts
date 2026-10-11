// NICHE LABELS AFTER THE PRIVACY SCRUB (owner 13 Oct, W12.1 follow-up).
//
// The scrub on her voice profile can blank `niche` / `sub_niche` (a label that
// shares words with a private or switched-off fact is cut). Audit, 11 Oct: 6 of
// 50 accounts with a niche lost it and 3 of 49 their sub-niche. Two harms:
//   1. every niche-level lookup (research, moments, trends, Reddit, vocabulary)
//      ran with an empty key and returned nothing, with no error;
//   2. `vp.niche ?? dna.niche` does not fall back on "", so her onboarding niche
//      never rescued it and the writer saw a blank instead of "unspecified".
//
// ⚖️ TWO DIFFERENT USES, TWO DIFFERENT VALUES:
//   - LOOKUP: the unscrubbed label. It only selects niche-level rows and is never
//     put into a prompt or a log.
//   - PROMPT: the scrubbed label, falling back to the onboarding niche, then to
//     "unspecified". If the scrub blanked it because the label itself matches the
//     private-word list, the prompt gets the generic parent category instead.
// Pure; no I/O.

export interface NicheLabelInput {
  scrubbedVoice?: { niche?: unknown; sub_niche?: unknown } | null
  scrubbedDna?: { niche?: unknown; sub_niche?: unknown } | null
  rawVoice?: { niche?: unknown; sub_niche?: unknown } | null
  rawDna?: { niche?: unknown; sub_niche?: unknown } | null
  /** The niche-to-bucket mapper the caller already uses. */
  bucketOf: (niche: unknown) => string | null
  /** The private-word test (SENSITIVE). */
  isSensitive: (text: string) => boolean
}

export interface NicheLabels {
  promptNiche: string
  promptSubNiche: string
  lookupNiche: string
  lookupSubNiche: string
  /** The research/Reddit row key: lower-case, alphanumerics and spaces, 80 chars. */
  lookupKey: string
  lookupBucket: string | null
  /** True when the lookup used a label the scrub had blanked. Shape only, for counts. */
  lookupFromRaw: boolean
}

/** Generic parent category per bucket, used in prompt text when the label itself is private. */
export const PARENT_CATEGORY: Readonly<Record<string, string>> = {
  business: 'small business',
  tech: 'technology',
  beauty_fashion: 'beauty and fashion',
  food: 'food and drink',
  health: 'health and fitness',
  creator: 'content creation',
  entertainment: 'entertainment',
  making: 'making and crafts',
  education: 'education',
  mindset: 'personal growth',
  lifestyle: 'lifestyle',
  automotive: 'cars',
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const usable = (v: string) => v !== '' && v.toLowerCase() !== 'unspecified'

export function nicheKeyOf(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80)
}

export function resolveNicheLabels(input: NicheLabelInput): NicheLabels {
  const sv = str(input.scrubbedVoice?.niche), sd = str(input.scrubbedDna?.niche)
  const rv = str(input.rawVoice?.niche), rd = str(input.rawDna?.niche)
  const ssv = str(input.scrubbedVoice?.sub_niche), ssd = str(input.scrubbedDna?.sub_niche)
  const rsv = str(input.rawVoice?.sub_niche), rsd = str(input.rawDna?.sub_niche)

  const lookupNiche = [rv, rd, sv, sd].find(usable) ?? ''
  const lookupSubNiche = [rsv, rsd, ssv, ssd].find(usable) ?? ''

  const scrubbedNiche = [sv, sd].find(usable) ?? ''
  let promptNiche = scrubbedNiche
  if (!promptNiche) {
    const blankedRaw = [rv, rd].find(usable) ?? ''
    const parent = blankedRaw && input.isSensitive(blankedRaw) ? PARENT_CATEGORY[input.bucketOf(blankedRaw) ?? ''] : undefined
    promptNiche = parent ?? 'unspecified'
  }
  // A sub-niche is detail, not a category: no parent stand-in; blank when scrubbed.
  const promptSubNiche = [ssv, ssd].find(usable) ?? ''

  return {
    promptNiche,
    promptSubNiche,
    lookupNiche,
    lookupSubNiche,
    lookupKey: nicheKeyOf(lookupSubNiche || lookupNiche),
    lookupBucket: input.bucketOf(lookupNiche),
    lookupFromRaw: lookupNiche !== '' && !scrubbedNiche,
  }
}
