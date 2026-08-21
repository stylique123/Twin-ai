// A PASS THAT TRIED AND COULD NOT MUST NOT LOOK LIKE ONE NOBODY RAN.
//
// ⚠️ THE DEFECT: assessReference wrote the visual columns only when the pass
// RAN, so a failure left frames_sampled null — byte-identical to a reference
// nobody looked at. The code survived only in the job's result JSON, keyed by
// job rather than by reference. The pilot's attrition table, which is the
// pilot's entire output, could not tell a broken box from a blocked download
// from a job that never ran. Three causes, three different next actions, one
// number.
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const JOB = readFileSync(new URL('../jobs/assessReference.ts', import.meta.url), 'utf8')
const MIG = readFileSync(new URL(
  '../../../supabase/migrations/0162_a_pass_that_failed_says_so_where_the_reference_lives.sql',
  import.meta.url), 'utf8')

describe('the failure is written where the reference lives', () => {
  // ⚠️ ASSERTED ON THE TWO UPSERTS, NOT ON A COUNT. Counting occurrences caught
  // a THIRD one and failed — the job's RETURN VALUE, which has carried the code
  // all along and is not a durable write. That is the whole defect in one
  // detail: the code existed in a job result and nowhere a later query could
  // find it, keyed by reference.
  const noSpeechUpsert = () => {
    const b = JOB.slice(JOB.indexOf('if (goesToFrames(routing))'), JOB.indexOf("skipped: 'no_speech'"))
    return b.slice(b.indexOf('.upsert({'))
  }
  const speechUpsert = () => {
    const at = JOB.lastIndexOf("const { error: wrote }")
    return JOB.slice(at, JOB.indexOf('onConflict', at))
  }

  it('records the code in the no-speech upsert', () => {
    expect(noSpeechUpsert()).toContain('visual_failure_code: visual.failure_code')
  })

  it('records the code in the speech-path upsert too', () => {
    // A fix on one path would leave the other silently unreadable.
    expect(speechUpsert()).toContain('visual_failure_code: visual.failure_code')
  })

  it('clears it on success in both, because both cannot be true', () => {
    expect(noSpeechUpsert()).toContain('visual_failure_code: null')
    expect(speechUpsert()).toContain('visual_failure_code: null')
  })
})

describe('the retry signal is left alone', () => {
  it('does NOT stamp visual_assessed_at on a failure', () => {
    // ⚠️ frame-pilot selects candidates with `!r.visual_assessed_at`. Stamping
    // it on a failure would permanently exclude a reference that failed for a
    // TRANSIENT reason — an IP block that lifts an hour later — and the
    // eligible population would shrink with nothing reporting it.
    const noSpeech = JOB.slice(JOB.indexOf('if (goesToFrames(routing))'), JOB.indexOf("skipped: 'no_speech'"))
    const failBranch = noSpeech.slice(noSpeech.indexOf('} : visual !== null ? {'))
    expect(failBranch).toContain('visual_failure_code: visual.failure_code')
    expect(failBranch).not.toContain('visual_assessed_at: assessedAt')
  })

  it('still stamps it on success, so a later run knows not to redo the work', () => {
    const noSpeech = JOB.slice(JOB.indexOf('if (goesToFrames(routing))'), JOB.indexOf("skipped: 'no_speech'"))
    const okBranch = noSpeech.slice(noSpeech.indexOf("visual?.ran === true ? {"),
      noSpeech.indexOf('} : visual !== null ? {'))
    expect(okBranch).toContain('visual_assessed_at: assessedAt')
  })
})

describe('the database refuses the contradiction rather than trusting writers', () => {
  it('0162 forbids a row claiming both a frames success and a frames failure', () => {
    expect(MIG).toContain('reference_content_profiles_visual_outcome_is_one_thing')
    expect(MIG).toContain('check (visual_failure_code is null or frames_sampled is null)')
  })

  it('adds the column additively, so an older worker keeps working', () => {
    expect(MIG).toContain('add column if not exists visual_failure_code')
  })
})

describe('the report says WHY, not just how many', () => {
  it('breaks failures out by code', () => {
    const REPORT = readFileSync(new URL('../../../scripts/frame-pilot-cohort.mjs', import.meta.url), 'utf8')
    expect(REPORT).toContain('failures_by_code')
    // ⚖️ AND NAMES THE REMAINDER. Everything neither looked at nor failed is
    // un-attempted, and leaving it as a silent remainder invites reading it as
    // a yield.
    expect(REPORT).toContain('never_attempted')
    expect(REPORT).toContain('tried_and_failed')
  })
})
