// ⚠️ OWNER REPORT: the scan screen said "THREE THINGS ONLY YOU KNOW" over two
// boxes. CTO decision 2026-09-23: one question, a header with no count, the answer
// stored like every other asked answer and read by the writer as a hook source.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CREATOR_QUESTIONS, DEPTH_QUESTION_IDS, MISCONCEPTION_SOURCE_REF, answerToKnowledge } from '../creatorQuestions'

const repo = join(import.meta.dirname, '..', '..', '..', '..')
const read = (...p: string[]) => readFileSync(join(repo, ...p), 'utf8')

describe('the scan screen asks one question', () => {
  it('is exactly the misconception question', () => {
    expect(DEPTH_QUESTION_IDS).toEqual(['keeps_explaining'])
    const q = CREATOR_QUESTIONS.find((x) => x.id === 'keeps_explaining')!
    expect(q.ask).toBe("What's the thing you keep having to explain to people, over and over?")
  })

  it('stores through the asked path with a source_ref the writer recognises', () => {
    const q = CREATOR_QUESTIONS.find((x) => x.id === 'keeps_explaining')!
    const r = answerToKnowledge(q, 'People think handmade means slow; the slow part is actually the drying.')
    expect(r.ok && r.row.source).toBe('asked')
    expect(r.ok && r.row.source_ref).toBe(MISCONCEPTION_SOURCE_REF)
  })

  it('the writer reads source_ref and marks the row as a hook source', () => {
    const edge = read('supabase', 'functions', 'generate-blueprint', 'index.ts')
    expect(/const KNOWLEDGE_COLS_BASE = '([^']*)'/.exec(edge)?.[1]).toContain('source_ref')
    expect(edge).toContain(`=== '${MISCONCEPTION_SOURCE_REF}'`)
    expect(edge).toMatch(/most people think X, actually Y" hook\]/)
  })

  it('the onboarding header carries no count, and the story screen keeps its own', () => {
    const onb = read('apps', 'web', 'src', 'pages', 'Onboarding.tsx')
    const block = onb.slice(onb.indexOf('questionIds={DEPTH_QUESTION_IDS}'), onb.indexOf('questionIds={DEPTH_QUESTION_IDS}') + 300)
    expect(block).toMatch(/heading="One thing only you know"/)
    expect(read('apps', 'web', 'src', 'components', 'StoryInterview.tsx')).toMatch(/heading = 'Three things only you know'/)
  })
})
