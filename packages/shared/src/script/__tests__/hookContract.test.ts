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

/**
 * THE PROMPT MUST QUOTE THE SAME NUMBERS THE CHECK ENFORCES.
 *
 * ⚠️ MEASURED BEFORE THIS WAS TIGHTENED, ACROSS 90 SHIPPED HOOKS (18
 * generations, 27 Aug - 2 Sep 2026): 51 ran over 12 words, 30 over 14, mean
 * 17.8 when over, longest 23. The instruction at the time said "under ~12
 * words" — a hedge inside a run-on sentence that also demanded ordering,
 * scroll-stopping and two triggers. Those numbers are the PRE-REGISTERED
 * BASELINE for judging whether the reworded instruction did anything.
 *
 * ⚖️ AND THIS TEST EXISTS BECAUSE A PROMPT AND A CONSTANT DRIFT SILENTLY. If
 * HOOK_TARGET_WORDS moves to 10 and the prompt still says 12, the writer is
 * told one rule and judged by another, and the audit counts a violation the
 * writer was never asked to avoid. Same failure class as a check constraint
 * disagreeing with the type that feeds it.
 */
describe('the prompt states the same hook length the contract enforces', () => {
  const repo = join(import.meta.dirname, '..', '..', '..', '..', '..')
  const bp = readFileSync(join(repo, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
  const line = bp.split('\n').find((l) => l.includes('HOOK LENGTH IS A COUNT'))

  it('the instruction exists to be compared', () => {
    expect(line, 'the hook-length prompt line was not found').toBeTruthy()
  })

  it('quotes the target and the ceiling, both from this module', () => {
    expect(line).toContain(`${HOOK_TARGET_WORDS} words or fewer`)
    expect(line).toContain(`over ${HOOK_MAX_WORDS} words`)
  })

  it('states it as a count to perform, not an approximation to feel', () => {
    // ⚠️ THE HEDGE WAS THE DEFECT. "under ~12 words" invites 13 and got 17.8.
    expect(line).toMatch(/count the words/i)
    expect(line ?? '').not.toMatch(/~\s*\d+\s*words/)
  })

  it('names the real consequence, which the code actually performs', () => {
    // applyHookContract demotes rather than deletes; saying so is true, and a
    // consequence the writer can act on beats an unexplained limit.
    expect(line).toMatch(/DEMOTED/)
  })
})

/**
 * ⚠️ THE RULE IS ONLY REAL IF THE WRITER RUNS IT. Every check in this repo that
 * turned out to be decoration passed a token search while the call site was
 * gone. So this pins the CALL, the ORDER, and the DESTINATION.
 */
describe('the writer actually applies the contract', () => {
  const repo = join(import.meta.dirname, '..', '..', '..', '..', '..')
  const bp = readFileSync(join(repo, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

  it('imports the generated copy, not a second hand-written rule', () => {
    expect(bp).toMatch(/import \{ applyHookContract \} from '\.\.\/_shared\/hookContract\.ts'/)
  })

  // ⚠️ AFTER THE RESCUE POINT. A hook contract may never cost a creator the
  // script they paid for — the whole reason the rescue clone exists.
  it('runs after the rescue point, never before it', () => {
    const rescue = bp.indexOf('rescue = { bp: structuredClone(')
    const call = bp.indexOf('applyHookContract(')
    expect(rescue).toBeGreaterThan(-1)
    expect(call).toBeGreaterThan(rescue)
  })

  // ⚖️ AND IT IS WRAPPED, so a throw inside the contract is silence rather than
  // a lost generation.
  it('the call site cannot throw a generation away', () => {
    const at = bp.indexOf('applyHookContract(')
    const around = bp.slice(at - 400, at + 900)
    expect(around).toMatch(/try \{/)
    expect(around).toMatch(/catch \{ \/\* never fail a generation on a hook contract \*\//)
  })

  // ⚠️ THE COUNTER LANDS SOMEWHERE THAT OUTLIVES AN EDGE LOG. A console line
  // expires in days; the question this counter answers takes months.
  it('writes the audit into beat_audit, not only into a log line', () => {
    expect(bp).toMatch(/hook_length: hookLengthAudit/)
    const decl = bp.indexOf('let hookLengthAudit')
    const write = bp.indexOf('hookLengthAudit = {')
    const read = bp.indexOf('hook_length: hookLengthAudit')
    expect(decl).toBeGreaterThan(-1)
    expect(write).toBeGreaterThan(decl)
    expect(read).toBeGreaterThan(write)
  })

  // ⚖️ NULL, NOT ZERO, WHEN THE CONTRACT NEVER RAN. "No hook was over length"
  // and "we never looked" are different facts and must not share a value.
  it('the audit defaults to null rather than an empty count', () => {
    expect(bp).toMatch(/let hookLengthAudit: Record<string, number> \| null = null/)
  })
})

/**
 * ⚖️ ONE AUTHOR, MECHANICALLY COPIED. Every other two-copy rule here is hand
 * written under the `…Inline` convention; this one is generated, because a hand
 * copy in this repo once kept a bug after the original was fixed.
 */
describe('the edge copy is generated from this source', () => {
  const repo = join(import.meta.dirname, '..', '..', '..', '..', '..')
  const gen = readFileSync(join(repo, 'supabase', 'functions', '_shared', 'hookContract.ts'), 'utf8')

  it('says where it came from and forbids hand edits', () => {
    expect(gen).toMatch(/GENERATED FROM packages\/shared\/src\/script\/hookContract\.ts — DO NOT EDIT/)
  })

  it('is registered with the generator that CI diffs', () => {
    const g = readFileSync(join(repo, 'scripts', 'ci', 'generate_shared_pilot_core.mjs'), 'utf8')
    expect(g).toMatch(/'packages\/shared\/src\/script\/hookContract\.ts', 'supabase\/functions\/_shared\/hookContract\.ts'/)
  })

  it('carries the same ceiling as the source, byte for byte', () => {
    expect(gen).toContain(`export const HOOK_MAX_WORDS = ${HOOK_MAX_WORDS}`)
    expect(gen).toContain(`export const HOOK_TARGET_WORDS = ${HOOK_TARGET_WORDS}`)
  })
})
