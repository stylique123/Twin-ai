import { describe, expect, it } from 'vitest'
import { beatVoice, isSilentBeat } from '../silentBeat'
import { isWhollyPlaceholder } from '../../containerResolution'

describe('the marker production actually stores', () => {
  it('recognises [No spoken audio]', () => {
    expect(isSilentBeat('[No spoken audio]')).toBe(true)
    expect(isSilentBeat('  [no spoken audio]  ')).toBe(true)
  })

  // ⚠️ THE DISTINCTION THIS MODULE EXISTS TO DRAW. `isWhollyPlaceholder` is
  // true for BOTH, which is why the hook was being pasted over silence. If
  // this ever stops being true the bug is gone, but so is the reason for this
  // module and somebody should know.
  it('is a placeholder to the old check, which is the whole problem', () => {
    expect(isWhollyPlaceholder('[No spoken audio]')).toBe(true)
    expect(isWhollyPlaceholder('[Hook Option 1]')).toBe(true)
    expect(isSilentBeat('[No spoken audio]')).toBe(true)
    expect(isSilentBeat('[Hook Option 1]')).toBe(false)
  })

  it('the three hook placeholders in production are NOT silence', () => {
    for (const p of ['[Insert Hook Option]', '[Hook Option 1]', '[Insert selected hook from above]']) {
      expect(isSilentBeat(p), p).toBe(false)
    }
  })
})

describe('a marker phrase inside a real sentence is speech', () => {
  // ⚠️ THE FALSE POSITIVE THAT WOULD DELETE A CREATOR'S WORDS.
  it('only the whole line counts', () => {
    expect(isSilentBeat('There is no dialogue that fixes a bad offer.')).toBe(false)
    expect(isSilentBeat('[SHOW: the settings page]')).toBe(false)
    expect(isSilentBeat('Silent treatment is the worst sales tactic there is.')).toBe(false)
    expect(isSilentBeat('[no spoken audio] and then you say the line')).toBe(false)
  })

  it('and a non-string is never silence', () => {
    for (const v of [null, undefined, 3, {}, []]) expect(isSilentBeat(v)).toBe(false)
  })
})

describe('three states, because absent is not zero', () => {
  it('separates spoken, silent and unwritten', () => {
    expect(beatVoice('You hold up the invoice.')).toBe('spoken')
    expect(beatVoice('[No spoken audio]')).toBe('silent')
    expect(beatVoice('')).toBe('unwritten')
    expect(beatVoice('   ')).toBe('unwritten')
    expect(beatVoice(null)).toBe('unwritten')
  })

  // ⚖️ SILENCE IS NOT A DEBT. "Nobody speaks here" is a finished instruction;
  // reporting it as a line the creator still owes would send them to write
  // words the writer deliberately left out.
  it('silence is never unwritten', () => {
    expect(beatVoice('[No spoken audio]')).not.toBe('unwritten')
  })
})
