// GENERATED FROM packages/shared/src/script/voiceGate.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// THE VOICE GATE (24-ideas #21) — her voice as a check on the finished script,
// not only as context in the prompt.
//
// ⚖️ ONLY WHAT CAN BE CHECKED WITHOUT A MODEL'S OPINION. Her stored `donts`
// are free text ("Do not use overly formal business jargon", "Do not use
// lengthy intros, greetings, or self-introductions"). Each one that names a
// checkable thing turns on a deterministic rule below; one that does not
// ("Don't preach perfectionism") stays prompt-only, because a regex claiming
// to enforce it would be a guess. Flagged lines are rewritten in her voice by
// the edge function, then re-checked; a style miss never fails a generation.
//
// ⚖️ HER OWN WORDS ARE MEASURED, NEVER FORCED. How many of her stored
// `vocabulary` phrases appear is recorded; stuffing them in would sound less
// like her, not more.

export type VoiceRule = 'no_jargon' | 'no_greeting' | 'no_hype' | 'no_lecture'

const JARGON = /\b(?:leverag(?:e|ing)|synerg\w*|stakeholders?|paradigm|optimi[sz](?:e|ation)|utili[sz](?:e|ation)|scalab\w*|best[- ]in[- ]class|value proposition|actionable insights?|holistic|robust solution|seamless(?:ly)?|cutting[- ]edge|state[- ]of[- ]the[- ]art|game[- ]chang\w*|revolutioni[sz]\w*|elevate your|unlock (?:your|the) (?:full )?potential|in today'?s (?:fast[- ]paced )?world)\b/i
const GREETING = /^(?:hey|hi|hello|what'?s up)\b[^.!?]{0,30}(?:guys|everyone|friends|y'?all|fam)?[,.!]?|\bwelcome (?:back )?to my (?:channel|page)\b|\bmy name is\b/i
const HYPE = /\b(?:you won'?t believe|mind[- ]?blowing|insane(?:ly)?|life[- ]changing|this changes everything|must[- ]have|obsessed)\b|!!/i
const LECTURE_WORDS = 34

/** Which checkable rules her `donts` turn on. */
export function voiceRules(donts: unknown): VoiceRule[] {
  const text = (Array.isArray(donts) ? donts : []).filter((d) => typeof d === 'string').join(' | ').toLowerCase()
  const out = new Set<VoiceRule>()
  if (/jargon|corporate|formal|buzzword|academic/.test(text)) out.add('no_jargon')
  if (/intro|greeting|self-introduc|welcome/.test(text)) out.add('no_greeting')
  if (/hype|clickbait|exaggerat|over-?the-?top|salesy|sensational/.test(text)) out.add('no_hype')
  if (/lecture|speech|long-winded|ramble/.test(text)) out.add('no_lecture')
  return [...out]
}

/** Why a line breaks one of her rules, or null. `first` = the line opens the video. */
export function voiceMiss(line: string, rules: readonly VoiceRule[], first: boolean): VoiceRule | null {
  const t = String(line ?? '')
  if (rules.includes('no_jargon') && JARGON.test(t)) return 'no_jargon'
  if (rules.includes('no_greeting') && first && GREETING.test(t.trim())) return 'no_greeting'
  if (rules.includes('no_hype') && HYPE.test(t)) return 'no_hype'
  if (rules.includes('no_lecture') && (t.match(/[^.!?]+[.!?]*/g) ?? []).some((s) => s.trim().split(/\s+/).length > LECTURE_WORDS)) return 'no_lecture'
  return null
}

/** ⚠️ HER OWN WORDS ARE NEVER A MISS. A phrase stored in her `vocabulary`
 *  ("insanely simple", "obsessed") is removed before checking, so the gate
 *  cannot rewrite the creator out of her own script. */
export function voiceViolations(
  beats: ReadonlyArray<{ line?: unknown }>, rules: readonly VoiceRule[], vocabulary: unknown = [],
): Array<{ index: number; rule: VoiceRule }> {
  if (rules.length === 0) return []
  const own = (Array.isArray(vocabulary) ? vocabulary : [])
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 2)
    .map((v) => v.trim().toLowerCase())
  const strip = (t: string) => own.reduce((acc, p) => acc.split(p).join(' '), t.toLowerCase())
  const out: Array<{ index: number; rule: VoiceRule }> = []
  beats.forEach((b, i) => {
    const rule = typeof b?.line === 'string' ? voiceMiss(strip(b.line), rules, i === 0) : null
    if (rule) out.push({ index: i, rule })
  })
  return out
}

/** How many of her stored phrases the script actually uses. Measured only. */
export function vocabularyUsed(vocabulary: unknown, lines: readonly string[]): { stored: number; used: number } {
  const phrases = (Array.isArray(vocabulary) ? vocabulary : [])
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 2)
    .map((v) => v.trim().toLowerCase())
  const text = lines.join(' ').toLowerCase()
  return { stored: phrases.length, used: phrases.filter((p) => text.includes(p)).length }
}

const RULE_TEXT: Record<VoiceRule, string> = {
  no_jargon: 'she never uses business or corporate jargon — plain words she would say out loud',
  no_greeting: 'she never opens with a greeting or self-introduction — start on the point itself',
  no_hype: 'she never hypes — no exaggeration, no "you won\'t believe", no double exclamation marks',
  no_lecture: 'she never lectures — short spoken sentences, none longer than about 30 words',
}

export const VOICE_REPAIR_SYSTEM = 'You rewrite single script lines so they sound like this creator, following her own stated rules.'
  + ' Keep every fact, number, name and claim exactly as it is — never add or invent anything.'
  + ' Keep each line\'s purpose and position and about the same length (shorter is fine). Keep her rough edges;'
  + ' do not polish. You return JSON only.'

export function voiceRepairPrompt(
  beats: ReadonlyArray<{ line?: unknown }>, flagged: ReadonlyArray<{ index: number; rule: VoiceRule }>,
  tone: string, vocabulary: unknown,
): string {
  const words = (Array.isArray(vocabulary) ? vocabulary : []).filter((v) => typeof v === 'string').slice(0, 8)
  return `HER TONE: ${String(tone).slice(0, 160)}`
    + (words.length ? `\nHER OWN WORDS (use only where natural): ${words.join(', ')}` : '')
    + '\nRewrite ONLY these lines. Return JSON: {"rewrites":[{"index":<number>,"line":"<new line>"}]}\n\n'
    + flagged.map((f) => `index ${f.index}\nRULE: ${RULE_TEXT[f.rule]}\nLINE: ${String(beats[f.index]?.line ?? '')}`).join('\n\n')
}
