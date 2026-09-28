import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  lessonsFromTags, cleanRatingLessons, lessonsFromAudience, lessonFromHookPick,
  orderLessons, lessonsPromptBlock, brokenLessons, LESSONS_IN_PROMPT,
} from '../creatorLessons'

const root = resolve(__dirname, '../../../../..')
const EDGE = readFileSync(resolve(root, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const SWEEP = readFileSync(resolve(root, 'worker/src/nicheBrain/sweep.ts'), 'utf8')
const RATE = readFileSync(resolve(root, 'apps/web/src/components/RateThisScript.tsx'), 'utf8')

const NOTE = 'This is close. Don\'t add "for twenty years," I never said that. And don\'t add "burnt, overly acidic," I didn\'t describe it that way.'

describe('Twin learns from her ratings, viewers and picks (0250)', () => {
  it('every tag on the rating card that teaches something is mapped', () => {
    const tags = [...RATE.matchAll(/'([^']+)'/g)].map((m) => m[1])
    for (const t of ['Too long', 'Too salesy', 'Hook is weak', 'Not my voice', 'Wrong product facts', 'Hard to film']) {
      expect(tags).toContain(t)
      expect(lessonsFromTags([t]).length, t).toBe(1)
    }
  })

  it('a phrase is kept only when she actually quoted it', () => {
    const got = cleanRatingLessons({ lessons: [
      { kind: 'avoid', text: 'Never add a timeframe she did not give.', phrase: 'for twenty years' },
      { kind: 'avoid', text: 'Never invent a backstory.', phrase: 'my grandmother' },
    ] }, NOTE)
    expect(got[0].phrase).toBe('for twenty years')
    expect(got[1].phrase).toBeNull()
  })

  it('the viewers teach the winning hook and a repeated gap', () => {
    const ls = lessonsFromAudience({ panel_size: 10,
      hooks: [{ hook: 'I lost the entire lot.', stopped: 7 }, { hook: 'meh', stopped: 2 }],
      fixes: [{ issue: 'unanswered_question', count: 6 }, { issue: 'weak_ending', count: 1 }] })
    expect(ls.map((l) => l.kind)).toEqual(['hook', 'style'])
    expect(ls[0].text).toContain('7 of 10')
  })

  it('her own hook pick teaches, agreeing with Twin does not', () => {
    expect(lessonFromHookPick('Mine', 'Twin')).not.toBeNull()
    expect(lessonFromHookPick('Same', 'same')).toBeNull()
  })

  it('avoid-rules first, capped, and the finished script is checked for them', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: String(i), kind: i === 19 ? 'avoid' : 'prefer', text: `t${i}`, phrase: i === 19 ? 'for twenty years' : null, weight: 1 }))
    const o = orderLessons(rows)
    expect(o[0].kind).toBe('avoid')
    expect(o.length).toBe(LESSONS_IN_PROMPT)
    expect(lessonsPromptBlock(o)).toMatch(/WHAT SHE HAS TAUGHT TWIN[\s\S]*never write: "for twenty years"/)
    expect(brokenLessons('Her mom bought it for twenty years.', o)).toEqual(['for twenty years'])
    expect(lessonsPromptBlock([])).toBe('')
  })

  it('is wired end to end: learner runs in the sweep, writer reads and checks', () => {
    expect(SWEEP).toMatch(/await runLessonLearner\(log\)/)
    expect(EDGE).toMatch(/from\('creator_lessons'\)[\s\S]{0,120}\.eq\('active', true\)/)
    expect(EDGE).toMatch(/\$\{knowledgeBlock\}\$\{lessonsBlock\}/)
    expect(EDGE).toMatch(/brokenLessons\(/)
  })
})
