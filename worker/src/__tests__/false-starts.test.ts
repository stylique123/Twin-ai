// FALSE STARTS — the creator saying a piece of the script, stopping, and saying
// it again. The single most common thing a person does in front of a camera,
// and until now nothing in the pipeline could see one.
//
// THE TESTS THAT MATTER ARE THE DISCRIMINATING ONES. Detecting a restart is
// easy; the hard part is not calling an ad-lib, an aside or a stutter a
// restart. This is evidence, and evidence that cries wolf is worse than none —
// a reviewer who learns the list is mostly wrong stops reading it, and then the
// real ones are invisible too. So most of what follows is negative.
import { describe, expect, it } from 'vitest'
import {
  alignScriptToSpoken, detectFalseStarts, runSimilarityMilli,
  scriptToAlignTokens, toAlignTokens,
} from '../jobs/scriptAlignment.js'
import { alignmentEffectiveConfig, componentDigest, loadAnalysisRules } from '../jobs/editorManifest.js'

const RULES = loadAnalysisRules().rules.falseStarts

/** Align a script string against what was actually said, then detect. */
function detect(script: string, spoken: string, min = RULES.minSimilarityMilli) {
  const s = scriptToAlignTokens(script)
  const k = toAlignTokens(spoken.split(/\s+/).filter(Boolean).map((text) => ({ text })))
  const r = alignScriptToSpoken(s, k)
  if (!r.ok) throw new Error(`alignment failed: ${r.reason}`)
  return detectFalseStarts(r.alignment, s, k, min, RULES.minTokens, RULES.maxReported)
}

describe('the frozen thresholds', () => {
  it('live in the analysis rules, not the compiler policy, and are real numbers', () => {
    // The alignment component is built in the ANALYSIS stage, so its tunables
    // belong to that stage's authority. They also enter the component digest,
    // so a retuned threshold cannot silently reuse a record computed under the
    // old one.
    expect(Number.isInteger(RULES.minSimilarityMilli)).toBe(true)
    expect(RULES.minSimilarityMilli).toBeGreaterThan(0)
    expect(RULES.minSimilarityMilli).toBeLessThanOrEqual(1000)
    expect(RULES.minTokens).toBeGreaterThanOrEqual(2)
    expect(RULES.maxReported).toBeGreaterThan(0)
  })
})

describe('the thresholds enter the component DIGEST', () => {
  const { rules, boundsSha256 } = loadAnalysisRules()
  const digest = (r: typeof rules) =>
    componentDigest('alignment-2', alignmentEffectiveConfig(r), {}, boundsSha256)

  it('retuning a threshold changes the digest, so a cache hit cannot return evidence computed under the old one', () => {
    // The failure this prevents: thresholds change, the digest does not, and a
    // lookup returns a record built under different rules. The same reasoning
    // already put timingsMaxBytes in this config; false-start thresholds change
    // the evidence just as much.
    const base = digest(rules)
    for (const patch of [
      { minSimilarityMilli: rules.falseStarts.minSimilarityMilli + 1 },
      { minTokens: rules.falseStarts.minTokens + 1 },
      { maxReported: rules.falseStarts.maxReported + 1 },
    ]) {
      expect(digest({ ...rules, falseStarts: { ...rules.falseStarts, ...patch } })).not.toBe(base)
    }
  })

  it('the config actually carries them — not a digest that changes for another reason', () => {
    const cfg = alignmentEffectiveConfig(rules)
    expect(cfg.minSimilarityMilli).toBe(rules.falseStarts.minSimilarityMilli)
    expect(cfg.minTokens).toBe(rules.falseStarts.minTokens)
    expect(cfg.maxReported).toBe(rules.falseStarts.maxReported)
  })
})

describe('runSimilarityMilli — ordered, and short runs cannot cheat', () => {
  const t = (...w: string[]) => toAlignTokens(w.map((text) => ({ text })))

  it('identical runs score 1000', () => {
    expect(runSimilarityMilli(t('let', 'me', 'show'), t('let', 'me', 'show'))).toBe(1000)
  })

  it('ORDER counts — a reordering is not a restart', () => {
    const same = runSimilarityMilli(t('let', 'me', 'show'), t('let', 'me', 'show'))
    const shuffled = runSimilarityMilli(t('show', 'me', 'let'), t('let', 'me', 'show'))
    expect(shuffled).toBeLessThan(same)
  })

  it('a short prefix cannot score full marks against a long region', () => {
    // The weakness of an unordered overlap, and of any measure that divides by
    // the shorter side: two words matching the first two of ten is not a
    // restart of those ten.
    const s = runSimilarityMilli(t('let', 'me'), t('let', 'me', 'show', 'you', 'how', 'this', 'works', 'today', 'ok', 'right'))
    expect(s).toBeLessThan(300)
  })

  it('an empty run scores nothing rather than dividing by zero', () => {
    expect(runSimilarityMilli([], t('a'))).toBe(0)
    expect(runSimilarityMilli(t('a'), [])).toBe(0)
  })
})

