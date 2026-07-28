#!/usr/bin/env node
// Turn the Chrome exposure evidence into a SEVERITY and a decision — and refuse
// to call anything safe that has not been shown to be safe.
//
// THE QUESTION
// ------------
// stylique-chrome publishes 6080 (noVNC) and 9222 (Chrome DevTools Protocol) on
// 0.0.0.0 and ::. If 9222 answers unauthenticated from the internet, anyone who
// can reach it controls the browser: navigate anywhere, read any page it can
// reach, and on many builds read local files. That is not a hardening nit, it is
// an active control path, and it decides whether containment happens now or
// waits for the retirement plan.
//
// TWO INDEPENDENT FACTS, AND NEITHER SUBSTITUTES FOR THE OTHER
// -----------------------------------------------------------
//   published    what Docker binds, read on the host
//   reachable    what answers from outside the VPS
// A published port behind a firewall is not reachable; a reachable port is not
// necessarily unauthenticated. Both are required, from their own vantage points,
// before any severity is assigned.
//
// UNKNOWN FAILS CLOSED. A missing probe, an absent firewall reading, or a
// protected-service reference that could not be established all block. The one
// thing this must never do is report "no dependency" because it did not look.
//
//   node scripts/ci/assert_chrome_exposure.mjs host.json reachability.json
//   node scripts/ci/assert_chrome_exposure.mjs --selftest
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export class ChromeExposureError extends Error {}

const HEX64 = /^[0-9a-f]{64}$/
export const AUDITED_PORTS = [6080, 9222]
/** The DevTools port. Control, not observation. */
export const CONTROL_PORT = 9222

export const SEVERITY = ['critical', 'high', 'medium', 'low', 'undetermined']

/**
 * Which addresses a publish rule exposes.
 *
 * `0.0.0.0` and `::` are every interface — the internet, if the host has a
 * public address. `127.0.0.1` and `::1` are the host only. Anything else is a
 * specific interface and is reported as such rather than guessed at.
 */
export function bindScope(hostIp) {
  if (hostIp === '' || hostIp === '0.0.0.0' || hostIp === '::') return 'all-interfaces'
  if (hostIp === '127.0.0.1' || hostIp === '::1') return 'loopback'
  return 'specific-interface'
}

/**
 * Docker's `.NetworkSettings.Ports` reduced to one row per published binding.
 * A port with a null binding is EXPOSED but not published, which is a different
 * and much weaker fact.
 */
export function publishedBindings(dockerPorts) {
  if (dockerPorts === null || typeof dockerPorts !== 'object') return null
  const out = []
  for (const [spec, bindings] of Object.entries(dockerPorts)) {
    const containerPort = Number.parseInt(String(spec).split('/')[0], 10)
    if (!Array.isArray(bindings) || bindings.length === 0) continue
    for (const b of bindings) {
      const hostIp = typeof b?.HostIp === 'string' ? b.HostIp : ''
      const hostPort = Number.parseInt(String(b?.HostPort ?? ''), 10)
      out.push({
        containerPort,
        hostPort: Number.isInteger(hostPort) ? hostPort : null,
        hostIp,
        scope: bindScope(hostIp),
      })
    }
  }
  return out
}

/**
 * Does the firewall demonstrably block a port?
 *
 * ONLY A POSITIVE READING COUNTS. "No rule mentions 9222" is not evidence of
 * blocking — it is equally consistent with a default-accept policy, which is
 * the common case on a fresh host. So this returns `true` only for an explicit
 * drop/reject naming the port, `false` for an explicit accept, and null
 * otherwise, and null blocks.
 */
