// A HEADER READING `Setup D` ABOVE A FIRST SCENE READING `Setup A`.
//
// ⚠️ REPORTED ON RUN I3, AND REPRODUCED HERE RATHER THAN RECONSTRUCTED. Given
// scenes in the order [3, 1, 2], `planSetups` assigned `A` to scene 3's room —
// letters followed the ARRAY, not the script — so `setups[0]` was `A` while
// scene 1 belonged to `B`. The sticky strip states `setups[0]` before the
// creator has scrolled anywhere, so it named a room the first scene is not
// filmed in.
//
// ⚠️ I COULD NOT CONFIRM THIS IS WHAT HAPPENED ON I3 — that needs the run's own
// scene array, which I do not have. What is established is narrower and enough
// to act on: this is the ONE mechanism in the code that produces exactly that
// symptom, and it is now closed from both ends.
//
// ⚖️ BOTH ENDS, BECAUSE EITHER ALONE LEAVES THE OTHER ROUTE OPEN. The letters
// are assigned in script order, AND the strip asks for the first spoken scene's
// setup rather than for `setups[0]` — so the header and the first card agree by
// construction instead of by two derivations happening to match.
import { describe, expect, it } from 'vitest'
import { planSetups, openingSetupId, startsSetup } from '../setupPlan'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const scene = (n: number, background: string, dialogue = 'words') =>
  ({ scene_number: n, dialogue, background, camera_framing: 'Chest-up' })

const EDITOR = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'apps', 'web', 'src', 'components', 'ScriptEditor.tsx'), 'utf8')

describe('the letter is a promise about order', () => {
  it('THE DEFECT: an out-of-order array used to letter the wrong room first', () => {
    const plan = planSetups([scene(3, 'Kitchen'), scene(1, 'Bedroom'), scene(2, 'Bedroom')] as never)
    // Scene 1 is where filming starts, so scene 1's room is A.
    expect(plan.setupIdOf[1]).toBe('A')
    expect(plan.setupIdOf[2]).toBe('A')
    expect(plan.setupIdOf[3]).toBe('B')
    expect(plan.setups[0].id).toBe('A')
    expect(plan.setups[0].background).toBe('Bedroom')
  })

  it('script order and array order agree when the caller already sorted', () => {
    const plan = planSetups([scene(1, 'Bedroom'), scene(2, 'Kitchen')] as never)
    expect(plan.setupIdOf[1]).toBe('A')
    expect(plan.setupIdOf[2]).toBe('B')
  })

  it('does not reorder the caller\'s array', () => {
    // ⚠️ MUTATING A CALLER'S SCRIPT TO FIX A DISPLAY BUG would reorder the
    // script itself — a far worse defect than the one being fixed.
    const scenes = [scene(3, 'Kitchen'), scene(1, 'Bedroom')]
    planSetups(scenes as never)
    expect(scenes.map((s) => s.scene_number)).toEqual([3, 1])
  })
})

describe('the strip and the first card cannot disagree', () => {
  it('the opening setup is the first SPOKEN scene\'s, whatever the array said', () => {
    const plan = planSetups([scene(3, 'Kitchen'), scene(1, 'Bedroom'), scene(2, 'Bedroom')] as never)
    expect(openingSetupId(plan)).toBe(plan.setupIdOf[1])
    expect(startsSetup(plan, 1)).toBe(true)
  })

  it('a silent opening scene does not claim a room', () => {
    // ⚖️ A silent insert belongs to no setup; the first SPOKEN scene is the
    // first room the creator stands in.
    const plan = planSetups([
      { scene_number: 1, dialogue: '', background: 'Kitchen', camera_framing: 'Wide' },
      scene(2, 'Bedroom'),
    ] as never)
    expect(plan.setupIdOf[1]).toBeNull()
    expect(openingSetupId(plan)).toBe(plan.setupIdOf[2])
  })

  it('nothing spoken at all names no room', () => {
    const plan = planSetups([
      { scene_number: 1, dialogue: '', background: 'Kitchen', camera_framing: 'Wide' },
    ] as never)
    expect(openingSetupId(plan)).toBeNull()
  })

  it('the editor asks for it rather than reading setups[0]', () => {
    // ⚠️ THE READER IS HALF THE FIX. Letters in script order still leaves a
    // strip that derives its own answer a second way.
    expect(EDITOR).toMatch(/\? openingSetupId\(setupPlan\)/)
    expect(EDITOR).not.toMatch(/setupPlan\.setups\[0\]\?\.id/)
  })
})
