// Script-anchored forced alignment — matching WHAT THEY READ against WHAT THEY
// SAID, in order.
//
// WHY THIS IS THE LARGEST SINGLE ACCURACY WIN.
//
// Everything downstream is currently anchored to ASR output alone, and ASR
// output is the one input we know is wrong in a specific, repeatable way: it
// mis-hears exactly the words that matter most. Brand names, product names,
// numbers, and any term the creator invented are the tokens a speech model has
// the least evidence for — and they are also the tokens a creator most cannot
// afford to see misspelled burned into their own video.
//
// The script is the ground truth for SPELLING. The recording is the ground
// truth for TIMING. Neither alone is enough and nothing so far combined them:
// today `editorHook.ts` compares the script's hook line to the spoken opening
// as an unordered bag of words, which yields a single ratio and cannot say
// WHERE anything was said. This aligns the whole script in sequence, so every
// script word gets a real timestamp.
//
// That one mapping is what fixes captions (show the script's spelling at the
// recording's time), cuts (a stretch of script spoken twice is a false start),
// emphasis (emphasis indices point at script words, which now have times),
// and hooks (an exact word boundary instead of a ratio) — in every language at
// once, because this is text-to-text and never acoustic.
//
// WHAT THIS DELIBERATELY DOES NOT DO.
//
// It does not filter. editorSpeech.ts states the rule plainly: the transcript
// comes from the actual recording and is "never filtered against" a script —
// off-script words stay. So an ad-lib is REPORTED as an insertion and is never
// removed, and a script word the creator skipped is reported as a deletion
// rather than invented back into the timeline. This module produces evidence,
// exactly like every other analyze-stage component; it decides nothing.
//
// NAME COLLISION, DELIBERATELY NOT RESOLVED HERE. The hook component already
// persists a field called `scriptAlignment` (`editorHook.ts:76`, read at
// `editorDirector.ts:127`). That is the OLD, narrower thing: a single
// `matchedTokenRatio` over the hook line only, computed as an unordered
// multiset overlap. It is a stored schema field, so renaming it is a migration
// and not a tidy-up to slip into this commit. This module is the sequence
// alignment over the WHOLE script; when it is wired in, that field is what it
// supersedes.
//
// INTEGERS ONLY, like the rest of the plan path: scores are integers and
// ratios are milli-units, so the same inputs produce byte-identical output on
// any machine. Coverage TRUNCATES rather than rounds, so it can never
// overstate how much of the script was actually matched.

/** A token sequence with the original text kept for reporting. */
export interface AlignToken {
  /** Comparison form — normalized, lowercased, punctuation stripped. */
  key: string
  /** What the token looked like before normalization. */
  text: string
}

export type AlignOp =
  /** Same token in both. `scriptIdx`/`spokenIdx` index the input arrays. */
  | { kind: 'match'; scriptIdx: number; spokenIdx: number }
  /**
   * Different tokens occupying the same position. `similarityMilli` (0..1000)
   * separates the two very different things this can mean: a high score is an
   * ASR mishearing of the scripted word (use the script's spelling), a low one
   * is the creator genuinely saying something else (do not).
   */
  | { kind: 'substitution'; scriptIdx: number; spokenIdx: number; similarityMilli: number }
  /** In the script, never spoken — a skipped word. */
  | { kind: 'deletion'; scriptIdx: number }
  /** Spoken, not in the script — an ad-lib. NEVER removed, only reported. */
  | { kind: 'insertion'; spokenIdx: number }

export interface ScriptAlignment {
  ops: AlignOp[]
  scriptTokenCount: number
  spokenTokenCount: number
  matchedCount: number
  substitutionCount: number
  deletionCount: number
  insertionCount: number
  /** Exactly-matched script tokens per 1000. Truncated, never rounded up. */
  coverageMilli: number
  /**
   * Classic unit edit distance: substitutions + deletions + insertions.
   *
   * NOT the DP's internal cost. The DP minimizes a SIMILARITY-WEIGHTED cost
   * (see SUB_COST_* below) because unit costs pick the wrong pairing on ties;
   * that weighted number is a tuning device and means nothing to a reader, so
   * what gets reported is the count everyone already understands.
   */
  editDistance: number
}

