// A REGISTERED HANDLER THAT NOBODY CLAIMS IS A FEATURE THAT DOES NOTHING.
//
// ⚠️ THIS FAILURE HAPPENED, AND env.ts WARNED ABOUT IT THREE LINES ABOVE THE
// BUG. `extraction_parity` was added to the handler registry, deployed, and its
// first job sat `queued` forever — because the worker claims `env.jobTypes`, and
// registering a handler does not add the type to that list. The job never
// dead-lettered and never errored; it simply was not asked for.
//
// ⚖️ THAT SILENCE IS WHY THIS TEST EXISTS. A dead-letter is loud. A job nobody
// claims looks exactly like a job that has not run yet, forever — the same
// costume `transcribe` wore: registered, claimed by nothing, enqueued by
// nothing, and green in every test.

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// env.ts throws without Supabase creds, so stub them before importing the
// registry — the same dance registry.test.ts does, and for the same reason.
beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})
const handlerTypes = async (): Promise<string[]> =>
  Object.keys((await import('../jobs/index.js')).handlers)

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ENV_SRC = readFileSync(join(REPO, 'src/env.ts'), 'utf8')

/** The default list exactly as env.ts spells it — read from the source rather
 *  than imported, because importing env.ts would let a WORKER_JOB_TYPES set in
 *  THIS process decide what the test sees. The deployed default is the thing
 *  under test. */
function defaultJobTypes(): string[] {
  const m = ENV_SRC.match(/WORKER_JOB_TYPES \?\? '([^']+)'/)
  if (!m) throw new Error('could not find the WORKER_JOB_TYPES default in env.ts')
  return m[1].split(',').map((s) => s.trim())
}

/** ⚠️ AN EXEMPTION MUST BE WRITTEN DOWN, NOT INFERRED FROM ABSENCE. A handler
 *  deliberately not drained by the shared worker belongs here with a reason, so
 *  "nobody drains it" stays a decision somebody made rather than an oversight
 *  nobody noticed. */
const DELIBERATELY_NOT_DRAINED: Record<string, string> = {}

describe('every registered handler is drainable', () => {
  it('appears in the WORKER_JOB_TYPES default', async () => {
    const claimed = new Set(defaultJobTypes())
    const orphans = (await handlerTypes())
      .filter((t) => !claimed.has(t) && !(t in DELIBERATELY_NOT_DRAINED))
    expect(orphans, `handler(s) registered but never claimed: ${orphans.join(', ')} — `
      + 'add the type to the WORKER_JOB_TYPES default in src/env.ts, or record it in '
      + 'DELIBERATELY_NOT_DRAINED with the reason').toEqual([])
  })

  it('and the default claims nothing it cannot handle', async () => {
    // The mirror failure: a type in the claim list with no handler would be
    // claimed and then dead-letter every time.
    const known = new Set(await handlerTypes())
    const unhandled = defaultJobTypes().filter((t) => !known.has(t))
    expect(unhandled, `claimed but unhandled: ${unhandled.join(', ')}`).toEqual([])
  })

  it('names extraction_parity specifically, because this is the one that got away', () => {
    expect(defaultJobTypes()).toContain('extraction_parity')
  })
})
