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

  it('a script that asks for nothing uses the creator\'s own ending', () => {
    // ⚠️⚠️ THE FALLBACK "Follow for more" IS GONE, ON THE OWNER'S RULING, AND
    // THE EVIDENCE IS THE REPORT THAT PROMPTED IT. Two production runs ended on
    // a real ask with a planned duration and the recorder appended a sixth
    // scene anyway. A creator reading a teleprompter says what is in front of
    // them, so "a weak line they can rewrite" is the same reasoning that
    // produced an invented price. The ending is now the script's own ask, or a
    // CTA THIS creator actually says, or none at all — never a default
    // sentence. See recordingScriptAdapter and end-where-the-writer-ended.
    const out = buildRecordingScript({
      generationId: 'g3',
      blueprint: blueprintOf([
        beat('Hook', 'Here is the part nobody says.'),
        beat('Payoff', 'And that is how the seam holds the dome shape.'),
      ]),
      creatorCtas: ['in bio!!'],
    })
    expect(out.scenes).toHaveLength(3)
    expect(out.scenes[2]!.dialogue).toBe('in bio!!')
    expect(out.ends_without_ask).toBeUndefined()
  })

  it('and ends without one when the creator has none either', () => {
    // ⚖️ NO SCENE, AND THE ABSENCE DECLARED. A scene with no dialogue is a card
    // the creator stands in front of with nothing to say.
    const out = buildRecordingScript({
      generationId: 'g3b',
      blueprint: blueprintOf([
        beat('Hook', 'Here is the part nobody says.'),
        beat('Payoff', 'And that is how the seam holds the dome shape.'),
      ]),
    })
    expect(out.scenes).toHaveLength(2)
    expect(out.ends_without_ask).toBe(true)
    expect(JSON.stringify(out)).not.toContain('Follow for more')
  })

  it('a creator CTA that asks for nothing is not an ending either', () => {
    // ⚠️ `recurring_ctas` IS MODEL-EXTRACTED AND CAN HOLD A FRAGMENT. Appending
    // one that asks for nothing is the same defect with a friendlier source.
    const out = buildRecordingScript({
      generationId: 'g3c',
      blueprint: blueprintOf([
        beat('Hook', 'Here is the part nobody says.'),
        beat('Payoff', 'And that is how the seam holds the dome shape.'),
      ]),
      creatorCtas: ['thanks for watching'],
    })
    expect(out.ends_without_ask).toBe(true)
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
    // The aside stays in the body and the script ends without an appended ask.
    expect(out.ends_without_ask).toBe(true)
    expect(out.scenes.filter((s) => s.scene_type === 'cta')).toHaveLength(0)
    expect(out.scenes[1]!.dialogue).toContain('Comment if you have hit this too')
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

// ── AND THE SURFACES AGREE ABOUT WHERE A SCRIPT ENDS ──────────────────────
//
// ⚠️ TWO SCREENS BUILD THIS TIMELINE. V2Building builds the one that is
// PERSISTED; ScriptEditor rebuilds it in memory when a load returns null. If
// only one passed the creator's own CTAs, one script would end with her line on
// one screen and with nothing on the other.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')

describe('the ending is theirs, on every surface that builds one', () => {
  it('both builders pass the creator\'s own CTAs, through one reader', () => {
    expect(read('apps/web/src/pages/v2/V2Building.tsx')).toContain('creatorCtas: ownCtas')
    expect(read('apps/web/src/components/ScriptEditor.tsx')).toContain('creatorCtas')
    for (const f of ['apps/web/src/pages/v2/V2Building.tsx', 'apps/web/src/components/ScriptEditor.tsx']) {
      expect(read(f), f).toContain('readCreatorCtas')
    }
  })

  it('a failed read is an empty list, never an invented ending', () => {
    // ⚖️ An outage must produce the honest "ends without an ask" state.
    expect(read('apps/web/src/lib/creatorCtasRead.ts')).toContain('catch {\n    return []\n  }')
  })

  it('the screen says it when a script ends without an ask', () => {
    const editor = read('apps/web/src/components/ScriptEditor.tsx')
    expect(editor).toContain('script.ends_without_ask &&')
    expect(editor).toContain('This script ends without asking for anything')
    // ⚠️ AND IT DOES NOT SCOLD. Ending without an ask can be exactly right.
    expect(editor).toContain('That can be exactly right')
  })

  it('no default ending survives in the adapter\'s CODE', () => {
    // ⚠️ THE DEFECT, ASSERTED AT ITS SOURCE — AND A MENTION IS NOT A CALL. This
    // file's header narrates the bug at length, so a naive substring match would
    // fail on the very comment explaining the fix. Whole-line comments are
    // dropped; nothing after `//` on a code line is, because a real assignment
    // sitting after a trailing comment must stay visible.
    const code = read('packages/shared/src/recordingScriptAdapter.ts')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n')
    expect(code).not.toContain("'Follow for more'")
    // cta.ts still defines the sentence for the goal-derived CTA it owns — that
    // is a different decision, made where a creator can see and change it.
    expect(read('packages/shared/src/cta.ts')).toContain("follow: 'Follow for more'")
  })
})
