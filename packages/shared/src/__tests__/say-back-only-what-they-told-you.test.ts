import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { recognitionLines, RECOGNITION_CITATION, MAX_RECOGNITION_LINES } from '../recognition'
import { AUDIENCE_SEGMENTS, AUDIENCE_KNOWLEDGE } from '../creatorProfileQuestions'
import { BRIEF_GOALS } from '../preScriptBrief'

/**
 * ⚠️ 0 STATED, 34 GUESSED. Twin holds real answers from signup and never shows
 * them again, so a script arrives reading as though it were written for nobody
 * — and the creator cannot tell whether it missed because the writer is weak or
 * because it never knew who they were.
 *
 * ⚖️ THE CITATION IS A PROMISE ABOUT PROVENANCE. "You told me this at signup"
 * may sit above a sentence only if they actually said it. A guess printed under
 * that heading is worse than silence: it teaches them the product's claims
 * about them cannot be trusted, on the screen built to earn the opposite.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const BUILDING = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')

describe('say back only what they told you', () => {
  it('an empty profile says nothing at all', () => {
    // ⚠️ THE WHOLE RULE IN ONE ASSERTION. No default, no fallback, no "probably".
    expect(recognitionLines({})).toEqual([])
    expect(recognitionLines(null)).toEqual([])
    expect(recognitionLines({ audience: null, contentGoals: null })).toEqual([])
  })

  it('cites the audience they picked, in a sentence rather than a chip label', () => {
    const [line] = recognitionLines({ audience: 'founders' })
    expect(line?.text).toBe('You make videos for founders and business owners.')
    expect(line?.source).toBe('signup')
  })

  it('the knowledge answer extends the audience line and never stands alone', () => {
    // "Mostly beginners" without saying beginners at WHAT is a fragment of a form.
    expect(recognitionLines({ audienceKnowledge: 'beginners' })).toEqual([])
    const [line] = recognitionLines({ audience: 'creators', audienceKnowledge: 'beginners' })
    expect(line?.text).toBe('You make videos for other creators who are mostly beginners.')
  })

  it('joins the goals they chose and drops the ones they did not', () => {
    const lines = recognitionLines({ contentGoals: ['leads', 'authority'] })
    expect(lines[0]?.text).toBe('You want your content to bring in leads or clients and build trust in what you know.')
    expect(recognitionLines({ contentGoals: [] })).toEqual([])
  })

  it('never says more than two things', () => {
    const lines = recognitionLines({
      audience: 'founders', audienceKnowledge: 'basics', contentGoals: ['sell', 'followers'],
    })
    expect(lines).toHaveLength(MAX_RECOGNITION_LINES)
    expect(recognitionLines({ audience: 'founders' }, 0)).toEqual([])
    expect(recognitionLines({ audience: 'founders' }, -1)).toEqual([])
  })

  it('every option a creator can pick has a clause — a new one cannot render blank', () => {
    // ⚠️ THE FAILURE THIS CATCHES IS SILENT. A segment added to the enum with no
    // clause here would print "You make videos for ." under a line claiming they
    // said it.
    for (const seg of AUDIENCE_SEGMENTS) {
      const [line] = recognitionLines({ audience: seg })
      expect(line?.text, seg).toMatch(/^You make videos for \S.*\.$/)
    }
    for (const k of AUDIENCE_KNOWLEDGE) {
      const [line] = recognitionLines({ audience: 'mixed', audienceKnowledge: k })
      expect(line?.text, k).toMatch(/^You make videos for a mix of people \S.*\.$/)
    }
    for (const g of BRIEF_GOALS) {
      const [line] = recognitionLines({ contentGoals: [g] })
      expect(line?.text, g).toMatch(/^You want your content to \S.*\.$/)
    }
  })

  it('an unknown value is dropped, not printed', () => {
    // A brief written by an older client can hold a value this build has never
    // heard of, and rendering it raw would quote garbage back at the creator.
    expect(recognitionLines({ audience: 'martians' as never })).toEqual([])
  })

  it('the build screen says it, and cites it from the module', () => {
    expect(BUILDING).toContain('recognitionLines(readProfileAnswers(')
    expect(BUILDING).toContain('{RECOGNITION_CITATION}')
    // ⚖️ NOT DURING THE RESCUE LOOP: that screen is about whether their script
    // survived a dropped connection, and nothing else belongs on it.
    expect(BUILDING).toContain('{!rescuing && statedLines.length > 0 && (')
    // ⚠️ A FAILED READ MUST LEAVE THE LIST EMPTY, never fall through to a guess.
    expect(BUILDING).toContain('catch { /* silence, never a guess */ }')
  })

  it('one reader stands behind the claim, on both screens', () => {
    const SETTINGS = readFileSync(join(REPO, 'apps/web/src/pages/Settings.tsx'), 'utf8')
    expect(SETTINGS).toContain('readProfileAnswers(profile?.id')
    expect(BUILDING).toContain('readProfileAnswers(profile?.id')
    expect(RECOGNITION_CITATION).toBe('You told me this at signup')
  })
})
