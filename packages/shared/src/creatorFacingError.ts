// WHAT A CREATOR IS ALLOWED TO READ WHEN SOMETHING BREAKS.
//
// ⚠️ MEASURED IN PRODUCTION 2026-09-02. The build screen showed a creator:
//
//     We hit a snag
//     Edge Function returned a non-2xx status code
//
// That sentence is `FunctionsHttpError.message` from supabase-js, printed
// verbatim by `setError(e.message)`. It names our infrastructure, tells the
// creator nothing they can act on, and reads as a product that is broken rather
// than one that had a bad minute. It breaks the standing rule outright: plain
// everyday English everywhere a creator reads.
//
// ⚖️ THE FIX IS AN ALLOWLIST, NOT A DENYLIST, AND THAT DIRECTION IS THE WHOLE
// POINT. A denylist of technical phrases — "non-2xx", "TypeError", "ECONNRESET"
// — is a guess about every library we have not upgraded yet, and it fails OPEN:
// the first unrecognised string goes straight to the screen. An allowlist fails
// CLOSED. The worst case is a creator seeing a slightly less specific true
// sentence, which is strictly better than a true one they cannot use.
//
// ⚖️ SO A MESSAGE IS SHOWN ONLY IF WE WROTE IT. Everything else — every library
// error, every network stack string, every future SDK's phrasing — collapses to
// one plain sentence. Nothing is hidden from the LOG; `console.warn` still
// carries the original, because the operator's need and the creator's need are
// different needs.

import { REFERENCE_UNREAD_TEXT } from './referenceAnalysis'

/**
 * The sentences this product authors for creators, from the modules that own
 * them. Imported rather than retyped — a copy would drift the moment someone
 * reworded the original, and then a real authored message would start
 * collapsing to the fallback with no test failing.
 */
export function authoredCreatorMessages(): ReadonlySet<string> {
  return new Set<string>(Object.values(REFERENCE_UNREAD_TEXT))
}

/** ⚖️ ONE SENTENCE, AND IT PROMISES ONLY WHAT IS TRUE. It does not say "try
 *  again" (the same input may fail the same way), it does not blame the
 *  creator's link, and it does not claim we know what happened. It says the
 *  thing that IS known and that they care about most: no credit was taken. */
export const GENERIC_BUILD_FAILURE =
  'Something went wrong on our side, so this build stopped. You have not been charged.'

/**
 * Turn a thrown value into something a creator may read.
 *
 * ⚠️ THE NULL CHECK PRECEDES EVERYTHING. A thrown string, a thrown object, a
 * thrown `undefined` — all real, none of them an Error — must not become the
 * text "undefined" on a screen.
 */
export function creatorFacingMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message
    : typeof e === 'string' ? e
    : ''
  const trimmed = raw.trim()
  if (trimmed === '') return GENERIC_BUILD_FAILURE
  return authoredCreatorMessages().has(trimmed) ? trimmed : GENERIC_BUILD_FAILURE
}

/**
 * Did this message come from us?
 *
 * Exported so a surface that wants to branch — show a specific recovery action
 * for an authored refusal, a generic one otherwise — can ask without
 * re-implementing the membership test and drifting from it.
 */
export function isAuthoredForCreators(message: unknown): boolean {
  return typeof message === 'string' && authoredCreatorMessages().has(message.trim())
}
