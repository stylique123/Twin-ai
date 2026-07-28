#!/usr/bin/env node
// Turn the Chrome exposure evidence into a SEVERITY and a containment decision
// — and refuse to call anything safe that has not been shown to be safe.
//
// stylique-chrome publishes 6080 (noVNC) and 9222 (Chrome DevTools Protocol) on
// 0.0.0.0 and ::. An open DevTools endpoint is remote control of a browser, so
// whether it answers decides whether containment happens now or waits.
//
// TWO VANTAGE POINTS. The host says what Docker publishes; a probe OUTSIDE the
// VPS says what the internet reaches. Neither answers the other's question.
//
// SEVERITY AND CONTAINMENT ARE SEPARATE JUDGEMENTS. Severity describes the
// exposure and can be read from exposure evidence alone. Containment is a
// MUTATION of a running system, so it additionally requires the evidence needed
// to put things back and the evidence that nothing protected depends on it.
// Conflating them would let a critical finding authorise a stop whose blast
// radius nobody had established.
//
//   node scripts/ci/assert_chrome_exposure.mjs host.json reachability.json
//   node scripts/ci/assert_chrome_exposure.mjs --selftest
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export class ChromeExposureError extends Error {}

const HEX64 = /^[0-9a-f]{64}$/
export const AUDITED_PORTS = [6080, 9222]
export const CONTROL_PORT = 9222
export const HOST_SCHEMA = 'chrome-exposure/2'
export const REACH_SCHEMA = 'chrome-reachability/2'
export const SEVERITY = ['critical', 'high', 'medium', 'low', 'undetermined']

/** A channel is usable ONLY when it was read to completion. */
export const CHANNEL_STATUSES = ['read-complete', 'absent', 'unreadable', 'truncated']
export const REACH_ERROR_CLASSES = [
  'none', 'not-attempted', 'dns', 'connect-refused', 'timeout', 'tls',
  'empty-reply', 'recv-error', 'protocol', 'body-too-large', 'other',
]

export function bindScope(hostIp) {
  if (hostIp === '' || hostIp === '0.0.0.0' || hostIp === '::') return 'all-interfaces'
  if (hostIp === '127.0.0.1' || hostIp === '::1') return 'loopback'
  return 'specific-interface'
}

/**
 * `.NetworkSettings.Ports` reduced to one row per PUBLISHED binding, validated.
 * A malformed spec or port is not silently dropped: it is reported, because a
 * binding this cannot parse is a binding whose exposure is unknown.
 */
export function publishedBindings(dockerPorts) {
  if (dockerPorts === null || typeof dockerPorts !== 'object' || Array.isArray(dockerPorts)) return null
  const out = []; const malformed = []
  for (const [spec, bindings] of Object.entries(dockerPorts)) {
    const m = /^(\d{1,5})\/(tcp|udp)$/.exec(String(spec))
    if (!m) { malformed.push(`port spec ${JSON.stringify(spec)}`); continue }
    const containerPort = Number(m[1])
    if (!Number.isInteger(containerPort) || containerPort < 1 || containerPort > 65535) {
      malformed.push(`container port ${JSON.stringify(spec)}`); continue
    }
    if (!Array.isArray(bindings) || bindings.length === 0) continue
    for (const b of bindings) {
      const hostIp = typeof b?.HostIp === 'string' ? b.HostIp : null
      const hostPort = Number(b?.HostPort)
      if (hostIp === null || !Number.isInteger(hostPort) || hostPort < 1 || hostPort > 65535) {
        malformed.push(`binding of ${spec}`); continue
      }
      out.push({ containerPort, protocol: m[2], hostPort, hostIp, scope: bindScope(hostIp) })
    }
  }
  return { bindings: out, malformed }
}

/** "9222|14|docker-user|drop|tcp|false" -> a typed fact. */
export function parseFirewallFact(s) {
  const p = String(s).split('|')
  if (p.length !== 6) return null
  const port = Number(p[0]); const index = Number(p[1])
  if (!Number.isInteger(port) || !Number.isInteger(index)) return null
  if (!['accept', 'drop', 'unknown'].includes(p[3])) return null
  return { port, index, chain: p[2], action: p[3], protocol: p[4], sourceRestricted: p[5] === 'true' }
}

/**
 * THE CHAIN IS THE POINT.
 *
 * A published container port is DNAT'd and traverses FORWARD, not INPUT. A ufw
 * or INPUT drop therefore does NOT block it — this is the single most common
 * reason a host is believed firewalled and is not, and an earlier revision
 * would have reported such a host as blocked.
 *
 * Only chains on the forwarded path can block a published port. `DOCKER-USER`
 * is the one Docker documents for exactly this, and it is consulted before
 * Docker's own rules.
 */
export const FORWARD_PATH_CHAINS = ['docker-user', 'forward', 'docker-forward']

/**
 * Blocked ONLY when the effective path is proven.
 *
 * Ordering is honoured: within a chain the FIRST matching rule decides, so a
 * drop after an accept does not block. Ambiguity — an unknown chain, an unknown
 * action, a source-restricted rule whose scope cannot be evaluated — is
 * UNDETERMINED, never "accept wins" and never "blocked".
 */
