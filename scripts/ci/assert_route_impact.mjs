#!/usr/bin/env node
// Turn the read-only route-impact probe into a DECISION, a candidate patch and a
// rollback — and refuse, loudly, whenever the evidence does not support one.
//
// THE QUESTION THIS ANSWERS
// -------------------------
// The pre-stop audit proved that a live route still reaches stylique-os. That is
// enough to block `stop` and not nearly enough to fix it: the remedy depends on
// whether the route serves ONLY stylique-os, or also fronts a container on the
// do-not-touch list. Those need opposite patches, and confusing them takes down
// something the founder explicitly protected.
//
// THREE OUTCOMES, AND ONLY ONE OF THEM IS A GO
// --------------------------------------------
//   route-exclusive  every upstream in the route is stylique-os. The whole route
//                    can be removed. Nothing else loses a backend.
//   upstream-shared  a reverse_proxy lists stylique-os ALONGSIDE a protected
//                    backend. Drop the one upstream entry; the handler keeps
//                    serving from the rest.
//   would-orphan     stylique-os is the ONLY upstream of its handler, but the
//                    route also carries a protected backend in a DIFFERENT
//                    handler. Removing the route would break the protected path;
//                    removing the handler would leave its path with no upstream
//                    at all. REFUSED — this needs a human decision about what
//                    that path should serve, not a mechanical patch.
//
// Anything undetermined — unreadable runtime config, no parser on the host, a
// route we cannot classify — blocks exactly as `would-orphan` does.
//
//   node scripts/ci/assert_route_impact.mjs route-impact.json
//   node scripts/ci/assert_route_impact.mjs --selftest
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export class RouteImpactError extends Error {}

const HEX64 = /^[0-9a-f]{64}$/

/** Split the probe's space-separated identity strings into a usable set. */
export function identities(s) {
  if (typeof s !== 'string') return []
  return s.split(/\s+/).filter((x) => x.length > 0)
}

/**
 * Does this dial reach the target?
 *
 * A dial is `host:port`. The host half is matched against the container name,
 * its network aliases and its IPs. The PORT ALONE IS NEVER SUFFICIENT: two
 * containers can both listen on 4100, and treating the port as proof would
 * misattribute another service's upstream to stylique-os. The port is used only
 * to strengthen a host match that already holds.
 */
export function dialMatches(dial, ids) {
  if (typeof dial !== 'string' || dial.length === 0) return null
  const host = dial.includes(':') ? dial.slice(0, dial.lastIndexOf(':')) : dial
  const bare = host.replace(/^\[|\]$/g, '')
  return ids.some((id) => id.length > 0 && (bare === id || bare.startsWith(`${id}.`)))
}

/** Classify one route. Returns null when it cannot be classified. */
export function classifyRoute(route, targetIds, protectedIds) {
  if (route === null || typeof route !== 'object') return null
  if (!Array.isArray(route.handlers)) return null

  let touchesTarget = false
  let touchesProtected = false
  let sharedHandler = false
  let targetOnlyHandler = false
  let unknownDial = false

  for (const h of route.handlers) {
    const dials = Array.isArray(h?.upstreamDials) ? h.upstreamDials : []
    if (dials.length === 0) continue
    let hTarget = 0
    let hProtected = 0
    for (const d of dials) {
      const t = dialMatches(d, targetIds)
      const p = dialMatches(d, protectedIds)
      if (t === null || p === null) { unknownDial = true; continue }
      if (t) hTarget++
      if (p) hProtected++
      // A dial that matches NEITHER is an unrecognised backend. It is not the
      // target, so it does not block; but it is also not proven safe to strand,
      // so a handler containing one is never treated as target-exclusive.
      if (!t && !p) hProtected++
    }
    if (hTarget > 0) {
      touchesTarget = true
      if (hProtected > 0) sharedHandler = true
      else targetOnlyHandler = true
    } else if (hProtected > 0) {
      touchesProtected = true
    }
  }

  if (unknownDial) return { ...summary(route), verdict: 'undetermined', reason: 'a dial could not be parsed' }
  if (!touchesTarget) return { ...summary(route), verdict: 'unaffected', reason: 'no upstream reaches the target' }
  if (sharedHandler && !targetOnlyHandler) {
    return { ...summary(route), verdict: 'upstream-shared', reason: 'the target shares a handler with other backends; drop only its upstream entry' }
  }
  if (targetOnlyHandler && (touchesProtected || sharedHandler)) {
    return { ...summary(route), verdict: 'would-orphan', reason: 'the target is the sole upstream of its handler while the route also serves protected backends' }
  }
  return { ...summary(route), verdict: 'route-exclusive', reason: 'every upstream in this route reaches only the target' }
}

