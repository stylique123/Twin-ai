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
    const loop = VOICE.slice(VOICE.indexOf('for (const url of urls)'), VOICE.indexOf('if (!transcripts.length)'))
    expect(loop).toMatch(/try \{[\s\S]*?\.from\('transcripts'\)[\s\S]*?\} catch/)
  })

  it('COUNTS a failed store rather than swallowing it', () => {
    // ⚠️ A silent store failure is how the table stayed empty while every scan
    // reported success.
    expect(VOICE).toMatch(/bump\('store_failed'\)/)
    expect(VOICE).toMatch(/bump\('stored'\)/)
  })

  it('still pushes the text for synthesis whether or not the store worked', () => {
    // The upgrade path must not become conditional on persistence.
    const i = VOICE.indexOf('transcripts.push(text)')
    const j = VOICE.indexOf("from('transcripts')")
    expect(i).toBeGreaterThan(-1)
    expect(i).toBeLessThan(j)
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
