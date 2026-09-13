// THE MEASUREMENT THE OWNER IS WAITING ON COULD NOT BE TAKEN.
//
// ⚠️⚠️ BOTH HALVES OF THE ESCALATION WERE `console.log`, AND THE REGISTRY ENTRY
// FOR THE FIRST CONTRADICTED ITSELF: it classified the event `counter_ephemeral`
// — knowingly not persisted — while its stated reason was that the event "is
// counted because it is the only evidence the paid rung ran at all". Counted
// where? Worker logs expire, so the only evidence expired with them.
//
// ⚠️ MEASURED 2026-09-13, WHICH IS WHY THIS IS NOT THEORETICAL. 53
// assess_reference failures carry a block-shaped error — the `blocked_by_host`
// precondition the escalation requires — the most recent on 2026-09-03. So the
// rung has had 53 opportunities, and the database cannot say whether it fired on
// a single one of them.
//
// ⚠️ AND ZERO ROWS MENTIONING `residential_proxy` ACROSS 4,004 JOBS IS NOT
// EVIDENCE IT NEVER RAN. No job row ever carried the route name, in either
// direction. Absent is not zero — which is exactly why the row below has to
// exist before the question can be asked.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SRC = readFileSync(
  resolve(ROOT, 'worker', 'src', 'jobs', 'assessReference.ts'), 'utf8')
const GUARD = readFileSync(
  resolve(ROOT, 'scripts', 'ci', 'check_counter_durability.mjs'), 'utf8')

/** Code only. A comment naming an event is not an emission — the repo has been
 *  bitten twice by a guard that could not tell a mention from a call. */
const CODE = SRC.split('\n').filter((l) => {
  const t = l.trim()
  return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
}).join('\n')

describe('both halves of the ratio reach a table', () => {
  for (const kind of ['download_route_escalated', 'download_route_escalation_succeeded']) {
    it(`${kind} is written to ops_events, not only logged`, () => {
      const at = CODE.indexOf(`kind: '${kind}'`)
      expect(at, `${kind} must be an ops_events insert`).toBeGreaterThan(-1)
      // ⚠️ THE INSERT MUST BE THE ONE THIS KIND SITS IN. Asserting that the file
      // contains both `ops_events` and the kind somewhere would pass with the
      // two in unrelated places.
      const before = CODE.slice(Math.max(0, at - 300), at)
      expect(before).toMatch(/from\('ops_events'\)\s*\n?\s*\.insert\(\{\s*$/)
    })
  }

  it('a ratio needs BOTH halves — one durable and one ephemeral is unanswerable', () => {
    const inserts = [...CODE.matchAll(/from\('ops_events'\)\s*\n?\s*\.insert\(\{\s*\n\s*kind: '([a-z0-9_]+)'/g)]
      .map((m) => m[1])
    expect(new Set(inserts)).toContain('download_route_escalated')
    expect(new Set(inserts)).toContain('download_route_escalation_succeeded')
  })

  it('neither write can throw and kill the assessment it is measuring', () => {
    // The rung exists to rescue a failed reference; a telemetry row that throws
    // would turn the measurement into the outage.
    for (const kind of ['download_route_escalated', 'download_route_escalation_succeeded']) {
      const at = CODE.indexOf(`kind: '${kind}'`)
      const after = CODE.slice(at, at + 400)
      expect(after).toMatch(/\}\)\.then\(\(\) => \{\}, \(\) => \{\}\)/)
    }
  })

  it('the escalation still only fires on a host block, and still only once', () => {
    // ⚠️ THE PRECONDITION IS NOT THIS CHANGE'S TO MOVE. Making the row durable
    // must not widen WHEN the paid rung runs — that would turn a measurement
    // into an open-ended bill.
    expect(CODE).toMatch(/firstClass === 'blocked_by_host'/)
    expect(CODE).toMatch(/route\.kind === 'local_impersonated'/)
    expect(CODE).toMatch(/env\.apifyProxyPassword\.trim\(\) !== ''/)
  })
})

describe('the registry says durable, and no longer contradicts itself', () => {
  for (const kind of ['download_route_escalated', 'download_route_escalation_succeeded']) {
    it(`${kind} is no longer classified counter_ephemeral`, () => {
      const line = GUARD.split('\n').find((l) => l.trim().startsWith(`${kind}:`))
      expect(line, `${kind} must be registered`).toBeDefined()
      expect(line).not.toMatch(/kind: 'counter_ephemeral'/)
      expect(line).toMatch(/kind: 'incident'/)
    })
  }
})
