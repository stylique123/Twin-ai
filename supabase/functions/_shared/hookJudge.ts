// GENERATED FROM packages/shared/src/script/hookJudge.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
/**
 * THE HOOK JUDGE — deterministic, unpaid, calibrated on 603 rated hooks.
 *
 * Craft rubric v1 (advisor, 22 Oct): story-first and sharply specific hooks
 * average 4.1 to 4.5 of 5 on "would you stop scrolling"; generic questions,
 * product-first lines and bare spec lines average 1.5 to 3.
 *
 * `hookFeatures` turns a hook into a small vector of measurable features;
 * `scoreHook` is a linear model over them, clamped to 1..5. The weights in
 * HOOK_WEIGHTS were fitted (ridge least squares) on panels P5-P8 ONLY by
 * scripts/calibrate-judges.mjs; panel P10 is the held-out test. Re-run that
 * script on every new labeled panel instead of editing the numbers by hand.
 *
 * ⚠️ INVENTION IS NOT DETECTABLE OFFLINE. A hook that invents a number or a
 * frequency reads exactly like a true one. The caller passes `invented: true`
 * when an upstream claim gate (inventionGate) flagged it; the judge only
 * applies the penalty.
 *
 * No imports: mirrored into supabase/functions/_shared by
 * scripts/ci/generate_shared_pilot_core.mjs.
 */

export const HOOK_FEATURES = [
  'story_first', 'specific', 'stance', 'generic_question', 'question',
  'product_first', 'bare_spec', 'advice_frame', 'conditional', 'self_label',
  'short', 'concrete_past', 'invented',
] as const
export type HookFeature = typeof HOOK_FEATURES[number]

const lc = (s: string) => s.toLowerCase().replace(/[’']/g, "'").trim()
const words = (s: string) => lc(s).match(/[a-z0-9$][a-z0-9$'.-]*/g) ?? []

const PAST = /\b(was|were|had|came|went|got|lost|found|caught|threw|told|asked|ran|built|started|kept|tried|made|glued|ruined|quoted|wrote|fixed|spent|skipped|pulled|burned|broke|cracked|separated|failed|learned|realized|noticed|bought|sold|copied|deadlifted|hurt|fell|left|picked|turned)\b|\b[a-z]{3,}ed\b/
const FIRST = /^(i|i'm|i've|my|we|we've|our|me|the first time i|one of my|a (regular|customer|client|buyer)|every (mug|jar|batch))\b/
const NUM = /\b(\d[\d,.]*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|twenty|thirty|forty|fifty|hundred|first|single|every)\b/
const STANCE = /^(stop|never|don't|do not|quit|skip|grab|ditch|forget|you are not|you're not|real talk|here's the thing|the (secret|truth|mistake)|nobody|most people)\b/
const QSTART = /^(are|do|does|did|can|could|would|will|is|should|have|has|what|why|how|when|where|which|who|ever|looking|tired|struggling|brewing|running|want)\b/
const GENERIC_Q = /\b(you|your)\b/
const PRODUCT = /(\$\s?\d|\bper (month|jar)|\bfree trial\b|\b\d+-day\b|\btrial\b|\bcard\b|\bdishwasher\b|\bour (board|product|app|mug|cream|tool|plan)\b|\bhere is what you get\b|\bhere is our\b|\bships?\b|\bcapacity\b|\bholds about\b|\bwe ship\b)/
const SPEC_UNIT = /\b(\d+\s?(ml|oz|g|kg|lb|cm|mm|in)|ounce|fired twice|hand-thrown|unglazed foot|dishwasher safe)\b/
const ADVICE = /^(a lot of|most|everyone|lots of) (advice|people|coaches|experts|guides)\b.*\b(says?|tell|pushes|claims?)\b/
const SELF = /^(i|we) (speak|talk|post|make videos|share) about\b/

/** Measurable features of one hook, each 0 or 1. */
export function hookFeatures(hook: string, opts: { invented?: boolean } = {}): Record<HookFeature, number> {
  const h = lc(hook)
  const w = words(h)
  const isQ = /\?\s*$/.test(h) || QSTART.test(h) && h.includes('?')
  const hasVerb = /\b(is|are|was|were|be|do|does|did|have|has|had|get|make|keep|stop|start|put|check|tell|ask)\b/.test(h) || PAST.test(h)
  const product = PRODUCT.test(h)
  const bareSpec = (!hasVerb && w.length <= 9) || SPEC_UNIT.test(h) && w.length <= 10 || /here is what you get/.test(h)
  const storyFirst = FIRST.test(h) && PAST.test(h) && !SELF.test(h)
  return {
    story_first: storyFirst ? 1 : 0,
    specific: NUM.test(h) || /\b(fridge|kiln|broomstick|newsletter|onions|shelf|hallway|garage|popper|saturday|quote|sentence|emulsion|deadlift|refrigerator)\b/.test(h) ? 1 : 0,
    stance: STANCE.test(h) ? 1 : 0,
    generic_question: isQ && GENERIC_Q.test(h) ? 1 : 0,
    question: isQ ? 1 : 0,
    product_first: product ? 1 : 0,
    bare_spec: bareSpec ? 1 : 0,
    advice_frame: ADVICE.test(h) || /^a lot of advice\b/.test(h) ? 1 : 0,
    conditional: /^(if|when) you\b|^if your\b/.test(h) ? 1 : 0,
    self_label: SELF.test(h) ? 1 : 0,
    short: w.length <= 5 ? 1 : 0,
    concrete_past: PAST.test(h) && !isQ ? 1 : 0,
    invented: opts.invented ? 1 : 0,
  }
}

/** Fitted on P5-P8 (scripts/calibrate-judges.mjs). Intercept first. */
export const HOOK_WEIGHTS: { intercept: number } & Record<HookFeature, number> = {
  intercept: 3.09,
  story_first: 0.58, specific: 0.28, stance: 0.21, generic_question: -0.03, question: -0.12,
  product_first: -1.21, bare_spec: -0.29, advice_frame: -0.06, conditional: -0.17, self_label: -0.9,
  short: -1.41, concrete_past: 0.27, invented: -0.42,
}

export type HookScore = { score: number; raw: number; features: Record<HookFeature, number> }

/** Score one hook 1..5 (integer `score`, unrounded `raw`). */
export function scoreHook(hook: string, opts: { invented?: boolean; weights?: typeof HOOK_WEIGHTS } = {}): HookScore {
  const W = opts.weights ?? HOOK_WEIGHTS
  const f = hookFeatures(hook, opts)
  let raw = W.intercept
  for (const k of HOOK_FEATURES) raw += W[k] * f[k]
  raw = Math.max(1, Math.min(5, raw))
  return { score: Math.round(raw), raw, features: f }
}