function summary(r) {
  return {
    server: r.server, routeIndex: r.routeIndex,
    hostMatchers: r.hostMatchers ?? [], pathMatchers: r.pathMatchers ?? [],
    handlerOrder: r.handlerOrder ?? [],
    upstreamDials: r.upstreamDials ?? [],
  }
}

export function decide(a) {
  const blockers = []
  if (a === null || typeof a !== 'object') throw new RouteImpactError('probe output is not a JSON object')

  if (a.caddyRuntimeReadable !== true) blockers.push('the runtime Caddy configuration could not be read')
  if (a.parserAvailable !== true) blockers.push('no JSON parser on the host — the route structure is unavailable')
  if (a.parsed !== true) blockers.push('the runtime configuration could not be parsed into routes')
  if (typeof a.caddyRuntimeConfigSha256 !== 'string' || !HEX64.test(a.caddyRuntimeConfigSha256)) {
    blockers.push('the runtime configuration hash is missing or malformed')
  }

  const targetIds = [a.target, ...identities(a.targetAliases), ...identities(a.targetIps)].filter(Boolean)
  const protectedIds = identities(a.protectedIdentities)

  const routes = Array.isArray(a.routes) ? a.routes : []
  const classified = routes.map((r) => classifyRoute(r, targetIds, protectedIds))
  if (classified.some((c) => c === null)) blockers.push('a route could not be classified')

  const impacted = classified.filter((c) => c && c.verdict !== 'unaffected')
  for (const c of impacted) {
    if (c.verdict === 'undetermined') blockers.push(`route ${c.server}#${c.routeIndex}: ${c.reason}`)
    if (c.verdict === 'would-orphan') blockers.push(`route ${c.server}#${c.routeIndex}: ${c.reason}`)
  }
  if (blockers.length === 0 && impacted.length === 0) {
    blockers.push('no route reaches the target, yet the pre-stop audit said one does — the two probes disagree and that must be resolved before either is trusted')
  }

  return {
    runtimeSha256: a.caddyRuntimeConfigSha256 ?? null,
    diskConfigPath: a.caddyDiskConfigPath ?? null,
    diskConfigSha256: a.caddyDiskConfigSha256 ?? null,
    diskIsBootSource: a.caddyDiskConfigIsBootSource ?? null,
    classified, impacted,
    patch: blockers.length === 0 ? candidatePatch(a, impacted) : null,
    patchable: blockers.length === 0,
    blockers,
  }
}

/**
 * The candidate patch. NOT APPLIED — this run reloads nothing and changes
 * nothing on the host. It is emitted so the change can be reviewed before it is
 * ever authorised.
 *
 * DURABILITY IS PART OF CORRECTNESS. If the container boots from a Caddyfile,
 * an admin-API edit is lost on the next restart and the config silently drifts
 * back to routing at a stopped container. So the durable patch is the file edit;
 * the admin API appears only as the reversible rehearsal.
 */
