#!/usr/bin/env node
// Classify every resource on the host for the Stylique retirement — and refuse
// to retire anything whose independence from TwinAI and Postiz is not proven.
//
// THE FAILURE MODE THIS EXISTS TO PREVENT
// ---------------------------------------
// "No protected service references this" and "nothing was looked at" produce
// the same empty list. A classifier that cannot tell them apart will happily
// authorise deleting a volume nobody scanned for. So every channel carries a
// read status, and a resource whose channels are not all read-complete is HELD,
// never retired.
//
// FOUR VERDICTS, AND ONLY ONE AUTHORISES ANYTHING
// -----------------------------------------------
//   preserve   TwinAI, Postiz, and anything they reach. Never a candidate.
//   retire     owned by the retirement scope AND no protected reference AND
//              every channel read-complete.
//   hold       unknown ownership, an unread channel, shared with something
//              preserved, or holding data whose disposition is undecided.
//   absent     not on the host.
//
// UNKNOWN IS HOLD. Naming is a hint, never a proof: `supabase_network_twinai`
// is orphaned and TwinAI-named, and it is held rather than reasoned about.
//
//   node scripts/ci/assert_stack_retirement.mjs stack.json
//   node scripts/ci/assert_stack_retirement.mjs --selftest
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export class StackRetirementError extends Error {}

export const SCHEMA = 'stack-dependency/1'
export const CHANNEL_STATUSES = ['read-complete', 'absent', 'unreadable', 'truncated']

/**
 * The containers that must survive, and the containers proposed for retirement.
 *
 * BOTH LISTS ARE EXPLICIT. Deriving "target" from a name prefix would sweep up
 * anything that happened to be called stylique-something, and deriving
 * "protected" from a prefix would miss a protected service that is not named
 * for its owner. Membership is a founder decision recorded here, not a pattern.
 */
export const PROTECTED = ['twinai-worker', 'postiz', 'postiz-postgres', 'postiz-redis']
export const RETIREMENT_SCOPE = ['stylique-os', 'stylique-dashboard', 'stylique-chrome', 'stylique-caddy']

export const parseRow = (s, n) => {
  const p = String(s).split('|')
  return p.length >= n ? p : null
}

export function parseContainers(rows) {
  if (!Array.isArray(rows)) return null
  const out = []
  for (const r of rows) {
    const p = parseRow(r, 8)
    if (!p) return null
    out.push({ name: p[0], state: p[1], image: p[2], imageId: p[3], restart: p[4], project: p[5], service: p[6], configFiles: p[7] })
  }
  return out
}

export function parseEdges(rows) {
  if (!Array.isArray(rows)) return null
  const out = []
  for (const r of rows) {
    const p = parseRow(r, 3)
    if (!p) return null
    out.push({ from: p[0], kind: p[1], to: p[2], detail: p[3] ?? null })
  }
  return out
}

/**
 * Everything a protected container reaches, transitively through containers.
 *
 * TRANSITIVE ON PURPOSE. If twinai-worker env-references a container, and that
 * container mounts a volume, the volume is reachable from something protected
 * and is not a free deletion. Stopping at direct edges would authorise deleting
 * one hop away from a service that must survive.
 */
export function protectedClosure(containers, edges, protectedNames) {
  const present = new Set(containers.map((c) => c.name))
  const seedCtrs = protectedNames.filter((n) => present.has(n))
  const reachedCtrs = new Set(seedCtrs)
  // Container-to-container edges only, to a fixed point.
  let grew = true
  while (grew) {
    grew = false
    for (const e of edges) {
      if (e.kind !== 'env-references') continue
      if (reachedCtrs.has(e.from) && present.has(e.to) && !reachedCtrs.has(e.to)) { reachedCtrs.add(e.to); grew = true }
    }
  }
  const resources = new Set()
  for (const e of edges) {
    if (!reachedCtrs.has(e.from)) continue
    if (['mounts-volume', 'joins-network', 'uses-image', 'binds-host-path'].includes(e.kind)) resources.add(`${e.kind}:${e.to}`)
  }
  return { containers: reachedCtrs, resources, missingProtected: protectedNames.filter((n) => !present.has(n)) }
}

