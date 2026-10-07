// GENERATED FROM packages/shared/src/script/passages.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// PASSAGE EXTRACTOR, SHADOW (M2, extraction audit 2026-10-07).
//
// The audit found 9 real stories across 12 speaking videos and 0 kept in her
// own words: the extractor stores one-line summaries. This cuts whole passages
// out of a timed transcript, verbatim, with start and end times, so a story
// can be kept as she told it. Pure and rules-only; nothing reads it yet.
//
//   - a transcript that is mostly repeated lines, or has almost no first-person
//     speech, is treated as song lyrics or someone else talking and yields nothing
//   - a passage is a run of segments with no pause longer than PAUSE_SEC,
//     merged until it reaches MIN_WORDS and capped at MAX_WORDS
//   - a passage is a story when it has a first-person event; complete when it
//     also has a turn and an outcome

export interface Segment { start: number; end: number; text: string }
export interface Passage {
  start: number
  end: number
  text: string
  kind: 'story' | 'process' | 'other'
  complete: boolean
}
export interface PassageResult { skipped: null | 'lyrics' | 'not_her' | 'too_short'; passages: Passage[] }

const PAUSE_SEC = 2.5
const MIN_WORDS = 25
const MAX_WORDS = 220

const FIRST_PERSON = /\b(?:I|I'm|I've|I'd|my|me|we|our)\b/g
const EVENT = /\b(?:I|we)\s+(?:\w+ly\s+)?(?:got|went|had|made|took|lost|threw|sold|bought|started|tried|spent|learned|realized|opened|called|found|was|were|[a-z]{3,}ed)\b/i
const TURN = /\b(?:but|then|until|so I|that'?s when|turned out|realized|decided|instead)\b/i
const OUTCOME = /\b(?:now|since then|ever since|ended up|in the end|finally|today|that'?s why|which is why|so that'?s)\b/i
const PROCESS = /\b(?:first|then|step|every (?:batch|morning|time)|I (?:roast|brew|test|weigh|cool|bag|ship|pack|measure))\b/i

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean)

export function extractPassages(segments: readonly Segment[]): PassageResult {
  const segs = segments.filter((s) => s && typeof s.text === 'string' && s.text.trim())
  const all = segs.map((s) => s.text.trim()).join(' ')
  const total = words(all).length
  if (total < MIN_WORDS) return { skipped: 'too_short', passages: [] }

  // Lyrics: many lines repeated verbatim.
  const lines = segs.map((s) => s.text.trim().toLowerCase().replace(/[^a-z' ]/g, ''))
  const distinct = new Set(lines).size
  if (lines.length >= 8 && distinct / lines.length < 0.6) return { skipped: 'lyrics', passages: [] }

  // Not her talking: almost no first-person words.
  const fp = (all.match(FIRST_PERSON) ?? []).length
  if (fp / total < 0.02) return { skipped: 'not_her', passages: [] }

  const passages: Passage[] = []
  let cur: Segment[] = []
  const flush = () => {
    if (!cur.length) return
    const text = cur.map((s) => s.text.trim()).join(' ').replace(/\s+/g, ' ')
    const story = EVENT.test(text)
    passages.push({
      start: cur[0].start,
      end: cur[cur.length - 1].end,
      text,
      kind: story ? 'story' : PROCESS.test(text) ? 'process' : 'other',
      complete: story && TURN.test(text) && OUTCOME.test(text),
    })
    cur = []
  }
  for (const s of segs) {
    const prev = cur[cur.length - 1]
    const n = words(cur.map((c) => c.text).join(' ')).length
    const pause = prev ? s.start - prev.end > PAUSE_SEC : false
    if (cur.length && ((pause && n >= MIN_WORDS) || n + words(s.text).length > MAX_WORDS)) flush()
    cur.push(s)
  }
  flush()
  // A short tail joins the passage before it rather than standing alone.
  if (passages.length > 1 && words(passages[passages.length - 1].text).length < MIN_WORDS) {
    const tail = passages.pop()!
    const last = passages[passages.length - 1]
    passages[passages.length - 1] = { ...last, end: tail.end, text: `${last.text} ${tail.text}`, complete: last.complete || tail.complete }
  }
  return { skipped: null, passages }
}
