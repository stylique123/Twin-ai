// A VOICE SAID `ready` AND KNEW NOTHING, AND HALF THE SCRIPT BECAME A QUESTION.
//
// ⚠️ MEASURED IN PRODUCTION. Brand voice d8049e9b sat at `ready` with ZERO
// `creator_knowledge` rows, while every other ready voice held between 2 and 51.
// It was a second account scanning a handle somebody had scanned days earlier:
// `start-dna` found the handle in `dna_cache`, copied the profile, returned
// `job_id: null`, and no scan was ever enqueued.
//
// ⚠️ AND IT REACHED THE TELEPROMPTER. `creator_knowledge` is what the
// entitlement check draws on, so with none of it every substantive beat failed
// and `generate-blueprint` correctly refused to fabricate — writing "Only you
// can supply this. What would you actually say here?" as the SPOKEN LINE on
// three of six scenes of a paid generation. The creator saw signature phrases
// and recurring CTAs summarised confidently over an empty table.
//
// ⚖️ THE CACHE WAS NOT WRONG WHEN IT WAS WRITTEN. Its comment claims "zero
// quality change (same posts, same profile)", and that was true while the
// profile WAS the artefact. Knowledge extraction arrived later, keyed to the
// voice rather than the handle, and the cache quietly began reusing one half of
// a thing that had become two.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const FN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'supabase', 'functions')
const START_DNA = readFileSync(join(FN, 'start-dna', 'index.ts'), 'utf8')

/** ⚠️ CODE ONLY — THE FIRST DRAFT FAILED ON ITS OWN PROSE. The comment inside
 *  this branch quotes `job_id: null` while explaining why it is gone, and a
 *  plain text search cannot tell an explanation from the thing it describes. */
const stripComments = (src: string): string =>
  src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

/** The cache branch, from its test to the return that closes it. */
const CACHE_BRANCH = (() => {
  const start = START_DNA.indexOf('if (cached?.profile) {')
  expect(start).toBeGreaterThan(-1)
  const end = START_DNA.indexOf('cached: true', start)
  expect(end).toBeGreaterThan(start)
  return stripComments(START_DNA.slice(start, end))
})()

describe('a cache hit hands over the profile without skipping the scan', () => {
  it('enqueues the knowledge scan on the cached path', () => {
    // ⚠️ THE EXACT LINE THIS EXISTS FOR. Without it the voice is ready and the
    // knowledge table stays empty forever — there is no later trigger.
    expect(CACHE_BRANCH).toMatch(/type: 'scrape_dna'/)
    expect(CACHE_BRANCH).toMatch(/status: 'queued'/)
  })

  it('never returns a null job id from the cached path again', () => {
    // ⚖️ `job_id: null` WAS THE WHOLE SYMPTOM, and it is also what `dna-poll`
    // reads: no job plus a usable profile is precisely the branch that stamps a
    // voice ready. Returning the real job id closes it at the source.
    expect(CACHE_BRANCH).not.toMatch(/job_id: null/)
    expect(START_DNA).toMatch(/job_id: knowledgeJob\?\.id \?\? null/)
  })

  it('scopes the job to the voice being built, not the cached one', () => {
    // ⚠️ A JOB CARRYING THE WRONG VOICE ID WOULD FILL SOMEBODY ELSE'S TABLE and
    // leave this one exactly as empty as before — a fix that reports success.
    expect(CACHE_BRANCH).toMatch(/brand_voice_id: voiceId/)
    expect(CACHE_BRANCH).toMatch(/owner_id: user\.id/)
  })

  it('still marks the voice ready, so nobody waits for what we already have', () => {
    // ⚖️ THE POINT OF THE CACHE SURVIVES. The profile is real and instant; what
    // changes is that the voice no longer claims knowledge it does not hold.
    expect(CACHE_BRANCH).toMatch(/status: 'ready', profile: cached\.profile/)
  })

  it('keeps the cache read on the service-role table, not the user-writable one', () => {
    // ⚠️ A SECURITY BOUNDARY THAT MUST NOT MOVE WHILE FIXING SOMETHING ELSE.
    // `brand_voices.profile` is user-writable; poisoning it would poison every
    // later scan of that handle. 0017 is the reason the cache reads `dna_cache`.
    expect(START_DNA).toMatch(/from\('dna_cache'\)/)
    expect(CACHE_BRANCH).not.toMatch(/from\('brand_voices'\)\s*\.select/)
  })
})

describe('what a refresh must still do', () => {
  it('a refresh skips the cache entirely', () => {
    // ⚖️ Unchanged and load-bearing: the point of a refresh is fresh stats and a
    // re-read of the latest posts, not a recent snapshot handed back.
    expect(START_DNA).toMatch(/cacheDays > 0 && !isRefresh/)
  })
})

// ── AND AN ALREADY-EMPTY VOICE REPAIRS ITSELF ─────────────────────────────
//
// ⚠️ THE START-DNA FIX HELPS NOBODY WHO ALREADY HAS THE EMPTY VOICE. It stops
// the next account being created this way; it does nothing for the account that
// already is. The only remedy on offer was "know to press refresh in Settings",
// which is not a remedy — it is a creator being asked to diagnose us.
//
// ⚖️ SO THE NEXT GENERATION SCHEDULES THE MISSING SCAN. It cannot help THAT
// script — the job runs on the worker, minutes later — and it means the video
// after it is written from real material rather than none.
const BLUEPRINT = readFileSync(join(FN, 'generate-blueprint', 'index.ts'), 'utf8')

describe('a voice with no knowledge schedules its own scan', () => {
  it('enqueues the scan the account never got', () => {
    expect(BLUEPRINT).toMatch(/event: 'empty_voice_scan_enqueued'/)
    expect(BLUEPRINT).toMatch(/type: 'scrape_dna'/)
  })

  it('only when there is genuinely nothing', () => {
    // ⚠️ A voice WITH knowledge must not be re-scanned. Both reads have to be
    // empty — the ranked one and the asked one — or a creator whose only rows
    // came from answering questions would be scanned on every generation.
    expect(BLUEPRINT).toMatch(
      /\(rankedRows\?\.length \?\? 0\) === 0 && \(askedRows\?\.length \?\? 0\) === 0/)
  })

  it('never queues a second scan behind an existing one', () => {
    // ⚠️ A SCAN COSTS REAL MONEY. Without this the repair fires on every
    // generation until the first job finishes, which is the cheapest possible
    // way to turn a fix into an incident.
    expect(BLUEPRINT).toMatch(/\.in\('type', \['scrape_dna', 'build_dna'\]\)/)
    expect(BLUEPRINT).toMatch(/if \(!existingScan\)/)
  })

  it('cannot fail the generation it runs inside', () => {
    // ⚖️ A REPAIR THAT CAN BREAK A PAID SCRIPT IS WORSE THAN THE GAP IT CLOSES.
    const region = BLUEPRINT.slice(
      BLUEPRINT.indexOf('A READY VOICE WITH NO KNOWLEDGE REPAIRS ITSELF'),
      BLUEPRINT.indexOf('DEDUPED BY IDENTITY'))
    expect(region).toMatch(/try \{/)
    expect(region).toMatch(/catch \(e\) \{/)
    expect(region).toMatch(/empty_voice_repair_failed/)
  })

  it('leaves a durable record, not just a console line', () => {
    // ⚖️ Edge logs expire. `ops_events` is the table an operator already
    // watches, and this is the signal that says how often the empty-shell voice
    // reached a real generation.
    expect(BLUEPRINT).toMatch(/kind: 'empty_voice_scan_enqueued'/)
  })
})
