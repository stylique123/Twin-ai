// THE THUMBNAIL SHOT SHIFTED EVERY SCENE'S FRAMING BY ONE, ON MOST RUNS.
//
// ⚠️⚠️ MEASURED ON ALL 13 PRODUCTION GENERATIONS OF 2026-09-10:
//
//   shot_list length = script length + 1 ............... 13 of 13
//   shots with shot_type 'cover_frame' ................. exactly 1 per run
//   that cover frame sits at INDEX 0 ................... 9 of 13
//   ...and at the LAST index ........................... 4 of 13
//
// A cover frame is the thumbnail still — not a beat anybody performs — and its
// position is not stable. `framingFor` indexed `shot_list` by the SCRIPT beat
// index, so on the 9 runs where the cover frame came first, every scene read the
// shot BEFORE the beat it described: the hook got the thumbnail's framing, beat
// two got the hook's, and so on to the end.
//
// ⚠️ AND THIS IS THE EVIDENCE A PREVIOUS CHANGE SAID IT LACKED. The call-site
// comment read "this indexes `shot_list`, a DIFFERENT array from `script`, whose
// alignment with the script is its own question and NOT ONE THIS CHANGE HAS
// EVIDENCE ABOUT". Stopping there was right. The numbers above answer it.
//
// ⚠️ THE AUDIT CALLED THIS "SILENT DUPLICATE SCENES" AND THAT DOES NOT
// REPRODUCE. There are no duplicates: the extra entry is one cover frame per run,
// 13 of 13. Deduplicating would have DELETED the creator's thumbnail shot — a
// regression wearing a fix's clothes. What is real is the misalignment.
import { describe, expect, it } from 'vitest'
import { performedShots, buildRecordingScript } from '../recordingScriptAdapter'

type Shot = { shot: string; framing: string; notes: string; shot_type?: 'talking_head' | 'b_roll' | 'cover_frame' }

const beat = (line: string) => ({ line, section: 'Body' })
const shot = (name: string, framing: string, type: Shot['shot_type'] = 'talking_head'): Shot =>
  ({ shot: name, framing, notes: `notes for ${name}`, shot_type: type })

// The shape production actually produced: three spoken beats, four shots, the
// cover frame FIRST — the 9-of-13 case.
const COVER_FIRST = {
  script: [beat('Hook line here'), beat('Second beat here'), beat('Third beat here')],
  shot_list: [
    shot('Cover frame in activewear', 'COVER FRAMING', 'cover_frame'),
    shot('Hook shot', 'HOOK FRAMING'),
    shot('Second shot', 'SECOND FRAMING'),
    shot('Third shot', 'THIRD FRAMING'),
  ],
}

const COVER_LAST = {
  script: COVER_FIRST.script,
  shot_list: [
    shot('Hook shot', 'HOOK FRAMING'),
    shot('Second shot', 'SECOND FRAMING'),
    shot('Third shot', 'THIRD FRAMING'),
    shot('Cover frame thumbnail still', 'COVER FRAMING', 'cover_frame'),
  ],
}

describe('the cover frame is excluded from the performed order', () => {
  it('drops it wherever it sits, and keeps every performed shot', () => {
    for (const bp of [COVER_FIRST, COVER_LAST]) {
      const performed = performedShots(bp as never)
      expect(performed.map((s) => s.framing))
        .toEqual(['HOOK FRAMING', 'SECOND FRAMING', 'THIRD FRAMING'])
    }
  })

  it('and the two positions now yield the SAME order, which is the whole bug', () => {
    // ⚠️⚠️ THE FALSIFYING COMPARISON. Before this change these two blueprints —
    // identical except for where the thumbnail sits — produced DIFFERENT framings
    // for the same beats. A creator's card depended on an array position nobody
    // controlled.
    expect(performedShots(COVER_FIRST as never).map((s) => s.shot))
      .toEqual(performedShots(COVER_LAST as never).map((s) => s.shot))
  })

  it('an absent shot_type is treated as performed, not dropped', () => {
    // ⚖️ OLDER ROWS CARRY NO `shot_type`. Dropping those would blank the framing
    // on every historical script — absent is not 'cover_frame'.
    const legacy = { script: COVER_FIRST.script, shot_list: [
      { shot: 'Old shot', framing: 'OLD FRAMING', notes: '' },
    ] }
    expect(performedShots(legacy as never).map((s) => s.framing)).toEqual(['OLD FRAMING'])
  })

  it('b_roll is deliberately NOT dropped', () => {
    // ⚖️ ONE CHANGE, ONE PIECE OF EVIDENCE. Production carries ZERO shots typed
    // `b_roll`, and the b-roll extraction keys on a NAME heuristic rather than the
    // type — so moving it would be a second change with no evidence, which is
    // exactly what the previous author declined to do here.
    const withBroll = { script: COVER_FIRST.script, shot_list: [
      shot('Insert of the band', 'BROLL FRAMING', 'b_roll'),
      shot('Hook shot', 'HOOK FRAMING'),
    ] }
    expect(performedShots(withBroll as never).map((s) => s.framing))
      .toEqual(['BROLL FRAMING', 'HOOK FRAMING'])
  })

  it('an empty or missing shot_list stays empty rather than throwing', () => {
    expect(performedShots({ shot_list: [] } as never)).toEqual([])
    expect(performedShots({} as never)).toEqual([])
  })
})

describe('the scene cards a creator reads get their OWN beat framing', () => {
  it('the hook no longer carries the thumbnail framing', () => {
    // ⚠️ THE CREATOR-FACING CONSEQUENCE, ASSERTED END TO END rather than on the
    // helper alone: the hook is scene 1 and it must not read COVER FRAMING.
    const out = buildRecordingScript({ generationId: 'g1', blueprint: COVER_FIRST as never, selectedHook: 'Hook line here' })
    const first = out.scenes[0]
    expect(first.camera_framing).not.toBe('COVER FRAMING')
    expect(first.camera_framing).toBe('HOOK FRAMING')
  })

  it('and the same script yields the same cards whichever end the cover sits at', () => {
    const a = buildRecordingScript({ generationId: 'g1', blueprint: COVER_FIRST as never, selectedHook: 'Hook line here' })
    const b = buildRecordingScript({ generationId: 'g1', blueprint: COVER_LAST as never, selectedHook: 'Hook line here' })
    expect(a.scenes.map((s) => s.camera_framing)).toEqual(b.scenes.map((s) => s.camera_framing))
  })
})
