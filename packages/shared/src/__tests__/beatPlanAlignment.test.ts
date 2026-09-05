// A PLAN REFUSED WHOLE UPSTREAM AND MIS-INDEXED DOWNSTREAM IS THE SAME BUG.
//
// ⚠️ THE DEFECT. `readBeatPlan` aligns the plan one-to-one with
// `blueprint.script` and REFUSES a plan of a different length entirely, rather
// than mapping it by guesswork. Its own comment says why: "a creator told to
// speak for six seconds on a beat planned for sixteen, with nothing indicating
// anything went wrong."
//
// `buildRecordingScript` then filters the script — dropping the hook, empty
// lines, wholly-placeholder lines, and holding the CTA aside — and indexed the
// plan by position in what SURVIVED. Measured on a four-beat script:
//
//     hook   planned  3s → filtered out, got the estimator (2.4s)
//     setup  planned 11s → took the HOOK's 3s
//     proof  planned 22s → took the SETUP's 11s
//     cta    planned  5s → held aside, got the estimator (2.0s)
//
// Every scene carried a target belonging to a different beat, and the offset
// varies per script, so it was not even a constant shift. The whole-refusal rule
// was intact; the caller reintroduced exactly what it exists to prevent.
//
// ⚖️ THE GUARD IS ON THE PAIRING, NOT ON THE ARITHMETIC. Asserting "index + 1"
// would encode today's filter. These tests assert the PROPERTY — the target a
// scene carries is the target planned for the words it is speaking — which stays
// true however the filter changes.
import { describe, expect, it } from 'vitest'
import { buildRecordingScript } from '../recordingScriptAdapter'
import type { Blueprint } from '../types'

/** A script whose beats are planned to DISTINCT lengths, so any mis-pairing
 *  shows up as a wrong number rather than a coincidence. */
function bp(over: Record<string, unknown> = {}): Blueprint {
  return {
    hook_options: ['Nobody tells you this about lighting'],
    script: [
      { section: 'Hook', line: 'Nobody tells you this about lighting', direction: '' },
      { section: 'Setup', line: 'Here is the setup nobody explains properly.', direction: '' },
      { section: 'Proof', line: 'Here is the proof that it actually works.', direction: '' },
      { section: 'CTA', line: 'Grab the preset pack in my bio.', direction: '' },
    ],
    beat_plan: [
      { beat: 'open', target_sec: '3', scene_type: 'talking_head', proof: 'face' },
      { beat: 'setup', target_sec: '11', scene_type: 'talking_head', proof: 'story' },
      { beat: 'proof', target_sec: '22', scene_type: 'demo', proof: 'screen' },
      { beat: 'close', target_sec: '5', scene_type: 'talking_head', proof: 'face' },
    ],
    ...over,
  } as unknown as Blueprint
}

/** The target a scene ended up carrying, keyed by what it is actually saying. */
function targetsByLine(blueprint: Blueprint): Record<string, number | undefined> {
  const rs = buildRecordingScript({ generationId: 'g', blueprint })
  const out: Record<string, number | undefined> = {}
  // ⚠️ THE CAST WAS UNNECESSARY AND IT COST THE CHECKING. `target_sec` IS on
  //  `RecordingScene` — `number | null | undefined` — and `dialogue` is
  //  `string | null`, so both reads type on their own. Widening the scene to a
  //  bag of keys bought nothing and switched off the compiler for every field
  //  read through it: the sibling file `beatProof` used the identical cast to
  //  read `proof`, which is NOT on the type, and nobody could tell the two apart.
  //
  //  ⚖️ `null` AND `undefined` ARE BOTH "no target" HERE and the map's value type
  //  already says `number | undefined`, so the coalesce is the honest narrowing
  //  rather than a cast that asserts the null away.
  for (const s of rs.scenes) {
    const d = s.dialogue ?? ''
    if (d) out[d] = s.target_sec ?? undefined
  }
  return out
}

