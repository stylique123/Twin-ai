import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { actionKind, pacingFor, quietBeatNote, handsOnVerb, PACING_RULE } from '../actionPacing'

describe('pacing matches the real action (owner addendum)', () => {
  it('times the action from the direction, verbs not nouns', () => {
    expect(actionKind('Trim the base on the wheel while talking')).toBe('hands_on')
    expect(actionKind('Hold it up, then carve the star into the rim')).toBe('hands_on')
    expect(actionKind('Unbox the order on the table')).toBe('multi_step')
    expect(actionKind('Turn the bowl to show the back')).toBe('turn')
    // Nouns and participles are not work.
    expect(actionKind('Point at the bright yellow glaze')).toBe('gesture')
    expect(actionKind('Hold the bowl with the carved star facing the lens')).not.toBe('hands_on')
    expect(actionKind('Put the bandana down on the cutting mat')).toBe('set_down')
    expect(actionKind('Instructive and calm, setting up the problem clearly.')).toBeNull()
  })
  it('a hands-on beat with few words becomes a quiet working beat', () => {
    const [p] = pacingFor([{ line: 'Trim the base.', direction: 'Trim the foot ring on the wheel.' }])
    expect(p.quiet).toBe(true)
    expect(p.seconds).toBe(11)
    expect(quietBeatNote(p, handsOnVerb('Trim the foot ring on the wheel.'))).toMatch(/^Quiet working beat \(about 10s after the words\): don't talk here, just work\. We'll add the sound of the trim/)
  })
  it('a turn, a gesture, or an unwritten line never goes quiet', () => {
    expect(pacingFor([{ line: 'x', direction: 'Rotate it slowly' }])[0].quiet).toBe(false)
    expect(pacingFor([{ line: '', direction: 'Trim the base' }])[0].quiet).toBe(false)
    expect(pacingFor([{ line: 'This is a long enough line that it covers the whole trimming time easily, with words to spare for her.', direction: 'Trim the base' }])[0].quiet).toBe(false)
  })
  it('reaches the writer and runs on every script', () => {
    expect(PACING_RULE).toMatch(/8-15s/)
    const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
    const gb = readFileSync(join(repo, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
    expect(gb.match(/\$\{brainBlock\}\$\{grainBlock\}\$\{PACING_RULE\}/g)?.length).toBe(2)
    expect(gb.indexOf('PACING MATCHES THE REAL ACTION (owner')).toBeLessThan(gb.indexOf('THE SHOT LIST MUST QUOTE THE SCRIPT THAT ACTUALLY SHIPS'))
    expect(gb).toMatch(/beatAudit\.action_pacing = pacingAudit/)
  })
})
