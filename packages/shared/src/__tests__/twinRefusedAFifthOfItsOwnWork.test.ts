// TWIN REFUSED A FIFTH OF ITS OWN WORK AND NOBODY READ THE NUMBER.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-14, from `credit_events.reason`:
//
//   blueprint (charges)            141
//   blueprint_refund_quality        25
//   blueprint_refund (older path)    7
//   disclosure_missing               0
//   disclosure_denied                0
//
// 25 of 141 paid generations — 18% — were refunded because Twin judged its own
// output not good enough to charge for. The most direct quality signal in the
// product, accruing since before this was written, read by nothing.
//
// ⚠️⚠️ AND THE WIRING STANDARD SAYS REFUSALS ARE "never collected". THEY ARE
// COLLECTED — `refundOnce` passes its reason straight to `refund_credits`. The
// gap was gate 1, a reader, not gate 5. Grepping first found that; building a
// collector would have duplicated a working one. Twelfth stale entry.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
// ⚠️ THE GENERATED COPY, because that is what production runs. The source is
// scripts/owner-console.mjs and the generator keeps them identical; asserting
// against the source would let a stale generated file pass.
const SHARED_RAW = readFileSync(
  join(REPO, 'supabase', 'functions', '_shared', 'ownerConsole.ts'), 'utf8')
const ENDPOINT = readFileSync(
  join(REPO, 'supabase', 'functions', 'owner-console', 'index.ts'), 'utf8')
  .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

interface Card { card: string; state: string; ownerAction: string | null; detail: string }

function loadCard() {
  const start = SHARED_RAW.indexOf('export const REFUSAL_MIN_CHARGES')
  expect(start, 'refusalCard block missing from the GENERATED file').toBeGreaterThan(-1)
  // `export` comes off first: left on, esbuild emits CJS machinery referencing
  // `module`, which does not exist inside `new Function`.
  const js = transformSync(SHARED_RAW.slice(start).replace(/^export\s+/gm, ''),
    { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return { refusalCard, REFUSAL_MIN_CHARGES }`)() as {
    refusalCard: (c: unknown) => Card
    REFUSAL_MIN_CHARGES: number
  }
}

const { refusalCard, REFUSAL_MIN_CHARGES } = loadCard()
/** Production as measured on 2026-09-14. */
const TODAY = { charges: 141, qualityRefunds: 32, disclosureRefusals: 0 }

describe('the refusal rate is stated with its denominator', () => {
  it('quotes a rate, not a bare count', () => {
    // ⚠️ "25 refunds" means nothing without "of 141": a count alone rises with
    // traffic and would read as a regression on a good week.
    const c = refusalCard(TODAY)
    expect(c.detail).toContain('32 of 141')
    expect(c.detail).toContain('22.7%')
  })

  it('says Twin declined, and refuses to say why', () => {
    // A refund rate is consistent with a weak writer, a thin brief, an unusable
    // reference, or a strict gate. Naming one would be the same overreach the
    // funnel card refuses.
    const c = refusalCard(TODAY)
    expect(c.detail).toContain('says Twin declined, never why')
    const text = `${c.detail} ${c.ownerAction ?? ''}`.toLowerCase()
    for (const cause of ['weak', 'bad writer', 'the problem is', 'because the', 'caused by']) {
      expect(text, `must not assert a cause: ${cause}`).not.toContain(cause)
    }
  })

  it('keeps quality and disclosure refusals apart', () => {
    // A writer problem averaged with a compliance one hides both; they need
    // opposite fixes.
    const withDisclosure = refusalCard({ charges: 141, qualityRefunds: 32, disclosureRefusals: 4 })
    expect(withDisclosure.detail).toContain('4 refused on disclosure')
    expect(withDisclosure.detail).toContain('different failure')
    // And with none, the sentence is absent rather than reading "0 refused".
    expect(refusalCard(TODAY).detail).not.toContain('refused on disclosure')
  })

  it('a count that could not be read is NOT zero refunds', () => {
    for (const bad of [
      { charges: null, qualityRefunds: 32 },
      { charges: 141, qualityRefunds: null },
      null, undefined, {}, { charges: 'many', qualityRefunds: 1 },
    ]) {
      const c = refusalCard(bad)
      expect(c.state).toBe('blocked')
      expect(c.detail).toContain('not the same as no refunds')
    }
  })

  it('refuses a percentage below the floor', () => {
    expect(REFUSAL_MIN_CHARGES).toBe(20)
    const c = refusalCard({ charges: 19, qualityRefunds: 5, disclosureRefusals: 0 })
    expect(c.detail).toContain('too few to quote a rate from')
    expect(c.detail).not.toContain('%')
  })

  it('at exactly the floor it does quote', () => {
    expect(refusalCard({ charges: 20, qualityRefunds: 5, disclosureRefusals: 0 }).detail)
      .toContain('25%')
  })
})

describe('the endpoint reads it, and reads it honestly', () => {
  it('imports and calls refusalCard — the reader-removal assertion', () => {
    expect(ENDPOINT).toContain('refusalCard')
    expect(ENDPOINT).toContain('refusalCard(refusalCounts)')
  })

  it('counts BOTH refund spellings', () => {
    // ⚠️ `blueprint_refund` is the older path (7 rows, newest 2026-09-02) and
    // `blueprint_refund_quality` the current one (25). Reading only the new
    // name would report a rate that silently excludes 7 real refunds.
    expect(ENDPOINT).toContain("'blueprint_refund_quality', 'blueprint_refund'")
  })

  it('counts charges separately from refunds', () => {
    expect(ENDPOINT).toContain("countByReason(['blueprint'])")
  })

  it('passes null through rather than coercing a failed count', () => {
    const at = ENDPOINT.indexOf('const countByReason')
    const body = ENDPOINT.slice(at, ENDPOINT.indexOf('const refusalCounts'))
    expect(body).toContain('? null : count')
  })

  it('stays head-only and read-only', () => {
    const at = ENDPOINT.indexOf('const countByReason')
    const body = ENDPOINT.slice(at, ENDPOINT.indexOf('const funnelCounts'))
    expect(body).toContain("{ count: 'exact', head: true }")
    for (const write of ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']) {
      expect(body, `owner-console is read-only: ${write}`).not.toContain(write)
    }
  })
})
