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
  return new Set<string>([...Object.values(REFERENCE_UNREAD_TEXT), SERVICE_UNREACHABLE])
}

/**
 * ⚠️ SIX ATTEMPTS, EACH WITH A DIFFERENT VIDEO, WHILE THE WRITER WAS DEAD.
 *
 * `generate-blueprint` could not boot from 2026-09-06 20:01 to 2026-09-08
 * 15:13. Every request 500'd before reading a single input. The creator saw
 * GENERIC_BUILD_FAILURE — "Something went wrong on our side" — which is TRUE
 * and gives them nothing to do with it, so they did the only thing the screen
 * left them: changed their reference and tried again. And again.
 *
 * ⚖️ THE ONE FACT THAT WOULD HAVE STOPPED THAT is that it was not their video
 * and not their link. This sentence says it. It does NOT promise the retry will
 * work later, and it does not promise it will fail — a 500 covers both a dead
 * module and a bad minute, and this layer cannot tell them apart.
 *
 * ⚖️ "You have not been charged" IS MEASURED, NOT HOPED. Across 2026-09-05 to
 * 2026-09-08, `blueprint` debits and generation rows match exactly every day —
 * 8/8, 6/6, 3/3 — and 2026-09-07, the dead day, has zero of both. A build that
 * does not produce a script does not take a credit.
 */
export const SERVICE_UNREACHABLE =
  'Twin\'s script writer is not responding right now. This is not your video or '
  + 'your link — it is on our side. You have not been charged.'

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
  // ⚠️ A STRUCTURED FIELD, NEVER THE MESSAGE TEXT. Matching on "non-2xx" or
  // "Failed to fetch" would be the denylist this file exists to refuse: a guess
  // about every SDK phrasing we have not met yet, failing OPEN. A status code
  // is a number the transport reports, and it means the same thing in every
  // library that will ever throw here.
  if (serviceDidNotAnswer(e)) return SERVICE_UNREACHABLE

  const raw = e instanceof Error ? e.message
    : typeof e === 'string' ? e
    : ''
  const trimmed = raw.trim()
  if (trimmed === '') return GENERIC_BUILD_FAILURE
  return authoredCreatorMessages().has(trimmed) ? trimmed : GENERIC_BUILD_FAILURE
}

/**
 * Did the request never reach a working script writer?
 *
 * ⚖️ 5xx AND A DEAD SOCKET, AND NOTHING ELSE. A 4xx is the function ANSWERING —
 * it booted, read the request and refused it — and those refusals are authored
 * elsewhere with reasons of their own. Treating them as an outage would tell a
 * creator "it is on our side" about a decision we made on purpose.
 */
export function serviceDidNotAnswer(e: unknown): boolean {
  if (e === null || typeof e !== 'object') return false
  const ctx = (e as { context?: unknown }).context
  if (ctx !== null && typeof ctx === 'object') {
    const status = (ctx as { status?: unknown }).status
    // THE NULL CHECK PRECEDES THE COMPARISON. `undefined >= 500` is false, so a
    // context without a status would read as "answered fine" — which is how an
    // outage keeps wearing the generic message.
    if (typeof status === 'number') return status >= 500
  }
  // supabase-js raises FunctionsFetchError when the request never completed:
  // no response, therefore no status, therefore nothing answered.
  const name = (e as { name?: unknown }).name
  return name === 'FunctionsFetchError'
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
