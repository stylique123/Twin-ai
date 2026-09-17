// A VERSION STAMP IS THE EASIEST POSSIBLE INSTANCE OF THIS REPO'S SIGNATURE
// DEFECT, WHICH IS WHY ITS READER IS TESTED FIRST.
//
// ⚠️ THE DEFECT CLASS, NAMED IN THE LEDGER: a column written and never read.
// `extractor_version` is metadata, it looks self-evidently useful, and nothing
// downstream has to consult it for the write to succeed — so it could sit on
// 1,300 rows forever, correct and inert, and every creator scanned under an old
// prompt would stay stuck exactly as they are today. `remineCard` is the reader,
// and these are the readings that must be right.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SHARED_RAW = readFileSync(
  join(REPO, 'supabase', 'functions', '_shared', 'ownerConsole.ts'), 'utf8')
const ENDPOINT = readFileSync(
  join(REPO, 'supabase', 'functions', 'owner-console', 'index.ts'), 'utf8')

interface Card { card: string; state: string; ownerAction: string | null; detail: string }

function loadCard() {
  const start = SHARED_RAW.indexOf('export const REMINE_MIN_VOICES')
  expect(start, 'remineCard block missing').toBeGreaterThan(-1)
  const block = SHARED_RAW.slice(start).replace(/^export\s+/gm, '')
  const js = transformSync(block, { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return { remineCard, REMINE_MIN_VOICES }`)() as {
    remineCard: (cohort: unknown, current: number) => Card
    REMINE_MIN_VOICES: number
  }
}

const { remineCard, REMINE_MIN_VOICES } = loadCard()

const voice = (voiceId: string, oldestVersion: number | null, rows = 1) =>
  ({ voiceId, oldestVersion, rows })

describe('the card the owner actually reads', () => {
  it('a failed query is blocked, never "nothing is stale"', () => {
    // ⚠️ THE READING THAT WOULD BE WORST. Telling the owner a problem they have
    // is solved is strictly worse than telling them nothing.
    const c = remineCard(null, 2)
    expect(c.state).toBe('blocked')
    expect(c.ownerAction).toBeNull()
    expect(c.detail).toMatch(/not the same as nothing being stale/i)
  })

  it('an all-current store is done, and names the version', () => {
    const c = remineCard({ voices: [], staleRows: 0, currentRows: 40 }, 2)
    expect(c.state).toBe('done')
    expect(c.detail).toContain('v2')
  })

  it('the day the stamp lands is reported as the stamp being new, not as an emergency', () => {
    // ⚠️ EVERY ROW IS NULL ON THAT DAY AND EVERY VOICE IS IN THE COHORT.
    // Shouting `action_needed` about a cohort of everybody would be reporting
    // the migration, not a problem.
    const c = remineCard({
      voices: [voice('a', null, 30), voice('b', null, 20), voice('c', null, 10)],
      staleRows: 60, currentRows: 0,
    }, 2)
    expect(c.state).toBe('ok')
    expect(c.ownerAction).toBeNull()
    expect(c.detail).toMatch(/stamp being new/i)
  })

  it('once some rows are current, a real cohort asks for a re-mine', () => {
    const c = remineCard({
      voices: [voice('a', 1, 12), voice('b', 1, 8), voice('c', null, 5)],
      staleRows: 25, currentRows: 7,
    }, 2)
    expect(c.state).toBe('action_needed')
    expect(c.ownerAction).toMatch(/Re-mine 3 voices on extractor v2/)
  })

  it('the action is priced in VOICES, because that is the unit of work', () => {
    // ⚖️ Rows say how much material is stale; voices say what fixing it costs,
    // and only the second is a decision the owner can price.
    const c = remineCard({
      voices: [voice('a', 1, 90), voice('b', 1, 5), voice('c', 1, 5)],
      staleRows: 100, currentRows: 10,
    }, 2)
    expect(c.ownerAction).toContain('3 voice')
    expect(c.ownerAction).not.toContain('100')
    expect(c.detail).toContain('100 rows')
  })

  it('a cohort below the floor is reported without interrupting the owner', () => {
    const c = remineCard({ voices: [voice('a', 1, 3)], staleRows: 3, currentRows: 50 }, 2)
    expect(c.state).toBe('ok')
    expect(c.ownerAction).toBeNull()
    // ⚖️ REPORTED, NOT SILENT. "Too small to act on" and "not happening" are
    // different, and only the first is true here.
    expect(c.detail).toMatch(/predate extractor v2/)
    expect(REMINE_MIN_VOICES).toBeGreaterThan(1)
  })

  it('never-stamped and older-version voices are counted separately', () => {
    // They are different facts: one predates the stamp, the other was scanned
    // under a prompt we can name. Pooling them loses which improvement is
    // missing.
    const c = remineCard({
      voices: [voice('a', null, 4), voice('b', 1, 4), voice('c', 1, 4)],
      staleRows: 12, currentRows: 12,
    }, 2)
    expect(c.detail).toMatch(/1 never stamped, 2 on an older version/)
  })

  it('says nothing about WHY a creator is stale, or what re-mining would find', () => {
    // ⚖️ The same rule as the funnel card: this file reports whether evidence
    // exists, never whether the evidence is good. A stale voice may yield
    // nothing new, and promising otherwise is a forecast, not a count.
    const c = remineCard({ voices: [voice('a', 1, 4), voice('b', 1, 4), voice('c', 1, 4)], staleRows: 12, currentRows: 12 }, 2)
    expect(c.detail).not.toMatch(/\bwould find\b|\bmore substance\b|\bbetter script/i)
  })
})

describe('the card is wired, not merely written', () => {
  it('the endpoint builds the cohort and passes it to the card', () => {
    expect(ENDPOINT).toMatch(/remineCohortInline\(data, KNOWLEDGE_EXTRACTOR_VERSION\)/)
    expect(ENDPOINT).toMatch(/remineCard\(remineCohort, KNOWLEDGE_EXTRACTOR_VERSION\)/)
  })

  it('the cohort read selects two columns, not the knowledge store', () => {
    // Selecting `text` here would pull creator knowledge across the wire to
    // count it.
    expect(ENDPOINT).toMatch(/from\('creator_knowledge'\)\s*\n?\s*\.select\('voice_id, extractor_version'\)/)
  })
})