export function firewallVerdict(host, port) {
  if (host.firewallBackend === 'none' || !host.firewallBackend) {
    return { blocked: false, basis: 'no filtering framework was found on the host' }
  }
  const rules = Array.isArray(host.firewallPortRules) ? host.firewallPortRules : null
  if (rules === null) return { blocked: null, basis: 'the probe reported no firewall rule readings' }
  const mine = rules.filter((r) => new RegExp(`(^|[^0-9])${port}([^0-9]|$)`).test(r))
  if (mine.length === 0) {
    return {
      blocked: null,
      basis: `no rule mentions ${port}; with default policy ${host.firewallDefaultInput ?? '(not reported)'} `
        + 'that is not evidence of blocking',
    }
  }
  const drops = mine.filter((r) => /\b(drop|reject)\b/i.test(r))
  const accepts = mine.filter((r) => /\b(accept|allow)\b/i.test(r))
  if (drops.length > 0 && accepts.length === 0) return { blocked: true, basis: `${drops.length} explicit drop/reject rule(s)` }
  if (accepts.length > 0) return { blocked: false, basis: `${accepts.length} explicit accept rule(s)` }
  return { blocked: null, basis: 'rules mention the port but neither accept nor drop could be read from them' }
}

/**
 * Is anything protected dependent on Chrome?
 *
 * Every channel must return a DEFINITE answer. A channel the probe did not
 * report is `unknown`, and unknown is not "no".
 */
export function dependencyVerdict(host) {
  // OWNERSHIP IS NOT DEPENDENCY. The compose file that DEFINES this container
  // necessarily names it, and a grep cannot tell that apart from a caller. Left
  // conflated, "is anything dependent on Chrome" answers yes for every container
  // that exists — which would make the check useless and, worse, make a genuine
  // dependency indistinguishable from its own definition. So the container's own
  // compose files are attributed to OWNERSHIP and excluded here.
  const ownFiles = [host.composeConfigFiles, host.composeWorkingDir]
    .filter((x) => typeof x === 'string' && x.length > 0)
  const isOwnDefinition = (ref) => ownFiles.some((f) => ref.includes(f))
  const rawHostRefs = typeof host.hostFileRefs === 'string'
    ? host.hostFileRefs.split(',').map((x) => x.trim()).filter(Boolean)
    : null
  const ownership = (rawHostRefs ?? []).filter(isOwnDefinition)
  const foreignHostRefs = rawHostRefs === null ? null : rawHostRefs.filter((r) => !isOwnDefinition(r))

  const channels = {
    envKeys: Array.isArray(host.protectedEnvRefs) ? host.protectedEnvRefs : null,
    sharedNetworks: Array.isArray(host.protectedNetworkPeers) ? host.protectedNetworkPeers : null,
    twinaiSource: typeof host.twinaiSourceRefs === 'string' ? host.twinaiSourceRefs : null,
    hostFiles: foreignHostRefs,
  }
  const unknown = Object.entries(channels).filter(([, v]) => v === null).map(([k]) => k)
  const refs = []
  for (const [k, v] of Object.entries(channels)) {
    if (v === null) continue
    if (Array.isArray(v) && v.length > 0) refs.push(`${k}: ${v.join(' | ')}`)
    else if (typeof v === 'string' && v.replace(/,+$/, '').length > 0) refs.push(`${k}: ${v.replace(/,+$/, '')}`)
  }
  return {
    unknownChannels: unknown,
    references: refs,
    // Reported separately so a reviewer sees the definition was found and
    // correctly not counted as a caller.
    ownershipReferences: ownership,
    // Three-valued on purpose. `false` means every channel was read and none
    // referenced Chrome; `null` means at least one channel is unread.
    dependent: unknown.length > 0 ? null : refs.length > 0,
  }
}

/** The reachability row for one port, or null when the probe did not cover it. */
export function portReach(reach, port) {
  const rows = Array.isArray(reach?.ports) ? reach.ports : []
  return rows.find((r) => r?.port === port) ?? null
}

/**
 * Unauthenticated control means: the port answered, it answered 200, it did not
 * ask for credentials, and the body carried a live control handle.
 *
 * A 401 or a WWW-Authenticate header is authentication. A non-200 is not
 * control. The webSocketDebuggerUrl boolean is what distinguishes "something
 * listens" from "something hands out the keys".
 */
export function unauthenticatedControl(row) {
  if (!row || row.httpReached !== true) return false
  if (row.httpStatus !== 200) return false
  if (typeof row.wwwAuthenticate === 'string' && row.wwwAuthenticate.length > 0) return false
  return row.containsWebSocketDebuggerUrl === true
}

