// THE COUNT IS THE FORMAT, AND NOTHING WAS HOLDING IT.
//
// §5d, from the second reference run. An enumerated Short of FIVE produced one
// plan carrying three different counts, none of them five:
//
//   Reference        five ways
//   YOUR VIDEO IDEA  "the top THREE pieces of common business advice"
//   Hook option 3    "these exact THREE pieces"
//   The script       "The FIRST way…", "The SECOND way…", then scene 4 is a
//                    silent shot and the enumeration simply stops
//
// So the creator walks on camera, promises three, counts to two, and goes quiet.
// The person who notices is the viewer, who was counting.
//
// ── WHY THIS IS THE WORST DEFECT ON THE BOARD ─────────────────────────────
//
// An enumerated list is not a stylistic feature of that reference — it IS the
// mechanism. A numbered promise is what holds a viewer through forty-five
// seconds, because each item pays a debt and opens the next one. Transferring
// the reference's TONE while dropping its SPINE is a more complete failure than
// transferring nothing: a script with no count is merely flat, while a script
// that announces a count and abandons it BREAKS OUT LOUD, on camera, in front of
// the audience. It is the only defect in the plan the creator cannot hide.
//
// ── WHY A CONTRACT CHECK AND NOT A PROMPT RULE ────────────────────────────
//
// The same argument `sceneConsistency.ts` makes, and the same one its
// `palette_leak` check proved: a defect decidable by LOOKING AT THE OBJECT is
// decided here, once, by code that cannot have an off day. "Keep the count
// consistent" is already implicit in every enumerated script we ask for, and the
// model agreed with it right up until it didn't.
//
// Counting is decidable. So this counts.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────
//
// It does not parse arbitrary numbers out of prose. "$46 million" and "2026" are
// numbers in a script and neither is an enumeration, and a general number
// scanner would spend its life mistaking revenue for a list.
//
// Instead the reference's own count is the AUTHORITY — extracted during the read
// as a fact about the reference (`ReferenceMechanism`) — and everything
// downstream is checked AGAINST it. That inverts the problem from "what number
// did the model mean" to "does this text carry the number it owes", which is a
// question with an answer.

/** Small integers a short-form list can plausibly enumerate. Above twelve, a
 *  "list" is a montage and the count stops being a promise anyone tracks; below
 *  two it is not a list at all. */
const MIN_COUNT = 2
const MAX_COUNT = 12

/** Number words, for counts written out. `1`–`12` covers every enumerated short
 *  this system will meet; a video promising thirteen things has other problems. */
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
}

/** Ordinals, for detecting DELIVERY: "the first way…", "second…", "finally".
 *  `finally` and `last` are counted as terminal markers rather than positions —
 *  see `deliveredItemCount`. */
const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
}

/**
 * THE MECHANISM, AS DATA — extracted during the reference read.
 *
 * Today the read produces `format_label`, `why_it_works` and a `retention_map`:
 * prose the writer is asked to follow in the general direction of. None of it
 * survives as a checkable fact, which is why nothing noticed the count change
 * three times.
 */
export interface ReferenceMechanism {
  /** Does the reference enumerate, and how many items does it promise? */
  enumeration: {
    isEnumerated: boolean
    /** The promised count. Null when the reference does not enumerate, and null
     *  is NOT zero — an unenumerated reference has no count to keep. */
    count: number | null
    /** What is being counted, in the reference's own words: "ways", "mistakes",
     *  "things I stopped buying". Carried so the script can promise the same
     *  KIND of thing, not merely the same number. */
    unit: string | null
  }
  /** What the hook promises the viewer, in one line. For an enumerated
   *  reference this is where the count is MADE — "here are the 5 ways" is the
   *  contract the rest of the video pays off. */
  hookPromise: string | null
  /** Which item the mid-video re-hook lands after, 1-based. Null when the
   *  reference has no re-hook, which is a fact and not a gap. */
  rehookAfterItem: number | null
  /** What each beat owes the next — the debts that make a list feel like a
   *  sequence rather than a pile. One entry per beat, in order. */
  beatDebts: string[]
}

export function emptyMechanism(): ReferenceMechanism {
  return {
    enumeration: { isEnumerated: false, count: null, unit: null },
    hookPromise: null,
    rehookAfterItem: null,
    beatDebts: [],
  }
}

