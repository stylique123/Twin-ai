// ROUND 3 — PERMANENT REGRESSIONS (owner's Idea/Product Mode round 3 list).
// Deterministic steps are tested directly; writer rules are pinned in the
// prompt so a refactor cannot silently drop them.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { itemCounts } from '../script/numberRole'
import { blueprintCountIssues } from '../referenceMechanism'
import { whyItWorksFromTest } from '../script/whyItWorksHonesty'
import { OBJECTIVE_QUESTIONS } from '../productObjectiveQuestion'

const root = resolve(__dirname, '../../../..')
const EDGE = readFileSync(resolve(root, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const PAGE = readFileSync(resolve(root, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')
const AUDIENCE = readFileSync(resolve(root, 'worker/src/nicheBrain/audience.ts'), 'utf8')

describe('2.3 no borrowed identity / 2.5 advice at her level', () => {
  it('the writer is told never to speak as operating what she only talks about', () => {
    expect(EDGE).toMatch(/NO BORROWED IDENTITY/)
    expect(EDGE).toMatch(/ADVICE STAYS AT HER LEVEL/)
    expect(EDGE).toMatch(/a subject she makes videos about — never say she personally runs or does it/)
  })
})

describe('2.1 a real answer is not padded with stored numbers or other ideas', () => {
  it('idea mode withholds unconfirmed numbers she did not keep switched on', () => {
    expect(EDGE).toContain("ideaOnly && /\\d/.test(")
  })
  it('an answer from a different idea is not reserved a slot', () => {
    expect(EDGE).toMatch(/reserveAskedInline\(focusOrdered\.filter\(\(k\) => !wasAskedInline\(k\) \|\| onTopic\(k\)\)/)
  })
})

describe('2.2 one source for both documents', () => {
  it('the viewers\' line rewrite re-derives the shot list from the script', () => {
    expect(AUDIENCE).toMatch(/syncShotListSpokenText\(shots, script\)/)
  })
})

describe('2.4 a price in the hook is not a promised list', () => {
  it('"a ten thousand dollar machine" promises nothing', () => {
    expect(itemCounts('You do not need a ten thousand dollar machine to start.')).toEqual([])
    const bp = { hook_options: ['You do not need a ten thousand dollar machine to start.'], script: [{ section: 'Hook', line: 'x' }] }
    expect(blueprintCountIssues(bp as never)).toEqual([])
  })
  it('a real list still counts', () => {
    expect(itemCounts('Three mistakes new roasters make')).toEqual([3])
  })
})

describe('2.7 why it works reflects the real test', () => {
  it('a weak score says so instead of praising structure', () => {
    const out = whyItWorksFromTest(['It lands before anyone decides to scroll past.', 'Your opening line is 10 words.'], { best: 4, n: 10, flagged: 'The payoff comes too late.' })
    expect(out[0]).toMatch(/stopped 4 of 10.*not strong yet/)
    expect(out.join(' ')).not.toMatch(/lands before anyone/)
    expect(out[1]).toMatch(/payoff comes too late/)
  })
  it('a strong score keeps the claims but drops word counts as proof', () => {
    const out = whyItWorksFromTest(['Names the customer moment.', 'Your opening line is 10 words.'], { best: 8, n: 10, flagged: null })
    expect(out).toEqual(['Tested on 10 viewers: the best hook stopped 8 of 10.', 'Names the customer moment.'])
  })
})

describe('2.8 / 1.3 the launch objective is concrete and closes on real options', () => {
  it('asks about this restock, not an open "why now"', () => {
    expect(OBJECTIVE_QUESTIONS.sell?.question).toMatch(/different about this batch or restock/)
    expect(EDGE).not.toMatch(/'What is new about it, or why now\?'/)
  })
  it('a sales close names confirmed sizes and prices when on file', () => {
    expect(EDGE).toMatch(/never a bare "link in bio" when those are on file/)
  })
})

describe('2.9 a picked product is never reported missing', () => {
  it('the gap line knows about every way she can pick one', () => {
    expect(PAGE).toMatch(/needsProduct=\{liveCommercial && !productPicked\}/)
  })
})

describe('1.1 / 1.2 dropping and disclosing instead of inventing (protected)', () => {
  it('the writer still drops an uncovered beat and says so', () => {
    expect(EDGE).toMatch(/dropped_beats/)
  })
})
