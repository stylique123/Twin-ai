// REFERENCE-1 — "did we actually watch the video, or pattern-match?"
//
// `generate-blueprint` has always branched on this: a real transcript reaches
// the prompt, or the model is told to reason from the format and to frame
// `why_it_works` as a claim about the FORMAT rather than about that clip.
// Nothing recorded which branch ran, and both return a confident-looking
// `reference_read`.
//
// So a creator pastes a link, waits, and gets an analysis. The fallback is
// reached by ingest failure, an unsupported host, a private post or a timeout —
// all silent, all producing an identical screen. They extend the trust earned
// by the real path to the inferred one, and find out when a "retention insight"
// describes a video that does not exist.
//
// These tests are about the THIRD STATE more than the other two. Defaulting an
// absent record to `pattern` would put "we could not read this" on generations
// that were read perfectly well — inventing a fact about history to make a
// badge render.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  readReferenceAnalysis, referenceDisclosure, shouldDiscloseReference,
} from '../referenceAnalysis'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../..')

describe('unset is its own state, and it is not "pattern"', () => {
  it('a generation predating the column reads as unknown', () => {
    // The whole reason this is a function and not `?.mode` at each call site.
    for (const missing of [null, undefined]) {
      expect(readReferenceAnalysis(missing).mode).toBe('unknown')
    }
  })

  it('unknown discloses NOTHING', () => {
    // "We do not know which path ran" is not a sentence a creator can act on,
    // and the alternative — assuming the fallback — would slander a generation
    // that was read properly.
    const a = readReferenceAnalysis(null)
    expect(shouldDiscloseReference(a)).toBe(false)
    expect(referenceDisclosure(a)).toBeNull()
  })

  it('survives every junk value a jsonb column could hold', () => {
    for (const junk of ['a string', 42, ['x'], true, {}, { mode: 'invented' }]) {
      expect(readReferenceAnalysis(junk).mode).toBe('unknown')
    }
  })
})

describe('only the fallback earns a notice', () => {
  it('pattern discloses, with the server-supplied reason', () => {
    const a = readReferenceAnalysis({ mode: 'pattern', reason: 'We could not read this video.' })
    expect(shouldDiscloseReference(a)).toBe(true)
    expect(referenceDisclosure(a)).toBe('We could not read this video.')
  })

  it('pattern with no reason still discloses, with a usable default', () => {
    // The notice matters more than the cause. A fallback that stayed silent
    // because the server forgot a reason is the original bug again.
    const a = readReferenceAnalysis({ mode: 'pattern' })
    expect(shouldDiscloseReference(a)).toBe(true)
    expect(referenceDisclosure(a)).toMatch(/format/i)
  })

  it('real discloses nothing', () => {
    // Badging the normal case turns the promise into a claim, and a screen
    // covered in reassurance reads as one with something to reassure about.
    expect(shouldDiscloseReference(readReferenceAnalysis({ mode: 'real' }))).toBe(false)
  })

  it('none discloses nothing — it was the creator\'s own choice', () => {
    expect(shouldDiscloseReference(readReferenceAnalysis({ mode: 'none' }))).toBe(false)
  })
})

describe('a reason belongs only to the fallback', () => {
  it('a reason on `real` is dropped, not shown', () => {
    // It would describe a failure that did not happen. The CHECK refuses it;
    // the reader refuses it again, because the column can hold rows written
    // before a constraint existed.
    const a = readReferenceAnalysis({ mode: 'real', reason: 'ingest failed' })
    expect(a.reason).toBeNull()
  })

  it('an empty or whitespace reason is not a reason', () => {
    for (const r of ['', '   ']) {
      expect(readReferenceAnalysis({ mode: 'pattern', reason: r }).reason).toBeNull()
    }
  })
})

describe('the TypeScript modes and the SQL CHECK cannot drift', () => {
  const sql = readFileSync(
    resolve(REPO, 'supabase/migrations/0110_reference_analysis_provenance.sql'), 'utf8')

  it('every storable mode is named in the migration', () => {
    for (const mode of ['real', 'pattern', 'none']) expect(sql).toContain(`'${mode}'`)
  })

  it('`unknown` is NOT storable — it is the absence of a row value', () => {
    // If the migration ever accepted it, the column would gain a fourth state
    // meaning the same as NULL and counted differently by whoever forgets.
    expect(sql).not.toMatch(/in \('real', 'pattern', 'none', 'unknown'\)/)
  })

  it('the column is not client-writable', () => {
    // A column a client can write is a column that can claim we watched a video
    // we did not.
    expect(sql).not.toMatch(/grant update \(reference_analysis\)/)
  })
})
