import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { splitEmphasis } from '../emphasis'

describe('shouting leaves the line and becomes direction', () => {
  // ⚠️ THE REAL LINE FROM THE AUDITED SCRIPT.
  it('the shipped caps run is extracted and the line reads normally', () => {
    const r = splitEmphasis('Listen to me: YOU HAVE TIME.')
    expect(r.line).toBe('Listen to me: you have time.')
    expect(r.emphasisWords).toEqual(['you', 'have', 'time'])
    expect(r.runs).toBe(1)
  })

  // ⚖️ THE SENTENCE'S OWN CAPITAL SURVIVES. Otherwise the fix leaves "you have
  // time." mid-paragraph, which reads as a typo rather than as calm delivery.
  it('a run that starts a sentence does not leave it lower case', () => {
    expect(splitEmphasis('YOU HAVE TIME. Nobody is watching the clock.').line)
      .toBe('You have time. Nobody is watching the clock.')
  })

  it('finds more than one run and keeps their order', () => {
    const r = splitEmphasis('It was NOT EASY, and it was NEVER FAST.')
    expect(r.runs).toBe(2)
    expect(r.emphasisWords).toEqual(['not', 'easy', 'never', 'fast'])
    expect(r.line).toBe('It was not easy, and it was never fast.')
  })
})

describe('what it deliberately leaves alone', () => {
  // ⚠️ ONE CAPITALISED WORD IS USUALLY A NAME, A BRAND, OR AN ACRONYM WE HAVE
  // NOT HEARD OF. Lowercasing it would put a mistake in the creator's mouth.
  it.each([
    'I wore my WHOOP for six months.',
    'We shipped it on RAILWAY last year.',
    'That is the STANDARD everyone uses.',
  ])('leaves the single capitalised word in %s', (line) => {
    const r = splitEmphasis(line)
    expect(r.line).toBe(line)
    expect(r.runs).toBe(0)
  })

  // ⚖️ ACRONYMS ARE NOT SHOUTING. Lowercasing "SEO" corrupts the line.
  it.each([
    'Your SEO CTA is the problem.',
    'The CEO CTO split never worked.',
    'I run a B2B SAAS business.',
    'A DIY PDF is still a PDF.',
  ])('does not de-capitalise the acronyms in %s', (line) => {
    expect(splitEmphasis(line).line).toBe(line)
  })

  it('a normal sentence is returned untouched', () => {
    const line = 'I lost four clients in one week and it cost me everything.'
    const r = splitEmphasis(line)
    expect(r.line).toBe(line)
    expect(r.emphasisWords).toEqual([])
    expect(r.runs).toBe(0)
  })

  it.each([null, undefined, '', '   '])('%s never throws', (v) => {
    expect(() => splitEmphasis(v)).not.toThrow()
    expect(splitEmphasis(v).runs).toBe(0)
  })
})

describe('the words it hands to the caption renderer', () => {
  // ⚠️ MATCHABLE. A caption renderer compares against the spoken words, so the
  // emphasis list carries no punctuation and no case.
  it('strips punctuation and case so a renderer can match', () => {
    expect(splitEmphasis('And then — NOTHING HAPPENED!').emphasisWords)
      .toEqual(['nothing', 'happened'])
  })

  // ⚖️ THE LINE KEEPS ITS PUNCTUATION. Only the case changes.
  it('does not strip punctuation from the line itself', () => {
    expect(splitEmphasis('And then — NOTHING HAPPENED!').line)
      .toBe('And then — nothing happened!')
  })

  // ⚠️ SPACING IS PRESERVED EXACTLY. A creator reads this off a teleprompter;
  // silently reflowing their line is an edit nobody asked for.
  it('preserves the original spacing', () => {
    const r = splitEmphasis('Wait.   THIS   MATTERS.')
    expect(r.line).toBe('Wait.   This   matters.')
  })
})

