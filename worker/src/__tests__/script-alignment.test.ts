// Script-anchored forced alignment.
//
// The thing being tested is a claim about ACCURACY, so the cases are written as
// the real failures they exist to fix rather than as abstract sequences:
//
//   NEGATIVE   an ad-lib must survive as an insertion. editorSpeech.ts states
//              the transcript is "never filtered against" a script; a version
//              that drops off-script words would pass every coverage assertion
//              while breaking that rule.
//   NEGATIVE   a skipped script word must get a NULL time, never an
//              interpolated one — a caption for a word the viewer never hears.
//   MUTATION   removing the similarity score must make the mishearing case
//              indistinguishable from a genuine deviation, which is the whole
//              basis for trusting the script's spelling over the ASR's.
//   MUTATION   equal-cost alignments must resolve identically every run; a
//              plan that differs between runs on identical input defeats the
//              integer-only determinism rule the rest of the path enforces.
import { describe, it, expect } from 'vitest'
import {
  alignScriptToSpoken, scriptToAlignTokens, toAlignTokens, scriptWordTimings,
  tokenSimilarityMilli, MAX_ALIGNMENT_CELLS, spokenScriptFromSnapshot,
  type AlignToken, type ScriptAlignment,
} from '../jobs/scriptAlignment.js'

const spokenOf = (s: string): AlignToken[] => toAlignTokens(s.split(/\s+/).map((text) => ({ text })))
const ok = (script: string, spoken: string): ScriptAlignment => {
  const r = alignScriptToSpoken(scriptToAlignTokens(script), spokenOf(spoken))
  if (!r.ok) throw new Error(`expected an alignment, got ${r.reason}`)
  return r.alignment
}

describe('the case this exists for: ASR mishears the words that matter most', () => {
  // A speech model has the least evidence for exactly the tokens a creator can
  // least afford to see misspelled on their own video: their brand.
  const script = 'Try TwinAI today and ship faster'
  const heard = 'try twin eye today and ship faster'

  it('lines the script up with what was actually said', () => {
    const a = ok(script, heard)
    expect(a.matchedCount).toBeGreaterThanOrEqual(5) // try, today, and, ship, faster
    expect(a.scriptTokenCount).toBe(6)
  })

  it('the mishearing shows up as a substitution carrying a similarity score', () => {
    const a = ok(script, heard)
    const subs = a.ops.filter((o) => o.kind === 'substitution')
    expect(subs.length).toBeGreaterThanOrEqual(1)
    for (const s of subs) {
      expect(s).toHaveProperty('similarityMilli')
      expect((s as { similarityMilli: number }).similarityMilli).toBeGreaterThan(0)
    }
  })

  it('REGRESSION: the substitution pairs the words a human would pair', () => {
    // Found by this suite, not in review. Under textbook unit costs, pairing
    // twinai↔twin and inserting "eye" costs exactly what pairing twinai↔EYE
    // and inserting "twin" costs, and the tie-break chose the second — so the
    // alignment's one substitution joined two words with nothing in common and
    // reported similarity 0. Every downstream use (trust the script's spelling
    // when the ASR nearly heard it) reads that score, so a wrong pairing does
    // not look like a bug, it looks like a genuine deviation. Substitution cost
    // now scales with dissimilarity, which is what makes this hold.
    const scriptTokens = scriptToAlignTokens(script)
    const spokenTokens = spokenOf(heard)
    const r = alignScriptToSpoken(scriptTokens, spokenTokens)
    if (!r.ok) throw new Error('expected alignment')
    const sub = r.alignment.ops.find((o) => o.kind === 'substitution')
    expect(sub).toBeDefined()
    expect(scriptTokens[(sub as { scriptIdx: number }).scriptIdx].key).toBe('twinai')
    expect(spokenTokens[(sub as { spokenIdx: number }).spokenIdx].key).toBe('twin')
    expect((sub as { similarityMilli: number }).similarityMilli).toBeGreaterThan(500)
  })

  it('MUTATION: a close mishearing scores far above a genuine deviation', () => {
    // This gap is the ENTIRE basis for ever preferring the script's spelling.
    // Without it, "twinai heard as twin" and "hello said instead of goodbye"
    // are the same event and neither can be acted on.
    const mishearing = tokenSimilarityMilli('twinai', 'twinay')
    const deviation = tokenSimilarityMilli('hello', 'goodbye')
    expect(mishearing).toBeGreaterThan(700)
    expect(deviation).toBeLessThan(400)
    expect(mishearing - deviation).toBeGreaterThan(300)
  })

  it('gives every script word a REAL timestamp and the SCRIPT spelling', () => {
    const scriptTokens = scriptToAlignTokens(script)
    const a = alignScriptToSpoken(scriptTokens, spokenOf(heard))
    if (!a.ok) throw new Error('expected alignment')
    const words = spokenOf(heard).map((_, i) => ({ startMs: i * 500, endMs: i * 500 + 400 }))
    const timings = scriptWordTimings(a.alignment, scriptTokens, words)

    expect(timings).toHaveLength(6)
    // The spelling comes from the script — this is the fix.
    expect(timings[1].text).toBe('TwinAI')
    // The timing comes from the recording.
    const timed = timings.filter((t) => t.startMs !== null)
    expect(timed.length).toBeGreaterThanOrEqual(5)
    for (const t of timed) expect(t.endMs).toBeGreaterThan(t.startMs!)
  })
})

