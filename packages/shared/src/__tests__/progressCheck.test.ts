// THE FILLER THE CREATORS REFUSED, MADE DECIDABLE.
//
// ⚠️ A PROMPT RULE WAS TRIED FIRST AND FAILED IN MEASUREMENT. "NEVER WRITE A
// PROGRESS CHECK" plus the named phrases halved them (6 -> 3 across 16 scripts)
// and the survivors were the forbidden strings verbatim. The empty-beat share
// did not move. This is the check that instruction should have been.
import { describe, expect, it } from 'vitest'
import { isProgressCheck } from '../knowledgeResolver'

describe('a progress check is a beat that only reports elapsed time', () => {
  it('catches the lines four different creators were given', () => {
    // Verbatim from the cohort A/B, one per creator, all declared `none`.
    for (const l of [
      "You're halfway through! We've still got three more critical mistakes.",
      "Still with me? We've covered two crucial insights.",
      "You're halfway there! Stay tuned for the last two, they're the most important.",
      'Are you ready for the last two? These next points might change how you think.',
    ]) {
      expect(isProgressCheck(l, 'none'), l).toBe(true)
    }
  })

  it('SPARES a re-hook that carries real content', () => {
    // ⚖️ THE PHRASE IS NOT THE DEFECT — the empty beat is. A guard that deleted
    // every occurrence would remove good beats to fix bad ones, which is how a
    // guard earns its way into being switched off.
    expect(isProgressCheck(
      'Still with me? Because the next one cost me four thousand pounds.',
      'creator_knowledge',
    )).toBe(false)
  })

  it('an absent declaration counts as carrying nothing', () => {
    expect(isProgressCheck('Still with me?', undefined)).toBe(true)
    expect(isProgressCheck('Still with me?', '')).toBe(true)
  })

  it('leaves ordinary lines alone', () => {
    for (const l of [
      'Here are five things most people get wrong about building wealth.',
      'I sold a Birkin bag for £13,500 in forty seconds.',
      'Half of your storage is residual files from apps you deleted.',
      'The next step is the one everyone skips.',
    ]) {
      expect(isProgressCheck(l, 'none'), l).toBe(false)
    }
  })
})
