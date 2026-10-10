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
//   - a passage is a story when it has a first-person event; complete only when
//     storyParts finds all three of an anchor (a specific time/place or a
//     first-person past event), a turn after it, and a resolution or lesson
//     after the turn. Second-person advice, tip lists, product descriptions and
//     hypotheticals are never complete (item 3.1: 8 marked complete, 5 real).

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
const PROCESS = /\b(?:first|then|step|every (?:batch|morning|time)|I (?:roast|brew|test|weigh|cool|bag|ship|pack|measure))\b/i

// Anchor: a specific time or place, or a first-person past event.
const ANCHOR = /\b(?:last (?:spring|summer|fall|autumn|winter|year|month|week|weekend|christmas|saturday|sunday)|that (?:morning|night|day|week|weekend|summer|winter|spring|fall|saturday|sunday)|(?:one|on a) (?:morning|night|day|saturday|sunday|friday)|the (?:first|second|last|very first) (?:\w+ ){0,3}(?:I|we) (?:did|had|made|ran|opened|sold|tried|went|got|bought|booked)|when (?:I|we) (?:first )?(?:\w+ed|opened|started|got|had|went|was|were|began|took|made|sold|bought)|(?:a few|two|three|four|five|six|\d+) (?:years|months|weeks) ago|back in (?:\d{4}|the day|college)|in (?:19|20)\d\d)\b/i
// Turn: something went wrong, changed or surprised.
const TURN_WORD = /\b(?:but|then|until|turned out|it turns out|realized|that'?s when|instead|suddenly|except|out of nowhere)\b/gi
// Resolution or lesson in her own words.
const RESOLUTION = /\b(?:now (?:I|we)|these days|since then|ever since|from then on|ended up|in the end|finally|that'?s why|which is why|so that'?s|I learned|we learned|the lesson|taught me|I never (?:\w+ )?again|I (?:always|still) |best (?:thing|mistake))/gi
const HYPOTHETICAL = /(?:^\s*(?:so,?\s*)?(?:if|imagine|what if|say)\b|\b(?:let'?s say|imagine (?:you|if)|picture this|what if you|suppose you)\b)/i
const TIP_LIST = /\b(?:tip (?:number )?(?:one|two|three|\d)|(?:number|step) (?:one|two|three)|(?:three|five) (?:things|tips|ways|mistakes)|secondly|thirdly)\b/i
const YOU = /\b(?:you|your|you'?re|you'?ll|yourself)\b/gi
const I_WORDS = /\b(?:I|I'm|I've|I'd|my|me|we|our)\b/g

/** The three parts of a complete story, in order: an anchor, a turn after it, a resolution after the turn. */
export function storyParts(text: string): { anchor: boolean; turn: boolean; resolution: boolean } {
  const t = text.replace(/\s+/g, ' ')
  const youN = (t.match(YOU) ?? []).length
  const iN = (t.match(I_WORDS) ?? []).length
  // Advice, tip lists and hypotheticals are never stories, whatever words they use.
  const never = HYPOTHETICAL.test(t) || TIP_LIST.test(t) || youN > iN || iN === 0
  const a = never ? null : ANCHOR.exec(t)
  if (!a) return { anchor: false, turn: false, resolution: false }
  const after = (re: RegExp, from: number) => {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(t))) if (m.index >= from) return m.index + m[0].length
    return -1
  }
  const turnAt = after(TURN_WORD, a.index + a[0].length)
  const resAt = turnAt < 0 ? -1 : after(RESOLUTION, turnAt)
  return { anchor: true, turn: turnAt >= 0, resolution: resAt >= 0 }
}

export function isCompleteStory(text: string): boolean {
  if (!EVENT.test(text)) return false
  const p = storyParts(text)
  return p.anchor && p.turn && p.resolution
}

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
  // Sung lines are short and slow: median under 8 words a line and under 2.3
  // words a second across the clip (talking to camera runs near 3).
  const perLine = segs.map((s) => words(s.text).length).sort((a, b) => a - b)
  const median = perLine[Math.floor(perLine.length / 2)]
  const span = Math.max(1, segs[segs.length - 1].end - segs[0].start)
  if (segs.length >= 8 && median < 8 && total / span < 2.3) return { skipped: 'lyrics', passages: [] }

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
      complete: story && isCompleteStory(text),
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
    passages[passages.length - 1] = { ...last, end: tail.end, text: `${last.text} ${tail.text}`, complete: last.kind === 'story' && isCompleteStory(`${last.text} ${tail.text}`) }
  }
  return { skipped: null, passages }
}

/**
 * Plan 2.2: TAGS FOR THE PASSAGE STORE. Moment = a specific time, place or
 * first-person event (the anchor); Meaning = a resolution or lesson in her
 * words; Detail = a concrete specific (a number, a quantity, a named time of
 * day, a sensory word). Tags never edit the text: the passage is kept verbatim.
 */
export type PassageTag = 'moment' | 'meaning' | 'detail'
const DETAIL = /\b(?:\d+(?:[.,]\d+)?\s*(?:%|percent|grams?|g|kg|lbs?|pounds?|ounces?|oz|minutes?|mins?|seconds?|hours?|days?|weeks?|dollars?|bucks|degrees?|cups?|bags?|orders?|people|customers)|\$\d+|\d+ (?:a|per) (?:day|week|month)|(?:smell|smelled|taste|tasted|burnt|burned|sticky|cold|hot|loud|quiet|bitter|sweet|dark)\b|(?:6|7|8|9|10|11|12|[1-5])\s*(?:am|pm|a\.m\.|p\.m\.))/i
export function passageTags(text: string): PassageTag[] {
  const p = storyParts(text)
  const tags: PassageTag[] = []
  if (p.anchor) tags.push('moment')
  if (p.resolution) tags.push('meaning')
  if (DETAIL.test(text)) tags.push('detail')
  return tags
}
