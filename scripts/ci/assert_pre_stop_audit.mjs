#!/usr/bin/env node
// The VERDICT for the read-only pre-stop audit, and the fail-closed decision.
//
// scripts/vps/pre_stop_audit.sh gathers facts on the host and returns booleans
// and hashes. This module turns them into ONE machine verdict and decides whether
// `stop` may be authorised. Split deliberately: the gathering runs once against a
// live host and cannot be unit-tested, while the decision is pure and is proven
// here against every ambiguous and hostile shape.
//
// THE RULE IS FAIL-CLOSED, AND "UNDETERMINED" IS A FAILURE.
// A null means the probe could not establish the fact — the compose file was
// unreadable, the proxy config could not be read, `docker inspect` returned
// nothing. Treating that as "probably fine" is exactly how a container that is
// still serving traffic gets stopped. Only a definite, complete NO clears it.
import { readFileSync } from 'node:fs'

/** Route verdicts. `routed` and `undetermined` both BLOCK; only `clear` passes. */
export const ROUTE_VERDICTS = ['clear', 'routed', 'undetermined']

export function routeVerdict(a) {
  if (a.caddyReadable !== true) return 'undetermined'
  const flags = ['routeMentionsName', 'routeMentionsPort', 'routeMentionsIp', 'routeMentionsNetwork']
  // A null among the flags means that particular match never ran. The proxy
  // config being readable is not enough; every probe must have produced an answer.
  if (flags.some((k) => a[k] !== true && a[k] !== false)) return 'undetermined'
  return flags.some((k) => a[k] === true) ? 'routed' : 'clear'
}

export function reconstructionVerdict(a) {
  if (a.composeExists !== true) return 'undetermined'
  if (typeof a.composeSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(a.composeSha256)) return 'undetermined'
  if (a.composeValidates !== true) return a.composeValidates === false ? 'invalid' : 'undetermined'
  if (a.composeHasService !== true) return a.composeHasService === false ? 'service_absent' : 'undetermined'
  return 'provable'
}

/**
 * The rollback commands, constructed HERE from the probe's facts rather than
 * copied from a manifest field. They are printed for the record and contain no
 * env values — `docker compose up` reads .env on the host at run time, which is
 * precisely why the secret never has to appear in this file or in a CI log.
 */
export function rollbackCommands(a) {
  const policy = typeof a.restartPolicy === 'string' && a.restartPolicy !== '' && a.restartPolicy !== 'no'
    ? a.restartPolicy
    : 'unless-stopped'
  return {
    restartPolicy: `docker update --restart=${policy} ${a.target}`,
    reconstruct: `docker compose -f ${a.composePath} up -d ${a.target}`,
    verifyAfter: `docker inspect ${a.target} --format '{{.State.Status}} {{.HostConfig.RestartPolicy.Name}}'`,
    note: 'reconstruct reads .env on the host at run time; no environment value is recorded here or in CI',
  }
}

export function decide(a) {
  const route = routeVerdict(a)
  const reconstruction = reconstructionVerdict(a)
  const blockers = []
  if (a.targetPresent !== true) blockers.push('the target container is not present, so this audit describes nothing')
  if (reconstruction !== 'provable') {
    blockers.push(`reconstruction is ${reconstruction}: removal could not be undone from the recorded evidence`)
  }
  if (route === 'routed') blockers.push('a live proxy route still references the target')
  if (route === 'undetermined') blockers.push('the proxy configuration could not be read, so routing is unknown')
  return {
    route,
    reconstruction,
    rollback: rollbackCommands(a),
    stopMayBeAuthorised: blockers.length === 0,
    blockers,
  }
}

// ------------------------------------------------------------------ selftest
const FULL_CLEAR = {
  target: 'stylique-os', targetPresent: true, restartPolicy: 'no',
  composePath: '/root/24_Backend/deploy/docker-compose.yml',
  composeExists: true, composeSha256: 'a'.repeat(64),
  composeValidates: true, composeHasService: true, composeServiceCount: 3,
  caddyReadable: true, caddyConfigSha256: 'b'.repeat(64),
  routeMentionsName: false, routeMentionsPort: false,
  routeMentionsIp: false, routeMentionsNetwork: false,
}