export type AlignResult =
  | { ok: true; alignment: ScriptAlignment }
  | { ok: false; reason: 'script_empty' | 'spoken_empty' | 'too_large' }

// The DP table is (n+1)*(m+1) cells. A 15-minute recording (the frozen
// source.maxDurationMs) at a fast 200 wpm is about 3000 words, and a script
// long enough to fill it is similar — so 4M cells covers the longest input the
// pipeline accepts, at roughly 20MB of typed arrays.
//
// This is a REFUSAL, not a truncation. Silently aligning a prefix would report
// a confident-looking coverage number computed from part of the script, which
// is worse than saying the alignment is unavailable: every caller here already
// knows how to proceed without an alignment, and none of them can tell that a
// number was computed from half the input.
export const MAX_ALIGNMENT_CELLS = 4_000_000

/** NFC, lowercase, strip punctuation, drop empties. The `editorHook` rule. */
export function toAlignTokens(words: Array<{ text: string }>): AlignToken[] {
  const out: AlignToken[] = []
  for (const w of words) {
    const key = (w.text ?? '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}']/gu, '')
    if (key) out.push({ key, text: w.text })
  }
  return out
}

/** Split a script string the same way, so both sides normalize identically. */
export function scriptToAlignTokens(script: string): AlignToken[] {
  return toAlignTokens(
    (script ?? '').normalize('NFC').split(/\s+/).filter(Boolean).map((text) => ({ text })),
  )
}

/** The subset of a pinned snapshot this module reads. */
export interface SnapshotForAlignment {
  scenes?: Array<{ dialogue?: string | null; showInTeleprompter?: boolean }>
  /** Present and false on the UPLOAD form — see buildNoCapturedScriptSnapshot. */
  capturedScript?: boolean
}

/**
 * The words the creator was actually asked to SAY, in order — the left-hand
 * side of the alignment.
 *
 * Two things a caller would get wrong, so they live here instead:
 *
 *   1. A scene with `showInTeleprompter: false` is hidden b-roll. It is part
 *      of the recorded-script IDENTITY (which is why the snapshot keeps it)
 *      but it was never on screen to be read, so aligning against it would
 *      manufacture deletions for words nobody was ever shown.
 *   2. An UPLOAD has no captured script at all — the snapshot is the explicit
 *      `capturedScript: false` form. Uploading a take is a first-class way
 *      into this product, so "no script" is a NORMAL state to return null for,
 *      not a failure. Everything downstream keeps working on ASR alone,
 *      exactly as it does today.
 */
export function spokenScriptFromSnapshot(snapshot: SnapshotForAlignment | null): string | null {
  if (!snapshot || snapshot.capturedScript === false) return null
  const scenes = Array.isArray(snapshot.scenes) ? snapshot.scenes : []
  const parts: string[] = []
  for (const s of scenes) {
    if (s.showInTeleprompter === false) continue
    const d = typeof s.dialogue === 'string' ? s.dialogue.trim() : ''
    if (d) parts.push(d)
  }
  return parts.length ? parts.join(' ') : null
}

/**
 * Similarity of two tokens in milli-units, from edit distance over characters.
 * 1000 is identical. Used only to CLASSIFY a substitution, never to create one.
 */
export function tokenSimilarityMilli(a: string, b: string): number {
  if (a === b) return 1000
  const la = a.length, lb = b.length
  if (la === 0 || lb === 0) return 0
  // Row-wise Levenshtein; tokens are words, so this is a handful of cells.
  let prev = new Array<number>(lb + 1)
  let cur = new Array<number>(lb + 1)
  for (let j = 0; j <= lb; j++) prev[j] = j
  for (let i = 1; i <= la; i++) {
    cur[0] = i
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    const t = prev; prev = cur; cur = t
  }
  const dist = prev[lb]
  const longest = la > lb ? la : lb
  // Truncates: a similarity is never reported higher than it is.
  return Math.floor(((longest - dist) * 1000) / longest)
}

