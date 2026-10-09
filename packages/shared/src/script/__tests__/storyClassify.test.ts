import { describe, it, expect } from 'vitest'
import { buildStoryClassifyPrompt, parseStoryLabels, scoreStoryLabels } from '../storyClassify.js'

// Fictional: Maya's Coffee transcripts.
describe('storyClassify (plan 2.3)', () => {
  it('builds one block per transcript, whitespace collapsed', () => {
    expect(buildStoryClassifyPrompt([{ id: 'v1', text: 'The other day  I burned\na batch.' }])).toBe('### v1\nThe other day I burned a batch.')
  })
  it('reads labels, requires all three beats for complete, defaults missing ids', () => {
    const l = parseStoryLabels({ labels: [
      { id: 'v1', anchor: true, turn: true, resolution: true },
      { id: 'v2', anchor: true, turn: true, resolution: false },
      { id: 'zz', anchor: true, turn: true, resolution: true },
    ] }, ['v1', 'v2', 'v3'])
    expect(l.map((x) => x.complete)).toEqual([true, false, false])
    expect(l[2]).toMatchObject({ id: 'v3', anchor: false })
  })
  it('survives a malformed answer', () => {
    expect(parseStoryLabels(null, ['a']).every((x) => !x.complete)).toBe(true)
  })
  it('scores precision and recall against a hand key', () => {
    const labels = parseStoryLabels({ labels: [
      { id: 'a', anchor: true, turn: true, resolution: true },
      { id: 'b', anchor: true, turn: true, resolution: true },
      { id: 'c', anchor: false, turn: false, resolution: false },
    ] }, ['a', 'b', 'c'])
    expect(scoreStoryLabels(labels, new Set(['a', 'c']))).toMatchObject({ tp: 1, fp: 1, fn: 1, tn: 0, precision: 0.5, recall: 0.5 })
  })
})
