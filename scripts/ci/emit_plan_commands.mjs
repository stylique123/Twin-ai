#!/usr/bin/env node
// Turn a SEALED plan into the exact shell lines to run on the host — and refuse
// if the plan does not belong to this run.
//
// This exists so that the executor and the structural comparator consume THE
// SAME typed objects. Previously the workflow ran `jq -r '.cmds[]' plan.json`
// and the comparator re-derived authorisations by regex over those same
// strings. Two readers, two parsers, one of them approximate: a command shape
// the regex did not anticipate ran on the host and authorised nothing, and
// "approved" was indistinguishable from "unmatched".
//
// Here the argv is taken from the typed resource that also carries the
// operation, type and exact key, and the binding is verified before a single
// line is printed. Nothing is executed by this script; it writes shell to
// stdout and the workflow pipes it to ssh.
//
//   node scripts/ci/emit_plan_commands.mjs plan.json \
//        --stage <stage> --before inventory-before.json [--candidate-sha X]
//   node scripts/ci/emit_plan_commands.mjs --selftest
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { derivePlanCommands, sealPlan, shQuote, sha256hex, verifyPlanBinding } from './plan_retirement.mjs'

/**
 * Shell lines for a verified plan, one per typed resource, in plan order.
 *
 * THE ARGV IS DERIVED, NOT READ. `plan.resources[].argv` is evidence for a human
 * reading plan.json; it is never what runs. Executing a stored argv is what
 * allowed a tuple naming one resource to carry a command deleting another, and
 * no amount of hashing fixes that, because the digest covers whatever was sealed.
 * verifyPlanBinding separately proves the stored argv equals this derivation, so
 * the evidence file cannot lie either — but even if it did, this is the code path.
 */
export function commandsFor(plan) {
  return derivePlanCommands(plan).map((argv) => argv.map(shQuote).join(' '))
}

async function selftest() {
  let failed = 0
  const t = (name, got, exp) => {
    if (got === exp) console.log(`  ok: ${name}`)
    else { console.error(`SELFTEST FAIL: ${name} => ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); failed++ }
  }
  const BIND = { candidateSha: 'c'.repeat(40), beforeInventorySha256: 'b'.repeat(64) }
  const p = sealPlan({
    stage: 'reclaim',
    resources: [
      { op: 'remove', type: 'images', key: 'sha256:s', fields: null, argv: ['docker', 'rmi', 'sha256:s'] },
      { op: 'none', type: null, key: null, fields: null, command: 'builder-prune', argv: ['docker', 'builder', 'prune', '--all', '--force'] },
    ],
    cmds: [], notes: [], backups: [],
  }, BIND)

  t('every typed resource yields exactly one command', commandsFor(p).length, 2)
  t('flags survive as separate, quoted arguments',
    commandsFor(p)[1], "'docker' 'builder' 'prune' '--all' '--force'")
  // A resource name is DATA. Quoting is what makes that true in a shell.
  const hostile = sealPlan({
    stage: 'reclaim',
    resources: [{ op: 'remove', type: 'volumes', key: "v!;rm-rf/;", fields: null, argv: ['docker', 'volume', 'rm', 'v!;rm-rf/;'] }],
    cmds: [], notes: [], backups: [],
  }, BIND)
  const line = commandsFor(hostile)[0]
  t('HOSTILE: shell metacharacters in a resource name are quoted, not parsed',
    line, "'docker' 'volume' 'rm' 'v!;rm-rf/;'")
  {
    // Prove it by RUNNING it, rather than by asserting the shape of the string.
    const { execFileSync } = await import('node:child_process')
    const out = execFileSync('bash', ['-c', `set -euo pipefail\nprintf '%s\\n' ${line.replace(/^'docker' 'volume' 'rm' /, '')}`], { encoding: 'utf8' })
    t('…and the shell sees the name as one literal argument', out.trim(), 'v!;rm-rf/;')
  }
  t('a plan that does not verify yields no commands at all',
    verifyPlanBinding(p, { stage: 'stop', ...BIND }).length > 0, true)

  // THE BIJECTION. A tuple naming an image, carrying a command that deletes a
  // volume. The executor must run what the TUPLE means, never what is stored.
  const lying = sealPlan({
    stage: 'reclaim',
    resources: [{ op: 'remove', type: 'images', key: 'sha256:A', fields: null, argv: ['docker', 'volume', 'rm', 'B'] }],
    cmds: [], notes: [], backups: [],
  }, BIND)
  t('HOSTILE: a lying argv is REFUSED by verification',
    verifyPlanBinding(lying, { stage: 'reclaim', ...BIND }).some((x) => /does not describe the command it carries/.test(x)), true)
  t('…and even unverified, the executor derives the TUPLE\'s command, not the stored one',
    commandsFor(lying)[0], "'docker' 'rmi' 'sha256:A'")

  if (failed) { console.error(`emit-plan-commands selftest: ${failed} failed`); process.exit(1) }
  console.log('emit-plan-commands selftest: all cases passed'); process.exit(0)
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (!isEntry) { /* imported for its exports */ }
else if (process.argv.includes('--selftest')) await selftest()
else {
  const argv = process.argv.slice(2)
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
  const FLAGS = ['--stage', '--before', '--candidate-sha']
  const planF = argv.find((x, i) => !x.startsWith('--') && !FLAGS.includes(argv[i - 1]))
  const stage = flag('--stage')
  const beforeF = flag('--before')
  const candidateSha = flag('--candidate-sha') ?? process.env.GITHUB_SHA ?? ''
  if (!planF || !stage || !beforeF) {
    console.error('usage: emit_plan_commands.mjs <plan.json> --stage <stage> --before <inventory.json> [--candidate-sha X]')
    process.exit(2)
  }
  if (!candidateSha) {
    console.error('::error::no candidate commit to verify the plan against')
    process.exit(1)
  }
  let plan; let beforeText
  try { plan = JSON.parse(readFileSync(planF, 'utf8')) }
  catch (e) { console.error(`::error::plan ${planF} is missing or invalid: ${e.message}`); process.exit(1) }
  try { beforeText = readFileSync(beforeF, 'utf8') }
  catch (e) { console.error(`::error::before inventory ${beforeF} is missing: ${e.message}`); process.exit(1) }

  const problems = verifyPlanBinding(plan, { stage, candidateSha, beforeInventorySha256: sha256hex(beforeText) })
  if (problems.length > 0) {
    for (const p of problems) console.error(`::error::refusing to execute this plan: ${p}`)
    process.exit(1)
  }
  for (const line of commandsFor(plan)) console.log(line)
}