export function candidatePatch(a, impacted) {
  const steps = []
  const rollback = []
  const durable = a.caddyDiskConfigIsBootSource === true && typeof a.caddyDiskConfigPath === 'string'

  for (const c of impacted) {
    const where = `${c.server} route ${c.routeIndex}`
      + (c.hostMatchers.length ? ` (host ${c.hostMatchers.join(', ')})` : ' (no host matcher — catch-all)')
    if (c.verdict === 'route-exclusive') {
      steps.push({
        where, action: 'remove the whole route',
        rehearsal: `curl -s -X DELETE "${a.caddyAdminEndpoint ?? 'http://localhost:2019/config/'}apps/http/servers/${c.server}/routes/${c.routeIndex}"`,
        durableEdit: durable
          ? `in ${a.caddyDiskConfigPath}, delete the site block for ${c.hostMatchers.join(', ') || '(catch-all)'}`
          : 'the loaded config is not booted from a file on disk; the durable location must be established before any edit',
      })
    } else if (c.verdict === 'upstream-shared') {
      const keep = c.upstreamDials.filter((d) => !dialMatches(d, [a.target, ...identities(a.targetAliases), ...identities(a.targetIps)]))
      steps.push({
        where, action: 'remove ONLY the target upstream from the handler',
        keepUpstreams: keep,
        rehearsal: 'PATCH the handler\'s upstreams array to exactly the keepUpstreams list',
        durableEdit: durable
          ? `in ${a.caddyDiskConfigPath}, remove the stylique-os "to" entry from that reverse_proxy, leaving ${keep.join(', ')}`
          : 'the loaded config is not booted from a file on disk; the durable location must be established before any edit',
      })
    }
  }

  rollback.push(`restore ${a.caddyDiskConfigPath ?? '<disk config>'} to sha256 ${a.caddyDiskConfigSha256 ?? '<unknown>'} (capture a copy BEFORE editing)`)
  rollback.push('docker exec stylique-caddy caddy reload --config <restored file> --adapter caddyfile')
  rollback.push(`the pre-change runtime config hashed ${a.caddyRuntimeConfigSha256}; re-run this probe and require that hash to return`)
  rollback.push(`docker update --restart=unless-stopped ${a.target}   # only if the target was already disabled`)

  return {
    steps, rollback,
    validation: [
      'BEFORE: capture the disk config and its sha256, and the runtime config sha256 (this probe records both).',
      'VALIDATE OFFLINE: `docker exec stylique-caddy caddy validate --config <edited file> --adapter caddyfile` — parses only, loads nothing.',
      'APPLY: `caddy reload` (graceful; it does not drop connections) — a separate, separately authorised step.',
      'AFTER — protected routes: for every host matcher NOT in the impacted list, request it and require the same status and upstream as before.',
      'AFTER — dashboard: stylique-dashboard must still answer on its own host matcher.',
      'AFTER — TwinAI: re-run the worker health probe (status running, health healthy, ffprobe ok, model present, 0 errors).',
      'AFTER — the target: its host matcher must now fail to resolve to it, and ONLY it.',
      'THEN AND ONLY THEN: re-run pre-stop-audit and require ROUTE: clear before `stop` is dispatched.',
    ],
  }
}

export function render(d) {
  const L = []
  L.push('== route impact ==')
  L.push(`  runtime config sha256 : ${d.runtimeSha256}`)
  L.push(`  disk config           : ${d.diskConfigPath} (sha256 ${d.diskConfigSha256})`)
  L.push(`  disk is boot source   : ${String(d.diskIsBootSource)}`)
  L.push(`  routes examined       : ${d.classified.length}, impacted: ${d.impacted.length}`)
  for (const c of d.impacted) {
    L.push(`  -- ${c.server} route ${c.routeIndex} [${c.verdict}]`)
    L.push(`       host matchers   : ${c.hostMatchers.join(', ') || '(none — catch-all)'}`)
    L.push(`       path matchers   : ${c.pathMatchers.join(', ') || '(none — all paths)'}`)
    L.push(`       handler order   : ${c.handlerOrder.join(' -> ') || '(none)'}`)
    L.push(`       upstream dials  : ${c.upstreamDials.join(', ') || '(none)'}`)
    L.push(`       why             : ${c.reason}`)
  }
  if (d.patch) {
    L.push('  CANDIDATE PATCH (not applied; nothing was reloaded):')
    for (const s of d.patch.steps) {
      L.push(`    * ${s.where}`)
      L.push(`        action   : ${s.action}`)
      if (s.keepUpstreams) L.push(`        keep     : ${s.keepUpstreams.join(', ')}`)
      L.push(`        durable  : ${s.durableEdit}`)
      L.push(`        rehearsal: ${s.rehearsal}`)
    }
    L.push('  ROLLBACK:')
    for (const r of d.patch.rollback) L.push(`    - ${r}`)
    L.push('  VALIDATION PLAN:')
    for (const v of d.patch.validation) L.push(`    ${v}`)
  }
  L.push(`  PATCH MAY BE PREPARED : ${String(d.patchable)}`)
  for (const b of d.blockers) L.push(`    blocker: ${b}`)
  return L.join('\n')
}

