// OWNER'S MENU REDESIGN (2026-09-27): every option must change what is written.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { intentQuestionsFor, IDEA_QUESTIONS, ideaLines, FOLLOWUP_PREFIX, INTENT_QUESTIONS, REFERENCE_USE_DIRECTIVE } from '../videoIntent'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

describe('every option changes the script', () => {
  it('Reference mode asks only how much to keep, with three concrete choices', () => {
    expect(intentQuestionsFor({ hasReference: true }).map((q) => q.field)).toEqual(['reference_use'])
    const q = INTENT_QUESTIONS.find((x) => x.field === 'reference_use')!
    expect(q.options.map((o) => o.label)).toEqual(['Match its opening and hook', 'Match its pacing only', 'Stay close throughout'])
    // Each one is a different writer instruction.
    expect(new Set(q.options.map((o) => REFERENCE_USE_DIRECTIVE[o.value as keyof typeof REFERENCE_USE_DIRECTIVE])).size).toBe(3)
  })
  it('Idea mode asks about the content, not a marketing goal', () => {
    expect(intentQuestionsFor({ hasReference: false })).toHaveLength(0)
    expect(IDEA_QUESTIONS.map((q) => q.question)).toEqual([
      'What specific moment or tension is at the center of what you just described?',
      "What's the one feeling you want someone to still have after watching?",
    ])
    expect(ideaLines({ [FOLLOWUP_PREFIX + 'idea_moment']: 'the kiln cracked the night before the market' }))
      .toBe('What specific moment or tension is at the center of what you just described?\nMy answer: the kiln cracked the night before the market\n\n')
    expect(ideaLines({})).toBe('')
  })
  it('Product mode keeps its objective menu', () => {
    expect(intentQuestionsFor({ hasReference: false, isProductSubject: true }).map((q) => q.field)).toContain('video_goal')
  })
  it('her standing goal is still sent, and the idea answers reach the writer', () => {
    const b = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')
    expect(b).toMatch(/!\(answersRef\.current\.video_goal \?\? ''\)\.trim\(\)\s*&& !\(askAnswers\.video_goal/)
    expect(b).toMatch(/ideaLines\(answersRef\.current\)/)
  })
})
