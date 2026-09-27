import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { questionIn, unansweredQuestions } from '../postQuestions'

const c = (id: string, text: string, byOwner = false, replies: boolean[] = []) =>
  ({ id, text, byOwner, replies: replies.map((b) => ({ byOwner: b })) })

describe('unanswered questions under her posts (#10)', () => {
  it('finds real questions and ignores praise', () => {
    expect(questionIn('Love this!! Is it dishwasher safe?')).toBe('Is it dishwasher safe?')
    expect(questionIn('how long does one mug take to make')).toBe('how long does one mug take to make?')
    expect(questionIn('so pretty 😍')).toBeNull()
    expect(questionIn('@maker wow')).toBeNull()
  })
  it('keeps only the ones she never answered, once each', () => {
    const out = unansweredQuestions([
      c('1', 'Is it dishwasher safe?'),
      c('2', 'Is it dishwasher safe?'),
      c('3', 'Do you ship to Canada?', false, [true]),
      c('4', 'Where do you buy your clay?', true),
      c('5', 'What glaze is that?', false, [false]),
    ])
    expect(out.map((q) => q.id)).toEqual(['1', '5'])
  })
  it('is read by the social cron and filed into her brain by the worker', () => {
    const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
    const social = readFileSync(join(repo, 'supabase/functions/social/index.ts'), 'utf8')
    expect(social).toMatch(/await syncQuestions\(admin\)/)
    expect(social).toMatch(/instagram_manage_comments/)
    const worker = readFileSync(join(repo, 'worker/src/nicheBrain/audience.ts'), 'utf8')
    expect(worker).toMatch(/then\(\(\) => filePostQuestions\(log\)\)/)
  })
})