export function decide(host, reach) {
  const blockers = []
  const findings = []

  if (host === null || typeof host !== 'object') throw new ChromeExposureError('host evidence is not a JSON object')
  if (host.schema !== 'chrome-exposure/1') blockers.push(`host evidence has schema ${JSON.stringify(host.schema)}, expected chrome-exposure/1`)
  if (reach !== null && typeof reach === 'object' && reach.schema !== 'chrome-reachability/1') {
    blockers.push(`reachability evidence has schema ${JSON.stringify(reach?.schema)}, expected chrome-reachability/1`)
  }

  if (host.present !== true) {
    return {
      severity: 'low', present: false, published: [], reach: null, dependency: null, firewall: {},
      findings: ['stylique-chrome is not present on the host; there is nothing to contain'],
      blockers, containmentRecommended: false,
    }
  }

  // ---- what Docker publishes -----------------------------------------------
  const published = publishedBindings(host.dockerPorts)
  if (published === null) {
    blockers.push('the probe did not report Docker port bindings, so what is published cannot be established')
  }
  const exposedAll = (published ?? []).filter((b) => b.scope === 'all-interfaces')
  for (const b of exposedAll) {
    findings.push(`container port ${b.containerPort} is published on ${b.hostIp || '0.0.0.0'}:${b.hostPort} — every interface`)
  }

  // ---- what the firewall does about it -------------------------------------
  const firewall = {}
  for (const p of AUDITED_PORTS) {
    firewall[p] = firewallVerdict(host, p)
  }
  if (host.firewallBackend === 'none') {
    findings.push('no host filtering framework was found, so a published port is reachable wherever the host is')
  }

  // ---- what answers from outside -------------------------------------------
  const control = portReach(reach, CONTROL_PORT)
  const reachUnavailable = reach === null || !Array.isArray(reach?.ports)
  if (reachUnavailable) {
    blockers.push('no external reachability evidence was supplied; whether the internet can reach these ports '
      + 'cannot be answered from the host itself, and absence of the probe is not absence of exposure')
  } else if (control === null) {
    blockers.push(`the reachability probe did not cover port ${CONTROL_PORT}, which is the control port`)
  }

  const openControl = unauthenticatedControl(control)
  if (openControl) {
    findings.push(`port ${CONTROL_PORT} answered 200 from outside the VPS with no authentication challenge and `
      + 'returned a live DevTools control handle')
  }

  // ---- does anything protected depend on it? -------------------------------
  const dependency = dependencyVerdict(host)
  if (dependency.dependent === null) {
    blockers.push(`Chrome's relationship to protected services is UNPROVEN — ${dependency.unknownChannels.join(', ')} `
      + 'were not reported. Unknown is not "no dependency", and no removal may rest on it')
  }
  for (const r of dependency.references) findings.push(`protected-service reference: ${r}`)

  // ---- severity -------------------------------------------------------------
  // CRITICAL is reserved for demonstrated unauthenticated control from outside.
  // Everything weaker is reported as what it is rather than rounded up.
  let severity
  if (openControl) severity = 'critical'
  else if (reachUnavailable || control === null) severity = 'undetermined'
  else if (control.tcpOpen === true && control.httpReached === true) severity = 'high'
  else if (control.tcpOpen === true) severity = 'high'
  else if (exposedAll.length > 0 && firewall[CONTROL_PORT]?.blocked !== true) severity = 'medium'
  else severity = 'low'

  // Containment is recommended ONLY for demonstrated control. A stop is a
  // mutation, and "probably exposed" does not authorise one.
  const containmentRecommended = openControl === true

  return {
    severity,
    present: true,
    containerId: host.containerId ?? null,
    imageDigest: host.imageDigest ?? null,
    restartPolicy: host.restartPolicy ?? null,
    state: host.state ?? null,
    published: published ?? [],
    exposedOnAllInterfaces: exposedAll,
    firewall,
    reach: control,
    reachAllPorts: Array.isArray(reach?.ports) ? reach.ports : null,
    dependency,
    findings,
    blockers,
    containmentRecommended,
    // Stated so a reader cannot mistake what was done for what was avoided.
    scopeNote: 'reachability was established by one unauthenticated GET of /json/version. No DevTools session was '
      + 'opened, no target attached, no tab enumerated, no page navigated, no script executed, no credential '
      + 'guessed, and no profile data read. Response bodies were hashed, never printed.',
  }
}