export function firewallVerdict(host, port) {
  if (host.firewallReadStatus !== 'read-complete') {
    return { blocked: null, basis: `the firewall was not read to completion (${host.firewallReadStatus ?? 'not reported'})` }
  }
  if (host.firewallBackend === 'none' || !host.firewallBackend) {
    return { blocked: false, basis: 'no filtering framework was found on the host' }
  }
  const raw = Array.isArray(host.firewallFacts) ? host.firewallFacts : null
  if (raw === null) return { blocked: null, basis: 'the probe reported no firewall facts' }

  const parsed = raw.map(parseFirewallFact)
  if (parsed.some((f) => f === null)) {
    return { blocked: null, basis: 'a firewall fact could not be parsed, so rule order cannot be established' }
  }
  const mine = parsed.filter((f) => f.port === port).sort((a, b) => a.index - b.index)
  if (mine.length === 0) {
    return {
      blocked: null,
      basis: `no rule mentions ${port}; with FORWARD policy ${host.firewallDefaultForward ?? '(not reported)'} `
        + 'that is not evidence of blocking',
    }
  }
  // Rules on the INPUT path cannot block a DNAT'd published port.
  const onPath = mine.filter((f) => FORWARD_PATH_CHAINS.includes(f.chain))
  const offPath = mine.filter((f) => !FORWARD_PATH_CHAINS.includes(f.chain))
  if (onPath.length === 0) {
    return {
      blocked: null,
      basis: `${offPath.length} rule(s) mention ${port} but all sit in ${[...new Set(offPath.map((f) => f.chain))].join(', ')}; `
        + 'a published container port is DNAT\'d and traverses the forward path, so an INPUT rule does not block it',
    }
  }
  if (onPath.some((f) => f.action === 'unknown')) {
    return { blocked: null, basis: 'a rule on the forward path has an action this model cannot read' }
  }
  const first = onPath[0]
  if (first.sourceRestricted) {
    return { blocked: null, basis: `the first forward-path rule for ${port} restricts by source, so whether it applies to `
      + 'an arbitrary internet client is not established' }
  }
  if (first.action === 'accept') {
    return { blocked: false, basis: `the first forward-path rule for ${port} (index ${first.index}, chain ${first.chain}) accepts` }
  }
  return { blocked: true, basis: `the first forward-path rule for ${port} (index ${first.index}, chain ${first.chain}) drops` }
}

/**
 * Is anything protected dependent on Chrome?
 *
 * A channel counts only when its STATUS is read-complete. Absent, unreadable
 * and truncated are all "unknown" — an earlier revision emitted an empty string
 * when the source tree did not exist and the classifier read empty as clean.
 */
export function dependencyVerdict(host) {
  const ownFiles = [host.composeConfigFiles, host.composeWorkingDir]
    .filter((x) => typeof x === 'string' && x.length > 0)
  const isOwnDefinition = (ref) => ownFiles.some((f) => ref.includes(f))
  const split = (v) => (typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter(Boolean) : [])

  const rawHost = split(host.hostFileRefs)
  const ownership = rawHost.filter(isOwnDefinition)

  const channels = {
    envKeys: { status: host.protectedEnvStatus, refs: Array.isArray(host.protectedEnvRefs) ? host.protectedEnvRefs : null },
    sharedNetworks: { status: host.protectedNetworkStatus, refs: Array.isArray(host.protectedNetworkPeers) ? host.protectedNetworkPeers : null },
    twinaiSource: { status: host.twinaiSourceStatus, refs: split(host.twinaiSourceRefs) },
    hostFiles: { status: host.hostFileStatus, refs: rawHost.filter((r) => !isOwnDefinition(r)) },
  }

  const unknown = []
  const refs = []
  for (const [k, v] of Object.entries(channels)) {
    if (!CHANNEL_STATUSES.includes(v.status)) { unknown.push(`${k}(status ${JSON.stringify(v.status)})`); continue }
    if (v.status !== 'read-complete') { unknown.push(`${k}(${v.status})`); continue }
    if (v.refs === null) { unknown.push(`${k}(not reported)`); continue }
    if (v.refs.length > 0) refs.push(`${k}: ${v.refs.join(' | ')}`)
  }
  return {
    channels: Object.fromEntries(Object.entries(channels).map(([k, v]) => [k, v.status ?? null])),
    unknownChannels: unknown,
    references: refs,
    ownershipReferences: ownership,
    dependent: unknown.length > 0 ? null : refs.length > 0,
  }
}

export function portReach(reach, port) {
  const rows = Array.isArray(reach?.ports) ? reach.ports : []
  return rows.find((r) => r?.port === port) ?? null
}

/**
 * Unauthenticated control: the port answered a REAL HTTP response, that
 * response was 200, no credentials were demanded, the body was within bounds,
 * and it carried a live control handle.
 *
 * `httpReached` is only trusted alongside a plausible status and a clean error
 * class — curl reports `000` with exit 0 in several failure modes, and reading
 * that as "HTTP answered" manufactures evidence of a service.
 */
