import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { angleOrder, angleContract, cleanAngles, voiceLeans } from '../generated/ideaQuestions.js'
import { lessonFromAnglePick } from '../generated/ideaQuestions.js'

const ROOT = join(__dirname, '..', '..', '..')

describe('the angle picker (owner brief 2026-10-01)', () => {
  it('orders angles by her niche\'s measured winners, her voice first', () => {
    expect(angleOrder('education', [])[0]).toBe('teach_list')
    expect(angleOrder('food', []).indexOf('result_first')).toBeLessThan(angleOrder('food', []).indexOf('problem_question'))
    expect(voiceLeans(['When I opened my roastery…', 'The day I almost quit'])).toContain('feeling_story')
    expect(angleOrder('food', ['The day I almost quit'])[0]).toBe('feeling_story')
  })
  it('keeps 3 genuinely different kinds and drops invented numbers', () => {
    const out = cleanAngles([
      { kind: 'teach_list', gist: 'Walk through the steps of a home roast she actually does.' },
      { kind: 'teach_list', gist: 'Another list of roast steps, reworded.' },
      { kind: 'result_first', gist: 'Open on the finished bag, then how it was roasted.' },
      { kind: 'contrarian_claim', gist: 'Say why 12 minute roasts are wrong.' },
      { kind: 'feeling_story', gist: 'The morning she first roasted at home.' },
    ], 'I roast coffee at home in small batches')
    expect(out.map((a) => a.kind)).toEqual(['teach_list', 'result_first', 'feeling_story'])
  })
  it('the writer is held to the picked angle', () => {
    expect(angleContract({ kind: 'result_first', gist: 'Open on the finished bag.' })).toMatch(/whole video takes this direction/)
    const edge = readFileSync(join(ROOT, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
    expect(edge).toMatch(/pickedAngleLine \? `\\n- \$\{pickedAngleLine\}` : ''/)
    expect(edge).toMatch(/angleBrief\(nicheBucketInline\(voice\?\.niche\)/)
  })
  it('a pick over Twin\'s first choice becomes a lesson; the first choice teaches nothing', () => {
    expect(lessonFromAnglePick({ kind: 'feeling_story', offered: ['teach_list', 'feeling_story', 'result_first'] })?.text)
      .toMatch(/Tell the moment it happened.*Teach it in steps/)
    expect(lessonFromAnglePick({ kind: 'teach_list', offered: ['teach_list', 'feeling_story'] })).toBeNull()
  })
})