/** Read a mechanism back defensively. Anything unreadable degrades to "not
 *  enumerated", which withholds the check rather than inventing a count —
 *  the same direction `showability` degrades in, and for the same reason: a
 *  fabricated count would fail every script against a number nobody promised. */
export function readMechanism(raw: unknown): ReferenceMechanism {
  const out = emptyMechanism()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const src = raw as Record<string, unknown>
  const enumSrc = (src.enumeration ?? {}) as Record<string, unknown>
  const count = coerceCount(enumSrc.count)
  // ⚠️ THE FLAG ARRIVES AS THE STRING "true", NOT THE BOOLEAN.
  //
  // `generate-blueprint`'s response schema types every mechanism field as
  // STRING, and its prompt asks for `is_enumerated: "true"` in quotes. Reading
  // only the boolean meant this was `false` on every real generation, so the
  // whole count contract was withheld from precisely the plans it was written
  // for — the module's own `creative_transfer_plans` warning, earned: the
  // validator was wired, and it was reading a shape the producer never emits.
  // Found by writing the first test that fed it the generator's actual output.
  //
  // ⚖️ Only an explicit true reads as true. A missing flag, "false", "maybe" or
  // a stray object all stay not-enumerated, because a fabricated count would
  // fail every script against a number nobody promised.
  const flag = enumSrc.is_enumerated ?? enumSrc.isEnumerated
  const isEnumerated = flag === true
    || (typeof flag === 'string' && flag.trim().toLowerCase() === 'true')
  out.enumeration = {
    // AN ENUMERATION WITHOUT A COUNT IS NOT ONE. The flag and the number have to
    // agree or the check has a promise it cannot verify, which is worse than no
    // check because it reads as verified.
    isEnumerated: isEnumerated && count !== null,
    count: isEnumerated ? count : null,
    unit: text(enumSrc.unit),
  }
  out.hookPromise = text(src.hook_promise ?? src.hookPromise)
  out.rehookAfterItem = coerceCount(src.rehook_after_item ?? src.rehookAfterItem)
  const debts = src.beat_debts ?? src.beatDebts
  out.beatDebts = Array.isArray(debts)
    ? debts.filter((d): d is string => typeof d === 'string' && d.trim() !== '').map((d) => d.trim())
    : []
  return out
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/** A count is a small integer or its word. Anything else is not a count we can
 *  hold a script to. */
function coerceCount(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v >= MIN_COUNT && v <= MAX_COUNT) return v
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase()
    const word = NUMBER_WORDS[t]
    if (word !== undefined && word >= MIN_COUNT && word <= MAX_COUNT) return word
    const n = Number(t)
    if (Number.isInteger(n) && n >= MIN_COUNT && n <= MAX_COUNT) return n
  }
  return null
}

// ---------------------------------------------------------------------------
// READING COUNTS OUT OF TEXT
// ---------------------------------------------------------------------------

/**
 * Does this text carry the number `n`, as a digit or as a word?
 *
 * Word-boundary anchored, so `5` does not match inside `2025` and `one` does not
 * match inside `money`. That second case is not hypothetical — "money", "gone"
 * and "someone" all contain `one`, and a naive `includes` would report that
 * every hook already carries the count.
 */
export function containsCount(textValue: string | null | undefined, n: number): boolean {
  if (!textValue || n < MIN_COUNT || n > MAX_COUNT) return false
  const word = Object.keys(NUMBER_WORDS).find((k) => NUMBER_WORDS[k] === n)
  const digit = new RegExp(`(?<![\\d.,])${n}(?![\\d.,])`)
  if (digit.test(textValue)) return true
  return word ? new RegExp(`\\b${word}\\b`, 'i').test(textValue) : false
}

/**
 * Every small integer this text states, as digits or words.
 *
 * Used ONLY to detect DISAGREEMENT between artifacts that should all carry the
 * same promise — never to decide what the count is. A number appearing in a
 * script line is not evidence of an enumeration; a DIFFERENT number appearing
 * where the promised one should be is evidence of a broken one.
 */
export function countsIn(textValue: string | null | undefined): number[] {
  if (!textValue) return []
  const found = new Set<number>()
  for (const m of textValue.matchAll(/(?<![\d.,])(\d{1,2})(?![\d.,])/g)) {
    const n = Number(m[1])
    if (n >= MIN_COUNT && n <= MAX_COUNT) found.add(n)
  }
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    if (n < MIN_COUNT) continue
    if (new RegExp(`\\b${word}\\b`, 'i').test(textValue)) found.add(n)
  }
  return [...found].sort((a, b) => a - b)
}

