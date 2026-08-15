// WHY WAS THIS CLAIM NOT MADE?
//
// ⚠️ C8 ITEM 3. `dna_claims` has real discipline on the OUTPUT — a correlation
// needs a sample size, a hypothesis stays untested, a business claim needs
// attribution — and there has never been any record of the RUN that produced it.
//
// ⚖️ EVERY STAGE OF A SCAN IS BEST-EFFORT BY DESIGN, and that is correct: a
// creator whose caption extraction breaks must still get their voice. The cost is
// that a failed brand kit, an empty extraction and a skipped transcript enqueue
// all leave a voice that says `ready`. So "this creator has no experiences" and
// "the extraction failed quietly three weeks ago" are the same observation from
// outside, and only one of them is about the creator.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCAN = readFileSync(join(SRC, 'jobs', 'scrapeDna.ts'), 'utf8')

describe('the stages travel with the job result', () => {
  it('returns them, rather than logging them', () => {
    // ⚠️ A LOG WOULD HAVE BEEN THE FOURTH COUNTER IN THREE DAYS TO EXPIRE BEFORE
    // ANYONE READ IT. The `jobs` row already exists and already survives.
    expect(SCAN).toMatch(/return \{ ok: true, posts_used: posts\.length, stages \}/)
  })

  it('needs no migration to start recording', () => {
    // ⚖️ Five columns and three tables this session, each an owner action before
    // it does anything. This one records on the next scan, not the next apply.
    expect(SCAN).not.toMatch(/from\('dna_run_events'\)/)
  })
})

describe('a stage says WHY, not only whether', () => {
  it('carries a bounded detail', () => {
    expect(SCAN).toMatch(/stages\.push\(detail \? \{ stage: name, outcome, detail: detail\.slice\(0, 300\) \}/)
  })

  it('records the reason on every failure path it wraps', () => {
    for (const s of ['synthesize_voice', 'caption_knowledge', 'transcripts_enqueued']) {
      expect(SCAN).toMatch(new RegExp(`stage\\('${s}', 'failed', err instanceof Error`))
    }
  })
})

describe('zero is a result, not an absence', () => {
  it('separates "extracted and found nothing" from "never ran"', () => {
    // ⚠️ THE EXACT AMBIGUITY THIS EXISTS TO REMOVE. A stage list recording only
    // failures answers neither.
    expect(SCAN).toMatch(/stage\('caption_knowledge', capturedKnowledge \? 'ok' : 'skipped'/)
    expect(SCAN).toMatch(/no items extracted from captions/)
  })

  it('records the branch where no transcripts could be selected', () => {
    expect(SCAN).toMatch(/stage\('transcripts_selected', urls\.length \? 'ok' : 'skipped'/)
  })

  it('records an OWNERLESS voice, which silently caps a store at captions', () => {
    // ⚖️ No owner means the audio upgrade is never queued, so the store can only
    // ever hold caption items — measured at 13% substance and ZERO experiences —
    // and nothing said so.
    expect(SCAN).toMatch(/stage\('transcripts_enqueued', 'skipped', 'no owner on the voice'\)/)
  })
})

describe('the record cannot cost the creator their voice', () => {
  it('never gates a stage on the recording succeeding', () => {
    // The whole point of best-effort stages is that they degrade. A stage
    // recorder that could throw would turn telemetry into an outage.
    const recorder = SCAN.slice(SCAN.indexOf('const stage = ('), SCAN.indexOf('let posts'))
    expect(recorder).not.toMatch(/await |throw /)
  })
})
