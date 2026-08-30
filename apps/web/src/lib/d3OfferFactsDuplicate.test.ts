// D3 — "WHAT DOES THE OFFER DO?" MUST NOT BE ASKED WHEN THE LIBRARY ALREADY
// KNOWS.
//
// ⚖️ THE AUDIT (TASK 1) FOUND SOMETHING MORE NUANCED THAN "KILL IT". The
// server (`generate-blueprint/index.ts`) already treats the Quick-things
// claims answer as a FALLBACK: `readyFacts` (derived from the matched
// product entity's `evidence.sections`) is checked FIRST, and the free-text
// answer is only required when `readyFacts.length === 0`. That is a
// legitimate two-tier design, not blind duplication — real extracted facts
// win, the creator's typed answer is a safety net for when extraction
// failed or was never done.
//
// ⚠️ BUT THE CLIENT DID NOT MIRROR IT. `V2Building.tsx`'s courtesy
// pre-check called `assessReadiness` without ever populating
// `productFacts`, so `claims` came back MISSING_REQUIRED for every
// promoting video regardless of what Product Library already had on
// record. A creator whose product entity carried full extracted facts was
// still shown the question, typed an answer, and had it silently discarded
// server-side the moment `readyFacts.length > 0` — asked, then ignored.
// THAT is the real D3 bug: not "this question always duplicates a library
// fact," but "the client never checked before asking."
//
// The fix adds `libraryFacts`, mirroring the server's `readyFacts`
// derivation (`evidence.sections` labels, matched by offer name) and feeds
// it into the same `assessReadiness` call `libraryRelationship` already
// feeds for D2. The server-side fallback itself is untouched — it is still
// needed for the genuine gap case (no Library evidence on record).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { assessReadiness } from '@twinai/shared'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const WEB = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('D3: the courtesy pre-check resolves offer facts from Product Library', () => {
  it('feeds libraryFacts into assessReadiness alongside libraryRelationship', () => {
    expect(WEB).toMatch(/productFacts: libraryFacts\(libraryProducts, str\(vBrief\.offer\)\)/)
  })

  it('libraryFacts mirrors the server\'s evidence.sections derivation, not `knowledge`', () => {
    expect(WEB).toMatch(/function libraryFacts\(/)
    const start = WEB.indexOf('function libraryFacts(')
    const end = WEB.indexOf('\n}', start)
    const body = WEB.slice(start, end)
    expect(body).toMatch(/\.evidence/)
    expect(body).toMatch(/sections/)
    expect(body).toMatch(/declined/)
    // Must not read the separate URL-extraction table — that is a different
    // fact source the server's `readyFacts` also does not consult here.
    expect(body).not.toMatch(/\.knowledge\b/)
  })

  it('matches by offer name first, falls back to the sole product, like libraryRelationship', () => {
    const start = WEB.indexOf('function libraryFacts(')
    const end = WEB.indexOf('\n}', start)
    const body = WEB.slice(start, end)
    expect(body).toMatch(/products\.length === 1 \? products\[0\] : null/)
  })
})

describe('D3: server keeps the fallback, unchanged', () => {
  it('readyFacts still comes from evidence.sections and gates the claims question', () => {
    expect(EDGE).toMatch(/readyPromoting && readyFacts\.length === 0 && !readyPresent\(answers\.claims\)/)
  })
})

describe('D3: assessReadiness behaviour the client now actually exercises', () => {
  const BASE = {
    goal: 'sell', angle: 'a demo', offer: 'Widget Pro', relationship: 'OWN_PRODUCT',
    cta: 'buy now', audience: 'founders', referenceRead: true, hasCreatorKnowledge: true,
  }

  it('does NOT ask claims when the library already has usable facts', () => {
    const verdict = assessReadiness({ ...BASE, productFacts: ['syncs offline', 'costs $12/mo'] })
    const claims = verdict.fields.find((f) => f.field === 'claims')
    expect(claims?.state).toBe('RESOLVED')
    expect(verdict.questions.some((q) => q.includes('OFFER'))).toBe(false)
  })

  it('still asks claims — the genuine gap case — when the library has nothing usable', () => {
    const verdictNull = assessReadiness({ ...BASE, productFacts: null })
    const verdictEmpty = assessReadiness({ ...BASE, productFacts: [] })
    expect(verdictNull.fields.find((f) => f.field === 'claims')?.state).toBe('MISSING_REQUIRED')
    expect(verdictEmpty.fields.find((f) => f.field === 'claims')?.state).toBe('MISSING_REQUIRED')
  })
})
