// Blueprint -> RecordingScript: the CTA joint.
//
// WHY THIS FILE EXISTS. The adapter had no test, and it shipped a defect that
// reached every video ever made: an operator-precedence mistake meant the
// spoken CTA was always one of two hardcoded literals, while the model's real
// CTA — which the prompt spends a paragraph demanding point at the creator's
// actual offer — was never read. A test asserting "the CTA scene exists" would
// have passed throughout. So these assert the CONTENT, against a blueprint
// shaped the way generate-blueprint's own schema says it returns one.
import { describe, it, expect } from 'vitest'
import { buildRecordingScript } from '../recordingScriptAdapter'
import type { Blueprint } from '../types'

const REAL_CTA = 'Grab the free room-setup checklist in my bio and film your first one tonight'

function blueprint(over: Partial<Blueprint> = {}): Blueprint {
  return {
    reference_read: {
      platform: 'reels',
      format_label: 'The Trust Builder',
      why_it_works: ['plain talk'],
      retention_map: [{ beat: 'Hook', goal: 'stop the scroll' }],
    },
    hook_options: ['Most home studios fail for one boring reason'],
    script: [
      { section: 'Hook', line: 'Most home studios fail for one boring reason', direction: 'straight to camera' },
      { section: 'Setup', line: 'It is never the camera. It is the room you are standing in.', direction: 'gesture' },
      { section: 'Re-hook', line: 'And here is the part nobody tells you about foam panels.', direction: 'lean in' },
      { section: 'CTA', line: REAL_CTA, direction: 'warm, slow down' },
    ],
    shot_list: [
      { shot: 'Talking head', framing: 'Chest-up shot', notes: 'plain wall' },
    ],
    captions: [],
    edit_checklist: [],
    caption_packet: { caption_style: '', pacing: '', emphasis: '', export: '' },
    publish_plan: [
      // The POST caption. Deliberately different from the spoken CTA, and
      // deliberately something nobody would ever read out loud.
      { platform: 'reels', caption: 'studio tips 🎙️ #homestudio #podcasting', hashtags: ['#homestudio'], best_time: '7pm' },
    ],
    production_sprint: [],
    ...over,
  } as Blueprint
}

const build = (bp: Blueprint) => buildRecordingScript({ generationId: 'gen-1', blueprint: bp })
const ctaScene = (bp: Blueprint) => build(bp).scenes.find((s) => s.scene_type === 'cta')

describe('the CTA the creator actually reads', () => {
  it("is the script's CTA beat, not a hardcoded line", () => {
    // THE REGRESSION. Before the fix this was always 'Follow for more like this'.
    expect(ctaScene(blueprint())?.dialogue).toBe(REAL_CTA)
  })

  it('MUTATION: is never the two literals the broken ternary could produce', () => {
    // Pinning the exact wrong answers, so a future refactor that reintroduces
    // a hardcoded ending fails here rather than silently shipping.
    const d = ctaScene(blueprint())?.dialogue
    expect(d).not.toBe('Follow for more like this')
    expect(d).not.toBe('Follow for more')
  })

  it('is never the publish_plan post caption, which is typed and not spoken', () => {
    const d = ctaScene(blueprint())?.dialogue ?? ''
    expect(d).not.toContain('#homestudio')
    expect(d).not.toContain('🎙️')
  })

  it('appears exactly once — the CTA beat is not ALSO left in the body', () => {
    const scenes = build(blueprint()).scenes
    expect(scenes.filter((s) => s.dialogue === REAL_CTA)).toHaveLength(1)
    expect(scenes.filter((s) => s.scene_type === 'cta')).toHaveLength(1)
  })

  it('is the LAST scene', () => {
    const scenes = build(blueprint()).scenes
    expect(scenes[scenes.length - 1].scene_type).toBe('cta')
  })

  it('carries the CTA beat\'s own direction, not scene 1\'s', () => {
    expect(ctaScene(blueprint())?.movement).not.toBe('straight to camera')
  })
})

describe('choosing which beat is the ending', () => {
  it('does NOT treat "Re-hook" as the CTA — it is a middle beat', () => {
    // A naive /hook|cta/ match moves the middle of the video to the end.
    const bp = blueprint({
      script: [
        { section: 'Hook', line: 'Most home studios fail for one boring reason', direction: '' },
        { section: 'Re-hook', line: 'And here is the part nobody tells you.', direction: '' },
      ],
    })
    const scenes = build(bp).scenes
    const rehook = scenes.find((s) => s.dialogue === 'And here is the part nobody tells you.')
    expect(rehook?.scene_type).not.toBe('cta')
    // With no CTA beat at all, the ending falls back rather than stealing one.
    expect(ctaScene(bp)?.dialogue).toBe('Follow for more')
  })

  it('matches the section label in the other shapes the model writes it', () => {
    for (const section of ['CTA', 'cta', 'Call to Action', 'call-to-action', 'Outro', 'Closing', 'Sign-off']) {
      const bp = blueprint({
        script: [
          { section: 'Hook', line: 'Most home studios fail for one boring reason', direction: '' },
          { section, line: REAL_CTA, direction: '' },
        ],
      })
      expect(ctaScene(bp)?.dialogue).toBe(REAL_CTA)
    }
  })

  it('takes the LAST CTA beat when the model labels more than one', () => {
    const bp = blueprint({
      script: [
        { section: 'Hook', line: 'Most home studios fail for one boring reason', direction: '' },
        { section: 'CTA', line: 'Save this for later', direction: '' },
        { section: 'CTA', line: REAL_CTA, direction: '' },
      ],
    })
    expect(ctaScene(bp)?.dialogue).toBe(REAL_CTA)
    // The earlier one stays in the body rather than vanishing — it is real
    // scripted speech, and silently dropping a line the creator was shown is
    // the same class of failure as silently replacing one.
    expect(build(bp).scenes.some((s) => s.dialogue === 'Save this for later')).toBe(true)
  })

  it('falls back when the CTA beat is an empty or placeholder line', () => {
    const bp = blueprint({
      script: [
        { section: 'Hook', line: 'Most home studios fail for one boring reason', direction: '' },
        { section: 'CTA', line: '   ', direction: '' },
      ],
    })
    expect(ctaScene(bp)?.dialogue).toBe('Follow for more')
  })

  it('survives a blueprint with no script at all', () => {
    const bp = blueprint({ script: [] })
    expect(() => build(bp)).not.toThrow()
    expect(ctaScene(bp)?.dialogue).toBe('Follow for more')
  })
})
