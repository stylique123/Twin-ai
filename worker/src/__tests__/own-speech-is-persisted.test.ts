// THE CREATOR'S OWN SPEECH EXISTED FOR THE LENGTH OF ONE FUNCTION CALL.
//
// ⚠️ THE DEFECT THIS GUARDS WAS INTRODUCED BY THE FIX FOR ANOTHER ONE. 0135 gave
// `transcripts` a `subject` column so a voice compiler could read the creator's
// own speech and never a pasted reference — and the reader shipped against a
// table the DNA scan never writes to. `handleBuildVoice` transcribed the
// creator's videos into an in-memory array, synthesised the profile, extracted
// the knowledge, and dropped the transcripts on the floor. `public.transcripts`
// therefore held `ingest` rows only: 50 of 58 in production were other people's
// videos.
//
// ⚖️ SO THE READER HAD NO WRITER — the mirror image of the write-only pattern
// this repo has found in `product_entities`, six counters and
// `capability_flags`, and it would have presented as "the style block never
// renders" with nothing anywhere saying why.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const VOICE = readFileSync(join(SRC, 'jobs', 'voice.ts'), 'utf8')
const TRANSCRIBE = readFileSync(join(SRC, 'jobs', 'transcribe.ts'), 'utf8')

describe('the scan persists the speech it paid for', () => {
  it('writes a transcripts row from the build_voice loop', () => {
    expect(VOICE).toMatch(/await db\s*\n?\s*\.from\('transcripts'\)\s*\n?\s*\.insert\(\{/)
  })

  it("stamps it `own`, which is what the style compiler filters on", () => {
    // ⚠️ AN UNSTAMPED ROW IS INVISIBLE TO THE READER and a mis-stamped one
    // teaches the writer a stranger's cadence. Neither fails loudly.
    expect(VOICE).toMatch(/subject: 'own'/)
    expect(VOICE).not.toMatch(/subject: 'reference'/)
  })

  it('stores the URL it actually transcribed, not the handle or the job id', () => {
    expect(VOICE).toMatch(/source_url: url/)
  })

  it('carries the same fields the ingest path stores, so the two rows compare', () => {
    for (const field of ['language:', 'duration_sec:', 'words:', 'segments:']) {
      expect(VOICE).toContain(field)
      expect(TRANSCRIBE).toContain(field)
    }
  })
})

describe('storing must never cost the thing the job exists to do', () => {
  it('is wrapped so a storage failure cannot lose the voice upgrade', () => {
    // ⚖️ By the time this runs the transcript has already done its primary work.
    //
    // ⚠️ RE-ANCHORED 2026-09-17, CLAIM UNCHANGED. The serial `for (const url of
    // urls)` became `transcribeOne` fed to `mapWithConcurrency`, so the old
    // slice bounds matched nothing and this passed an EMPTY STRING to the regex
    // — which is exactly the vacuous pass a source anchor fails open into. The
    // slice is asserted non-empty first for that reason.
    const from = VOICE.indexOf('const transcribeOne')
    const to = VOICE.indexOf('const settled = await mapWithConcurrency')
    expect(from, 'transcribeOne is gone — re-anchor, do not delete').toBeGreaterThan(-1)
    expect(to).toBeGreaterThan(from)
    const body = VOICE.slice(from, to)
    expect(body.length).toBeGreaterThan(200)
    expect(body).toMatch(/try \{[\s\S]*?\.from\('transcripts'\)[\s\S]*?\} catch/)
  })

  it('COUNTS a failed store rather than swallowing it', () => {
    // ⚠️ A silent store failure is how the table stayed empty while every scan
    // reported success.
    expect(VOICE).toMatch(/bump\('store_failed'\)/)
    expect(VOICE).toMatch(/bump\('stored'\)/)
  })

  it('still hands the text back for synthesis whether or not the store worked', () => {
    // The upgrade path must not become conditional on persistence.
    //
    // ⚠️ RE-ANCHORED AND STRICTLY STRONGER. It used to assert that
    // `transcripts.push(text)` appeared BEFORE the insert — a proxy for the real
    // property. The text now leaves via `return text`, and the property is
    // asserted directly: that return sits AFTER the store's try/catch, so it is
    // reached whether the insert threw or not, and the catch does not short out.
    const from = VOICE.indexOf('const transcribeOne')
    const to = VOICE.indexOf('const settled = await mapWithConcurrency')
    const body = VOICE.slice(from, to)
    const store = body.indexOf("from('transcripts')")
    const ret = body.indexOf('return text')
    expect(store).toBeGreaterThan(-1)
    expect(ret, 'the text must still leave this function').toBeGreaterThan(-1)
    expect(ret, 'return text moved inside the store try — a failed insert would now lose the upgrade')
      .toBeGreaterThan(store)
    // ⚠️ AND THE STORE'S CATCH MUST NOT RETURN. A `return null` there would make
    // the voice upgrade conditional on persistence while leaving the ordering
    // above satisfied — the exact regression this file exists to prevent.
    const catchBlock = body.slice(body.indexOf("bump('store_failed')"), ret)
    expect(catchBlock).not.toMatch(/return\s+(null|undefined)/)

    // ⚠️ EXACTLY ONE EXIT FOR THE TEXT, ADDED BECAUSE A MUTANT SURVIVED. Putting
    // a second `return text` INSIDE the store's try satisfied every ordering
    // assertion above — `indexOf` finds the first one, and that copy also sits
    // after the insert — while making the happy path exit before the catch could
    // ever run. One exit is the property; ordering alone was not enough.
    expect((body.match(/return text\b/g) ?? []).length,
      'the text must leave by exactly one path, outside the store try').toBe(1)
  })

  // ⚠️ THE BATCH IS NOW SHARED, SO ONE VIDEO'S THROW IS EVERYONE'S PROBLEM.
  // `mapWithConcurrency` propagates a rejection by design, which means the
  // per-url function carries the whole tolerance the serial loop used to get
  // from the loop body. If this regresses, one private video loses an entire
  // creator's scan.
  it('a transcript failure costs one video, never the scan', () => {
    const from = VOICE.indexOf('const transcribeOne')
    const to = VOICE.indexOf('const settled = await mapWithConcurrency')
    const body = VOICE.slice(from, to)
    // The body is wrapped, and the wrapper's catch resolves to a value.
    expect(body).toMatch(/=>\s*\{\s*try\s*\{/)
    expect(body).toMatch(/bump\('failed'\)/)
    const failTail = body.slice(body.indexOf("bump('failed')"))
    expect(failTail, 'the outer catch must RETURN, not rethrow').toMatch(/return null/)
    expect(failTail).not.toMatch(/throw\b/)
  })
})

describe('the two writers agree on the cache key', () => {
  it('normalises the url the same way as the ingest path', () => {
    // ⚠️ TWO SPELLINGS OF THE KEY SPLIT THE CACHE, so one video pasted by
    // several people would stop hitting one row.
    const shape = /const host = u\.hostname\.toLowerCase\(\)\.replace\(\/\^www\\\.\/, ''\)/
    expect(VOICE).toMatch(shape)
    expect(TRANSCRIBE).toMatch(shape)
    expect(VOICE).toMatch(/const v = u\.searchParams\.get\('v'\)/)
    expect(TRANSCRIBE).toMatch(/const v = u\.searchParams\.get\('v'\)/)
  })
})
