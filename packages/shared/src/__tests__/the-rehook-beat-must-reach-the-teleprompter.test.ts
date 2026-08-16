// THE VIDEO PROMISED THREE AND THE TELEPROMPTER DELIVERED TWO.
//
// ⚠️ FOUND IN A SCREENSHOT OF A REAL RECORDING, NOT BY A RED TEST. Production
// blueprint a98bf712 has five beats: Opening, Point A, Point B, "Rehook Point
// C", Resolution. The recorder showed four — the third way was gone — while the
// "Shots & extra clips" panel beside it still listed it. The creator would open
// by promising three ways and then name two.
//
// The cause is one character class. `buildRecordingScript` filters out the beat
// scene 1 already displaced with `/hook|opener/i.test(section)`, and "Rehook"
// contains "hook". Because `hookIdx` was already claimed by beat 1, the branch
// returned without recording anything: the beat was not demoted, it was
// deleted.
//
// ⚖️ AND THE WRITER IS TOLD TO WRITE IT. The prompt demands "the mid-video
// re-hook beat so the middle never sags" and the mechanism record carries
// `rehookAfterItem` to place it. A beat the system asks for, plans for, and
// then silently drops on the way to the person reading it out loud is the worst
// shape a defect can take — every layer looks correct in isolation.
import { describe, expect, it } from 'vitest'
import { buildRecordingScript } from '../recordingScriptAdapter'
import type { Blueprint } from '../types'

/** The production shape, reduced to what the adapter reads. */
function blueprint(sections: string[]): Blueprint {
  return {
    hook_options: ['Three ways people lose money without noticing'],
    script: sections.map((section, i) => ({
      section,
      line: i === 0
        ? 'Three ways people lose money without noticing.'
        : `Line for ${section}.`,
    })),
  } as unknown as Blueprint
}

const spoken = (b: Blueprint): string[] =>
  buildRecordingScript({ generationId: 'g', blueprint: b })
    .scenes.filter((s) => s.show_in_teleprompter)
    .map((s) => s.dialogue ?? '')

describe('only the opening beat can be the beat scene 1 already speaks', () => {
  // ⚠️ THE SECOND CASUALTY, FOUND BY COUNTING THE LABELS IN PRODUCTION. A real
  // blueprint labelled its SECOND beat "Hook Qualification" and its line was
  // "If your brand relies on online sales, you need to see this" — words that
  // appear nowhere in the hook. It was deleted for the word in its name.
  it('keeps a mid-script beat whose label merely contains the word', () => {
    const b = {
      hook_options: ['Standard size guides are dead. If you sell clothes online, watch this.'],
      script: [
        { section: 'Hook', line: 'Standard size guides are dead. If you sell clothes online, watch this.' },
        { section: 'Hook Qualification', line: 'If your brand relies on online sales, you need to see this.' },
        { section: 'Proof', line: 'Returns dropped by a third.' },
      ],
    } as unknown as Blueprint
    expect(spoken(b).some((l) => l.includes('If your brand relies on online sales'))).toBe(true)
  })

  it('still removes a REWORDED duplicate of the hook wherever it sits', () => {
    // ⚖️ THE PROPERTY THAT MUST SURVIVE THE NARROWING. The label rule was made
    // opening-only; the content rule was not, because a beat that says the hook
    // again in different words is a duplicate at any position — and that is the
    // case a label test never caught anyway.
    const b = {
      hook_options: ['Three ways people lose money without noticing'],
      script: [
        { section: 'Setup', line: 'Here is the situation.' },
        { section: 'Restatement', line: 'Three ways people lose money without even noticing it.' },
        { section: 'Proof', line: 'Start with the first one.' },
      ],
    } as unknown as Blueprint
    expect(spoken(b).some((l) => l.includes('without even noticing'))).toBe(false)
  })
})

describe('a re-hook beat survives to the teleprompter', () => {
  it('keeps the beat the creator has to say out loud', () => {
    // ⚠️ THE EXACT PRODUCTION LABEL.
    const lines = spoken(blueprint(['Opening', 'Point A', 'Point B', 'Rehook Point C', 'Resolution']))
    expect(lines.some((l) => l.includes('Rehook Point C'))).toBe(true)
  })

  it('keeps it however the label is spelled', () => {
    // ⚖️ A HYPHEN PUTS A WORD BOUNDARY BACK. `\bhook\b` fails on "Rehook" and
    // matches on "Re-hook", so a boundary-only fix would repair one spelling
    // and leave the other — which is why the exclusion is stated positively.
    for (const label of ['Re-hook', 're hook', 'REHOOK', 'Re-Hook Point C']) {
      const lines = spoken(blueprint(['Opening', 'Point A', label, 'Resolution']))
      expect(lines.some((l) => l.includes(label)), label).toBe(true)
    }
  })

  it('still drops the opening beat, which scene 1 already speaks', () => {
    // ⚠️ THE PROPERTY THE FILTER EXISTS FOR. If this stops holding, the
    // creator hears the hook twice — the defect the filter was written against.
    const lines = spoken(blueprint(['Hook', 'Point A', 'Rehook Point C']))
    expect(lines.filter((l) => l.includes('Three ways people lose money')).length).toBe(1)
  })

  it('does not turn the re-hook into the ending', () => {
    // ⚖️ It is a MIDDLE beat. Treating it as the close would move the middle of
    // the video to the end — the reason the CTA test excludes it too.
    const scenes = buildRecordingScript({
      generationId: 'g',
      blueprint: blueprint(['Opening', 'Point A', 'Rehook Point C', 'Resolution']),
    }).scenes
    const rehook = scenes.find((s) => (s.dialogue ?? '').includes('Rehook Point C'))
    expect(rehook?.scene_type).toBe('talking_head')
    expect(scenes[scenes.length - 1].scene_type).toBe('cta')
  })

  it('gives every kept beat its own scene, in script order', () => {
    const lines = spoken(blueprint(['Opening', 'Point A', 'Point B', 'Rehook Point C', 'Resolution']))
    // hook + A + B + re-hook + Resolution + the appended ending.
    //
    // ⚖️ SIX, NOT FIVE — AND THE SIXTH IS THE POINT. "Resolution" is not a
    // CTA-labelled section, so the adapter finds no spoken ending to hold aside
    // and appends its plain "Follow for more" fallback. That is documented
    // behaviour, and it is the second half of what the screenshot showed: an
    // ending the blueprint never wrote. Pinned here so the fallback stays a
    // decision rather than a surprise.
    expect(lines.length).toBe(6)
    expect(lines[1]).toContain('Point A')
    expect(lines[2]).toContain('Point B')
    expect(lines[3]).toContain('Rehook Point C')
    expect(lines[5]).toBe('Follow for more')
  })
})
