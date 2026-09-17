// WHAT HER AUDIENCE KEEPS ASKING, AND WHAT SHE PROMISED TO COVER.
//
// ⚠️ TWO THINGS SIT IN EVERY CREATOR'S OWN SPEECH AND NOTHING HAS EVER READ
// THEM. "A lot of you have been asking how I price these" is the audience's
// demand, in her words, spoken to camera — the only audience-demand signal in the
// system that does not need comment ingestion. "I'll do a whole video on that"
// is a content backlog she has already announced and, measured on the beat-ask
// corpus, forgotten. `audience_questions` was deleted for having no supply; this
// is supply it never looked at.
//
// ⚖️ DETERMINISTIC, WITH NO MODEL CALL AT ALL. This is a cue phrase and the
// clause after it. A model would paraphrase, rank, and occasionally invent; a
// regex either finds her sentence or finds nothing, and "nothing" is the honest
// and common answer. It also means this runs over all 331 stored transcripts for
// free, where a model pass over them costs a call per window.
//
// ⚠️ A CUE WITH NO CLAUSE AFTER IT IS NOT AN ITEM. "A lot of you asked me." on
// its own records that she said a sentence and nothing about what was asked —
// the same defect as a `product` row holding a bare name. Those are skipped, and
// the skip is the whole reason this file can be trusted with a prefix as strong
// as "Audience keeps asking".

/** What one mined line is, before `knowledgeRowsFrom` normalises it. */
export interface MinedLine {
  kind: string
  text: string
  /** Her sentence, kept as the evidence behind the conclusion (0216). */
  evidence: string
  /** 1-based index of the transcript it came from, as the row builder expects. */
  source_video: string
}

/** Cues that introduce something the AUDIENCE asked for.
 *
 *  ⚠️ EVERY ONE OF THESE NAMES THE AUDIENCE AS THE ASKER. "I asked myself" and
 *  "I was asked to speak at" are not audience demand, and a cue list that caught
 *  them would file her own reflection as a request from other people. */
