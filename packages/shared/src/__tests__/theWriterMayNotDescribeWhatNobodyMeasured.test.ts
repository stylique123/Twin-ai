// THE HONESTY PANEL WAS CONTRADICTED BY THE WRITER ON THE SAME PAGE.
//
// ⚠️⚠️ OBSERVED ON A REAL PRODUCTION ROW, not reasoned about. One generation's
// `concept.translations` carried:
//
//   theirs: "Multi track layered vocal delivery with rhythmic switch"
//   theirs: "Music video aesthetic with heavy mood lighting"
//
// while the evidence panel one screen below reported camera work NOT OBSERVED
// and music NOT OBSERVED. The writer asserted what the honesty layer said was
// never measured — and that layer is the one thing in this product no competitor
// has, so it discredits itself there.
//
// ⚠️ AND THE WRITER CANNOT CHECK: `generate-blueprint/index.ts` contains ZERO
// references to `MISSING_EVIDENCE_TYPES`, `transferRows`, `notObservedRows` or
// `reference_evidence`. The panel is computed in the web app from a table the
// prompt never sees. So the prompt has no way to know what was looked at.
//
// ⚖️ WHICH MAKES THE GATE A FLAT PROHIBITION RATHER THAN A CONDITION, and that
// is correct TODAY for a measured reason: nothing in `worker/` or
// `supabase/functions/` writes ANY of the visual evidence types. The same grep
// returns zero for all of them, so every visual dimension is NOT OBSERVED on
// every reference, always. A condition on an evidence set that is always empty
// would be a condition that never fires.
//
// ⚖️ IF A VISUAL ANALYSIS IS EVER BUILT, the prohibition becomes conditional on
// real values. This file should then be rewritten, not deleted — the rule it
// protects (never describe what was not measured) outlives the absolute form.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MISSING_EVIDENCE_TYPES } from '../referenceEvidence'
import { TYPE_LABEL } from '../creativeTransferRows'

/** ⚖️ RELATIVE TO THIS FILE, NEVER TO THE WORKING DIRECTORY — a test whose
 *  result depends on where it was invoked from reports on the invocation. */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(
  join(REPO, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

describe('the writer may not describe what nobody measured', () => {
  it('the translations rule forbids describing how the reference looked or sounded', () => {
    expect(EDGE).toContain('MAY NOT DESCRIBE HOW THE REFERENCE LOOKED OR SOUNDED')
    // ⚠️ THE REASON MUST TRAVEL WITH THE RULE. A bare prohibition is the kind a
    // later edit softens because nobody remembers what it cost.
    expect(EDGE).toContain('because nobody looked')
  })

  it('it names every dimension that is unmeasured, so none is left implied', () => {
    // ⚖️ DERIVED FROM THE GAP LIST ITSELF, not from a copy written out here. If a
    // dimension is ever added to `MISSING_EVIDENCE_TYPES`, this fails until the
    // prompt names it too — which is the point: a new unmeasured dimension that
    // the writer is still free to invent is the defect returning under a new name.
    // ⚠️⚠️ THE WINDOW IS THE SENTENCE, NOT A CHARACTER COUNT, AND THAT IS THE
    // WHOLE CORRECTNESS OF THIS TEST. My first version searched 2600 characters
    // after the rule, and a mutant that DELETED "camera work" from the list
    // still passed — because the surrounding prompt says "camera" elsewhere
    // ("in front of a camera"). A test that cannot see a dimension disappear is
    // not testing the list.
    const from = EDGE.indexOf('its lighting,')
    const to = EDGE.indexOf('are ALL unmeasured', from)
    expect(from, 'the dimension list could not be located').toBeGreaterThan(-1)
    expect(to, 'the end of the dimension list could not be located').toBeGreaterThan(from)
    const listed = EDGE.slice(from, to).toLowerCase()

    // ⚖️ MATCHED ON THE LABEL'S LEADING WORD, SINGULARISED, because the prompt
    // speaks plain English and the panel speaks in labels: "Caption design" is
    // "captions" in a sentence, "Zooms" is "zooms", "Pacing of dead space" is
    // "the pacing of its dead space". Requiring the label verbatim would force
    // the prompt to read like a schema.
    //
    // ⚖️ AND A LEADING-WORD MATCH IS ONLY SAFE BECAUSE THE WINDOW IS ONE
    // SENTENCE. In a wider window "camera" appears in unrelated prompt text,
    // which is exactly how the first version of this test let a deleted
    // dimension pass.
    const stem = (label: string) => {
      const first = label.toLowerCase().split(' ')[0]
      return first.endsWith('s') ? first.slice(0, -1) : first
    }
    for (const t of MISSING_EVIDENCE_TYPES) {
      const label = TYPE_LABEL[t] ?? ''
      expect(label, `${t} has no human label to check against`).toBeTruthy()
      expect(listed, `the dimension list omits ${label} (${t})`).toContain(stem(label))
    }
  })

  it('it says what theirs MAY describe, not only what it may not', () => {
    // ⚖️ A PROHIBITION WITH NO ALTERNATIVE IS A PROHIBITION A MODEL ROUTES
    // AROUND. The transcript, the format, the length and the mechanism are what
    // was actually read, so the rule points there.
    const rule = EDGE.slice(EDGE.indexOf('MAY NOT DESCRIBE HOW THE REFERENCE LOOKED'))
    expect(rule.slice(0, 2600)).toContain('DESCRIBES ONLY WHAT WAS ACTUALLY READ')
    expect(rule.slice(0, 2600)).toContain('MECHANISM')
  })

  it('the two phrases a real creator was shown are named as the failure', () => {
    // ⚠️ THE EVIDENCE, IN THE FILE. These came off a production row; quoting them
    // is what stops this being rediscovered as a style opinion.
    expect(EDGE).toContain('heavy mood lighting')
    expect(EDGE).toContain('rhythmic switch')
  })

  it('the prompt still has no access to the evidence set, and the rule does not pretend otherwise', () => {
    // ⚠️ ASSERTED SO THE ABSOLUTE FORM IS HONEST. If the prompt ever gains the
    // evidence set, this fails — and the rule should then become conditional
    // rather than staying a blanket ban it no longer needs.
    expect(EDGE).not.toContain('MISSING_EVIDENCE_TYPES')
    expect(EDGE).not.toContain('notObservedRows')
    expect(EDGE).not.toContain('transferRows(')
  })
})
