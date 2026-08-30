/**
 * THE CONTROL MUST GOVERN THE TEXT — ASSERTED AGAINST THE SHIPPED PROMPT.
 *
 * ⚠️ THIS CONTROL HAS ALREADY SHIPPED ONCE LOOKING CORRECT AND DOING NOTHING.
 * A unit test of the budget table proves the table is ordered; it does not
 * prove the writer's prompt USES it. These assertions read the edge function's
 * own source — the same technique `how-much-of-the-original-to-keep.test.ts`
 * uses for the directive — so the mechanism cannot be quietly disconnected
 * while its unit tests stay green.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const EDGE = readFileSync(
  fileURLToPath(new URL('../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url)),
  'utf8',
)

/** ⚠️ NEGATIVE ASSERTIONS READ CODE, NOT PROSE. The comment explaining the
 *  deleted `clip(ref.text ?? '', 6000)` quotes it verbatim, and a naive
 *  `not.toMatch` over the whole file fails on the explanation of the fix. */
const CODE = EDGE.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('defect 1 — the verbatim transcript is no longer unconditional', () => {
  it('no longer hands the writer a hard-coded 6000-character excerpt', () => {
    // This literal IS the defect: 6,000 characters of the reference creator's
    // speech at every fidelity setting, with a sentence of prose asking the
    // model not to reuse them.
    expect(CODE).not.toMatch(/clip\(ref\.text \?\? '', 6000\)/)
  })

  it('sizes the excerpt from the creator s choice', () => {
    expect(EDGE).toMatch(/const referenceVerbatimChars = verbatimBudget\(/)
    expect(EDGE).toMatch(/clip\(ref\.text \?\? '', referenceVerbatimChars\)/)
  })

  it('budgets on reference_use, NOT on the fidelity string', () => {
    // `FIDELITY_FROM_REFERENCE_USE` maps BOTH `structure` and `stay_close` to
    // 'close', so a budget keyed on `fidelity` could not tell most-mine from
    // most-theirs — it would hand the creator who asked for least of the
    // reference exactly as much as the one who asked for most.
    expect(EDGE).toMatch(/verbatimBudget\(referenceExposureLevel,/)
    expect(EDGE).toMatch(/normalizedReferenceUseForFidelity \?\? 'idea_structure'/)
  })

  it('withholds rather than leaking when the budget is zero', () => {
    // `clip(s, 0)` used to return the WHOLE string — `slice(-0)` is `slice(0)`.
    expect(EDGE).toMatch(/if \(max <= 0\) return ''/)
    expect(EDGE).toMatch(/referenceVerbatimChars > 0 \? clip\(/)
  })

  it('keeps the analysis fields grounded in THIS video via a measured shape', () => {
    // The tension the fix had to resolve: why_it_works and retention_map are
    // required to be about this specific video, and they share one model call
    // with the script. The digest is computed from the WHOLE transcript and
    // carries none of its words, so cutting the excerpt does not starve them.
    expect(EDGE).toMatch(/renderShapeDigest\(referenceShapeDigest\(ref\.text\)\)/)
    expect(EDGE).toMatch(/reference_read\.why_it_works and retention_map/)
  })

  it('records what it actually supplied, so the setting is auditable in logs', () => {
    expect(EDGE).toMatch(/event: 'reference_exposure'/)
    expect(EDGE).toMatch(/verbatim_chars: referenceVerbatimChars/)
  })
})

describe('defect 2 — one home for the control', () => {
  it('deletes the vaguer parenthetical that competed with REFERENCE_USE_DIRECTIVE', () => {
    // Two homes for one control, and the weaker one was adjectives. It appeared
    // in BOTH the with-transcript and no-transcript branches.
    expect(CODE).not.toMatch(/close = stay tight to the reference structure/)
    expect(CODE).not.toMatch(/loose = just the inspiration, mostly them/)
    expect(CODE).not.toMatch(/- Inspiration fidelity: \$\{fidelity\}/)
  })

  it('leaves REFERENCE_USE_DIRECTIVE as the owner, untouched', () => {
    // The directive is correct. It was outgunned by the raw text, not wrong.
    expect(EDGE).toMatch(/\$\{doNotUseBlock\}\$\{referenceUseBlock\}/)
    expect(EDGE).toMatch(/REFERENCE_USE_DIRECTIVE_INLINE/)
    expect(EDGE).toMatch(/HOW MUCH OF THE REFERENCE TO KEEP/)
  })

  it('still names the level in the prompt, once, as what it SUPPLIES', () => {
    expect(EDGE).toMatch(/REFERENCE_EXPOSURE\[referenceExposureLevel\]\.supplies/)
  })
})
