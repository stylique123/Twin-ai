// REFERENCE-1 — reading back "did we actually watch the video".
//
// `generations.reference_analysis` (0110) is written by `generate-blueprint`
// from the branch it took: a real transcript reached the prompt, or the model
// reasoned from the format pattern, or there was no reference at all.
//
// The reason this needs a reader at all — rather than a `?.mode` at each call
// site — is the NULL case. A generation created before 0110 has no record, and
// the honest answer for it is "we do not know", not "pattern". Defaulting an
// absent value to the fallback would be inventing a fact about history to make
// a badge render, and it would put a "we could not read this" notice on
// generations that were read perfectly well.
//
// Same three-state rule as preflight and the pre-script brief: unset is its own
// state, and a surface that cannot tell must say nothing rather than guess.

/** What the server recorded. `unknown` is the pre-0110 case, never a guess. */
export type ReferenceMode = 'real' | 'pattern' | 'none' | 'unknown'

export interface ReferenceAnalysis {
  mode: ReferenceMode
  /** Only ever set for `pattern`, and only when the server named a cause. */
  reason: string | null
}

const MODES: readonly string[] = ['real', 'pattern', 'none']

/**
 * Read the column. Anything unrecognised reads as `unknown` rather than
 * throwing: this feeds a badge, and a plan screen must not fail to render
 * because a provenance value was written by a version that knows one more mode.
 */
export function readReferenceAnalysis(raw: unknown): ReferenceAnalysis {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { mode: 'unknown', reason: null }
  const o = raw as Record<string, unknown>
  const mode = typeof o.mode === 'string' && MODES.includes(o.mode)
    ? (o.mode as ReferenceMode)
    : 'unknown'
  const rawReason = typeof o.reason === 'string' ? o.reason.trim() : ''
  // A reason on anything but `pattern` describes a failure that did not happen.
  // The CHECK refuses it; this refuses it again at the reader, because the
  // column can hold rows written before a constraint existed.
  const reason = mode === 'pattern' && rawReason !== '' ? rawReason : null
  return { mode, reason }
}

/**
 * Should a surface say anything at all?
 *
 * Only `pattern` earns a notice. `real` is the promise the product already
 * makes — badging it would turn the normal case into a claim, and a screen
 * covered in reassurance reads as a screen with something to reassure about.
 * `none` is the creator's own choice. `unknown` has nothing to say.
 */
export function shouldDiscloseReference(a: ReferenceAnalysis): boolean {
  return a.mode === 'pattern'
}

/**
 * The sentence, in the creator's terms. Never "ingest failed" or a code — the
 * question they have is "can I trust this analysis", and the answer is what to
 * do about it.
 */
export function referenceDisclosure(a: ReferenceAnalysis): string | null {
  if (!shouldDiscloseReference(a)) return null
  return a.reason
    ?? 'We could not read this video, so the script follows the format instead.'
}