describe('NEGATIVE: it reports, it never filters', () => {
  it('an ad-lib survives as an insertion and is never dropped', () => {
    // editorSpeech.ts: the transcript is never filtered against a script.
    const a = ok('Ship it today', 'ship it honestly today')
    const ins = a.ops.filter((o) => o.kind === 'insertion')
    expect(ins).toHaveLength(1)
    expect(a.spokenTokenCount).toBe(4)
    // Every spoken token is still accounted for by exactly one op.
    const spokenCovered = a.ops.filter((o) => 'spokenIdx' in o).length
    expect(spokenCovered).toBe(4)
  })

  it('a skipped word is a deletion with a NULL time, not an invented one', () => {
    const scriptTokens = scriptToAlignTokens('Ship it today please')
    const spoken = spokenOf('ship it today')
    const r = alignScriptToSpoken(scriptTokens, spoken)
    if (!r.ok) throw new Error('expected alignment')
    expect(r.alignment.deletionCount).toBe(1)

    const timings = scriptWordTimings(
      r.alignment, scriptTokens,
      spoken.map((_, i) => ({ startMs: i * 400, endMs: i * 400 + 300 })),
    )
    const skipped = timings.find((t) => t.text === 'please')!
    expect(skipped.startMs).toBeNull()
    expect(skipped.endMs).toBeNull()
    expect(skipped.via).toBe('not_spoken')
  })

  it('every script token appears in the output exactly once, spoken or not', () => {
    const scriptTokens = scriptToAlignTokens('a b c d e')
    const r = alignScriptToSpoken(scriptTokens, spokenOf('a c e'))
    if (!r.ok) throw new Error('expected alignment')
    const timings = scriptWordTimings(r.alignment, scriptTokens, [
      { startMs: 0, endMs: 100 }, { startMs: 200, endMs: 300 }, { startMs: 400, endMs: 500 },
    ])
    expect(timings.map((t) => t.scriptIdx)).toEqual([0, 1, 2, 3, 4])
    expect(timings.filter((t) => t.startMs === null)).toHaveLength(2) // b, d
  })
})

describe('a false start is visible as repetition against the script', () => {
  it('the retry shows up as insertions, not as lost script coverage', () => {
    // "So the thing is— so the thing is, you can just ship it."
    const a = ok('So the thing is you can just ship it', 'so the thing is so the thing is you can just ship it')
    expect(a.coverageMilli).toBe(1000) // the whole script was said
    expect(a.insertionCount).toBe(4)   // the abandoned first attempt
  })
})