/** Which read channels are incomplete, and therefore make every verdict a HOLD. */
export function channelProblems(stack) {
  const out = []
  for (const [k, v] of [['envEdgeStatus', stack.envEdgeStatus], ['hostFileStatus', stack.hostFileStatus]]) {
    if (!CHANNEL_STATUSES.includes(v)) out.push(`${k} is ${JSON.stringify(v)}`)
    else if (v !== 'read-complete') out.push(`${k} is ${v}`)
  }
  return out
}

export function classify(stack) {
  if (stack === null || typeof stack !== 'object') throw new StackRetirementError('stack evidence is not a JSON object')
  const blockers = []
  if (stack.schema !== SCHEMA) blockers.push(`stack evidence has schema ${JSON.stringify(stack.schema)}, expected ${SCHEMA}`)

  const containers = parseContainers(stack.containers)
  const edges = parseEdges(stack.edges)
  if (containers === null) blockers.push('the container rows could not be parsed')
  if (edges === null) blockers.push('the edge rows could not be parsed')
  if (containers === null || edges === null) {
    return { verdicts: [], blockers, retireable: [], held: [], preserved: [], channelProblems: channelProblems(stack) }
  }

  const chan = channelProblems(stack)
  for (const c of chan) blockers.push(`dependency evidence is incomplete: ${c}; nothing may be retired on an unread channel`)

  const closure = protectedClosure(containers, edges, PROTECTED)
  for (const m of closure.missingProtected) {
    blockers.push(`protected container ${m} is not present on the host; the evidence does not describe the system that was protected`)
  }

  const hostRefs = new Map()
  for (const r of Array.isArray(stack.hostFileRefs) ? stack.hostFileRefs : []) {
    const p = parseRow(r, 3)
    if (p) hostRefs.set(p[0], { count: Number(p[1]), files: p[2] })
  }

  const verdicts = []
  const add = (kind, name, verdict, reason, extra = {}) => verdicts.push({ kind, name, verdict, reason, ...extra })

  // ---- containers ----------------------------------------------------------
  for (const c of containers) {
    if (closure.containers.has(c.name)) {
      add('container', c.name, 'preserve',
        PROTECTED.includes(c.name) ? 'explicitly protected' : 'reachable from a protected container', { state: c.state })
      continue
    }
    if (!RETIREMENT_SCOPE.includes(c.name)) {
      add('container', c.name, 'hold', 'not in the retirement scope and not proven protected; unknown means hold', { state: c.state })
      continue
    }
    // In scope and not reachable from anything protected. A host-file reference
    // outside its own compose project is still a caller.
    const hr = hostRefs.get(c.name)
    const foreign = hr ? hr.files.split(',').filter(Boolean).filter((f) => c.configFiles === 'none' || !f.includes(c.configFiles.replace(/\/[^/]+$/, ''))) : []
    if (chan.length > 0) {
      add('container', c.name, 'hold', 'in scope, but dependency channels were not read to completion', { state: c.state })
    } else if (foreign.length > 0) {
      add('container', c.name, 'hold', `in scope, but referenced by host file(s) outside its own project: ${foreign.slice(0, 3).join(', ')}`, { state: c.state })
    } else {
      add('container', c.name, 'retire', 'in the retirement scope, not reachable from any protected container, all channels read', { state: c.state })
    }
  }

  // ---- volumes -------------------------------------------------------------
  for (const r of Array.isArray(stack.volumes) ? stack.volumes : []) {
    const p = parseRow(r, 4)
    if (!p) { blockers.push('a volume row could not be parsed'); continue }
    const [name, usersRaw, kb, db] = p
    const users = usersRaw === 'none' ? [] : usersRaw.split(',').filter(Boolean)
    const protectedUsers = users.filter((u) => closure.containers.has(u))
    const holdsData = db !== 'none' && db.length > 0
    if (protectedUsers.length > 0) {
      add('volume', name, 'preserve', `mounted by protected container(s): ${protectedUsers.join(', ')}`, { kb: Number(kb) })
    } else if (closure.resources.has(`mounts-volume:${name}`)) {
      add('volume', name, 'preserve', 'reachable from a protected container', { kb: Number(kb) })
    } else if (holdsData) {
      // A DATABASE IS NOT A CACHE. Even unreferenced, deleting one is a data
      // decision and is not this tool's to make.
      add('volume', name, 'hold', `holds database files (${db.replace(/,+$/, '')}); disposition is a data decision, not a dependency one`, { kb: Number(kb) })
    } else if (users.length === 0) {
      add('volume', name, 'hold', 'no container mounts it, but ownership is unproven; an orphan is not automatically disposable', { kb: Number(kb) })
    } else {
      const inScope = users.every((u) => RETIREMENT_SCOPE.includes(u))
      add('volume', name, inScope ? 'retire' : 'hold',
        inScope ? `mounted only by in-scope container(s): ${users.join(', ')}`
          : `mounted by container(s) of unproven ownership: ${users.join(', ')}`, { kb: Number(kb) })
    }
  }

  // ---- networks ------------------------------------------------------------
  const BUILTIN = ['bridge', 'host', 'none']
  for (const r of Array.isArray(stack.networks) ? stack.networks : []) {
    const p = parseRow(r, 3)
    if (!p) { blockers.push('a network row could not be parsed'); continue }
    const [name, driver, membersRaw] = p
    if (BUILTIN.includes(name)) { add('network', name, 'preserve', 'Docker built-in network', { driver }); continue }
    const members = membersRaw === 'none' ? [] : membersRaw.split(',').filter(Boolean)
    const protectedMembers = members.filter((m) => closure.containers.has(m))
    if (protectedMembers.length > 0) add('network', name, 'preserve', `carries protected container(s): ${protectedMembers.join(', ')}`, { driver })
    else if (members.length === 0) add('network', name, 'hold', 'no containers attached, but ownership is unproven', { driver })
    else {
      const inScope = members.every((m) => RETIREMENT_SCOPE.includes(m))
      add('network', name, inScope ? 'retire' : 'hold',
        inScope ? `only in-scope containers attached: ${members.join(', ')}`
          : `attached container(s) of unproven ownership: ${members.join(', ')}`, { driver })
    }
  }

  // ---- images --------------------------------------------------------------
  for (const r of Array.isArray(stack.images) ? stack.images : []) {
    const p = parseRow(r, 4)
    if (!p) { blockers.push('an image row could not be parsed'); continue }
    const [id, tagsRaw, usersRaw, size] = p
    const tags = tagsRaw === 'none' ? [] : tagsRaw.split(',').filter(Boolean)
    const users = usersRaw === 'none' ? [] : usersRaw.split(',').filter(Boolean)
    const protectedUsers = users.filter((u) => closure.containers.has(u))
    // TwinAI ROLLBACK IMAGES ARE NOT SPARE BYTES. An image nothing currently
    // runs may be the only way back, so a TwinAI-named image is held even when
    // unreferenced.
    const twinaiNamed = tags.some((t) => /twinai/i.test(t))
    if (protectedUsers.length > 0) add('image', tags[0] ?? id.slice(0, 19), 'preserve', `in use by protected container(s): ${protectedUsers.join(', ')}`, { bytes: Number(size) })
    else if (twinaiNamed) add('image', tags[0] ?? id.slice(0, 19), 'preserve', 'TwinAI-named image retained for rollback', { bytes: Number(size) })
    else if (users.length === 0 && tags.some((t) => /^stylique-os|^deploy-stylique-os/.test(t))) {
      add('image', tags[0], 'retire', 'Stylique OS image with no container using it', { bytes: Number(size) })
    } else if (users.length > 0 && users.every((u) => RETIREMENT_SCOPE.includes(u))) {
      add('image', tags[0] ?? id.slice(0, 19), 'retire', `used only by in-scope container(s): ${users.join(', ')}`, { bytes: Number(size) })
    } else {
      add('image', tags[0] ?? id.slice(0, 19), 'hold', users.length === 0 ? 'unreferenced, but ownership is unproven' : `used by container(s) of unproven ownership: ${users.join(', ')}`, { bytes: Number(size) })
    }
  }

  const retireable = verdicts.filter((v) => v.verdict === 'retire')
  const held = verdicts.filter((v) => v.verdict === 'hold')
  const preserved = verdicts.filter((v) => v.verdict === 'preserve')

  // NOTHING IS RETIREABLE WHILE A CHANNEL IS UNREAD. Belt and braces: the
  // per-resource logic already holds, and this makes the whole report refuse.
  if (chan.length > 0 && retireable.length > 0) {
    blockers.push(`${retireable.length} resource(s) classified retire while ${chan.length} channel(s) are incomplete — refusing`)
  }

  return { verdicts, retireable, held, preserved, blockers, channelProblems: chan, protectedClosure: [...closure.containers].sort() }
}

