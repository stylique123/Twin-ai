/**
 * ⚠️ THE BEAT WAS NOT JUST SILENT — IT WAS GONE. `beatAsk` blanks `line` on
 * purpose when the writer refused a beat and offered no usable scaffold. But
 * `buildRecordingScript` returns early on an empty line ("an empty dialogue is
 * not a scene the teleprompter can show"), so that beat was DROPPED from the
 * recording script entirely: the creator never saw the question, and the beat
 * itself vanished between the plan and the camera.
 */
import { describe, expect, it } from 'vitest'
import { buildRecordingScript } from '../recordingScriptAdapter'
import { DEFAULT_ASK_SEC } from '../recordingScript'
import type { Blueprint } from '../types'

const ASK = 'What did the first client actually say when it worked?'

function blueprintWith(script: Blueprint['script']): Blueprint {
  return {
    reference_read: { platform: 'tiktok', format_label: 'x', why_it_works: [], retention_map: [] },
    hook_options: ['A hook that opens the video.'],
    script,
    shot_list: [], captions: [], edit_checklist: [],
    caption_packet: { caption_style: '', pacing: '', emphasis: '', export: '' },
    publish_plan: [], production_sprint: [],
  } as unknown as Blueprint
}

const beat = (over: Record<string, unknown>) =>
  ({ section: 'Proof', line: '', direction: '', ...over }) as unknown as Blueprint['script'][number]

describe('a beat with a question and no words still reaches the camera', () => {
  const built = buildRecordingScript({ generationId: 'gen-1', blueprint: blueprintWith([
      beat({ section: 'Hook', line: 'A hook that opens the video.' }),
      beat({ line: '', ask: ASK }),
      beat({ line: 'And that is why it matters.' }),
    ]), selectedHook: 'A hook that opens the video.' })

  it('is a scene at all — this is the defect', () => {
    expect(built.scenes.some((s) => s.ask === ASK)).toBe(true)
  })

  it('and the beats after it are not lost either', () => {
    expect(built.scenes.some((s) => s.dialogue === 'And that is why it matters.')).toBe(true)
  })

  // ⚖️ A SPOKEN SCENE WITH NOTHING WRITTEN, NOT A SILENT ONE. Nobody speaks on
  // a silent beat; here the creator speaks their OWN words, which is the entire
  // point of asking.
  it('shows in the teleprompter with no dialogue to read', () => {
    const s = built.scenes.find((x) => x.ask === ASK)!
    expect(s.dialogue).toBeNull()
    expect(s.show_in_teleprompter).toBe(true)
  })

  it('is given a recording allowance rather than a timing of nothing', () => {
    const s = built.scenes.find((x) => x.ask === ASK)!
    expect(s.duration_sec).toBe(DEFAULT_ASK_SEC)
  })

  it('scene numbers stay contiguous and in order', () => {
    expect(built.scenes.map((s) => s.scene_number)).toEqual(
      built.scenes.map((_, i) => i + 1))
  })
})

describe('a beat with a question AND a scaffold keeps both', () => {
  const built = buildRecordingScript({ generationId: 'gen-2', blueprint: blueprintWith([
      beat({ section: 'Hook', line: 'A hook that opens the video.' }),
      beat({ line: 'It changed the week it landed.', ask: ASK }),
    ]), selectedHook: 'A hook that opens the video.' })

  // ⚖️ SHOWING THE SCAFFOLD WITHOUT THE QUESTION WOULD HIDE WHAT THE BLANK IS
  // FOR. The creator reads real words and still supplies the one fact.
  it('carries the words and the question together', () => {
    const s = built.scenes.find((x) => x.ask === ASK)!
    expect(s.dialogue).toBe('It changed the week it landed.')
    expect(s.ask).toBe(ASK)
  })
})

describe('nothing changes for a script that never asked', () => {
  const plain = [
    beat({ section: 'Hook', line: 'A hook that opens the video.' }),
    beat({ line: 'A second thing worth saying.' }),
  ]

  // ⚠️ MEASURED: 0 of 41 production generations carry an `ask`, and 9 have a
  // stored scene_timeline. No existing generation can gain a scene from this,
  // so no stored take can be renumbered out from under a creator.
  it('produces no ask and the same scene count', () => {
    const built = buildRecordingScript({ generationId: 'gen-4', blueprint: blueprintWith(plain), selectedHook: 'A hook that opens the video.' })
    expect(built.scenes.every((s) => s.ask == null)).toBe(true)
    expect(built.scenes.length).toBeGreaterThan(0)
  })

  it('an empty line with NO question is still dropped, exactly as before', () => {
    const built = buildRecordingScript({ generationId: 'gen-6', blueprint: blueprintWith([
        beat({ section: 'Hook', line: 'A hook that opens the video.' }),
        beat({ line: '   ' }),
        beat({ line: 'The last thing.' }),
      ]), selectedHook: 'A hook that opens the video.' })
    expect(built.scenes.some((s) => s.dialogue === null && s.ask == null && s.show_in_teleprompter)).toBe(false)
  })
})

describe('a malformed ask is not an ask', () => {
  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['a number', 7],
    ['null', null],
  ])('%s leaves the beat dropped rather than inventing a scene', (_l, v) => {
    const built = buildRecordingScript({ generationId: 'gen-5', blueprint: blueprintWith([
        beat({ section: 'Hook', line: 'A hook that opens the video.' }),
        beat({ line: '', ask: v }),
      ]), selectedHook: 'A hook that opens the video.' })
    expect(built.scenes.every((s) => s.ask == null)).toBe(true)
  })
})