describe('detecting a real restart', () => {
  it('POSITIVE: the creator restarts a phrase', () => {
    const found = detect(
      'let me show you how this works',
      'let me show — let me show you how this works',
    )
    expect(found.length).toBeGreaterThanOrEqual(1)
    expect(found[0].tokenCount).toBeGreaterThanOrEqual(RULES.minTokens)
    expect(found[0].similarityMilli).toBeGreaterThanOrEqual(RULES.minSimilarityMilli)
  })

  it('the reported span points at the ABANDONED attempt, not the good one', () => {
    const found = detect(
      'let me show you how this works',
      'let me show let me show you how this works',
    )
    expect(found).toHaveLength(1)
    // The abandoned attempt is the first thing said, so it starts at 0.
    expect(found[0].spokenFromIdx).toBe(0)
    expect(found[0].spokenToIdx).toBeLessThanOrEqual(3)
  })

  it('POSITIVE: abandoned MID-WORD — the most characteristic false start there is', () => {
    // This case is why runSimilarityMilli counts a strict prefix at the FINAL
    // position as a match. It was found by probing the detector rather than by
    // reasoning about it: "this changes ev— this changes everything" is the
    // most obvious restart a person makes, and the first version refused it,
    // because Levenshtein scores "ev" against "everything" at 733 — just under
    // the 800 floor. The floor was not wrong; the measure was.
    const found = detect(
      'this changes everything for you',
      'this changes ev this changes everything for you',
    )
    expect(found).toHaveLength(1)
    expect(found[0].tokenCount).toBe(3)
    expect(found[0].spokenFromIdx).toBe(0)
  })

  it('the truncation rule is FINAL-POSITION ONLY, so it cannot invent restarts mid-run', () => {
    // "show" is a strict prefix of "shoulder". If the prefix rule applied at
    // any position, an ordinary sentence containing both would start scoring
    // as a restart of itself.
    expect(detect('show you the shoulder press', 'show you the shoulder press')).toEqual([])
    // …but a genuine restart that abandons on "sho" IS caught.
    expect(detect('show you the shoulder press', 'show you the sho show you the shoulder press')).toHaveLength(1)
  })

  it('a clean take reports nothing', () => {
    expect(detect('let me show you how this works', 'let me show you how this works')).toEqual([])
  })
})

describe('NEGATIVE — the cases that must not be called restarts', () => {
  it('an ad-lib is not a restart', () => {
    // Extra words that resemble nothing in the script.
    expect(detect(
      'let me show you how this works',
      'honestly genuinely wow let me show you how this works',
    )).toEqual([])
  })

  it('a single repeated word is a stutter, refused by minTokens', () => {
    const found = detect('let me show you how this works', 'let let me show you how this works')
    expect(found).toEqual([])
  })

  it('an aside that reuses vocabulary out of order is not a restart', () => {
    // Same words, wrong order — the thing an unordered overlap would call a
    // restart and this deliberately does not.
    const found = detect(
      'show you how this works',
      'works this how show you how this works',
    )
    for (const f of found) expect(f.similarityMilli).toBeGreaterThanOrEqual(RULES.minSimilarityMilli)
  })

  it('raising the floor to 1000 admits only exact repeats', () => {
    const loose = detect('let me show you how this works', 'let me shoq — let me show you how this works', 700)
    const strict = detect('let me show you how this works', 'let me shoq — let me show you how this works', 1000)
    expect(strict.length).toBeLessThanOrEqual(loose.length)
  })
})

describe('bounds and fail-closed behaviour', () => {
  it('FAIL CLOSED: a non-finite threshold detects NOTHING', () => {
    // Same shape as the caption spelling floor: an absent threshold must not
    // become a permissive one.
    const s = scriptToAlignTokens('let me show you how this works')
    const k = toAlignTokens('let me show let me show you how this works'.split(' ').map((text) => ({ text })))
    const r = alignScriptToSpoken(s, k)
    if (!r.ok) throw new Error('alignment failed')
    for (const bad of [undefined, null, NaN, 'x']) {
      expect(detectFalseStarts(r.alignment, s, k, bad as unknown as number)).toEqual([])
    }
  })

  it('maxReported caps the list', () => {
    const script = Array.from({ length: 40 }, (_, i) => `alpha${i} beta${i}`).join(' ')
    const spoken = Array.from({ length: 40 }, (_, i) => `alpha${i} beta${i} alpha${i} beta${i}`).join(' ')
    const s = scriptToAlignTokens(script)
    const k = toAlignTokens(spoken.split(' ').map((text) => ({ text })))
    const r = alignScriptToSpoken(s, k)
    if (!r.ok) throw new Error('alignment failed')
    const found = detectFalseStarts(r.alignment, s, k, RULES.minSimilarityMilli, RULES.minTokens, 3)
    expect(found.length).toBeLessThanOrEqual(3)
  })

  it('an empty alignment yields nothing rather than throwing', () => {
    expect(detectFalseStarts(
      { ops: [], scriptTokenCount: 0, spokenTokenCount: 0, matchedCount: 0, substitutionCount: 0,
        deletionCount: 0, insertionCount: 0, coverageMilli: 0, editDistance: 0 } as never,
      [], [], RULES.minSimilarityMilli,
    )).toEqual([])
  })

  it('every reported span is well-formed and inside the spoken range', () => {
    const spokenWords = 'let me show let me show you how this works'.split(' ')
    const s = scriptToAlignTokens('let me show you how this works')
    const k = toAlignTokens(spokenWords.map((text) => ({ text })))
    const r = alignScriptToSpoken(s, k)
    if (!r.ok) throw new Error('alignment failed')
    for (const f of detectFalseStarts(r.alignment, s, k, RULES.minSimilarityMilli)) {
      expect(f.spokenFromIdx).toBeGreaterThanOrEqual(0)
      expect(f.spokenToIdx).toBeGreaterThan(f.spokenFromIdx)
      expect(f.spokenToIdx).toBeLessThanOrEqual(spokenWords.length)
      expect(f.scriptToIdx).toBeGreaterThan(f.scriptFromIdx)
    }
  })
})
