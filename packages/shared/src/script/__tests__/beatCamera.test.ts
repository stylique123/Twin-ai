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

describe('batch part-13: her face to the lens is the front camera', () => {
  it('a talk beat that holds eye contact is front even with a back job', () => {
    expect(cameraForBeat({ section: 'Payoff', line: 'x', shown_job: 'demo', action_posing: 'Lean in to the lens and hold eye contact' }, 2, 5)).toBe('front')
  })
  it('a hands-on product action stays back', () => {
    expect(cameraForBeat({ section: 'Proof', line: 'x', action_posing: 'Turn the bag to show the label' }, 2, 5)).toBe('back')
  })
})

describe('jobFirst (trial): the beat purpose decides the camera', () => {
  const o = { jobFirst: true }
  it('keeps a claim on her face even when the direction names the label', () => {
    const b = { section: 'body', shown_job: 'claim', line: 'x', direction: 'Point at the label' }
    expect(cameraForBeat(b, 1, 4)).toBe('back')
    expect(cameraForBeat(b, 1, 4, o)).toBe('front')
  })
  it('keeps a story beat on her face', () => {
    expect(cameraForBeat({ section: 'story', shown_job: 'story_emotion', line: 'x', direction: 'pouring the beans that morning' }, 2, 5, o)).toBe('front')
  })
  it('sends a demo beat to the back camera with no action words', () => {
    expect(cameraForBeat({ section: 'body', shown_job: 'demo', line: 'x', direction: 'Smile at the lens' }, 1, 4, o)).toBe('back')
  })
  it('lets a reveal hook open on the back camera, but not a talk hook', () => {
    expect(cameraForBeat({ section: 'hook', shown_job: 'reveal', line: 'x' }, 0, 4, o)).toBe('back')
    expect(cameraForBeat({ section: 'hook', shown_job: 'talk', line: 'x' }, 0, 4, o)).toBe('front')
    expect(cameraForBeat({ section: 'hook', shown_job: 'reveal', line: 'x' }, 0, 4)).toBe('front')
  })
  it('keeps the ask and the last beat on her face', () => {
    expect(cameraForBeat({ section: 'cta', shown_job: 'demo', line: 'x' }, 3, 4, o)).toBe('front')
    expect(cameraForBeat({ section: 'body', shown_job: 'demo', line: 'x' }, 3, 4, o)).toBe('front')
  })
  it('falls back to the word rules when there is no job', () => {
    expect(cameraForBeat({ section: 'body', line: 'x', direction: 'Pour the beans' }, 1, 4, o)).toBe('back')
  })
  it('passes the option through decideBeatCameras', () => {
    const s = [{ section: 'hook', shown_job: 'reveal', line: 'a' }, { section: 'body', shown_job: 'claim', line: 'b', direction: 'show the label' }, { section: 'cta', line: 'c' }]
    expect(decideBeatCameras(s, o).script.map((b) => b.camera)).toEqual(['back', 'front', 'front'])
  })
})