/** A script beat, reduced to what the count contract needs. */
export interface MechanismScriptBeat {
  /** The section label, e.g. "Hook", "Item 1", "Payoff". */
  section: string
  /** The spoken words. Null or empty means a SILENT beat. */
  line: string | null
}

/**
 * How many enumerated items the script actually DELIVERS.
 *
 * Counted from ordinal markers in the spoken lines — "the first way", "second",
 * "number three" — because that is what a viewer counts. A beat that merely
 * exists is not a delivered item; a beat that says "second" is.
 *
 * THE HIGHEST ORDINAL REACHED, not the number of ordinal-bearing beats. A script
 * that says "first" twice has a different defect from one that stops at two, and
 * conflating them would report the wrong failure. `finally` and `last` are
 * terminal markers: they close the enumeration wherever it had got to, which is
 * exactly how a human hears them.
 */
export function deliveredItemCount(beats: readonly MechanismScriptBeat[]): number {
  let highest = 0
  for (const b of beats) {
    const line = b.line?.trim()
    if (!line) continue
    for (const [word, n] of Object.entries(ORDINAL_WORDS)) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(line) && n > highest) highest = n
    }
    // "number 3", "#3", "3." at the start of a clause — digits used as ordinals.
    for (const m of line.matchAll(/(?:\bnumber\s+|#)(\d{1,2})\b/gi)) {
      const n = Number(m[1])
      if (n >= 1 && n <= MAX_COUNT && n > highest) highest = n
    }
  }
  return highest
}

// ---------------------------------------------------------------------------
// THE CONTRACT
// ---------------------------------------------------------------------------

export type MechanismIssueCode =
  /** The hook does not carry the number it promises. */
  | 'hook_drops_count'
  /** Two artifacts state different counts. */
  | 'count_disagreement'
  /** The script announces N and delivers fewer. */
  | 'undelivered_count'
  /** A silent beat sits inside the enumeration, breaking the run. */
  | 'silent_scene_in_enumeration'

export interface MechanismIssue {
  code: MechanismIssueCode
  /** Which artifact carries the fault, so a caller can regenerate just that
   *  part rather than discarding the whole blueprint. */
  field: 'hook_options' | 'concept' | 'script'
  /** Plain sentence, written to be read by a person deciding what to do. */
  detail: string
}

export interface CountContractInput {
  mechanism: ReferenceMechanism
  /** `concept.premise` — the one-line video idea. */
  idea?: string | null
  /** `hook_options`, in order. The first is the recommended pick. */
  hooks?: readonly string[]
  /** `script`, in order. */
  beats?: readonly MechanismScriptBeat[]
}

/**
 * Every way this plan breaks the reference's count promise.
 *
 * RETURNS EMPTY WHEN THE REFERENCE DOES NOT ENUMERATE, and that is the common
 * case. This check has an opinion about enumerated formats and no opinion about
 * anything else — a teardown or a myth-bust owes no number, and inventing a
 * complaint for them would train whoever reads these to ignore all of them.
 */
