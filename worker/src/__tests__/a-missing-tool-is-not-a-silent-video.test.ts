// "NO FRAMES" MUST SAY WHETHER THE TOOL WAS MISSING OR THE VIDEO WAS.
//
// ⚠️ THE DEFECT IS A FINDING ABOUT THE BOX REPORTED AS A FINDING ABOUT THE
// LIBRARY. sampleFrames catches every ffmpeg failure with `catch { continue }`,
// so a container without ffmpeg, a corrupt download and a genuinely
// unsamplable video all arrive as framesSampled: 0. The #58 pilot then reports
// "8 references yielded no frames" — which reads as evidence that the visual
// pass cannot help those references, and would be the wrong conclusion drawn
// from a missing package.
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const src = () => readFileSync(new URL('../visualPass.ts', import.meta.url), 'utf8')

describe('the two zeros are told apart', () => {
  it('asks whether ffmpeg is there before blaming the video', () => {
    const zeroPath = src().slice(src().indexOf('sample.framesSampled === 0'),
      src().indexOf('let raw: unknown'))
    expect(zeroPath).toContain('ffmpegPresent()')
    expect(zeroPath).toContain('FFMPEG_MISSING')
    expect(zeroPath).toContain('NO_FRAMES_SAMPLED')
  })

  it('only on the zero path, so a healthy pass pays nothing', () => {
    // ⚖️ A probe on every reference would spend a subprocess per video to answer
    // a question that is only interesting when something already went wrong.
    const s = src()
    const zeroAt = s.indexOf('sample.framesSampled === 0')
    const probeAt = s.indexOf('await ffmpegPresent()')
    expect(probeAt).toBeGreaterThan(zeroAt)
    // ⚠️ EXACTLY ONE CALL SITE. A second one would mean the probe had drifted
    // onto the healthy path, which is the cost this test exists to hold down.
    expect(s.split('await ffmpegPresent()').length - 1).toBe(1)
  })

  it('ffmpegPresent is actually wired now', async () => {
    // ⚠️ IT EXISTED AND NOTHING CALLED IT. Its own comment said it was "used by
    // the capability probe"; there was no capability probe. A check that cannot
    // fire is not a check, and this repo has paid for that twice today already.
    const fs = readFileSync(new URL('../frameSample.ts', import.meta.url), 'utf8')
    expect(fs).toContain('export async function ffmpegPresent')
    expect(src()).toContain("from './frameSample.js'")
  })
})

describe('the failure code stays comparable to the transcript ladder', () => {
  it('is a code, not a sentence', () => {
    // The transcript and frames passes share a failure vocabulary so the
    // library's counts are comparable; a free-text reason here would make
    // FFMPEG_MISSING uncountable beside classifyDownloadFailure's codes.
    expect(src()).toMatch(/NOT_RUN\(haveFfmpeg \? 'NO_FRAMES_SAMPLED' : 'FFMPEG_MISSING'/)
  })

  it('still never throws — a frames failure cannot lose a transcript', () => {
    const zeroPath = src().slice(src().indexOf('sample.framesSampled === 0'),
      src().indexOf('let raw: unknown'))
    expect(zeroPath).not.toContain('throw ')
    expect(zeroPath).toContain('return NOT_RUN(')
  })
})
