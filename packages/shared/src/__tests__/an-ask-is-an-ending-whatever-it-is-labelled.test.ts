import { describe, it, expect } from 'vitest'
import { buildRecordingScript } from '../recordingScriptAdapter'
import { ctaMechanismIn, GOAL_FROM_MECHANISM, CTA_MECHANISMS } from '../cta'

/**
 * ⚠️ REPRODUCED FROM PRODUCTION, NOT RECONSTRUCTED. Two runs on
 * @theofferingmicrobakery — the @firo.candles and @tylertalksbusiness
 * references — showed a recorder card reading:
 *
 *     Scene 6 · about 1.5s · no beat length planned
 *
 * carrying the words "Follow for more". I pulled both blueprints: NEITHER
 * contains that string anywhere. They are 4 and 5 scenes, both ending on a beat
 * named `Payoff` that already asks the viewer for something, each with a
 * planned target (9s and 12s).
 *
 * The adapter matched a CTA by SECTION NAME only, found none, and appended a
 * generic ending of its own: unplanned (so no beat length) and 1.5 seconds by
 * estimate. Every word on that card was true and the scene should not exist.
 *
 * ⚖️ AN ASK IS AN ENDING WHATEVER THE WRITER CALLED IT.
 */

const beat = (section: string, line: string) => ({
  section, line, direction: '', background: '', action_posing: '', cuts_info: '',
})

const blueprintOf = (script: ReturnType<typeof beat>[], plan?: unknown) => ({
  script,
  ...(plan ? { beat_plan: plan } : {}),
}) as never

describe('an ask is an ending whatever it is labelled', () => {
  it('does not append a sixth scene when the last beat already asks', () => {
    // The @firo.candles shape: four beats, last one named Payoff, ending on a
    // question to the comments.
    const out = buildRecordingScript({
      generationId: 'g1',
      blueprint: blueprintOf([
        beat('Hook', 'Your room smells like nothing at all.'),
        beat('Setup', 'Scent is the fastest way into a memory.'),
        beat('Proof', 'I blend these in small batches at home.'),
        beat('Payoff', 'Tell me in the comments, what is the one scent note that helps you come back to yourself?'),
      ]),
    })
    expect(out.scenes).toHaveLength(4)
    // ⚠️ THE STRING THAT WAS REPORTED. It must not be anywhere in the timeline.
    expect(JSON.stringify(out.scenes)).not.toContain('Follow for more')
    const last = out.scenes[out.scenes.length - 1]!
    expect(last.scene_type).toBe('cta')
    expect(last.dialogue).toContain('Tell me in the comments')
  })

  it('the recovered ending takes its own beat\'s planned length', () => {
    // ⚖️ THE HALF THAT MAKES THE CARD CORRECT. Before this the appended scene
    // had no plan at all, which is what "no beat length planned" was reporting.
    const out = buildRecordingScript({
      generationId: 'g2',
      blueprint: blueprintOf(
        [beat('Hook', 'Here is the part nobody says.'), beat('Payoff', 'Save this for the next time you bake.')],
        [{ target_sec: 4 }, { target_sec: 9 }],
      ),
    })
    expect(out.scenes[out.scenes.length - 1]!.target_sec).toBe(9)
  })

  it('a script that asks for nothing still gets an ending', () => {
    // ⚠️ THE OTHER DIRECTION, PINNED. Recognising real asks must not silence the
    // fallback for a script that genuinely just stops.
    const out = buildRecordingScript({
      generationId: 'g3',
      blueprint: blueprintOf([
        beat('Hook', 'Here is the part nobody says.'),
        beat('Payoff', 'And that is how the seam holds the dome shape.'),
      ]),
    })
    expect(out.scenes).toHaveLength(3)
    expect(out.scenes[2]!.dialogue).toBe('Follow for more')
  })

  it('a mid-script aside is not promoted to the ending', () => {
    // ⚖️ Promoting any beat that asks would move the middle of the video to the
    // end — the failure the re-hook exclusion already exists to prevent.
    const out = buildRecordingScript({
      generationId: 'g4',
      blueprint: blueprintOf([
        beat('Hook', 'Here is the part nobody says.'),
        beat('Setup', 'Comment if you have hit this too.'),
        beat('Payoff', 'And that is the whole routine.'),
      ]),
    })
    expect(out.scenes[out.scenes.length - 1]!.dialogue).toBe('Follow for more')
    expect(out.scenes.filter((s) => s.scene_type === 'cta')).toHaveLength(1)
  })
})

describe('one vocabulary for what a line asks', () => {
  it('reads the seven mechanisms and nothing else', () => {
    expect(ctaMechanismIn('the link is in my bio')).toBe('link')
    expect(ctaMechanismIn('save this for later')).toBe('save')
    expect(ctaMechanismIn('drop an injury in the comments')).toBe('comment')
    expect(ctaMechanismIn('use my code VICKIE')).toBe('buy')
    // ⚠️ NULL IS A REAL ANSWER. Most sentences ask for nothing, and a detector
    // that found an ask everywhere would suppress the fallback on every script.
    expect(ctaMechanismIn('And that is the whole routine.')).toBeNull()
    expect(ctaMechanismIn('')).toBeNull()
    expect(ctaMechanismIn(null)).toBeNull()
  })

  it('the commercial reading wins when one line carries two', () => {
    // Losing the sale loses the disclosure obligation.
    expect(ctaMechanismIn("comment SAUCE and I'll drop the link in bio")).toBe('link')
  })

  it('every mechanism maps to a goal', () => {
    // ⚠️ A mechanism added without one would silently stop the goal inference
    // from ever seeing that family.
    for (const m of CTA_MECHANISMS) expect(GOAL_FROM_MECHANISM[m], m).toBeTruthy()
  })
})