export function countContractIssues(input: CountContractInput): MechanismIssue[] {
  const { enumeration } = input.mechanism
  const promised = enumeration.count
  if (!enumeration.isEnumerated || promised === null) return []

  const issues: MechanismIssue[] = []
  const hooks = input.hooks ?? []
  const beats = input.beats ?? []

  // 1. THE HOOK MUST CARRY THE NUMBER.
  //
  // Confirmed on the real run: not one of the five generated hook options named
  // five. The hook is where an enumerated promise is MADE, so a hook that drops
  // the number has already broken the format before scene 2 exists. The count is
  // not decoration on the script; it is the hook's payload.
  //
  // Checked on the RECOMMENDED hook specifically — `hook_options[0]`, the one
  // `normalizeHookLine` writes into the opening beat. A count sitting in option
  // four is a count nobody says.
  const recommended = hooks[0]
  if (hooks.length > 0 && !containsCount(recommended, promised)) {
    issues.push({
      code: 'hook_drops_count',
      field: 'hook_options',
      detail: `The reference promises ${promised}${enumeration.unit ? ` ${enumeration.unit}` : ''},`
        + ' and the recommended hook does not say the number. The hook is where an'
        + ' enumerated promise is made — without it the format is gone before the'
        + ' second beat.',
    })
  }

  // 2. EVERY COUNT MUST AGREE.
  //
  // Three independent numbers in one plan means nothing owns the count. The idea
  // is checked rather than the whole script because that is where the run's
  // wrong number appeared, and because a script line may legitimately contain a
  // small number that is not the enumeration.
  for (const other of countsIn(input.idea)) {
    if (other !== promised) {
      issues.push({
        code: 'count_disagreement',
        field: 'concept',
        detail: `The video idea says ${other} where the reference promises ${promised}.`
          + ' Two numbers in one plan means nothing owns the count.',
      })
      break
    }
  }

  // 3. ANNOUNCED N MUST BE DELIVERED.
  //
  // Announcing three and shipping two is malformed, not merely weak. The viewer
  // is counting; that is what an enumeration asks them to do.
  const delivered = deliveredItemCount(beats)
  if (beats.length > 0 && delivered < promised) {
    issues.push({
      code: 'undelivered_count',
      field: 'script',
      detail: `The script promises ${promised} and delivers ${delivered}.`
        + ' A script that announces a count and abandons it breaks out loud, on'
        + ' camera, in front of the audience.',
    })
  }

  // 4. NO SILENT BEAT WHILE THE ENUMERATION IS STILL OWED.
  //
  // Scene 4 of the real run was a silent shot that arrived after item 2, with
  // items 3, 4 and 5 still outstanding — and that is precisely how "three"
  // became "two". The enumeration did not resume after it.
  //
  // ⚖️ "BETWEEN TWO ITEMS" IS THE WRONG RULE, and it was the first one written
  // here. It looks right and it misses the actual defect: the run's silent beat
  // came AFTER the last item that ever appeared, so no pair of items bracketed
  // it. The enumeration was not interrupted between two delivered items — it was
  // abandoned, and the silence is where.
  //
  // So the region is "the count is still open": after the first item, and before
  // the promised number has been reached. A silent beat BEFORE the first item is
  // an opening visual and breaks nothing; one AFTER the count is complete is a
  // closing card and breaks nothing.
  const firstItem = beats.findIndex((b) => hasOrdinal(b.line))
  if (firstItem !== -1) {
    let seen = 0
    for (let i = firstItem; i < beats.length; i++) {
      const line = beats[i].line?.trim()
      if (line) {
        const n = highestOrdinalIn(line)
        if (n > seen) seen = n
        continue
      }
      // Silent. If the promise is already paid, this is a closing beat.
      if (seen >= promised) break
      issues.push({
        code: 'silent_scene_in_enumeration',
        field: 'script',
        detail: `Beat ${i + 1} ("${beats[i].section}") is silent while ${promised - seen} of`
          + ` ${promised} items are still owed. A silent beat inside an open enumeration`
          + ' breaks the run the viewer is counting — it is where the count gets dropped.',
      })
      break
    }
  }

  return issues
}

