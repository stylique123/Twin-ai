// THE COUNTER READ THE SAME NUMBER BEFORE AND AFTER A WHOLE SESSION.
//
// ⚠️⚠️ MEASURED BY THE OWNER ACROSS THREE GENERATIONS: "2 real stories and 1
// number" before, and the same after three onboarding answers, four idea-mode
// paragraphs and several product-mode answers. `creator_knowledge` has three
// writers — the scan, the asked-questions card, the beat-ask — and none of them
// is the box a creator types an idea into.
//
// ⚠️⚠️ AND IT COMPOUNDED INTO A WRONG FACT ON CAMERA. With the pool frozen at
// two stories, a Daisy Candle script needing a second one reused the
// peony-wedding order. A thin pool is what forces a bad match.
import { describe, expect, it } from 'vitest'
import { typedMaterialToKnowledge, TYPED_MIN } from '../typedMaterial'

const REF = 'typed:idea:gen-1'
const ok = (t: string) => typedMaterialToKnowledge(t, REF)

// The owner's own sentence, from the run that exposed this.
const REAL = 'A bride ordered 50 peony candles for her wedding and I hand-packed '
  + 'them over three nights until 3am.'

describe('what a creator lived is kept', () => {
  it('stores a real first-person story', () => {
    const r = ok(REAL)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.row.text).toBe(REAL)
    expect(r.row.basis).toBe('stated')
  })

  it('stores it as `experience`, which is the kind the counter reads', () => {
    // `twinStrength` counts `experience` and `example` as the kind that "makes a
    // script non-generic". Any other kind grows the pool without moving the
    // number the creator is watching — which is the complaint.
    const r = ok(REAL)
    expect(r.ok && r.row.kind).toBe('experience')
  })

  it('ranks under a direct answer to a question, and says so', () => {
    // `answerToKnowledge` uses 0.9: a question names what it wants. This box
    // takes whatever was on their mind.
    const r = ok(REAL)
    expect(r.ok && r.row.confidence).toBeLessThan(0.9)
  })

  it('carries the generation AND the field, so a retry cannot double-count', () => {
    const r = typedMaterialToKnowledge(REAL, 'typed:idea:gen-9')
    expect(r.ok && r.row.source_ref).toBe('typed:idea:gen-9')
  })
})

describe('what is NOT knowledge is refused, and refusing is the default', () => {
  it('an instruction about one video is not a fact about the creator', () => {
    // ⚠️ THE SAME BOX TAKES BOTH. Storing this would put a direction in the pool
    // that a later script could read back as something the creator said.
    for (const t of [
      'Make the hook punchier and cut the second beat, it drags a little bit here',
      'write a video about my candles that feels warmer than the last one did',
      'Can you focus more on the scent and less on the packaging this time?',
      'I want it to sound less salesy than the previous script you wrote me',
    ]) {
      expect(ok(t).ok, t).toBe(false)
    }
  })

  it('a question is a request, not a statement', () => {
    expect(ok('Would a longer video work better for this candle in the evening?').ok).toBe(false)
  })

  it('a market opinion anyone could hold is not THEIRS', () => {
    // ⚠️ "Candles sell well in winter" is not this creator's life. Mistaking one
    // for the other is how a pool fills with sentences nobody lived.
    const r = ok('Candles tend to sell much better in winter than in the summer months')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBe('no_first_person')
  })

  it('a fragment too short to be substance is refused', () => {
    expect(ok('I made candles').ok).toBe(false)
    expect('x'.repeat(TYPED_MIN - 1).length).toBeLessThan(TYPED_MIN)
  })

  it('blank and absent are refused without throwing', () => {
    for (const v of [null, undefined, '', '    ']) {
      expect(typedMaterialToKnowledge(v, REF).ok).toBe(false)
    }
  })

  it('names WHY it refused, so a silent drop is never the answer', () => {
    const r = ok('Make it shorter please and add a bit more about the wax blend')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBe('instruction')
  })
})

describe('the refusal cannot quietly become the common case', () => {
  it('a plainly personal paragraph is not caught by the instruction rule', () => {
    // ⚠️ THE GUARD FOR MY OWN GUARD. `INSTRUCTION` anchors at the START of the
    // text; a story that happens to contain "make" mid-sentence must survive.
    const r = ok('I had to remake half the batch after the wax cooled and cracked '
      + 'every single one of the tins I had just poured.')
    expect(r.ok).toBe(true)
  })

  it('and neither is one that mentions a question mid-sentence', () => {
    const r = ok('Someone asked me why my candles cost more, so I showed them the '
      + 'wax I use and they stopped asking.')
    expect(r.ok).toBe(true)
  })
})
