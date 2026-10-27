// THE WRITER RECEIVES THE LOOP (plan v7.1 WP6–WP8: Q5, Q6, V3, V4, S1–S3).
//
// ⚠️ FOUR THINGS THE CREATOR GAVE OR THE OWNER DEFINED NEVER REACHED THE WRITER:
//   Q5 the answers she typed for THIS video (mn_answers) were only measured
//      after the script, never put in front of the writer;
//   Q6 her content pillars reached neither the writer nor the angle planner;
//   V3 her style note and her own lines reached only the polish step;
//   S1 a real account without a reference got one sentence about a re-hook:
//      no beat order, no phases, no build-up to the call to action.
// This module renders all four as one block, placed FIRST in the writer brief
// after the hook rule. Pure functions; the edge copy is generated.
//
// ⚖️ STAGE: unset → test and panel accounts only (trial); 'all' → every account;
// 'off' → nobody. One switch (WRITER_LOOP) for the whole block, so turning it on
// for real creators is one owner word, and the ramp can read the same value.

export type DurationProfile = 'sprint' | 'standard' | 'deep'

export interface HouseBeat {
  id: 'hook' | 'problem' | 'proof' | 'rehook' | 'method' | 'payoff' | 'cta'
  phase: number
  label: string
  purpose: string
  words: { sprint: [number, number] | null; standard: [number, number]; deep: [number, number] }
  rule: string
}

/** The house structure (plan v7.1 §4). Order is the order spoken. */
export const HOUSE_STRUCTURE: readonly HouseBeat[] = [
  { id: 'hook', phase: 1, label: 'Hook', purpose: "stop the scroll with her story's first beat, or a sharp, true, specific claim or stance",
    words: { sprint: [10, 18], standard: [12, 20], deep: [12, 22] }, rule: 'no bare spec line, no invented number or timeframe; a story-first hook wins' },
  { id: 'problem', phase: 2, label: 'Setup / problem', purpose: 'name the pain in plain terms, the one the hook promised to solve',
    words: { sprint: [8, 15], standard: [15, 30], deep: [20, 35] }, rule: 'audience pain is a topic, never proof and never her experience' },
  { id: 'proof', phase: 3, label: 'Her story / proof, built in phases', purpose: 'what happened, in her own words: the moment, what went wrong or changed, what she noticed',
    words: { sprint: [20, 35], standard: [30, 50], deep: [45, 70] }, rule: 'after the problem, before the offer; nothing added to her story; never repeat the hook sentence' },
  { id: 'rehook', phase: 4, label: 'Re-hook', purpose: 'bring them back mid-video with a NEW specific: a turn, a number she gave, the part people get wrong',
    words: { sprint: null, standard: [8, 15], deep: [8, 18] }, rule: 'must carry substance in the same line; never a stall like "but wait" alone' },
  { id: 'method', phase: 5, label: 'Method / product', purpose: 'her steps, or the confirmed product fact that bridges her story to the offer',
    words: { sprint: [0, 15], standard: [20, 40], deep: [30, 55] }, rule: 'only confirmed facts; no unconfirmed numbers, testimonials or comparisons' },
  { id: 'payoff', phase: 6, label: 'Payoff', purpose: 'the result or lesson SHE stated, which pays off the hook',
    words: { sprint: [0, 12], standard: [10, 20], deep: [12, 25] }, rule: 'never a lesson she did not say' },
  { id: 'cta', phase: 7, label: 'Call to action', purpose: 'one ask that matches her offer',
    words: { sprint: [6, 12], standard: [8, 15], deep: [8, 15] }, rule: 'exactly one, and it is the last line' },
]

/** Seconds → duration profile (Sprint ≤ 35 s, Standard ≤ 75 s, Deep above). */
export function profileForSeconds(sec: unknown): DurationProfile {
  const n = typeof sec === 'number' && Number.isFinite(sec) ? sec : 60
  return n <= 35 ? 'sprint' : n <= 75 ? 'standard' : 'deep'
}

