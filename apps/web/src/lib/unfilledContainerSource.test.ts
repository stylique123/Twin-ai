// P1-6 — THE GAP CHECKER HAS TO SCAN THE SCRIPT THAT GETS FILMED.
//
// `UnfilledContainers` read `blueprint.script[]`, the model's beats.
// `buildRecordingScript` maps those onto `scene_timeline` LOSSILY — a
// hook-lookalike opening line is dropped, the CTA beat moves to the end, silent
// b-roll scenes are inserted — so `script[i]` and `scenes[i]` are not the same
// line. `declaredClips.ts` was corrected for exactly this; the warning banner
// was not.
//
// The consequence is worse than a missing feature. A warning about a
// placeholder that is not in the filmed script trains the creator to dismiss
// the banner, and the banner is the only thing standing between `[product name]`
// and a teleprompter reading it aloud. §2.3's rule — an unverified fact never
// reaches a script — is enforced by a human noticing, so the human has to be
// shown the truth.
//
// These tests are on the SOURCE of the lines, not on the resolver: the resolver
// already has its own tests, and it was never the broken half.
import { describe, expect, it } from 'vitest'
import { buildRecordingScript, resolveScript } from '@twinai/shared'
import type { Blueprint } from '@twinai/shared'

const HOOK = 'Stop scrolling if you rent'

/** A blueprint whose beats and whose filmed scenes deliberately differ. */
function blueprint(): Blueprint {
  return {
    hook_options: [HOOK],
    script: [
      // Dropped by the adapter: it restates the hook, which scene 1 already is.
      { line: HOOK },
      { line: 'Most people overpay because of [the fee name].' },
      { line: 'Follow for more.' },
    ],
  } as unknown as Blueprint
}

const filmedLines = (b: Blueprint) =>
  buildRecordingScript({ generationId: 'g1', blueprint: b, selectedHook: HOOK })
    .scenes.map((s) => s.dialogue ?? '')

describe('the two scripts genuinely differ, so the source matters', () => {
  it('the filmed scenes are NOT the blueprint beats', () => {
    // If this ever became false the bug would be unreachable and so would the
    // fix — and a later refactor could quietly restore the wrong source with
    // every test still green.
    const beats = (blueprint().script ?? []).map((s) => s.line ?? '')
    expect(filmedLines(blueprint())).not.toEqual(beats)
  })
})

describe('a placeholder is reported from the filmed script', () => {
  it('finds a slot that survives into the scenes', () => {
    const blocking = resolveScript(filmedLines(blueprint()), HOOK).blocking
    expect(blocking.length).toBeGreaterThan(0)
    expect(JSON.stringify(blocking)).toContain('the fee name')
  })

  it('does NOT warn about a bracket the creator removed from the filmed script', () => {
    // The false-positive half. Scanning the blueprint would still report this
    // slot after the creator edited it out, and a warning they cannot clear is
    // how a safety banner becomes furniture.
    const b = blueprint()
    const edited: Blueprint = {
      ...b,
      script: [{ line: HOOK }, { line: 'Most people overpay because of the booking fee.' }, { line: 'Follow for more.' }],
    } as unknown as Blueprint
    const blocking = resolveScript(filmedLines(edited), HOOK).blocking
    expect(JSON.stringify(blocking)).not.toContain('the fee name')
  })
})

describe('the hook is not double-counted', () => {
  it('a placeholder in the hook is not reported twice', () => {
    // Scene 1 IS the hook, and the resolver is told the hook separately. A
    // source that also included the blueprint's hook-restating beat would
    // report the same slot from two places and imply two problems.
    const b: Blueprint = {
      hook_options: ['The truth about [the fee name]'],
      script: [{ line: 'The truth about [the fee name]' }, { line: 'Follow for more.' }],
    } as unknown as Blueprint
    const hook = 'The truth about [the fee name]'
    const blocking = resolveScript(
      buildRecordingScript({ generationId: 'g1', blueprint: b, selectedHook: hook })
        .scenes.map((s) => s.dialogue ?? ''),
      hook,
    ).blocking
    // Counted as FINDINGS, not as string occurrences — a slot serialises both
    // its `raw` (`[the fee name]`) and its `inner` (`the fee name`), so a
    // substring count reports two for one finding. That miscount is worth
    // leaving a note about: it is the kind of assertion that fails, gets
    // "fixed" by loosening the bound, and thereafter proves nothing.
    const findings = blocking.reduce((n, b) => n + b.slots.length, 0)
    expect(findings).toBe(1)
  })
})
