import { describe, it, expect } from 'vitest'
import { readEarlyAnswer, EARLY_PROMPT, EARLY_LOOK_FRAMES } from '../earlyLookRules.js'

describe('reading the early answer', () => {
  it('reads a complete answer', () => {
    expect(readEarlyAnswer(
      { talking_to_camera: 'yes', people_on_camera: 'one', animated: 'no' }, 2,
    )).toEqual({
      someoneTalkingToCamera: true, peopleOnCamera: 'one', looksAnimated: false,
      framesLookedAt: 2, failure: null,
    })
  })

  // ⚠️ THE WHOLE POINT. "unsure" is a correct answer and must survive as null.
  // If it arrived as `false`, an unsure model would refuse the creator's video.
  it('"unsure" becomes null, never false', () => {
    const r = readEarlyAnswer(
      { talking_to_camera: 'unsure', people_on_camera: 'unsure', animated: 'unsure' }, 2,
    )
    expect(r.someoneTalkingToCamera).toBeNull()
    expect(r.peopleOnCamera).toBeNull()
    expect(r.looksAnimated).toBeNull()
  })

  it('a missing key is null, not false', () => {
    const r = readEarlyAnswer({ people_on_camera: 'one' }, 2)
    expect(r.someoneTalkingToCamera).toBeNull()
    expect(r.looksAnimated).toBeNull()
    expect(r.peopleOnCamera).toBe('one')
  })

  it('a word we do not recognise is null, not false', () => {
    const r = readEarlyAnswer(
      { talking_to_camera: 'probably', people_on_camera: 'two', animated: 'kind of' }, 2,
    )
    expect(r.someoneTalkingToCamera).toBeNull()
    expect(r.peopleOnCamera).toBeNull()
    expect(r.looksAnimated).toBeNull()
  })

  // ⚠️ true IS THE ONE ANSWER THAT MUST NOT BE INVENTED EITHER. A truthy
  // non-'yes' value must not read as yes.
  it('a truthy non-"yes" does not become true', () => {
    expect(readEarlyAnswer({ talking_to_camera: true }, 2).someoneTalkingToCamera).toBeNull()
    expect(readEarlyAnswer({ talking_to_camera: 1 }, 2).someoneTalkingToCamera).toBeNull()
  })

  it('rubbish in place of an object yields all nulls, not a throw', () => {
    for (const junk of [null, undefined, 'yes', 42, []]) {
      const r = readEarlyAnswer(junk, 2)
      expect(r.someoneTalkingToCamera).toBeNull()
      expect(r.peopleOnCamera).toBeNull()
    }
  })

  it('carries through the frame count it was actually given', () => {
    expect(readEarlyAnswer({}, 0).framesLookedAt).toBe(0)
    expect(readEarlyAnswer({}, 1).framesLookedAt).toBe(1)
  })
})

describe('the question put to the model', () => {
  // ⚖️ "unsure" MUST BE OFFERED FOR ALL THREE. A question with only yes/no
  // forces a guess, and a guess stops a real person using a video they wanted.
  it('offers "unsure" on every question', () => {
    expect(EARLY_PROMPT.match(/unsure/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('states the frame count it actually sends', () => {
    expect(EARLY_PROMPT).toContain(`${EARLY_LOOK_FRAMES} still frames`)
  })

  // ⚠️ THE SKIT DEFINITION HAS TO BE IN THE QUESTION. Without it the model reads
  // "two people on camera" as talking to camera, and skits pass the gate.
  it('tells the model that acting out a scene is not talking to camera', () => {
    expect(EARLY_PROMPT.toLowerCase()).toContain('acting out a scene')
  })
})
