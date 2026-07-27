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

/**
 * Classify one route AND each of its handlers.
 *
 * The per-handler classification is carried through to the patch. An earlier
 * revision summarised the route and dropped `handlers`, so the patch builder
 * fell back to the route-wide dial list. With two reverse_proxy handlers each
 * pairing the target with a DIFFERENT protected backend that produced ONE step
 * with a fused keep-list — `[stylique-dashboard:80, postiz:5000]` — aimed at
 * "the handler". Applying it would have cross-wired both. Nothing below may
 * aggregate dials across handlers.
 *
 * Returns null when it cannot be classified.
 */
export function classifyRoute(route, targetIds, protectedIds) {
  if (route === null || typeof route !== 'object') return null
  if (!Array.isArray(route.handlers)) return null

  const handlers = []
  let unknownDial = false

  for (const h of route.handlers) {
    const dials = Array.isArray(h?.upstreamDials) ? h.upstreamDials : []
    const keep = []
    let hTarget = 0
    let hOther = 0
    for (const d of dials) {
      const t = dialMatches(d, targetIds)
      const p = dialMatches(d, protectedIds)
      if (t === null || p === null) { unknownDial = true; continue }
      if (t) { hTarget++; continue }
      // Protected OR unrecognised. An unrecognised backend is not the target, so
      // it must survive: stranding something we failed to identify is the same
      // mistake as stranding something we did.
      hOther++
      keep.push(d)
      void p
    }
    handlers.push({
      handlerPath: typeof h?.handlerPath === 'string' ? h.handlerPath : null,
      position: h?.position ?? null,
      handler: h?.handler ?? null,
      addressable: h?.addressable === true,
      upstreamDials: dials,
      keepUpstreams: keep,
      role: hTarget > 0 ? (hOther > 0 ? 'shared' : 'target-only') : (hOther > 0 ? 'other-only' : 'no-upstreams'),
    })
  }

  const base = {
    server: route.server, routeIndex: route.routeIndex,
    routePath: typeof route.routePath === 'string' ? route.routePath : null,
    hostMatchers: route.hostMatchers ?? [], pathMatchers: route.pathMatchers ?? [],
    handlerOrder: route.handlerOrder ?? [],
    upstreamDials: route.upstreamDials ?? [],
    handlers,
  }

  const impactedHandlers = handlers.filter((h) => h.role === 'shared' || h.role === 'target-only')
  const otherHandlers = handlers.filter((h) => h.role === 'other-only')

  if (unknownDial) return { ...base, verdict: 'undetermined', reason: 'a dial could not be parsed' }
  if (impactedHandlers.length === 0) return { ...base, verdict: 'unaffected', reason: 'no upstream reaches the target' }

  // An impacted handler we cannot name cannot be patched. Emitting a step for a
  // path we guessed at is worse than emitting nothing.
  const unaddressable = impactedHandlers.filter((h) => !h.addressable || !h.handlerPath)
  if (unaddressable.length > 0) {
    return { ...base, verdict: 'undetermined', reason: 'an impacted handler has no unambiguous configuration path (unrecognised nesting)' }
  }
  if (base.routePath === null) {
    return { ...base, verdict: 'undetermined', reason: 'the route has no configuration path' }
  }

  const targetOnly = impactedHandlers.filter((h) => h.role === 'target-only')
  if (targetOnly.length > 0 && (otherHandlers.length > 0 || impactedHandlers.some((h) => h.role === 'shared'))) {
    return { ...base, verdict: 'would-orphan', reason: 'the target is the sole upstream of a handler while the route also serves other backends' }
  }
  if (impactedHandlers.every((h) => h.role === 'shared')) {
    return { ...base, verdict: 'upstream-shared', reason: 'the target shares every impacted handler with other backends; drop only its upstream entries' }
  }
  return { ...base, verdict: 'route-exclusive', reason: 'every upstream in this route reaches only the target' }
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
    patch: blockers.length === 0 ? candidatePatch(a, impacted, classified.filter(Boolean)) : null,
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
export function candidatePatch(a, impacted, allClassified) {
  const steps = []
  const durable = a.caddyDiskConfigIsBootSource === true && typeof a.caddyDiskConfigPath === 'string'

  // Shared by every step. Evidence goes stale: between this read-only run and
  // any future mutation the proxy may be reloaded, the file edited, or a
  // backend added. A step that does not re-verify what it was built from is a
  // patch aimed at a configuration that no longer exists.
  const commonPre = [
    `runtime config sha256 == ${a.caddyRuntimeConfigSha256}`,
    `disk config ${a.caddyDiskConfigPath ?? '<unknown>'} sha256 == ${a.caddyDiskConfigSha256 ?? '<unknown>'}`,
  ]

  for (const c of impacted) {
    const where = `${c.server} route ${c.routeIndex}`
      + (c.hostMatchers.length ? ` (host ${c.hostMatchers.join(', ')})` : ' (no host matcher — catch-all)')

    if (c.verdict === 'route-exclusive') {
      steps.push({
        where,
        configPath: c.routePath,
        action: 'remove the whole route',
        // Route indices SHIFT when an earlier route is deleted. Applying two
        // removals in ascending order silently targets the wrong route the
        // second time.
        ordering: 'if more than one route is removed, apply in DESCENDING routeIndex order, or make the durable file edit instead',
        preconditions: [
          ...commonPre,
          `${c.routePath} still exists`,
          `its host matchers are exactly [${c.hostMatchers.join(', ')}]`,
          `its full upstream list is exactly [${c.upstreamDials.join(', ')}]`,
        ],
        rehearsal: `curl -s -X DELETE "${adminBase(a)}${c.routePath}"`,
        durableEdit: durable
          ? `in ${a.caddyDiskConfigPath}, delete the site block for ${c.hostMatchers.join(', ') || '(catch-all)'}`
          : 'the loaded config is not booted from a file on disk; the durable location must be established before any edit',
      })
      continue
    }

    if (c.verdict !== 'upstream-shared') continue

    // ONE STEP PER IMPACTED HANDLER. Never a route-wide keep-list: two handlers
    // each pairing the target with a different protected backend must produce
    // two separate instructions with two separate keep-lists.
    for (const h of c.handlers) {
      if (h.role !== 'shared') continue
      steps.push({
        where: `${where}, handler ${h.position} (${h.handler})`,
        configPath: `${h.handlerPath}/upstreams`,
        action: 'remove ONLY the target upstream from THIS handler',
        keepUpstreams: h.keepUpstreams,
        preconditions: [
          ...commonPre,
          `${h.handlerPath} is still a ${h.handler}`,
          `its upstream list is exactly [${h.upstreamDials.join(', ')}]`,
        ],
        rehearsal: `PUT ${adminBase(a)}${h.handlerPath}/upstreams with exactly `
          + JSON.stringify(h.keepUpstreams.map((d) => ({ dial: d }))),
        durableEdit: durable
          ? `in ${a.caddyDiskConfigPath}, remove the ${a.target} "to" entry from THIS reverse_proxy only, leaving ${h.keepUpstreams.join(', ') || '(nothing — refuse)'}`
          : 'the loaded config is not booted from a file on disk; the durable location must be established before any edit',
      })
    }
  }

  // ROLLBACK RESTORES CADDY AND NOTHING ELSE.
  //
  // An earlier revision ended with `docker update --restart=unless-stopped
  // stylique-os`. Editing a proxy route does not change the container's restart
  // policy, so undoing the edit must not change it either — and that particular
  // command would have re-armed the crash loop that `disable-restart` was run to
  // stop. A rollback that alters state the change never touched is not a
  // rollback.
  const rollback = [
    `restore ${a.caddyDiskConfigPath ?? '<disk config>'} to sha256 ${a.caddyDiskConfigSha256 ?? '<unknown>'} (capture a copy BEFORE editing)`,
    'docker exec stylique-caddy caddy validate --config <restored file> --adapter caddyfile',
    'docker exec stylique-caddy caddy reload --config <restored file> --adapter caddyfile',
    `re-run this probe and require the runtime hash to return to ${a.caddyRuntimeConfigSha256}`,
    'SCOPE: Caddy configuration only. This rollback must not touch any container\'s restart policy, state or image — the route edit did not.',
  ]

  return {
    steps, rollback,
    fingerprints: fingerprintPlan(a, impacted, allClassified),
    validation: [
      'BEFORE: capture the disk config and its sha256, the runtime config sha256, and every fingerprint below.',
      'RE-VERIFY: immediately before applying, re-run this probe and require EVERY step precondition to still hold. Any mismatch refuses — the config moved under the patch.',
      'VALIDATE OFFLINE: `docker exec stylique-caddy caddy validate --config <edited file> --adapter caddyfile` — parses only, loads nothing.',
      'APPLY: `caddy reload` (graceful) — a separate, separately authorised step.',
      'AFTER: re-capture every fingerprint and diff. Protected fingerprints must be IDENTICAL; impacted ones must have changed in exactly the intended way.',
      'AFTER — TwinAI: re-run the worker health probe (status running, health healthy, ffprobe ok, model present, 0 errors).',
      'THEN AND ONLY THEN: re-run pre-stop-audit and require ROUTE: clear before `stop` is dispatched.',
    ],
  }
}

const adminBase = (a) => a.caddyAdminEndpoint ?? 'http://localhost:2019/config/'

/**
 * The exact before/after probes a future mutating stage must run.
 *
 * "Check the dashboard still works" is not a check. Each entry names a concrete
 * host+path and the three things to record, so before and after are comparable
 * mechanically rather than by impression.
 */
export function fingerprintPlan(a, impacted, allClassified) {
  const impactedKeys = new Set(impacted.map((c) => `${c.server}#${c.routeIndex}`))
  const out = []
  const add = (c, kind) => {
    const hosts = c.hostMatchers.length ? c.hostMatchers : ['(catch-all)']
    const paths = c.pathMatchers.length ? c.pathMatchers : ['/']
    for (const host of hosts) {
      for (const p of paths) {
        out.push({
          kind, host, path: p,
          expectation: kind === 'protected'
            ? 'IDENTICAL before and after'
            : 'must stop resolving to the target, and change in no other way',
          record: [
            `HTTP status for https://${host}${p.replace(/\*$/, '')}`,
            `response header fingerprint (server, content-type, content-length) for ${host}${p.replace(/\*$/, '')}`,
            `the upstream list at that route's handlers, read back from the admin API`,
          ],
        })
      }
    }
  }
  for (const c of impacted) add(c, 'impacted')
  for (const c of allClassified) {
    if (!c || impactedKeys.has(`${c.server}#${c.routeIndex}`)) continue
    add(c, 'protected')
  }
  return out
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
      L.push(`        config path : ${s.configPath}`)
      L.push(`        action      : ${s.action}`)
      if (s.keepUpstreams) L.push(`        keep        : ${s.keepUpstreams.join(', ') || '(none — would orphan)'}`)
      if (s.ordering) L.push(`        ordering    : ${s.ordering}`)
      L.push('        preconditions (all must hold immediately before applying):')
      for (const p of s.preconditions) L.push(`          - ${p}`)
      L.push(`        durable     : ${s.durableEdit}`)
      L.push(`        rehearsal   : ${s.rehearsal}`)
    }
    L.push('  ROLLBACK:')
    for (const r of d.patch.rollback) L.push(`    - ${r}`)
    L.push('  FINGERPRINTS to capture BEFORE and compare AFTER:')
    for (const f of d.patch.fingerprints) {
      L.push(`    [${f.kind}] ${f.host}${f.path}  -> ${f.expectation}`)
      for (const r of f.record) L.push(`        record: ${r}`)
    }
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

const RP = 'apps/http/servers/srv0/routes/0/handle'
/** One handler, addressed the way the probe addresses it. */
function hdl(position, dials, over = {}) {
  return {
    handlerPath: `${RP}/${position}`, position, handler: 'reverse_proxy',
    upstreamDials: dials, addressable: true, ...over,
  }
}

function route(over = {}) {
  const handlers = over.handlers ?? [hdl(0, ['stylique-os:4100'])]
  return {
    server: 'srv0', routeIndex: 0, routePath: 'apps/http/servers/srv0/routes/0',
    hostMatchers: ['os.example.com'], pathMatchers: [],
    handlerOrder: handlers.map((h) => h.handler),
    upstreamDials: handlers.flatMap((h) => h.upstreamDials),
    ...over, handlers,
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
    v(route({ handlers: [hdl(0, ['postiz:5000'])] })), 'unaffected')
  t('the target sharing ONE handler with a protected backend is upstream-shared',
    v(route({ handlers: [hdl(0, ['stylique-os:4100', 'stylique-dashboard:80'])] })), 'upstream-shared')
  t('the target alone in its handler beside a protected handler is would-orphan',
    v(route({ handlers: [hdl(0, ['stylique-os:4100']), hdl(1, ['stylique-dashboard:80'])] })), 'would-orphan')
  t('an UNRECOGNISED backend beside the target is treated as shared, not exclusive',
    v(route({ handlers: [hdl(0, ['stylique-os:4100', 'mystery:9000'])] })), 'upstream-shared')

  console.log('-- addressability')
  // A handler the probe could not address unambiguously cannot be patched.
  t('an impacted handler with unknown nesting is undetermined',
    v(route({ handlers: [hdl(0, ['stylique-os:4100', 'stylique-dashboard:80'], { addressable: false })] })), 'undetermined')
  t('an impacted handler with no config path is undetermined',
    v(route({ handlers: [hdl(0, ['stylique-os:4100', 'stylique-dashboard:80'], { handlerPath: null })] })), 'undetermined')
  t('CONTROL: an UNAFFECTED unaddressable handler does not block',
    v(route({ handlers: [hdl(0, ['stylique-os:4100', 'stylique-dashboard:80']), hdl(1, ['postiz:5000'], { addressable: false })] })), 'upstream-shared')
  // Nested subroute handlers ARE addressable, and their path is exact.
  {
    const nested = route({ handlers: [
      hdl(0, [], { handler: 'subroute' }),
      { handlerPath: `${RP}/0/routes/0/handle/0`, position: 0, handler: 'reverse_proxy',
        upstreamDials: ['stylique-os:4100', 'stylique-dashboard:80'], addressable: true },
    ] })
    t('a NESTED subroute handler is addressable and classifies', v(nested), 'upstream-shared')
    const st = decide(probe({ routes: [nested] })).patch.steps
    t('…and its step carries the nested path', st[0].configPath, `${RP}/0/routes/0/handle/0/upstreams`)
  }

  console.log('-- fail closed')
  t('unreadable runtime config blocks', decide(probe({ caddyRuntimeReadable: false })).patchable, false)
  t('no host parser blocks', decide(probe({ parserAvailable: false })).patchable, false)
  t('unparsed config blocks', decide(probe({ parsed: false, routes: null })).patchable, false)
  t('a malformed runtime hash blocks', decide(probe({ caddyRuntimeConfigSha256: 'nope' })).patchable, false)
  t('would-orphan blocks the patch',
    decide(probe({ routes: [route({ handlers: [hdl(0, ['stylique-os:4100']), hdl(1, ['stylique-dashboard:80'])] })] })).patchable, false)
  t('finding NO impacted route blocks (the probes disagree)',
    decide(probe({ routes: [route({ handlers: [hdl(0, ['postiz:5000'])] })] })).patchable, false)

  console.log('-- THE TWO-SHARED-HANDLERS COUNTEREXAMPLE')
  // The defect that shipped at 9b384bd. Two reverse_proxy handlers, each pairing
  // the target with a DIFFERENT protected backend. The route-wide view produced
  // ONE step whose keep-list fused both — applying it would have put postiz into
  // the dashboard's handler and the dashboard into postiz's.
  {
    const twoShared = route({
      hostMatchers: ['multi.example.com'],
      handlers: [
        hdl(0, ['stylique-os:4100', 'stylique-dashboard:80']),
        hdl(1, ['stylique-os:4100', 'postiz:5000']),
      ],
    })
    const d = decide(probe({ routes: [twoShared], protectedIdentities: 'stylique-dashboard postiz twinai-worker' }))
    t('it is patchable', d.patchable, true)
    t('TWO impacted handlers produce TWO steps', d.patch.steps.length, 2)
    t('step 0 addresses handler 0 ONLY', d.patch.steps[0].configPath, `${RP}/0/upstreams`)
    t('step 1 addresses handler 1 ONLY', d.patch.steps[1].configPath, `${RP}/1/upstreams`)
    t('step 0 keeps ONLY its own backend',
      JSON.stringify(d.patch.steps[0].keepUpstreams), JSON.stringify(['stylique-dashboard:80']))
    t('step 1 keeps ONLY its own backend',
      JSON.stringify(d.patch.steps[1].keepUpstreams), JSON.stringify(['postiz:5000']))
    // The exact fusion that made the old output invalid.
    const fused = d.patch.steps.some((x) =>
      (x.keepUpstreams ?? []).includes('stylique-dashboard:80') && (x.keepUpstreams ?? []).includes('postiz:5000'))
    t('NO step fuses backends from different handlers', fused, false)
    t('each step names its own current upstream list',
      d.patch.steps[0].preconditions.some((x) => x.includes('[stylique-os:4100, stylique-dashboard:80]')), true)
  }

  console.log('-- positive controls: a single shared handler stays a single step')
  {
    const one = route({ handlers: [hdl(0, ['stylique-os:4100', 'stylique-dashboard:80'])] })
    const d = decide(probe({ routes: [one] }))
    t('one shared handler -> exactly one step', d.patch.steps.length, 1)
    t('…keeping only the protected backend',
      JSON.stringify(d.patch.steps[0].keepUpstreams), JSON.stringify(['stylique-dashboard:80']))
    t('…addressed at that handler, not the route', d.patch.steps[0].configPath, `${RP}/0/upstreams`)
  }

  console.log('-- the route-exclusive GO case')
  const go = decide(probe())
  t('a route-exclusive impact is patchable', go.patchable, true)
  t('…emits exactly one step', go.patch.steps.length, 1)
  t('…that removes the whole route', go.patch.steps[0].action, 'remove the whole route')
  t('…addressed at the ROUTE path', go.patch.steps[0].configPath, 'apps/http/servers/srv0/routes/0')
  t('…and warns about index shifting', go.patch.steps[0].ordering.includes('DESCENDING'), true)

  console.log('-- preconditions')
  t('every step carries the runtime hash precondition',
    go.patch.steps.every((x) => x.preconditions.some((p) => p.includes('runtime config sha256 == ' + 'a'.repeat(64)))), true)
  t('every step carries the disk hash precondition',
    go.patch.steps.every((x) => x.preconditions.some((p) => p.includes('disk config') && p.includes('b'.repeat(64)))), true)
  t('every step carries its own config path precondition',
    go.patch.steps.every((x) => x.preconditions.some((p) => p.includes(x.configPath.replace(/\/upstreams$/, '')))), true)

  console.log('-- rollback restores CADDY ONLY')
  // The removed line was `docker update --restart=unless-stopped stylique-os`.
  // Editing a route never changed that policy, and that command would re-arm the
  // crash loop `disable-restart` was run to stop.
  const rb = JSON.stringify(go.patch.rollback)
  t('rollback does not change any restart policy', /--restart/.test(rb), false)
  t('rollback does not mention docker update', /docker\s+update/.test(rb), false)
  t('rollback does restore the disk config', /restore .*Caddyfile/.test(rb), true)
  t('rollback validates before reloading', /caddy validate/.test(rb), true)

  console.log('-- fingerprints')
  {
    const d = decide(probe({ routes: [
      route(),
      { server: 'srv0', routeIndex: 1, routePath: 'apps/http/servers/srv0/routes/1',
        hostMatchers: ['dash.example.com'], pathMatchers: ['/admin/*'], handlerOrder: ['reverse_proxy'],
        handlers: [hdl(0, ['stylique-dashboard:80'])], upstreamDials: ['stylique-dashboard:80'] },
    ] }))
    const kinds = d.patch.fingerprints.map((f) => `${f.kind}:${f.host}`)
    t('the impacted host is fingerprinted', kinds.includes('impacted:os.example.com'), true)
    t('the PROTECTED host is fingerprinted too', kinds.includes('protected:dash.example.com'), true)
    t('protected fingerprints must be identical',
      d.patch.fingerprints.find((f) => f.kind === 'protected').expectation.includes('IDENTICAL'), true)
    t('each fingerprint records status, headers and upstreams',
      d.patch.fingerprints[0].record.length, 3)
  }

  console.log('-- durability')
  t('a non-file-booted config refuses to name a durable edit',
    decide(probe({ caddyDiskConfigIsBootSource: false })).patch.steps[0].durableEdit.includes('must be established'), true)

  console.log('-- NOTHING MUTATES')
  const all = JSON.stringify(decide(probe()).patch)
  t('the steps propose no reload of their own accord', /caddy reload/.test(JSON.stringify(go.patch.steps)), false)
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
