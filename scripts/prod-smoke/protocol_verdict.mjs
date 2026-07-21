// R8-2: the two-stage protocol verdict as testable code. The workflow's verdict
// step must derive its summary from the ACTUAL step outcomes + recovery state,
// not print an unconditional "RED by design". This function is the single source
// of that decision; the workflow passes the real values in and the harness tests
// it (including the unexpected-residue-success path and summary/outcome
// disagreement).
//
// Inputs (strings, as GitHub Actions reports them / persists them):
//   chainOutcome   : 'success' | 'failure' | 'skipped' | 'cancelled'   (Stage 1)
//   residueOutcome : 'success' | 'failure' | 'skipped' | 'cancelled'   (Stage 2)
//   functionalChain: 'pass' | 'fail:<stage>' | 'not-run'               (PROBE_FUNCTIONAL_CHAIN)
//   createAttempted: '1' | '0' | undefined                             (PROBE_CREATE_ATTEMPTED)
//
// Rules:
//   * functional evidence is accepted ONLY when chainOutcome === 'success'
//     AND functionalChain === 'pass' (both — a green step with a non-pass marker
//     is NOT functional evidence).
//   * after ANY attempted create, Stage 2 MUST be 'failure' (fail-closed). If it
//     is not, that is a PROTOCOL VIOLATION → exitCode 1 (an attempted-create run
//     may never conclude conventionally green).
//   * a functional failure (chain not-pass) is reported DISTINCTLY from the
//     expected residue-accounting red.
import { fileURLToPath } from 'node:url'

export function evaluateProtocol({ chainOutcome, residueOutcome, functionalChain, createAttempted }) {
  const attempted = createAttempted === '1' || createAttempted === true
  const functionalEvidence = chainOutcome === 'success' && functionalChain === 'pass'
  const reasons = []
  let exitCode = 0
  let verdict

  if (attempted) {
    if (residueOutcome !== 'failure') {
      // The residue step did NOT fail closed after a create was attempted — the
      // run could otherwise conclude green. Force red.
      reasons.push(`PROTOCOL VIOLATION: attempted-create run did not fail closed in residue accounting (residue outcome=${residueOutcome}); refusing to conclude green`)
      exitCode = 1
      verdict = 'protocol-violation'
    } else if (functionalEvidence) {
      // Expected two-stage outcome: functional chain green, residue red by design.
      verdict = 'functional-pass-residue-red'
    } else {
      // Residue red as expected, but the functional chain itself failed — a REAL
      // smoke failure, distinct from the expected residue-only red.
      reasons.push(`FUNCTIONAL FAILURE: chain outcome=${chainOutcome}, PROBE_FUNCTIONAL_CHAIN=${functionalChain} (a real smoke failure, not the expected residue-only red)`)
      verdict = 'functional-failure'
    }
  } else {
    // No create attempted → nothing created; residue Case A clean is acceptable.
    if (residueOutcome === 'failure') {
      reasons.push(`unexpected residue failure with no create attempted (residue outcome=${residueOutcome})`)
      exitCode = 1
      verdict = 'unexpected-residue-failure'
    } else {
      verdict = 'no-create-clean'
    }
  }

  return { exitCode, functionalEvidence, attempted, verdict, reasons }
}

export function summaryLines(v) {
  return [
    '## Prod-source-smoke — two-stage protocol verdict',
    `- verdict: **${v.verdict}**`,
    `- functional evidence accepted: **${v.functionalEvidence}** (Stage 1 success AND PROBE_FUNCTIONAL_CHAIN=pass)`,
    `- create attempted: **${v.attempted}**`,
    ...(v.attempted ? ['- Stage 2 residue accounting is expected RED-by-design after a create; a green attempted-create run is a protocol violation.'] : []),
    ...v.reasons.map((r) => `- ⚠️ ${r}`),
    '- See docs/prod-source-smoke-protocol.md for the full operational protocol.',
  ]
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const v = evaluateProtocol({
    chainOutcome: process.env.CHAIN_OUTCOME,
    residueOutcome: process.env.RESIDUE_OUTCOME,
    functionalChain: process.env.PROBE_FUNCTIONAL_CHAIN,
    createAttempted: process.env.PROBE_CREATE_ATTEMPTED,
  })
  const lines = summaryLines(v)
  for (const l of lines) console.log(l)
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs')
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
  }
  for (const r of v.reasons) if (v.exitCode !== 0) console.error(`::error::${r}`)
  process.exit(v.exitCode)
}