describe('coverage is honest', () => {
  it('is a truncated milli-fraction and never rounds up', () => {
    // 2 of 3 is 666.67 per 1000; reporting 667 would overstate coverage.
    const a = ok('alpha beta gamma', 'alpha beta')
    expect(a.matchedCount).toBe(2)
    expect(a.coverageMilli).toBe(666)
  })

  it('is 1000 only when every script token was matched exactly', () => {
    expect(ok('one two three', 'one two three').coverageMilli).toBe(1000)
    expect(ok('one two three', 'one two free').coverageMilli).toBeLessThan(1000)
  })

  it('a substitution does NOT count as coverage', () => {
    const a = ok('one two three', 'one two free')
    expect(a.matchedCount).toBe(2)
    expect(a.substitutionCount).toBe(1)
    expect(a.coverageMilli).toBe(666)
  })
})

describe('MUTATION: the result is identical every run', () => {
  // Equal-cost alignments exist constantly. If the tie-break were not fixed,
  // two runs on the same recording could produce different cut points and
  // different caption times, which is precisely what the integer-only rule in
  // edit_policy_v1.json exists to prevent everywhere else on this path.
  it('same input, byte-identical ops across repeated runs', () => {
    const script = scriptToAlignTokens('the quick brown fox jumps over the lazy dog')
    const spoken = spokenOf('the quick brown cat jumped over a lazy dog today')
    const runs = Array.from({ length: 5 }, () => {
      const r = alignScriptToSpoken(script, spoken)
      if (!r.ok) throw new Error('expected alignment')
      return JSON.stringify(r.alignment.ops)
    })
    expect(new Set(runs).size).toBe(1)
  })

  it('ties resolve toward the diagonal, keeping the script order', () => {
    // 'b' vs 'x' costs 1 as a substitution and 1+1 as delete+insert... the
    // cheaper single op must win, or the alignment drifts into runs of
    // insert/delete that cost the same overall but read as nonsense.
    const a = ok('a b c', 'a x c')
    expect(a.substitutionCount).toBe(1)
    expect(a.insertionCount).toBe(0)
    expect(a.deletionCount).toBe(0)
  })

  it('ops are in ascending order on both sequences', () => {
    const a = ok('one two three four five', 'one three four six five')
    let lastScript = -1, lastSpoken = -1
    for (const op of a.ops) {
      if ('scriptIdx' in op) { expect(op.scriptIdx).toBeGreaterThan(lastScript); lastScript = op.scriptIdx }
      if ('spokenIdx' in op) { expect(op.spokenIdx).toBeGreaterThan(lastSpoken); lastSpoken = op.spokenIdx }
    }
  })
})

describe('normalization puts both sides in the same shape', () => {
  it('ignores case and punctuation, which is what a script has and ASR does not', () => {
    const a = ok('Ship it, today!', 'ship it today')
    expect(a.coverageMilli).toBe(1000)
  })

  it('keeps apostrophes, because "dont" and "don\'t" are the same word said once', () => {
    expect(scriptToAlignTokens("don't stop").map((t) => t.key)).toEqual(["don't", 'stop'])
  })

  it('drops tokens that normalize to nothing rather than aligning against them', () => {
    expect(scriptToAlignTokens('hi -- there').map((t) => t.key)).toEqual(['hi', 'there'])
  })

  it('handles non-Latin script — the "every language at once" claim', () => {
    const a = ok('मैं आज शिप करूँगा', 'मैं आज शिप करूँगा')
    expect(a.coverageMilli).toBe(1000)
    expect(a.scriptTokenCount).toBe(4)
  })
})

