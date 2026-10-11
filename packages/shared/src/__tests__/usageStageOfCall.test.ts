import { describe, it, expect } from 'vitest'
import { stageOfCall } from '../../../../supabase/functions/_shared/aiUsage.ts'

describe('usage stage tags (plan 11.1-1)', () => {
  it('tags each kind of call', () => {
    expect(stageOfCall('You are her editor. You fix at most TWO lines', false)).toBe('editor')
    expect(stageOfCall('You rewrite single script lines to remove claims', false)).toBe('repair')
    expect(stageOfCall('Make the script longer: extend the middle', false)).toBe('lengthen')
    expect(stageOfCall('You judge and score the script', false)).toBe('judge')
    expect(stageOfCall('You write a short video script', true)).toBe('writer')
    expect(stageOfCall('Return one question', false)).toBe('other')
  })
})

describe('the writer is not mistaken for the panel', () => {
  it('a blueprint call whose prompt mentions viewers is the writer', () => {
    expect(stageOfCall('Write for the viewer who scrolls past', true)).toBe('writer')
    expect(stageOfCall('You are a test viewer', false)).toBe('panel')
  })
})
