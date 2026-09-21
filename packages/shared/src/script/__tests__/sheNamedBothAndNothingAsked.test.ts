import { describe, it, expect } from 'vitest'
import { namedAlternatives } from '../namedAlternatives'

/**
 * ⚠️⚠️ MEASURED ON 25 REAL IDEA PARAGRAPHS FROM PRODUCTION, 2026-09-21:
 * eleven carry an uncertainty marker; TWO also name both candidate subjects.
 * In those two the build picks one silently, on a decision the creator
 * explicitly flagged as undecided.
 *
 * ⚖️ THE NINE THAT SAY "idk" WITHOUT NAMING ALTERNATIVES MUST RETURN NULL.
 * Asking there would mean offering options nobody proposed — a menu we
 * invented, presented as if it came from her.
 *
 * Every fixture below is a verbatim production paragraph unless marked.
 */

// Real, generation 2026-09-20.
const WEDDING = "ok so the wedding order thing keeps coming back to me, staying up till 3am "
  + 'three nights packing 50 candles by hand, and then she sent me photos from the actual '
  + "wedding and I just cried at my desk, idk if that's a story about the work or about why "
  + 'handmade even matters'

describe('the two she named, in her own words', () => {
  it('reads both subjects out of the real wedding paragraph', () => {
    const got = namedAlternatives(WEDDING)
    expect(got).not.toBeNull()
    expect(got!.options[0]).toBe('the work')
    expect(got!.options[1]).toBe('why handmade even matters')
  })

  // ⚖️ HER SENTENCE, NEVER A SUMMARY — the rule the product picker already
  // states for its own labels.
  it('never paraphrases: every option is a substring of what she wrote', () => {
    const got = namedAlternatives(WEDDING)!
    for (const o of got.options) expect(WEDDING.toLowerCase()).toContain(o.toLowerCase())
  })

  it('handles "is it X or Y"', () => {
    const got = namedAlternatives("not sure, is it the Thursday deadline or the fresh buying")
    expect(got?.options).toEqual(['the Thursday deadline', 'the fresh buying'])
  })
})

describe('the paragraphs it must refuse', () => {
  // Real, 2026-09-20 — unsure, but names nothing to choose between.
  it('returns null when she says idk and names no alternatives', () => {
    expect(namedAlternatives('ok so the 1200 dollar machine is still in the corner and I think '
      + 'about it every day, it made me faster and made the work look worse and sales dropped, '
      + 'idk maybe that\'s the whole video')).toBeNull()
  })

  // Real, 2026-09-20 — a list inside ONE idea, and no uncertainty marker.
  it('returns null on a list of three inside a single story', () => {
    expect(namedAlternatives('ok so the thing about the three clients I turned down last month, '
      + 'one wanted keto one wanted me to feed six people for the same money one just wanted cheap'))
      .toBeNull()
  })

  // Real, 2026-09-20 — confident, single idea.
  it('returns null on a confident paragraph', () => {
    expect(namedAlternatives('everyone thinks handmade means slower and more expensive and '
      + "that's the pitch. it isn't. the real thing is it can be repaired")).toBeNull()
  })

  it('returns null on an "or" that is nowhere near the doubt', () => {
    expect(namedAlternatives("idk. " + "x ".repeat(120) + "the tins or the wax")).toBeNull()
  })

  it('returns null when both names are the same thing', () => {
    expect(namedAlternatives("not sure if it's about the wedding order or about the wedding order"))
      .toBeNull()
  })

  it('returns null on a fragment too short to be a subject', () => {
    expect(namedAlternatives("idk if it's about it or them")).toBeNull()
  })

  it('handles absent and non-string input without throwing', () => {
    expect(namedAlternatives(null)).toBeNull()
    expect(namedAlternatives(undefined)).toBeNull()
    expect(namedAlternatives(42)).toBeNull()
    expect(namedAlternatives('')).toBeNull()
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BUILDING = readFileSync(
  join(__dirname, '..', '..', '..', '..', '..', 'apps', 'web', 'src', 'pages', 'v2', 'V2Building.tsx'),
  'utf8',
)

/**
 * ⚠️ A DETECTOR WITH NO CALLER IS THE DEFECT THIS REPO KEEPS REMOVING. These
 * pin the whole path: the question is offered, her answer reaches the request,
 * and her paragraph survives it.
 */
describe('the question is asked, and the answer reaches the writer', () => {
  it('offers the question only when she named both', () => {
    expect(BUILDING).toMatch(/const torn = namedAlternatives\(state\.reference_note\)/)
    expect(BUILDING).toMatch(/torn && !\(answersRef\.current\[IDEA_FOCUS_FIELD\]/)
  })

  // ⚖️ HER WORDS AS THE LABELS. A paraphrase would be a second name for one
  // thing — the rule the product picker already states for its own options.
  it('labels the options with her own words, not a summary', () => {
    expect(BUILDING).toMatch(/value: torn\.options\[0\], label: torn\.options\[0\]/)
    expect(BUILDING).toMatch(/value: torn\.options\[1\], label: torn\.options\[1\]/)
  })

  // ⚖️ A PARAGRAPH HOLDING TWO VIDEOS CAN LEGITIMATELY BE ONE VIDEO ABOUT BOTH.
  it('always offers keeping both', () => {
    expect(BUILDING).toMatch(/IDEA_FOCUS_ALL, label: 'All of it'/)
  })

  it('reaches the request, and the paragraph survives whole', () => {
    expect(BUILDING).toMatch(/reference_note: ideaFocusLine \+ \(state\.reference_note \|\| ''\)/)
    expect(BUILDING).toMatch(/This video is about: \$\{chosenFocus\}/)
  })

  // ⚠️ "ALL OF IT" MUST ADD NO DIRECTIVE. A line saying she chose both would
  // read to the writer as a constraint she did not impose.
  it('adds nothing when she kept both, or was never asked', () => {
    expect(BUILDING).toMatch(/chosenFocus === '' \|\| chosenFocus === IDEA_FOCUS_ALL\s*\n?\s*\?\s*''/)
  })

  // ⚖️ PER-VIDEO, NEVER A PROFILE FACT — the distinction the file already draws
  // between intent answers and readiness answers.
  it('is not persisted as a creator-stable fact', () => {
    expect(BUILDING).not.toMatch(/readiness_answers\[IDEA_FOCUS_FIELD\]/)
  })
})
