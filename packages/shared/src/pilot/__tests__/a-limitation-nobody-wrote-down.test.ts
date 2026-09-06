import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KNOWN_LIMITATIONS } from '../knownLimitations'

/**
 * ⚠️ THE REGISTRY EXISTS TWICE AND ONLY ONE COPY WAS PINNED.
 *
 * `knownLimitations.ts` opens with "A LIMITATION NOBODY HAS WRITTEN DOWN BECOMES
 * THE DESIGN", and its own test pins the OPEN entries so that closing one is a
 * deliberate edit somebody reviews. That guard covers the TypeScript.
 *
 * `docs/known-limitations.md` is the copy a person actually reads — it is what
 * gets linked, quoted in a decision, and checked before someone relies on a
 * behaviour. Nothing kept the two in step. Measured before this guard existed:
 * the source carried 8 entries, 5 of them OPEN; the document carried 2. Three
 * OPEN limitations — the unenforced claim stop, the phase-5 teardown signature,
 * and the unfilmed per-type direction — existed only in code.
 *
 * A deferral recorded where the deciding reader will not see it is the exact
 * failure the file was written to prevent, one level up.
 */

const repo = join(import.meta.dirname, '..', '..', '..', '..', '..')
const doc = readFileSync(join(repo, 'docs', 'known-limitations.md'), 'utf8')

/** Every `## \`ID\` — STATUS` heading in the document. */
const docEntries = new Map(
  [...doc.matchAll(/^##\s+`([A-Z_0-9]+)`\s+—\s+(OPEN|RESOLVED)\s*$/gm)]
    .map((m) => [m[1], m[2]]),
)

describe('both records exist to be compared', () => {
  // ⚠️ AN EMPTY PARSE PASSES EVERY "for each" BELOW — the way a parity guard
  // becomes decoration. This repo has shipped that mistake before.
  it('the source registry is non-trivial', () => {
    expect(KNOWN_LIMITATIONS.length).toBeGreaterThanOrEqual(8)
  })

  it('the document parses into headings, not nothing', () => {
    expect(docEntries.size).toBeGreaterThanOrEqual(5)
  })
})

describe('every OPEN limitation is written down where a person reads it', () => {
  const open = KNOWN_LIMITATIONS.filter((l) => l.status === 'OPEN')

  it('there are OPEN limitations to check', () => {
    expect(open.length).toBeGreaterThan(0)
  })

  for (const l of open) {
    it(`${l.id} has a section in docs/known-limitations.md`, () => {
      expect(
        docEntries.has(l.id),
        `${l.id} is OPEN in knownLimitations.ts and absent from docs/known-limitations.md`,
      ).toBe(true)
    })
  }
})

describe('the two records agree on status', () => {
  // ⚖️ A RESOLVED ENTRY MAY STAY IN THE DOCUMENT — the history is worth
  // keeping. What must never happen is the two disagreeing about whether the
  // question is still open, because then quoting either one is a coin flip.
  for (const [id, docStatus] of docEntries) {
    it(`${id} carries the same status in both`, () => {
      const src = KNOWN_LIMITATIONS.find((l) => l.id === id)
      expect(src, `${id} is documented but absent from knownLimitations.ts`).toBeTruthy()
      expect(src!.status, `${id}: doc says ${docStatus}, source says ${src!.status}`)
        .toBe(docStatus)
    })
  }
})

describe('the claim-stop entry records the population it was last measured against', () => {
  // ⚠️ A COST NOTE THAT DESCRIBES LAST MONTH'S POPULATION IS HOW A DEFERRAL
  // QUIETLY STOPS BEING THE ONE THAT WAS AGREED. This entry's bound was "one
  // entity, one owner" and the table has since reached eight of each.
  const claimStop = KNOWN_LIMITATIONS.find(
    (l) => l.id === 'THE_CLAIM_STOP_IS_DECLARED_BUT_NOT_ENFORCED')

  it('the entry is present and still OPEN', () => {
    expect(claimStop).toBeTruthy()
    expect(claimStop!.status).toBe('OPEN')
  })

  // ⚠️ ASSERT THE CORRECTION, NOT THE ABSENCE OF THE OLD STRING. The first
  // version of this test forbade the sentence "bounded by the same measurement:
  // one entity, one owner" — and failed, because the entry QUOTES that sentence
  // in order to correct it. Quoting what was wrong is how a record stays
  // reviewable; a guard that cannot tell a quotation from a claim would push
  // the next person to delete the history instead of superseding it.
  it('marks the old bound as superseded rather than leaving it standing', () => {
    expect(claimStop!.cost).toMatch(/STALE AND IS CORRECTED HERE/)
    expect(claimStop!.cost).toMatch(/EIGHT rows across EIGHT DISTINCT OWNERS/)
  })

  it('does not claim the trigger has fired', () => {
    expect(claimStop!.cost).toMatch(/TRIGGER STILL HAS NOT FIRED/)
  })

  it('carries the date of the measurement its bound rests on', () => {
    expect(claimStop!.cost).toMatch(/2026-09-05/)
  })

  it('still names the population threshold rather than a raw count', () => {
    expect(claimStop!.revisitWhen).toMatch(/CLAIM_STOP_MIN_POPULATION/)
  })
})
