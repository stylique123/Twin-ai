// THE WORST OF THE THREE OUTCOMES, AND THE ONE-SHOT LOOKUP THAT CAUSED IT.
//
// ⚠️ MEASURED IN PRODUCTION 2026-09-02, from `credit_events` and `generations`:
//
//     13:52:30  charged  -10
//     13:54:46  REFUNDED +10   ← first attempt failed and was refunded correctly
//     13:55:33  charged  -10   ← retry
//     13:58:08  generation 4d9c4c0b written — real script, reference_analysis.mode "real"
//
// The retry SUCCEEDED. The creator was shown "We hit a snag", was charged, and
// the script was sitting in their Library. Worse than a clean failure with a
// refund, and worse than a slow success — they had no reason to go looking for
// a thing they had just been told did not exist.
//
// ⚖️ THE CAUSE IS A RACE, NOT A MISSING FEATURE. The post-failure lookup already
// existed; it fired ONCE, the instant the request died — which is exactly when
// the server is most likely to still be finishing. A fetch dying around 13:57:50
// got its one lookup ~18 seconds before the row existed.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  creatorFacingMessage, isAuthoredForCreators, GENERIC_BUILD_FAILURE,
} from '../creatorFacingError'
import { REFERENCE_UNREAD_TEXT } from '../referenceAnalysis'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../..')
const SCREEN = readFileSync(resolve(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')
// ⚠️ CODE LINES ONLY. A guard that greps source text must tell a mention from a
// call, and this file's own explanation quotes the very strings it forbids.
const CODE = SCREEN.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

describe('a lost request keeps asking before it calls itself a failure', () => {
  it('the rescue loops rather than asking once', () => {
    expect(CODE).toMatch(/for \(let i = 0; i < RESCUE_ATTEMPTS; i\+\+\)/)
    expect(CODE).toMatch(/const late = await findGenerationByKey\(key\)/)
  })

  it('it waits well past the 18-second gap that stranded a real creator', () => {
    const attempts = Number(/const RESCUE_ATTEMPTS = (\d+)/.exec(CODE)?.[1])
    const everyMs = Number(/const RECOVERY_POLL_MS = (\d+)/.exec(CODE)?.[1])
    expect(Number.isFinite(attempts)).toBe(true)
    expect(Number.isFinite(everyMs)).toBe(true)
    expect(attempts * everyMs).toBeGreaterThanOrEqual(60_000)
  })

  it('but a coded REFUSAL is answered immediately, never waited on', () => {
    // ⚖️ REFERENCE_UNREAD, SELL_WITHOUT_TARGET and READINESS_INCOMPLETE are
    // decisions, not lost answers. No generation is coming, and stalling a
    // creator who needs to act would be a new defect wearing the fix's clothes.
    const loop = CODE.indexOf('RESCUE_ATTEMPTS; i++')
    for (const code of ['REFERENCE_UNREAD_CODE', 'SELL_WITHOUT_TARGET_CODE', 'READINESS_INCOMPLETE_CODE']) {
      const at = CODE.indexOf(`?.code === ${code}`)
      expect(at).toBeGreaterThan(-1)
      expect(at).toBeLessThan(loop)
    }
  })

  it('returning to the tab re-asks repeatedly, not once', () => {
    // The other half of the same defect: a one-shot lookup on the visibility
    // gesture finds nothing if the build is still running, and nothing notices
    // when it finishes moments later.
    expect(CODE).toMatch(/RECOVERY_MAX_ATTEMPTS/)
    expect(CODE).toMatch(/timer = setTimeout\(look, RECOVERY_POLL_MS\)/)
  })
})

describe('a creator never reads the library\'s own words', () => {
  it('the supabase-js message collapses to a written sentence', () => {
    // The exact string a real creator saw on the build screen.
    const shown = creatorFacingMessage(new Error('Edge Function returned a non-2xx status code'))
    expect(shown).toBe(GENERIC_BUILD_FAILURE)
    expect(shown).not.toMatch(/Edge Function|non-2xx|status code/)
  })

  it('an authored sentence passes through unchanged', () => {
    for (const text of Object.values(REFERENCE_UNREAD_TEXT)) {
      expect(creatorFacingMessage(new Error(text))).toBe(text)
      expect(isAuthoredForCreators(text)).toBe(true)
    }
  })

  it('it is an ALLOWLIST, so an unknown message fails CLOSED', () => {
    // ⚖️ THE DIRECTION IS THE POINT. A denylist of technical phrases is a guess
    // about every library we have not upgraded yet, and the first unrecognised
    // string goes straight to the screen.
    for (const junk of [
      'TypeError: Failed to fetch', 'ECONNRESET', 'FunctionsHttpError',
      'column "x" does not exist', '{"code":500}', 'RESOURCE_EXHAUSTED',
    ]) {
      expect(creatorFacingMessage(new Error(junk))).toBe(GENERIC_BUILD_FAILURE)
    }
  })

  it('a thrown non-Error never becomes the text "undefined"', () => {
    // THE NULL CHECK PRECEDES THE COERCION. All of these are really thrown.
    for (const thrown of [undefined, null, 42, {}, [], '']) {
      const shown = creatorFacingMessage(thrown)
      expect(shown).toBe(GENERIC_BUILD_FAILURE)
      expect(shown).not.toMatch(/undefined|null|\[object/)
    }
  })

  it('the sentence promises only what is known to be true', () => {
    // It does not say "try again" — the same input may fail the same way — and
    // it does not blame the creator's link. It says the thing they care about.
    expect(GENERIC_BUILD_FAILURE).toMatch(/not been charged/i)
    expect(GENERIC_BUILD_FAILURE).not.toMatch(/try again|your link|your video/i)
  })

  it('the screen no longer prints e.message straight to the creator', () => {
    expect(CODE).toMatch(/setError\(creatorFacingMessage\(e\)\)/)
    expect(CODE).not.toMatch(/setError\(e instanceof Error \? e\.message/)
  })
})