// Traceback direction codes. Fixed numbers, and the preference order in the
// traceback is fixed too, because two alignments of equal cost must always
// resolve to the SAME one — a plan that changes between runs on identical
// input is exactly what the integer-only rule exists to prevent.
const DIAG = 1, UP = 2, LEFT = 3

// COSTS, AND WHY THEY ARE NOT ALL 1.
//
// Unit costs (match 0, substitution/insertion/deletion 1) are the textbook
// choice and they produce a wrong answer on the exact case this module was
// built for. Script "Try TwinAI today", heard "try twin eye today": pairing
// twinai↔twin and inserting "eye" costs 2, and pairing twinai↔EYE and
// inserting "twin" also costs 2. The tie-break picked the second, so the one
// substitution in the alignment paired two words with nothing in common and
// reported similarity 0 — destroying the very signal that tells a caller this
// was a mishearing and the script's spelling should win.
//
// So a substitution's cost scales with how UNLIKE the two tokens are. A near
// miss is cheap, a wild pairing is dear, and the DP now prefers the pairing a
// human would have made. The band stays strictly below two indels, which
// preserves the classic property that one substitution beats a
// delete-plus-insert pair rather than degenerating into runs of them.
const INDEL_COST = 1000
const SUB_COST_MIN = 600   // identical-but-for-a-character
const SUB_COST_SPAN = 800  // added in full when the tokens share nothing → 1400 < 2000

/**
 * Global (Needleman-Wunsch) alignment of script tokens to spoken tokens,
 * with substitution cost weighted by token similarity.
 */
export function alignScriptToSpoken(script: AlignToken[], spoken: AlignToken[]): AlignResult {
  const n = script.length, m = spoken.length
  if (n === 0) return { ok: false, reason: 'script_empty' }
  if (m === 0) return { ok: false, reason: 'spoken_empty' }
  if ((n + 1) * (m + 1) > MAX_ALIGNMENT_CELLS) return { ok: false, reason: 'too_large' }

  const w = m + 1
  const score = new Int32Array((n + 1) * w)
  const from = new Uint8Array((n + 1) * w)

  // Similarity is needed once per DISTINCT token pair, not once per cell.
  // Real speech repeats words heavily, so this memo turns an O(n*m) string
  // comparison into something closer to O(vocabulary²).
  const simMemo = new Map<string, number>()
  const sim = (a: string, b: string): number => {
    const k = `${a} ${b}`
    let v = simMemo.get(k)
    if (v === undefined) { v = tokenSimilarityMilli(a, b); simMemo.set(k, v) }
    return v
  }

  for (let j = 1; j <= m; j++) { score[j] = j * INDEL_COST; from[j] = LEFT }
  for (let i = 1; i <= n; i++) { score[i * w] = i * INDEL_COST; from[i * w] = UP }

  for (let i = 1; i <= n; i++) {
    const si = script[i - 1].key
    const row = i * w, prevRow = (i - 1) * w
    for (let j = 1; j <= m; j++) {
      const sj = spoken[j - 1].key
      const cost = si === sj
        ? 0
        : SUB_COST_MIN + Math.floor(((1000 - sim(si, sj)) * SUB_COST_SPAN) / 1000)
      const diag = score[prevRow + j - 1] + cost
      const up = score[prevRow + j] + INDEL_COST     // script token not spoken
      const left = score[row + j - 1] + INDEL_COST   // spoken token not in script
      // Preference on ties: diagonal, then up, then left. Diagonal first keeps
      // the alignment tracking the script's own order instead of drifting into
      // long runs of insert+delete that cost the same but read as nonsense.
      let best = diag, dir = DIAG
      if (up < best) { best = up; dir = UP }
      if (left < best) { best = left; dir = LEFT }
      score[row + j] = best
      from[row + j] = dir
    }
  }

  const rev: AlignOp[] = []
  let matchedCount = 0, substitutionCount = 0, deletionCount = 0, insertionCount = 0
  let i = n, j = m
  while (i > 0 || j > 0) {
    const dir = i === 0 ? LEFT : j === 0 ? UP : from[i * w + j]
    if (dir === DIAG) {
      const s = script[i - 1], k = spoken[j - 1]
      if (s.key === k.key) {
        rev.push({ kind: 'match', scriptIdx: i - 1, spokenIdx: j - 1 })
        matchedCount++
      } else {
        rev.push({
          kind: 'substitution', scriptIdx: i - 1, spokenIdx: j - 1,
          similarityMilli: tokenSimilarityMilli(s.key, k.key),
        })
        substitutionCount++
      }
      i--; j--
    } else if (dir === UP) {
      rev.push({ kind: 'deletion', scriptIdx: i - 1 })
      deletionCount++
      i--
    } else {
      rev.push({ kind: 'insertion', spokenIdx: j - 1 })
      insertionCount++
      j--
    }
  }
  rev.reverse()

  return {
    ok: true,
    alignment: {
      ops: rev,
      scriptTokenCount: n,
      spokenTokenCount: m,
      matchedCount,
      substitutionCount,
      deletionCount,
      insertionCount,
      coverageMilli: Math.floor((matchedCount * 1000) / n),
      editDistance: substitutionCount + deletionCount + insertionCount,
    },
  }
}

