// A NOUN WHERE THE VERB WAS ALREADY IN THE SAME SCRIPT.
//
// ⚠️ THE OWNER'S RULE, AND ITS ELEGANCE IS THAT PRESENCE IS THE ORACLE:
// "Ban a noun when the verb form is already in the same script or in her
// vocabulary. Keep a noun when no verb form exists."
//
// So there is NO blocklist and NO dictionary. `repairability` is flagged only
// because `repair` is actually there; `visibility` is not flagged, because
// nothing in the script or her vocabulary says `vis`. That is what makes this
// checkable rather than a curated list somebody has to maintain — and it is why
// "Oxford hollow", "saddle stitch", "signatures" and "tannage" survive
// untouched: none of them has a stem that appears anywhere as a verb.
//
// ⚠️⚠️ AND HALF THE OWNER'S RULING CANNOT BE BUILT THIS WAY. Two examples were
// given and they are different mechanisms:
//
//   "Repairability" banned because "repair" is right there   -> MORPHOLOGICAL
//   "Durability" banned because "lasts" is available         -> A SYNONYM
//
// `durability` does not contain `last`. Reaching it needs a synonym map —
// durability→last, simplicity→simple, retention→keep — which is precisely the
// "curated list someone maintains" the ruling rejects, or a model call. So THIS
// FILE BUILDS THE MORPHOLOGICAL HALF ONLY, and the synonym half is named here
// rather than silently half-done or quietly widened into a list.
//
// ⚖️ WHICH HALF IS THE BIGGER ONE IS A MEASUREMENT, NOT A GUESS, and it is
// reported with this change rather than asserted.

/**
 * Suffixes that turn a verb into an abstraction, with how to get back.
 *
 * ⚠️ EACH YIELDS CANDIDATE STEMS, NEVER ONE ANSWER. English drops a silent `e`
 * on the way in — `use` becomes `usability`, `move` becomes `movement` — so both
 * the bare stem and the stem plus `e` are tried. A candidate only counts if it
 * is actually PRESENT, so an over-generous candidate list costs nothing: a wrong
 * stem simply never matches.
 */
const NOMINAL_SUFFIXES: ReadonlyArray<{ suffix: string; minStem: number }> = [
  // ⚠️⚠️ THIS LIST WAS TWICE THIS LONG AND THE MEASUREMENT REJECTED IT. Run
  // against 60 real shipped scripts, the first version flagged 65% of them and
  // the failures were not marginal:
  //
  //   sentence   -> sent        (-ence)  "sentence" is not from "send"
  //   comment    -> comes       (-ment)  stem "com" + e
  //   reality    -> real        (-ity)   an adjective, not a verb
  //   mechanical -> mechanics   (-al)    an adjective, not a nominalisation
  //   position   -> posing      (-ition) etymology, not usage
  //
  // The owner's test is "if it flags anything in the eight good scripts, the
  // rule is wrong". These would flag ANY script, so they were wrong before
  // reaching that set. `-ence`, `-ance`, `-ity`, `-al`, `-ition`, `-sion` and
  // bare `-tion` are all GONE, and `-ment` now needs a four-letter stem, which
  // is what kills "comment" while keeping "placement", "attachment" and
  // "alignment".
  //
  // ⚖️ WHAT SURVIVES IS THE SET THAT ONLY EVER NOMINALISES A VERB. Longest
  // first, so `-ability` is not consumed by a shorter match.
  { suffix: 'ability', minStem: 3 },
  { suffix: 'ibility', minStem: 3 },
  { suffix: 'isation', minStem: 3 },
  { suffix: 'ization', minStem: 3 },
  { suffix: 'ation', minStem: 3 },
  { suffix: 'ement', minStem: 4 },
  { suffix: 'ment', minStem: 4 },
]

/**
 * ⚠️ BARE `-tion` IS NOT A SUFFIX ENTRY, BUT `-ption` IS HANDLED. "subscription"
 * really is from "subscribe" and "absorption" from "absorb", and that transform
 * is unambiguous. Keeping the general `-tion` rule to reach them cost
 * "position -> posing", which is why only the `p`->`be` case survives.
 */
const PTION = /^(.*p)tion$/

