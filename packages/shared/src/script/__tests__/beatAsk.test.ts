import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  askProblems, askIsUsable, askIsGeneric, fillScaffold, scaffoldWithoutAnswer,
  ANSWER_SLOT, ASK_MAX_CHARS, ANSWER_MAX_CHARS,
} from '../beatAsk'

/** The refusal that shipped as spoken dialogue in three of six scenes. */
const SHIPPED = 'Only you can supply this. What would you actually say here?'

describe('what makes an ask worth showing a creator', () => {
  const goodAsk = 'What was the moment you almost deleted your first post?'
  const goodScaffold = 'It starts small. ' + ANSWER_SLOT + '. And that panic is the whole trap.'

  it('a specific question with a real sentence around the slot is usable', () => {
    expect(askProblems(goodAsk, goodScaffold)).toEqual([])
    expect(askIsUsable(goodAsk, goodScaffold)).toBe(true)
  })

  // ⚠️ AN ASK THAT FITS EVERY CREATOR FITS NONE OF THEM.
  it.each([
    'Tell me about yourself.',
    'Describe your journey?',
    'Share your story with us?',
    "What's your background?",
    'Talk about your niche?',
    'Can you tell me more?',
  ])('%s is generic', (a) => {
    expect(askIsGeneric(a)).toBe(true)
    expect(askProblems(a, goodScaffold).map((p) => p.code)).toContain('ASK_GENERIC')
  })

  it('a question naming a specific moment is not generic', () => {
    expect(askIsGeneric(goodAsk)).toBe(false)
    expect(askIsGeneric('How much did that first month actually cost you?')).toBe(false)
  })

  it('an ask must read as a question', () => {
    expect(askProblems('The moment you almost quit.', goodScaffold).map((p) => p.code))
      .toContain('ASK_NOT_A_QUESTION')
  })

  it('an ask longer than a creator will read is refused', () => {
    const long = 'What was the ' + 'very '.repeat(40) + 'first thing?'
    expect(long.length).toBeGreaterThan(ASK_MAX_CHARS)
    expect(askProblems(long, goodScaffold).map((p) => p.code)).toContain('ASK_TOO_LONG')
  })

  it.each([null, undefined, '', '   '])('%s is a missing ask', (a) => {
    expect(askProblems(a, goodScaffold).map((p) => p.code)).toContain('ASK_MISSING')
  })
})

describe('what makes a scaffold fillable', () => {
  const ask = 'What did that first month cost you?'

  it('exactly one slot is required', () => {
    expect(askProblems(ask, 'It cost me a lot.').map((p) => p.code)).toContain('SCAFFOLD_NO_SLOT')
    expect(askProblems(ask, `${ANSWER_SLOT} and then ${ANSWER_SLOT}`).map((p) => p.code))
      .toContain('SCAFFOLD_MANY_SLOTS')
  })

  // ⚖️ A SCAFFOLD THAT IS ONLY THE SLOT IS THE PLACEHOLDER IN A BETTER COSTUME —
  // it hands the whole line back to the creator, which is the defect.
  it.each([ANSWER_SLOT, `${ANSWER_SLOT}.`, `  ${ANSWER_SLOT}  `])(
    '%s has written nothing', (s) => {
      expect(askProblems(ask, s).map((p) => p.code)).toContain('SCAFFOLD_ONLY_SLOT')
    })

  it.each([null, undefined, ''])('%s is a missing scaffold', (s) => {
    expect(askProblems(ask, s).map((p) => p.code)).toContain('SCAFFOLD_MISSING')
  })

  // ⚠️ THE SHIPPED REFUSAL FAILS EVERY WAY IT CAN. This is the regression test
  // for the actual defect: that string can never again reach a spoken line.
  it('the refusal that shipped is not a usable ask/scaffold pair', () => {
    expect(askIsUsable(SHIPPED, SHIPPED)).toBe(false)
    expect(askProblems(SHIPPED, SHIPPED).map((p) => p.code)).toContain('SCAFFOLD_NO_SLOT')
  })
})

describe('filling the line with what the creator typed', () => {
  const scaffold = 'It starts small. ' + ANSWER_SLOT + '. And that panic is the whole trap.'

  it('joins without a second model call', () => {
    expect(fillScaffold(scaffold, 'I deleted a post nobody had even seen'))
      .toBe('It starts small. I deleted a post nobody had even seen. And that panic is the whole trap.')
  })

  // ⚠️ A CREATOR TYPES LIKE A PERSON. Their full stop plus the scaffold's own
  // punctuation produces "seen.. And", which reads as a typo in their script.
  it('does not double the punctuation the creator typed', () => {
    expect(fillScaffold(scaffold, 'I deleted a post nobody had even seen.'))
      .not.toContain('..')
    expect(fillScaffold(scaffold, 'I deleted it.   ')).toContain('I deleted it. And')
  })

  // ⚖️ REFUSED, NEVER TRUNCATED. A cut sentence can invert its meaning, and this
  // text is both spoken on camera and stored as something the creator believes.
  it('refuses an answer longer than the limit rather than cutting it', () => {
    const long = 'x'.repeat(ANSWER_MAX_CHARS + 1)
    expect(fillScaffold(scaffold, long)).toBeNull()
  })

  it.each([null, undefined, '', '   '])('%s fills nothing', (a) => {
    expect(fillScaffold(scaffold, a)).toBeNull()
  })

  it('a scaffold with no slot cannot be filled', () => {
    expect(fillScaffold('No slot here at all.', 'anything')).toBeNull()
  })
})

