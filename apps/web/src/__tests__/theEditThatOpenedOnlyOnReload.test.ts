// THE EDIT OPENED ONLY ON A RELOAD, UNDER A MESSAGE PROMISING OTHERWISE.
//
// ⚠️ OBSERVED ON A REAL TAKE, 2026-09-15. 46.2 MB uploaded successfully — the
// first completed record→upload in this product's history — the asset moved to
// `validating`, and the page sat there disabled saying "The edit opens as soon
// as the upload finishes". It did not. The effect that looks for a ready asset
// ran on `[id]` alone, fetched once on mount, and never re-checked.
//
// ⚖️ AND THE HELPER FOR THIS WAS ALREADY WRITTEN, WITH ZERO CALLERS.
// `pollSourceAssetReady` in `packages/shared/src/editor/api.ts` waits for the
// terminal state and stops itself. The repo's dominant defect, once more: a
// thing built correctly that nothing reads. Calling it makes the existing
// promise TRUE rather than rewording the promise.
//
// ⚠️ AND `getReadySourceAsset` COULD NOT TELL THE TWO WAITS APART. It filters
// to `ready`, so it returns null both when no take exists and when a take is
// being checked — different things to say to a creator. `getPendingSourceAsset`
// returns the in-flight one WITH its status so the copy can be honest.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const RESULT = readFileSync(join(HERE, '..', 'pages', 'Result.tsx'), 'utf8')
const API = readFileSync(
  join(HERE, '..', '..', '..', '..', 'packages', 'shared', 'src', 'editor', 'api.ts'), 'utf8')

/** Code only. The notes added with this fix QUOTE the sentences they replaced,
 *  so a raw grep would find the old promise inside the prose retracting it. */
function code(src: string): string {
  return src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n')
}

describe('the wait is now watched, not sampled once', () => {
  it('the helper written for this finally has a caller', () => {
    expect(code(RESULT)).toMatch(/pollSourceAssetReady\(/)
  })

  it('it is stopped on unmount rather than left polling a dead page', () => {
    expect(code(RESULT)).toMatch(/shouldStop: \(\) => !live/)
  })

  it('a poll that never settles leaves the copy alone', () => {
    // `null` from the poll means "not settled yet", which is not "rejected".
    // Asserting a failure the page cannot see would be the same class of lie
    // as the message this fix removed.
    const body = code(RESULT)
    expect(body).toMatch(/if \(!live \|\| !settled\) return/)
    expect(body).toMatch(/settled\.status === 'ready'/)
  })

  it('and only a READY asset unlocks the button, as the server also requires', () => {
    expect(code(RESULT)).toMatch(/disabled=\{editStarting \|\| !serverSourceAssetId\}/)
  })
})

describe('the two waits are distinguishable, because they read differently', () => {
  it('a reader exists for the not-yet-ready asset', () => {
    expect(API).toMatch(/export async function getPendingSourceAsset/)
  })

  it('it returns only the in-flight states, never a finished answer', () => {
    const fn = API.slice(API.indexOf('export async function getPendingSourceAsset'))
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    expect(body).toMatch(/\.in\('status', \['uploading', 'validating'\]\)/)
    // `rejected` belongs to the rejection path and `ready` to the other reader;
    // returning either here would put two answers behind one question.
    expect(body).not.toMatch(/'rejected'/)
  })

  it('the page branches on that status instead of one sentence for both', () => {
    const body = code(RESULT)
    expect(body).toMatch(/pendingTake === 'uploading'/)
    expect(body).toMatch(/pendingTake === 'validating'/)
    // And the third case: a script with no recording at all must not be told
    // that a take is arriving.
    expect(body).toMatch(/pendingTake === null/)
  })

  it('no take at all says so, rather than claiming one is on its way', () => {
    const idx = RESULT.indexOf("pendingTake === null")
    expect(idx).toBeGreaterThan(-1)
    const block = RESULT.slice(idx, RESULT.indexOf(')}', idx))
    expect(block).toMatch(/once Twin has a finished recording/)
    expect(block).not.toMatch(/receiving|checking/)
  })
})
