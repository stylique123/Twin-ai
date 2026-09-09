// WHAT SHAPE IS THIS CARD'S CAPTION, AND WHAT THAT IS NOT.
//
// ⚠️⚠️ THE SPEC CALLS THIS `hook_shape`. IT IS NOT ONE, AND NAMING IT THAT WOULD
// BE THE DEFECT THIS CODEBASE KEEPS FINDING. A hook is the SPOKEN OPENING LINE
// of a video. What stage 1a can read for free is the TITLE OR CAPTION, which is
// a different artefact written for a different purpose — often after the fact,
// often by a social manager, often just hashtags. Classifying a caption and
// storing the answer in a column called `hook_shape` would put an inference
// where every downstream reader expects an observation.
//
// ⚖️ SO IT IS NAMED FOR WHAT IT MEASURES AND CARRIES ITS OWN BASIS. A caption
// shape is real evidence — it is chosen by the creator to make someone stop —
// and it correlates with the hook often enough to be worth having. It is simply
// `inferred`, never `observed`, and the type says so, so a reader cannot
// silently promote it.
//
// ── WHAT THE REAL TEXT LOOKS LIKE, SAMPLED BEFORE ANY PATTERN WAS WRITTEN ────
//
// ⚠️ I SAMPLED 45 REAL TITLES FIRST, because writing the patterns from
// imagination is fitting to the answer I expected — the same mistake the goal /
// container ranking made in its first draft, with a ratio threshold chosen by
// eye. What came back:
//
// ⚖️ THAT SENTENCE DELIBERATELY DOES NOT NAME THE MODULE. `check_symbol_readers`
// greps source text and does not strip comments, so naming a symbol here makes
// it report that symbol as having acquired a production reader. Measured: it did
// exactly that, and failed the build demanding a registry entry be removed for a
// function nothing calls. The guard is what should change; a fix is up in its
// own PR, and until that lands this comment works around it rather than
// silently re-triggering it.
//
//   "#fy #fyp #mindset #creator #hustle "                      ← pure hashtags
//   "Beauty of lady  #foryou #viral #capcut #fyp"              ← no shape at all
//   "Dove si nascondono i grandi capitali del futuro..."       ← Italian
//   "Эта крутая бизнес идея взорвала продажи..."               ← Russian
//   "Das wird dir jeder gesunde Mensch bestätigen"             ← German
//   "15 Amazing Phone Functions You Had No Idea Existed"       ← number_promise
//   "Hacking AI is TOO EASY (this should be illegal)"          ← contrarian
//   "What would happen if you didn't drink water?"             ← direct_question
//
// ⚖️ SO MOST CARDS MUST RETURN NOTHING, AND THAT IS THE FEATURE. A classifier
// that labels hashtag soup produces 16,044 confident labels and zero
// information. Silence is the default here exactly as it is in stage 4.
//
// ⚠️ AND HASHTAGS ARE STRIPPED BEFORE MATCHING, NOT AFTER. "#howto" and
// "#top10tips" would otherwise fire the how-to and number patterns on captions
// that are nothing but tags. This was the first thing the sample made obvious.

import type { Assessed } from '../assessed'

/**
 * The shapes a caption can take. Taken from the spec's taxonomy, minus the ones
 * a caption cannot evidence.
 *
 * ⚠️ `confession` AND `stakes_first` ARE DELIBERATELY ABSENT. Both are claims
 * about how a video OPENS — "I've never told anyone this", "you're about to
 * lose the client". A caption saying something confessional does not evidence
 * that the video opened that way, and the whole point of this module is not to
 * assert what it cannot see. They belong to stage 1b, which reads the transcript.
 */
export const CAPTION_SHAPES = [
  'negative_command',
  'number_promise',
  'contrarian_claim',
  'direct_question',
  'myth_bust',
  'curiosity_gap',
  'direct_address',
  'how_to',
] as const
export type CaptionShape = (typeof CAPTION_SHAPES)[number]

/**
 * ⚠️ HASHTAGS, MENTIONS AND URLS COME OUT FIRST. A caption is frequently 80%
 * tags, and every tag is a lowercase run of words with no spaces — which is
 * exactly the shape that produces false positives on every pattern below.
 *
 * ⚖️ EMOJI ARE LEFT IN. They carry no words and cost nothing to ignore, and
 * stripping them by range risks taking legitimate non-Latin text with them.
 */
