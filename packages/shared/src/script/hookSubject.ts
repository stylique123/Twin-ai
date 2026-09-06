/**
 * A HOOK MUST NAME SOMETHING.
 *
 * ⚠️ MEASURED IN PRODUCTION, TWICE, ON THE SAME VOICE:
 *
 *     "I am doing a little bit of the same thing right here."
 *     "I'm going to do a little bit of the same thing."
 *
 * Both shipped as `hook_options[0]` — the RECOMMENDED hook. Standalone they
 * have no subject, no promise and no reason to watch. "The same thing" as what?
 * "Right here" is where? Every word points at something outside the video.
 *
 * ── WHY THIS IS NOT THE SIGNATURE-PHRASE RULE IT WAS FILED AS ─────────────
 *
 * ⚠️ THE FILED CAUSE IS DISPROVEN, AND MEASURING IT IS THE ONLY REASON WE KNOW.
 * The eight-run analysis records this as "signature phrases must not become
 * hooks". It is not that. `extractSignaturePhrases` requires a phrase in at
 * least `SIG_MIN_VIDEOS = 3` DIFFERENT videos; "little bit of the same" appears
 * in exactly ONE of this creator's four own transcripts. It was never in the
 * signature-phrase store, so a rule guarding that store could not have fired on
 * either hook — the same defect shape as a figure check that cannot see a
 * figure spelled out in words.
 *
 * ⚖️ SO THE RULE IS KEYED ON WHAT THE HOOK SAYS, NOT WHERE IT CAME FROM.
 * Provenance was the wrong question; a borrowed hook that names a real subject
 * is fine, and an invented one that names nothing is not.
 *
 * ── THE MARGIN, AND WHY THERE IS NO TUNED THRESHOLD ───────────────────────
 *
 * ⚖️ THE BAR IS ZERO, NOT A NUMBER SOMEBODY CHOSE. Across the 30 most recent
 * production `hook_options[0]` values the surviving-word counts are 0, 0, then
 * 4 — the two known-bad hooks, then a gap. A hook is flagged only when NOTHING
 * survives, so the rule sits four words below the closest good hook rather than
 * on a line drawn through the middle of the data.
 *
 * ⚠️ AND IT COUNTS, IT DOES NOT REFUSE. Thirty hooks from four accounts is one
 * population, and a constraint that has only ever seen the population it was
 * written for looks like a working constraint. `demoteUnsupportedHooks` is
 * there to reorder on when this is worth enforcing; that decision should rest
 * on the count, not on a guess about frequency.
 */

/** ⚠️ FUNCTION WORDS ONLY. Nothing here carries a subject on its own, so
 *  removing them cannot remove the thing the hook is about. */
const STOP: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'in', 'on', 'at', 'to',
  'for', 'with', 'is', 'was', 'are', 'were', 'be', 'been', 'am', 'it', 'its',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they',
  'my', 'your', 'his', 'her', 'our', 'their', 'as', 'so', 'not', 'do', 'does',
  'did', 'doing', 'done', 'have', 'has', 'had', 'just', 'from', 'by', 'up',
  'out', 'about', 'into', 'over', 'then', 'than', 'when', 'what', 'which',
  'who', 'how', 'why', 'here', 'there', 'all', 'can', 'will', 'would',
  'could', 'should', 'get', 'got', 'like', 'going', 'gonna', 'right', 'now',
  'me', 'us', 'them', 'no', 'yes', 'because', 'even', 'only', 'make', 'makes',
  'made',
])

/** ⚠️ WORDS THAT POINT INSTEAD OF NAMING. "the same thing" is grammatically a
 *  noun phrase and refers to nothing a viewer can hold. These are separated
 *  from `STOP` deliberately: they are the ones a reader would argue about, and
 *  the argument should be with a named list rather than with a regex. */
const DEICTIC: ReadonlySet<string> = new Set([
  'thing', 'things', 'same', 'little', 'bit', 'way', 'ways', 'stuff', 'one',
  'ones', 'something', 'anything', 'everything', 'nothing', 'kind', 'sort',
  'part', 'place',
])

/** ⚠️ CONTRACTION TAILS ARE STRIPPED BEFORE TOKENISING, and this is load-
 *  bearing. Splitting on non-letters alone leaves "i'm" as a token that is in
 *  neither list, so the second production hook scored 1 instead of 0 and the
 *  rule silently missed half the defect it was written for. */
export function subjectWords(hook: unknown): string[] {
  return String(hook ?? '')
    .toLowerCase()
    .replace(/'(m|re|s|ll|ve|t|d)\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w !== '' && !STOP.has(w) && !DEICTIC.has(w))
}

/** Does this hook name anything at all? */
export function hookNamesSomething(hook: unknown): boolean {
  return subjectWords(hook).length > 0
}

/**
 * How many of a generation's hook options name nothing.
 *
 * ⚠️ ZERO IS THE EXPECTED READING AND AN ABSENT COUNTER WOULD LOOK IDENTICAL
 * TO IT, which is why the caller writes this even when nothing is found.
 */
export function hooksWithoutASubject(
  hooks: readonly unknown[] | null | undefined,
): number {
  if (!Array.isArray(hooks)) return 0
  return hooks.filter(
    (h) => typeof h === 'string' && h.trim() !== '' && !hookNamesSomething(h),
  ).length
}
