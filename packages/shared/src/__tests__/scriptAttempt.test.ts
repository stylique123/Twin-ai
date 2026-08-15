// C8's REAL HOLE: A FAILED SCRIPT GENERATION LEAVES NO ROW ANYWHERE.
//
// These tests hold two things. The classifier is real logic and is tested as
// such — the strings it reads are thrown by the provider layer a few hundred
// lines above it, and if those drift this must fail rather than quietly file
// everything under `unknown`. The wiring is checked at the edge, because a
// perfect classifier that nothing calls is the reader-with-no-writer defect
// wearing a different hat.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  DETAIL_MAX, attemptSummary, classifyModelFailure, servedFromFallback,
} from '../scriptAttempt'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const SQL = readFileSync(join(REPO, 'supabase/migrations/0129_script_attempts.sql'), 'utf8')

describe('the cause survives, not just the code', () => {
  it('separates the three provider failures that need different responses', () => {
    // ⚖️ THE DEFECT IN `edit_director_calls`, DELIBERATELY NOT REPEATED. Quota
    // means slow down, 5xx means wait, 4xx means our request is wrong.
    expect(classifyModelFailure(new Error('Gemini 429: quota exceeded')).code).toBe('provider_quota')
    expect(classifyModelFailure(new Error('Gemini 503: overloaded')).code).toBe('provider_unavailable')
    expect(classifyModelFailure(new Error('Gemini 400: bad field')).code).toBe('provider_rejected')
  })

  it('reads the shapes the provider layer ACTUALLY throws', () => {
    // ⚠️ THESE STRINGS ARE A COUPLING. If `callOnce` rewords them, every failure
    // silently becomes `unknown` and the table fills with useless rows — so the
    // test asserts both ends.
    expect(EDGE).toMatch(/throw new Error\(`Gemini \$\{res\.status\}/)
    expect(EDGE).toMatch(/Response truncated \(finishReason=MAX_TOKENS\)/)
    expect(EDGE).toMatch(/Model returned invalid JSON/)
    expect(classifyModelFailure(new Error('Response truncated (finishReason=MAX_TOKENS)')).code).toBe('truncated')
    expect(classifyModelFailure(new Error('Model returned invalid JSON')).code).toBe('invalid_json')
    expect(classifyModelFailure(new Error('Empty response (finishReason=none)')).code).toBe('empty_response')
  })

  it('recognises the abort the ladder itself imposes', () => {
    const e = new Error('The signal has been aborted')
    e.name = 'AbortError'
    expect(classifyModelFailure(e).code).toBe('timeout')
  })

  it('keeps an unrecognised failure as unknown WITH its message', () => {
    // A class of failure never seen before must show up as a rising count, not
    // get filed under the nearest familiar code.
    const r = classifyModelFailure(new Error('socket hang up'))
    expect(r.code).toBe('unknown')
    expect(r.detail).toBe('socket hang up')
  })

  it('truncates the detail to what the column accepts', () => {
    const r = classifyModelFailure(new Error('x'.repeat(1000)))
    expect(r.detail).toHaveLength(DETAIL_MAX)
    expect(Number(SQL.match(/length\(failure_detail\) <= (\d+)/)![1])).toBe(DETAIL_MAX)
  })
})

describe('the questions C8 says are unanswerable', () => {
  it('"are we silently serving the second-choice model?"', () => {
    expect(servedFromFallback([
      { attemptIndex: 0, outcome: 'failed' },
      { attemptIndex: 1, outcome: 'succeeded' },
    ])).toBe(true)
    expect(servedFromFallback([{ attemptIndex: 0, outcome: 'succeeded' }])).toBe(false)
  })

  it('counts a recovered retry as ONE generation, not two', () => {
    // ⚠️ COUNTING ATTEMPTS AS RUNS WOULD INFLATE EVERY RATE COMPUTED AGAINST IT.
    const s = attemptSummary([
      { attemptIndex: 0, outcome: 'failed', failureCode: 'timeout' },
      { attemptIndex: 1, outcome: 'succeeded' },
      { attemptIndex: 0, outcome: 'succeeded' },
    ])
    expect(s.runs).toBe(2)
    expect(s.failed).toBe(1)
    expect(s.fellBack).toBe(1)
    expect(s.byCode).toEqual({ timeout: 1 })
  })
})

describe('the row exists before the call, or it cannot describe a failure', () => {
  it('opens the row BEFORE callOnce and settles it after', () => {
    const ladder = EDGE.slice(EDGE.indexOf('let lastParseable'), EDGE.indexOf('// No attempt returned a COMPLETE'))
    // ⚠️ PRESENCE FIRST. `indexOf` returns -1 when the call is GONE, and -1 is
    // less than every real index — so an ordering assertion alone passes on the
    // exact mutation it exists to catch. Found by running that mutation.
    expect(ladder).toMatch(/const rowId = await record\?\.started\(i, a\.model\)/)
    expect(ladder.indexOf('record?.started')).toBeGreaterThanOrEqual(0)
    expect(ladder.indexOf('record?.started')).toBeLessThan(ladder.indexOf('await callOnce'))
    expect(ladder).toMatch(/record\?\.settled\(rowId, 'succeeded'\)/)
    expect(ladder).toMatch(/record\?\.settled\(rowId, 'failed', classifyModelFailure\(e\)\)/)
  })

  it('records an incomplete blueprint as neither success nor failure', () => {
    expect(EDGE).toMatch(/record\?\.settled\(rowId, 'incomplete'/)
    expect(SQL).toMatch(/outcome in \('started', 'succeeded', 'incomplete', 'failed'\)/)
  })

  it('is actually passed a recorder on the generation path', () => {
    // A classifier nothing calls is the defect this record exists to remove.
    expect(EDGE).toMatch(/callModel\(apiKey, SYSTEM, userPrompt, blueprintSchema,\s*\n?\s*attemptRecorder\(admin, ownerId, scriptRunId\)\)/)
  })

  it('links the generation only when one exists', () => {
    // ⚠️ AN UNLINKED ROW IS THE SIGNAL, NOT A GAP: a run that never produced a
    // script. Backfilling it would erase the thing being measured.
    expect(EDGE).toMatch(/if \(gen\?\.id\) \{/)
    expect(EDGE).toMatch(/\.eq\('run_id', scriptRunId\)/)
  })

  it('cannot store a failure without a code', () => {
    expect(SQL).toMatch(/outcome <> 'failed' or failure_code is not null/)
  })

  it('never lets telemetry break a generation', () => {
    // This runs on the paying path. An insert that throws must not turn a script
    // the creator was about to receive into "Generation failed."
    const rec = EDGE.slice(EDGE.indexOf('function attemptRecorder'), EDGE.indexOf('async function callModel'))
    expect(rec).toMatch(/catch \(e\) \{ console\.warn\('script attempt not recorded:'/)
    expect(rec).toMatch(/catch \(e\) \{ console\.warn\('script attempt not settled:'/)
  })
})

describe('the edge copy matches shared', () => {
  it('classifies by the same rules', () => {
    // ⚖️ THE BODY, NOT THE SIGNATURE. The edge cannot name `ScriptFailure`, so
    // the return annotations legitimately differ; what must never differ is the
    // rule that decides which code a failure gets.
    const lift = (s: string) => s.slice(
      s.indexOf('const raw = err instanceof Error', s.indexOf('function classifyModelFailure')),
      s.indexOf("return { code: 'unknown', detail }"),
    ).replace(/^\s*\/\/.*$/gm, ' ').replace(/\s+/g, ' ')
    const SHARED = readFileSync(join(REPO, 'packages/shared/src/scriptAttempt.ts'), 'utf8')
    expect(lift(EDGE)).toBe(lift(SHARED))
  })

  it('caps the detail at the same length in both', () => {
    expect(EDGE).toMatch(/const DETAIL_MAX = 300/)
    expect(DETAIL_MAX).toBe(300)
  })
})
