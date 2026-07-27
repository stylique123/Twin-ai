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
    // The INDEXED array is authoritative. `upstreamDials` is a convenience view
    // and must never be the thing a patch is built from: rebuilding an upstream
    // object from its dial alone discards every other field Caddy allows on it.
    const ups = Array.isArray(h?.upstreams)
      ? h.upstreams
      : (Array.isArray(h?.upstreamDials) ? h.upstreamDials.map((d, i) => ({ index: i, dial: d, extraKeyCount: 0 })) : [])
    const keep = []
    const targets = []
    for (const u of ups) {
      const d = u?.dial
      const t = dialMatches(d, targetIds)
      const p = dialMatches(d, protectedIds)
      if (t === null || p === null || typeof u?.index !== 'number') { unknownDial = true; continue }
      if (t) { targets.push({ index: u.index, dial: d }); continue }
      // Protected OR unrecognised. An unrecognised backend is not the target, so
      // it must survive: stranding something we failed to identify is the same
      // mistake as stranding something we did.
      keep.push({ index: u.index, dial: d, extraKeyCount: u.extraKeyCount ?? 0 })
      void p
    }
    handlers.push({
      handlerPath: typeof h?.handlerPath === 'string' ? h.handlerPath : null,
      position: h?.position ?? null,
      handler: h?.handler ?? null,
      addressable: h?.addressable === true,
      upstreams: ups,
      upstreamDials: ups.map((u) => u?.dial).filter((d) => typeof d === 'string'),
      targetUpstreams: targets,
      keepUpstreams: keep,
      role: targets.length > 0 ? (keep.length > 0 ? 'shared' : 'target-only') : (keep.length > 0 ? 'other-only' : 'no-upstreams'),
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

/** Split "dev:inode:size:mtime:sha256" into parts, or null. */
export function fileId(v) {
  if (typeof v !== 'string' || v === 'absent' || v.length === 0) return null
  const p = v.split(':')
  if (p.length !== 5) return null
  return { dev: p[0], inode: p[1], size: p[2], mtime: p[3], sha256: p[4] }
}

/**
 * WHY do the host path and the container disagree? Naming the cause is the
 * point — each cause needs a DIFFERENT remedy, and "they differ" needs none of
 * them safely.
 *
 *   stale-file-bind   a FILE bind is pinned to an inode at container start. An
 *                     atomic host replace (write-temp + rename — what every
 *                     sane editor does) leaves the container reading the OLD
 *                     inode while the host path names a NEW one. Editing the
 *                     host file then changes nothing Caddy can see, and a
 *                     reload will not help: the bind must be re-established,
 *                     which means recreating the container.
 *   mount-layering    something is mounted over the target; the host path is
 *                     simply not the file in play.
 *   container-write   the container's own view differs from the host's view of
 *                     the container root — something writes inside.
 *
 * This function REPORTS. It does not choose a remedy: the audit was explicit
 * that a conclusion may not be encoded before the probe proves it.
 */
export function divergenceCause(a) {
  const host = fileId(a.fileIdHostSource)
  const proc = fileId(a.fileIdProcRoot)
  const ctr = fileId(a.fileIdContainer)

  if (host === null || proc === null) {
    return { cause: 'undetermined', detail: 'one of the three file views could not be stat-ed' }
  }
  // ORDER MATTERS. Checking host-vs-proc first and returning `consistent` on a
  // match hides a container-side write entirely: the host and the host's view of
  // the container root can agree perfectly while the container's OWN view has
  // been overwritten. All three views must agree before anything is consistent.
  if (ctr !== null && proc.sha256 !== ctr.sha256) {
    return {
      cause: 'container-write',
      detail: `the container's own view (${ctr.sha256.slice(0, 12)}) differs from the host's view of `
        + `the container root (${proc.sha256.slice(0, 12)}) — something writes inside the container`,
    }
  }
  if (host.sha256 === proc.sha256) {
    return { cause: 'consistent', detail: 'all available views of the boot file agree' }
  }
  const layered = typeof a.mountinfoRelevant === 'string'
    && a.mountinfoRelevant.split(';').filter((x) => x.trim().length > 0).length > 1
  if (layered) {
    return {
      cause: 'mount-layering',
      detail: `more than one mount covers ${a.caddyDiskConfigPath}; the host bind source is not the file in play`,
    }
  }
  if (host.inode !== proc.inode) {
    return {
      cause: 'stale-file-bind',
      detail: `the bind is pinned to inode ${proc.inode} but the host path now names inode ${host.inode} — `
        + 'the host file was replaced atomically after the container started, so the container still reads '
        + 'the original inode. A host-file edit is invisible to Caddy and a reload cannot rebind it.',
    }
  }
  return { cause: 'undetermined', detail: 'contents differ but inode, layering and container-write are all ruled out' }
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
  // An unproven durable location blocks the whole patch. A remedy that cannot
  // be made durable would be reverted by the next container restart, silently
  // restoring a route to a stopped container.
  const dres = durableResolution(a)
  if (!dres.ok) blockers.push(`durable edit location unproven: ${dres.reason}`)

  // Naming the cause never authorises anything — it makes the refusal
  // actionable. Only `consistent` is compatible with a patch at all.
  const div = divergenceCause(a)
  if (div.cause !== 'consistent') {
    blockers.push(`host/container file divergence [${div.cause}]: ${div.detail}`)
  }

  // ZERO PARSED ROUTES IS NOT "NO ROUTES". Report the shape so an unfamiliar
  // config is diagnosable rather than silently empty.
  const shape = a.configKeyPaths ?? null
  if (a.parsed === true && Array.isArray(a.routes) && a.routes.length === 0) {
    blockers.push('the configuration parsed but yielded zero routes — that is an unrecognised shape, '
      + 'not evidence that nothing is routed; the pre-stop audit already proved an upstream exists')
  }

  if (blockers.length === 0 && impacted.length === 0) {
    blockers.push('no route reaches the target, yet the pre-stop audit said one does — the two probes disagree and that must be resolved before either is trusted')
  }

  return {
    runtimeSha256: a.caddyRuntimeConfigSha256 ?? null,
    diskConfigPath: a.caddyDiskConfigPath ?? null,
    diskConfigSha256: a.caddyDiskConfigSha256 ?? null,
    diskIsBootSource: a.caddyDiskConfigIsBootSource ?? null,
    mountRoot: a.caddyBootMountRoot ?? null,
    mountDest: a.caddyBootMountDest ?? null,
    mountType: a.caddyBootMountType ?? null,
    hostBootFile: dres.hostFile,
    hostBootFileSha256: a.caddyBootFileSha256 ?? null,
    divergence: div,
    configShape: shape,
    caddyArgv: a.caddyArgv ?? null,
    caddyEnvKeys: a.caddyEnvKeys ?? null,
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
        durableEdit: durableEditFor(a, `delete the site block for ${c.hostMatchers.join(', ') || '(catch-all)'}`),
      })
      continue
    }

    if (c.verdict !== 'upstream-shared') continue

    // ONE STEP PER IMPACTED HANDLER. Never a route-wide keep-list: two handlers
    // each pairing the target with a different protected backend must produce
    // two separate instructions with two separate address sets.
    for (const h of c.handlers) {
      if (h.role !== 'shared') continue

      // DELETE THE TARGET ENTRIES. DO NOT REBUILD THE ARRAY.
      //
      // The previous revision emitted `PUT <handler>/upstreams` with the keep
      // list re-serialised as `[{dial}, …]`. That is lossless only if a dial is
      // the ONLY field an upstream carries — and Caddy allows more
      // (`max_requests`, per-upstream health overrides, …). A protected backend
      // configured with any of them would have had it silently stripped by a
      // patch whose stated purpose was to leave it alone.
      //
      // Deleting the target entries by exact index touches nothing else. The
      // survivors are never read, re-encoded or written.
      //
      // DESCENDING ORDER IS NOT A STYLE CHOICE. Removing index 1 shifts index 2
      // down to 1; ascending deletion of [1,2] removes 1 and then whatever
      // moved into 2, which is a survivor.
      const targetsDesc = [...h.targetUpstreams].sort((a2, b2) => b2.index - a2.index)
      steps.push({
        where: `${where}, handler ${h.position} (${h.handler})`,
        configPath: `${h.handlerPath}/upstreams`,
        action: 'DELETE only the target upstream entries, by index, descending',
        targetUpstreams: targetsDesc,
        keepUpstreams: h.keepUpstreams.map((k) => k.dial),
        ordering: 'delete in DESCENDING index order — removing a lower index shifts every higher one down',
        deletePaths: targetsDesc.map((u) => `${h.handlerPath}/upstreams/${u.index}`),
        preconditions: [
          ...commonPre,
          `${h.handlerPath} is still a ${h.handler}`,
          `${h.handlerPath}/upstreams has exactly ${h.upstreams.length} entr`
            + `${h.upstreams.length === 1 ? 'y' : 'ies'}`,
          `${h.handlerPath}/upstreams in order is exactly `
            + JSON.stringify(h.upstreams.map((u) => ({ index: u.index, dial: u.dial }))),
          ...targetsDesc.map((u) => `${h.handlerPath}/upstreams/${u.index} has dial ${u.dial}`),
          `after deletion ${h.handlerPath}/upstreams must still contain exactly `
            + `[${h.keepUpstreams.map((k) => k.dial).join(', ')}] and must not be empty`,
        ],
        rehearsal: targetsDesc
          .map((u) => `curl -s -X DELETE "${adminBase(a)}${h.handlerPath}/upstreams/${u.index}"   # ${u.dial}`)
          .join('\n                    '),
        losslessness: `the ${h.keepUpstreams.length} surviving upstream object(s) are never rewritten; `
          + `${h.keepUpstreams.filter((k) => (k.extraKeyCount ?? 0) > 0).length} of them carry fields beyond \`dial\` `
          + 'which a whole-array PUT would have discarded',
        durableEdit: durableEditFor(a, `remove the ${a.target} "to" entry from THIS reverse_proxy only, leaving ${h.keepUpstreams.map((k) => k.dial).join(', ') || '(nothing — refuse)'}`),
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
 * Resolve — and PROVE — where a durable edit would actually be written.
 *
 * A container path is not an edit location, and neither is a MOUNT ROOT. If
 * /etc/caddy is bind-mounted from /root/caddy and the boot file is
 * /etc/caddy/Caddyfile, the file to edit is /root/caddy/Caddyfile. An earlier
 * revision emitted the mount Source, so a directory mount sent a reviewer to a
 * DIRECTORY. Its positive test hid this by using an exact-file mount, where
 * Source happens to already end in Caddyfile.
 *
 * The mapping is not trusted on its shape. The host file's own sha256 must equal
 * the sha256 read from inside the container: if the two disagree, the mapping
 * resolved to a DIFFERENT FILE and every instruction built on it is aimed at the
 * wrong place. That single comparison catches a wrong mount, a stale path and a
 * symlink surprise at once.
 */
export function durableResolution(a) {
  const fail = (reason) => ({ ok: false, reason, hostFile: null })
  if (a.caddyDiskConfigIsBootSource !== true || typeof a.caddyDiskConfigPath !== 'string') {
    return fail('the loaded configuration is not booted from a file on disk; no durable edit location exists')
  }
  const host = a.caddyBootFileHostPath
  if (typeof host !== 'string' || host.length === 0) {
    return fail(`${a.caddyDiskConfigPath} could not be mapped through any container mount `
      + '(baked into the image, or an unresolved mapping) — no durable edit target exists')
  }
  if (!host.startsWith('/')) {
    return fail(`the resolved boot file ${JSON.stringify(host)} is not an absolute host path`)
  }
  // Naming a directory as "the file to edit" is the defect this exists to stop.
  if (typeof a.caddyBootMountRoot === 'string' && host === a.caddyBootMountRoot
      && typeof a.caddyBootMountDest === 'string' && a.caddyBootMountDest !== a.caddyDiskConfigPath) {
    return fail(`the resolution collapsed to the mount root ${host}, which is a directory, not the boot file`)
  }
  if (a.caddyBootFileIsRegular !== true) return fail(`${host} is not a regular file on the host`)
  if (a.caddyBootFileReadable !== true) return fail(`${host} is not readable on the host`)
  if (a.caddyBootFileWritable !== true) return fail(`${host} is not writable; a durable edit cannot be written there`)
  if (typeof a.caddyBootFileSha256 !== 'string' || !HEX64.test(a.caddyBootFileSha256)) {
    return fail(`${host} has no usable sha256, so the mapping cannot be proven`)
  }
  if (typeof a.caddyDiskConfigSha256 !== 'string' || !HEX64.test(a.caddyDiskConfigSha256)) {
    return fail('the container-read config sha256 is missing or malformed, so the mapping cannot be proven')
  }
  if (a.caddyBootFileSha256 !== a.caddyDiskConfigSha256) {
    return fail(`${host} hashes ${a.caddyBootFileSha256} but the container reads `
      + `${a.caddyDiskConfigSha256} at ${a.caddyDiskConfigPath} — the mapping resolved to a DIFFERENT file`)
  }
  return { ok: true, reason: null, hostFile: host, mountType: a.caddyBootMountType ?? null }
}

/**
 * Compose provenance, only when it is actually actionable.
 *
 * `com.docker.compose.project.config_files` is frequently RELATIVE to the
 * project working dir. Printing it as though it were a path sends people to a
 * file that does not exist from where they are standing, so an unresolved label
 * is reported as informational and never as a source path.
 */
export function composeProvenance(a) {
  const r = a.caddyComposeFileResolved
  if (typeof r === 'string' && r.startsWith('/')) return { resolved: r, informational: null }
  const label = a.caddyComposeFileLabel
  if (typeof label === 'string' && label.length > 0) {
    return { resolved: null, informational: `compose label ${JSON.stringify(label)} (UNRESOLVED — relative to an unknown working dir; not an edit path)` }
  }
  return { resolved: null, informational: null }
}

export function durableEditFor(a, what) {
  const d = durableResolution(a)
  if (!d.ok) return `REFUSED: ${d.reason}`
  const c = composeProvenance(a)
  // ONLY the resolved FILE is ever named. Never the mount directory.
  const suffix = c.resolved ? ` (compose source: ${c.resolved})`
    : (c.informational ? ` (${c.informational})` : '')
  const vol = d.mountType === 'volume'
    ? ' [NOTE: this is a named VOLUME, not a bind mount — editing it bypasses the volume\'s own lifecycle]' : ''
  return `edit the HOST FILE ${d.hostFile}${suffix}${vol}: ${what}`
}

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
    // For a shared handler, "the endpoint still answers" is far too weak: it can
    // answer while a survivor has lost its metadata, or while the handler has
    // been emptied and Caddy is returning someone else's route. Bind the exact
    // surviving dial set, per handler, and require the handler to stay non-empty.
    const perHandler = (c.handlers ?? [])
      .filter((h) => h.role === 'shared')
      .map((h) => ({
        handlerPath: h.handlerPath,
        mustRemainExactly: h.keepUpstreams.map((k) => k.dial),
        mustNotBeEmpty: true,
        mustNotContain: h.targetUpstreams.map((t) => t.dial),
      }))
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
          handlerAssertions: perHandler,
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
  L.push(`  mount                 : ${String(d.mountRoot)} -> ${String(d.mountDest)} (${String(d.mountType)})`)
  L.push(`  RESOLVED HOST FILE    : ${String(d.hostBootFile)} (sha256 ${String(d.hostBootFileSha256)})`)
  L.push(`  routes examined       : ${d.classified.length}, impacted: ${d.impacted.length}`)
  L.push(`  FILE DIVERGENCE       : ${d.divergence.cause}`)
  L.push(`      ${d.divergence.detail}`)
  L.push(`  caddy argv            : ${String(d.caddyArgv)}`)
  L.push(`  caddy env KEYS        : ${String(d.caddyEnvKeys)}`)
  if (d.configShape) {
    L.push(`  servers               : ${JSON.stringify(d.configShape.serverNames)} (${d.configShape.serverCount})`)
    L.push(`  routes per server     : ${JSON.stringify(d.configShape.routeCountByServer)}`)
    L.push('  config key paths (names + counts only):')
    for (const kp of (d.configShape.keyPaths ?? []).slice(0, 40)) L.push(`      ${kp}`)
  }
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
      if (s.deletePaths) {
        L.push('        delete ONLY (descending index order):')
        for (const dp of s.deletePaths) L.push(`          ${dp}`)
      }
      if (s.losslessness) L.push(`        lossless    : ${s.losslessness}`)
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
      for (const ha of f.handlerAssertions ?? []) {
        L.push(`        AFTER ${ha.handlerPath}/upstreams must be exactly [${ha.mustRemainExactly.join(', ')}]`)
        L.push(`              and must be non-empty, and must NOT contain [${ha.mustNotContain.join(', ')}]`)
      }
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
/**
 * One handler, addressed the way the probe addresses it.
 * `dials` may be plain strings, or [dial, extraKeyCount] to model an upstream
 * carrying fields beyond `dial` (max_requests and friends).
 */
function hdl(position, dials, over = {}) {
  const ups = dials.map((d, i) => Array.isArray(d)
    ? { index: i, dial: d[0], extraKeyCount: d[1] }
    : { index: i, dial: d, extraKeyCount: 0 })
  return {
    handlerPath: `${RP}/${position}`, position, handler: 'reverse_proxy',
    upstreams: ups,
    upstreamDials: ups.map((u) => u.dial),
    upstreamCount: ups.length,
    addressable: true, ...over,
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
    // A DIRECTORY mount, deliberately: the previous fixture used an exact-file
    // mount, where Source already ends in Caddyfile, and that coincidence hid
    // the resolver defect entirely.
    caddyBootMountRoot: '/root/caddy', caddyBootMountDest: '/etc/caddy',
    caddyBootMountType: 'bind', caddyBootMountWritable: true,
    caddyBootFileHostPath: '/root/caddy/Caddyfile',
    caddyBootFileIsRegular: true, caddyBootFileReadable: true, caddyBootFileWritable: true,
    caddyBootFileSha256: 'b'.repeat(64),
    // Three consistent views: same inode, same bytes, no layering.
    caddyPid: '4242',
    fileIdHostSource: `2049:9001:812:1750000000:${'b'.repeat(64)}`,
    fileIdProcRoot: `2049:9001:812:1750000000:${'b'.repeat(64)}`,
    fileIdContainer: `2049:9001:812:1750000000:${'b'.repeat(64)}`,
    mountinfoRelevant: '/etc/caddy/Caddyfile /srv/caddy/Caddyfile ext4;',
    caddyArgv: 'caddy run --config /etc/caddy/Caddyfile --adapter caddyfile',
    caddyEnvKeys: 'PATH XDG_CONFIG_HOME XDG_DATA_HOME',
    configKeyPaths: { keyPaths: ['/apps{1}', '/apps/http{1}'], serverNames: ['srv0'], serverCount: 1, routeCountByServer: { srv0: 1 } },
    caddyComposeFileLabel: 'docker-compose.yml',
    caddyComposeDir: '/root/24_Backend/deploy',
    caddyComposeFileResolved: '/root/24_Backend/deploy/docker-compose.yml',
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
  // Unaddressable shapes must fail closed at the DECIDE level too, not merely
  // classify to `undetermined` somewhere out of sight.
  t('an unaddressable impacted handler blocks the patch',
    decide(probe({ routes: [route({ handlers: [hdl(0, ['stylique-os:4100', 'stylique-dashboard:80'], { addressable: false })] })] })).patchable, false)
  t('a missing handler path blocks the patch',
    decide(probe({ routes: [route({ handlers: [hdl(0, ['stylique-os:4100', 'stylique-dashboard:80'], { handlerPath: null })] })] })).patchable, false)
  t('a route with no routePath blocks the patch',
    decide(probe({ routes: [route({ routePath: null })] })).patchable, false)
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
    t('step 0 deletes ONLY its own target index', JSON.stringify(d.patch.steps[0].deletePaths), JSON.stringify([`${RP}/0/upstreams/0`]))
    t('step 1 deletes ONLY its own target index', JSON.stringify(d.patch.steps[1].deletePaths), JSON.stringify([`${RP}/1/upstreams/0`]))
    // Scoped to what would actually be RUN. The losslessness note mentions the
    // word PUT to explain what is no longer done; prose is not an instruction.
    t('no rehearsal issues a PUT or whole-array write',
      d.patch.steps.some((x) => /\bPUT\b|\bPATCH\b/.test(x.rehearsal ?? '')), false)
    t('every shared step rehearses DELETE only',
      d.patch.steps.every((x) => (x.rehearsal ?? '').includes('-X DELETE')), true)
    // The exact fusion that made the old output invalid.
    const fused = d.patch.steps.some((x) =>
      (x.keepUpstreams ?? []).includes('stylique-dashboard:80') && (x.keepUpstreams ?? []).includes('postiz:5000'))
    t('NO step fuses backends from different handlers', fused, false)
    t('each step names its OWN ordered index/dial list',
      d.patch.steps[0].preconditions.some((x) =>
        x.includes(`${RP}/0/upstreams`) && x.includes(JSON.stringify([
          { index: 0, dial: 'stylique-os:4100' }, { index: 1, dial: 'stylique-dashboard:80' }]))), true)
    t('…and step 1 names ITS own, not step 0\'s',
      d.patch.steps[1].preconditions.some((x) =>
        x.includes(`${RP}/1/upstreams`) && x.includes(JSON.stringify([
          { index: 0, dial: 'stylique-os:4100' }, { index: 1, dial: 'postiz:5000' }]))), true)
    t('each step binds each target index AND its dial',
      d.patch.steps[0].preconditions.some((x) => x.includes(`${RP}/0/upstreams/0 has dial stylique-os:4100`)), true)
    // The exact-path assertion must be exercised on SHARED-handler steps. Run
    // only against the route-exclusive fixture it was vacuous: that step's
    // configPath IS the route path, which its precondition trivially contains.
    t('every SHARED step binds its exact /upstreams path',
      d.patch.steps.every((x) => x.preconditions.some((pc) => pc.includes(x.configPath))), true)
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

  console.log('-- LOSSLESSNESS: a protected upstream carrying extra metadata')
  // The 0a91974 defect. `stylique-dashboard` has max_requests (extraKeyCount 1).
  // The old rehearsal PUT the whole array rebuilt from {dial} only, silently
  // discarding it. The corrected plan must never write that object at all.
  {
    const meta = route({ handlers: [hdl(0, ['stylique-os:4100', ['stylique-dashboard:80', 1]])] })
    const d = decide(probe({ routes: [meta] }))
    t('it is patchable', d.patchable, true)
    const st = d.patch.steps[0]
    t('the step DELETES rather than replaces', st.action.startsWith('DELETE only'), true)
    t('it deletes exactly the target index', JSON.stringify(st.deletePaths), JSON.stringify([`${RP}/0/upstreams/0`]))
    // The decisive assertion: the protected entry's ADDRESS never appears in
    // anything the step would write.
    t('the protected upstream index is NEVER a write target',
      (st.deletePaths ?? []).some((x) => x.endsWith('/upstreams/1')), false)
    t('no serialised {dial} array is emitted for the survivors',
      /\{"dial":"stylique-dashboard:80"\}/.test(st.rehearsal ?? ''), false)
    t('the step states its losslessness and counts the metadata-bearing survivor',
      /1 of them carry fields beyond/.test(st.losslessness), true)
    t('a precondition requires the survivor to remain after deletion',
      st.preconditions.some((x) => x.includes('must still contain exactly [stylique-dashboard:80]')), true)
  }

  console.log('-- MULTIPLE target entries + index shift')
  {
    const multi = route({ handlers: [hdl(0, [
      'stylique-os:4100', 'stylique-dashboard:80', 'stylique-os:4101', 'postiz:5000'])] })
    const d = decide(probe({ routes: [multi], protectedIdentities: 'stylique-dashboard postiz twinai-worker' }))
    const st = d.patch.steps[0]
    t('both target entries are deleted', st.deletePaths.length, 2)
    // 2 BEFORE 0. Ascending would delete 0, shifting index 2 down to 1, and the
    // second delete would then remove stylique-dashboard.
    t('deletes are ordered DESCENDING by index',
      JSON.stringify(st.deletePaths), JSON.stringify([`${RP}/0/upstreams/2`, `${RP}/0/upstreams/0`]))
    t('the ordering hazard is stated', /DESCENDING/.test(st.ordering), true)
    t('both survivors are kept', JSON.stringify(st.keepUpstreams), JSON.stringify(['stylique-dashboard:80', 'postiz:5000']))
    // MUTATION CONTROL: ascending order would strand a protected backend.
    const asc = [...st.deletePaths].sort()
    t('CONTROL: ascending order differs — it is not accidentally the same',
      JSON.stringify(asc) === JSON.stringify(st.deletePaths), false)
  }

  console.log('-- durable edit location: DIRECTORY-MOUNT resolution')
  // THE 8b98a24 DEFECT. /etc/caddy mounted from /root/caddy, boot file
  // /etc/caddy/Caddyfile. The old resolver emitted the mount Source —
  // /root/caddy — a DIRECTORY. The old positive test used an exact-file mount,
  // where Source already ends in Caddyfile, so it could never have caught this.
  {
    const d = decide(probe())
    t('a directory mount resolves to the FILE, not the mount root',
      d.patch.steps[0].durableEdit.includes('/root/caddy/Caddyfile'), true)
    t('the mount ROOT is never named as the thing to edit',
      /edit the HOST FILE \/root\/caddy(?!\/)/.test(d.patch.steps[0].durableEdit), false)
    t('the resolved file is reported alongside its hash', d.hostBootFile, '/root/caddy/Caddyfile')
  }
  // Control: an exact-file mount still works, and Source IS the file.
  t('an exact-file mount resolves to Source itself',
    decide(probe({ caddyBootMountDest: '/etc/caddy/Caddyfile', caddyBootMountRoot: '/root/deploy/Caddyfile',
      caddyBootFileHostPath: '/root/deploy/Caddyfile' })).patch.steps[0].durableEdit
      .includes('/root/deploy/Caddyfile'), true)
  // The collapse case, asserted directly.
  t('resolving to the mount root of a DIRECTORY mount is refused',
    durableResolution({ ...probe(), caddyBootFileHostPath: '/root/caddy' }).ok, false)

  console.log('-- durable edit location must be PROVEN or REFUSED')
  t('a READ-ONLY file refuses',
    decide(probe({ caddyBootFileWritable: false })).patchable, false)
  t('a non-regular file refuses',
    decide(probe({ caddyBootFileIsRegular: false })).patchable, false)
  t('an unreadable file refuses', decide(probe({ caddyBootFileReadable: false })).patchable, false)
  t('an unmapped path (baked into the image) refuses',
    decide(probe({ caddyBootFileHostPath: '' })).patchable, false)
  t('a relative resolved path refuses',
    decide(probe({ caddyBootFileHostPath: 'caddy_cfg/Caddyfile' })).patchable, false)
  t('a non-file-booted config refuses', decide(probe({ caddyDiskConfigIsBootSource: false })).patchable, false)
  // HASH MUTATION CONTROL: the host file and the container-read file must be
  // the same bytes, or the mapping found a different file.
  t('a host/container sha256 MISMATCH refuses',
    decide(probe({ caddyBootFileSha256: 'c'.repeat(64) })).patchable, false)
  t('…and says so explicitly',
    decide(probe({ caddyBootFileSha256: 'c'.repeat(64) })).blockers
      .some((b) => b.includes('DIFFERENT file')), true)
  t('CONTROL: matching hashes are patchable', decide(probe()).patchable, true)

  console.log('-- named volumes are resolvable but labelled')
  {
    const vol = probe({
      caddyBootMountType: 'volume', caddyBootMountRoot: '/var/lib/docker/volumes/caddy_cfg/_data',
      caddyBootFileHostPath: '/var/lib/docker/volumes/caddy_cfg/_data/Caddyfile',
    })
    const d = decide(vol)
    t('a named volume with a real host path IS patchable', d.patchable, true)
    t('…and is explicitly labelled a volume, not a bind',
      d.patch.steps[0].durableEdit.includes('named VOLUME'), true)
  }

  console.log('-- compose provenance is resolved or marked unresolved')
  t('an absolute resolved compose file is named',
    decide(probe()).patch.steps[0].durableEdit.includes('/root/24_Backend/deploy/docker-compose.yml'), true)
  t('an UNRESOLVED relative label is never presented as a path',
    decide(probe({ caddyComposeFileResolved: '' })).patch.steps[0].durableEdit.includes('UNRESOLVED'), true)
  t('…and the bare relative label is not offered as a source path',
    /compose source: docker-compose\.yml/.test(
      decide(probe({ caddyComposeFileResolved: '' })).patch.steps[0].durableEdit), false)

  console.log('-- fingerprints bind the exact surviving dial set')
  {
    const d = decide(probe({ routes: [route({ handlers: [hdl(0, ['stylique-os:4100', ['stylique-dashboard:80', 2]])] })] }))
    const fp = d.patch.fingerprints.find((f) => f.kind === 'impacted')
    t('an impacted fingerprint carries per-handler assertions', (fp.handlerAssertions ?? []).length, 1)
    t('…requiring the exact surviving dial set',
      JSON.stringify(fp.handlerAssertions[0].mustRemainExactly), JSON.stringify(['stylique-dashboard:80']))
    t('…requiring the handler to stay non-empty', fp.handlerAssertions[0].mustNotBeEmpty, true)
    t('…and requiring the target dial to be gone',
      JSON.stringify(fp.handlerAssertions[0].mustNotContain), JSON.stringify(['stylique-os:4100']))
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
  // This assertion used to strip `/upstreams` from configPath before looking
  // for it, so it passed while every precondition named only the parent object.
  // A test written to pass rather than to prove. It now requires the FULL path.
  t('every step binds its EXACT config path in a precondition',
    go.patch.steps.every((x) => x.preconditions.some((p) => p.includes(x.configPath))), true)

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
  t('a non-file-booted config yields no patch at all',
    decide(probe({ caddyDiskConfigIsBootSource: false })).patch, null)

  console.log('-- FILE DIVERGENCE: naming the cause, not just refusing')
  const H = (inode, sha) => `2049:${inode}:812:1750000000:${sha}`
  t('CONTROL: three agreeing views are consistent', divergenceCause(probe()).cause, 'consistent')
  // THE LIVE CASE from run 30302057188: host and container hash differently.
  t('a stale FILE bind (inode moved, contents differ) is named',
    divergenceCause(probe({
      fileIdHostSource: H('9999', 'c'.repeat(64)),
      fileIdProcRoot: H('9001', 'b'.repeat(64)),
      fileIdContainer: H('9001', 'b'.repeat(64)),
    })).cause, 'stale-file-bind')
  t('…and says a reload cannot fix it',
    divergenceCause(probe({
      fileIdHostSource: H('9999', 'c'.repeat(64)), fileIdProcRoot: H('9001', 'b'.repeat(64)),
      fileIdContainer: H('9001', 'b'.repeat(64)),
    })).detail.includes('reload cannot rebind'), true)
  t('mount LAYERING is distinguished from a stale bind',
    divergenceCause(probe({
      fileIdHostSource: H('9999', 'c'.repeat(64)), fileIdProcRoot: H('9001', 'b'.repeat(64)),
      fileIdContainer: H('9001', 'b'.repeat(64)),
      mountinfoRelevant: '/etc/caddy /srv/caddy ext4;/etc/caddy/Caddyfile /other/src overlay;',
    })).cause, 'mount-layering')
  t('a CONTAINER-side write is distinguished from both',
    divergenceCause(probe({
      fileIdHostSource: H('9001', 'b'.repeat(64)), fileIdProcRoot: H('9001', 'b'.repeat(64)),
      fileIdContainer: H('9001', 'd'.repeat(64)),
    })).cause, 'container-write')
  t('an unstat-able view is undetermined, never guessed',
    divergenceCause(probe({ fileIdHostSource: 'absent' })).cause, 'undetermined')
  t('a malformed identity string is undetermined',
    divergenceCause(probe({ fileIdProcRoot: 'garbage' })).cause, 'undetermined')
  t('ANY non-consistent cause blocks the patch',
    decide(probe({ fileIdHostSource: H('9999', 'c'.repeat(64)) })).patchable, false)

  console.log('-- ZERO PARSED ROUTES IS NOT "NO ROUTES"')
  t('a parsed config with zero routes BLOCKS',
    decide(probe({ routes: [] })).patchable, false)
  t('…and says so as an unrecognised shape',
    decide(probe({ routes: [] })).blockers.some((b) => b.includes('unrecognised shape')), true)
  t('the config shape is reported for diagnosis',
    decide(probe({ routes: [] })).configShape.serverNames[0], 'srv0')
  t('caddy argv is surfaced so --config/--adapter are visible',
    /--adapter caddyfile/.test(decide(probe()).caddyArgv), true)
  t('env is KEY NAMES only — no values',
    /=/.test(decide(probe()).caddyEnvKeys ?? ''), false)

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
