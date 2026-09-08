import { describe, it, expect } from 'vitest'
import {
  creatorFacingMessage, serviceDidNotAnswer, isAuthoredForCreators,
  SERVICE_UNREACHABLE, GENERIC_BUILD_FAILURE,
} from '../creatorFacingError'

/**
 * ⚠️ SIX ATTEMPTS, EACH WITH A DIFFERENT VIDEO, WHILE THE WRITER WAS DEAD.
 *
 * `generate-blueprint` could not boot from 2026-09-06 20:01 to 2026-09-08
 * 15:13 — a duplicate module-scope `const`, a Deno boot SyntaxError, so every
 * request 500'd before reading a single input. The creator was shown
 * "Something went wrong on our side", which is TRUE and hands them nothing to
 * act on, so they did the only thing the screen left available: changed the
 * reference and tried again. Five more times.
 *
 * ⚖️ THE SENTENCE THAT WOULD HAVE STOPPED THAT names the one fact they could
 * not know — it was not their video and not their link.
 */

/** A supabase-js FunctionsHttpError carries the Response as `context`. */
const httpError = (status: number) =>
  Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    name: 'FunctionsHttpError', context: { status },
  })

describe('a creator retried six times because we blamed nothing', () => {
  it('a dead function says it is ours, not theirs', () => {
    expect(creatorFacingMessage(httpError(500))).toBe(SERVICE_UNREACHABLE)
    expect(SERVICE_UNREACHABLE).toContain('not your video')
    expect(SERVICE_UNREACHABLE).toContain('not been charged')
  })

  it('a request that never completed counts too', () => {
    // No response means no status. It still did not answer.
    const fetchErr = Object.assign(new Error('Failed to send a request'), {
      name: 'FunctionsFetchError',
    })
    expect(creatorFacingMessage(fetchErr)).toBe(SERVICE_UNREACHABLE)
  })

  it('a 4xx is the function ANSWERING, and must NOT read as an outage', () => {
    // ⚖️ THE LINE THAT MATTERS. A 400/401/404 means it booted, read the request
    // and refused it — often a decision we made on purpose, authored elsewhere
    // with its own reason. Telling a creator "it is on our side" about a
    // deliberate refusal is a new lie replacing an old vagueness.
    for (const status of [400, 401, 403, 404, 422, 499]) {
      expect(creatorFacingMessage(httpError(status)), String(status))
        .toBe(GENERIC_BUILD_FAILURE)
    }
  })

  it('the classifier reads a STRUCTURED status, never the message text', () => {
    // The same words with no status must not trigger it — otherwise this is the
    // denylist the module exists to refuse, and it fails open on the next SDK.
    const textOnly = new Error('Edge Function returned a non-2xx status code')
    expect(serviceDidNotAnswer(textOnly)).toBe(false)
    expect(creatorFacingMessage(textOnly)).toBe(GENERIC_BUILD_FAILURE)
  })

  it('only a real NUMBER is trusted as a status', () => {
    // ⚠️ THE FIRST VERSION OF THIS TEST WAS WORTHLESS AND A MUTATION PROVED IT.
    // It asserted `{ context: {} }` is not an outage — true with the typeof
    // guard AND true with a bare `status >= 500`, because `undefined >= 500` is
    // already false. It passed on the broken code, so it was measuring nothing.
    //
    // ⚖️ THE TWO ONLY DISAGREE ON A VALUE THAT COERCES. `'500' >= 500` is TRUE
    // in JavaScript — string-to-number coercion — while the guard says false.
    // A malformed context is not evidence of an outage, and failing closed to
    // the generic sentence is this module's whole posture.
    const stringStatus = Object.assign(new Error('x'), { context: { status: '500' } })
    expect(serviceDidNotAnswer(stringStatus)).toBe(false)
    expect(creatorFacingMessage(stringStatus)).toBe(GENERIC_BUILD_FAILURE)

    // And the shapes either version handles the same, kept for the boundary.
    expect(serviceDidNotAnswer(Object.assign(new Error('x'), { context: {} }))).toBe(false)
  })

  it('survives the shapes that are not errors at all', () => {
    for (const v of [null, undefined, '', 'a string', 42, {}, { context: null }]) {
      expect(() => creatorFacingMessage(v)).not.toThrow()
      expect(serviceDidNotAnswer(v)).toBe(false)
    }
  })

  it('the new sentence is recognised as ours', () => {
    // Otherwise a surface branching on `isAuthoredForCreators` would treat our
    // own authored outage message as a foreign string.
    expect(isAuthoredForCreators(SERVICE_UNREACHABLE)).toBe(true)
  })

  it('it does not promise the retry will work, or that it will not', () => {
    // A 500 covers a dead module and a bad minute alike, and this layer cannot
    // tell them apart. Claiming either would be a guess wearing a fact's voice.
    expect(SERVICE_UNREACHABLE).not.toMatch(/try again|later|shortly|soon/i)
  })
})
