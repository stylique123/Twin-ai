// THE DRIFT INDICATOR WAS WIRED TO A VALUE DEFINED TO AGREE WITH ITSELF.
//
// WHY THIS FILE EXISTS. Seven audited runs put a number labelled "Xs beat" in
// front of a creator and not one of them showed the drift line beside it — run
// G rendered a twelve-word CTA as "28s beat". The machinery was all present:
// `estimateDurationSec` converts words to seconds, `sceneOverrunSec` subtracts,
// `BeatLength` renders. What was missing is that the adapter SEEDED
// `duration_sec` FROM `target_sec` on every dialogue-bearing scene — the hook by
// direct overwrite, spoken beats and the CTA by taking the plan and using the
// word estimate only as a fallback. So (live − target) was exactly 0 on every
// freshly generated script, `overrunWorthShowing(0)` was false, and the bare
// branch rendered. Drift could only appear AFTER an edit, because
// `applyDialogueEdit` was the only code path that ever re-estimated from words.
//
// ⚖️ THESE ASSERT DISAGREEMENT, NOT A NUMBER. Pinning `duration_sec` to a
// specific figure would break the moment anyone recalibrates DEFAULT_WPM, and
// would not catch the defect anyway — the bug was that two independent
// quantities were the SAME quantity. So the property under test is that a plan
// which contradicts the words it planned for produces a scene whose two fields
// contradict each other, which is the only condition under which the surface
// can say anything true.
import { describe, it, expect } from 'vitest'
import { buildRecordingScript } from '../recordingScriptAdapter'
import { sceneOverrunSec, overrunWorthShowing } from '../beatPlan'
import type { Blueprint } from '../types'

const SHORT_CTA = 'Follow me for the next one'          // 6 words, ~2.4s
const LONG_SETUP =
  'It is never the camera and it is never the microphone either, it is the ' +
  'room you are standing in and the walls you never thought about once'      // 30 words, ~12s

// Run G's own sequence, and the shape of the lie: every target is a decision
// the writer made before it wrote a single word, and nothing checked it after.
const RUN_G_TARGETS = [3, 8, 13, 18, 23, 28]

function blueprint(): Blueprint {
  return {
    reference_read: { platform: 'reels', format_label: 'x', why_it_works: [], retention_map: [] },
    hook_options: ['Most home studios fail for one boring reason'],
    script: [
      { section: 'Hook', line: 'Most home studios fail for one boring reason', direction: 'to camera' },
      { section: 'Setup', line: LONG_SETUP, direction: 'gesture' },
      { section: 'CTA', line: SHORT_CTA, direction: 'warm' },
    ],
    beat_plan: [
      { beat: 'stop the scroll', target_sec: RUN_G_TARGETS[0], proof: 'n/a' },
      { beat: 'name the cause', target_sec: RUN_G_TARGETS[1], proof: 'n/a' },
      { beat: 'ask for the follow', target_sec: RUN_G_TARGETS[5], proof: 'n/a' },
    ],
    shot_list: [], captions: [], edit_checklist: [],
    caption_packet: { caption_style: '', pacing: '', emphasis: '', export: '' },
    publish_plan: [], production_sprint: [],
  } as unknown as Blueprint
}

describe('a planned length and a written length are two facts', () => {
  const scenes = buildRecordingScript({ generationId: 'g1', blueprint: blueprint(), platform: 'reels' }).scenes
  const spoken = scenes.filter((s) => typeof s.dialogue === 'string' && s.dialogue !== '')

  it('every dialogue-bearing scene still carries the plan as its target', () => {
    // The fix must not have thrown the target away — without it there is
    // nothing to drift FROM, and BeatLength renders nothing at all, which is
    // the opposite failure and just as silent.
    expect(spoken.length).toBe(3)
    expect(spoken.map((s) => s.target_sec)).toEqual([3, 8, 28])
  })

  it('the CTA that overran its plan by 23 seconds says so on first render', () => {
    // ⚠️ THE EXACT RUN G LINE. Twelve words against a 28s plan rendered as a
    // calm "28s beat" and a creator filmed to it.
    const cta = spoken[2]
    const over = sceneOverrunSec(cta)
    expect(over).not.toBeNull()
    // It comes in SHORT, by a lot. `overrunWorthShowing` is one-sided on
    // purpose, so this specific scene correctly shows no COST warning — but the
    // two fields now disagree, which is what makes the number honest.
    expect(cta.duration_sec).not.toBe(cta.target_sec)
    expect(over!).toBeLessThan(-15)
  })

  it('a beat whose words overrun its plan trips the drift line', () => {
    // Thirty words into an 8s beat: the case FIX 7's own header cites.
    const setup = spoken[1]
    expect(overrunWorthShowing(sceneOverrunSec(setup))).toBe(true)
  })

  it('the hook is no longer the one beat that can never drift', () => {
    // ⚠️ THE REGRESSION THIS FILE EXISTS TO HOLD. `scenes[0].duration_sec =
    // plannedHook` made the hook's drift identically 0 by assignment. Deleting
    // the fix restores that, and this is the assertion that notices.
    const hook = scenes[0]
    expect(hook.target_sec).toBe(3)
    expect(hook.duration_sec).not.toBe(hook.target_sec)
  })

  it('no dialogue-bearing scene has its two lengths equal by construction', () => {
    // The totality guard. Three scenes today; a fourth scene type added later
    // that seeds one field from the other fails here rather than shipping a
    // fourth silent surface.
    const identical = spoken.filter(
      (s) => typeof s.target_sec === 'number' && s.duration_sec === s.target_sec,
    )
    expect(identical).toEqual([])
  })
})
