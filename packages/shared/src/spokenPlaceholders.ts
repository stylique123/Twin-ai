// A TEMPLATE THE CREATOR WOULD READ ALOUD.
//
// ── THE RUN THIS EXISTS FOR ───────────────────────────────────────────────
//
// A gadget reviewer, handed a productivity reference, got back five hooks and
// four script lines that were all unfilled templates:
//
//     "This gadget actually changed how I [achieved a specific result]!"
//     "Here's the one feature on this new [gadget name] that blew my mind."
//
// Not one of them is a sentence. They are instructions to the creator, written
// in the field the creator SPEAKS, and the failure surfaces in front of a camera
// with the phone already recording.
//
// ── WHY THE EXISTING GUARD DID NOT CATCH IT ───────────────────────────────
//
// `normalizeHookLine` in generate-blueprint handles a related case: a first
// script line that is ENTIRELY a bracket token, or that says "insert hook here".
// It repairs those by copying hook_options[0] in. An INLINE placeholder is a
// different shape — the sentence is mostly real — so it passed through both the
// hooks and the lines untouched.
//
// ⚖️ DECIDABLE, SO IT IS A CHECK AND NOT A PROMPT RULE. The prompt already asks
// for finished words. Asking harder is the move that has failed repeatedly here;
// a bracketed span in a spoken field is machine-detectable, and detection is
// what stops it reaching a person.
//
// ── WHY EVERY BRACKETED SPAN COUNTS ───────────────────────────────────────
//
// The first version of this exempted a single bracketed WORD, reasoning that a
// brand can legitimately be written "[solidcore]". Its own fixtures broke it:
// "[task]" is one word, no space, and shipped in a real hook. The tell I picked
// was not a tell.
//
// ⚖️ SO EVERY BRACKETED SPAN IN A SPOKEN FIELD IS A PLACEHOLDER, because the
// costs are not symmetric. A false positive discards one hook of five and the
// creator never notices. A false negative puts "[gadget name]" in their mouth
// with the camera running. Where two errors cost that differently, the rule
// belongs on the cheap side of them.

/** A spoken field carrying an unfilled template span. */
export interface PlaceholderHit {
  /** Where it was found, so a caller can regenerate the right part. */
  field: 'hook_options' | 'script'
  /** Index within that array. */
  index: number
  /** The bracketed span itself, for a message a person can act on. */
  token: string
}

/** Any `[...]` span in text meant to be spoken. */
const PLACEHOLDER = /\[[^\]]*\]/g

/**
 * A FILLER TOKEN WEARING NO BRACKETS.
 *
 * ⚠️ FOUND ON REAL DATA. Running the same creator with and without extracted
 * knowledge, the no-knowledge script opened "I bought the new XYZ Phone" — and
 * this module scored it CLEAN, because every check here looked for a bracket.
 * The bracket was never the defect; it was the costume the defect usually wears.
 *
 * ⚖️ Deliberately a short list of tokens that are only ever stand-ins. "XYZ",
 * "Brand X", "Product A", "insert" — nobody says these on camera meaning them.
 * Real names that merely LOOK like codes ("Pixel 7a", "M4", "A80") must survive,
 * which is why this matches placeholder WORDS rather than a shape like
 * letter-plus-digit — the shape test would condemn half of consumer tech.
 */
const FILLER = /\b(xyz|abc123|brand\s?[xy]\b|product\s?[abx]\b|company\s?[xy]\b|insert\s+\w+\s+here|your\s+product\s+here|tbd|lorem ipsum|placeholder)\b/i

/** Does this spoken text contain an unfilled template span? */
export function placeholderTokens(text: unknown): string[] {
  if (typeof text !== 'string' || text.trim() === '') return []
  const bracketed = [...text.matchAll(PLACEHOLDER)].map((m) => m[0])
  const filler = FILLER.exec(text)
  return filler ? [...bracketed, filler[0]] : bracketed
}

export function hasPlaceholder(text: unknown): boolean {
  return placeholderTokens(text).length > 0
}

/** Shape this reads. Deliberately loose: it runs on freshly parsed model output,
 *  before anything has validated it. */
export interface PlaceholderView {
  hook_options?: unknown
  script?: Array<{ line?: unknown }> | unknown
}

/** Every spoken field in a blueprint that would put a template in someone's
 *  mouth. Empty for a clean plan, which is the normal case. */
export function spokenPlaceholders(bp: PlaceholderView | null | undefined): PlaceholderHit[] {
  if (!bp) return []
  const out: PlaceholderHit[] = []
  const hooks = Array.isArray(bp.hook_options) ? bp.hook_options : []
  hooks.forEach((h, index) => {
    for (const token of placeholderTokens(h)) out.push({ field: 'hook_options', index, token })
  })
  const script = Array.isArray(bp.script) ? bp.script : []
  script.forEach((b, index) => {
    const line = (b as { line?: unknown } | null)?.line
    for (const token of placeholderTokens(line)) out.push({ field: 'script', index, token })
  })
  return out
}

/**
 * Drop the hooks that are templates, keeping the order of the rest.
 *
 * ⚖️ REPAIRABLE ONLY WHERE THERE IS A CHOICE. Five hooks are generated and one
 * is recommended, so discarding the broken ones still leaves something real to
 * say. A script line has no alternates — nothing here invents one, because a
 * fabricated line is the defect this module exists to stop, wearing a fix.
 * `spokenPlaceholders` still reports those so the caller can decide.
 */
export function dropPlaceholderHooks(hooks: readonly unknown[]): string[] {
  return hooks.filter((h): h is string => typeof h === 'string' && h.trim() !== '' && !hasPlaceholder(h))
}