/** A script token's place in the recording, or null when it was never spoken. */
// ── WHERE THE SCRIPT ACTUALLY STARTS IN THE RECORDING ──────────────────────
//
// The Director chooses `hookStartWordIndex` — the spoken word to open on,
// dropping everything before it. Until now the only evidence it had about the
// opening was `matchedTokenRatio` from the hook component: an UNORDERED
// multiset overlap between the script's hook tokens and the words spoken in the
// first few seconds. That says how MUCH of the hook was said. It cannot say
// WHERE, which is the one thing an index needs.
//
// Alignment can say where, and without depending on `snapshot.hook` at all —
// which matters, because the aligned script is built from scene DIALOGUE
// (spokenScriptFromSnapshot skips hidden scenes and ignores the hook field), so
// the hook line is not reliably part of it.
//
// The boundary this returns is the first script word the creator ACTUALLY SAID.
// Everything before it is preamble: settling into frame, "hey guys welcome
// back", clearing the throat — the material the edges trim and the hook
// mechanism exists to skip. An index at or after this point opens on script; an
// index before it opens on throat-clearing.
//
// EXACT INTEGER TIMES, like the caption spelling map, and for the same reason:
// scriptWordTimings copies its times verbatim from the spoken words it paired
// with, so this is an equality join with no tolerance to tune.
//
// ON startMs ALONE, deliberately. The Director's envelope projects words
// WITHOUT endMs (SpeechWordLike carries id/text/startMs/confidence), and
// reaching around that projection to get an end time would be using a shape the
// envelope has decided not to expose. startMs is a unique key in a monotonic
// word list, which is what the compiler already validates, and the ambiguity
// guard below covers the case where it somehow is not.
//
// A startMs claimed by two spoken words yields null rather than a guess: an
// index pointing at the wrong word opens the video in the wrong place, which is
// worse than the Director simply not having the hint.
export function scriptStartSpokenIndex(
  timings: ReadonlyArray<{ startMs: number | null; endMs?: number | null; via?: string }>,
  spokenWords: ReadonlyArray<{ startMs: number }>,
): number | null {
  if (!Array.isArray(timings) || !Array.isArray(spokenWords)) return null
  // First script word with a real time — i.e. actually spoken. `not_spoken`
  // entries carry nulls and are skipped rather than interpolated.
  let first: number | null = null
  for (const t of timings) {
    if (!Number.isInteger(t?.startMs)) continue
    first = t.startMs as number
    break
  }
  if (first === null) return null
  let found = -1
  for (let i = 0; i < spokenWords.length; i++) {
    if (spokenWords[i]?.startMs !== first) continue
    if (found >= 0) return null   // ambiguous: two words claim the same start
    found = i
  }
  return found >= 0 ? found : null
}

