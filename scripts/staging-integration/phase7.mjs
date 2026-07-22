// Editor v2 — Phase 7 staging integration matrix (SEPARATE from phase6.mjs).
//
// GATE 0 section (present now): the IDENTICAL maximum-legal envelope assertion
// that runs in shared + worker unit tests — the exact frozen byte count, the
// >=20% byte-cap headroom, and the rigorous conservative token bound
// (tokens <= bytes <= cap <= 80% of the provider context). When GEMINI_API_KEY
// is present it also records the REAL countTokens evidence.
//
// The Phase-7 directing-stage staging cases (happy path, project-scoped cache,
// four crash windows, hostile prompt-injection / cross-tenant / fabricated-id /
// raw-timestamp / provider-timeout, DB+TS filler guards, source reconcile) are
// added in the implementation step AFTER Gate 0 passes. Production stays
// disabled; compiling/rendering/validating remain simulated; edit_plans=0.
import { spawnSync } from 'node:child_process'

function gate0() {
  console.log('== Phase 7 · GATE 0: max 30-minute Director envelope fits one inference ==')
  const args = ['scripts/director-eval/count_tokens.mjs']
  if (!process.env.GEMINI_API_KEY) args.push('--selftest')
  const r = spawnSync('node', args, { stdio: 'inherit' })
  if (r.status !== 0) {
    console.error('::error::Phase 7 Gate 0 envelope/token assertion FAILED')
    process.exit(1)
  }
  console.log('Phase 7 Gate 0: PASS')
}

gate0()

// Implementation-phase staging matrix appended here after Gate 0 approval.
