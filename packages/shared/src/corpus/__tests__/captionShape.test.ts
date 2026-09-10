// THE CLASSIFIER IS MEASURED ON REAL CAPTIONS, AND ITS MISTAKES ARE KEPT.
//
// ⚠️ EVERY FIXTURE BELOW IS A REAL ROW from gallery_items, not an invented
// example. Patterns written from imagination fit the answer you expected —
// which is the mistake shapeForGoal's first draft made with a ratio threshold
// chosen by eye, and it took real data to catch it.
//
// ⚖️ THE FOUR MEASURED FALSE POSITIVES ARE REGRESSION TESTS, not anecdotes.
// Each one was produced by a real pattern over 4,000 real rows, read by eye,
// and fixed. Keeping them is what stops the fix being undone by the next person
// who widens a pattern to catch one more case.
import { describe, it, expect } from 'vitest'
import {
  classifyCaption, captionBody, isLikelyEnglish, assessedCaptionShape, CAPTION_SHAPES,
} from '../captionShape'

describe('hashtags come out before anything is matched', () => {
  // ⚠️ THE SINGLE MOST IMPORTANT STEP. Captions are frequently 80% tags, and a
  // tag is a lowercase run of words with no spaces — the exact shape that fires
  // every pattern in the file.
  it('a caption that is nothing but tags has no body and no shape', () => {
    expect(captionBody('#fy #fyp #mindset #creator #hustle ')).toBe('')
    expect(classifyCaption('#fy #fyp #mindset #creator #hustle ')).toBeNull()
  })

  it('strips mentions and urls too, keeping the real sentence', () => {
    expect(captionBody('How to fix it @someone https://x.co/a #tips'))
      .toBe('How to fix it')
  })

  // ⚖️ AND A TAG MUST NOT MANUFACTURE A SHAPE. "#howto" would otherwise make
  // every tagged card a how-to.
  it('a how-to TAG does not make the caption a how-to', () => {
    expect(classifyCaption('Beauty of lady #howto #top10tips #foryou')).toBeNull()
  })
})

describe('non-English returns nothing rather than a guess', () => {
  // ⚠️ THE CORPUS IS GENUINELY MULTILINGUAL. A 45-row sample held Italian,
  // German, Russian, Romanian and Urdu. Every pattern here is English.
  it.each([
    'Эта крутая бизнес идея взорвала продажи',
    'Dove si nascondono i grandi capitali del futuro',
    'Das wird dir jeder gesunde Mensch bestätigen',
  ])('returns null for %s', (t) => {
    expect(classifyCaption(t)).toBeNull()
  })

  it('and English still passes the gate', () => {
    expect(isLikelyEnglish('How To Build Muscle Explained In 5 Levels')).toBe(true)
  })
})

describe('the shapes it can actually read', () => {
  const cases: ReadonlyArray<[string, string]> = [
    ['10 Powerful Business Lessons From Chanakya Neeti', 'number_promise'],
    ['15 Amazing Phone Functions You Had No Idea Existed', 'number_promise'],
    ['What would happen if you didn’t drink water?', 'direct_question'],
    ['OVERRATED: The Worst Fitness Advice Ever', 'contrarian_claim'],
    ['How To Build Muscle (Explained In 5 Levels)', 'how_to'],
    ['Stop jumping from data analysis to cybersecurity to web dev', 'negative_command'],
    ['Send this to your friends if you found this helpful', 'direct_address'],
  ]
  it.each(cases)('%s → %s', (text, shape) => {
    expect(classifyCaption(text)?.shape).toBe(shape)
  })
})

describe('the four false positives measured over 4,000 real rows', () => {
  // ⚠️ MEASURED: labelled `myth_bust` on "IS WRONG". It is an exclamation. A
  // myth-bust must NAME the false belief it corrects.
  it('an exclamation is not a myth-bust', () => {
    const c = classifyCaption('BROO, WHAT IS WRONG WITH HUMANS?! Animal Gurus ROAST Gen Z')
    expect(c?.shape).not.toBe('myth_bust')
  })

  // ⚠️ MEASURED: labelled `myth_bust` on "actually is" when "nobody talks
  // about" is the stronger and more specific signal — and it is contrarian.
  it('"nobody talks about ..." is contrarian, not myth-busting', () => {
    expect(classifyCaption('nobody talks about how exhausting online shopping actually is')?.shape)
      .toBe('contrarian_claim')
  })

  // ⚠️⚠️ MEASURED: labelled `negative_command` because "Stop Using" matched
  // mid-string. It is a list of seven things; the imperative is a clause inside
  // it. A counted list must win over anything inside it.
  it('a counted list outranks an imperative buried in it', () => {
    expect(classifyCaption('7 Beauty Products That Women Should Stop Using Immediately')?.shape)
      .toBe('number_promise')
  })

  // ⚖️ AND THE IMPERATIVE STILL WINS WHEN IT IS ACTUALLY THE SHAPE.
  it('but a real imperative opening is still a negative command', () => {
    expect(classifyCaption('Stop Blaming PR for you not getting an IT job')?.shape)
      .toBe('negative_command')
  })
})

describe('it never stores the words', () => {
  // ⚠️⚠️ THE RULE THE WHOLE CORPUS RESTS ON. If a source's sentences sit in the
  // store, the writer reaches for them — not by design, by gravity.
  it('evidence is a capped fragment, never the caption', () => {
    const long = 'Stop ' + 'doing this thing '.repeat(20)
    const c = classifyCaption(long)
    expect(c).not.toBeNull()
    expect(c!.evidence.length).toBeLessThanOrEqual(48)
    expect(long.startsWith(c!.evidence)).toBe(true)
    expect(c!.evidence).not.toBe(long.trim())
  })
})

describe('it can never claim to have observed the hook', () => {
  // ⚠️⚠️ A CAPTION IS NOT A HOOK. The hook is the spoken opening line; the
  // caption is a different artefact, often written afterwards. Storing this in
  // a field called `hook_shape` would put an inference where every downstream
  // reader expects an observation.
  it('the assessed read is always `inferred`, on every shape', () => {
    for (const text of ['How to fix it', '10 tips for you', 'Is this true?']) {
      const a = assessedCaptionShape(text, '2026-09-09T00:00:00.000Z')
      if (a === null) continue
      expect(a.basis).toBe('inferred')
    }
  })

  it('returns null rather than an indeterminate wrapper when nothing matches', () => {
    expect(assessedCaptionShape('#fyp #viral', '2026-09-09T00:00:00.000Z')).toBeNull()
  })

  it('every shape in the taxonomy is one a caption can actually evidence', () => {
    // confession and stakes_first are deliberately absent — both are claims
    // about how a video OPENS, which a caption cannot witness.
    expect(CAPTION_SHAPES).not.toContain('confession')
    expect(CAPTION_SHAPES).not.toContain('stakes_first')
  })
})