describe('markdown emphasis syntax leaves the line and becomes direction', () => {
  // ⚠️ THE REAL LINE FROM THE SECOND AUDITED SCRIPT.
  it('a single *word* is stripped and joins emphasisWords', () => {
    const r = splitEmphasis('Second, you measure the actual cost of *not* doing it.')
    expect(r.line).toBe('Second, you measure the actual cost of not doing it.')
    expect(r.emphasisWords).toEqual(['not'])
    expect(r.runs).toBe(1)
  })

  it('a single _word_ is stripped and joins emphasisWords', () => {
    const r = splitEmphasis('This is _urgent_ and cannot wait.')
    expect(r.line).toBe('This is urgent and cannot wait.')
    expect(r.emphasisWords).toEqual(['urgent'])
    expect(r.runs).toBe(1)
  })

  it('a **word** double-asterisk span is stripped and joins emphasisWords', () => {
    const r = splitEmphasis('You need to **stop** right now.')
    expect(r.line).toBe('You need to stop right now.')
    expect(r.emphasisWords).toEqual(['stop'])
    expect(r.runs).toBe(1)
  })

  it('a multi-word markdown span is stripped and every word joins emphasisWords', () => {
    const r = splitEmphasis('This is *two words* that matter.')
    expect(r.line).toBe('This is two words that matter.')
    expect(r.emphasisWords).toEqual(['two', 'words'])
    expect(r.runs).toBe(1)
  })

  it('trailing punctuation after the closing marker survives on the line', () => {
    const r = splitEmphasis('Do it *now*, not later.')
    expect(r.line).toBe('Do it now, not later.')
    expect(r.emphasisWords).toEqual(['now'])
  })

  it('a line with both CAPS and markdown emphasis combines into one emphasisWords list', () => {
    const r = splitEmphasis('YOU HAVE TIME, but *not* forever.')
    expect(r.line).toBe('You have time, but not forever.')
    expect(r.emphasisWords).toEqual(['not', 'you', 'have', 'time'])
    expect(r.runs).toBe(2)
  })

  // ⚠️ FALSE-POSITIVE GUARD: a lone marker with no matching close must not be
  // treated as emphasis or corrupt the line.
  it('a lone asterisk used as multiplication is left completely alone', () => {
    const line = 'Two * three is six.'
    const r = splitEmphasis(line)
    expect(r.line).toBe(line)
    expect(r.runs).toBe(0)
    expect(r.emphasisWords).toEqual([])
  })

  it('an unmatched trailing underscore is left completely alone', () => {
    const line = 'The file is named report_.'
    const r = splitEmphasis(line)
    expect(r.line).toBe(line)
    expect(r.runs).toBe(0)
  })

  it('an underscore inside a normal word is left completely alone', () => {
    const line = 'We shipped state_of_the_art tooling.'
    const r = splitEmphasis(line)
    expect(r.line).toBe(line)
    expect(r.runs).toBe(0)
    expect(r.emphasisWords).toEqual([])
  })
})

/**
 * ⚠️ THE SPLIT IS ONLY REAL IF THE WRITER RUNS IT, and only useful if the second
 * reader gets the list. Both are pinned here.
 */
describe('the writer applies the split and the caption packet can read it', () => {
  const repo = join(import.meta.dirname, '..', '..', '..', '..', '..')
  const bp = readFileSync(join(repo, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

  it('imports the generated copy rather than restating the rule', () => {
    expect(bp).toMatch(/import \{ splitEmphasis \} from '\.\.\/_shared\/emphasis\.ts'/)
  })

  // ⚖️ AFTER THE RESCUE POINT, like every other repair here.
  it('runs after the rescue point', () => {
    const rescue = bp.indexOf('rescue = { bp: structuredClone(')
    const call = bp.indexOf('splitEmphasis(b.line)')
    expect(rescue).toBeGreaterThan(-1)
    expect(call).toBeGreaterThan(rescue)
  })

  it('writes the words onto the beat, not only into a log', () => {
    expect(bp).toMatch(/b\.emphasis_words = \[\.\.\.split\.emphasisWords\]/)
  })

  // ⚠️ AND THE LINE IS ONLY TOUCHED WHEN THERE WAS A RUN. A no-op rewrite of
  // every line would churn scripts for nothing.
  it('leaves a clean line completely alone', () => {
    const at = bp.indexOf('splitEmphasis(b.line)')
    expect(bp.slice(at, at + 200)).toMatch(/if \(split\.runs === 0\) continue/)
  })

  // ⚖️ NULL VS ZERO, AGAIN: "no caps to move" and "we never looked" are
  // different facts and do not share a value.
  it('the counter defaults to null and lands in beat_audit', () => {
    expect(bp).toMatch(/let capsRuns: number \| null = null/)
    expect(bp).toMatch(/caps_emphasis_runs: capsRuns/)
  })
})
