// "THIS BEAT IS YOUR CTA. WHAT HAPPENED?"
//
// ⚠️ REPORTED BY THE OWNER AS THE QUESTIONS INSIDE THE SCRIPT BEING WRONG, AND
// MEASURED ACROSS EVERY GENERATION ON 2026-09-17. Of 98 beat-asks that reached a
// creator, 50 were "Only you can supply this. What would you actually say
// here?" — a placeholder that asks nothing — and eight more were the shape
// below:
//
//   "This beat is your cta. What happened?"        x3
//   "This beat is your hook. What happened?"       x3
//   "This beat is your body. What happened?"       x1
//   "This beat is your consequences. What happened?" x1
//
// ⚠️ THOSE EIGHT ARE `askForBeat`'s OWN LAST RESORT, NOT THE MODEL'S WORDS. It
// spliced the section name into `This beat is your ${s}. What happened?`, which
// is ungrammatical on a plural ("is your consequences") and semantically wrong
// on the two commonest sections: a hook and a CTA are not things that HAPPENED.
//
// ⚖️ THE CAUSE IS COVERAGE, NOT WORDING. Section beats measured in production:
// hook 147, setup 131, re-hook 120, cta 91, payoff 60, body 20, "call to
// action" 10. `setup` and `re-hook` had patterns. `hook`, `cta`, `payoff` and
// `body` — the first, last and middle of every script — did not, so they all
// fell through.
import { describe, it, expect } from 'vitest'
import { askForBeat, askIsGeneric } from '../script/beatAsk'

/** The section names, in production order of frequency. */
const REAL_SECTIONS = [
  'hook', 'setup', 're-hook', 'cta', 'payoff', 'body', 'call to action',
  'escalation', 'solution', 'rehook', 'outro', 'mechanism', 'validation',
  'reframe', 'framework', 'resolution', 'core reframe', 'the value outro',
  'vulnerability pivot', 'consequences',
] as const

/** The placeholder the writer emits when it has nothing. */
const PLACEHOLDER = 'Only you can supply this. What would you actually say here?'

describe('the broken template is gone', () => {
  it('no section produces "This beat is your X. What happened?"', () => {
    for (const s of REAL_SECTIONS) {
      const q = askForBeat(s, PLACEHOLDER)
      expect(q, `${s} still gets the template`).not.toMatch(/^This beat is your/i)
      expect(q).not.toMatch(/is your (consequences|cta|body)\b/i)
    }
  })

  it('and no section is asked "What happened?" about a beat where nothing happens', () => {
    for (const s of ['hook', 'cta', 'call to action', 'outro', 'payoff'] as const) {
      expect(askForBeat(s, PLACEHOLDER), `${s} is asked about an event`)
        .not.toMatch(/What happened\?/i)
    }
  })

  it('every real section gets a question that is a question', () => {
    for (const s of REAL_SECTIONS) {
      const q = askForBeat(s, PLACEHOLDER)
      expect(q.endsWith('?'), `${s} -> "${q}"`).toBe(true)
      expect(q.length).toBeGreaterThan(20)
      // And it must not itself be one of the placeholders we reject.
      expect(askIsGeneric(q), `${s} -> "${q}" is still generic`).toBe(false)
    }
  })
})

describe('the four uncovered sections now have their own question', () => {
  it.each([
    ['hook', /stop someone scrolling/i],
    ['cta', /do after watching/i],
    ['call to action', /do after watching/i],
    ['payoff', /walk away with/i],
    ['body', /has to get across/i],
  ])('%s asks something specific to it', (section, shape) => {
    expect(askForBeat(section, PLACEHOLDER)).toMatch(shape)
  })

  // ⚠️⚠️ ORDER IS THE WHOLE RISK OF THIS CHANGE. `/re-?hook/` sits ABOVE the new
  // bare `/hook/`, and first match wins. If the bare one were inserted earlier
  // it would swallow every re-hook beat — 120 of them in production — and ask
  // the OPENING question in the middle of a script.
  it('re-hook keeps its own question and is not swallowed by the hook pattern', () => {
    for (const s of ['re-hook', 'rehook', 'Re-Hook', 'second hook']) {
      expect(askForBeat(s, PLACEHOLDER), `${s} was swallowed`)
        .toMatch(/keep watching/i)
      expect(askForBeat(s, PLACEHOLDER)).not.toMatch(/stop someone scrolling/i)
    }
  })

  it('and setup still gets the setup question, not a new one', () => {
    expect(askForBeat('setup', PLACEHOLDER)).toMatch(/situation right before/i)
  })
})