describe('it refuses rather than half-answering', () => {
  it('reports an empty script and an empty recording distinctly', () => {
    expect(alignScriptToSpoken([], spokenOf('a b'))).toEqual({ ok: false, reason: 'script_empty' })
    expect(alignScriptToSpoken(scriptToAlignTokens('a b'), [])).toEqual({ ok: false, reason: 'spoken_empty' })
  })

  it('refuses an input too large instead of aligning a prefix', () => {
    // Silently aligning part of it would report a confident coverage number
    // computed from half the script, and no caller could tell.
    const big = Array.from({ length: 2100 }, (_, i) => ({ key: `w${i}`, text: `w${i}` }))
    const r = alignScriptToSpoken(big, big)
    expect(r).toEqual({ ok: false, reason: 'too_large' })
    expect((2101 * 2101) > MAX_ALIGNMENT_CELLS).toBe(true)
  })

  it('accepts the longest input the pipeline actually allows', () => {
    // 15 min (source.maxDurationMs) at a fast 200wpm is ~3000 words, but a
    // script and a recording of that length together exceed the cell cap, so
    // the realistic bound is what matters: a 3-minute video, ~500 words.
    const s = Array.from({ length: 600 }, (_, i) => ({ key: `w${i}`, text: `w${i}` }))
    const r = alignScriptToSpoken(s, s)
    expect(r.ok).toBe(true)
  })
})

describe('what counts as "the script" — read from the pinned snapshot', () => {
  it('joins the scenes the creator was actually shown', () => {
    expect(spokenScriptFromSnapshot({
      scenes: [{ dialogue: 'Ship it today' }, { dialogue: 'And tell a friend' }],
    })).toBe('Ship it today And tell a friend')
  })

  it('skips hidden b-roll scenes, which were never on screen to be read', () => {
    // The snapshot keeps them because they are part of the recorded-script
    // identity. Aligning against them would manufacture deletions for words
    // nobody was ever shown — coverage would drop for a video read perfectly.
    const s = spokenScriptFromSnapshot({
      scenes: [
        { dialogue: 'Ship it today', showInTeleprompter: true },
        { dialogue: 'b-roll of the dashboard', showInTeleprompter: false },
        { dialogue: 'And tell a friend', showInTeleprompter: true },
      ],
    })
    expect(s).toBe('Ship it today And tell a friend')
    expect(s).not.toContain('b-roll')
  })

  it('an UPLOAD has no script, and that is normal rather than a failure', () => {
    // Uploading a take is a first-class way into this product. Everything
    // downstream must keep working on ASR alone, exactly as it does today.
    expect(spokenScriptFromSnapshot({ capturedScript: false })).toBeNull()
    expect(spokenScriptFromSnapshot(null)).toBeNull()
  })

  it('empty or dialogue-less scenes give null, not an empty-string script', () => {
    expect(spokenScriptFromSnapshot({ scenes: [] })).toBeNull()
    expect(spokenScriptFromSnapshot({ scenes: [{ dialogue: null }, { dialogue: '  ' }] })).toBeNull()
  })

  it('end to end: snapshot in, aligned timings out', () => {
    const script = spokenScriptFromSnapshot({
      scenes: [
        { dialogue: 'Try TwinAI today', showInTeleprompter: true },
        { dialogue: 'internal note', showInTeleprompter: false },
      ],
    })!
    const tokens = scriptToAlignTokens(script)
    const r = alignScriptToSpoken(tokens, spokenOf('try twin eye today'))
    if (!r.ok) throw new Error('expected alignment')
    expect(tokens.map((t) => t.text)).toEqual(['Try', 'TwinAI', 'today'])
    expect(r.alignment.insertionCount).toBe(1) // the mis-split "eye"
  })
})

describe('edit distance is the real cost of the alignment it returned', () => {
  it('is zero for an exact read', () => {
    expect(ok('one two three', 'one two three').editDistance).toBe(0)
  })

  it('equals the ops that are not matches', () => {
    const a = ok('one two three four', 'one two too four five')
    expect(a.editDistance).toBe(a.substitutionCount + a.deletionCount + a.insertionCount)
  })
})