export function captionBody(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#@][\p{L}\p{N}_]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * ⚠️ NON-LATIN AND NON-ENGLISH TEXT RETURNS NOTHING RATHER THAN A GUESS. The
 * corpus is genuinely multilingual — the 45-title sample held Italian, German,
 * Russian, Romanian and Urdu. Every pattern below is English. Running them over
 * German returns null anyway, but Cyrillic and other scripts are rejected up
 * front so the yield figure is not quietly inflated by text nobody could match.
 *
 * ⚖️ THIS IS A LIMIT, NOT A FILTER ON WHOSE VIDEOS COUNT. It is recorded here
 * so that "we classified 3% of the corpus" is read as "our patterns are English"
 * rather than "97% of cards have no shape".
 */
export function isLikelyEnglish(body: string): boolean {
  if (body.length < 12) return false
  const latin = (body.match(/[a-z]/gi) ?? []).length
  const letters = (body.match(/\p{L}/gu) ?? []).length
  if (letters === 0) return false
  return latin / letters > 0.9
}

/**
 * ⚠️ ORDER MATTERS AND THE MOST SPECIFIC COMES FIRST, exactly as BUCKET_PATTERNS
 * does. "How many photos should I deliver?" is a direct_question AND starts with
 * "how" — question wins, because the question mark is the stronger evidence.
 */
const PATTERNS: ReadonlyArray<{ shape: CaptionShape; test: RegExp }> = [
  // ⚠️ A COUNTED LIST WINS OVER ANYTHING INSIDE IT. Measured false positive:
  // "7 Beauty Products That Women Should Stop Using Immediately" was labelled
  // `negative_command` because "Stop Using" matched mid-string. It is a list of
  // seven things; the imperative is a clause inside it, not the caption's shape.
  { shape: 'number_promise', test: /(^|\s)(\d{1,3})\s+\p{L}+(\s+\p{L}+)?\s+(ideas|ways|tips|things|reasons|mistakes|steps|habits|rules|secrets|hacks|lessons|tools|functions|questions|products|exercises|foods|books|apps)\b/iu },

  // A question mark is the least ambiguous signal a caption offers.
  { shape: 'direct_question', test: /\?\s*$|\?\s+\p{Lu}/u },

  // ⚠️ CONTRARIAN RUNS BEFORE MYTH_BUST. Measured false positive: "nobody talks
  // about how exhausting online shopping actually is" was labelled `myth_bust`
  // on "actually is" when "nobody talks about" is the stronger, more specific
  // signal — and is contrarian, not myth-busting.
  { shape: 'contrarian_claim', test: /\b(too easy|should be illegal|unpopular opinion|hot take|nobody (is )?talk(ing|s) about|no one talks about|everyone (is )?wrong|overrated|underrated)\b/i },

  // ⚠️ NARROWED AFTER MEASUREMENT. The first draft carried `(is|are) wrong` and
  // `actually (is|are|does)`, which labelled "BROO, WHAT IS WRONG WITH HUMANS?!"
  // a myth-bust. That is an exclamation. A myth-bust has to NAME the false
  // belief it is correcting, so the pattern now requires a word that does.
  { shape: 'myth_bust', test: /\b(myths?|misconception|debunk\w*|lying to you|is a lie|no one tells you|nobody tells you|(that'?s|thats) wrong|you'?ve been (doing|told))\b/i },

  { shape: 'negative_command', test: /^\s*(stop|never|don'?t|quit|avoid|delete|throw away)\b/i },
  { shape: 'how_to', test: /^\s*how to\b|\bhow i (built|made|grew|got|scaled|went)\b/i },
  { shape: 'curiosity_gap', test: /\b(you (had )?no idea|you won'?t believe|what happen(s|ed) (if|when)|this is why|here'?s why|the real reason)\b/i },
  { shape: 'direct_address', test: /^\s*(send this to|tag (a|your)|if you'?re a\b|to everyone who)\b/i },
]

export interface CaptionShapeRead {
  shape: CaptionShape
  /** The fragment that matched. ⚠️ A FRAGMENT, NEVER THE CAPTION — see below. */
  evidence: string
}

/**
 * ⚠️⚠️ THE EVIDENCE IS A MATCHED FRAGMENT, CAPPED, NEVER THE SENTENCE. This is
 * the one place in this module where a source's own words could leak into the
 * store, and the whole corpus rule is "store the shape, never the words". A
 * fragment like "15 amazing phone functions" is what fired the pattern; the
 * caption it came from is not kept, and check_corpus_stores_no_sentences.mjs
 * fails the build if a stored field ever holds a full source sentence.
 *
 * ⚖️ AND IT IS CAPPED AT 48 CHARACTERS. A regex could in principle match a long
 * run; the cap makes "the evidence is a fragment" a property of the code rather
 * than a promise about the patterns.
 */
const EVIDENCE_MAX = 48

export function classifyCaption(raw: unknown): CaptionShapeRead | null {
  const body = captionBody(raw)
  if (!isLikelyEnglish(body)) return null
  for (const { shape, test } of PATTERNS) {
    const m = body.match(test)
    if (m === null) continue
    return { shape, evidence: m[0].trim().slice(0, EVIDENCE_MAX) }
  }
  return null
}

/**
 * The same read, wrapped so a downstream reader cannot mistake it for an
 * observation of the video's actual hook.
 *
 * ⚖️ `inferred`, ALWAYS. There is no path through this module that produces
 * `observed` — that would require reading the spoken opening, which is stage 1b.
 */
export function assessedCaptionShape(raw: unknown, at: string): Assessed<CaptionShape> | null {
  const read = classifyCaption(raw)
  if (read === null) return null
  return {
    basis: 'inferred',
    value: read.shape,
    evidence: `caption reads "${read.evidence}"`,
    assessedAt: at,
  }
}