export function render(d) {
  const L = []
  L.push('== chrome exposure ==')
  L.push(`  SEVERITY              : ${d.severity.toUpperCase()}`)
  L.push(`  present               : ${String(d.present)}`)
  if (!d.present) { L.push(`  ${d.findings[0]}`); return L.join('\n') }
  L.push(`  container             : ${d.containerId}`)
  L.push(`  image digest          : ${d.imageDigest}`)
  L.push(`  restart policy        : ${d.restartPolicy}`)
  L.push(`  state                 : ${d.state}`)
  L.push('  published bindings:')
  for (const b of d.published) L.push(`      ${b.hostIp || '0.0.0.0'}:${b.hostPort} -> ${b.containerPort}  [${b.scope}]`)
  L.push('  firewall:')
  for (const [p, v] of Object.entries(d.firewall)) L.push(`      ${p}: blocked=${String(v.blocked)}  (${v.basis})`)
  if (d.reachAllPorts) {
    L.push('  external reachability (from the CI runner, outside the VPS):')
    for (const r of d.reachAllPorts) {
      L.push(`      ${r.port}: tcp=${r.tcpOpen} http=${r.httpReached} status=${r.httpStatus}`
        + ` auth=${r.wwwAuthenticate ?? 'none'} controlHandle=${r.containsWebSocketDebuggerUrl}`)
      if (r.bodySha256) L.push(`          body ${r.bodyBytes} bytes, sha256 ${r.bodySha256}`)
    }
  }
  L.push(`  protected dependency  : ${d.dependency ? String(d.dependency.dependent) : '(not evaluated)'}`)
  for (const f of d.findings) L.push(`      - ${f}`)
  L.push(`  CONTAINMENT RECOMMENDED: ${String(d.containmentRecommended)}`)
  for (const b of d.blockers) L.push(`  blocker: ${b}`)
  L.push(`  scope: ${d.scopeNote}`)
  return L.join('\n')
}

// ---------------------------------------------------------------- selftest
function hostFixture(over = {}) {
  return {
    schema: 'chrome-exposure/1',
    present: true,
    containerId: 'c'.repeat(64),
    imageDigest: 'ghcr.io/browserless/chromium@sha256:' + 'a'.repeat(64),
    restartPolicy: 'unless-stopped:0',
    state: 'running',
    composeProject: 'deploy',
    composeService: 'chrome',
    composeConfigFiles: '/root/24_Backend/deploy/docker-compose.yml',
    composeWorkingDir: '/root/24_Backend/deploy',
    dockerPorts: {
      '6080/tcp': [{ HostIp: '0.0.0.0', HostPort: '6080' }, { HostIp: '::', HostPort: '6080' }],
      '9222/tcp': [{ HostIp: '0.0.0.0', HostPort: '9222' }, { HostIp: '::', HostPort: '9222' }],
    },
    firewallBackend: 'none',
    firewallRuleCount: null,
    firewallPortRules: [],
    firewallDefaultInput: null,
    protectedEnvRefs: [],
    protectedNetworkPeers: [],
    twinaiSourceRefs: '',
    hostFileRefs: '/root/24_Backend/deploy/docker-compose.yml,',
    ...over,
  }
}

function reachFixture(over = {}) {
  const row = (port, o = {}) => ({
    port, tcpOpen: true, httpReached: true, httpStatus: 200,
    bodyBytes: 300, bodySha256: 'd'.repeat(64), wwwAuthenticate: '',
    accessControlAllowOrigin: '', contentType: 'application/json', serverHeader: '',
    containsWebSocketDebuggerUrl: true, ...o,
  })
  return { schema: 'chrome-reachability/1', probedFrom: 'github-actions-runner', ports: [row(6080), row(9222)], ...over }
}