// ------------------------------------------------------------------ selftest
const TARGET_IDS = ['stylique-os', '172.18.0.5']
const PROT_IDS = ['stylique-dashboard', 'twinai-worker', '172.18.0.9']

function route(over = {}) {
  return {
    server: 'srv0', routeIndex: 0, hostMatchers: ['os.example.com'], pathMatchers: [],
    handlerOrder: ['reverse_proxy'],
    handlers: [{ position: 0, handler: 'reverse_proxy', upstreamDials: ['stylique-os:4100'] }],
    upstreamDials: ['stylique-os:4100'],
    ...over,
  }
}

function probe(over = {}) {
  return {
    target: 'stylique-os', targetPort: 4100, targetPresent: true, restartPolicy: 'no',
    targetIps: '172.18.0.5', targetAliases: '', protectedIdentities: PROT_IDS.join(' '),
    caddyPresent: true, caddyAdminEndpoint: 'http://localhost:2019/config/',
    caddyRuntimeReadable: true, caddyRuntimeConfigSha256: 'a'.repeat(64),
    caddyDiskConfigPath: '/etc/caddy/Caddyfile', caddyDiskConfigSha256: 'b'.repeat(64),
    caddyDiskConfigIsBootSource: true,
    parserAvailable: true, parsed: true,
    routes: [route()],
    ...over,
  }
}