describe('what it must not change', () => {
  it("a writer's real question is still kept, whatever the section", () => {
    const real = 'What did the goatskin cost you on that first rebind?'
    for (const s of REAL_SECTIONS) expect(askForBeat(s, real)).toBe(real)
  })

  // ⚠️ IT STILL NAMES THE SECTION, AND `five-beats-five-questions` IS WHY.
  // Dropping the name was my first fix and it would have given every
  // unrecognised beat in one script the SAME question — the exact defect that
  // file was written to stop, after a real generation shipped one blank question
  // on all five of its beats.
  it('an unrecognised section still names itself, so two beats never share a question', () => {
    const a = askForBeat('Bridge', PLACEHOLDER)
    const b = askForBeat('Vulnerability Pivot', PLACEHOLDER)
    expect(a).toMatch(/bridge/i)
    expect(b).toMatch(/vulnerability pivot/i)
    expect(a).not.toBe(b)
  })

  it('and that wording is grammatical for a plural or a phrase, which the old one was not', () => {
    // "This beat is your consequences" was the shipped defect.
    expect(askForBeat('consequences', PLACEHOLDER)).toBe(
      'This is the consequences beat — what would you say here, in your own words?')
    // ⚠️ MY FIRST FIXTURE HERE WAS "Two-Front Spiral", WHICH MY OWN NEW
    // `/spiral/` PATTERN RECOGNISES — so it correctly got the escalation
    // question and the test was wrong, not the code. A fixture for the LAST
    // RESORT has to be a phrase no pattern claims.
    expect(askForBeat('Quiet Interlude', PLACEHOLDER)).toBe(
      'This is the quiet interlude beat — what would you say here, in your own words?')
    expect(askForBeat('consequences', PLACEHOLDER)).not.toMatch(/is your/i)
  })

  it('an empty or missing section behaves the same way', () => {
    for (const s of ['', '   ', null, undefined]) {
      expect(askForBeat(s, PLACEHOLDER)).toBe('What would you say here, in your own words?')
    }
  })

  it('the placeholder is still detected as generic — that half was already right', () => {
    expect(askIsGeneric(PLACEHOLDER)).toBe(true)
  })

  // ⚠️ ADDED BECAUSE A MUTANT SURVIVED, AND IT SURVIVED HONESTLY. Deleting
  // `/only you can supply this/` changed nothing: the production placeholder
  // carries BOTH halves, so the second pattern caught it anyway. The patterns
  // overlap on that one string, which means neither was independently pinned —
  // so each is now exercised by a string only it can reject.
  it.each([
    ['Only you can supply this.', 'only-you'],
    ['What would you actually say here?', 'say-here'],
    ['What is your real example?', 'real-example'],
  ])('%s is rejected on its own', (ask) => {
    expect(askIsGeneric(ask)).toBe(true)
    // And a beat carrying only that half still gets a real question.
    expect(askForBeat('cta', ask)).toMatch(/do after watching/i)
  })

  it('a sentence that merely CONTAINS a rejected phrase mid-question is not itself generic', () => {
    // ⚖️ THE LIMIT OF THE RULE, STATED. These patterns are unanchored by design
    // (#915 — anchoring `^` was the original defect), so a real question that
    // happens to quote one would be thrown away. This pins that the wording we
    // ship does not do that.
    const real = 'What did the goatskin cost you, and what do you tell people who ask?'
    expect(askIsGeneric(real)).toBe(false)
  })
})
