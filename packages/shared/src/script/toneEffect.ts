/**
 * FIX 11 (Wave 4) — TONE MUST BE VISIBLE WHERE IT CLAIMS TO ACT, AND NEVER
 * CONTRADICTED THERE.
 *
 * The audits found the creator's TONE choice (`understated` / `balanced` /
 * `punchy`, set in Advanced Settings — see `V2Create.tsx`'s tone picker)
 * reaching the script-writing instruction (`TONE_RULE` in
 * `generate-blueprint/index.ts`) but NOT the delivery-direction text a
 * creator actually reads to figure out HOW to perform the line: the
 * production sprint tasks and the per-beat camera/performance `direction`.
 * Two concrete failures were quoted verbatim:
 *
 *   - run-c: tone="punchy" (high energy) had zero observable effect anywhere
 *     in the output — no energy language appeared where it should have.
 *   - run-d: tone="understated" (calm/credibility) was directly CONTRADICTED
 *     by delivery text reading "rapid jump cuts to mimic the energetic
 *     delivery" sitting next to a beat direction that itself says "calm".
 *
 * This module is DETECTION ONLY, run over the same free text a creator
 * reads (`production_sprint[].task` and every beat's `direction`), so the
 * writer's compliance with its own `TONE_RULE` instruction is falsifiable
 * rather than assumed — the same discipline every other `beat_audit`
 * counter in this codebase already uses.
 *
 * ⚖️ `balanced` HAS NO REQUIRED OR FORBIDDEN VOCABULARY. It is the natural,
 * unmarked register the writer already defaults to, so scoring it for
 * "presence of energy language" would be meaningless — there is nothing a
 * creator who picked `balanced` needs to see confirmed.
 */

/** Energy-coded delivery vocabulary. A `punchy` choice should surface some of
 *  this in the delivery text; an `understated` choice must never. */
const ENERGETIC_MARKERS =
  /\b(?:energetic|energy|rapid[- ]fire|rapid jump cuts?|fast[- ]paced|high[- ]energy|(?<!no )hype|explosive|punchy|bold|fast cuts?|quick cuts?|amped|intense pace)\b/i

/** Calm-coded delivery vocabulary. An `understated` choice should surface
 *  some of this in the delivery text; a `punchy` choice contradicts it. */
const CALM_MARKERS =
  /\b(?:calm|understated|measured|steady|credible|composed|low[- ]key|no[- ]hype|quiet confidence|even[- ]keeled)\b/i

export type ToneSetting = 'understated' | 'balanced' | 'punchy'

export interface ToneEffect {
  /** The tone actually applied to this generation (after any clamp). */
  tone: ToneSetting
  /** `punchy`: energy vocabulary appears somewhere in the delivery text.
   *  `understated`: calm vocabulary appears somewhere in the delivery text.
   *  `balanced`: always true — there is nothing to require. */
  tone_effect_observed: boolean
  /** Delivery-text passages whose vocabulary directly contradicts the
   *  applied tone (energy language under `understated`, calm-only language
   *  under `punchy` with no energy language anywhere). Always 0 for
   *  `balanced`. */
  contradictions: number
}

function collectDeliveryText(script: unknown, productionSprint: unknown): string[] {
  const texts: string[] = []
  if (Array.isArray(script)) {
    for (const b of script) {
      const beat = (b ?? {}) as { direction?: unknown }
      if (typeof beat.direction === 'string' && beat.direction.trim() !== '') texts.push(beat.direction)
    }
  }
  if (Array.isArray(productionSprint)) {
    for (const s of productionSprint) {
      const step = (s ?? {}) as { task?: unknown }
      if (typeof step.task === 'string' && step.task.trim() !== '') texts.push(step.task)
    }
  }
  return texts
}

/**
 * The tone_effect `beat_audit` counter. Reads the SAME free text the creator
 * reads for delivery direction — never the script's spoken lines, which the
 * `TONE_RULE` instruction already targets and which is not where the audits
 * found the gap.
 */
export function toneEffect(script: unknown, productionSprint: unknown, appliedTone: ToneSetting): ToneEffect {
  const texts = collectDeliveryText(script, productionSprint)
  const joined = texts.join(' \n ')

  if (appliedTone === 'balanced') {
    return { tone: 'balanced', tone_effect_observed: true, contradictions: 0 }
  }

  if (appliedTone === 'punchy') {
    const observed = ENERGETIC_MARKERS.test(joined)
    // A contradiction under `punchy` is delivery text that names a calm
    // register while no energy language appears anywhere else — the writer
    // actively steered the OTHER way, not merely stayed neutral.
    let contradictions = 0
    for (const t of texts) {
      if (CALM_MARKERS.test(t) && !observed) contradictions += 1
    }
    return { tone: 'punchy', tone_effect_observed: observed, contradictions }
  }

  // understated
  const observed = CALM_MARKERS.test(joined)
  let contradictions = 0
  for (const t of texts) {
    if (ENERGETIC_MARKERS.test(t)) contradictions += 1
  }
  return { tone: 'understated', tone_effect_observed: observed, contradictions }
}
