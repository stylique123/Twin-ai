import { describe, it, expect } from 'vitest'
import { syncRetentionMapToScript } from '../retentionMapSync.js'

// ⚠️ FIX 5 (Wave 2). The four-run harness (`liveRunFixtures.test.ts` §5)
// documents the shipped defect on FROZEN evidence: run B's retention map
// ends on the reference's lead-magnet CTA instead of the shipped save-this
// CTA, run C's includes "The pivot" — a beat the shot list resync (Fix 4)
// already proved the teleprompter never shows — and run D's claims 6
// structural beats for a 5-scene script. Those fixtures stay `it.fails`
// forever; this file is the live proof the FIX works.

describe('syncRetentionMapToScript', () => {
  it('run-c-shaped: drops a retention-map beat ("The pivot") the final script does not have', () => {
    const retentionMap = [
      { beat: 'Hook', goal: 'State the promise and the count.' },
      { beat: 'Reason 1', goal: 'Promotion.' },
      { beat: 'Reason 2', goal: 'Product.' },
      { beat: 'Reason 3', goal: 'Culture.' },
      { beat: 'The pivot', goal: 'Reframe toward scale.' },
      { beat: 'CTA', goal: 'Close.' },
    ]
    const finalScript = [
      { section: 'Hook', line: '3 reasons you are losing customers...' },
      { section: 'Reason 1', line: 'Number one, you promote inconsistently...' },
      { section: 'Reason 2', line: 'Number two, your offer sounds like...' },
      { section: 'Reason 3', line: 'Ask fallback line.' },
      { section: 'CTA', line: 'Follow for more.' },
    ]

    const result = syncRetentionMapToScript(retentionMap, finalScript)

    expect(result.retentionMap).toHaveLength(finalScript.length)
    expect(result.retentionMap.map((r) => r.beat)).toEqual([
      'Hook', 'Reason 1', 'Reason 2', 'Reason 3', 'CTA',
    ])
    expect(result.retentionMap.some((r) => r.beat === 'The pivot')).toBe(false)
    expect(result.dropped).toBe(1)
    expect(result.matched).toBe(5)
  })

  it('run-b-shaped: a CTA-entity repair renames the CTA beat and the panel now matches the shipped CTA, not the reference lead magnet', () => {
    const retentionMap = [
      { beat: 'Hook', goal: 'Open with the surprising claim.' },
      { beat: 'Build', goal: 'Add proof.' },
      { beat: 'CTA', goal: 'Push the lead magnet — grab the free guide.' },
    ]
    // The CTA-entity fallback (Fix 2) rewrote the section itself, not just
    // the line, in this shaped example — simulating a repair pass that
    // relabels a beat.
    const finalScript = [
      { section: 'Hook', line: 'Here is the surprising claim.' },
      { section: 'Build', line: 'Here is the proof.' },
      { section: 'Save-this CTA', line: 'Save this so you can come back to it.' },
    ]

    const result = syncRetentionMapToScript(retentionMap, finalScript)

    expect(result.retentionMap).toHaveLength(3)
    const cta = result.retentionMap[2]!
    expect(cta.beat).toBe('Save-this CTA')
    // No original row named "Save-this CTA", so the lead-magnet goal is
    // never carried forward onto a beat that no longer pushes a lead magnet.
    expect(cta.goal).not.toMatch(/lead magnet/i)
    // Hook and Build kept their names; only the CTA section was renamed.
    expect(result.matched).toBe(2)
  })

  it("a SAME-NAMED row's goal is still discarded — a surviving beat name is not proof the content survived", () => {
    // Shaped after run-b: the final section is still literally "CTA", same
    // as the model's original row, but the model's goal describes the
    // REFERENCE's lead-magnet CTA while the shipped line is a save-this CTA.
    const retentionMap = [
      { beat: 'Hook', goal: 'a' },
      { beat: 'CTA', goal: 'Lead magnet — comment a word to get the freebie.' },
    ]
    const finalScript = [
      { section: 'Hook', line: 'x' },
      { section: 'CTA', line: 'Save this video so you have it later.' },
    ]

    const result = syncRetentionMapToScript(retentionMap, finalScript)

    expect(result.matched).toBe(2)
    expect(result.retentionMap[1]!.beat).toBe('CTA')
    expect(result.retentionMap[1]!.goal).not.toMatch(/lead magnet/i)
  })

  it('run-d-shaped: never claims more structural beats than the final script has', () => {
    const retentionMap = [
      { beat: 'Hook', goal: 'a' }, { beat: 'Scene 2', goal: 'b' }, { beat: 'Scene 3', goal: 'c' },
      { beat: 'Scene 4', goal: 'd' }, { beat: 'Scene 5', goal: 'e' }, { beat: 'Scene 6', goal: 'f' },
    ]
    const finalScript = [
      { section: 'Hook', line: '1' }, { section: 'Scene 2', line: '2' }, { section: 'Scene 3', line: '3' },
      { section: 'Scene 4', line: '4' }, { section: 'Scene 5', line: '5' },
    ]

    const result = syncRetentionMapToScript(retentionMap, finalScript)

    expect(result.retentionMap).toHaveLength(5)
    expect(result.dropped).toBe(1)
  })

  it('handles a null/missing retention map and empty script without throwing', () => {
    expect(syncRetentionMapToScript(null, null).retentionMap).toEqual([])
    expect(syncRetentionMapToScript(undefined, []).retentionMap).toEqual([])
    expect(syncRetentionMapToScript([{ beat: 'Hook' }], []).retentionMap).toEqual([])
  })

  it('synthesizes a distinct goal for hook vs closing beats when nothing matches', () => {
    const finalScript = [
      { section: 'Hook', line: 'x' },
      { section: 'Middle', line: 'y' },
      { section: 'CTA', line: 'z' },
    ]
    const result = syncRetentionMapToScript([], finalScript)
    expect(result.retentionMap).toHaveLength(3)
    expect(result.retentionMap[0]!.goal).toMatch(/attention|three seconds/i)
    expect(result.retentionMap[2]!.goal).toMatch(/close|land/i)
    expect(result.synthesized).toBe(3)
  })
})