async function selftest() {
  let failed = 0
  const t = (name, got, exp) => {
    if (got === exp) console.log(`  ok: ${name}`)
    else { console.error(`SELFTEST FAIL: ${name} => ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); failed++ }
  }
  const v = (p) => classifyRoute(p, TARGET_IDS, PROT_IDS).verdict

  console.log('-- dial matching')
  t('a dial by container name matches', dialMatches('stylique-os:4100', TARGET_IDS), true)
  t('a dial by ip matches', dialMatches('172.18.0.5:4100', TARGET_IDS), true)
  t('an unrelated dial does not match', dialMatches('postiz:5000', TARGET_IDS), false)
  // THE PORT IS NOT AN IDENTITY. Another container on 4100 must not be read as
  // the target, or the patch would remove somebody else's upstream.
  t('a DIFFERENT host on the target PORT does not match', dialMatches('other-svc:4100', TARGET_IDS), false)
  t('a host prefixed by the name does not false-match', dialMatches('stylique-os-staging:4100', TARGET_IDS), false)
  t('a dotted alias does match', dialMatches('stylique-os.styliquenet:4100', TARGET_IDS), true)

  console.log('-- route classification')
  t('a route serving only the target is route-exclusive', v(route()), 'route-exclusive')
  t('a route serving nothing of ours is unaffected',
    v(route({ handlers: [{ handler: 'reverse_proxy', upstreamDials: ['postiz:5000'] }] })), 'unaffected')
  t('the target sharing ONE handler with a protected backend is upstream-shared',
    v(route({ handlers: [{ handler: 'reverse_proxy', upstreamDials: ['stylique-os:4100', 'stylique-dashboard:80'] }] })),
    'upstream-shared')
  t('the target alone in its handler beside a protected handler is would-orphan',
    v(route({ handlers: [
      { handler: 'reverse_proxy', upstreamDials: ['stylique-os:4100'] },
      { handler: 'reverse_proxy', upstreamDials: ['stylique-dashboard:80'] },
    ] })), 'would-orphan')
  t('an UNRECOGNISED backend beside the target is treated as shared, not exclusive',
    v(route({ handlers: [{ handler: 'reverse_proxy', upstreamDials: ['stylique-os:4100', 'mystery:9000'] }] })),
    'upstream-shared')

  console.log('-- fail closed')
  t('unreadable runtime config blocks', decide(probe({ caddyRuntimeReadable: false })).patchable, false)
  t('no host parser blocks', decide(probe({ parserAvailable: false })).patchable, false)
  t('unparsed config blocks', decide(probe({ parsed: false, routes: null })).patchable, false)
  t('a malformed runtime hash blocks', decide(probe({ caddyRuntimeConfigSha256: 'nope' })).patchable, false)
  t('would-orphan blocks the patch', decide(probe({ routes: [route({ handlers: [
    { handler: 'reverse_proxy', upstreamDials: ['stylique-os:4100'] },
    { handler: 'reverse_proxy', upstreamDials: ['stylique-dashboard:80'] },
  ] })] })).patchable, false)
  // Two probes that disagree is itself a blocker: pre-stop-audit found an
  // upstream, so finding none here means one of them is wrong.
  t('finding NO impacted route blocks (the probes disagree)',
    decide(probe({ routes: [route({ handlers: [{ handler: 'reverse_proxy', upstreamDials: ['postiz:5000'] }] })] })).patchable,
    false)

  console.log('-- the GO case, and what it emits')
  const go = decide(probe())
  t('a route-exclusive impact is patchable', go.patchable, true)
  t('…and emits exactly one step', go.patch.steps.length, 1)
  t('…that removes the whole route', go.patch.steps[0].action, 'remove the whole route')
  t('…with a rollback', go.patch.rollback.length > 0, true)
  t('…and a validation plan that ends at pre-stop-audit',
    go.patch.validation[go.patch.validation.length - 1].includes('ROUTE: clear'), true)

  const shared = decide(probe({ routes: [route({
    handlers: [{ handler: 'reverse_proxy', upstreamDials: ['stylique-os:4100', 'stylique-dashboard:80'] }],
    upstreamDials: ['stylique-os:4100', 'stylique-dashboard:80'],
  })] }))
  t('a shared upstream is patchable', shared.patchable, true)
  t('…and KEEPS the protected backend', JSON.stringify(shared.patch.steps[0].keepUpstreams), JSON.stringify(['stylique-dashboard:80']))
  t('…and never proposes deleting the route', shared.patch.steps[0].action.includes('ONLY the target upstream'), true)

  console.log('-- durability')
  t('a non-file-booted config refuses to name a durable edit',
    decide(probe({ caddyDiskConfigIsBootSource: false })).patch.steps[0].durableEdit.includes('must be established'), true)

  console.log('-- NOTHING MUTATES')
  // The emitted commands are reviewed text, but a `reload` or `stop` hiding in
  // them would be applied by a careless operator reading this as a script.
  const all = JSON.stringify(decide(probe()).patch)
  t('the candidate patch proposes no reload of its own accord', /caddy reload/.test(JSON.stringify(decide(probe()).patch.steps)), false)
  t('the patch contains no docker stop/rm', /docker\s+(stop|rm|rmi|kill)\b/.test(all), false)

  if (failed) { console.error(`route-impact selftest: ${failed} failed`); process.exit(1) }
  console.log('route-impact selftest: all cases passed'); process.exit(0)
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (!isEntry) { /* imported for its exports */ }
else if (process.argv.includes('--selftest')) await selftest()
else {
  const f = process.argv[2]
  if (!f) { console.error('usage: assert_route_impact.mjs <route-impact.json>'); process.exit(2) }
  let d
  try { d = decide(JSON.parse(readFileSync(f, 'utf8'))) }
  catch (e) { console.error(`::error::route impact could not be determined: ${e.message}`); process.exit(1) }
  console.log(render(d))
  if (!d.patchable) {
    console.error('::error::route impact did not yield a safe patch. No Caddy change may be prepared.')
    process.exit(1)
  }
}
