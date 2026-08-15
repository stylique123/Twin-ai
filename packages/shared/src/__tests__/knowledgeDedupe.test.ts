// THE SAME BELIEF, RE-WORDED BY THE EXTRACTOR, STORED TWICE (ledger G9).
//
// Every pair in this file is REAL — taken from two runs of the production
// extractor over identical input, or from the 1,033-item corpus the threshold
// was measured against. The "must not merge" cases are the ones that decide
// whether this is a fix or a data-loss bug, so they outnumber the others.
import { describe, expect, it } from 'vitest'
import { canonicaliseRepeats, distinctiveMarks, nearDuplicate, overlap, DEDUPE_THRESHOLD, nearDuplicateAny, knownWordings } from '../knowledgeDedupe'
import { SUBSTANCE_KINDS } from '../knowledgeSelection'

const row = (kind: string, text: string) => ({ kind, text })

describe('the drift that was measured', () => {
  it.each([
    ['opinion',
      'Faster charging is not better for phone battery longevity.',
      'faster charging is not better for phone battery health'],
    ['experience',
      'Tested phones with 200 megapixel sensors that produced worse photos than a three-year-old iPhone.',
      'tested phones with 200 megapixel sensors that produced worse photos than a three-year-old iPhone due to processing differences'],
    ['opinion',
      "Megapixels are the least useful number on a phone's spec sheet.",
      "megapixels are the least useful number on a phone's spec sheet because image processing matters more than the sensor"],
    ['product',
      'recommends the M4 iPad Pro only in the 512GB model due to extra RAM',
      'recommends the M4 iPad Pro only in the 512GB model, where the extra RAM is available'],
  ])('%s: recognises the re-wording', (kind, a, b) => {
    // `product` is deliberately NOT a substance kind, so the last case documents
    // that this rule leaves it alone even when the drift is obvious.
    expect(nearDuplicate(row(kind, a), row(kind, b))).toBe(SUBSTANCE_KINDS.has(kind))
  })
})

describe('WHAT MUST NEVER MERGE', () => {
  it.each([
    ['top 10 dropshipping products for July 2026', 'top 10 dropshipping products for May 2026'],
    ['top 10 dropshipping products to sell right now', 'top 7 dropshipping products to sell now'],
    ['made $50,000 in four months', 'made $70,000 in four months'],
  ])('%j and %j differ by the only thing that matters', (a, b) => {
    // ⚠️ THESE SCORE ABOVE THE THRESHOLD ON WORD OVERLAP. The guard is the whole
    // reason 0.6 is usable; without it this rule deletes videos and rewrites
    // figures.
    expect(overlap(a, b)).toBeGreaterThanOrEqual(DEDUPE_THRESHOLD)
    expect(nearDuplicate(row('claim', a), row('claim', b))).toBe(false)
  })

  it('never merges across kinds, however similar the words', () => {
    // ⚖️ AN OPINION AND THE EXPERIENCE THAT GROUNDS IT ARE DIFFERENT EVIDENCE.
    // That distinction is the evidence ladder; collapsing it promotes a belief
    // to something demonstrated.
    const t = 'slow overnight charging preserves more battery capacity'
    expect(nearDuplicate(row('opinion', t), row('experience', t))).toBe(false)
  })

  it('leaves thin kinds alone — they were the false merges', () => {
    // Measured: at this threshold every within-scan pair that would have merged
    // was a topic or covered row, and most were different videos.
    for (const kind of ['topic', 'covered']) {
      expect(nearDuplicate(
        row(kind, 'starting AI dropshipping with Claude'),
        row(kind, 'starting AI dropshipping from scratch'))).toBe(false)
    }
  })

  it('does not merge two experiences that reached OPPOSITE findings', () => {
    // ⚠️ REAL, AND THE MOST EXPENSIVE POSSIBLE FALSE MERGE. 0.54 overlap, same
    // kind, and the two results contradict each other — one model choked, the
    // other did not. Collapsing them deletes the comparison that IS the content.
    const a = 'tested Final Cut on the 256GB M4 iPad Pro and it choked on a multicam timeline'
    const b = 'the 512GB M4 iPad Pro handled a multicam Final Cut timeline fine'
    expect(overlap(a, b)).toBeGreaterThan(0.5)
    expect(nearDuplicate(row('experience', a), row('experience', b))).toBe(false)
  })

  it('THE THRESHOLD IS A MEASUREMENT — changing it requires re-running it', () => {
    // ⚖️ 0.6 IS NOT A TASTE. It is the conservative end of a range measured on
    // 1,033 items from 17 creators: at 0.6 this rule merges nothing within a
    // scan, and catches 10 of 14 items on a re-scan of identical input. Lowering
    // it here without re-measuring is how a dedupe becomes data loss, and no
    // corpus-free test can catch that — so the number is pinned instead.
    expect(DEDUPE_THRESHOLD).toBe(0.6)
  })

  it('does not merge two genuinely different beliefs of the same kind', () => {
    expect(nearDuplicate(
      row('opinion', 'thumbnails matter more than titles'),
      row('opinion', 'faster charging is not better for battery health'))).toBe(false)
  })

  it('treats an empty or absent text as matching nothing', () => {
    expect(nearDuplicate(row('opinion', ''), row('opinion', ''))).toBe(false)
    expect(nearDuplicate({ kind: 'opinion' }, row('opinion', 'anything'))).toBe(false)
  })
})