function selftest() {
  let failed = 0
  const t = (name, got, exp) => {
    if (got === exp) console.log(`  ok: ${name}`)
    else { console.error(`SELFTEST FAIL: ${name} => ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); failed++ }
  }
  const w = (o) => decide({ ...FULL_CLEAR, ...o })

  // The positive. Without it every refusal below could be passing because
  // nothing ever clears.
  t('a complete, unrouted, reconstructible host CLEARS', w({}).stopMayBeAuthorised, true)
  t('  …with a clear route verdict', w({}).route, 'clear')
  t('  …and a provable reconstruction', w({}).reconstruction, 'provable')

  // Routing: any one marker blocks.
  for (const k of ['routeMentionsName', 'routeMentionsPort', 'routeMentionsIp', 'routeMentionsNetwork']) {
    t(`${k} = true BLOCKS`, w({ [k]: true }).stopMayBeAuthorised, false)
    t(`  …with verdict routed`, w({ [k]: true }).route, 'routed')
  }

  // Ambiguity is a failure, not a pass. Each of these is a way the probe can
  // come back without an answer.
  t('unreadable proxy config is UNDETERMINED, not clear', w({ caddyReadable: false }).route, 'undetermined')
  t('  …and blocks', w({ caddyReadable: false }).stopMayBeAuthorised, false)
  t('a missing caddyReadable field is UNDETERMINED', w({ caddyReadable: null }).route, 'undetermined')
  t('a null route flag is UNDETERMINED even when the config was readable',
    w({ routeMentionsIp: null }).route, 'undetermined')
  t('  …and blocks', w({ routeMentionsIp: null }).stopMayBeAuthorised, false)
  t('an absent route flag is UNDETERMINED', (() => {
    const a = { ...FULL_CLEAR }; delete a.routeMentionsNetwork; return decide(a).route
  })(), 'undetermined')

  // Reconstruction.
  t('a missing compose file is UNDETERMINED', w({ composeExists: false }).reconstruction, 'undetermined')
  t('  …and blocks', w({ composeExists: false }).stopMayBeAuthorised, false)
  t('a compose file that does not validate is INVALID', w({ composeValidates: false }).reconstruction, 'invalid')
  t('  …and blocks', w({ composeValidates: false }).stopMayBeAuthorised, false)
  t('a compose file without the service is SERVICE_ABSENT',
    w({ composeHasService: false }).reconstruction, 'service_absent')
  t('  …and blocks', w({ composeHasService: false }).stopMayBeAuthorised, false)
  t('a null validation result is UNDETERMINED', w({ composeValidates: null }).reconstruction, 'undetermined')
  t('a malformed compose digest is UNDETERMINED', w({ composeSha256: 'nope' }).reconstruction, 'undetermined')
  t('an absent compose digest is UNDETERMINED', w({ composeSha256: null }).reconstruction, 'undetermined')
  t('a missing target container blocks', w({ targetPresent: false }).stopMayBeAuthorised, false)

  // An empty object is the worst case: the probe returned nothing usable.
  t('an EMPTY probe result blocks', decide({}).stopMayBeAuthorised, false)
  t('  …on both counts', decide({}).blockers.length >= 3, true)

  // Rollback commands are derived, and never carry an env value.
  const rb = w({}).rollback
  t('the restart-policy rollback restores a real policy',
    rb.restartPolicy, 'docker update --restart=unless-stopped stylique-os')
  t('a container already carrying a policy has it preserved',
    w({ restartPolicy: 'always' }).rollback.restartPolicy, 'docker update --restart=always stylique-os')
  t('the reconstruct command names the compose file and the service',
    rb.reconstruct, 'docker compose -f /root/24_Backend/deploy/docker-compose.yml up -d stylique-os')
  t('no rollback command contains an = assignment that could be an env value',
    Object.values(rb).filter((v) => typeof v === 'string').some((v) => /\b[A-Z_]{3,}=/.test(v)), false)

  console.log(failed === 0 ? 'PRE-STOP-AUDIT SELFTEST PASS' : `PRE-STOP-AUDIT SELFTEST FAIL (${failed})`)
  process.exit(failed === 0 ? 0 : 1)
}

const arg = process.argv[2]
if (arg === '--selftest') {
  selftest()
} else if (arg) {
  const audit = JSON.parse(readFileSync(arg, 'utf8'))
  const verdict = decide(audit)
  console.log('== pre-stop audit ==')
  console.log(`  target                : ${audit.target} (present: ${String(audit.targetPresent)})`)
  console.log(`  restart policy now    : ${String(audit.restartPolicy)}`)
  console.log(`  compose file          : ${String(audit.composePath)}`)
  console.log(`  compose sha256        : ${String(audit.composeSha256)}`)
  console.log(`  compose validates     : ${String(audit.composeValidates)}`)
  console.log(`  service present       : ${String(audit.composeHasService)} (of ${String(audit.composeServiceCount)} services)`)
  console.log(`  caddy config sha256   : ${String(audit.caddyConfigSha256)}`)
  console.log(`  RECONSTRUCTION        : ${verdict.reconstruction}`)
  console.log(`  ROUTE                 : ${verdict.route}`)
  console.log('  rollback commands (secret-safe):')
  console.log(`    restart policy      : ${verdict.rollback.restartPolicy}`)
  console.log(`    reconstruct         : ${verdict.rollback.reconstruct}`)
  console.log(`    verify              : ${verdict.rollback.verifyAfter}`)
  console.log(`    note                : ${verdict.rollback.note}`)
  console.log(`  STOP MAY BE AUTHORISED: ${String(verdict.stopMayBeAuthorised)}`)
  for (const b of verdict.blockers) console.log(`    blocker: ${b}`)
  if (!verdict.stopMayBeAuthorised) {
    console.error('::error::pre-stop audit did not clear. `stop` must not be dispatched.')
    process.exit(1)
  }
} else {
  console.error('usage: assert_pre_stop_audit.mjs <audit.json> | --selftest')
  process.exit(2)
}
