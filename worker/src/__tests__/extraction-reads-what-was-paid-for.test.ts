// THE SCAN PAID FOR TWENTY-FIVE VIDEOS AND THE EXTRACTOR READ THREE.
//
// ⚠️ `extractKnowledgeFromAudio` joined every transcript and then
// `.slice(0, 12000)`. Production transcripts average 3,622 characters, so the
// corpus was three videos. TikTok's free budget transcribes 25 — twenty-two of
// them were discarded before the extractor saw them, on the one platform where
// the material costs nothing.
//
// ⚖️ IT IS THE SAME DEFECT AS THE `.slice(0, 5)` IN THE CONSUMER, which made two
// separate budget raises inert and whose own comment names the rule: two places
// deciding how much material gets used, one of them silent.
//
// ⚠️ AND IT CORRUPTED THE NUMBER THAT JUSTIFIED HOLDING THE BUDGET. "One to
// two-and-a-half substance items per transcribed video" divides by videos
// TRANSCRIBED rather than videos READ.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const VOICE = readFileSync(join(SRC, 'voice.ts'), 'utf8')

/** ⚠️ COMMENTS STRIPPED, AND THE FIRST DRAFT FAILED WITHOUT IT. These
 *  assertions are about CODE — the prose above the function quotes the very
 *  `.slice(0, 12000)` it describes removing, and says "NO DEDUPE HERE", so a
 *  raw-text search finds the defect in the explanation of its own fix. */
const stripComments = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')

/** The extractor's body, so an assertion cannot pass on a different function. */
const BODY = stripComments(VOICE.slice(
  VOICE.indexOf('export async function extractKnowledgeFromAudio'),
))

describe('the corpus cap is gone', () => {
  it('does not truncate the whole corpus to one window', () => {
    // ⚠️ THE EXACT LINE THIS TEST EXISTS FOR.
    expect(BODY).not.toMatch(/\.join\('\\n\\n'\)\s*\n?\s*\.slice\(0, 12000\)/)
    expect(BODY).not.toMatch(/\.slice\(0, 12_?000\)/)
  })

  it('batches instead, so every transcript lands in exactly one call', () => {
    expect(BODY).toMatch(/const batches: string\[\] = \[\]/)
    expect(BODY).toMatch(/for \(const corpus of batches\)/)
  })

  it('keeps the per-call window unchanged, moving ONE thing at a time', () => {
    // ⚖️ Widening the window AND batching would leave neither attributable.
    expect(VOICE).toMatch(/EXTRACT_WINDOW_CHARS = 12_000/)
  })
})

describe('what it still drops, it says', () => {
  it('warns naming how many were read of how many exist', () => {
    // ⚠️ THE SILENCE WAS THE DEFECT, not the bound. A cap that announces itself
    // is a decision; one that does not is the thing this repo keeps finding.
    expect(BODY).toMatch(/read \$\{read\} of \$\{transcripts\.length\} transcripts/)
  })

  it('bounds the number of calls, because each one is spend', () => {
    expect(VOICE).toMatch(/EXTRACT_MAX_BATCHES = 5/)
    expect(BODY).toMatch(/batches\.length < EXTRACT_MAX_BATCHES/)
  })
})

describe('failure keeps what already succeeded', () => {
  it('returns the items collected so far rather than discarding them', () => {
    // ⚖️ Returning [] on a late batch would throw away earlier work because
    // later work failed — and knowledge is an enrichment, never a gate.
    const cat = BODY.slice(BODY.indexOf('} catch'))
    expect(cat).toMatch(/return items/)
    expect(cat).not.toMatch(/return \[\]/)
  })

  it('still never fails the voice build', () => {
    expect(BODY).toMatch(/try \{/)
    expect(BODY).toMatch(/\} catch/)
  })
})

describe('it does not grow a second deduplication rule', () => {
  it('leaves repeat-collapsing to the merge that already does it', () => {
    // ⚠️ TWO ANSWERS TO ONE QUESTION START DISAGREEING. canonicaliseRepeats and
    // the insert-time merge already collapse repeats across the whole store.
    expect(BODY).not.toMatch(/dedupe|new Set\(items|uniqueBy/i)
  })
})

// ── THE FOURTH INSTANCE, CREATED BY THE FIX FOR THE THIRD ──────────────────
//
// ⚠️ RAISING WHAT THE EXTRACTOR READS MADE A DORMANT CAP LIVE. `.slice(0, 40)`
// sat in TWO files and never bound anything while the extractor saw three
// videos. Reading fifteen makes it the thing that decides what survives — the
// same shape as the three caps before it, and introduced by their repair.
import { KNOWLEDGE_ROWS_PER_SCAN } from '../knowledgeInsert.js'

describe('the write cap is named, shared, and proportionate', () => {
  const BUILD = readFileSync(join(SRC, 'jobs', 'voice.ts'), 'utf8')
  const SCAN = readFileSync(join(SRC, 'jobs', 'scrapeDna.ts'), 'utf8')

  it('neither writer carries a bare number any more', () => {
    for (const src of [BUILD, SCAN]) {
      expect(stripComments(src)).not.toMatch(/\.slice\(0, 40\)/)
      expect(src).toMatch(/\.slice\(0, KNOWLEDGE_ROWS_PER_SCAN\)/)
    }
  })

  it('BOTH import the same constant, rather than agreeing by coincidence', () => {
    // ⚠️ Two places deciding how much material survives, one of them silent, is
    // the exact shape of every instance this file records.
    for (const src of [BUILD, SCAN]) {
      expect(src).toMatch(/import \{ insertKnowledge, KNOWLEDGE_ROWS_PER_SCAN \}/)
    }
  })

  it('clears what five batches can realistically produce', () => {
    // ⚖️ A cap below the extractor's own yield is the defect, not the bound.
    expect(KNOWLEDGE_ROWS_PER_SCAN).toBeGreaterThanOrEqual(100)
  })
})
