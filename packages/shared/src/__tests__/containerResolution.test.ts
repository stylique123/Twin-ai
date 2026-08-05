// "Nothing unresolved reaches filming."
//
// The three rules, in order of what they cost when broken:
//
//   1. An INLINE slot is caught. Both prior repairers only matched a whole-line
//      bracket token, so "talk about [product name]" reached the teleprompter
//      and was read aloud.
//   2. A DECLARED CLIP is not a gap. Stripping `[SHOW: …]` would delete the
//      construct Phase 12 item 11 is built on while reporting success.
//   3. An unfilled container is SHOWN, never guessed at. §2.3: an unverified
//      fact never reaches a script, and the alternative to a visible gap is an
//      invented product.
import { describe, expect, it } from 'vitest'
import {
  blockingSlots, findSlots, isWhollyPlaceholder, resolveLine, resolveScript, slotMessage,
} from '../containerResolution'

const HOOK = 'Three tools I stopped paying for'

describe('the leak both prior repairers had', () => {
  it('catches a slot INSIDE a sentence', () => {
    const line = 'Today I want to talk about [product name] and why it matters.'
    const slots = blockingSlots(line, HOOK)
    expect(slots).toHaveLength(1)
    expect(slots[0]).toMatchObject({ kind: 'unfilled_container', inner: 'product name' })
  })

  it('catches two slots on one line as two', () => {
    const line = 'I compared [tool A] against [tool B].'
    expect(blockingSlots(line, HOOK).map((s) => s.inner)).toEqual(['tool A', 'tool B'])
  })

  it('a line with no brackets and no hook prose is clean', () => {
    expect(blockingSlots('This is an ordinary spoken line.', HOOK)).toEqual([])
  })
})

describe('a declared clip is not a gap', () => {
  it('[SHOW: …] never blocks filming', () => {
    // It is the deliberate marker Phase 12 item 11 reads. A resolver that
    // treated every bracket as a gap would delete it and call that success.
    expect(blockingSlots('[SHOW: the settings page]', HOOK)).toEqual([])
    expect(findSlots('[SHOW: the settings page]')[0].kind).toBe('declared_clip')
  })

  it('in any case, because a marker that only counts in capitals becomes a gap', () => {
    expect(findSlots('[show: my desk]')[0].kind).toBe('declared_clip')
    expect(findSlots('[Show: my desk]')[0].kind).toBe('declared_clip')
  })

  it('and it survives resolution rather than being replaced by the hook', () => {
    // The old whole-line rule would have swapped this for the hook text.
    expect(resolveLine('[SHOW: the settings page]', HOOK)).toBe('[SHOW: the settings page]')
    expect(isWhollyPlaceholder('[SHOW: the settings page]')).toBe(false)
  })

  it('a scan reports declared clips rather than discarding them', () => {
    const r = resolveScript(['[SHOW: my desk]', 'ordinary line'], HOOK)
    expect(r.declaredClips).toHaveLength(1)
    expect(r.blocking).toEqual([])
  })
})

describe('only the hook is filled, because only the hook has a known value', () => {
  it('a whole-line hook placeholder becomes the hook', () => {
    expect(resolveLine('[Hook Option 1]', HOOK)).toBe(HOOK)
    expect(resolveLine('[Insert the hook]', HOOK)).toBe(HOOK)
  })

  it('an inline hook placeholder keeps the words around it', () => {
    expect(resolveLine('Okay — [selected hook] — right?', HOOK))
      .toBe(`Okay — ${HOOK} — right?`)
  })

  it('an unfilled container is left EXACTLY as written', () => {
    // §2.3's absolute rule. The alternative to a visible "[product name]" is an
    // invented product name, which costs the creator their credibility.
    const line = 'I recommend [product name].'
    expect(resolveLine(line, HOOK)).toBe(line)
  })

  it('with NO hook, a hook placeholder blocks instead of resolving', () => {
    // Unresolvable is exactly as unfilmable as any other gap.
    expect(blockingSlots('[Hook Option 1]', null)).toHaveLength(1)
    expect(blockingSlots('[Hook Option 1]', '   ')).toHaveLength(1)
    expect(resolveLine('[Hook Option 1]', null)).toBe('[Hook Option 1]')
  })
})

describe('the single authority replaces two divergent copies', () => {
  it('trims — a leading space used to change the answer between screens', () => {
    // One copy trimmed and one did not, so the same line was a placeholder on
    // the plan screen and real dialogue in the recorder.
    expect(isWhollyPlaceholder('  [Hook Option 1]  ')).toBe(true)
  })

  it('an empty line is a placeholder', () => {
    expect(isWhollyPlaceholder('')).toBe(true)
    expect(isWhollyPlaceholder('   ')).toBe(true)
  })

  it('a bracket inside a sentence is NOT a wholly-placeholder line', () => {
    // It is a gap to report, not a line to replace wholesale.
    expect(isWhollyPlaceholder('talk about [product name] now')).toBe(false)
  })

  it('bare hook prose with no brackets is still caught', () => {
    expect(findSlots('insert the hook here')[0].kind).toBe('hook_placeholder')
  })
})

describe('nothing unresolved reaches filming', () => {
  it('a script with a gap reports the line it is on', () => {
    const r = resolveScript(
      ['Clean opener.', 'Then I show you [the thing].', 'Clean close.'], HOOK,
    )
    expect(r.blocking).toHaveLength(1)
    expect(r.blocking[0].lineIndex).toBe(1)
  })

  it('a fully resolved script blocks nothing', () => {
    expect(resolveScript(['One.', '[SHOW: b-roll]', 'Two.'], HOOK).blocking).toEqual([])
  })

  it('the message names the slot, because a named gap is fixable in one edit', () => {
    const [slot] = blockingSlots('about [product name] here', HOOK)
    expect(slotMessage(slot)).toContain('product name')
  })

  it('and an empty bracket says so rather than quoting nothing', () => {
    const [slot] = blockingSlots('about [] here', HOOK)
    expect(slotMessage(slot)).toMatch(/empty gap/i)
  })
})
