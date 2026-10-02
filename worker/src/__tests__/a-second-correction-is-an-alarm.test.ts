import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..')

describe('the same correction twice is an alarm, not a silent count (owner 2026-10-01)', () => {
  it('records a miss only when the lesson existed, active, before the rated script', () => {
    const sql = readFileSync(join(ROOT, 'supabase/migrations/0266_a_second_correction_is_an_alarm.sql'), 'utf8')
    expect(sql).toMatch(/l\.active and l\.kind <> 'hook'/)
    expect(sql).toMatch(/l\.created_at < g\.created_at/)
    expect(sql).toMatch(/unique \(lesson_id, generation_id\)/)
  })
  it('the learner checks every repeated rating lesson and logs the incident', () => {
    const w = readFileSync(join(ROOT, 'worker/src/nicheBrain/lessons.ts'), 'utf8')
    expect(w).toMatch(/twin && \(l\.source === 'rating' \|\| l\.source === 'rating_tag'\)/)
    expect(w).toMatch(/record_lesson_miss/)
    expect(w).toMatch(/event: 'lesson_not_applied'/)
  })
  it('she sees it on the lesson itself', () => {
    const ui = readFileSync(join(ROOT, 'apps/web/src/components/LearnedFromYou.tsx'), 'utf8')
    expect(ui).toMatch(/from\('lesson_misses'\)/)
    expect(ui).toMatch(/data-testid="lesson-missed"/)
  })
})
