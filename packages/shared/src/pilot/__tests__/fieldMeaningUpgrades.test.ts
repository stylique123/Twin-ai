// THE SPEC MUST STAY HONEST WHILE IT WAITS.
//
// This file describes a change that has NOT shipped. The risk is that it drifts
// from the questions actually being asked, or quietly loosens into something
// that could be applied without the analyzer version bump.
import { describe, it, expect } from 'vitest'
import {
  FIELD_MEANING_UPGRADES, upgradeFor, UPGRADE_REQUIRES_VERSION,
} from '../fieldMeaningUpgrades'
import { claimNote } from '../claimNote'

describe('the model-side spec', () => {
  it('covers every confusion the owner actually hit', () => {
    for (const path of [
      'camera.positionChanges', 'camera.framingChanges',
      'performance.productInteraction', 'requirements.physicalProduct',
      'requirements.multipleLocations', 'performance.acting', 'people.count',
    ]) {
      expect(upgradeFor(path), `${path} has no upgrade`).not.toBeNull()
    }
  })

  it('every entry says WHY, citing the claim it came from', () => {
    for (const u of FIELD_MEANING_UPGRADES) {
      expect(u.because.length, `${u.path}: because`).toBeGreaterThan(40)
      expect(u.current.length, `${u.path}: current`).toBeGreaterThan(20)
      expect(u.proposed.length, `${u.path}: proposed`).toBeGreaterThan(u.current.length)
    }
  })

  // ⚠️ VALIDATED ON A KNOWN-FAILING CASE. An earlier version of this test
  // hand-checked three paths, and a probe that flipped "does not add a location"
  // to "does add a location" on requirements.multipleLocations PASSED. A guard
  // that only looks at the paths someone remembered is not a guard. This table
  // covers every upgrade, and the test below refuses to let it shrink.
  //
  // Each anchor is a phrase that must appear on BOTH sides. It is the load-bearing
  // clause of the distinction -- flipping its polarity in either place fails here.
  const SHARED_ANCHOR: Record<string, string> = {
    'camera.positionChanges': 'does not count',
    'camera.framingChanges': 'zoom counts',
    'performance.productInteraction': 'something made and sold',
    'requirements.physicalProduct': 'something made and sold',
    'requirements.multipleLocations': 'does not add',
    'performance.acting': 'not a person acting',
    'people.count': 'are not people on camera',
  }

  it('the anchor table covers every upgrade, so it cannot silently shrink', () => {
    expect(Object.keys(SHARED_ANCHOR).sort())
      .toEqual(FIELD_MEANING_UPGRADES.map((u) => u.path).sort())
  })

  it('the proposal never contradicts what the reviewer card already says', () => {
    // ⚠️ THE ASYMMETRY IS THE DEFECT. If the model were asked something the card
    // does not say, the gap would land in the results as a MODEL error.
    for (const u of FIELD_MEANING_UPGRADES) {
      const anchor = SHARED_ANCHOR[u.path]
      const note = claimNote(u.path)
      expect(note, `${u.path}: no reviewer note to agree with`).not.toBeNull()
      expect(u.proposed.toLowerCase(), `${u.path}: proposed drops "${anchor}"`)
        .toContain(anchor)
      expect(note!.toLowerCase(), `${u.path}: card drops "${anchor}"`)
        .toContain(anchor)
    }
  })

  it('names the version bump, so the PR cannot forget it', () => {
    expect(UPGRADE_REQUIRES_VERSION.from).toBe('visual-2')
    expect(UPGRADE_REQUIRES_VERSION.to).toBe('visual-3')
    expect(UPGRADE_REQUIRES_VERSION.why).toContain('componentDigest')
    expect(UPGRADE_REQUIRES_VERSION.why).toContain('visualVersion')
  })

  it('records that it is NOT retroactive for references already analysed', () => {
    expect(UPGRADE_REQUIRES_VERSION.notRetroactive).toContain('NEXT cohort')
  })

  it('THE UPGRADE HAS SHIPPED: the worker now asks the PROPOSED wording', () => {
    // ⚠️ THIS ASSERTION IS INVERTED FROM ITS FIRST VERSION, ON PURPOSE. While the
    // change was only a spec, the invariant was "current still matches the live
    // prompt" — that kept the proposal honest against drift. The moment the
    // upgrade was applied (visual-3), that assertion had to fail, and the real
    // invariant became the stronger one: the worker asks the proposal, and no
    // longer asks the old wording anywhere.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const { join } = require('node:path') as typeof import('node:path')
    const src = readFileSync(
      join(__dirname, '..', '..', '..', '..', '..', 'worker', 'src', 'visualPrompt.ts'), 'utf8')
    for (const u of FIELD_MEANING_UPGRADES) {
      expect(src, `${u.path}: the proposed wording has NOT shipped`).toContain(u.proposed)
      // The old wording is a strict prefix of most proposals, so "no longer
      // present" has to mean "not present as the WHOLE question".
      expect(src, `${u.path}: the old wording is still the whole question`)
        .not.toContain(`'${u.current}',`)
    }
  })

  it('the version bump it named actually happened, in BOTH mirrors', () => {
    // ⚠️ THE SPEC SAID visual-2 -> visual-3 AND WHY. If the questions changed
    // without the stamp, two cohorts answering different questions would carry
    // the same visualVersion and the same componentDigest, and nothing
    // downstream could tell them apart.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const { join } = require('node:path') as typeof import('node:path')
    const root = join(__dirname, '..', '..', '..', '..', '..')
    for (const rel of [
      ['worker', 'src', 'jobs', 'editorManifest.ts'],
      ['packages', 'shared', 'src', 'editor', 'contracts.ts'],
    ]) {
      const src = readFileSync(join(root, ...rel), 'utf8')
      expect(src, `${rel.join('/')} is not at ${UPGRADE_REQUIRES_VERSION.to}`)
        .toContain(`VISUAL_ANALYSIS_VERSION = '${UPGRADE_REQUIRES_VERSION.to}'`)
      expect(src, `${rel.join('/')} still carries ${UPGRADE_REQUIRES_VERSION.from}`)
        .not.toContain(`VISUAL_ANALYSIS_VERSION = '${UPGRADE_REQUIRES_VERSION.from}'`)
    }
  })
})
