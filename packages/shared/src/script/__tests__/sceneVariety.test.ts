import { describe, expect, it } from 'vitest'
import { sceneMonotonyBeatCount, sceneMonotonyRuns } from '../sceneVariety'

describe('the screenshot fixture: four scenes, one location', () => {
  const fourIdenticalScenes = [
    { line: 'Line one.', location: 'center of the room facing a window', direction: 'chest-up' },
    { line: 'Line two.', location: 'Center of the room facing a window.', direction: 'chest-up' },
    { line: 'Line three.', location: 'center of the room facing a window', direction: 'chest-up' },
    { line: 'Line four.', location: 'center of the room facing a window', direction: 'chest-up' },
  ]

  it('flags the run', () => {
    const runs = sceneMonotonyRuns(fourIdenticalScenes)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ startIndex: 0, length: 4, location: 'center of the room facing a window' })
  })

  it('counts every beat in the run for the audit metric', () => {
    expect(sceneMonotonyBeatCount(fourIdenticalScenes)).toBe(4)
  })
})

describe('a changed framing on an unchanged location is not monotony', () => {
  it('does not flag chest-up -> overlay -> insert with one location', () => {
    const beats = [
      { line: 'Line one.', location: 'kitchen counter', direction: 'chest-up' },
      { line: 'Line two.', location: 'kitchen counter', direction: 'overlay' },
      { line: 'Line three.', location: 'kitchen counter', direction: 'insert' },
    ]
    expect(sceneMonotonyRuns(beats)).toHaveLength(0)
  })
})

describe('the boundary the spec draws', () => {
  const beat = (line: string) => ({ line, location: 'studio', direction: 'chest-up' })

  it('two consecutive identical speaking beats is normal coverage, not a run', () => {
    expect(sceneMonotonyRuns([beat('a'), beat('b')])).toHaveLength(0)
  })

  it('three is the run the doctrine forbids', () => {
    expect(sceneMonotonyRuns([beat('a'), beat('b'), beat('c')])).toHaveLength(1)
  })
})

describe('non-speaking beats are invisible to the scan, not breaks in it', () => {
  it('a silent beat sandwiched between identical speaking beats does not save the pair', () => {
    const beats = [
      { line: 'Line one.', location: 'studio', direction: 'chest-up' },
      { line: '[No spoken audio]', location: 'studio', direction: 'chest-up' },
      { line: 'Line two.', location: 'studio', direction: 'chest-up' },
      { line: 'Line three.', location: 'studio', direction: 'chest-up' },
    ]
    const runs = sceneMonotonyRuns(beats)
    expect(runs).toHaveLength(1)
    // ⚠️ The run spans indices 0, 2 and 3 in the original array — the silent
    // beat at index 1 is skipped, not counted, so length is 3 speaking beats.
    expect(runs[0]).toMatchObject({ startIndex: 0, length: 3 })
  })

  it('an empty line does not count as speaking and cannot start or extend a run', () => {
    const beats = [
      { line: '', location: 'studio', direction: 'chest-up' },
      { line: '', location: 'studio', direction: 'chest-up' },
      { line: '', location: 'studio', direction: 'chest-up' },
    ]
    expect(sceneMonotonyRuns(beats)).toHaveLength(0)
  })
})

describe('absent is not the same place', () => {
  it('two beats with no location recorded are not a repeated room', () => {
    const beats = [
      { line: 'a', location: '', direction: '' },
      { line: 'b', location: '', direction: '' },
      { line: 'c', location: '', direction: '' },
    ]
    expect(sceneMonotonyRuns(beats)).toHaveLength(0)
  })
})

describe('malformed input', () => {
  it('a non-array returns no runs rather than throwing', () => {
    for (const v of [null, undefined, 'x', 3, {}]) {
      expect(sceneMonotonyRuns(v)).toEqual([])
      expect(sceneMonotonyBeatCount(v)).toBe(0)
    }
  })

  it('a non-string location/direction on a real beat is treated as absent, not a crash', () => {
    const beats = [
      { line: 'a', location: 3, direction: null },
      { line: 'b', location: 3, direction: null },
      { line: 'c', location: 3, direction: null },
    ]
    expect(sceneMonotonyRuns(beats)).toHaveLength(0)
  })
})