export function render(d) {
  const L = []
  L.push('== stack retirement classification ==')
  L.push(`  protected closure : ${d.protectedClosure.join(', ')}`)
  L.push(`  retire ${d.retireable.length} · hold ${d.held.length} · preserve ${d.preserved.length}`)
  for (const group of ['retire', 'hold', 'preserve']) {
    L.push(`  -- ${group} --`)
    for (const v of d.verdicts.filter((x) => x.verdict === group)) {
      L.push(`      [${v.kind}] ${v.name}`)
      L.push(`          ${v.reason}`)
    }
  }
  for (const c of d.channelProblems) L.push(`  CHANNEL INCOMPLETE: ${c}`)
  for (const b of d.blockers) L.push(`  blocker: ${b}`)
  return L.join('\n')
}

// ---------------------------------------------------------------- selftest
export function stackFixture(over = {}) {
  return {
    schema: SCHEMA,
    protectedContainers: PROTECTED,
    containers: [
      'twinai-worker|running|twinai-worker:latest|sha256:aa|unless-stopped|none|none|none',
      'postiz|running|ghcr.io/gitroomhq/postiz-app:latest|sha256:bb|always|postiz|postiz|/root/postiz/docker-compose.yml',
      'postiz-postgres|running|postgres:17-alpine|sha256:cc|always|postiz|postgres|/root/postiz/docker-compose.yml',
      'postiz-redis|running|redis:7.2|sha256:dd|always|postiz|redis|/root/postiz/docker-compose.yml',
      'stylique-os|exited|stylique-os:latest|sha256:ee|always|deploy|os|/root/24_Backend/deploy/docker-compose.yml',
      'stylique-dashboard|running|nginx:alpine|sha256:ff|always|deploy|dashboard|/root/24_Backend/deploy/docker-compose.yml',
      'stylique-chrome|running|ghcr.io/browserless/chromium:latest|sha256:11|always|deploy|chrome|/root/24_Backend/deploy/docker-compose.yml',
      'stylique-caddy|running|caddy:2-alpine|sha256:22|always|deploy|caddy|/root/24_Backend/deploy/docker-compose.yml',
      'infallible_hawking|exited|ghcr.io/eracle/openoutreach:latest|sha256:33|no|none|none|none',
    ],
    edges: [
      'twinai-worker|joins-network|bridge',
      'twinai-worker|uses-image|twinai-worker:latest',
      'postiz|joins-network|postiz_default',
      'postiz|mounts-volume|postiz_postiz-uploads',
      'postiz-postgres|joins-network|postiz_default',
      'postiz-postgres|mounts-volume|postiz_postiz-pg',
      'stylique-caddy|joins-network|styliquenet',
      'stylique-caddy|mounts-volume|caddy_data',
      'stylique-dashboard|joins-network|styliquenet',
      'stylique-chrome|joins-network|deploy_default',
      'stylique-chrome|mounts-volume|deploy_chrome-profile',
      'stylique-os|mounts-volume|oo-data',
      'infallible_hawking|mounts-volume|oo-data',
    ],
    envEdgeStatus: 'read-complete',
    hostFileRefs: ['stylique-chrome|1|/root/24_Backend/deploy/docker-compose.yml,'],
    hostFileStatus: 'read-complete',
    volumes: [
      'caddy_data|stylique-caddy|1|none',
      'deploy_chrome-profile|stylique-chrome|50|none',
      'oo-data|stylique-os,infallible_hawking|2|none',
      'postiz_postiz-pg|postiz-postgres|60000|PG_VERSION,',
      'postiz_postiz-uploads|postiz|10|none',
      'stylique-crm-data|none|0|none',
      'supabase_edge_runtime_twinai|none|10|none',
    ],
    networks: [
      'bridge|bridge|twinai-worker',
      'host|host|none',
      'none|null|none',
      'deploy_default|bridge|stylique-chrome',
      'postiz_default|bridge|postiz,postiz-postgres,postiz-redis',
      'styliquenet|bridge|stylique-caddy,stylique-dashboard',
      'supabase_network_twinai|bridge|none',
    ],
    images: [
      'sha256:aa|twinai-worker:latest,|twinai-worker|1170000000',
      'sha256:a1|twinai-worker:prev,|none|1170000000',
      'sha256:ee|stylique-os:latest,|stylique-os|290000000',
      'sha256:e2|stylique-os:v2026.06.09-intel2,|none|310000000',
      'sha256:ff|nginx:alpine,|stylique-dashboard|30000000',
      'sha256:bb|ghcr.io/gitroomhq/postiz-app:latest,|postiz|1070000000',
      'sha256:99|scrapling-probe:latest,|none|920000000',
    ],
    publishedPorts: ['stylique-chrome|6080/tcp=0.0.0.0:6080 ;9222/tcp=0.0.0.0:9222 ;'],
    ...over,
  }
}

