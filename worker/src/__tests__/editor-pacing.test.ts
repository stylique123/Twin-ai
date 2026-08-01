// Pacing — the Director's calm/balanced/punchy choice, finally connected.
//
// Until now `directorContract.ts` defined, validated and returned `pacing` and
// `editorCompileInput.ts` never mapped it, so the model spent tokens on a
// decision that changed no video. Connecting it changes how every video could
// look, which makes the safety property below the most important thing in this
// file.
//
// Predeclared controls:
//
//   IDENTITY   `balanced` must resolve to the SAME POLICY OBJECT, not an equal
//              copy. That is what proves enabling pacing cannot alter a video
//              that already renders correctly.
//   NEGATIVE   `balanced` must declare NO overrides — not three numbers that
//              equal today's, which would be free to drift apart from `cuts`
//              later with nothing noticing.
//   REGRESSION a profile must never overwrite a value the caller set. This one
//              is not hypothetical: the first version of this feature spelled
//              `balanced` out as absolute numbers, and resolving it restored
//              cuts.maxCutsPerMinuteMilli to 30000 over whatever a caller had
//              chosen — which silently disabled the existing cut-density
//              tests, since those reach their guard by lowering exactly that
//              value. It read as a no-op only because the numbers matched.
//   MUTATION   giving `balanced` an override must break the identity test —
//              otherwise "balanced is today" is a claim nothing enforces.
//   NEGATIVE   calm and punchy must move the knobs in opposite directions on a
//              REAL compile, not merely hold different numbers in a config.
import { describe, it, expect } from 'vitest'
import { compileEditPlan, resolvePacingCuts, loadEditPolicy, type EditPolicyV1 } from '../jobs/editorCompile.js'
import { baseInput, policy, shippedPolicy } from './fixtures/editPlanFixture.js'

const shipped = (): EditPolicyV1 => shippedPolicy() as EditPolicyV1

describe('THE SAFETY PROPERTY: balanced is today, provably', () => {
  it('returns the SAME OBJECT — identity, not an equal copy', () => {
    // An equal copy would be fine in practice and useless as evidence: it
    // could hide a value that merely happens to match today. Reference
    // identity can only be true if nothing was overridden at all.
    const p = shipped()
    expect(resolvePacingCuts(p, 'balanced')).toBe(p)
  })

  it('an ABSENT pacing is balanced, so a dropped field renders as it always did', () => {
    const p = shipped()
    expect(resolvePacingCuts(p, undefined)).toBe(p)
    expect(resolvePacingCuts(p, null)).toBe(p)
  })

  it('an UNKNOWN pacing falls back to today rather than to the nearest profile', () => {
    const p = shipped()
    expect(resolvePacingCuts(p, 'frantic' as 'punchy')).toBe(p)
  })

  it('NEGATIVE: balanced declares NO overrides at all', () => {
    // Not "three numbers equal to today's" — none. Numbers equal to today's
    // would be free to drift apart from `cuts` later and nothing would notice.
    const p = shipped()
    expect(Object.keys(p.pacing.profiles.balanced)).toHaveLength(0)
  })

  it('REGRESSION: a profile never overwrites a value the caller set', () => {
    // The bug this file caught during its own construction. The first version
    // spelled balanced out as absolute numbers, so resolving it RESTORED
    // cuts.maxCutsPerMinuteMilli to 30000 over whatever a caller had chosen.
    // It read as a no-op purely because the shipped numbers matched — and it
    // silently disabled the existing cut-density tests, which lower exactly
    // this value to reach the guard they exercise.
    const p = shipped()
    p.cuts = { ...p.cuts, maxCutsPerMinuteMilli: 1333 }
    expect(resolvePacingCuts(p, 'balanced').cuts.maxCutsPerMinuteMilli).toBe(1333)
    // ...while a profile that DOES declare the key still overrides it, or the
    // fix would have been "make pacing do nothing".
    expect(resolvePacingCuts(p, 'punchy').cuts.maxCutsPerMinuteMilli).toBe(45000)
  })

  it('MUTATION: give balanced an override and the identity property collapses', () => {
    const p = shipped()
    p.pacing.profiles.balanced = { minRemovalMs: 999 }
    expect(resolvePacingCuts(p, 'balanced')).not.toBe(p)
    expect(resolvePacingCuts(p, 'balanced').cuts.minRemovalMs).toBe(999)
  })

  it('a profile inherits every key it does not declare', () => {
    const p = shipped()
    // punchy deliberately omits minRemovalMs rather than restating the floor.
    expect(p.pacing.profiles.punchy.minRemovalMs).toBeUndefined()
    expect(resolvePacingCuts(p, 'punchy').cuts.minRemovalMs).toBe(p.cuts.minRemovalMs)
    // and it leaves the knobs outside pacing's remit completely alone
    expect(resolvePacingCuts(p, 'punchy').cuts.minKeptSegmentMs).toBe(p.cuts.minKeptSegmentMs)
    expect(resolvePacingCuts(p, 'punchy').cuts.minPhonemeHandleMs).toBe(p.cuts.minPhonemeHandleMs)
  })

  it('a balanced compile is byte-identical to one with no pacing at all', () => {
    const without = compileEditPlan({ ...baseInput(), policy: policy() })
    const bal = baseInput()
    bal.decision = { ...bal.decision, pacing: 'balanced' }
    const withBalanced = compileEditPlan({ ...bal, policy: policy() })
    expect(withBalanced.planSha256).toBe(without.planSha256)
    expect(withBalanced.canonical).toBe(without.canonical)
  })
})

