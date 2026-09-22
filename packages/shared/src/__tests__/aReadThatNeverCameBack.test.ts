// "TWIN IS READING THE PAGE" WITH NOBODY READING ANYTHING.
//
// ⚠️ REPORTED 2026-09-22: the reading state "appears stuck." It was not slow.
// `READING` is returned for any row that has a source, has never been
// extracted, and has recorded no failure — and no part of that description
// expires. A job enqueued and lost writes no `knowledge_failed_at`, so the row
// matches forever; `NEEDS_CREATOR_ACTION` deliberately excluded `READING`
// because it "finishes on its own"; and the card offered the creator nothing to
// press. The product waited for an event that was never coming.
//
// ⚠️⚠️ THE MUTANT THIS FILE EXISTS FOR IS "DELETE THE CUTOFF", which is the
// shipped behaviour and which every other test in this repo passes. A stall is
// invisible to any test that does not move the clock, because the row is
// byte-for-byte identical to a read that started one second ago. The only thing
// that distinguishes them is how long it has been, so that is what is asserted.
//
// ⚖️ THE BOUND IS MEASURED, NOT CHOSEN. Production 2026-09-22, every row ever
// extracted: the eight first reads took 5s to 1053s, the slowest under eighteen
// minutes. Thirty minutes is nearly twice the worst one ever seen.

import { describe, expect, it } from 'vitest'
import {
  productLifecycle, READ_STALLS_AFTER_MS, READ_DID_NOT_COME_BACK,
  LIFECYCLE_MESSAGE, NEEDS_CREATOR_ACTION,
} from '../index'
import type { ProductEntityRecord } from '../productEntity'

const T0 = Date.parse('2026-09-22T12:00:00Z')

const row = (over: Partial<ProductEntityRecord> = {}): ProductEntityRecord =>
  Object.assign({
    id: 'e1', name: 'Bandana', type: 'PHYSICAL_PRODUCT', relationship: 'OWN_PRODUCT',
    personalUse: 'CONFIRMED', showability: 'ALWAYS',
    productUrl: 'https://example.com/shop', affiliateUrl: null,
    evidence: null, restrictions: {}, source: 'user_answer', userConfirmed: true,
    knowledge: null, knowledgeExtractedAt: null, knowledgeSourceUrl: null,
    knowledgeFailedAt: null, knowledgeError: null, communityMap: null,
    creatorSummary: null, offer: null, archivedAt: null,
    updated: new Date(T0).toISOString(),
  } as unknown as ProductEntityRecord, over)

const at = (msLater: number, e = row()) => productLifecycle(e, 0, T0 + msLater)

describe('a read that never came back', () => {
  it('is still READING while the read could plausibly be running', () => {
    expect(at(0)).toBe('READING')
    expect(at(READ_STALLS_AFTER_MS - 1)).toBe('READING')
  })

  it('becomes READING_STALLED once it has outlasted every read ever measured', () => {
    expect(at(READ_STALLS_AFTER_MS + 1)).toBe('READING_STALLED')
    expect(at(30 * 24 * 60 * 60 * 1000)).toBe('READING_STALLED')
  })

  it('leaves the bound above the slowest first read production has recorded', () => {
    // 1053 seconds, measured. A bound at or under it would call a real read a stall.
    expect(READ_STALLS_AFTER_MS).toBeGreaterThan(1053 * 1000)
  })

  it('does not stall a row that never had anywhere to look', () => {
    // ⚠️ NEEDS_SOURCE OUTRANKS THE CLOCK. A product with no link has not been
    // reading for a month; nothing was ever started for it to stall.
    expect(at(READ_STALLS_AFTER_MS * 10, row({ productUrl: null }))).toBe('NEEDS_SOURCE')
  })

  it('does not stall a row that already reported its own failure', () => {
    // ⚖️ IMPORT_FAILED IS A DIFFERENT FACT AND KEEPS PRECEDENCE. Twin tried and
    // said so; that sentence is truer than "nothing reported".
    const e = row({ knowledgeFailedAt: new Date(T0).toISOString() } as Partial<ProductEntityRecord>)
    expect(at(READ_STALLS_AFTER_MS * 10, e)).toBe('IMPORT_FAILED')
  })

  it('does not stall a row that was read', () => {
    const e = row({ knowledge: [] } as Partial<ProductEntityRecord>)
    expect(at(READ_STALLS_AFTER_MS * 10, e)).toBe('NOTHING_FOUND')
  })

  it('never invents a stall from a timestamp it cannot read', () => {
    // ⚠️ BLAMING THE CREATOR FOR OUR OWN MISSING COLUMN IS THE WORSE FAILURE.
    const e = row({ updated: 'not a date' } as Partial<ProductEntityRecord>)
    expect(at(READ_STALLS_AFTER_MS * 10, e)).toBe('READING')
  })

  it('asks the creator for something, which READING deliberately does not', () => {
    // ⚠️ THIS IS THE HALF THAT MADE IT INVISIBLE. A stall wearing READING's
    // state inherited READING's exemption from the Products badge, so nothing
    // anywhere on the screen counted it.
    expect(NEEDS_CREATOR_ACTION.has('READING_STALLED')).toBe(true)
    expect(NEEDS_CREATOR_ACTION.has('READING')).toBe(false)
  })

  it('says what happened, and does not claim Twin is still reading', () => {
    const m = LIFECYCLE_MESSAGE.READING_STALLED
    expect(m).not.toMatch(/is reading/i)
    expect(m.length).toBeGreaterThan(0)
  })

  it('groups the two dead-read states so a screen reads them once', () => {
    expect([...READ_DID_NOT_COME_BACK].sort()).toEqual(['IMPORT_FAILED', 'READING_STALLED'])
    expect(READ_DID_NOT_COME_BACK.has('READING')).toBe(false)
  })
})
