// SHE TOLD US SHE WAS UNSURE, AND NAMED BOTH ANSWERS, AND NOTHING ASKED.
//
// ⚠️⚠️ MEASURED ON 25 REAL IDEA PARAGRAPHS FROM PRODUCTION, 2026-09-21:
//
//   contain an uncertainty marker (idk / don't know / not sure) ...... 11
//   ALSO name two candidate subjects with "or" ........................ 2
//
// The two look like this, verbatim:
//
//   "...idk if that's a story about the work or about why handmade even matters"
//
// She is not being vague. She has done the hardest part — seen that her
// paragraph holds two videos and named both — and the build then picks one
// silently. When it picks the one she did not mean, the first she learns of it
// is a finished script about the wrong subject.
//
// ⚖️ ONLY WHEN SHE NAMED THEM, WHICH IS THE WHOLE DESIGN. The other nine
// paragraphs say "idk" without naming alternatives. Asking "which is this
// about?" there would mean OFFERING OPTIONS WE INVENTED — a menu of subjects
// she never proposed, presented as if it came from her. That is the fabrication
// this codebase refuses everywhere else, and it is not worth a wider net.
//
// ⚖️ AND THE OPTIONS ARE HER SENTENCE, NOT A SUMMARY. The same rule the product
// picker states for its own labels: "their own names, not a summary — a
// paraphrase here would be a second name for one thing."

/** How far past the uncertainty marker we will look for the alternatives.
 *  Beyond this the "or" is more likely to belong to a different clause. */
const CLAUSE_WINDOW = 170

const UNCERTAIN = /\b(?:idk|i\s*don'?t\s*know|not\s+sure|unsure|no\s+idea)\b/i

/** Below this a fragment is not a subject a video could be about. */
const MIN_WORDS = 2
const MAX_WORDS = 14

const words = (s: string): number => s.split(/\s+/).filter(Boolean).length

function tidy(raw: string): string {
  return raw
    .replace(/^[\s,;:—-]+/, '')
    .replace(/[\s,;:.!?—-]+$/, '')
    // A trailing hedge is not part of the subject she named.
    .replace(/\b(?:or\s+something|i\s*guess|maybe)\s*$/i, '')
    .trim()
}

export interface NamedAlternatives {
  /** Her two candidate subjects, in her own words, in the order she wrote them. */
  readonly options: readonly [string, string]
  /** The clause they were taken from, so a caller can show what it read. */
  readonly clause: string
}

/**
 * The two subjects a creator named when they said they were not sure which
 * their paragraph was about — or `null` when they named none.
 *
 * ⚠️ NULL IS THE COMMON ANSWER AND THE CORRECT ONE. Returning a guess here
 * would put a question on screen whose options nobody proposed.
 */
export function namedAlternatives(text: unknown): NamedAlternatives | null {
  const s = typeof text === 'string' ? text : ''
  if (s.trim() === '') return null

  const m = UNCERTAIN.exec(s)
  if (!m) return null

  // The clause runs from the marker to the end of her sentence, capped — an
  // "or" three sentences later is not an alternative to this doubt.
  const from = m.index
  const rest = s.slice(from, from + CLAUSE_WINDOW)
  const clause = tidy(rest.split(/(?<![0-9])[.!?](?:\s|$)/)[0] ?? rest)
  if (clause === '') return null

  // ⚠️ THE LAST " or ", NOT THE FIRST. "idk if that's a story about the work or
  // about why handmade matters" splits correctly on its only one; a clause that
  // lists inside its first half ("about the tins and the wax or about why...")
  // must not split on the list.
  const parts = clause.split(/\s+\bor\b\s+/i)
  if (parts.length < 2) return null
  const tail = tidy(parts[parts.length - 1]!)
  const head = tidy(parts.slice(0, -1).join(' or '))
  if (tail === '' || head === '') return null

  // ⚖️ THE HEAD STILL CARRIES HER DOUBT ("idk if that's a story about the
  // work"), and that is not a subject. Strip the framing down to what follows
  // the last "about" / "if it's" / "whether", which is where she starts naming.
  // ⚠️ THE LAST "about", NOT THE FIRST FRAMING WORD. A non-greedy match on
  // "idk if that's a story about the work" stops at "if" and hands back
  // "a story about the work" — her framing, not her subject. Caught by running
  // the real wedding paragraph rather than an invented one, and the same slip
  // let "about the wedding order or about the wedding order" through as two
  // different answers.
  const lastAbout = /^.*\babout\b\s+(.+)$/i.exec(head)
  const framed = lastAbout
    ?? /\b(?:whether|if\s+(?:it'?s|that'?s|this\s+is)\s*|is\s+it)\s*(.+)$/i.exec(head)
  const first = tidy(framed?.[1] ?? '')
  const second = tidy(tail.replace(/^\s*(?:about|whether|if)\b\s*/i, ''))
  if (first === '' || second === '') return null

  for (const opt of [first, second]) {
    if (words(opt) < MIN_WORDS || words(opt) > MAX_WORDS) return null
  }
  // Two names for the same thing is not a choice.
  if (first.toLowerCase() === second.toLowerCase()) return null

  return { options: [first, second] as const, clause }
}
