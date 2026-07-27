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

/**
 * The flags that decide routing. `routeMentionsUpstream` is the load-bearing one:
 * a reverse_proxy's `{"dial":"host:port"}` is what actually sends traffic
 * somewhere. The others widen the net.
 *
 * NETWORK-NAME PRESENCE IS NOT A SUBSTITUTE FOR AN UPSTREAM MATCH. A config can
 * name a network and route nowhere near the target, and a config can reach the
 * target without naming its network at all. It is reported because a hit is worth
 * blocking on, not because it answers the question.
 */
export const ROUTE_FLAGS = [
  'routeMentionsUpstream', 'routeMentionsName', 'routeMentionsPort',
  'routeMentionsIp', 'routeMentionsNetwork',
]

export function routeVerdict(a) {
  // The verdict comes from the LOADED configuration. A Caddyfile on disk may be
  // one `import` among several and is adapted before use, so its readability
  // says nothing — only the admin API's answer counts.
  if (a.caddyRuntimeReadable !== true) return 'undetermined'
  // A null among the flags means that match never produced an answer — including
  // the upstream extraction finding nothing parseable, which is an unparsed
  // config rather than an absence of upstreams.
  if (ROUTE_FLAGS.some((k) => a[k] !== true && a[k] !== false)) return 'undetermined'
  return ROUTE_FLAGS.some((k) => a[k] === true) ? 'routed' : 'clear'
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
  if (route === 'undetermined') blockers.push('the LOADED proxy configuration could not be read, so routing is unknown')
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
  caddyPresent: true, caddyRuntimeReadable: true,
  caddyAdminEndpoint: 'http://localhost:2019/config/',
  caddyRuntimeConfigSha256: 'b'.repeat(64), caddyfileSha256: 'c'.repeat(64),
  routeMentionsUpstream: false, routeMentionsName: false, routeMentionsPort: false,
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
  for (const k of ROUTE_FLAGS) {
    t(`${k} = true BLOCKS`, w({ [k]: true }).stopMayBeAuthorised, false)
    t(`  …with verdict routed`, w({ [k]: true }).route, 'routed')
  }

  // NEGATIVE CONTROL — a route that exists ONLY in the runtime config.
  //
  // This is the defect the first probe had: it read /etc/caddy/Caddyfile and
  // called that the evidence. A route defined in an imported snippet, or pushed
  // through the admin API after start, appears in the LOADED config and nowhere
  // on disk. Here the on-disk file is unchanged (its hash is the same as the
  // clear case) and only the runtime upstream matches — and it must block.
  t('a route present ONLY in the runtime config BLOCKS',
    w({ routeMentionsUpstream: true, caddyfileSha256: FULL_CLEAR.caddyfileSha256 }).stopMayBeAuthorised, false)
  t('  …with verdict routed', w({ routeMentionsUpstream: true }).route, 'routed')

  // NEGATIVE CONTROL — the admin API is unavailable.
  t('an unavailable admin API is UNDETERMINED, not clear',
    w({ caddyRuntimeReadable: false, caddyAdminEndpoint: null }).route, 'undetermined')
  t('  …and blocks', w({ caddyRuntimeReadable: false }).stopMayBeAuthorised, false)
  t('a readable Caddyfile does NOT rescue an unreadable runtime config',
    w({ caddyRuntimeReadable: false, caddyfileSha256: 'd'.repeat(64) }).route, 'undetermined')
  t('a missing caddyRuntimeReadable field is UNDETERMINED', w({ caddyRuntimeReadable: null }).route, 'undetermined')

  // Ambiguity is a failure, not a pass.
  t('a null route flag is UNDETERMINED even when the config was readable',
    w({ routeMentionsIp: null }).route, 'undetermined')
  t('  …and blocks', w({ routeMentionsIp: null }).stopMayBeAuthorised, false)
  t('an unparsed upstream list (null) is UNDETERMINED, not "no upstreams"',
    w({ routeMentionsUpstream: null }).route, 'undetermined')
  t('  …and blocks', w({ routeMentionsUpstream: null }).stopMayBeAuthorised, false)
  t('an absent route flag is UNDETERMINED', (() => {
    const a = { ...FULL_CLEAR }; delete a.routeMentionsNetwork; return decide(a).route
  })(), 'undetermined')
  t('an absent upstream flag is UNDETERMINED', (() => {
    const a = { ...FULL_CLEAR }; delete a.routeMentionsUpstream; return decide(a).route
  })(), 'undetermined')
  // …and the network flag alone must not be able to CLEAR anything: it is only
  // ever additive. Proven by removing every other signal and flipping it.
  t('network-name presence alone still BLOCKS (it is not a clearing signal)',
    w({ routeMentionsNetwork: true }).stopMayBeAuthorised, false)

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
  console.log(`  caddy admin endpoint  : ${String(audit.caddyAdminEndpoint)}`)
  console.log(`  caddy RUNTIME sha256  : ${String(audit.caddyRuntimeConfigSha256)}`)
  console.log(`  caddyfile sha256      : ${String(audit.caddyfileSha256)} (informational; not the verdict source)`)
  console.log(`  upstream match        : ${String(audit.routeMentionsUpstream)}`)
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