// ── FALSE STARTS ───────────────────────────────────────────────────────────
// A false start is the creator saying a piece of the script, stopping, and
// saying it again. It is the single most common thing a person does in front of
// a camera, and until now nothing in the pipeline could see one.
//
// IN ALIGNMENT TERMS IT IS NOT A SPECIAL CASE, which is why this can be a pure
// read rather than a new measurement. The aligner pairs ONE of the attempts
// with the script and has nowhere to put the other, so the abandoned attempt
// falls out as a RUN OF INSERTIONS sitting immediately beside the script region
// that was then said properly. Every false start has that shape.
//
// SO WHY NOT JUST REPORT INSERTION RUNS. Because most of them are not false
// starts — they are ad-libs, filler, an aside, a laugh. The thing that
// distinguishes a restart is that the abandoned run RESEMBLES the script region
// that follows it. Reporting every insertion run as a false start would be the
// "confident number we do not have" failure the plan opens by warning about.
//
// SIMILARITY IS SEQUENCE-WISE AND ORDERED. A multiset overlap would call
// "the thing about the thing" a restart of "about the thing" — which is the
// exact weakness of the hook component's `matchedTokenRatio`, an unordered
// intersection that can say how MUCH matched but never WHERE. Here the run is
// compared token-for-token against the script region in order.
export interface FalseStart {
  /** Spoken-token range of the ABANDONED attempt, half-open [from, to). */
  spokenFromIdx: number
  spokenToIdx: number
  /** The script region it appears to be an attempt at, half-open. */
  scriptFromIdx: number
  scriptToIdx: number
  /** 0..1000, how closely the abandoned run tracks that script region. */
  similarityMilli: number
  /** Tokens in the abandoned attempt. */
  tokenCount: number
}

/**
 * How closely an ordered run of spoken tokens tracks an ordered run of script
 * tokens. Position-for-position, so word ORDER counts — a restart repeats the
 * words in the same order, which is exactly what distinguishes it from an
 * aside that happens to reuse vocabulary.
 *
 * Compared over the SHORTER length and divided by the LONGER, so a two-word
 * fragment cannot score 1000 against a ten-word region by matching a prefix.
 */
export function runSimilarityMilli(
  a: AlignToken[], b: AlignToken[], lastMayBeTruncated = false,
): number {
  if (a.length === 0 || b.length === 0) return 0
  const n = Math.min(a.length, b.length)
  let total = 0
  for (let i = 0; i < n; i++) {
    // THE ABANDONED WORD. A false start is usually abandoned MID-WORD — "this
    // changes ev— this changes everything" — and that truncated token is the
    // most characteristic thing about it. Levenshtein scores "ev" against
    // "everything" very low, so the run that most obviously IS a restart was
    // the one being refused: measured, not supposed. A strict prefix at the
    // FINAL position only is therefore counted as a match.
    //
    // Final position only, and strict prefix only, because that is where
    // truncation physically happens. Allowing it anywhere would make "show"
    // match "shoulder" mid-sentence and start inventing restarts.
    const isLast = i === n - 1
    if (lastMayBeTruncated && isLast && a[i].key.length > 0 && a[i].key !== b[i].key
        && b[i].key.startsWith(a[i].key)) {
      total += 1000
      continue
    }
    total += tokenSimilarityMilli(a[i].key, b[i].key)
  }
  return Math.round(total / Math.max(a.length, b.length))
}