describe('what a skip leaves behind', () => {
  it('the sentence around the slot survives when it can stand alone', () => {
    const s = 'It starts small. ' + ANSWER_SLOT + '. And that panic is the whole trap.'
    expect(scaffoldWithoutAnswer(s)).toBe('It starts small. And that panic is the whole trap.')
  })

  // ⚠️ A FRAGMENT IS WORSE THAN A MISSING BEAT. It reads as a sentence somebody
  // started and abandoned — which is exactly how the placeholder read.
  it.each([`And then ${ANSWER_SLOT}.`, `${ANSWER_SLOT} — that.`])(
    '%s leaves nothing worth saying', (s) => {
      expect(scaffoldWithoutAnswer(s)).toBeNull()
    })

  it('no slot means nothing to strip', () => {
    expect(scaffoldWithoutAnswer('A complete line already.')).toBeNull()
  })
})

/**
 * ⚠️ THE DEFECT ITSELF, PINNED AT THE SITE THAT CAUSED IT. `generate-blueprint`
 * used to assign the refusal straight into `b.line`, which is how "Only you can
 * supply this. What would you actually say here?" reached a real creator's
 * teleprompter as dialogue in three of six scenes.
 *
 * ⚖️ THE GUARD IS ON THE ASSIGNMENT, NOT THE STRING. Asserting the refusal text
 * is absent from the file would be green the moment somebody reintroduces it
 * under a different wording — and the string legitimately still exists as the
 * fallback ASK. What must never happen again is an ask being assigned to a line.
 */
describe('the writer never puts a question where a spoken line goes', () => {
  const repo = join(import.meta.dirname, '..', '..', '..', '..', '..')
  const bp = readFileSync(join(repo, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

  const at = bp.indexOf('for (const f of entFails)')
  const loop = at === -1 ? '' : bp.slice(at, at + 1800)

  it('the entitlement repair loop exists to be checked', () => {
    expect(at, 'the entFails loop was not found').toBeGreaterThan(-1)
  })

  // ⚠️ THE EXACT LINE THAT SHIPPED THE BUG.
  it('never assigns the ask to the spoken line', () => {
    expect(loop).not.toMatch(/b\.line\s*=\s*q\b/)
  })

  it('carries the question in its own field instead', () => {
    expect(loop).toMatch(/b\.ask\s*=\s*q\b/)
  })

  // ⚖️ AND THE LINE IS EITHER REAL WRITING OR EMPTY — never a refusal.
  it('the spoken line falls back to empty, not to the question', () => {
    expect(loop).toMatch(/b\.line\s*=\s*kept\s*\?\?\s*''/)
    expect(loop).toMatch(/scaffoldWithoutAnswer/)
  })

  it('imports the contract rather than restating it inline', () => {
    expect(bp).toMatch(/import \{ askIsUsable, scaffoldWithoutAnswer \} from '\.\.\/_shared\/beatAsk\.ts'/)
  })

  // ⚠️ THE COUNTER STARTS AT ZERO, NOT NULL, and that is deliberate: this loop
  // runs on every generation that reached the repair, so 0 means "no beat needed
  // the creator" rather than "we never looked". The other two counters in this
  // file are null-defaulted because their checks can be skipped entirely.
  it('records how many asks were emitted and how many had a real sentence', () => {
    expect(bp).toMatch(/let beatAsksEmitted = 0/)
    expect(bp).toMatch(/beat_asks: \{ emitted: beatAsksEmitted, with_scaffold: beatAsksWithScaffold \}/)
  })
})

/**
 * ⚠️ TWO CONSTANTS FOR ONE LIMIT. `ANSWER_MAX` (creatorQuestions) is what the
 * knowledge schema enforces; `ANSWER_MAX_CHARS` lives here because this module
 * is mechanically copied into the edge runtime and must not import across
 * modules there. They are the same rule, so they are pinned to each other
 * rather than left to drift — a divergence would let the card accept a sentence
 * the store then refuses, losing it after the creator watched it be accepted.
 */
describe('the answer limit is one rule, not two', () => {
  it('matches the limit the knowledge schema enforces', async () => {
    const { ANSWER_MAX } = await import('../../creatorQuestions')
    expect(ANSWER_MAX_CHARS).toBe(ANSWER_MAX)
  })
})