const AUDIENCE_CUES: readonly RegExp[] = Object.freeze([
  // ⚠️ THE AUXILIARY RUN IS A RUN, NOT ONE WORD. "have been asking", "keep
  // asking", "have asked" and "asked" are the same sentence with a different
  // number of helpers, and a single optional word matched only two of them —
  // caught by the first fixture this file was given.
  /\b(?:a lot|so many|loads|lots|plenty|a bunch|a ton)\s+of\s+(?:you|people|you guys|my followers)(?:\s+(?:have|has|had|keep|keeps|kept|been|are|were|do))*\s+(?:ask(?:ed|ing)?|want(?:ed)?\s+to\s+know|wonder(?:ed|ing)?)\b/i,
  /\b(?:you|you guys|people|everyone|everybody)\s+(?:keep|keeps|kept)\s+(?:on\s+)?ask(?:ing)?\b/i,
  /\bI\s+(?:get|got|keep getting)\s+(?:this|that|the same)\s+question\s+(?:a lot|all the time|constantly|every day)\b/i,
  /\bthe\s+(?:most|number one|#1)\s+(?:common\s+|frequent\s+)?question\s+I\s+(?:get|got|hear)\b/i,
  /\b(?:someone|somebody)\s+(?:in the comments|on here|asked me)\s*(?:asked|said)?\b/i,
])

/** Cues that introduce a video she has PROMISED and not necessarily made.
 *
 *  ⚖️ IT IS A PROMISE, NOT COVERAGE, AND THE DISTINCTION IS WHY THESE ARE NOT
 *  FILED AS `covered`. `covered` means "already made, do not repeat" and steers
 *  the writer AWAY from a subject; a promise is the exact opposite instruction,
 *  and mis-filing one as the other would suppress the video she said she owed
 *  them. */
const PROMISE_CUES: readonly RegExp[] = Object.freeze([
  /\bI(?:'ll|'m going to| will| am going to| shall)?\s*(?:gonna\s+)?(?:do|make|film|shoot|record|cover)\s+(?:a\s+|an\s+|the\s+)?(?:whole|full|separate|entire|dedicated|another)?\s*(?:video|vid|part\s+(?:two|2)|follow[- ]?up)\b/i,
  /\b(?:more|full breakdown|the full story)\s+on\s+(?:that|this)\s+(?:soon|later|another time|in another video|next time)\b/i,
  /\bsave\s+that\s+for\s+(?:another|a different)\s+video\b/i,
])

/** Split into sentence-ish spans. Transcripts are punctuated inconsistently, so
 *  a newline counts as a boundary too — whisper emits one per segment and a
 *  paragraph with no full stop would otherwise be one 3,000-character sentence. */
function sentences(text: string): string[] {
  return String(text ?? '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** Tidy one line for storage: collapse whitespace, cap at the column's limit. */
function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, 240)
}

/** What comes AFTER the cue, which is the only part that carries the subject.
 *
 *  ⚠️ RETURNS '' WHEN THERE IS NOTHING LEFT, and the caller skips on that. A cue
 *  at the end of a sentence — "I get that question a lot." — is a real sentence
 *  about nothing in particular, and recording it would put "Audience keeps
 *  asking:" in front of an empty subject.
 *
 *  ⚖️ LEADING CONNECTIVES ARE TRIMMED, not treated as the subject. "asking me
 *  about how I price these" and "asked how I price these" must produce the same
 *  line, or the same question stored twice looks like two questions. */
function after(sentence: string, cue: RegExp): string {
  const m = cue.exec(sentence)
  if (!m) return ''
  const rest = sentence.slice(m.index + m[0].length)
  return rest
    .replace(/^[\s,:;-]+/, '')
    .replace(/^(?:me\s+)?(?:about|for|if|whether|that|to|on)\s+/i, '')
    .replace(/^[\s,:;-]+/, '')
    .trim()
}

/** How short a subject may be before it says nothing.
 *
 *  ⚖️ TWELVE CHARACTERS, WHICH IS ABOUT TWO WORDS. "how I price these" survives;
 *  "this" and "that one" do not, and a pronoun with no antecedent is precisely
 *  the item a script cannot use. */
const MIN_SUBJECT = 12

/** Lines her audience asked for, and lines she promised to cover. */
export function mineTranscript(text: string, videoNumber: number): MinedLine[] {
  const out: MinedLine[] = []
  const n = String(Math.max(1, Math.trunc(videoNumber)))
  for (const s of sentences(text)) {
    for (const cue of AUDIENCE_CUES) {
      const subject = after(s, cue)
      if (subject.length < MIN_SUBJECT) continue
      out.push({
        // ⚖️ `topic` — "something they return to". The taxonomy is closed (0121)
        // and audience demand is not one of its nine kinds; `topic` is the one it
        // genuinely is, and the prefix carries what a new kind would have.
        kind: 'topic',
        text: tidy(`Audience keeps asking: ${subject}`),
        evidence: tidy(s),
        source_video: n,
      })
      break
    }
    for (const cue of PROMISE_CUES) {
      const subject = after(s, cue)
      if (subject.length < MIN_SUBJECT) continue
      out.push({
        kind: 'topic',
        text: tidy(`Promised to cover: ${subject}`),
        evidence: tidy(s),
        source_video: n,
      })
      break
    }
  }
  return out
}

/** How many mined lines one scan may contribute.
 *
 *  ⚠️ IT IS BOUNDED BECAUSE A REGEX DOES NOT GET TIRED. A creator who says "I'll
 *  do a whole video on that" in every upload would otherwise fill the write cap
 *  with promises and push out the substance the cap exists to protect — the
 *  fourth instance of a silent downstream cap, arriving by a new route.
 *
 *  ⚖️ TWELVE: enough to carry a real backlog, nowhere near the 120-row scan cap. */
export const MINED_LINES_MAX = 12

/** Mine every transcript, deduped by the line they produce.
 *
 *  ⚖️ DEDUPED HERE AS WELL AS AT THE INSERT, and for a different reason: the same
 *  sentence repeated across five uploads is ONE question her audience asks, and
 *  five identical rows would each take a slot in the write cap before the
 *  database ever saw them.
 *
 *  ⚠️ THE FIRST OCCURRENCE WINS, so `source_video` points at the earliest video
 *  carrying it — the same rule the extractor prompt states for `times_seen`. */
export function mineTranscripts(texts: readonly string[]): MinedLine[] {
  const seen = new Set<string>()
  const out: MinedLine[] = []
  for (const [i, t] of texts.entries()) {
    for (const line of mineTranscript(t, i + 1)) {
      const key = line.text.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(line)
      if (out.length >= MINED_LINES_MAX) return out
    }
  }
  return out
}