/**
 * Detect false starts in a completed alignment.
 *
 * `minSimilarityMilli` is the line between "they restarted the sentence" and
 * "they said something else". It is a CHOSEN number and the caller owns it, so
 * it lives in the frozen policy rather than here — the same rule the caption
 * spelling floor follows.
 *
 * `minTokens` refuses one-word runs outright. A single repeated word is a
 * stutter or a filler, not a false start, and calling it one would flood the
 * record with noise that buries the real ones.
 */
export function detectFalseStarts(
  alignment: ScriptAlignment,
  script: AlignToken[],
  spoken: AlignToken[],
  minSimilarityMilli: number,
  minTokens = 2,
  maxReported = 50,
): FalseStart[] {
  const out: FalseStart[] = []
  if (!Number.isFinite(minSimilarityMilli)) return out
  const ops = alignment.ops
  let i = 0
  while (i < ops.length && out.length < maxReported) {
    if (ops[i].kind !== 'insertion') { i++; continue }
    // Collect the maximal run of consecutive insertions.
    let j = i
    while (j < ops.length && ops[j].kind === 'insertion') j++
    const run = ops.slice(i, j) as Array<{ kind: 'insertion'; spokenIdx: number }>
    const from = run[0].spokenIdx
    const to = run[run.length - 1].spokenIdx + 1

    // The script region that follows: the next ops that consume script tokens.
    // A restart is abandoned and then RE-ATTEMPTED, so the thing it resembles
    // is what comes after it, not before.
    const after: number[] = []
    for (let k = j; k < ops.length && after.length < run.length; k++) {
      const op = ops[k]
      if (op.kind === 'match' || op.kind === 'substitution') after.push(op.scriptIdx)
      else if (op.kind === 'deletion') after.push(op.scriptIdx)
      else break
    }
    if (run.length >= minTokens && after.length > 0) {
      const spokenRun = run.map((o) => spoken[o.spokenIdx]).filter(Boolean)
      const scriptRun = after.map((idx) => script[idx]).filter(Boolean)
      const sim = runSimilarityMilli(spokenRun, scriptRun, true)
      if (sim >= minSimilarityMilli) {
        out.push({
          spokenFromIdx: from,
          spokenToIdx: to,
          scriptFromIdx: after[0],
          scriptToIdx: after[after.length - 1] + 1,
          similarityMilli: sim,
          tokenCount: run.length,
        })
      }
    }
    i = j
  }
  return out
}

export interface ScriptWordTiming {
  scriptIdx: number
  /** The script's spelling — the whole point of anchoring to it. */
  text: string
  startMs: number | null
  endMs: number | null
  /** How the timing was obtained. `null` timings always carry 'not_spoken'. */
  via: 'match' | 'substitution' | 'not_spoken'
  /** Present on 'substitution' so a caller can require a close mishearing. */
  similarityMilli?: number
}

/**
 * Give every script token the timestamp of the spoken word it aligned to.
 *
 * Skipped words get null rather than an interpolated guess. Inventing a time
 * for a word that was never said would put a caption on screen for something
 * the viewer never hears, and the whole value of this module is that the
 * timing side comes from the recording.
 */
export function scriptWordTimings(
  alignment: ScriptAlignment,
  script: AlignToken[],
  spokenWords: Array<{ startMs: number; endMs: number }>,
): ScriptWordTiming[] {
  const out: ScriptWordTiming[] = script.map((t, idx) => ({
    scriptIdx: idx, text: t.text, startMs: null, endMs: null, via: 'not_spoken' as const,
  }))
  for (const op of alignment.ops) {
    if (op.kind !== 'match' && op.kind !== 'substitution') continue
    const sw = spokenWords[op.spokenIdx]
    if (!sw) continue
    const slot = out[op.scriptIdx]
    if (!slot) continue
    slot.startMs = sw.startMs
    slot.endMs = sw.endMs
    slot.via = op.kind
    if (op.kind === 'substitution') slot.similarityMilli = op.similarityMilli
  }
  return out
}
