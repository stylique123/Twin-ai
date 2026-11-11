import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as shared from '../index'

// ⚠️ THE DEFECT THIS EXISTS TO CATCH IS THE ONE I SHIPPED. `scanFailure.ts`
// merged with a full taxonomy, thirteen passing tests, and a PR describing the
// creator-facing fix — while the onboarding screen still told a creator with a
// large, unambiguously PUBLIC account that it "may be private". The module was
// not merely uncalled: IT WAS NOT EXPORTED FROM THE INDEX, so apps/web could not
// have imported it even by trying.
//
// ⚖️ "IT IS BUILT" AND "A CREATOR SEES IT" ARE DIFFERENT CLAIMS, and this repo
// keeps proving they come apart: questionRegistry, entityStatus,
// mayGenerateClaims, compileCreatorProfile, assembleCreatorProfile — all
// written, all tested, none reachable from the running product.

const repo = join(import.meta.dirname, '..', '..', '..', '..')
const ONBOARDING = readFileSync(
  join(repo, 'apps', 'web', 'src', 'pages', 'Onboarding.tsx'), 'utf8',
)
/** Comments are not code — an earlier guard here failed by matching the comment
 *  that explained the bug. */
const code = ONBOARDING.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

describe('the module is reachable at all', () => {
  // ⚠️ THE FIRST THING THAT WAS WRONG, AND THE EASIEST TO MISS. A barrel omission
  // makes "nothing imports it" look like a decision.
  it('is exported from the package index', () => {
    expect(typeof shared.scanFailure).toBe('function')
    expect(typeof shared.readScanFailure).toBe('function')
    expect(Array.isArray(shared.SCAN_FAILURE_CAUSES)).toBe(true)
  })

  it('and so are the other modules written beside it', () => {
    expect(typeof shared.productSceneGuidance).toBe('function')
    expect(Array.isArray(shared.AUDITED_QUESTIONS)).toBe(true)
    expect(Array.isArray(shared.BACKLOG_BATCHES)).toBe(true)
  })
})

describe('the onboarding screen actually uses it', () => {
  it('imports the taxonomy', () => {
    expect(code).toMatch(/readScanFailure/)
    expect(code).toMatch(/scanFailure\(/)
  })

  it('renders the classified message rather than a raw server string', () => {
    expect(code).toMatch(/setErr\(f\.message\)/)
  })
})

describe('the blame is conditional, which was the whole point', () => {
  // ⚠️ THE ORIGINAL HARM: a hardcoded tip telling the creator to "pick a public
  // account" appeared under EVERY failure, including ours. It sent the owner to
  // check a privacy setting that was never the problem.
  // ⚖️ PART 2 (Connect board): the "make it public" advice is now tied to the
  // ACCOUNT_PRIVATE cause itself, which is stricter than creatorCanFix, and
  // never appears for a failure that is ours.
  it('the public-account advice only appears for a private account', () => {
    const at = code.indexOf('Make it public')
    expect(at).toBeGreaterThan(-1)
    expect(code.slice(Math.max(0, at - 260), at)).toMatch(/case 'ACCOUNT_PRIVATE'/)
    expect(code.split('Make it public').length).toBe(2)
  })

  // ⚖️ The owner's Part 2 rule: every named failure offers another platform,
  // so the buttons follow `tryAnotherPlatform` alone.
  it('offers another platform whenever the cause allows it', () => {
    expect(code).toMatch(/failure\?\.tryAnotherPlatform && others\.length > 0/)
  })
})

describe('a cause is never guessed from prose', () => {
  // ⚖️ THE TEMPTATION WAS TO PATTERN-MATCH THE SERVER'S MESSAGE for words like
  // "private". That is precisely the guess the taxonomy exists to replace: it
  // would resurrect the original bug behind a nicer-looking API.
  it('classifies from a cause field, not from the message text', () => {
    expect(code).toMatch(/readScanFailure\(\(res as \{ cause\?: unknown \}\)\.cause\)/)
    expect(code).not.toMatch(/readScanFailure\(res\.error/)
  })

  it('an unrecognised cause lands on UNKNOWN, which is worded as ours', () => {
    const f = shared.readScanFailure('something the server has never sent')
    expect(f.cause).toBe('UNKNOWN')
    expect(f.creatorCanFix).toBe(false)
    expect(f.message.toLowerCase()).not.toContain('private')
  })

  it('a timeout is never reported as a fact about their account', () => {
    const f = shared.scanFailure('UNKNOWN')
    expect(f.message.toLowerCase()).not.toMatch(/private|public account/)
  })
})