describe('distinctiveMarks', () => {
  it('is equal for the same figures written differently', () => {
    expect(distinctiveMarks('sold 200 units.')).toBe(distinctiveMarks('200 units were sold'))
  })
  it('separates a month from another month', () => {
    expect(distinctiveMarks('July 2026')).not.toBe(distinctiveMarks('May 2026'))
  })
  it('separates a numbered thing from an unnumbered one', () => {
    // "Google Pixel 1" vs "Google Pixel" — 0.67 overlap, different phones.
    expect(distinctiveMarks('Google Pixel 1')).not.toBe(distinctiveMarks('Google Pixel'))
  })
})

describe('canonicaliseRepeats', () => {
  const stored = [row('opinion', 'Faster charging is not better for phone battery longevity.')]

  it('re-points a re-wording at the stored phrasing so the exact merge sees it', () => {
    const { rows, merged } = canonicaliseRepeats(
      [{ ...row('opinion', 'faster charging is not better for phone battery health'), times_seen: 1 }],
      stored)
    expect(merged).toBe(1)
    expect(rows[0].text).toBe(stored[0].text)
    // ⚠️ THE REST OF THE ROW SURVIVES. Only the text is re-pointed; dropping the
    // row would lose the sighting, and `times_seen` is the durability signal the
    // selector ranks on.
    expect(rows[0].times_seen).toBe(1)
  })

  it('passes genuinely new material through untouched', () => {
    const fresh = [row('fact', 'the hinge is the first component to fail on foldable phones')]
    const { rows, merged } = canonicaliseRepeats(fresh, stored)
    expect(merged).toBe(0)
    expect(rows[0]).toBe(fresh[0])
  })

  it('reports nothing merged when there is nothing stored yet', () => {
    const first = [row('opinion', 'anything at all')]
    expect(canonicaliseRepeats(first, []).merged).toBe(0)
  })

  it('does not count a row that already matches exactly', () => {
    // 0123 already merges those; counting them here would inflate the number the
    // decision to keep this rule gets judged on.
    expect(canonicaliseRepeats([stored[0]], stored).merged).toBe(0)
  })
})

describe('G9: one belief, several wordings', () => {
  // Measured pair, not invented: overlap 0.71, which clears DEDUPE_THRESHOLD.
  const A = 'Faster charging is not better for phone battery longevity'
  const B = 'Faster charging is not better for phone battery health'

  it('keeps the canonical wording as the key and returns the new one', () => {
    // ⚠️ THE LOSS THIS COLUMN EXISTS FOR. `canonicaliseRepeats` rewrites the
    // incoming text to the stored one — correctly, since the stored text is what
    // `times_seen` and the unique index hang off — and its own comment admits the
    // newer, often richer wording was simply discarded. Now it is returned.
    const r = canonicaliseRepeats([{ kind: 'opinion', text: B }],
      [{ kind: 'opinion', text: A, surfaceForms: [] }])
    expect(r.merged).toBe(1)
    expect(r.rows[0].text).toBe(A)
    expect(r.newForms).toEqual([{ kind: 'opinion', canonicalText: A, form: B }])
  })

  it('does not re-record a wording it already knows', () => {
    // ⚖️ Otherwise the column grows on every scan without improving matching.
    const r = canonicaliseRepeats([{ kind: 'opinion', text: B }],
      [{ kind: 'opinion', text: A, surfaceForms: [B] }])
    expect(r.merged).toBe(1)
    expect(r.newForms).toEqual([])
  })

  it('matches against a stored form, not only the canonical text', () => {
    const stored = { kind: 'opinion', text: 'Something else entirely about screens', surfaceForms: [A] }
    expect(nearDuplicateAny(stored, { kind: 'opinion', text: B })).toBe(true)
  })

  it('treats an absent surface_forms as none, not as broken', () => {
    // A store predating 0133 has no column and must match on canonical text
    // exactly as it did before.
    expect(knownWordings({ kind: 'opinion', text: A })).toEqual([A])
    expect(knownWordings({ kind: 'opinion', text: A, surfaceForms: null })).toEqual([A])
  })

  it('never lets a stored form make an unrelated fact match', () => {
    // ⚠️ THE RISK THE MEMORY CREATES. More wordings means more chances to match,
    // so the guard has to hold: a different belief stays a different row.
    const stored = { kind: 'opinion', text: A, surfaceForms: [B] }
    expect(nearDuplicateAny(stored, { kind: 'opinion', text: 'Screen size matters more than anything else' })).toBe(false)
  })

  it('RECORDS THE NEGATIVE RESULT: compounding drift did not reproduce', () => {
    // ⚠️ THE ARGUMENT THIS FEATURE WAS FIRST WRITTEN ON. "A drifts to B drifts to
    // C, and C no longer matches A" could not be produced at threshold 0.6 across
    // several realistic chains — the pairs that clear 0.6 stay close enough that
    // the third phrasing still matches the first. Asserted here so the claim
    // cannot quietly return to the comments as though it had been shown.
    const C = 'Fast charging is not better for battery health over time'
    expect(nearDuplicate({ kind: 'opinion', text: A }, { kind: 'opinion', text: B })).toBe(true)
    expect(nearDuplicate({ kind: 'opinion', text: B }, { kind: 'opinion', text: C })).toBe(false)
  })
})
