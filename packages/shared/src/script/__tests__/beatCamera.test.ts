import { describe, it, expect } from 'vitest'
import { cameraForBeat, decideBeatCameras } from '../beatCamera.js'

// Audit 2026-10-03 Part 12: 88% of demo beats said `front`; 55% of spoken beats had no label.
describe('cameraForBeat — decided by what the beat does', () => {
  it('puts demonstration, screen, process, hands and product close-ups on the back camera', () => {
    const mid = (action_posing: string) => cameraForBeat({ section: 'Body', line: 'x', action_posing }, 2, 5)
    expect(mid('Turn the bag slowly to show the side profile')).toBe('back')
    expect(mid('Pouring the beans into the grinder')).toBe('back')
    expect(mid('Point the phone at the laptop screen, scrolling the lesson list')).toBe('back')
    expect(mid('Close-up of the label')).toBe('back')
    expect(mid('Her hands pack the bag on the counter')).toBe('back')
  })
  it('keeps talking, hook and close beats on the front camera', () => {
    expect(cameraForBeat({ section: 'Body', action_posing: 'Hands open, palms up, eyes on the lens' }, 2, 5)).toBe('front')
    expect(cameraForBeat({ section: 'Body', action_posing: 'Turn to the camera and lean in' }, 2, 5)).toBe('front')
    expect(cameraForBeat({ section: 'Hook', action_posing: 'Pour the coffee', camera: 'back' }, 0, 5)).toBe('front')
    expect(cameraForBeat({ section: 'CTA', action_posing: 'Show the bag', camera: 'back' }, 4, 5)).toBe('front')
    expect(cameraForBeat({ section: 'Setup', action_posing: 'Show the bag' }, 0, 5)).toBe('front')
  })
  it('a showing job is back; the writer\'s own label is overruled either way', () => {
    expect(cameraForBeat({ section: 'Body', shown_job: 'process', camera: 'front' }, 1, 4)).toBe('back')
    expect(cameraForBeat({ section: 'Body', shown_job: 'talk', action_posing: 'Nod', camera: 'back' }, 1, 4)).toBe('front')
  })
})

describe('decideBeatCameras', () => {
  it('fills every missing label, one per scene, and counts what changed', () => {
    const script = [
      { section: 'Hook', line: 'Open', action_posing: 'Hold the lens' },
      { section: 'Body', line: 'Step', action_posing: 'Grinding the beans', camera: 'front' },
      { section: 'Body', line: 'Talk', action_posing: 'Smile', camera: 'front' },
      { section: 'Body', line: '', action_posing: 'silent' },
      { section: 'CTA', line: 'Close', camera: 'front, then back' },
    ]
    const r = decideBeatCameras(script)
    expect(r.script.map((b) => b.camera)).toEqual(['front', 'back', 'front', undefined, 'front'])
    expect(r.missing).toBe(2)
    expect(r.changed).toBe(3)
    expect(r.back).toBe(1)
    expect(script[1].camera).toBe('front') // never mutates
  })
})
