// THE CREATOR NAMES HER OWN AUDIENCE'S QUESTION, OUT LOUD, AND NOTHING READS IT.
//
// ⚠️ TWO PHRASES CARRY MATERIAL NOTHING ELSE IN THIS SYSTEM CAN GET AT.
//
//   "a lot of you asked me about X"  — audience demand, in her words, followed
//                                      immediately by HER answer to it. This is
//                                      the thing §K2 retracted a claim about:
//                                      the comment corpus is NOT available, and
//                                      `commentsDatasetUrl` is asserted in three
//                                      files and read by none. But the creator
//                                      REPEATS her audience's questions on
//                                      camera, so a transcript we already hold
//                                      carries the demand signal that the
//                                      unavailable comment scrape was wanted for.
//
//   "I'll do a whole video on that"  — her own next idea, in her own framing,
//                                      volunteered. Nothing in the product asks
//                                      a creator what she wants to make next;
//                                      she says it unprompted and it is dropped
//                                      with the rest of the transcript.
//
// ⚖️ THIS MODULE LOCATES, IT DOES NOT DISTIL, AND THE SPLIT IS THE WHOLE DESIGN.
// A regex can find the sentence reliably; it cannot say what was asked or what
// she answered, because that is two or three sentences of ordinary speech. So
// the deterministic half finds the passages and the model half reads only those.
//
// ⚠️⚠️ AND IT MUST NOT WRITE ROWS ITSELF. The obvious shortcut is to store the
// matched sentence as the row's `text`. That is forbidden by 0121's founding
// design: `text` is CHECK-capped at 240 characters precisely so the schema
// refuses to become a transcript store, and its prompt says "a distillate, never
// a quotation, and never a passage copied out of a transcript". A 240-character
// truncation of real speech is a severed quotation wearing a distillate's
// clothes. The sentence belongs in `evidence` (0215), which exists for it, and
// the conclusion has to be written by something that can read.
//
// ⚖️ ZERO COST WHEN SHE NEVER SAYS THESE THINGS. No match means no passages
// means no call — unlike the Track A pass, which reads every transcript because
// its seven questions are always worth asking.

/** A located passage: the sentence that matched, plus what follows it.
 *
 *  ⚠️ THE FOLLOWING SENTENCES ARE THE POINT, NOT CONTEXT. "A lot of you asked
 *  about the glue" is the demand; the ANSWER is in the next breath, and a
 *  matcher that returned only the matched sentence would hand the model the
 *  question and withhold the reply. */
export interface MinedPassage {
  /** 1-based index of the transcript it came from, matching the "--- VIDEO n"
   *  headings the extractors use, so a row can keep its `source_url`. */
  video: number
  kind: 'audience_demand' | 'promised_video'
  text: string
}

/**
 * ⚠️ ANCHORED ON THE VERB AND ITS SUBJECT, NOT ON THE WORD "ASKED". A bare
 * /asked/ matches "I asked my supplier", "nobody asked for this" and "she asked
 * me to stop", none of which are audience demand. §I1 records the cost of the
 * looser mistake: the beat-ask generic detector was "an anchored regex" whose
 * leak made every section show the same sentence.
 *
 * ⚖️ SECOND PERSON PLURAL IS THE DISCRIMINATOR. Audience demand is always
 * addressed TO the audience about the audience: "a lot of you", "you guys", "so
 * many of you", "people keep asking me". First person singular asking someone
 * else is the common false positive and every pattern here excludes it.
 */
