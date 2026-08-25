import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  judgeHook, repairHook, applyHookContract, bannedOpener, wordCount,
  BANNED_OPENERS, HOOK_TARGET_WORDS, HOOK_MAX_WORDS,
} from '../hookContract'

/** ⚠️ THE REAL HOOK THAT SHIPPED TO A CREATOR. Not an invented fixture — this is
 *  the recommended hook from the audited script, at 28 words against a 12-word
 *  rule. Every claim about this repair is measured against it. */
const SHIPPED = 'If you are a solo founder in your twenties right now, you need to hear this, '
  + 'because your fear of judgement is literally cementing you into a life you hate'

describe('the rule the prompt states is now decidable', () => {
  // ⚠️ MEASURED, NOT QUOTED. The audit says "~28 words"; counted, it is 30. The
  // approximation was the audit's, the assertion is ours, and an assertion that
  // repeats an estimate as a fact is how a wrong number becomes load-bearing.
  it('the shipped hook is over the ceiling, and by how much', () => {
    const v = judgeHook(SHIPPED)
    expect(v.words).toBe(30)
    expect(v.overMax).toBe(true)
    expect(v.ok).toBe(false)
  })

  it('a hook at the target passes', () => {
    expect(judgeHook('Your fear of judgement is cementing you into a life you hate').ok).toBe(true)
  })

  // ⚖️ THE TOLERANCE IS REAL AND VISIBLE. 13 words is over target and under the
  // ceiling: it ships, and it says it was over target.
  it('13 words ships but is reported over target', () => {
    const v = judgeHook('One two three four five six seven eight nine ten eleven twelve thirteen')
    expect(v.ok).toBe(true)
    expect(v.overTarget).toBe(true)
    expect(v.overMax).toBe(false)
  })

  it('an empty hook is never ok', () => {
    expect(judgeHook('').ok).toBe(false)
    expect(judgeHook('   ').ok).toBe(false)
  })
})

describe('banned openers are matched at the start, on word boundaries', () => {
  it.each([...BANNED_OPENERS])('catches %s', (o) => {
    expect(bannedOpener(`${o} something happens next`)).toBe(o)
  })

  // ⚠️ THE NORMALISATION TRAP. A substring match fires on "Today improvements
  // shipped" for the opener "today i" — the exact class of bug this repo has
  // relearned more than once.
  it('does not fire on a word that merely starts with an opener', () => {
    expect(bannedOpener('Today improvements shipped faster than anyone expected')).toBeNull()
    expect(bannedOpener('Listen, this took me four years')).toBeNull()
  })

  it('an opener fails the hook even at three words', () => {
    expect(judgeHook('Hey guys welcome').ok).toBe(false)
  })
})

describe('the deterministic repair ladder', () => {
  // ⚠️ THE HEADLINE CASE. The shipped 28-word hook must resolve, with no model
  // call, to the clause that actually carries the idea.
  it('rescues the shipped hook by dropping the fused lead-in and its filler', () => {
    const r = repairHook(SHIPPED)
    expect(r.line).toBe('Your fear of judgement is cementing you into a life you hate')
    expect(r.after.ok).toBe(true)
    expect(r.repair).toBe('filler+clause')
    // The spec called this an 11-word cut; it is 12. Asserting what it IS.
    expect(wordCount(r.line)).toBe(12)
    expect(wordCount(r.line)).toBeLessThanOrEqual(HOOK_TARGET_WORDS)
  })

  it('filler alone is enough when it is enough', () => {
    const r = repairHook('This is literally actually the one thing that basically changes all of your results today')
    expect(r.repair).toBe('filler')
    expect(r.after.ok).toBe(true)
  })

  // ⚖️ NEVER AN EDIT NOBODY ASKED FOR. A passing hook comes back untouched even
  // though it contains a filler word.
  it('leaves a passing hook exactly alone', () => {
    const fine = 'I literally lost four clients that week'
    const r = repairHook(fine)
    expect(r.line).toBe(fine)
    expect(r.repair).toBe('none')
  })

  // ⚠️ THE TRUNCATION RULE. Cutting at the connector must not throw away the
  // half that carries the information.
  it('refuses a clause cut that would discard the informative half', () => {
    const h = 'We tested nine hundred landing pages and rewrote every headline, so things improved'
    const r = repairHook(h)
    expect(r.line).not.toBe('Things improved')
  })

  it('never drops a number from the hook', () => {
    const h = 'We ran 47 experiments across three quarters and burned a lot of budget, '
      + 'because the funnel was quietly broken somewhere'
    expect(repairHook(h).line).not.toBe('The funnel was quietly broken somewhere')
  })

  // ⚖️ AN UNREPAIRABLE HOOK KEEPS THE WRITER'S OWN WORDS.
  it('an unrepairable hook is returned unchanged, not half-trimmed', () => {
    const h = 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen'
    const r = repairHook(h)
    expect(r.line).toBe(h)
    expect(r.repair).toBe('unrepairable')
  })

  // ⚠️ A REPAIR MAY ONLY SHORTEN. This is what makes running it before a human
  // sees the script acceptable: no repair can introduce a claim.
  it.each([
    SHIPPED,
    'This is literally the thing that basically changes everything about your morning routine forever',
    'Hey guys today I want to talk about the four mistakes that cost me money',
  ])('introduces no word that was not already there', (h) => {
    const had = new Set(h.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/))
    for (const w of repairHook(h).line.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)) {
      if (w !== '') expect(had.has(w), `"${w}" was not in the original`).toBe(true)
    }
  })
})

