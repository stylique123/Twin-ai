import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DESIRED_FORMATS, FORMAT_EXPLORATION } from '../creatorProfileQuestions'
import { BRIEF_GOALS } from '../preScriptBrief'

// ⚠️ TWO ANSWERS THAT REACHED NOTHING THAT WRITES A SCRIPT. `desiredFormats` is
// the one question Creator DNA cannot answer for them — the scan reads what they
// HAVE posted, this asks what they want NEXT. `contentGoals` is what their
// content should do in general. Both were persisted and both were orphans.

const repo = join(import.meta.dirname, '..', '..', '..', '..')
const bp = readFileSync(
  join(repo, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
const code = bp.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

describe('what they want to make shapes the PREMISE', () => {
  // ⚖️ NOT THE SHOT LIST, AND THAT IS A DECIDED BOUNDARY. The shot vocabulary is
  // talking_head or cover_frame with "no third option" — downstream of the
  // no-B-roll scope decision. Inventing a third shot type to fit walking or POV
  // would reverse a product decision through a side door.
  it('the renderer is called where the premise instruction lands', () => {
    expect(code).toMatch(/renderDesiredFormatsInline\(/)
    const sites = code.match(/renderDesiredFormatsInline\(brief/g)
      ?? code.match(/renderDesiredFormatsInline\(briefListInline/g) ?? []
    expect(sites.length, 'both prompt variants').toBe(2)
  })

  it('it never asks for a shot type', () => {
    const at = code.indexOf('const DESIRED_FORMAT_PREMISE')
    const block = code.slice(at, code.indexOf('}', code.indexOf('recommend', at)))
    expect(block).not.toMatch(/shot_type|cover_frame|b-roll|cutaway/i)
  })

  it('every real format has premise direction', () => {
    for (const f of DESIRED_FORMATS) {
      if (f === 'recommend') continue
      expect(code, f).toMatch(new RegExp(`\\b${f}:\\s*'`))
    }
  })

  // ⚠️ "LET TWIN SUGGEST" IS A DECLINE, NOT A FORMAT. Turning an explicit
  // request NOT to be constrained into a constraint is the opposite of the
  // answer, and it is the strongest non-answer in the set.
  it('recommend contributes nothing', () => {
    expect(code).toMatch(/recommend:\s*''/)
  })

  it('nothing chosen renders nothing at all', () => {
    expect(code).toMatch(/desired\.length === 0\) return ''/)
  })
})

describe('how far to stray is their answer too', () => {
  it('every exploration answer has a directive', () => {
    for (const e of FORMAT_EXPLORATION) {
      expect(code, e).toMatch(new RegExp(`\\b${e}:\\s*'`))
    }
  })

  // ⚖️ SILENCE GETS THE NEUTRAL WEIGHT, NEVER THE ADVENTUROUS ONE. An unasked
  // question must not become a decision to push somebody.
  it('unanswered falls back to fit_goals, not try_new', () => {
    expect(code).toMatch(/\?\?\s*EXPLORATION_DIRECTIVE\.fit_goals/)
    expect(code).not.toMatch(/\?\?\s*EXPLORATION_DIRECTIVE\.try_new/)
  })
})

describe('the per-video goal wins and the standing one fills silence', () => {
  // ⚠️ NEVER MERGED, NEVER AVERAGED. A standing preference must not override a
  // specific instruction somebody just gave, and two goals blended into one
  // sentence is a third goal nobody chose.
  it('intent.goalDirective is tried first', () => {
    const at = code.indexOf('const goal = intent.goalDirective')
    expect(at).toBeGreaterThan(-1)
    const chain = code.slice(at, at + 260)
    expect(chain.indexOf('standingGoalDirectiveInline'))
      .toBeGreaterThan(chain.indexOf('intent.goalDirective'))
  })

  it('the inferred goal stays last', () => {
    const at = code.indexOf('const goal = intent.goalDirective')
    const chain = code.slice(at, at + 260)
    expect(chain.indexOf('vp?.goal')).toBeGreaterThan(chain.indexOf('standingGoalDirectiveInline'))
  })

  it('every brief goal maps to a consequence, not a slug', () => {
    for (const g of BRIEF_GOALS) {
      expect(code, g).toMatch(new RegExp(`\\b${g}:\\s*'`))
    }
  })

  // ⚖️ THE FIRST IN STORED ORDER, and the second deliberately ignored rather
  // than quietly averaged into a sentence neither of them says.
  it('two goals do not become a blend', () => {
    expect(code).toMatch(/for \(const g of goals\)/)
    expect(code).not.toMatch(/goals\.join\(/)
  })
})

describe('narrowed, never cast — the compiler caught the first version', () => {
  // ⚠️ `brief` IS Record<string, string | undefined> AND THREE KEYS ARE ARRAYS.
  // The first version wrote `brief.desiredFormats as string[]`, which tsc
  // rejected: "conversion of type string to type string[] may be a mistake". It
  // was the shape of `'DENIED' as PersonalUse` — a cast asserting a type the
  // value may not have.
  it('the lists are proven at runtime', () => {
    expect(code).toMatch(/function briefListInline/)
    expect(code).toMatch(/if \(!Array\.isArray\(v\)\) return undefined/)
  })

  it('and the cast is gone', () => {
    expect(code).not.toMatch(/brief\.desiredFormats as string\[\]/)
    expect(code).not.toMatch(/brief\.contentGoals as string\[\]/)
  })

  it('a stored scalar where a list belongs reads as absent', () => {
    expect(code).toMatch(/briefListInline\(briefRaw, 'desiredFormats'\)/)
    expect(code).toMatch(/briefListInline\(briefRaw, 'contentGoals'\)/)
  })
})
