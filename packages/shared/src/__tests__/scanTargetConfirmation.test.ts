// THE REAL SCAN, AS A FIXTURE.
//
// Every case below is data measured on 2026-08-11 from a live Apify run, not
// invented. The CarterPCs pair is the defect this module exists for.
import { describe, expect, it } from 'vitest'
import {
  assessScanTarget, mayBuildDnaFrom, type ScanTargetFacts,
} from '../scanTargetConfirmation'

const base: ScanTargetFacts = {
  requestedHandle: 'x', resolvedHandle: 'x', displayName: 'X',
  audience: 1000, postCount: 10, sampleTitle: null, missing: false,
}

/** MEASURED: the channel `@CarterPCs` actually resolves to. */
const IMPOSTOR: ScanTargetFacts = {
  requestedHandle: 'CarterPCs', resolvedHandle: 'carterpcs', displayName: 'five',
  audience: 146, postCount: 3,
  sampleTitle: 'I just want a PC from carter @actuallycarterpcs', missing: false,
}

/** MEASURED: the account the creator actually meant. */
const REAL_CARTER: ScanTargetFacts = {
  requestedHandle: 'actuallycarterpcs', resolvedHandle: 'actuallycarterpcs',
  displayName: 'CarterPCs', audience: 3150000, postCount: 50,
  sampleTitle: 'it’s been 5 years on CarterPCs.. #carterpcs #tech', missing: false,
}

/** MEASURED: a legitimate account whose display name is nothing like its handle
 *  in length, but is obviously the same person. */
const JOHNNY: ScanTargetFacts = {
  requestedHandle: 'johnnyytech', resolvedHandle: 'johnnyytech', displayName: 'Johnny',
  audience: 60000, postCount: 270,
  sampleTitle: 'Is this the PERFECT Foldable phone design? #samsungzfold8', missing: false,
}

describe('the account that resolves is not always the account they meant', () => {
  it('flags the real impostor — signals disagree', () => {
    const a = assessScanTarget(IMPOSTOR)
    expect(a.verdict).toBe('suspect')
    expect(a.codes).toContain('name_unrelated_to_handle')
    expect(a.codes).toContain('credits_another_account')
    // And it hands the creator the account they probably wanted.
    expect(a.summary).toContain('@actuallycarterpcs')
  })

  it('does NOT flag it for being small — that rule would be worse than the bug', () => {
    // 146 subscribers is a real customer. Strip the disagreeing signals and the
    // same tiny account must come back clean.
    const smallButHonest = { ...IMPOSTOR, displayName: 'CarterPCs', sampleTitle: 'my first build' }
    expect(assessScanTarget(smallButHonest).verdict).toBe('plausible')
  })

  it('passes both real accounts, including a short display name', () => {
    expect(assessScanTarget(REAL_CARTER).verdict).toBe('plausible')
    expect(assessScanTarget(JOHNNY).verdict).toBe('plausible')
  })

  it('shows the audience and never judges it', () => {
    expect(assessScanTarget(REAL_CARTER).summary).toContain('3,150,000')
    expect(assessScanTarget(JOHNNY).summary).toContain('60,000')
  })
})

describe('the three-state rule holds here too', () => {
  it('an unread post count is not zero posts', () => {
    expect(assessScanTarget({ ...base, postCount: null }).codes).not.toContain('no_posts')
    expect(assessScanTarget({ ...base, postCount: 0 }).codes).toContain('no_posts')
  })

  it('an unread audience says so rather than showing 0', () => {
    expect(assessScanTarget({ ...base, audience: null }).summary).toContain('audience not read')
  })
})

describe('a missing account is refused outright', () => {
  it('names the fix instead of just failing', () => {
    // MEASURED: @justicebuys returned CHANNEL_DOES_NOT_EXIST.
    const a = assessScanTarget({ ...base, requestedHandle: 'justicebuys', missing: true })
    expect(a.verdict).toBe('missing')
    expect(a.summary).toMatch(/address bar/)
    expect(mayBuildDnaFrom(a, true)).toBe(false)
  })
})

describe('nothing is built from an unconfirmed account', () => {
  it('PLAUSIBLE IS NOT CONFIRMED — the whole point of the module', () => {
    // "Nothing looked wrong" is a far weaker claim than a person saying "yes,
    // that is me", and conflating them is how the impostor scan succeeded.
    const ok = assessScanTarget(REAL_CARTER)
    expect(ok.verdict).toBe('plausible')
    expect(mayBuildDnaFrom(ok, false)).toBe(false)
    expect(mayBuildDnaFrom(ok, true)).toBe(true)
  })

  it('a confirmed suspect is allowed — the creator overrules the heuristic', () => {
    // They know which account is theirs. This flags; it does not veto.
    expect(mayBuildDnaFrom(assessScanTarget(IMPOSTOR), true)).toBe(true)
  })
})