function hasOrdinal(line: string | null | undefined): boolean {
  if (!line?.trim()) return false
  for (const word of Object.keys(ORDINAL_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(line)) return true
  }
  return /(?:\bnumber\s+|#)\d{1,2}\b/i.test(line)
}

/** The highest ordinal position stated in one line, or 0. */
function highestOrdinalIn(line: string): number {
  let highest = 0
  for (const [word, n] of Object.entries(ORDINAL_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(line) && n > highest) highest = n
  }
  for (const m of line.matchAll(/(?:\bnumber\s+|#)(\d{1,2})\b/gi)) {
    const n = Number(m[1])
    if (n >= 1 && n <= MAX_COUNT && n > highest) highest = n
  }
  return highest
}

/**
 * The instruction the writer gets, built FROM the mechanism record rather than
 * written in its general direction.
 *
 * Empty for an unenumerated reference — a format that owes no number must not be
 * handed one, which would be the mirror-image failure of dropping it.
 */
export function mechanismPromptLine(m: ReferenceMechanism): string {
  const { isEnumerated, count, unit } = m.enumeration
  if (!isEnumerated || count === null) return ''
  const noun = unit ?? 'items'
  return [
    `\n- THE REFERENCE IS AN ENUMERATED LIST OF ${count} ${noun.toUpperCase()}. That count is the format's spine, not a detail.`,
    `  * The recommended hook (hook_options[0]) MUST say the number ${count}.`,
    `  * The video idea MUST say ${count}. No other number may appear as the count.`,
    `  * The script MUST deliver all ${count} items, each explicitly marked ("the first…", "the second…").`,
    '  * No silent beat may sit between two items. A silent shot inside the run breaks the count the viewer is tracking.',
    m.rehookAfterItem !== null
      ? `  * The reference re-hooks after item ${m.rehookAfterItem}; place a re-hook there.`
      : '',
  ].filter(Boolean).join('\n')
}

// ---------------------------------------------------------------------------
// THE WIRING — a blueprint in, its broken promises out
// ---------------------------------------------------------------------------

/** The shape this needs from a `Blueprint`, named structurally so the module
 *  stays independent of `types.ts` and testable without one. */
export interface BlueprintCountView {
  reference_read?: { mechanism?: unknown } | null
  concept?: { premise?: string | null } | null
  hook_options?: readonly string[] | null
  script?: readonly { section?: string | null; line?: string | null }[] | null
}

/**
 * Run the count contract over a whole blueprint.
 *
 * THIS IS THE WIRING, and it is the point of the module. §5d's own warning is
 * that an unwired validator is the `creative_transfer_plans` trap — a table, a
 * contract and a careful semantic validator that nothing ever writes to. So the
 * check has a caller in the same change that introduces it.
 *
 * Returns empty for every blueprint generated before the mechanism existed:
 * `readMechanism` degrades an absent record to not-enumerated, which withholds
 * the check. That is deliberate and is the difference between "we never
 * measured it" and "this reference does not enumerate" — the first must not be
 * reported as the second, and neither may fail a script against a number nobody
 * promised.
 */
export function blueprintCountIssues(bp: BlueprintCountView | null | undefined): MechanismIssue[] {
  if (!bp) return []
  let mechanism = readMechanism(bp.reference_read?.mechanism)
  const hookList = (bp.hook_options ?? []).filter((h): h is string => typeof h === 'string' && h.trim() !== '')

  // ⚠️ A COUNT THE WRITER INVENTED IS STILL A PROMISE TO THE VIEWER.
  //
  // The contract gated entirely on the REFERENCE being enumerated, so a plan
  // whose mechanism read said `is_enumerated: false` and whose hook then said
  // "these are the 4 common mistakes" was checked by nothing at all. Found in a
  // 36-run matrix: that run happened to deliver all four, so it cost nothing —
  // but it would have been equally silent had it delivered two, which is the
  // defect this module exists for, arriving through a door it did not watch.
  //
  // ⚖️ Only an UNAMBIGUOUS self-promise counts. If the recommended hook names
  // exactly one plausible list size, that is the number the audience heard and
  // the script owes it. Two numbers in a hook is not a promise anyone tracked,
  // and inventing a contract out of an ambiguous line would fail good scripts.
  if (!mechanism.enumeration.isEnumerated && hookList.length > 0) {
    const promised = countsIn(hookList[0])
    if (promised.length === 1) {
      mechanism = {
        ...mechanism,
        enumeration: { isEnumerated: true, count: promised[0], unit: mechanism.enumeration.unit },
      }
    }
  }

  return countContractIssues({
    mechanism,
    idea: bp.concept?.premise ?? null,
    hooks: hookList,
    beats: (bp.script ?? []).map((b) => ({
      section: typeof b.section === 'string' ? b.section : '',
      line: typeof b.line === 'string' ? b.line : null,
    })),
  })
}

/**
 * Is this plan safe to hand to someone about to film it?
 *
 * `undelivered_count` and `silent_scene_in_enumeration` are the two that reach
 * the CAMERA: the creator says a number and then cannot pay it. The other two
 * are wrong in the artifact and recoverable by editing text before recording, so
 * they are surfaced rather than treated as blocking.
 */
export function breaksOnCamera(issues: readonly MechanismIssue[]): boolean {
  return issues.some((i) => i.code === 'undelivered_count' || i.code === 'silent_scene_in_enumeration')
}

// ── THE UNIT IS CONTENT, AND IT TRANSFERRED AS A WORD ─────────────────────
//
// In the cross-paired run, a tech reference's unit arrived as the generic
// "items" and rode unchanged into a science explainer and two business
// creators:
//
//     "3 critical items that business owners need to implement"
//     "3 essential items that every aspiring entrepreneur needs"
//
// Neither is a promise anybody can want. The COUNT is structure and transfers;
// the UNIT names what is being counted and is content, so "we copy STRUCTURE,
// never content" was being broken in the one field the count makes mandatory.
// Two of five cases re-derived it correctly ("mistakes", "things I stopped
// buying"), so this is a pattern rather than a certainty.
//
// ⚖️ A SMELL, NOT A FATALITY, AND THE DIFFERENCE DECIDES THE HANDLING. An
// undelivered count is wrong on camera and can be proven wrong. A weak unit is a
// judgement — "tips" and "mistakes" are both real nouns, and only a closed list
// of genuinely contentless ones is decidable. So this is REPORTED, never
// blocking: a check that guesses at quality and refuses on the guess would
// throw away good plans, which costs more than the thing it prevents.

/** Nouns that name nothing. Deliberately tiny — every entry has to be a word
 *  that could be deleted from the promise without losing meaning. "tips",
 *  "mistakes", "signs" and "habits" are NOT here: they are real categories. */
const CONTENTLESS_UNITS = new Set(['item', 'items', 'thing', 'things', 'stuff', 'point', 'points'])

/** Is this enumeration unit contentless? Absent is not — an unstated unit is a
 *  different fact from an empty one, and only a stated one can be judged. */
export function isContentlessUnit(unit: string | null | undefined): boolean {
  if (typeof unit !== 'string') return false
  const w = unit.trim().toLowerCase()
  return w !== '' && CONTENTLESS_UNITS.has(w)
}

/**
 * A COUNT ATTACHED TO A NOUN THAT NAMES NOTHING — measured in the spoken line.
 *
 * ⚠️ `isContentlessUnit` above reads `enumeration.unit`, which is a READ OF THE
 * REFERENCE, and two matrices showed that is the wrong place to look. Across 36
 * runs the unit field was contentless 9 times while only 5 hooks actually said
 * anything generic aloud — a faithful read of a reference that really does count
 * "items" was being flagged, and the harm is not in the field. The harm is:
 *
 *     "You don't need money or a mentor to start a business, you just need
 *      these 3 things."
 *
 * That hook promises a number and nothing else. One creator produced it at all
 * three fidelities, so it is not a stray sample.
 *
 * ⚖️ THIS IS WHY THE PROMPT RULE WAS THE WRONG TOOL. A rule was added telling the
 * writer to re-derive the unit; two matrices say it did not work. A count next to
 * a contentless noun is decidable by looking at the sentence, so it is decided
 * here — the fifth time on this branch that a check has succeeded where asking
 * harder failed.
 */
/**
 * ⚖️ THE TELL IS A TERMINAL NOUN, NOT THE NOUN ITSELF — and its own fixtures
 * taught it that. The first version flagged any count next to "things", which
 * condemned "Three things I stopped buying after I turned 30" — the very
 * reference this work started from, and a promise anyone can want. The word is
 * not the problem; the problem is a count of a contentless noun that NOTHING
 * QUALIFIES before the sentence ends:
 *
 *     "you just need these 3 things."      nothing follows — promises nothing
 *     "3 things I stopped buying"          the clause carries the meaning
 *
 * So this fires only when the noun is terminal: end of string, or a clause
 * boundary. Narrow on purpose. A check that condemns good hooks trains whoever
 * reads its output to ignore all of it, which costs more than the miss.
 *
 * ⚠️ MEASURED ON THE CORPUS, not asserted. Replayed over all 180 hooks the
 * 36-run matrix produced: 2 dropped, and NO run left without a usable hook. The
 * broader "any count next to a contentless noun" version would have taken 5 —
 * the other three being "3 things that look totally boring now, but…" and "3
 * items you absolutely need to get your first customers", both of which are
 * carried by their clauses and are fine. Three false positives out of five is
 * the cost that narrowing removed.
 */
const GENERIC_PROMISE = new RegExp(
  `\\b(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})\\s+`
  + '(items?|things?|stuff|points?)\\s*[.!?]*\\s*$', 'i')

/** Does this spoken text promise a count of nothing in particular? */
export function promisesNothingInParticular(text: unknown): boolean {
  return typeof text === 'string' && GENERIC_PROMISE.test(text)
}
