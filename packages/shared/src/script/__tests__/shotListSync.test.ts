import { describe, it, expect } from 'vitest'
import { syncShotListSpokenText } from '../shotListSync.js'

// ⚠️ FIX 4 (Wave 2). The four-run harness (`liveRunFixtures.test.ts` §4)
// documents the shipped defect on FROZEN evidence: run A's shot list quotes
// a non-selected hook option, run B's Hook row carries an extra sentence,
// run C has an entire extra shot-list beat the teleprompter never shows.
// Those fixtures stay `it.fails` forever — they are historical snapshots of
// real generations, not something re-run through today's pipeline. This
// file is the live proof the FIX works: it simulates exactly what Fix 1/2/3
// and the other post-generation repairs do — mutate `script[i].line` in
// place, after `shot_list` was already written — and asserts the resync
// catches it.

describe('syncShotListSpokenText', () => {
  it('run-c-shaped: a CTA rewritten by the CTA-entity fallback (Fix 2) reaches the shot list', () => {
    // shot_list and script agree at generation time...
    const shotList = [
      { shot: 'Opening line', framing: 'Close', notes: '', shot_type: 'talking_head', spoken_text: 'Here is the hook.' },
      {
        shot: 'Call to action',
        framing: 'Medium',
        notes: '',
        shot_type: 'talking_head',
        spoken_text: 'We partner with founders to scale their businesses at Acquisition dot com.',
      },
    ]
    const originalScript = [
      { section: 'Hook', line: 'Here is the hook.' },
      { section: 'CTA', line: 'We partner with founders to scale their businesses at Acquisition dot com.' },
    ]
    // ...then, exactly like generate-blueprint's CTA-entity repair pass,
    // `script[1].line` is rewritten in place AFTER shot_list was written.
    const finalScript = originalScript.map((b, i) =>
      (i === 1 ? { ...b, line: 'Follow for more, and check the link in my bio.' } : b))

    const result = syncShotListSpokenText(shotList, finalScript)

    expect(result.shots[1]!.spoken_text).toBe('Follow for more, and check the link in my bio.')
    expect(result.shots[1]!.spoken_text).not.toContain('Acquisition')
    // The hook row, untouched by the repair, is untouched by the sync too.
    expect(result.shots[0]!.spoken_text).toBe('Here is the hook.')
    expect(result.resynced).toBe(1)
    expect(result.orphaned).toBe(0)
  })

  it('run-a-shaped: the shot list quoting a non-selected hook option is corrected to the shipped hook', () => {
    const shotList = [
      { shot: 'Hook', framing: '', notes: '', shot_type: 'talking_head', spoken_text: 'Option 3: nobody talks about this.' },
    ]
    const finalScript = [{ section: 'Hook', line: 'The shipped hook, chosen by the creator.' }]

    const result = syncShotListSpokenText(shotList, finalScript)

    expect(result.shots[0]!.spoken_text).toBe('The shipped hook, chosen by the creator.')
    expect(result.resynced).toBe(1)
  })

  it('run-c-shaped: an extra shot-list beat with no matching final beat is blanked, not left stale', () => {
    const shotList = [
      { shot: 'Hook', framing: '', notes: '', shot_type: 'talking_head', spoken_text: 'The hook.' },
      { shot: 'The pivot', framing: '', notes: '', shot_type: 'talking_head', spoken_text: 'A whole extra beat.' },
      { shot: 'Cover frame', framing: '', notes: '', shot_type: 'cover_frame', spoken_text: '' },
    ]
    // The final script has only ONE speaking beat — "The pivot" never
    // survived to the teleprompter.
    const finalScript = [{ section: 'Hook', line: 'The hook.' }]

    const result = syncShotListSpokenText(shotList, finalScript)

    expect(result.shots[0]!.spoken_text).toBe('The hook.')
    expect(result.shots[1]!.spoken_text).toBe('')
    // The cover-frame row (already empty) is passed through untouched.
    expect(result.shots[2]).toBe(shotList[2])
    expect(result.orphaned).toBe(1)
  })

  it('a beat that resolved to silence syncs the shot list to silence too', () => {
    const shotList = [
      { shot: 'B-roll beat', framing: '', notes: '', shot_type: 'b_roll', spoken_text: 'A line that used to be spoken.' },
    ]
    const finalScript = [{ section: 'Setup', line: '[No spoken audio]' }]

    const result = syncShotListSpokenText(shotList, finalScript)

    expect(result.shots[0]!.spoken_text).toBe('')
    expect(result.resynced).toBe(1)
  })

  it('a cover-frame row with no spoken_text does not consume a beat position', () => {
    const shotList = [
      { shot: 'Cover frame', framing: '', notes: '', shot_type: 'cover_frame', spoken_text: '' },
      { shot: 'Hook', framing: '', notes: '', shot_type: 'talking_head', spoken_text: 'The hook.' },
    ]
    const finalScript = [{ section: 'Hook', line: 'The hook, rewritten.' }]

    const result = syncShotListSpokenText(shotList, finalScript)

    // The cover frame is untouched, and the hook row — the only spoken
    // row — is matched against script[0], not skipped past it.
    expect(result.shots[0]).toBe(shotList[0])
    expect(result.shots[1]!.spoken_text).toBe('The hook, rewritten.')
  })

  it('already-agreeing rows are returned unchanged (no spurious resync count)', () => {
    const shotList = [
      { shot: 'Hook', framing: '', notes: '', shot_type: 'talking_head', spoken_text: 'Already correct.' },
    ]
    const finalScript = [{ section: 'Hook', line: 'Already correct.' }]

    const result = syncShotListSpokenText(shotList, finalScript)

    expect(result.shots[0]).toBe(shotList[0])
    expect(result.resynced).toBe(0)
    expect(result.orphaned).toBe(0)
  })

  it('handles missing/malformed input without throwing', () => {
    expect(syncShotListSpokenText(null, null)).toEqual({ shots: [], resynced: 0, orphaned: 0 })
    expect(syncShotListSpokenText(undefined, [{ line: 'x' }])).toEqual({ shots: [], resynced: 0, orphaned: 0 })
    expect(syncShotListSpokenText([{ spoken_text: 'x' }], undefined).shots[0]!.spoken_text).toBe('')
  })
})
