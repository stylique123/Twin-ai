// THE READER FOR TIER 0, AND THE DEBT IT PAYS.
//
// ⚠️ #643 ADDED THE COLUMN AND NO READER. `tier_zero_profile` was written by
// worker/src/referenceTierZeroPass.ts and nothing anywhere opened it — the exact
// "a field written and never read is not a feature" defect this repo has found
// nine times, created by the very change that warned about it. This test is the
// proof the reader exists and stays.
//
// ⚖️ AND IT IS A SEPARATE BLOCK FROM THE MODEL'S READING, ON PURPOSE. Migration
// 0180's argument: `visual_profile` is a MODEL'S READING of eight still frames;
// Tier 0 is ARITHMETIC over every frame. Only one of them can be wrong about
// what it saw. A prompt that blurs them invites the model to trust the weaker
// evidence as much as the stronger.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = join(import.meta.dirname, '..', '..', '..', '..', '..')
const BP = readFileSync(join(REPO, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
/** Code lines only — a comment naming a field is not a reader. */
const CODE = BP.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('the numbers off the file must be read', () => {
  it('the writer SELECTS the column — in its OWN query, never folded into the other', () => {
    // ⚠️ THE SAFETY PROPERTY, AND IT IS MEASURED. Migration 0180 is not applied
    // to production (verified 2026-09-02: the column does not exist).
    // supabase-js does NOT throw on an unknown column — it returns
    // `{ data: null, error }`, and this code reads only `data`. Folding
    // tier_zero_profile into the `profile, visual_profile` select would make
    // that row null on EVERY generation until the migration lands, silently
    // taking the container template and the observed-visual block with it.
    expect(CODE).toMatch(/\.select\('tier_zero_profile'\)/)
    expect(CODE).toMatch(/\.select\('profile, visual_profile'\)/)
    expect(CODE).not.toMatch(/\.select\('profile, visual_profile, tier_zero_profile'\)/)
  })

  it('and renders it into the prompt slot, not into a variable nobody uses', () => {
    // "Reaches the prompt" means the append was found. containerBlock is the
    // slot every other reference-derived field goes through.
    expect(CODE).toMatch(/measuredFromFileBlockInline\(/)
    expect(CODE).toMatch(/if \(measuredBlock\) containerBlock \+=/)
  })

  it('is a SEPARATE block from the model’s reading of the stills', () => {
    // ⚠️ IF THESE EVER MERGE, the prompt stops distinguishing arithmetic from a
    // model's guess — and that distinction is the only reason Tier 0 is worth
    // more than the visual pass on the day the quota runs out.
    const measured = CODE.indexOf('measuredFromFileBlockInline(')
    const observed = CODE.indexOf('observedVisualBlockInline(')
    expect(measured).toBeGreaterThan(-1)
    expect(observed).toBeGreaterThan(-1)
    expect(measured).not.toBe(observed)
    expect(BP).toMatch(/MEASURED FROM THE REFERENCE’S FILE, not read by a model/)
  })

  it('does NOT inflate the model’s own observed-field count', () => {
    // observedVisualCountInline means "fields the MODEL observed". Folding
    // arithmetic into it would overstate what the model actually saw.
    // ⚠️ SCOPED TO THE FUNCTION BODY. A first version searched for
    // `observedVisualCountInline` followed by "tier zero" anywhere within 200
    // characters and FAILED — because it matched the CALL SITE, which now sits
    // directly above the new Tier 0 lines. The TEST was wrong, not the code:
    // the same mention-vs-call trap this repo has hit twice, committed here in
    // a guard written to avoid it.
    const countFn = CODE.slice(
      CODE.indexOf('function observedVisualCountInline'),
      CODE.indexOf('\n}', CODE.indexOf('function observedVisualCountInline')) + 2,
    )
    expect(countFn).toMatch(/visualPassRan \? profile\.fieldsObserved : 0/)
    expect(countFn).not.toMatch(/tier_?[Zz]ero/)
  })

  it('states numbers and REFUSES to label the format', () => {
    // ⚖️ No montage/talking-head verdict: that needs a threshold, and none has
    // been measured on this product's references. referenceTierZero.ts refuses
    // the same classification for the same reason, and a label is far easier for
    // a model to over-trust than the numbers under it.
    const fn = CODE.slice(CODE.indexOf('function measuredFromFileBlockInline'),
      CODE.indexOf('function observedVisualCountInline'))
    expect(fn.length).toBeGreaterThan(200)
    expect(fn).not.toMatch(/montage|talking[_ -]?head|fast[_ -]?cut/i)
  })

  it('omits an absent number rather than defaulting it to zero', () => {
    // ⚠️ ABSENT IS NOT ZERO. A reference with no cuts and a reference nobody
    // scanned are opposite facts.
    const fn = CODE.slice(CODE.indexOf('function measuredFromFileBlockInline'),
      CODE.indexOf('function observedVisualCountInline'))
    expect(fn).toMatch(/Number\.isFinite/)
    expect(fn).toMatch(/!== null/)
    // zero cuts is a REAL finding and gets its own sentence
    expect(fn).toMatch(/never cuts/)
  })
})