describe('all five hooks, not just the recommended one', () => {
  // ⚠️ THIS IS THE WHOLE POINT OF THE FIX. The audit found the recommended hook
  // unchecked; the alternates were unchecked too. Iterating every index is what
  // makes "four are never checked" impossible to reintroduce.
  it('every index is judged, not only index 0', () => {
    const five = [
      'Your fear of judgement is cementing you into a life you hate',
      SHIPPED,
      'Hey guys here is the thing nobody tells you about starting out',
      'I lost four clients in one week',
      'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen',
    ]
    // Counted: hooks 0 (12 words) and 3 (7 words) pass; 1 is 30 words, 2 opens
    // with a banned opener, 4 is 15 words. Three are raw, not four.
    const a = applyHookContract(five)
    expect(a.raw).toBe(3)
    expect(a.hooks.length).toBe(5)
  })

  // ⚖️ DEMOTED, NOT DELETED. Five options exist so the creator can choose, and a
  // dropped hook is a preference datapoint destroyed.
  it('a hook that cannot be repaired sinks to the bottom but still ships', () => {
    const bad = 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen'
    const a = applyHookContract(['Short and sharp today', bad, 'Another fine short hook'])
    expect(a.hooks.length).toBe(3)
    expect(a.hooks[a.hooks.length - 1]).toBe(bad)
    expect(a.shippedOver).toBe(1)
  })

  // ⚠️ THE WRITER'S ORDER IS A SIGNAL. Sorting by length would quietly install
  // "shortest" as the recommendation, a doctrine nobody has tested.
  it('passing hooks keep the order the writer gave them', () => {
    const a = applyHookContract(['Alpha hook here', 'Bravo hook here', 'Charlie hook here'])
    expect(a.hooks).toEqual(['Alpha hook here', 'Bravo hook here', 'Charlie hook here'])
  })

  it('an empty or absent list is an empty audit, never a throw', () => {
    for (const v of [null, undefined, [], ['', '   '], 'nonsense' as never]) {
      expect(() => applyHookContract(v as never)).not.toThrow()
      expect(applyHookContract(v as never).hooks.length).toBe(0)
    }
  })
})

/**
 * ⚠️ THE BAN LIST LIVES TWICE — here and in the writer's SYSTEM prompt — so the
 * shipped sources are compared rather than assumed to agree. This is the same
 * hazard the `…Inline` convention exists for.
 */
describe('the prompt and the check ban the same openers', () => {
  const repo = join(import.meta.dirname, '..', '..', '..', '..', '..')
  const bp = readFileSync(join(repo, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
  const line = bp.split('\n').find((l) => l.includes('Ban weak openers'))

  it('the prompt line exists to be compared', () => {
    expect(line, 'the banned-opener prompt line was not found').toBeTruthy()
  })

  it.each(['hey guys', 'in this video', 'so basically', 'let me tell you'])(
    'the prompt still names %s', (o) => {
      expect((line ?? '').toLowerCase()).toContain(o)
    })
})
