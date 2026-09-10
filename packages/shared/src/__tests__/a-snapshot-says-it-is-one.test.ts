// A STALE PLAN THAT DOES NOT SAY IT IS STALE IS A TRAP.
//
// ⚠️⚠️ SIX BUILD PLANS AND TEN AUDITS, AND 660 PRs SINCE THE OLDEST WAS TOUCHED.
// Measured 2026-09-09. `BUILD_PLAN.md` last changed 2026-07-21 with 660 merges
// behind it; `INTELLIGENCE_ARCHITECTURE_AUDIT.md` 647; the newest audits still
// carry 202. None of them said so, and all of them read like work queues.
//
// ⚠️ THIS IS NOT HYPOTHETICAL HARM. Specs in documents like these have already
// been verified UNTRUE against production this month: a panel built against
// `signature_phrases`, a key absent from all 51 voices; a field named in a spec
// that does not exist; a feature specified for a screen it was never on. Each
// one looked like work and was a no-op or a rebuild of something finished.
//
// ⚖️ SO EVERY SNAPSHOT STATES ITS OWN AGE AND NAMES THE LIVE DOCUMENT. The
// ledger is the only file kept current, and the only one where "done" means
// something enforces it. The banner is what stops the next reader working from
// a three-week-old queue in good faith.
//
// Source-scraped: these are markdown files with no runtime, and a guard that
// exists beats one that waits for infrastructure.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..', '..')
const SNAPSHOT_MARK = '<!-- NOT-A-TO-DO-LIST -->'
const LIVE_MARK = '<!-- THE-LIVE-LEDGER -->'
const LEDGER = 'docs/twinai-open-items-ledger.md'

/** ⚠️ NAMED EXPLICITLY RATHER THAN GLOBBED. A glob over docs/ would sweep in
 *  design notes, runbooks and contracts, which are reference material and not
 *  work queues — banner-ing those would train readers to ignore the banner. */
const SNAPSHOTS = [
  'BUILD_PLAN.md',
  'docs/twinai-master-build-plan.md',
  'docs/twinai-one-build-plan.md',
  'docs/twinai-build-state.md',
  'docs/twinai-defects-found-on-real-data.md',
  'docs/INTELLIGENCE_ARCHITECTURE_AUDIT.md',
  'docs/audits/complete-ground-reality-audit.md',
  'docs/audits/full-system-audit-and-build-plan.md',
  'docs/audits/production-readiness-audit.md',
  'docs/audits/scripting-deep-audit.md',
  'docs/audits/scripting-fix-specs.md',
  'docs/audits/second-system-audit.md',
  'docs/audits/unblock-instructions.md',
  'docs/audits/unconnected-systems-audit.md',
  'docs/audits/writer-voice-creativity-audit.md',
]

const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8')

describe('a snapshot says it is one', () => {
  it('every listed plan and audit still exists', () => {
    for (const rel of SNAPSHOTS) {
      expect(existsSync(join(ROOT, rel)), `${rel} is missing`).toBe(true)
    }
  })

  // ⚠️ THE BANNER MUST BE THE FIRST THING READ. A staleness warning below the
  // table of contents is a warning nobody reaches before they start working.
  it('carries the banner at the very top, before any content', () => {
    for (const rel of SNAPSHOTS) {
      expect(read(rel).startsWith(SNAPSHOT_MARK), `${rel} does not OPEN with the banner`).toBe(true)
    }
  })

  // ⚖️ AND IT MUST POINT SOMEWHERE. "This may be out of date" with no
  // destination leaves the reader exactly where they were, only less confident.
  it('names the live ledger by path, so the reader has somewhere to go', () => {
    for (const rel of SNAPSHOTS) {
      expect(read(rel), `${rel} does not name the ledger`).toContain('twinai-open-items-ledger.md')
    }
  })

  // ⚠️ AND IT MUST CARRY THE MEASUREMENT, not an adjective. "Possibly outdated"
  // is unfalsifiable; "660 PRs have merged since" is checkable and lands.
  it('states a measured PR count rather than calling itself old', () => {
    for (const rel of SNAPSHOTS) {
      expect(read(rel), `${rel} states no PR count`).toMatch(/\d+ pull requests have merged/)
    }
  })

  // ⚖️ GREP FOR A READER FIRST — carried in the banner because it is the single
  // instruction that would have prevented the most wasted work this month.
  it('tells the reader to grep for a reader before acting', () => {
    for (const rel of SNAPSHOTS) {
      expect(read(rel).toLowerCase(), `${rel} omits the grep instruction`).toContain('grep for a reader')
    }
  })

  it('the ledger marks itself live and is NOT banner-ed as a snapshot', () => {
    const ledger = read(LEDGER)
    expect(ledger.startsWith(LIVE_MARK)).toBe(true)
    expect(ledger).not.toContain(SNAPSHOT_MARK)
    // and it states the rule that makes it the live one
    expect(ledger).toContain('Built, awaiting sample')
  })

  // ⚠️ THE LEDGER IS NOT ITSELF ON THE SNAPSHOT LIST. Banner-ing the live
  // document would point it at itself and destroy the distinction entirely.
  it('never lists the ledger among the snapshots', () => {
    expect(SNAPSHOTS).not.toContain(LEDGER)
  })
})
