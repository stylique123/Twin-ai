// THE SECOND DOWNLOAD IS OPT-IN, AND OPT-IN MEANS EXACTLY `true`.
//
// ⚠️ THE FRAMES PASS COSTS A SECOND DOWNLOAD PER REFERENCE. With ~3,000 TikTok
// URLs queued, a payload that enables it by accident doubles the bandwidth of
// the entire backlog before anybody notices. `parseRoute` already follows this
// rule for the paid rungs — a malformed payload must never be the reason we
// start spending — and this is the same rule for the same reason.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const JOB = readFileSync(join(REPO, 'worker/src/jobs/assessReference.ts'), 'utf8')
const PASS = readFileSync(join(REPO, 'worker/src/visualPass.ts'), 'utf8')

describe('enabling the frames pass', () => {
  it('tests for exactly true, never truthiness', () => {
    // ⚠️ `if (p.frames)` would enable the pass on the STRING "false", on 1, and
    // on {} — three shapes a hand-written or JSON-round-tripped payload
    // plausibly carries.
    expect(JOB).toContain('p.frames === true')
    expect(JOB).not.toMatch(/if \(p\.frames\)/)
  })

  it('feeds the content pass beats into the sampler', () => {
    // ⚖️ `frameSampleTargets` is described in referenceProfileTypes.ts as "the
    // reader that justifies storing Beat.startSec at all". Not calling it would
    // strand the field and sample worse frames.
    expect(JOB).toContain('frameSampleTargets(profile)')
  })
})

describe('a second pass may not erase a first', () => {
  it('writes visual columns only when the pass actually ran', () => {
    // ⚠️ "we looked and learned nothing" and "we never looked" are different
    // rows. Stamping visual_assessed_at on a pass that could not download would
    // retire a reference nobody has seen.
    expect(JOB).toContain('visual?.ran')
    expect(JOB).toContain('visual_assessed_at: assessedAt')
  })

  it('never throws out of the visual pass', () => {
    // A transcript that succeeded must survive a frames pass that did not.
    // `runVisualPass` returns NOT_RUN for every failure rather than throwing,
    // which is 0143's rule applied one layer up.
    expect(PASS).toContain('THROWS FOR NOTHING')
    expect(PASS).toContain('NOT_RUN(classifyDownloadFailure(e), phaseOf(e))')
  })

  it('reuses the transcript ladder failure vocabulary', () => {
    // ⚖️ A video IP-blocked for frames is IP-blocked for audio. Two vocabularies
    // for one fact would make the library's failure counts uncomparable.
    expect(PASS).toContain("from './downloadFailure.js'")
  })

  it('refuses to read a response produced from zero frames', () => {
    // ⚠️ A model answering with nothing to look at is answering from the
    // caption — the WRONG EPISTEMIC SOURCE, not weak visual evidence.
    expect(PASS).toContain("NOT_RUN('NO_FRAMES_SAMPLED'")
  })

  it('range-checks against what landed, not what was requested', () => {
    expect(PASS).toContain('framesSampled: sample.framesSampled')
  })
})