export function unauthenticatedControl(row) {
  if (!row || row.httpReached !== true) return false
  if (row.errorClass !== 'none') return false
  // `!== 200` already rejects a string "200", a zero, and anything out of range,
  // so a separate integer/range guard here would be unreachable. The structural
  // validation of the status lives in reachRowProblems, where it is reachable
  // and tested; duplicating it here would be a guard no test could kill.
  if (row.httpStatus !== 200) return false
  if (row.bodyOversize === true) return false
  if (typeof row.wwwAuthenticate === 'string' && row.wwwAuthenticate.length > 0) return false
  return row.containsWebSocketDebuggerUrl === true
}

/** A row whose evidence is internally inconsistent cannot support any verdict. */
export function reachRowProblems(row) {
  const out = []
  if (!Number.isInteger(row?.port) || !AUDITED_PORTS.includes(row.port)) out.push(`unexpected port ${JSON.stringify(row?.port)}`)
  if (typeof row?.tcpOpen !== 'boolean') out.push('tcpOpen is not a boolean')
  if (typeof row?.httpReached !== 'boolean') out.push('httpReached is not a boolean')
  if (!REACH_ERROR_CLASSES.includes(row?.errorClass)) out.push(`unknown errorClass ${JSON.stringify(row?.errorClass)}`)
  if (row?.httpReached === true) {
    if (!Number.isInteger(row.httpStatus)) out.push('httpReached with no parsed status')
    if (row.bodyOversize !== true && row.bodySha256 !== null && !HEX64.test(String(row.bodySha256 ?? ''))) {
      out.push('body digest is malformed')
    }
    if (row.httpReached === true && row.tcpOpen !== true) out.push('httpReached without tcpOpen')
  }
  if (row?.containsWebSocketDebuggerUrl === true && row?.httpReached !== true) {
    out.push('a control handle is claimed without a parsed HTTP response')
  }
  return out
}

