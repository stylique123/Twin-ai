import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { readinessAsksUnderFactsOnly, readinessKind } from '../readinessUnderFactsOnly'

const OBJECTIVE = ['What was missing that made you build it?', 'What does someone notice first when they use it, and how is it made?']
const ask = (field: string, question = `q-${field}`) => ({ field, question })
const ALL = [
  ask('story', 'Tell me one moment with Pip you haven\'t shared yet — what happened?'),
  ask('angle', 'What is this video about? One sentence is enough.'),
  ask('claims', OBJECTIVE[0]),
  ask('audience', 'Who is this video for?'),
  ask('cta', 'What should viewers do after watching?'),
  ask('offer', 'Which product or offer should this video point at?'),
]

describe('readiness questions while FACTS_ONLY_WRITER is on', () => {
  it('flag off: every readiness question is asked, unchanged', () => {
    expect(readinessAsksUnderFactsOnly(ALL, false, OBJECTIVE)).toEqual(ALL)
  })
  it('flag on: story, angle and goal stand down; audience, CTA and offer stay', () => {
    expect(readinessAsksUnderFactsOnly(ALL, true, OBJECTIVE).map((m) => m.field)).toEqual(['audience', 'cta', 'offer'])
  })
  it('the goal-keyed claims question is the goal; the generic claims question is not', () => {
    expect(readinessKind(ask('claims', OBJECTIVE[1]), OBJECTIVE)).toBe('goal')
    const generic = ask('claims', 'What does Pip actually do? Anything you want in this one — a price, a number, what is included.')
    expect(readinessKind(generic, OBJECTIVE)).toBe('claims')
    expect(readinessAsksUnderFactsOnly([generic], true, OBJECTIVE)).toEqual([generic])
  })
  it('other readiness fields are untouched under the flag', () => {
    const rest = [ask('relationship'), ask('origin')]
    expect(readinessAsksUnderFactsOnly(rest, true, OBJECTIVE)).toEqual(rest)
  })
  it('compare-2: the screen question and the product picker stand down under the flag, not without it', () => {
    const qs = [ask('selected_product', 'Which one is this video about?'), ask('screen', "I couldn't find a screen or page of FlowDesk to show.")]
    expect(readinessAsksUnderFactsOnly(qs, true, OBJECTIVE)).toEqual([])
    expect(readinessAsksUnderFactsOnly(qs, false, OBJECTIVE)).toEqual(qs)
  })
  it('only the stood-down fields go; nothing asked when all three were the only questions', () => {
    expect(readinessAsksUnderFactsOnly(ALL.slice(0, 3), true, OBJECTIVE)).toEqual([])
  })
})

describe('edge wiring', () => {
  const EDGE = readFileSync(new URL('../../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url), 'utf8')
  it('the readiness stop asks only what survives, keyed off factsOnlyNow(), with the objective questions as the goal', () => {
    expect(EDGE).toContain('const readyAsks = readinessAsksUnderFactsOnly(readyMissing, factsOnlyNow(), [\n    ...Object.values(READY_OBJECTIVE_QUESTIONS),')
    expect(EDGE).toContain('if (readyAsks.length) {')
    expect(EDGE).toContain('const ask = readyAsks\n')
    expect(EDGE).not.toContain('if (readyMissing.length) {')
  })
})
