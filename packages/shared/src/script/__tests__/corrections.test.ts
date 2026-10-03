import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  cleanCorrections, correctionLessonText, enforceCorrections, factsRejected, rejectedTerms, saysRejected, scrubRejected,
} from '../corrections'

// Script batch audit 2026-10-03, parts 3 and 11: her corrections never reached storage.
const NOTE = "This brings back the two-pound batches and cup-score claims I've excluded multiple times now. Grocery coffee isn't burnt, I didn't describe it that way. Don't say Hello I'm Savannah."
const FACTS = [
  { id: '35d868c7', text: 'I roast in two-pound batches with zero inventory', creator_excluded_at: null },
  { id: '0cf64884', text: 'Every roast is a 2lb batch', creator_excluded_at: null },
  { id: '82087f3c', text: 'Our Ethiopia scored 88 on the cup score sheet', creator_excluded_at: null },
  { id: '6d39f81c', text: 'Grocery store coffee tastes burnt and overly acidic', creator_excluded_at: null },
  { id: 'keep', text: 'I started roasting in my garage in Farmington', creator_excluded_at: null },
  { id: 'gone', text: 'two-pound batches again', creator_excluded_at: '2026-09-29T00:00:00Z' },
]

describe('her corrections reach storage', () => {
  it('reads only her own words as rejected terms', () => {
    const terms = cleanCorrections({ rejects: ['two-pound batches', 'cup-score claims', 'burnt', "Hello I'm Savannah", 'made-up thing'] }, NOTE)
    expect(terms).toEqual(['two-pound batches', 'cup-score claims', 'burnt', "Hello I'm Savannah"])
  })
  it('a term made only of framing words names nothing', () => {
    expect(cleanCorrections({ rejects: ['claims', 'that story'] }, 'not that story, no claims')).toEqual([])
  })
  it('excludes every live fact that says what she rejected (digits, units and plurals unified)', () => {
    const terms = ['two-pound batches', 'cup-score claims', 'burnt']
    expect(factsRejected(FACTS, terms).map((f) => f.id)).toEqual(['35d868c7', '0cf64884', '82087f3c', '6d39f81c'])
  })
  it('takes terms from active avoid lessons with a phrase only', () => {
    const terms = rejectedTerms([
      { kind: 'avoid', phrase: 'two-pound batches' },
      { kind: 'avoid', phrase: '2 lb batch' },
      { kind: 'avoid', phrase: 'scorching', active: false },
      { kind: 'style', phrase: 'roast date stamp' },
      { kind: 'avoid', phrase: null },
    ])
    expect(terms).toEqual(['2 lb batch'])
    expect(correctionLessonText('scorching')).toContain('"scorching"')
  })
})

describe('her corrections are enforced on the script', () => {
  const terms = ['two-pound batches', 'scorching', 'roast date stamp', "Hello I'm Savannah", 'cup scores']
  it('removes the sentence, not just reports it', () => {
    const r = enforceCorrections([
      { line: "Hello, I am Savannah. Today we roast." },
      { line: 'Half the batch was scorching. So I slowed the drum.' },
      { line: 'Check the roast-date stamp on the bag. Fresh matters.' },
      { line: 'We roast in 2-pound batches. Every week.' },
      { line: 'Nothing here to cut.' },
    ], terms)
    expect(r.beats.map((b) => b.line)).toEqual(['Today we roast.', 'So I slowed the drum.', 'Fresh matters.', 'Every week.', 'Nothing here to cut.'])
    expect(r.removed.map((x) => x.reason)).toEqual(['rejected_by_her', 'rejected_by_her', 'rejected_by_her', 'rejected_by_her'])
  })
  it('a term she typed for this video is hers to say', () => {
    const r = enforceCorrections([{ line: 'I roast in two-pound batches.' }], terms, 'talk about my two-pound batches this time')
    expect(r.removed).toHaveLength(0)
  })
  it('scrubs her voice samples of what she rejected', () => {
    const vp = { sample_hooks: ["Hello I'm Savannah and welcome back", 'Stop buying stale beans'], about: 'Roaster. Grades by cup scores. Farmington.' }
    expect(scrubRejected(vp, terms)).toEqual({ sample_hooks: ['Stop buying stale beans'], about: 'Roaster. Farmington.' })
    expect(saysRejected('cup score of 86', 'cup scores')).toBe(true)
  })
})

describe('wired through the worker and the writer', () => {
  const EDGE = readFileSync(new URL('../../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url), 'utf8')
  const WORKER = readFileSync(new URL('../../../../../worker/src/nicheBrain/lessons.ts', import.meta.url), 'utf8')
  const MIG = readFileSync(new URL('../../../../../supabase/migrations/0274_her_corrections_reach_storage.sql', import.meta.url), 'utf8')
  it('the worker stamps creator_excluded_at from her corrections and backfills via corrections_at', () => {
    expect(WORKER).toMatch(/update\(\{ creator_excluded_at: new Date\(\)\.toISOString\(\) \}\)/)
    expect(WORKER).toMatch(/\.is\('corrections_at', null\)/)
    expect(MIG).toMatch(/new\.corrections_at := null/)
  })
  it('the writer enforces corrections on the finished script and scrubs her profile', () => {
    expect(EDGE).toMatch(/enforceCorrections\(bp\.script/)
    expect(EDGE).toMatch(/scrubRejected\(scrubPrivate\(voice\?\.profile/)
  })
})