/** The beat order with purposes and budgets. Sprint keeps the re-hook only past 60 words. */
export function renderHouseStructure(profile: DurationProfile): string {
  const beats = HOUSE_STRUCTURE.filter((b) => b.words[profile] !== null)
  const lines = beats.map((b, i) => {
    const w = b.words[profile] as [number, number]
    const budget = w[0] === 0 ? `up to ${w[1]} words, only if she has it` : `${w[0]}–${w[1]} words`
    return `${i + 1}. ${b.label} (${budget}): ${b.purpose}. Rule: ${b.rule}.`
  })
  return [
    `THE HOUSE STRUCTURE (${profile}). Build the script in this order, one beat per step; label each script beat with its step's name in beat_plan.`,
    ...lines,
    'Build up in phases: each beat ends with a pull into the next (an open question, a turn, a "here is what changed"), so the story climbs to the call to action instead of listing facts.',
    profile === 'deep' ? 'Deep may repeat steps 3 to 5 once with a second piece of her material on the SAME topic.' : '',
    'If a step has nothing true to say from her material, skip it rather than invent it; never skip the hook or the call to action.',
  ].filter(Boolean).join('\n')
}

export interface LoopAnswer { key: string; text: string }

/** This request's answers: angle answers (mn:*) first, then readiness answers. Text only, capped. */
export function answersForThisVideo(mn: unknown, readiness: unknown): LoopAnswer[] {
  const out: LoopAnswer[] = []
  const seen = new Set<string>()
  const take = (obj: unknown, keyOk: (k: string) => boolean) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (!keyOk(k) || typeof v !== 'string') continue
      const text = v.replace(/\s+/g, ' ').trim().slice(0, 600)
      const norm = text.toLowerCase()
      if (!text || seen.has(norm) || /^(skip|skipped|n\/a|none|-)$/i.test(text)) continue
      seen.add(norm)
      out.push({ key: k.slice(0, 80), text })
    }
  }
  take(mn, (k) => /^mn:/.test(k))
  take(readiness, () => true)
  return out.slice(0, 6)
}

/** Her pillars from onboarding: strings, deduped, at most 5. */
export function pillarsFrom(brief: unknown): string[] {
  const raw = brief && typeof brief === 'object' ? (brief as { contentPillars?: unknown }).contentPillars : null
  const list = (Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,;\n]/) : [])
    .map((p) => String(p ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)).filter(Boolean)
  return [...new Set(list.map((p) => p.toLowerCase()))].slice(0, 5).map((l) => list.find((p) => p.toLowerCase() === l) as string)
}

export interface VoiceForWriter { styleNote?: string | null; sampleLines?: readonly string[] | null; cardBlock?: string | null }

/** The stage switch. 'all' → everyone; 'off' → nobody; anything else → trial only. */
export function writerLoopOn(stage: string | null | undefined, trialOn: boolean): boolean {
  const s = String(stage ?? '').trim().toLowerCase()
  if (s === 'off' || s === 'false' || s === '0') return false
  if (s === 'all') return true
  return trialOn
}

const fence = (label: string, body: string) => `<<<${label}\n${body}\n>>>`

/** The whole block. Empty sections are left out; the structure is always present. */
export function renderWriterLoop(a: { answers: readonly LoopAnswer[]; pillars: readonly string[]; profile: DurationProfile; voice?: VoiceForWriter | null }): string {
  const parts: string[] = []
  const v = a.voice ?? null
  const samples = (v?.sampleLines ?? []).map((s) => String(s).replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 3)
  const note = String(v?.styleNote ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
  if (v?.cardBlock || note || samples.length) {
    parts.push([
      'HER VOICE (highest priority for wording; it overrides any generic style rule below).',
      v?.cardBlock ? String(v.cardBlock).trim() : '',
      note ? `Her own style note: ${note}` : '',
      samples.length ? `Lines she actually said or wrote (match their rhythm and word choice; never copy a claim from them):\n${samples.map((s) => `- ${s.slice(0, 240)}`).join('\n')}` : '',
    ].filter(Boolean).join('\n'))
  }
  if (a.answers.length) {
    parts.push(fence('her answers for THIS video (her own words, confirmed)', a.answers.map((x) => `- ${x.text}`).join('\n'))
      + '\nUse every answer above in the script, at the beat it belongs to (a story goes in step 3, a problem in step 2, a fact in step 5), in her words. An answer is her fact: never contradict it, never pad it.')
  }
  if (a.pillars.length) {
    parts.push(`Her content pillars: ${a.pillars.join('; ')}. Keep the script inside the pillar this request fits; do not drift to another.`)
  }
  parts.push(renderHouseStructure(a.profile))
  return parts.join('\n\n')
}
