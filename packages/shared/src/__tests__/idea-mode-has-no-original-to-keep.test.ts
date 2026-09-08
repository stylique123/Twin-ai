import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { INTENT_QUESTIONS, intentQuestionsFor, resolveFidelity } from '../videoIntent'

/**
 * ⚠️ THE QUESTION HAD NO TRUE ANSWER, AND THE BUILD WAITED FOR IT ANYWAY.
 *
 * Somebody who chose "build from my own idea" and pasted no link was asked
 * "How much of the original should Twin keep?" — offering "Their topic, my
 * take" and "Stay close" about a video that does not exist. Worse than odd
 * copy: the completeness gate required EVERY intent question, so the build
 * would not proceed until they picked one.
 *
 * ⚖️ THE OTHER THREE ARE NOT REFERENCE QUESTIONS AND MUST NOT BE DROPPED.
 * Goal, focus and outcome are about the creator and are identical whether
 * they pasted a listicle, a confession, or nothing at all. A fix that
 * quietly asked idea-mode creators less would be a different bug, so the
 * count is pinned from both directions.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const BUILDING = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')

describe('idea mode has no original to keep', () => {
  it('drops exactly the reference question, and only it', () => {
    const withRef = intentQuestionsFor({ hasReference: true })
    const noRef = intentQuestionsFor({ hasReference: false })

    expect(withRef.map((q) => q.field)).toEqual(INTENT_QUESTIONS.map((q) => q.field))
    expect(noRef.map((q) => q.field)).not.toContain('reference_use')
    expect(noRef).toHaveLength(withRef.length - 1)

    // The creator questions survive. Naming them is the point: a filter that
    // returned [] would satisfy "does not contain reference_use".
    for (const field of ['video_goal', 'content_focus', 'reference_use'] as const) {
      if (field !== 'reference_use') expect(noRef.map((q) => q.field)).toContain(field)
    }
  })

  it('the question it drops is the one that names an original', () => {
    const dropped = INTENT_QUESTIONS.find((q) => q.field === 'reference_use')
    expect(dropped?.question).toContain('original')
  })

  it('a build with no reference_use still resolves a fidelity', () => {
    // The null check precedes the coercion — that is why dropping the
    // question is safe rather than merely quieter.
    expect(resolveFidelity(null, null)).toBe('balanced')
    expect(resolveFidelity(null, 'close')).toBe('close')
  })

  it('the screen and its gate both read the filtered list, not the raw one', () => {
    // ⚠️ TWO CALL SITES, ONE RULE. The completeness gate decides whether the
    // build proceeds; the question list decides what appears. If either goes
    // back to INTENT_QUESTIONS, idea mode is blocked again — and the symptom
    // (a build that will not start) points nowhere near this file.
    expect(BUILDING).toContain('intentQuestionsFor({')
    expect(BUILDING).toContain('const intentAnswered = applicableQuestions.every(')
    expect(BUILDING).toContain('const unanswered = applicableQuestions.filter(')
  })

  it('the filter is driven by the reference url, not by a mode flag', () => {
    // There is no "idea mode" boolean in state — idea mode IS the absence of
    // a reference url, which is what the rest of the screen already reads.
    expect(BUILDING).toContain("hasReference: !!(state.reference_url || '').trim()")
  })
})