async function selftest() {
  let failed = 0
  const t = (name, got, exp) => {
    if (JSON.stringify(got) === JSON.stringify(exp)) console.log(`  ok: ${name}`)
    else { console.error(`SELFTEST FAIL: ${name} => ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); failed++ }
  }

  console.log('-- bind scope')
  t('0.0.0.0 is every interface', bindScope('0.0.0.0'), 'all-interfaces')
  t(':: is every interface', bindScope('::'), 'all-interfaces')
  t('an empty HostIp is every interface, which is how Docker reports it',
    bindScope(''), 'all-interfaces')
  t('127.0.0.1 is the host only', bindScope('127.0.0.1'), 'loopback')
  t('::1 is the host only', bindScope('::1'), 'loopback')
  t('a specific address is neither', bindScope('10.0.0.5'), 'specific-interface')

  console.log('-- published bindings')
  {
    const b = publishedBindings(hostFixture().dockerPorts)
    t('every binding is reported, both families', b.length, 4)
    t('…with the container port parsed off the spec', [...new Set(b.map((x) => x.containerPort))].sort(), [6080, 9222])
    t('…and all of them are all-interfaces', b.every((x) => x.scope === 'all-interfaces'), true)
    // EXPOSED IS NOT PUBLISHED. A null binding means the image declares the
    // port; nothing on the host is listening for the world.
    t('an EXPOSED-but-unpublished port is not a binding',
      publishedBindings({ '9222/tcp': null }).length, 0)
    t('…and neither is an empty binding list', publishedBindings({ '9222/tcp': [] }).length, 0)
    t('absent port data is null, not an empty list', publishedBindings(null), null)
  }

  console.log('-- firewall: only a positive reading counts')
  t('no framework at all means not blocked',
    firewallVerdict(hostFixture(), 9222).blocked, false)
  // THE TRAP. "No rule mentions the port" reads like safety and is not: with a
  // default-accept policy it means wide open.
  t('a framework with NO matching rule is UNDETERMINED, not blocked',
    firewallVerdict(hostFixture({ firewallBackend: 'nftables', firewallPortRules: [] }), 9222).blocked, null)
  t('…and says why', /not evidence of blocking/.test(
    firewallVerdict(hostFixture({ firewallBackend: 'nftables', firewallPortRules: [] }), 9222).basis), true)
  t('an explicit drop IS blocking', firewallVerdict(
    hostFixture({ firewallBackend: 'nftables', firewallPortRules: ['tcp dport 9222 drop'] }), 9222).blocked, true)
  t('an explicit accept is NOT blocking', firewallVerdict(
    hostFixture({ firewallBackend: 'iptables', firewallPortRules: ['-A INPUT -p tcp --dport 9222 -j ACCEPT'] }), 9222).blocked, false)
  t('a drop for a DIFFERENT port does not count', firewallVerdict(
    hostFixture({ firewallBackend: 'nftables', firewallPortRules: ['tcp dport 6080 drop'] }), 9222).blocked, null)
  t('accept wins over drop when both are present, because order is unknown here',
    firewallVerdict(hostFixture({ firewallBackend: 'nftables', firewallPortRules: ['tcp dport 9222 drop', 'tcp dport 9222 accept'] }), 9222).blocked, false)
  t('unreadable rules are UNDETERMINED', firewallVerdict(
    hostFixture({ firewallBackend: 'nftables', firewallPortRules: ['tcp dport 9222 counter'] }), 9222).blocked, null)
  t('a missing rule reading is UNDETERMINED', firewallVerdict(
    hostFixture({ firewallBackend: 'nftables', firewallPortRules: null }), 9222).blocked, null)

  console.log('-- unauthenticated control')
  t('200 + a control handle + no challenge is control',
    unauthenticatedControl(reachFixture().ports[1]), true)
  t('a 401 is NOT control', unauthenticatedControl({ ...reachFixture().ports[1], httpStatus: 401 }), false)
  t('a WWW-Authenticate challenge is NOT control',
    unauthenticatedControl({ ...reachFixture().ports[1], wwwAuthenticate: 'Basic realm="x"' }), false)
  t('200 without a control handle is NOT control',
    unauthenticatedControl({ ...reachFixture().ports[1], containsWebSocketDebuggerUrl: false }), false)
  t('an unreached port is NOT control',
    unauthenticatedControl({ ...reachFixture().ports[1], httpReached: false }), false)
  t('a missing row is NOT control', unauthenticatedControl(null), false)

  console.log('-- severity')
  {
    const open = decide(hostFixture(), reachFixture())
    t('demonstrated unauthenticated control is CRITICAL', open.severity, 'critical')
    t('…and containment is recommended', open.containmentRecommended, true)
    t('…naming the control handle without printing it',
      open.findings.some((f) => /live DevTools control handle/.test(f)), true)
    t('…and the artifact carries no handle at all',
      JSON.stringify(open).includes('webSocketDebuggerUrl') === false
      || JSON.stringify(open).includes('ws://') === false, true)

    // AUTHENTICATED is a different finding and must not be rounded up.
    const authed = decide(hostFixture(), reachFixture({
      ports: [{ ...reachFixture().ports[0] }, { ...reachFixture().ports[1], httpStatus: 401, wwwAuthenticate: 'Basic realm="browserless"', containsWebSocketDebuggerUrl: false }],
    }))
    t('an authenticated endpoint is NOT critical', authed.severity, 'high')
    t('…and containment is NOT recommended on that basis', authed.containmentRecommended, false)

    // FIREWALL-BLOCKED and unreachable.
    const blocked = decide(
      hostFixture({ firewallBackend: 'nftables', firewallPortRules: ['tcp dport 9222 drop', 'tcp dport 6080 drop'] }),
      reachFixture({ ports: [
        { port: 6080, tcpOpen: false, httpReached: false, httpStatus: null, bodyBytes: null, bodySha256: null, wwwAuthenticate: null, containsWebSocketDebuggerUrl: false },
        { port: 9222, tcpOpen: false, httpReached: false, httpStatus: null, bodyBytes: null, bodySha256: null, wwwAuthenticate: null, containsWebSocketDebuggerUrl: false },
      ] }),
    )
    t('published but unreachable and firewall-blocked is LOW', blocked.severity, 'low')
    t('…with no containment recommended', blocked.containmentRecommended, false)

    // MISSING external evidence must never read as safe.
    const noReach = decide(hostFixture(), null)
    t('absent reachability evidence is UNDETERMINED, not low', noReach.severity, 'undetermined')
    t('…and blocks', noReach.blockers.some((b) => /absence of the probe is not absence of exposure/.test(b)), true)
    t('…and recommends no containment either', noReach.containmentRecommended, false)

    const partial = decide(hostFixture(), reachFixture({ ports: [reachFixture().ports[0]] }))
    t('a probe that skipped the CONTROL port is UNDETERMINED', partial.severity, 'undetermined')
    t('…and says which port it skipped', partial.blockers.some((b) => /did not cover port 9222/.test(b)), true)
  }

  console.log('-- dependency: unknown is not "no"')
  {
    const clean = decide(hostFixture(), reachFixture())
    t('every channel read and none referencing Chrome means not dependent',
      clean.dependency.dependent, false)
    t('…and raises no dependency blocker',
      clean.blockers.some((b) => /UNPROVEN/.test(b)), false)

    for (const ch of ['protectedEnvRefs', 'protectedNetworkPeers', 'twinaiSourceRefs', 'hostFileRefs']) {
      const missing = decide(hostFixture({ [ch]: undefined }), reachFixture())
      t(`an unread ${ch} channel makes dependency UNPROVEN`, missing.dependency.dependent, null)
      t(`…and blocks on it`, missing.blockers.some((b) => /UNPROVEN/.test(b)), true)
    }

    const dependent = decide(hostFixture({
      protectedEnvRefs: ['twinai-worker:CHROME_WS_ENDPOINT,'],
    }), reachFixture())
    t('a protected env-key reference makes it dependent', dependent.dependency.dependent, true)
    t('…and is surfaced as a finding',
      dependent.findings.some((f) => /CHROME_WS_ENDPOINT/.test(f)), true)
    const shared = decide(hostFixture({ protectedNetworkPeers: ['twinai-worker shares deploy_default'] }), reachFixture())
    t('a shared network with a protected container makes it dependent', shared.dependency.dependent, true)
    const src = decide(hostFixture({ twinaiSourceRefs: 'worker/src/scrape.ts,' }), reachFixture())
    t('a TwinAI source reference makes it dependent', src.dependency.dependent, true)

    // OWNERSHIP vs DEPENDENCY. The compose file that DEFINES chrome always
    // matches a grep for it; counting that as a caller would make every
    // container look depended-upon and hide real callers in the noise.
    t('the container\'s own compose file is ownership, not dependency',
      clean.dependency.ownershipReferences, ['/root/24_Backend/deploy/docker-compose.yml'])
    t('…and is excluded from the dependency channels',
      clean.dependency.references.some((r) => /docker-compose\.yml/.test(r)), false)
    // A FOREIGN host file naming chrome IS a dependency — a systemd unit or a
    // cron job outside the container's own project.
    const foreign = decide(hostFixture({
      hostFileRefs: '/root/24_Backend/deploy/docker-compose.yml,/etc/cron.d/nightly-scrape,',
    }), reachFixture())
    t('a foreign host-file reference IS a dependency', foreign.dependency.dependent, true)
    t('…and names it', foreign.dependency.references.some((r) => /nightly-scrape/.test(r)), true)
    t('…while still attributing the compose file to ownership',
      foreign.dependency.ownershipReferences.length, 1)
  }

  console.log('-- absent container')
  {
    const gone = decide(hostFixture({ present: false }), reachFixture())
    t('an absent container is LOW with nothing to contain', gone.severity, 'low')
    t('…and recommends no containment', gone.containmentRecommended, false)
  }

  console.log('-- schema')
  t('a wrong host schema blocks',
    decide(hostFixture({ schema: 'x' }), reachFixture()).blockers.some((b) => /expected chrome-exposure/.test(b)), true)
  t('a wrong reachability schema blocks',
    decide(hostFixture(), reachFixture({ schema: 'y' })).blockers.some((b) => /expected chrome-reachability/.test(b)), true)

  console.log('-- report')
  {
    const txt = render(decide(hostFixture(), reachFixture()))
    t('the report leads with severity', /SEVERITY              : CRITICAL/.test(txt), true)
    t('…shows every binding with its scope', (txt.match(/\[all-interfaces\]/g) ?? []).length, 4)
    t('…shows the firewall basis, not just a boolean', /no filtering framework was found/.test(txt), true)
    t('…and states what the probe deliberately did not do',
      /No DevTools session was opened/.test(txt), true)
    t('…and never prints a control handle', /ws:\/\/|webSocketDebuggerUrl":"/.test(txt), false)
  }

  if (failed) { console.error(`chrome-exposure selftest: ${failed} failed`); process.exit(1) }
  console.log('chrome-exposure selftest: all cases passed')
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntry) {
  if (process.argv.includes('--selftest')) await selftest()
  else {
    const [hostF, reachF] = process.argv.slice(2)
    if (!hostF) { console.error('usage: assert_chrome_exposure.mjs <host.json> [reachability.json]'); process.exit(2) }
    const host = JSON.parse(readFileSync(hostF, 'utf8'))
    let reach = null
    if (reachF) { try { reach = JSON.parse(readFileSync(reachF, 'utf8')) } catch { reach = null } }
    const d = decide(host, reach)
    console.log(render(d))
    if (d.blockers.length > 0) {
      for (const b of d.blockers) console.error(`::error::${b}`)
      process.exit(1)
    }
    if (d.severity === 'critical') {
      console.error('::error::CRITICAL — unauthenticated DevTools control is reachable from outside the VPS')
      process.exit(1)
    }
  }
}