export function decide(host, reach) {
  const blockers = []
  const findings = []
  if (host === null || typeof host !== 'object') throw new ChromeExposureError('host evidence is not a JSON object')
  if (host.schema !== HOST_SCHEMA) blockers.push(`host evidence has schema ${JSON.stringify(host.schema)}, expected ${HOST_SCHEMA}`)
  if (reach !== null && typeof reach === 'object' && reach.schema !== REACH_SCHEMA) {
    blockers.push(`reachability evidence has schema ${JSON.stringify(reach?.schema)}, expected ${REACH_SCHEMA}`)
  }

  if (host.present !== true) {
    return {
      severity: 'low', present: false, published: [], firewall: {}, reach: null, reachAllPorts: null,
      dependency: null, findings: ['stylique-chrome is not present on the host; there is nothing to contain'],
      blockers, containmentEligible: false, containmentBlockers: [],
    }
  }

  // ---- identity must be well formed ---------------------------------------
  if (typeof host.containerId !== 'string' || !/^[0-9a-f]{64}$/.test(host.containerId)) {
    blockers.push('the container id is missing or malformed, so the evidence cannot be tied to a specific container')
  }
  if (typeof host.imageDigest !== 'string' || !/@sha256:[0-9a-f]{64}$/.test(host.imageDigest)) {
    blockers.push('the image digest is missing or malformed; a tag does not identify what is running')
  }

  const pub = publishedBindings(host.dockerPorts)
  if (pub === null) blockers.push('the probe did not report Docker port bindings, so what is published cannot be established')
  else if (pub.malformed.length > 0) {
    blockers.push(`${pub.malformed.length} port binding(s) could not be parsed (${pub.malformed.slice(0, 3).join('; ')}); `
      + 'an unparsed binding is an unknown exposure')
  }
  const bindings = pub?.bindings ?? []
  const exposedAll = bindings.filter((b) => b.scope === 'all-interfaces')
  for (const b of exposedAll) {
    findings.push(`container port ${b.containerPort}/${b.protocol} is published on ${b.hostIp || '0.0.0.0'}:${b.hostPort} — every interface`)
  }

  const firewall = {}
  for (const p of AUDITED_PORTS) firewall[p] = firewallVerdict(host, p)
  if (host.firewallBackend === 'none') {
    findings.push('no host filtering framework was found, so a published port is reachable wherever the host is')
  }

  // ---- external evidence ---------------------------------------------------
  const reachUnavailable = reach === null || !Array.isArray(reach?.ports)
  if (reachUnavailable) {
    blockers.push('no external reachability evidence was supplied; whether the internet can reach these ports '
      + 'cannot be answered from the host itself, and absence of the probe is not absence of exposure')
  } else {
    for (const row of reach.ports) {
      const probs = reachRowProblems(row)
      if (probs.length > 0) blockers.push(`reachability row for port ${JSON.stringify(row?.port)} is inconsistent: ${probs.join('; ')}`)
    }
  }
  const control = portReach(reach, CONTROL_PORT)
  if (!reachUnavailable && control === null) {
    blockers.push(`the reachability probe did not cover port ${CONTROL_PORT}, which is the control port`)
  }
  if (control?.bodyOversize === true) {
    blockers.push(`the response on ${CONTROL_PORT} exceeded the evidence bound, so what it returned is UNDETERMINED`)
  }

  const openControl = unauthenticatedControl(control)
  if (openControl) {
    findings.push(`port ${CONTROL_PORT} answered 200 from outside the VPS with no authentication challenge and `
      + 'returned a live DevTools control handle')
  }

  const dependency = dependencyVerdict(host)
  if (dependency.dependent === null) {
    blockers.push(`Chrome's relationship to protected services is UNPROVEN — ${dependency.unknownChannels.join(', ')}. `
      + 'Unknown is not "no dependency", and no removal may rest on it')
  }
  for (const r of dependency.references) findings.push(`protected-service reference: ${r}`)

  if (host.lastLogStatus !== 'read-complete') {
    findings.push(`last-use evidence is ${host.lastLogStatus ?? 'not reported'}; recency is not established`)
  }

  // ---- severity: exposure evidence only ------------------------------------
  let severity
  if (openControl) severity = 'critical'
  else if (reachUnavailable || control === null || control.bodyOversize === true) severity = 'undetermined'
  else if (control.tcpOpen === true) severity = 'high'
  else if (exposedAll.length > 0 && firewall[CONTROL_PORT]?.blocked !== true) severity = 'medium'
  else severity = 'low'

  // ---- containment: a MUTATION, so a higher bar ----------------------------
  // Severity says how bad the exposure is. Containment says whether stopping
  // this container is a safe act, which needs the evidence to put it back and
  // the evidence that nothing protected leans on it.
  const containmentBlockers = []
  if (!openControl) containmentBlockers.push('containment is reserved for demonstrated unauthenticated control; this is not that')
  if (dependency.dependent === null) containmentBlockers.push('protected-service dependency is unproven, so the blast radius of a stop is unknown')
  if (dependency.dependent === true) containmentBlockers.push('something protected references Chrome; stopping it would take that with it')
  for (const f of ['containerId', 'imageDigest', 'restartPolicy', 'composeProject', 'composeService', 'profileVolume']) {
    if (typeof host[f] !== 'string' || host[f].length === 0) {
      containmentBlockers.push(`reconstruction evidence is incomplete: ${f} is missing, so the container could not be rebuilt as it was`)
    }
  }
  const containmentEligible = openControl === true && containmentBlockers.length === 0

  return {
    severity,
    present: true,
    containerId: host.containerId ?? null,
    imageDigest: host.imageDigest ?? null,
    restartPolicy: host.restartPolicy ?? null,
    state: host.state ?? null,
    lastLogTimestamp: host.lastLogTimestamp ?? null,
    lastLogStatus: host.lastLogStatus ?? null,
    published: bindings,
    exposedOnAllInterfaces: exposedAll,
    firewall,
    reach: control,
    reachAllPorts: Array.isArray(reach?.ports) ? reach.ports : null,
    listenCounts: host.listenCounts ?? null,
    connectionCounts: host.connectionCounts ?? null,
    dependency,
    findings,
    blockers,
    containmentEligible,
    containmentBlockers,
    scopeNote: 'reachability was established by one bounded, unauthenticated GET of /json/version. No DevTools session '
      + 'was opened, no target attached, no tab enumerated, no page navigated, no script executed, no credential '
      + 'guessed, and no profile data read. Response bodies were hashed, never printed; firewall rules were reduced '
      + 'to ordered semantic facts plus a digest; connection peers were reduced to counts.',
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
  L.push(`  last log timestamp    : ${d.lastLogTimestamp ?? '(none)'} [${d.lastLogStatus}]`)
  L.push('  published bindings:')
  for (const b of d.published) L.push(`      ${b.hostIp || '0.0.0.0'}:${b.hostPort} -> ${b.containerPort}/${b.protocol}  [${b.scope}]`)
  L.push('  firewall (effective path):')
  for (const [p, v] of Object.entries(d.firewall)) L.push(`      ${p}: blocked=${String(v.blocked)}  (${v.basis})`)
  if (d.reachAllPorts) {
    L.push('  external reachability (from the CI runner, outside the VPS):')
    for (const r of d.reachAllPorts) {
      L.push(`      ${r.port}: tcp=${r.tcpOpen} http=${r.httpReached} err=${r.errorClass} status=${r.httpStatus}`
        + ` auth=${r.wwwAuthenticate || 'none'} controlHandle=${r.containsWebSocketDebuggerUrl}`)
      if (r.bodySha256) L.push(`          body ${r.bodyBytes} bytes, sha256 ${r.bodySha256}`)
    }
  }
  L.push('  dependency channels:')
  for (const [k, v] of Object.entries(d.dependency?.channels ?? {})) L.push(`      ${k}: ${v}`)
  L.push(`  protected dependency  : ${d.dependency ? String(d.dependency.dependent) : '(not evaluated)'}`)
  for (const f of d.findings) L.push(`      - ${f}`)
  L.push(`  CONTAINMENT ELIGIBLE  : ${String(d.containmentEligible)}`)
  for (const b of d.containmentBlockers) L.push(`      containment blocked: ${b}`)
  for (const b of d.blockers) L.push(`  blocker: ${b}`)
  L.push(`  scope: ${d.scopeNote}`)
  return L.join('\n')
}

// ---------------------------------------------------------------- selftest
export function hostFixture(over = {}) {
  return {
    schema: HOST_SCHEMA,
    present: true,
    containerId: 'c'.repeat(64),
    imageDigest: 'ghcr.io/browserless/chromium@sha256:' + 'a'.repeat(64),
    restartPolicy: 'unless-stopped:0',
    state: 'running',
    lastLogTimestamp: '2026-07-28T08:00:00.000000000Z',
    lastLogStatus: 'read-complete',
    composeProject: 'deploy',
    composeService: 'chrome',
    composeConfigFiles: '/root/24_Backend/deploy/docker-compose.yml',
    composeWorkingDir: '/root/24_Backend/deploy',
    profileVolume: 'deploy_chrome-profile',
    dockerPorts: {
      '6080/tcp': [{ HostIp: '0.0.0.0', HostPort: '6080' }, { HostIp: '::', HostPort: '6080' }],
      '9222/tcp': [{ HostIp: '0.0.0.0', HostPort: '9222' }, { HostIp: '::', HostPort: '9222' }],
    },
    firewallBackend: 'none',
    firewallReadStatus: 'read-complete',
    firewallFacts: [],
    firewallDefaultInput: null,
    firewallDefaultForward: null,
    protectedEnvRefs: [], protectedEnvStatus: 'read-complete',
    protectedNetworkPeers: [], protectedNetworkStatus: 'read-complete',
    twinaiSourceRefs: '', twinaiSourceStatus: 'read-complete',
    hostFileRefs: '/root/24_Backend/deploy/docker-compose.yml,', hostFileStatus: 'read-complete',
    ...over,
  }
}

export function reachRow(port, o = {}) {
  return {
    port, tcpOpen: true, httpReached: true, errorClass: 'none', curlExit: 0, httpStatus: 200,
    bodyBytes: 300, bodyOversize: false, bodySha256: 'd'.repeat(64), wwwAuthenticate: '',
    accessControlAllowOrigin: '', contentType: 'application/json', serverHeader: '',
    containsWebSocketDebuggerUrl: true, ...o,
  }
}
export function reachFixture(over = {}) {
  return { schema: REACH_SCHEMA, probedFrom: 'github-actions-runner', maxBodyBytes: 16384, ports: [reachRow(6080), reachRow(9222)], ...over }
}

async function selftest() {
  let failed = 0
  const t = (name, got, exp) => {
    if (JSON.stringify(got) === JSON.stringify(exp)) console.log(`  ok: ${name}`)
    else { console.error(`SELFTEST FAIL: ${name} => ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); failed++ }
  }
  const dead = (o) => reachRow(CONTROL_PORT, o)

  console.log('-- bind scope')
  t('0.0.0.0 is every interface', bindScope('0.0.0.0'), 'all-interfaces')
  t(':: is every interface', bindScope('::'), 'all-interfaces')
  t('an empty HostIp is every interface', bindScope(''), 'all-interfaces')
  t('127.0.0.1 is the host only', bindScope('127.0.0.1'), 'loopback')
  t('a specific address is neither', bindScope('10.0.0.5'), 'specific-interface')

  console.log('-- published bindings, strictly validated')
  {
    const b = publishedBindings(hostFixture().dockerPorts)
    t('every binding is reported', b.bindings.length, 4)
    t('…and none is malformed', b.malformed.length, 0)
    t('an EXPOSED-but-unpublished port is not a binding', publishedBindings({ '9222/tcp': null }).bindings.length, 0)
    t('a malformed port spec is REPORTED, not dropped', publishedBindings({ 'nonsense': [{ HostIp: '0.0.0.0', HostPort: '1' }] }).malformed.length, 1)
    t('a non-numeric HostPort is reported', publishedBindings({ '9222/tcp': [{ HostIp: '0.0.0.0', HostPort: 'x' }] }).malformed.length, 1)
    t('an out-of-range port is reported', publishedBindings({ '99999/tcp': [{ HostIp: '', HostPort: '1' }] }).malformed.length, 1)
    t('an array is not a ports object', publishedBindings([]), null)
    t('…and a malformed binding BLOCKS',
      decide(hostFixture({ dockerPorts: { '9222/tcp': [{ HostIp: '0.0.0.0', HostPort: 'x' }] } }), reachFixture())
        .blockers.some((x) => /unknown exposure/.test(x)), true)
  }

  console.log('-- curl 000 is not a response (defect 1)')
  {
    // OLD HEAD: exit 0 with `000` and no parsed response was read as reached.
    const ghost = dead({ httpReached: false, errorClass: 'timeout', curlExit: 28, httpStatus: null, bodySha256: null, containsWebSocketDebuggerUrl: false })
    t('a timeout is NOT control', unauthenticatedControl(ghost), false)
    t('…and severity falls to HIGH on the open TCP alone',
      decide(hostFixture(), reachFixture({ ports: [reachRow(6080), ghost] })).severity, 'high')
    for (const [cls, code] of [['dns', 6], ['connect-refused', 7], ['tls', 60], ['empty-reply', 52], ['protocol', 1]]) {
      t(`errorClass ${cls} is not control`,
        unauthenticatedControl(dead({ httpReached: false, errorClass: cls, curlExit: code, httpStatus: null })), false)
    }
    // A row claiming reach with a dirty error class is INCONSISTENT.
    t('reached + non-none errorClass is refused by the control test',
      unauthenticatedControl(dead({ errorClass: 'recv-error' })), false)
    // A STATUS THAT IS NOT A STATUS. curl can hand back a string, or a code
    // outside 1xx-5xx; neither is an HTTP response and neither may support a
    // control verdict.
    t('a non-integer status is not control', unauthenticatedControl(dead({ httpStatus: '200' })), false)
    t('an out-of-range status is not control', unauthenticatedControl(dead({ httpStatus: 999 })), false)
    t('a zero status is not control', unauthenticatedControl(dead({ httpStatus: 0 })), false)
    t('…and a reached row with no parsed status is INCONSISTENT',
      reachRowProblems(dead({ httpStatus: null })).some((p) => /no parsed status/.test(p)), true)
    t('a control handle claimed without a parsed response is INCONSISTENT',
      reachRowProblems(dead({ httpReached: false, errorClass: 'timeout', containsWebSocketDebuggerUrl: true }))
        .some((p) => /without a parsed HTTP response/.test(p)), true)
    t('httpReached without tcpOpen is INCONSISTENT',
      reachRowProblems(dead({ tcpOpen: false })).some((p) => /without tcpOpen/.test(p)), true)
    t('an unknown errorClass is INCONSISTENT',
      reachRowProblems(dead({ errorClass: 'made-up' })).some((p) => /unknown errorClass/.test(p)), true)
    t('…and an inconsistent row BLOCKS',
      decide(hostFixture(), reachFixture({ ports: [reachRow(6080), dead({ tcpOpen: false })] }))
        .blockers.some((b) => /inconsistent/.test(b)), true)
  }

  console.log('-- bounded bytes (defect 2)')
  {
    const big = dead({ bodyOversize: true, bodyBytes: 999999, bodySha256: null, containsWebSocketDebuggerUrl: false })
    t('an oversize body is NOT control', unauthenticatedControl(big), false)
    // THE DANGEROUS CASE. An oversize response that ALSO claims a handle must be
    // UNDETERMINED, not CRITICAL: the evidence exceeded its bound, so what came
    // back was never established, and a severity read off it would be invented.
    const bigWithHandle = dead({ bodyOversize: true, bodyBytes: 999999, bodySha256: null, containsWebSocketDebuggerUrl: true })
    t('an oversize body claiming a handle is STILL not control', unauthenticatedControl(bigWithHandle), false)
    t('…and severity is UNDETERMINED rather than critical',
      decide(hostFixture(), reachFixture({ ports: [reachRow(6080), bigWithHandle] })).severity, 'undetermined')
    t('…and containment is ineligible',
      decide(hostFixture(), reachFixture({ ports: [reachRow(6080), bigWithHandle] })).containmentEligible, false)
    const d = decide(hostFixture(), reachFixture({ ports: [reachRow(6080), big] }))
    t('…severity is UNDETERMINED, not low', d.severity, 'undetermined')
    t('…and it blocks with the bound named', d.blockers.some((b) => /exceeded the evidence bound/.test(b)), true)
    t('the probe declares its bound', reachFixture().maxBodyBytes, 16384)
  }

  console.log('-- per-channel status (defect 3)')
  {
    const clean = decide(hostFixture(), reachFixture())
    t('all channels read-complete and no refs means not dependent', clean.dependency.dependent, false)
    // OLD HEAD: an absent source tree emitted '' and read as clean.
    for (const [f, ch] of [['twinaiSourceStatus', 'twinaiSource'], ['hostFileStatus', 'hostFiles'],
      ['protectedEnvStatus', 'envKeys'], ['protectedNetworkStatus', 'sharedNetworks']]) {
      for (const st of ['absent', 'unreadable', 'truncated']) {
        const d = decide(hostFixture({ [f]: st }), reachFixture())
        t(`${ch} ${st} makes dependency UNPROVEN`, d.dependency.dependent, null)
      }
      t(`${ch} with an unknown status makes dependency UNPROVEN`,
        decide(hostFixture({ [f]: 'made-up' }), reachFixture()).dependency.dependent, null)
    }
    t('OLD HEAD: an empty string with an absent status is NOT clean',
      decide(hostFixture({ twinaiSourceRefs: '', twinaiSourceStatus: 'absent' }), reachFixture()).dependency.dependent, null)
    t('…and the blocker names the channel and its status',
      decide(hostFixture({ twinaiSourceStatus: 'truncated' }), reachFixture())
        .blockers.some((b) => /twinaiSource\(truncated\)/.test(b)), true)
  }

  console.log('-- values that point at chrome (defect 4)')
  {
    const byValue = decide(hostFixture({ protectedEnvRefs: ['twinai-worker:value:BROWSER_URL,'] }), reachFixture())
    t('a generic key whose VALUE points at chrome is a dependency', byValue.dependency.dependent, true)
    t('…reported as the key that holds it', byValue.findings.some((f) => /BROWSER_URL/.test(f)), true)
    t('…and the value itself never appears', JSON.stringify(byValue).includes('9222/devtools'), false)
  }

  console.log('-- no raw rules, no peer addresses (defect 5)')
  {
    const d = decide(hostFixture({
      firewallBackend: 'nftables', firewallReadStatus: 'read-complete',
      firewallFacts: ['9222|14|docker-user|drop|tcp|false'],
      connectionCounts: ['9222:established=2,loopback=0,private=1,other=1'],
    }), reachFixture())
    const blob = JSON.stringify(d)
    t('no raw firewall rule text appears', /(-A INPUT|nft add rule|counter packets)/.test(blob), false)
    t('no peer IPv4 address appears', /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(blob.replace(/0\.0\.0\.0|127\.0\.0\.1/g, '')), false)
    t('connections survive as counts', d.connectionCounts[0], '9222:established=2,loopback=0,private=1,other=1')
  }

  console.log('-- effective path, not just presence (defect 6)')
  {
    const fw = (facts, over = {}) => firewallVerdict(hostFixture({
      firewallBackend: 'iptables', firewallReadStatus: 'read-complete', firewallFacts: facts, ...over }), 9222)
    // THE DOCKER BYPASS. An INPUT drop does not block a published port.
    t('an INPUT drop does NOT prove blocking of a published port',
      fw(['9222|3|input|drop|tcp|false']).blocked, null)
    t('…and says why', /traverses the forward path/.test(fw(['9222|3|input|drop|tcp|false']).basis), true)
    t('a DOCKER-USER drop DOES block', fw(['9222|3|docker-user|drop|tcp|false']).blocked, true)
    // ORDER DECIDES. First matching rule wins.
    t('an accept BEFORE a drop on the forward path is not blocked',
      fw(['9222|2|docker-user|accept|tcp|false', '9222|9|docker-user|drop|tcp|false']).blocked, false)
    t('a drop BEFORE an accept blocks',
      fw(['9222|2|docker-user|drop|tcp|false', '9222|9|docker-user|accept|tcp|false']).blocked, true)
    // OLD HEAD: "accept wins because order is unknown" — false-safe both ways.
    t('OLD HEAD would have called drop-then-accept NOT blocked; corrected head blocks',
      fw(['9222|2|docker-user|drop|tcp|false', '9222|9|docker-user|accept|tcp|false']).blocked, true)
    t('an unknown action on the path is UNDETERMINED',
      fw(['9222|2|docker-user|unknown|tcp|false']).blocked, null)
    t('a source-restricted first rule is UNDETERMINED',
      fw(['9222|2|docker-user|drop|tcp|true']).blocked, null)
    t('no rule at all is UNDETERMINED', fw([]).blocked, null)
    t('an unparsable fact is UNDETERMINED', fw(['garbage']).blocked, null)
    t('a firewall not read to completion is UNDETERMINED',
      firewallVerdict(hostFixture({ firewallReadStatus: 'unreadable' }), 9222).blocked, null)
    t('no framework at all is not blocked', firewallVerdict(hostFixture(), 9222).blocked, false)
    t('a rule for a DIFFERENT port does not count', fw(['6080|2|docker-user|drop|tcp|false']).blocked, null)
  }

  console.log('-- last use, not last exit (defect 7)')
  {
    t('a running container reports a log timestamp', hostFixture().lastLogStatus, 'read-complete')
    const d = decide(hostFixture({ lastLogStatus: 'unreadable', lastLogTimestamp: null }), reachFixture())
    t('an unreadable last-use is surfaced, not silently zero',
      d.findings.some((f) => /recency is not established/.test(f)), true)
    t('…and FinishedAt is not used at all', JSON.stringify(d).includes('finishedAt'), false)
  }

  console.log('-- strict identity + containment eligibility (defect 8)')
  {
    const open = decide(hostFixture(), reachFixture())
    t('demonstrated unauthenticated control is CRITICAL', open.severity, 'critical')
    t('…and with complete evidence, containment IS eligible', open.containmentEligible, true)
    // SEVERITY AND CONTAINMENT ARE SEPARATE.
    const unproven = decide(hostFixture({ twinaiSourceStatus: 'absent' }), reachFixture())
    t('severity stays CRITICAL when dependency is unproven', unproven.severity, 'critical')
    t('…but containment is NOT eligible', unproven.containmentEligible, false)
    t('…because the blast radius is unknown',
      unproven.containmentBlockers.some((b) => /blast radius/.test(b)), true)
    const depends = decide(hostFixture({ protectedEnvRefs: ['twinai-worker:value:BROWSER_URL,'] }), reachFixture())
    t('a real dependency makes containment ineligible', depends.containmentEligible, false)
    for (const f of ['profileVolume', 'composeService', 'restartPolicy']) {
      t(`missing ${f} makes containment ineligible (cannot rebuild)`,
        decide(hostFixture({ [f]: undefined }), reachFixture()).containmentEligible, false)
    }
    t('a malformed container id BLOCKS',
      decide(hostFixture({ containerId: 'short' }), reachFixture()).blockers.some((b) => /container id/.test(b)), true)
    t('a tag instead of a digest BLOCKS',
      decide(hostFixture({ imageDigest: 'browserless/chromium:latest' }), reachFixture())
        .blockers.some((b) => /a tag does not identify/.test(b)), true)
    t('a wrong host schema blocks',
      decide(hostFixture({ schema: 'chrome-exposure/1' }), reachFixture()).blockers.some((b) => /expected chrome-exposure\/2/.test(b)), true)
    t('a wrong reachability schema blocks',
      decide(hostFixture(), reachFixture({ schema: 'chrome-reachability/1' })).blockers.some((b) => /expected chrome-reachability\/2/.test(b)), true)
    // An absent probe must never read as safe.
    const noReach = decide(hostFixture(), null)
    t('absent reachability is UNDETERMINED', noReach.severity, 'undetermined')
    t('…and containment ineligible', noReach.containmentEligible, false)
    const gone = decide(hostFixture({ present: false }), reachFixture())
    t('an absent container is LOW with nothing to contain', gone.severity, 'low')
    t('…and containment ineligible', gone.containmentEligible, false)
    // AUTHENTICATED is a different finding.
    const authed = decide(hostFixture(), reachFixture({
      ports: [reachRow(6080), dead({ httpStatus: 401, wwwAuthenticate: 'Basic realm="browserless"', containsWebSocketDebuggerUrl: false })] }))
    t('an authenticated endpoint is HIGH, not critical', authed.severity, 'high')
    t('…and containment ineligible', authed.containmentEligible, false)
  }

  console.log('-- no handle residue (defect 9)')
  {
    const d = decide(hostFixture(), reachFixture())
    const blob = JSON.stringify(d) + '\n' + render(d)
    // A ws:// or wss:// VALUE must never appear. The boolean PROPERTY NAME may.
    t('no ws:// value appears anywhere', /ws:\/\/[^"]/.test(blob), false)
    t('no wss:// value appears anywhere', /wss:\/\/[^"]/.test(blob), false)
    t('no quoted handle value appears', /"webSocketDebuggerUrl"\s*:\s*"/.test(blob), false)
    // …and the boolean property IS present, so the test is not passing by the
    // field simply being absent.
    t('CONTROL: the boolean property name is present and true',
      /containsWebSocketDebuggerUrl/.test(blob) && d.reach.containsWebSocketDebuggerUrl === true, true)
    // MUTATION SENSITIVITY: were a handle ever to leak into the row, this must fail.
    const leaked = decide(hostFixture(), reachFixture({
      ports: [reachRow(6080), dead({ serverHeader: 'ws://10.0.0.4:9222/devtools/browser/abc' })] }))
    const leakedBlob = JSON.stringify(leaked) + '\n' + render(leaked)
    t('MUTATION: a leaked ws:// value IS detected by this test', /ws:\/\/[^"]/.test(leakedBlob), true)
  }

  console.log('-- ownership vs dependency')
  {
    const clean = decide(hostFixture(), reachFixture())
    t('the container\'s own compose file is ownership', clean.dependency.ownershipReferences, ['/root/24_Backend/deploy/docker-compose.yml'])
    t('…and is not a dependency reference', clean.dependency.references.some((r) => /docker-compose\.yml/.test(r)), false)
    const foreign = decide(hostFixture({
      hostFileRefs: '/root/24_Backend/deploy/docker-compose.yml,/etc/cron.d/nightly-scrape,' }), reachFixture())
    t('a foreign host-file reference IS a dependency', foreign.dependency.dependent, true)
    t('…and names it', foreign.dependency.references.some((r) => /nightly-scrape/.test(r)), true)
  }

  console.log('-- report')
  {
    const txt = render(decide(hostFixture(), reachFixture()))
    t('the report leads with severity', /SEVERITY              : CRITICAL/.test(txt), true)
    t('…shows every binding with its scope', (txt.match(/\[all-interfaces\]/g) ?? []).length, 4)
    t('…shows containment eligibility separately', /CONTAINMENT ELIGIBLE  : true/.test(txt), true)
    t('…lists per-channel statuses', /twinaiSource: read-complete/.test(txt), true)
    t('…and states what the probe deliberately did not do', /No DevTools session /.test(txt), true)
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
    // SEVERITY IS ANNOUNCED FIRST AND UNCONDITIONALLY.
    //
    // The first version emitted blockers and exited before ever mentioning
    // severity, so a run that blocked on an unrelated channel — a truncated
    // file scan — reported "dependency unproven" and said nothing about the
    // exposure. That is the wrong way round: an open control port is a finding
    // in its own right, and it must not be suppressed by an unrelated gap in
    // some other evidence channel. The two are independent, so both are said.
    if (d.severity === 'critical') {
      console.error('::error::CRITICAL — unauthenticated DevTools control is reachable from outside the VPS')
    } else {
      console.error(`::notice::chrome exposure severity: ${d.severity}; containment eligible: ${d.containmentEligible}`)
    }
    if (d.blockers.length > 0) {
      for (const b of d.blockers) console.error(`::error::${b}`)
      process.exit(1)
    }
    if (d.severity === 'critical') process.exit(1)
  }
}