/**
 * ⚠️ NOT A SUFFIX LIST ENTRY: `-ness` IS DELIBERATELY ABSENT. It nominalises an
 * ADJECTIVE, not a verb — `darkness` from `dark`, `thickness` from `thick` — and
 * the rule is about a noun standing where a VERB was available. Including it
 * would flag `thickness` whenever `thick` appears, which is a different and
 * unsanctioned judgement about her writing.
 */
export const EXCLUDED_SUFFIX = 'ness'

/** The stems a nominalisation could have come from. */
export function candidateStems(word: string): string[] {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  const out: string[] = []
  const p = w.match(PTION)
  if (p && p[1] && p[1].length >= 4) out.push(`${p[1].slice(0, -1)}be`)
  for (const { suffix, minStem } of NOMINAL_SUFFIXES) {
    if (!w.endsWith(suffix)) continue
    const base = w.slice(0, w.length - suffix.length)
    if (base.length < minStem) continue
    // ⚠️ `-isation`/`-ization` REACH THE VERB, NOT THE BARE STEM. "realization"
    // strips to "real", which is an ADJECTIVE — and the measurement caught it
    // flagging `realization -> real`. The verb is "realize"/"realise", so those
    // are the candidates and the bare stem is deliberately not one.
    if (suffix === 'isation' || suffix === 'ization') {
      out.push(`${base}ize`, `${base}ise`, `${base}izes`, `${base}ises`)
      break
    }
    out.push(base, `${base}e`)
    // `-ation` on a verb ending in `-ate`: creation -> create, not "creat".
    if (suffix === 'ation') out.push(`${base}ate`)
    break // longest suffix wins; do not also strip a shorter one
  }
  return out
}


/** Every word in a text, lowercased, letters only. */
function wordsOf(text: string): string[] {
  return (text.toLowerCase().match(/[a-z']+/g) ?? []).map((w) => w.replace(/'/g, ''))
}

/**
 * The inflections a verb stem appears as. `repair` may show up as `repairs`,
 * `repaired` or `repairing`, and any of those proves the verb was available.
 */
function inflectionsOf(stem: string): string[] {
  const base = stem.endsWith('e') ? stem.slice(0, -1) : stem
  return [stem, `${stem}s`, `${stem}ed`, `${stem}ing`, `${base}ing`, `${base}ed`, `${base}es`]
}

export interface Nominalisation {
  /** The noun as written, verbatim, so she can find it. */
  readonly word: string
  /** The verb form that was already available. */
  readonly verbAvailable: string
  /** Where the verb was found. */
  readonly foundIn: 'script' | 'vocabulary'
}

export const MAX_FINDINGS = 12

/**
 * Nouns in `script` whose verb form is already present in the script or in her
 * vocabulary.
 *
 * ⚖️ AN EMPTY RESULT IS THE EXPECTED RESULT. The eight scripts that worked
 * contain none of these, which is what makes them the validation set: a rule
 * that fires on a script the owner called good is a wrong rule, not a strict one.
 */
export function nominalisationsIn(
  script: unknown,
  vocabulary: ReadonlyArray<string> = [],
): Nominalisation[] {
  if (typeof script !== 'string' || script.trim() === '') return []
  const scriptWords = new Set(wordsOf(script))
  const vocabWords = new Set(vocabulary.flatMap((v) => wordsOf(String(v))))
  const seen = new Set<string>()
  const out: Nominalisation[] = []
  for (const raw of script.match(/[A-Za-z']+/g) ?? []) {
    const w = raw.toLowerCase().replace(/'/g, '')
    if (w.endsWith(EXCLUDED_SUFFIX)) continue
    if (seen.has(w)) continue
    for (const stem of candidateStems(w)) {
      // ⚠️ THE STEM MUST NOT BE THE WORD ITSELF. `station` strips to `stat`,
      // and if a script also says `state` that is not a verb it replaced.
      // Requiring a real inflection keeps the evidence honest.
      const found = inflectionsOf(stem).find((f) => f !== w && (scriptWords.has(f) || vocabWords.has(f)))
      if (!found) continue
      seen.add(w)
      out.push({
        word: raw,
        verbAvailable: found,
        foundIn: scriptWords.has(found) ? 'script' : 'vocabulary',
      })
      break
    }
    if (out.length >= MAX_FINDINGS) break
  }
  return out
}