async function selftest() {
  let failed = 0
  const t = (name, got, exp) => {
    if (JSON.stringify(got) === JSON.stringify(exp)) console.log(`  ok: ${name}`)
    else { console.error(`SELFTEST FAIL: ${name} => ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); failed++ }
  }
  const v = (d, kind, name) => d.verdicts.find((x) => x.kind === kind && x.name === name)?.verdict ?? '(absent)'

  const d = classify(stackFixture())

  console.log('-- protected survives')
  for (const p of PROTECTED) t(`${p} is preserved`, v(d, 'container', p), 'preserve')
  t('the protected closure is exactly the protected set here', d.protectedClosure, [...PROTECTED].sort())
  t('postiz data volume is preserved', v(d, 'volume', 'postiz_postiz-pg'), 'preserve')
  t('postiz network is preserved', v(d, 'network', 'postiz_default'), 'preserve')
  t('bridge is preserved as a built-in', v(d, 'network', 'bridge'), 'preserve')
  t('the TwinAI image in use is preserved', v(d, 'image', 'twinai-worker:latest'), 'preserve')
  // ROLLBACK IS NOT SPARE BYTES.
  t('an UNUSED TwinAI image is preserved for rollback', v(d, 'image', 'twinai-worker:prev'), 'preserve')

  console.log('-- in-scope Stylique retires')
  for (const c of ['stylique-os', 'stylique-dashboard', 'stylique-caddy']) t(`${c} retires`, v(d, 'container', c), 'retire')
  t('caddy_data retires with caddy', v(d, 'volume', 'caddy_data'), 'retire')
  t('styliquenet retires with its members', v(d, 'network', 'styliquenet'), 'retire')
  t('an unused stylique-os image retires', v(d, 'image', 'stylique-os:v2026.06.09-intel2'), 'retire')
  t('nginx used only by the dashboard retires', v(d, 'image', 'nginx:alpine'), 'retire')

  console.log('-- the HOLD set, which is where the safety lives')
  // oo-data is mounted by an in-scope container AND by one of unproven ownership.
  t('oo-data is HELD, because a container of unproven ownership mounts it', v(d, 'volume', 'oo-data'), 'hold')
  t('infallible_hawking is HELD — not in scope, not proven protected', v(d, 'container', 'infallible_hawking'), 'hold')
  // NAMING IS A HINT, NOT A PROOF.
  t('an orphaned TwinAI-named volume is HELD, not retired', v(d, 'volume', 'supabase_edge_runtime_twinai'), 'hold')
  t('an orphaned TwinAI-named network is HELD', v(d, 'network', 'supabase_network_twinai'), 'hold')
  t('an orphaned Stylique-named volume is still HELD without ownership proof',
    v(d, 'volume', 'stylique-crm-data'), 'hold')
  t('an unknown image is HELD', v(d, 'image', 'scrapling-probe:latest'), 'hold')
  t('…and chrome is in scope, so it retires', v(d, 'container', 'stylique-chrome'), 'retire')
  t('nothing protected is ever in the retire set',
    d.retireable.some((x) => PROTECTED.includes(x.name)), false)
  t('no postiz resource is in the retire set',
    d.retireable.some((x) => /postiz/i.test(x.name)), false)

  console.log('-- transitive protection')
  {
    // twinai-worker env-references stylique-chrome -> chrome and everything it
    // touches becomes protected. One hop is not enough; the volume must follow.
    const linked = classify(stackFixture({
      edges: [...stackFixture().edges, 'twinai-worker|env-references|stylique-chrome|BROWSER_URL,'],
    }))
    t('a referenced in-scope container becomes PRESERVED', v(linked, 'container', 'stylique-chrome'), 'preserve')
    t('…and its profile volume follows', v(linked, 'volume', 'deploy_chrome-profile'), 'preserve')
    t('…and its network follows', v(linked, 'network', 'deploy_default'), 'preserve')
    t('…while unrelated Stylique still retires', v(linked, 'container', 'stylique-os'), 'retire')
    // TWO HOPS. protected -> A -> B must protect B.
    const twoHop = classify(stackFixture({
      edges: [...stackFixture().edges,
        'twinai-worker|env-references|stylique-chrome|BROWSER_URL,',
        'stylique-chrome|env-references|stylique-caddy|PROXY_URL,'],
    }))
    t('protection is TRANSITIVE across two hops', v(twoHop, 'container', 'stylique-caddy'), 'preserve')
    t('…and reaches its volume', v(twoHop, 'volume', 'caddy_data'), 'preserve')
  }

  console.log('-- unread channels hold everything')
  for (const [f, label] of [['envEdgeStatus', 'env'], ['hostFileStatus', 'host-file']]) {
    for (const st of ['absent', 'unreadable', 'truncated']) {
      const bad = classify(stackFixture({ [f]: st }))
      t(`${label} channel ${st}: no container is retireable`,
        bad.verdicts.filter((x) => x.kind === 'container' && x.verdict === 'retire').length, 0)
      t(`…and it blocks`, bad.blockers.some((b) => /unread channel/.test(b)), true)
    }
    t(`${label} channel with an unknown status blocks`,
      classify(stackFixture({ [f]: 'made-up' })).blockers.some((b) => /unread channel/.test(b)), true)
  }

  console.log('-- foreign callers hold')
  {
    const cron = classify(stackFixture({
      hostFileRefs: ['stylique-chrome|2|/root/24_Backend/deploy/docker-compose.yml,/etc/cron.d/nightly,'],
    }))
    t('a foreign host-file reference HOLDS the container', v(cron, 'container', 'stylique-chrome'), 'hold')
    t('…and names the file', /nightly/.test(cron.verdicts.find((x) => x.name === 'stylique-chrome').reason), true)
  }

  console.log('-- data is a separate decision')
  {
    const dbvol = classify(stackFixture({
      volumes: [...stackFixture().volumes.filter((r) => !r.startsWith('stylique-crm-data')), 'stylique-crm-data|none|500|PG_VERSION,'],
    }))
    t('an orphaned volume holding a database is HELD as a data decision',
      v(dbvol, 'volume', 'stylique-crm-data'), 'hold')
    t('…and says so', /data decision/.test(dbvol.verdicts.find((x) => x.name === 'stylique-crm-data').reason), true)
  }

  console.log('-- evidence integrity')
  t('a wrong schema blocks', classify(stackFixture({ schema: 'x' })).blockers.some((b) => /expected stack-dependency/.test(b)), true)
  t('unparsable container rows block', classify(stackFixture({ containers: ['too|few'] })).blockers.some((b) => /container rows/.test(b)), true)
  t('unparsable edge rows block', classify(stackFixture({ edges: ['bad'] })).blockers.some((b) => /edge rows/.test(b)), true)
  {
    const missing = classify(stackFixture({ containers: stackFixture().containers.filter((r) => !r.startsWith('postiz|')) }))
    t('a missing protected container blocks',
      missing.blockers.some((b) => /is not present on the host/.test(b)), true)
  }

  console.log('-- report')
  {
    const txt = render(d)
    t('the report groups by verdict', /-- retire --/.test(txt) && /-- hold --/.test(txt) && /-- preserve --/.test(txt), true)
    t('…and gives a reason for every entry', (txt.match(/^ {10}\S/gm) ?? []).length >= d.verdicts.length, true)
  }

  if (failed) { console.error(`stack-retirement selftest: ${failed} failed`); process.exit(1) }
  console.log('stack-retirement selftest: all cases passed')
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntry) {
  if (process.argv.includes('--selftest')) await selftest()
  else {
    const f = process.argv[2]
    if (!f) { console.error('usage: assert_stack_retirement.mjs <stack.json>'); process.exit(2) }
    const d = classify(JSON.parse(readFileSync(f, 'utf8')))
    console.log(render(d))
    if (d.blockers.length > 0) { for (const b of d.blockers) console.error(`::error::${b}`); process.exit(1) }
  }
}