describe('a scene is paced by the beat that planned ITS words', () => {
  it('gives every spoken beat its own planned target, not an earlier one', () => {
    const t = targetsByLine(bp())
    expect(t['Nobody tells you this about lighting']).toBe(3)
    expect(t['Here is the setup nobody explains properly.']).toBe(11)
    expect(t['Here is the proof that it actually works.']).toBe(22)
    expect(t['Grab the preset pack in my bio.']).toBe(5)
  })

  it('holds when the filter drops MORE than the hook', () => {
    // ⚠️ THIS IS THE CASE THAT MAKES THE OFFSET VARY. A blank line and a wholly
    // bracketed placeholder are both dropped, so counting survivors drifts by
    // two here and by one above — a fixed "+1" would pass the test above and
    // fail this one.
    const t = targetsByLine(bp({
      script: [
        { section: 'Hook', line: 'Nobody tells you this about lighting', direction: '' },
        { section: 'Dead', line: '   ', direction: '' },
        { section: 'Broken', line: '[Insert selected hook from above]', direction: '' },
        { section: 'Setup', line: 'Here is the setup nobody explains properly.', direction: '' },
        { section: 'Proof', line: 'Here is the proof that it actually works.', direction: '' },
        { section: 'CTA', line: 'Grab the preset pack in my bio.', direction: '' },
      ],
      beat_plan: [
        { beat: 'open', target_sec: '3', scene_type: 'talking_head', proof: 'face' },
        { beat: 'dead', target_sec: '7', scene_type: 'talking_head', proof: '' },
        { beat: 'broken', target_sec: '9', scene_type: 'talking_head', proof: '' },
        { beat: 'setup', target_sec: '11', scene_type: 'talking_head', proof: 'story' },
        { beat: 'proof', target_sec: '22', scene_type: 'demo', proof: 'screen' },
        { beat: 'close', target_sec: '5', scene_type: 'talking_head', proof: 'face' },
      ],
    }))
    expect(t['Here is the setup nobody explains properly.']).toBe(11)
    expect(t['Here is the proof that it actually works.']).toBe(22)
    expect(t['Grab the preset pack in my bio.']).toBe(5)
  })

  it('gives the HOOK its planned TARGET, which it never used to', () => {
    // ⚖️ THE BEAT WHERE LENGTH MATTERS MOST had no target at all. Scene 1 is
    // built before the filter knows which entry it displaced, so the decided
    // target sat in the plan unused.
    //
    // ⚠️ AND THIS TEST WAS HALF WRONG. It also asserted
    // `duration_sec === 3` — that the hook be PACED to its plan. That is the
    // defect, not the fix: assigning both fields the same number makes
    // `sceneOverrunSec` identically 0, so `BeatLength` rendered a bare "3s
    // beat" and the hook became the one beat that could never show drift. The
    // target assertion was always right and stays; the duration assertion
    // asserted the bug and is replaced by its negation. See
    // `aBeatLengthMustBeAbleToDisagree.test.ts`.
    const rs = buildRecordingScript({ generationId: 'g', blueprint: bp() })
    expect(rs.scenes[0].target_sec).toBe(3)
    expect(rs.scenes[0].duration_sec).not.toBe(3)
  })

  it('takes the FIRST hook-like line, so a re-hook keeps its own beat', () => {
    // A mid-script re-hook is not the line scene 1 displaced, and handing scene 1
    // the re-hook's target would be the same mis-pairing wearing a new hat.
    const t = targetsByLine(bp({
      script: [
        { section: 'Hook', line: 'Nobody tells you this about lighting', direction: '' },
        { section: 'Setup', line: 'Here is the setup nobody explains properly.', direction: '' },
        { section: 'Re-hook', line: 'But here is the part that actually matters', direction: '' },
        { section: 'CTA', line: 'Grab the preset pack in my bio.', direction: '' },
      ],
      beat_plan: [
        { beat: 'open', target_sec: '3', scene_type: 'talking_head', proof: 'face' },
        { beat: 'setup', target_sec: '11', scene_type: 'talking_head', proof: 'story' },
        { beat: 'rehook', target_sec: '8', scene_type: 'talking_head', proof: 'turn' },
        { beat: 'close', target_sec: '5', scene_type: 'talking_head', proof: 'face' },
      ],
    }))
    // "Re-hook" is a section label containing `hook`, so the filter drops it —
    // existing behaviour, not this change's to alter. What matters is that the
    // beats that DO survive keep their own targets and scene 1 keeps the 3.
    expect(t['Nobody tells you this about lighting']).toBe(3)
    expect(t['Here is the setup nobody explains properly.']).toBe(11)
    expect(t['Grab the preset pack in my bio.']).toBe(5)
  })
})

describe('an absent target stays absent', () => {
  it('never turns "no plan" into a zero', () => {
    // ⚠️ NULL IS NOT ZERO — a zero reaches the recorder as a cap that stops the
    // take instantly. No plan at all means every scene is estimated and no
    // scene claims a target it was never given.
    const rs = buildRecordingScript({
      generationId: 'g', blueprint: bp({ beat_plan: undefined }),
    })
    for (const s of rs.scenes) {
      expect(s.target_sec).toBeUndefined()
      expect(s.duration_sec).toBeGreaterThan(0)
    }
  })

  it('refuses a misaligned plan WHOLE rather than pairing what it can', () => {
    // The upstream rule, asserted from the caller's side: a plan that disagrees
    // with the script length reaches no scene at all. Partial application is
    // what the source index makes tempting and what stays forbidden.
    const rs = buildRecordingScript({
      generationId: 'g',
      blueprint: bp({
        beat_plan: [
          { beat: 'open', target_sec: '3', scene_type: 'talking_head', proof: 'face' },
          { beat: 'setup', target_sec: '11', scene_type: 'talking_head', proof: 'story' },
        ],
      }),
    })
    for (const s of rs.scenes) {
      expect(s.target_sec).toBeUndefined()
    }
  })

  it('does not pace the fallback CTA to a plan written for other words', () => {
    // With no CTA-labelled beat, the ending is the literal 'Follow for more' —
    // a sentence nothing planned, so nothing may claim to have paced it.
    //
    // ⚖️ IT HOLDS BECAUSE THERE IS NO BEAT, not because the words are checked.
    // An earlier version of the adapter also tested the line for emptiness;
    // mutation-testing showed that branch was unreachable, since the filter
    // already drops empty lines. The condition went, the property stayed.
    const rs = buildRecordingScript({
      generationId: 'g',
      blueprint: bp({
        script: [
          { section: 'Hook', line: 'Nobody tells you this about lighting', direction: '' },
          { section: 'Setup', line: 'Here is the setup nobody explains properly.', direction: '' },
        ],
        beat_plan: [
          { beat: 'open', target_sec: '3', scene_type: 'talking_head', proof: 'face' },
          { beat: 'setup', target_sec: '11', scene_type: 'talking_head', proof: 'story' },
        ],
      }),
    })
    const last = rs.scenes[rs.scenes.length - 1]
    expect(last.dialogue).toBe('Follow for more')
    expect(last.target_sec).toBeUndefined()
  })
})