describe('the three profiles move the knobs the way the recommendation says', () => {
  const p = shipped()
  const calm = resolvePacingCuts(p, 'calm').cuts
  const bal = resolvePacingCuts(p, 'balanced').cuts
  const punchy = resolvePacingCuts(p, 'punchy').cuts

  it('calm requires a BIGGER gap before it will cut', () => {
    expect(calm.minRemovalMs).toBeGreaterThan(bal.minRemovalMs)
  })

  it('cut ceiling rises calm -> balanced -> punchy', () => {
    expect(calm.maxCutsPerMinuteMilli).toBeLessThan(bal.maxCutsPerMinuteMilli)
    expect(bal.maxCutsPerMinuteMilli).toBeLessThan(punchy.maxCutsPerMinuteMilli)
  })

  it('the protected pause SHRINKS as pace rises', () => {
    // A deliberate beat before a key word is the main tool a calm delivery
    // has. If calm trimmed those it would just be slow.
    expect(calm.emphasisPauseGuardMs).toBeGreaterThan(bal.emphasisPauseGuardMs)
    expect(bal.emphasisPauseGuardMs).toBeGreaterThan(punchy.emphasisPauseGuardMs)
  })

  it('punchy does NOT cut closer to the words than balanced', () => {
    // The floor exists because minPhonemeHandleMs is 60: every cut already
    // needs 60ms of handle each side, so a removal under ~120ms lands inside
    // natural word spacing and clips speech. That does not sound fast, it
    // sounds broken. Punchy buys speed from the ceiling, not the floor.
    expect(punchy.minRemovalMs).toBe(bal.minRemovalMs)
    expect(punchy.minRemovalMs).toBeGreaterThanOrEqual(2 * p.cuts.minPhonemeHandleMs)
    // and it says so by OMITTING the key, not by restating the number
    expect(p.pacing.profiles.punchy.minRemovalMs).toBeUndefined()
  })

  it('every declared profile id actually exists', () => {
    for (const id of p.pacing.profileIds) expect(p.pacing.profiles[id]).toBeDefined()
    expect(p.pacing.profiles[p.pacing.defaultId]).toBeDefined()
  })
})

describe('it reaches a real compile, not just a config object', () => {
  function compileAt(pacing: 'calm' | 'balanced' | 'punchy') {
    const input = baseInput()
    input.decision = { ...input.decision, pacing, transitionPolicy: 'hard_cuts_only' }
    return compileEditPlan({ ...input, policy: policy() })
  }

  it('calm keeps FEWER cuts than punchy on the same recording', () => {
    // The end-to-end claim. If pacing were still dropped between the decision
    // and the compiler — the exact bug being fixed — these would be equal.
    const calm = compileAt('calm')
    const punchy = compileAt('punchy')
    expect(calm.plan.timeline.removals.length).toBeLessThanOrEqual(punchy.plan.timeline.removals.length)
    expect(calm.cutStats.maxCutsAllowed).toBeLessThan(punchy.cutStats.maxCutsAllowed)
    expect(calm.cutStats.minRemovalMs).toBeGreaterThan(punchy.cutStats.minRemovalMs)
  })

  it('MUTATION: the plan itself changes when the pace does', () => {
    // Guards against a wiring that carries pacing all the way to the compiler
    // and still fails to apply it. Different policy in force must mean a
    // different recorded floor, whatever the fixture's cut count does.
    expect(compileAt('calm').cutStats.minRemovalMs)
      .not.toBe(compileAt('punchy').cutStats.minRemovalMs)
  })

  it('the chosen pace is recorded on the result', () => {
    expect(compileAt('calm').cutStats.pacingId).toBe('calm')
    expect(compileAt('punchy').cutStats.pacingId).toBe('punchy')
  })
})

describe('cut density is MEASURED, because the profile numbers are guesses', () => {
  // edit_policy_v1.json says outright that the three profiles are chosen by
  // reasoning about how short-form content cuts, not measured from our own
  // renders. That is how a 50-minute CI cap got picked against a real 77, and
  // a 25% trim threshold against a real 28.7% case. So the numbers ship WITH
  // the instrument that will correct them — the loudness precedent.
  const r = compileEditPlan({ ...baseInput(), policy: policy() })

  it('reports the realised density, not the ceiling', () => {
    expect(r.cutStats.appliedCuts).toBe(r.plan.timeline.removals.length)
    expect(r.cutStats.domainMs).toBeGreaterThan(0)
  })

  it('the density arithmetic is right', () => {
    const expected = Math.floor((r.cutStats.appliedCuts * 1000 * 60000) / r.cutStats.domainMs)
    expect(r.cutStats.cutsPerMinuteMilli).toBe(expected)
  })

  it('counts what the ceiling gave back', () => {
    const p = policy()
    p.cuts.maxCutsPerMinuteMilli = 1333 // -> maxCuts = 1 over this domain
    const input = baseInput()
    input.decision = { ...input.decision, transitionPolicy: 'hard_cuts_only' }
    const tight = compileEditPlan({ ...input, policy: p })
    expect(tight.cutStats.droppedForDensity).toBeGreaterThan(0)
    expect(tight.cutStats.maxCutsAllowed).toBe(1)
  })

  it('CONTROL: nothing is dropped when the ceiling is not reached', () => {
    expect(r.cutStats.droppedForDensity).toBe(0)
  })

  it('the shipped policy is what a real render uses', () => {
    // loadEditPolicy reads the actual JSON, so this fails if the pacing block
    // was added to a fixture but not to the file the worker ships.
    const live = loadEditPolicy()
    expect(live.pacing).toBeDefined()
    expect(live.pacing.profileIds).toEqual(['calm', 'balanced', 'punchy'])
    expect(live.pacing.defaultId).toBe('balanced')
  })
})