const DEMAND_PATTERNS: readonly RegExp[] = [
  /\b(?:a lot|lots|loads|so many|many|most|some|several|quite a few|plenty) of (?:you|you guys|my followers|my viewers|people|the comments)\b[^.!?]{0,80}\b(?:asked|ask|have asked|keep asking|wanted to know|want to know|are asking)\b/i,
  /\b(?:you guys|you all|y'all) (?:keep|kept|always|have been)? ?(?:asking|ask)\b/i,
  /\b(?:people|everyone|everybody|the comments|my (?:dms|inbox)) (?:keep|keeps|kept|are|is|have been) (?:asking|blowing up (?:with|about))\b/i,
  /\bthe (?:most|number one|#1|biggest|top) (?:asked |requested |common )?question (?:i get|i'm asked|people ask)\b/i,
  /\b(?:i get|i'm getting|i keep getting) (?:this|that|the same) question\b/i,
]

/**
 * ⚠️ A PROMISE, NOT A MENTION. "I made a video about this" is coverage and is
 * already handled by the `covered` kind; what is wanted here is the FUTURE
 * tense — a subject she has named as worth its own video and not yet made.
 * Mixing the two would file her back catalogue as her pipeline.
 */
const PROMISE_PATTERNS: readonly RegExp[] = [
  /\b(?:i'?ll|i will|i'?m going to|i'?m gonna|let me) (?:do|make|film|shoot|put out|save) (?:a |an )?(?:whole |separate |entire |full |dedicated )?(?:video|reel|short|part two|part 2)\b/i,
  /\bthat(?:'s| is) (?:a |its own |a whole )?(?:whole |entire |separate )?(?:video|topic|episode)(?: (?:on|of|for) (?:its|it's) own)?\b/i,
  /\b(?:a |one )?(?:video|topic) for another (?:day|time|video)\b/i,
  /\b(?:comment|let me know|tell me) (?:below )?if you want (?:me to do |a )?(?:a )?(?:video|part two|part 2)\b/i,
]

/** Abbreviations whose full stop is not a sentence end.
 *
 *  ⚠️ SHORT AND DELIBERATELY INCOMPLETE. This is not an attempt at a general
 *  abbreviation list — it is the handful that appear in spoken product talk,
 *  where "hide glue vs. PVA" would otherwise split into two sentences because
 *  PVA is capitalised. Everything absent from it splits, which is the safe
 *  direction: an over-long passage costs a few tokens, a severed one costs the
 *  truth of a quotation. */
const ABBREVIATIONS: ReadonlySet<string> = new Set([
  'vs', 'etc', 'eg', 'ie', 'approx', 'no', 'fig', 'mr', 'mrs', 'ms', 'dr', 'st',
  'inc', 'ltd', 'co', 'jr', 'sr', 'oz', 'lb', 'ft', 'hr', 'min', 'sec',
])

/** ⚠️ NOT `split('.')`. Prices, decimals, "vs.", initials and ellipses all carry
 *  full stops, and a naive split severs a sentence mid-number — which is how a
 *  quotation stops being true, and `evidence` is only worth storing while it is
 *  exactly what she said.
 *
 *  Two rules, and both err toward keeping too much rather than cutting mid-claim:
 *  a terminator must be followed by whitespace and a capital or digit (so
 *  "£400.50" survives), and a piece ending in a known abbreviation is re-joined
 *  to the next (so "vs. PVA" survives). */
export function sentences(text: string): string[] {
  const parts = String(text ?? '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((s) => s.trim())
    .filter(Boolean)
  // ⚠️ APPENDS TO THE PREVIOUS PIECE, never buffers a pending one. A trailing
  // abbreviation at the very end of the text must still be emitted, and a
  // buffer that never flushes would silently drop the last sentence.
  const endsInAbbreviation = (s: string): boolean => {
    const word = /([A-Za-z]+)\.$/.exec(s)?.[1]
    return word !== undefined && ABBREVIATIONS.has(word.toLowerCase())
  }
  const out: string[] = []
  for (const part of parts) {
    if (out.length > 0 && endsInAbbreviation(out[out.length - 1])) {
      out[out.length - 1] = `${out[out.length - 1]} ${part}`
      continue
    }
    out.push(part)
  }
  return out
}

/** How many sentences after the match to carry.
 *
 *  ⚠️ TWO, AND IT IS A JUDGEMENT WITH A COST EITHER WAY. One often stops before
 *  the answer lands; four starts pulling in the next subject and invites the
 *  model to attribute a neighbouring claim to this question. Two is where the
 *  answer usually is and where the drift starts. */
export const FOLLOW_SENTENCES = 2

/** How many passages one scan may carry, per kind.
 *
 *  ⚖️ A BOUND ON THE PROMPT, NOT ON THE CREATOR. A creator who says "a lot of
 *  you asked" in every video has the signal; what she does not need is a corpus
 *  that no longer fits the window the model reads well. */
export const MAX_PASSAGES_PER_KIND = 12

/**
 * Find the passages worth a second read. Deterministic, no model, no network.
 *
 * ⚖️ A SENTENCE MATCHES AT MOST ONE KIND, and demand wins. "A lot of you asked
 * about this and I'll do a whole video on it" is one sentence that is genuinely
 * both; emitting it twice would double-count one remark into two rows and
 * inflate every count downstream that reasons about supply — the same reason
 * `knowledgeRows` dedupes by identity.
 */
export function minePassages(transcripts: readonly string[]): MinedPassage[] {
  const out: MinedPassage[] = []
  const counts = { audience_demand: 0, promised_video: 0 }
  for (const [i, t] of transcripts.entries()) {
    const sents = sentences(t)
    for (const [j, s] of sents.entries()) {
      const kind: MinedPassage['kind'] | null =
        DEMAND_PATTERNS.some((re) => re.test(s)) ? 'audience_demand'
        : PROMISE_PATTERNS.some((re) => re.test(s)) ? 'promised_video'
        : null
      if (!kind) continue
      if (counts[kind] >= MAX_PASSAGES_PER_KIND) continue
      counts[kind]++
      out.push({
        video: i + 1,
        kind,
        text: sents.slice(j, j + 1 + FOLLOW_SENTENCES).join(' '),
      })
    }
  }
  return out
}

/** Render located passages as a corpus for the model, grouped by kind so the
 *  prompt can ask a different question of each. Returns '' when nothing
 *  matched, which is the caller's signal to make no call at all. */
export function passageCorpus(passages: readonly MinedPassage[]): string {
  if (!passages.length) return ''
  const block = (kind: MinedPassage['kind'], heading: string) => {
    const rows = passages.filter((p) => p.kind === kind)
    if (!rows.length) return ''
    return `\n${heading}\n${rows.map((p) => `--- VIDEO ${p.video} ---\n${p.text}`).join('\n\n')}\n`
  }
  return [
    block('audience_demand', 'MOMENTS WHERE SHE REPEATS HER AUDIENCE\'S QUESTION:'),
    block('promised_video', 'MOMENTS WHERE SHE SAYS A SUBJECT DESERVES ITS OWN VIDEO:'),
  ].filter(Boolean).join('\n')
}
