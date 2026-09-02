// FIVE COPIES OF THE UNCHANGING LINE BURIED THE ONE THAT CHANGED.
//
// ⚠️ MEASURED ON A REAL BLUEPRINT. a98bf712 stores the same background on all
// five beats and a DIFFERENT action_posing on each — "hold up two fingers when
// mentioning serving two masters", "point directly at the camera lens". The room
// is the constant; the performance is the variable. The recorder printed both on
// every card, so the constant drowned the variable.
//
// ⚖️ THE DANGEROUS FAILURE IS A STRIP THAT DOES NOT UPDATE. Repetition is noise;
// a sticky line that confidently states the wrong place to stand is a person
// filming the wrong thing. Most of what follows is about the scene that MOVES.
import { describe, expect, it } from 'vitest'
import { planSetups, startsSetup, setupStrip, type SetupScene } from '../setupPlan'

const STUDIO = 'Dark studio setting with a subtle yellow backlight illuminating the wall.'
const OUTSIDE = 'Outside, by the car.'

const scene = (n: number, background: string | null, framing = 'Chest-up shot', dialogue: string | null = 'Words.'): SetupScene =>
  ({ scene_number: n, background, camera_framing: framing, dialogue })

describe('the room a scene is filmed in has an identity', () => {
  it('puts one continuous take in one setup', () => {
    const plan = planSetups([scene(1, STUDIO), scene(2, STUDIO), scene(3, STUDIO)])
    expect(plan.setups).toHaveLength(1)
    expect(plan.setups[0].id).toBe('A')
    expect(plan.setups[0].sceneNumbers).toEqual([1, 2, 3])
  })

  it('announces the setup once, on the scene that opens it', () => {
    const plan = planSetups([scene(1, STUDIO), scene(2, STUDIO), scene(3, STUDIO)])
    expect(startsSetup(plan, 1)).toBe(true)
    expect(startsSetup(plan, 2)).toBe(false)
    expect(startsSetup(plan, 3)).toBe(false)
  })

  it('is not split by case or stray spacing', () => {
    // ⚖️ Same room, different typing. And the setup keeps the FIRST spelling —
    // re-casing a person's sentence reads as a bug.
    const plan = planSetups([scene(1, STUDIO), scene(2, `  ${STUDIO.toUpperCase()} `)])
    expect(plan.setups).toHaveLength(1)
    expect(plan.setups[0].background).toBe(STUDIO)
  })

  it('is not split by a gesture — movement is deliberately not part of identity', () => {
    // ⚠️ Gesture changes every beat. Folding it into identity would make every
    // scene its own setup, which is the noise this exists to remove.
    const plan = planSetups([
      { scene_number: 1, background: STUDIO, camera_framing: 'Chest-up shot', dialogue: 'Hold up two fingers.' },
      { scene_number: 2, background: STUDIO, camera_framing: 'Chest-up shot', dialogue: 'Point at the lens.' },
    ])
    expect(plan.setups).toHaveLength(1)
  })
})

describe('when the setup actually changes', () => {
  it('opens a second setup and says so on that scene', () => {
    const plan = planSetups([scene(1, STUDIO), scene(2, STUDIO), scene(3, STUDIO), scene(4, OUTSIDE)])
    expect(plan.setups.map((s) => s.id)).toEqual(['A', 'B'])
    expect(plan.setupIdOf[3]).toBe('A')
    expect(plan.setupIdOf[4]).toBe('B')
    expect(startsSetup(plan, 4)).toBe(true)
  })

  it('changes on framing alone — same room, different place to stand', () => {
    // ⚠️ THE CASE A BACKGROUND COMPARISON MISSES ENTIRELY. Waist-up at an angle
    // is a different place to put the phone, in the same room.
    const plan = planSetups([scene(1, STUDIO), scene(2, STUDIO, 'Waist-up, 30° angle')])
    expect(plan.setups).toHaveLength(2)
    expect(startsSetup(plan, 2)).toBe(true)
  })

  it('gives a RETURN its original setup back, not a third one', () => {
    // ⚖️ Walking back to where you started is not a third place to stand.
    const plan = planSetups([scene(1, STUDIO), scene(2, OUTSIDE), scene(3, STUDIO)])
    expect(plan.setups.map((s) => s.id)).toEqual(['A', 'B'])
    expect(plan.setupIdOf[3]).toBe('A')
    // ⚠️ AND IT DOES NOT RE-ANNOUNCE — the strip is driven by the scene's setup
    // id, which the screen updates on scroll; only the scene that OPENS a setup
    // carries the header.
    expect(startsSetup(plan, 3)).toBe(false)
  })
})

describe('what must never join a setup', () => {
  it('a silent insert does not split a continuous take', () => {
    // ⚠️ A cutaway carries "Screen capture" in these fields. Letting it vote
    // would break every shared setup the moment a script declares one clip.
    const plan = planSetups([
      scene(1, STUDIO),
      { scene_number: 2, background: 'Screen capture', camera_framing: 'Screen capture', dialogue: null },
      scene(3, STUDIO),
    ])
    expect(plan.setups).toHaveLength(1)
    expect(plan.setups[0].sceneNumbers).toEqual([1, 3])
    expect(plan.setupIdOf[2]).toBeNull()
    expect(startsSetup(plan, 2)).toBe(false)
  })

  it('a scene with nothing decided joins nothing', () => {
    // ⚖️ "Nobody chose" must not be promoted into an instruction.
    const plan = planSetups([{ scene_number: 1, background: '', camera_framing: '', dialogue: 'Words.' }])
    expect(plan.setups).toHaveLength(0)
    expect(plan.setupIdOf[1]).toBeNull()
  })

  it('survives an empty script', () => {
    expect(planSetups([]).setups).toEqual([])
  })
})

describe('the strip is a glance, not the record', () => {
  it('reads as the creator would say it', () => {
    const plan = planSetups([scene(1, STUDIO), scene(2, STUDIO)])
    // ⚠️ THE BACKGROUND COMES BACK WHOLE. This test previously asserted the
    // SPLIT — 'Dark studio setting' + 'a subtle yellow backlight…' — and the
    // TEST was the thing that was wrong about what a creator should see, not
    // the code. Reported from production: the strip showed dotted fragments
    // while the card below rendered the same sentence intact, so the header
    // read as an error. The dot now separates FIELDS only.
    expect(setupStrip(plan.setups[0])).toEqual([
      'Setup A', 'Dark studio setting with a subtle yellow backlight illuminating the wall', 'Chest-up shot',
    ])
  })

  it('never truncates a part itself — clipping is the component\'s job', () => {
    // ⚠️ A word-count truncation gives "Dark studio setting with a subtle…" —
    // longer AND less useful than the clause it came from.
    for (const part of setupStrip(plan1().setups[0])) {
      expect(part.endsWith('…')).toBe(false)
      expect(part.trim()).toBe(part)
    }
  })

  it('never invents a part it was not given', () => {
    const plan = planSetups([
      { scene_number: 1, background: 'Kitchen', camera_framing: '', dialogue: 'Words.' },
      { scene_number: 2, background: 'Kitchen', camera_framing: '', dialogue: 'More.' },
    ])
    expect(setupStrip(plan.setups[0])).toEqual(['Setup A', 'Kitchen'])
  })
})

function plan1() { return planSetups([scene(1, STUDIO), scene(2, STUDIO)]) }
