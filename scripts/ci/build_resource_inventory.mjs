// Turn the raw record stream from scripts/vps/collect_resource_inventory.sh into
//   (a) a machine-readable JSON inventory, and
//   (b) a founder-readable table that answers "why is the disk 84% used".
//
// This also performs the Lane-A2 CLASSIFICATION. Every resource lands in exactly
// one of six classes and carries the EVIDENCE that put it there:
//
//   active-twinai         running TwinAI, must survive
//   twinai-rollback       kept so a bad deploy can be reverted
//   retire-scope          in the founder-approved retirement set, or reachable
//                         only from containers that are
//   shared-do-not-touch   proven to be referenced by something outside that set
//   proven-orphaned       provably referenced by nothing
//   unknown-do-not-touch  DEFAULT. Anything not proven above.
//
// The default is deliberately the do-nothing class: a classifier that guesses
// would be worse than no classifier, because its output authorises deletion.
// Postiz is protected by that default and by nothing else, which is the
// strongest available guarantee: no rule has to fire correctly for it to
// survive, because no rule names it at all.
//
//   node scripts/ci/build_resource_inventory.mjs raw.txt out.json
//   node scripts/ci/build_resource_inventory.mjs --selftest
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const CLASSES = [
  'active-twinai', 'twinai-rollback', 'retire-scope',
  'shared-do-not-touch', 'proven-orphaned', 'unknown-do-not-touch',
]

const TWINAI_CTR = 'twinai-worker'

/**
 * The founder-approved retirement set, IN REMOVAL ORDER.
 *
 * This is a DECISION, transcribed. It is deliberately an explicit list and not
 * a name pattern: `/^stylique-/` would silently adopt any container created
 * later with that prefix, and a set that grows without a decision is exactly
 * the failure this whole classifier exists to prevent.
 *
 * The ORDER is load-bearing. Caddy is the edge that still routes to
 * stylique-os, so it goes first; every later member is unblocked by an earlier
 * one having gone. Consumers iterate this array rather than sorting it.
 */
export const RETIRE_CTRS = Object.freeze([
  'stylique-caddy',       // the edge — removing it is what frees everything behind
  'stylique-dashboard',   // only served through that edge
  'stylique-chrome',      // browserless; the 6080/9222 exposure
  'stylique-os',          // the product itself
  'infallible_hawking',   // OpenOutreach, founder-confirmed unused
])
const RETIRE = new Set(RETIRE_CTRS)

/**
 * Image tags belonging to the retiring stack that NO container references, so
 * the derived "referenced only by retiring containers" rule cannot reach them.
 * Prefixes, matched against the repository half of a `repo:tag` — never a
 * substring test, which would let `notstylique-os:x` in.
 */
export const RETIRE_TAG_PREFIXES = Object.freeze(['stylique-os:', 'deploy-stylique-os:'])

/**
 * The retirement set and the thing being preserved must be disjoint BY
 * CONSTRUCTION, not by review. If an edit ever put the worker in the retire
 * list, every downstream "all users are retiring" proof would still be
 * internally consistent and would authorise deleting TwinAI's own resources —
 * a false safe that reads as correct at every step.
 *
 * Exported so the selftest can actually kill it. The module-level CALL below
 * runs at import and so cannot itself be mutation-covered in-process; deleting
 * the call is a gap this suite does not close, and saying so is better than a
 * guard that looks tested and is not.
 */
export function assertRetireSetDisjoint(retire, preserved) {
  for (const p of preserved) {
    if (retire.has(p)) {
      throw new Error(`${p} is in the retirement set — refusing to load a classifier that could authorise deleting it`)
    }
  }
}
assertRetireSetDisjoint(RETIRE, [TWINAI_CTR])

/** True when every listed user is retiring, and there is at least one. */
const allRetiring = (users) => users.length > 0 && users.every((u) => RETIRE.has(u))

// "12.3GB" / "980.4MB" / "0B" -> bytes. Docker's own df formatting.
export function humanToBytes(s) {
  const m = String(s ?? '').trim().match(/^([0-9.]+)\s*([KMGTP]?)i?B?$/i)
  if (!m) return null
  const mult = { '': 1, K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15 }[m[2].toUpperCase()]
  return Math.round(Number(m[1]) * mult)
}

export function parseRecords(raw) {
  const out = {}
  for (const line of String(raw).split('\n')) {
    if (!line.trim()) continue
    const [sec, ...fields] = line.split('\t')
    ;(out[sec] ||= []).push(fields)
  }
  return out
}

// Split a container's packed '#'-joined metadata back out.
function ctrMeta(packed) {
  const [status, restarts, policy, imageRef, imageId, created, health, memLimit, exitCode] =
    String(packed ?? '').split('#')
  return {
    status, restarts: Number(restarts || 0), policy, imageRef, imageId,
    created, health, memLimit: Number(memLimit || 0), exitCode: Number(exitCode || 0),
  }
}

function parseMounts(s) {
  return String(s ?? '').split(';').filter(Boolean).map((m) => {
    const [type, name, source, destination, rw] = m.split('|')
    return { type, name, source, destination, rw: rw === 'true' }
  })
}

/**
 * CLASSIFY. `refs` is the cross-resource reference index built by buildInventory.
 * Returns { class, evidence }. Never throws; anything unproven -> unknown.
 */
export function classify(kind, r, refs) {
  const unk = (why) => ({ class: 'unknown-do-not-touch', evidence: why })

  if (kind === 'container') {
    if (r.name === TWINAI_CTR) return { class: 'active-twinai', evidence: 'the TwinAI worker itself' }
    // A container that TwinAI's own config/proxy points at is shared, whatever
    // its name suggests — AND WHATEVER THE RETIREMENT LIST SAYS. This test used
    // to sit below the retire check, which meant a listed container that TwinAI
    // actually depended on would still be classed deletable: the founder's
    // decision was allowed to overrule live evidence of a dependency. The
    // decision selects candidates; evidence still gets the veto.
    if (refs.twinaiReferenced.has(r.name)) return { class: 'shared-do-not-touch', evidence: 'referenced by a TwinAI-serving proxy config' }
    if (RETIRE.has(r.name)) return { class: 'retire-scope', evidence: 'in the founder-approved retirement set, and not referenced by TwinAI' }
    return unk(`not TwinAI, not in the retirement set, no proven TwinAI reference — name "${r.name}"`)
  }

  if (kind === 'image') {
    if (refs.imagesInUse.has(r.id)) {
      const by = [...refs.imageUsers.get(r.id) ?? []]
      if (by.includes(TWINAI_CTR)) return { class: 'active-twinai', evidence: `in use by ${TWINAI_CTR}` }
      // Every container holding this image is retiring, so nothing that
      // survives can want it. One user outside the set — even an unclassified
      // one — and this falls through to `unk`.
      if (allRetiring(by)) return { class: 'retire-scope', evidence: `in use only by retiring containers (${by.join(',')})` }
      return unk(`in use by ${by.join(',') || 'a container'} of unproven ownership`)
    }
    // Not running. A TwinAI-tagged image that is not the live one is exactly what
    // a rollback needs — keep it, and say so.
    if (r.tags.some((t) => /twinai/i.test(t))) return { class: 'twinai-rollback', evidence: 'untagged-in-use TwinAI image retained for rollback' }
    const retiringTag = r.tags.find((t) => RETIRE_TAG_PREFIXES.some((p) => t.startsWith(p)))
    if (retiringTag) return { class: 'retire-scope', evidence: `retiring-stack image tag ${retiringTag}, not in use` }
    if (r.tags.length === 0 || r.tags.every((t) => t === '<none>:<none>')) {
      return { class: 'proven-orphaned', evidence: 'dangling image: no repo tag and no container references it' }
    }
    return unk(`untagged-for-us image with tags ${r.tags.join(',')}`)
  }

  if (kind === 'volume') {
    const users = [...refs.volumeUsers.get(r.name) ?? []]
    // ALL-RETIRING IS CHECKED FIRST, and it is strictly stronger than "shared":
    // a volume every one of whose mounters is being removed has no surviving
    // mounter by definition. TWINAI_CTR is provably not in that set (asserted at
    // module load), so this can never swallow a TwinAI mount.
    //
    // `oo-data` is the case this exists for: mounted by stylique-os AND
    // infallible_hawking, so the old rule called it shared-do-not-touch. It is
    // shared between two containers that are both going.
    if (allRetiring(users)) return { class: 'retire-scope', evidence: `mounted only by retiring containers (${users.join(',')})` }
    // SHARED IS CHECKED NEXT, DELIBERATELY. If TwinAI mounts it and so does
    // something else, it is NOT "TwinAI's volume" — calling it active-twinai
    // would state single ownership that does not exist, and retirement of the
    // other user would then look safe when it is not.
    if (users.length > 1) return { class: 'shared-do-not-touch', evidence: `mounted by ${users.join(',')}` }
    if (users.length === 1 && users[0] === TWINAI_CTR) return { class: 'active-twinai', evidence: `mounted only by ${TWINAI_CTR}` }
    if (users.length === 0) {
      // "Unused" is NOT "safe to delete" when it holds a database.
      if (r.dbFiles) return unk(`unreferenced but holds persistent database files (${r.dbFiles}) — needs backup + owner decision`)
      return { class: 'proven-orphaned', evidence: 'no container mounts it and it holds no database files' }
    }
    return unk(`mounted by ${users.join(',')}`)
  }

  if (kind === 'network') {
    const members = r.containers
    // Built-ins first: `bridge` almost always has TwinAI attached, but it is not
    // TwinAI's network and must never be classed as a TwinAI-owned resource.
    if (['bridge', 'host', 'none'].includes(r.name)) return { class: 'shared-do-not-touch', evidence: 'Docker built-in network' }
    if (members.length === 0) return { class: 'proven-orphaned', evidence: 'no containers attached' }
    // Same reasoning as volumes, and checked before the arity split for the same
    // reason: `styliquenet` carries caddy AND dashboard, both retiring.
    if (allRetiring(members)) return { class: 'retire-scope', evidence: `only retiring containers attached (${members.join(',')})` }
    if (members.length > 1) {
      return members.includes(TWINAI_CTR)
        ? { class: 'shared-do-not-touch', evidence: `attached: ${members.join(',')} (includes ${TWINAI_CTR})` }
        : unk(`attached containers: ${members.join(',')}`)
    }
    if (members[0] === TWINAI_CTR) return { class: 'active-twinai', evidence: `only ${TWINAI_CTR} is attached` }
    return unk(`attached containers: ${members.join(',')}`)
  }

  return unk('unrecognised resource kind')
}

export function buildInventory(rec) {
  const containers = (rec.CONTAINER ?? []).map(([name, meta, project, labels, mounts, ports, nets, logKb]) => ({
    name, ...ctrMeta(meta), project: project || null,
    labels: labels || '', mounts: parseMounts(mounts),
    ports: ports || '', networks: (nets || '').trim().split(/\s+/).filter(Boolean),
    logSizeKb: Number(logKb || 0),
  }))
  const images = (rec.IMAGE ?? []).map(([id, packed]) => {
    const [tags, digests, size, created] = String(packed ?? '').split('#')
    return {
      id,
      tags: (tags || '').split(',').filter(Boolean),
      repoDigests: (digests || '').split(',').filter(Boolean),
      sizeBytes: Number(size || 0), created,
    }
  })
  const volumes = (rec.VOLUME ?? []).map(([name, driver, mountpoint, kb, labels, dbFiles]) => ({
    name, driver, mountpoint, sizeKb: Number(kb || 0), labels: labels || '', dbFiles: dbFiles || '',
  }))
  const networks = (rec.NETWORK ?? []).map(([id, packed]) => {
    const [name, driver, ctrs] = String(packed ?? '').split('#')
    return { id, name, driver, containers: (ctrs || '').split(',').filter(Boolean) }
  })

  // ---- cross-reference index. Everything the classifier is allowed to rely on.
  const imageUsers = new Map()
  const volumeUsers = new Map()
  for (const c of containers) {
    if (c.imageId) (imageUsers.get(c.imageId) ?? imageUsers.set(c.imageId, new Set()).get(c.imageId)).add(c.name)
    for (const m of c.mounts) {
      if (m.type === 'volume' && m.name) {
        (volumeUsers.get(m.name) ?? volumeUsers.set(m.name, new Set()).get(m.name)).add(c.name)
      }
    }
  }
  // A proxy whose config names BOTH twinai and another container makes that
  // container shared. Config that names only stylique-os does not.
  const twinaiReferenced = new Set()
  for (const [proxy, hits] of rec.PROXYREF ?? []) {
    if (/twinai/i.test(hits || '')) twinaiReferenced.add(proxy)
  }

  const refs = { imageUsers, volumeUsers, imagesInUse: new Set(imageUsers.keys()), twinaiReferenced }

  for (const c of containers) Object.assign(c, classify('container', c, refs))
  for (const i of images) Object.assign(i, classify('image', i, refs))
  for (const v of volumes) Object.assign(v, classify('volume', v, refs))
  for (const n of networks) Object.assign(n, classify('network', n, refs))

  const dockerDf = (rec.DOCKERDF ?? []).map(([l]) => {
    const [type, total, active, size, reclaimable] = String(l).split('#')
    return { type, total: Number(total || 0), active: Number(active || 0), size, sizeBytes: humanToBytes(size), reclaimable }
  })
  const fs = Object.fromEntries((rec.FS ?? []).map(([which, packed, extra]) => {
    const [totalKb, usedKb, availKb, pct] = String(packed ?? '').split('#')
    return [which, { totalKb: Number(totalKb || 0), usedKb: Number(usedKb || 0), availKb: Number(availKb || 0), usedPct: Number(String(pct ?? '').replace('%', '') || 0), path: extra || null }]
  }))
  const inodes = Object.fromEntries((rec.INODES ?? []).map(([which, packed]) => {
    const [total, used, free, pct] = String(packed ?? '').split('#')
    return [which, { total: Number(total || 0), used: Number(used || 0), free: Number(free || 0), usedPct: Number(String(pct ?? '').replace('%', '') || 0) }]
  }))
  const hostDirs = [...(rec.HOSTDIR ?? []), ...(rec.HOSTDIR2 ?? [])]
    .map(([path, kb]) => ({ path, sizeKb: Number(kb || 0) }))
    .sort((a, b) => b.sizeKb - a.sizeKb)
  const twinai = Object.fromEntries((rec.TWINAI ?? []).map(([k, v]) => [k, v]))
  const twinaiImages = (rec.TWINAIIMAGE ?? []).map(([l]) => {
    const [tag, id, created, size] = String(l).split('#')
    return { tag, id, created, size }
  })
  const proxyRefs = (rec.PROXYREF ?? []).map(([proxy, hits]) => ({ proxy, hits }))
  const listening = (rec.LISTEN ?? []).map(([l]) => l)

  return {
    // BUMPED WITH THE CLASS VOCABULARY, ON PURPOSE. The acceptance gate asserts
    // that everything classed do-not-touch BEFORE still exists AFTER. Under
    // schema 1 the four newly-retiring containers were classed
    // unknown-do-not-touch, so a schema-1 baseline would demand that the
    // retirement did not happen — and would fail in a way that reads like a
    // safety violation instead of a stale artifact. assert_vps_acceptance
    // refuses a mismatched pair rather than comparing across vocabularies.
    schema: 'vps-resource-inventory-2',
    containers, images, volumes, networks,
    dockerDf, fs, inodes, hostDirs, twinai, twinaiImages, proxyRefs, listening,
  }
}

// Deterministic hash over the inventory, so the artifact can be proven unmodified
// between the before and after runs. Keys sorted; non-ASCII preserved (a CPU model
// carrying a registered-trademark sign must hash the same in every runtime).
export function hashInventory(inv) {
  const canon = (v) => Array.isArray(v) ? v.map(canon)
    : (v && typeof v === 'object')
      ? Object.fromEntries(Object.keys(v).sort().filter((k) => k !== 'report_sha256').map((k) => [k, canon(v[k])]))
      : v
  return createHash('sha256').update(JSON.stringify(canon(inv))).digest('hex')
}

const gib = (kb) => (kb / 1024 / 1024).toFixed(2)

export function renderTable(inv) {
  const L = []
  const root = inv.fs.root ?? {}
  L.push('=========== WHY THE DISK IS FULL ===========')
  L.push(`root filesystem : ${gib(root.totalKb)} GiB total · ${gib(root.usedKb)} GiB used (${root.usedPct}%) · ${gib(root.availKb)} GiB free`)
  const ino = inv.inodes.root ?? {}
  L.push(`inodes          : ${ino.used}/${ino.total} used (${ino.usedPct}%)`)
  L.push('')
  L.push('Docker accounting (docker system df):')
  for (const d of inv.dockerDf) {
    L.push(`  ${String(d.type).padEnd(14)} ${String(d.total).padStart(4)} total, ${String(d.active).padStart(4)} active  size ${String(d.size).padStart(10)}  reclaimable ${d.reclaimable}`)
  }
  L.push('')
  L.push('Largest directories on the root filesystem:')
  for (const d of inv.hostDirs.slice(0, 15)) L.push(`  ${gib(d.sizeKb).padStart(8)} GiB  ${d.path}`)
  L.push('')
  const logs = inv.containers.filter((c) => c.logSizeKb > 0).sort((a, b) => b.logSizeKb - a.logSizeKb)
  L.push('Container JSON logs (invisible to `docker system df`):')
  for (const c of logs) L.push(`  ${gib(c.logSizeKb).padStart(8)} GiB  ${c.name}`)
  if (!logs.length) L.push('  (none measurable)')
  L.push('')
  L.push('=========== CLASSIFICATION ===========')
  for (const [kind, list] of [['container', inv.containers], ['image', inv.images], ['volume', inv.volumes], ['network', inv.networks]]) {
    L.push(`-- ${kind}s --`)
    for (const r of list) {
      const label = r.name ?? (r.tags?.join(',') || r.id?.slice(7, 19))
      const size = r.sizeKb != null ? `${gib(r.sizeKb)} GiB` : r.sizeBytes != null ? `${(r.sizeBytes / 1e9).toFixed(2)} GB` : ''
      L.push(`  [${r.class}] ${label}  ${size}`)
      L.push(`      why: ${r.evidence}`)
    }
  }
  L.push('')
  // A4.1 evidence: does anything actually ROUTE to stylique-os? A reverse proxy
  // is the only way traffic reaches it, so its config is the place to look.
  L.push('Reverse-proxy references (A4.1 live-route dependency):')
  if (!inv.proxyRefs.length) L.push('  (no reverse-proxy container found)')
  for (const p of inv.proxyRefs) L.push(`  ${p.proxy}: ${p.hits || 'none'}`)
  L.push('')
  L.push('TwinAI facts:')
  for (const [k, v] of Object.entries(inv.twinai)) L.push(`  ${k.padEnd(20)} ${v}`)
  L.push('  rollback image candidates:')
  for (const i of inv.twinaiImages) L.push(`    ${i.tag}  ${i.size}  ${i.created}`)
  L.push('')
  const byClass = {}
  for (const list of [inv.containers, inv.images, inv.volumes, inv.networks]) {
    for (const r of list) byClass[r.class] = (byClass[r.class] ?? 0) + 1
  }
  L.push(`totals: ${CLASSES.map((c) => `${c}=${byClass[c] ?? 0}`).join('  ')}`)
  return L.join('\n')
}

// ------------------------------------------------------------------ selftest
function selftest() {
  let failed = 0
  const t = (name, cond) => { if (cond) console.log(`  ok: ${name}`); else { console.error(`SELFTEST FAIL: ${name}`); failed++ } }

  t('humanToBytes GB', humanToBytes('12.3GB') === 12300000000)
  t('humanToBytes 0B', humanToBytes('0B') === 0)
  t('humanToBytes junk', humanToBytes('n/a') === null)

  const raw = [
    ['CONTAINER', 'twinai-worker', 'running#0#unless-stopped:0#twinai-worker#sha256:aaa#c#healthy#0#0', '', '', 'volume|twdata|/v/tw|/data|true;', '', 'bridge', '100'].join('\t'),
    ['CONTAINER', 'stylique-os', 'running#23060#unless-stopped:0#stylique-os:latest#sha256:bbb#c#unhealthy#0#0', '', '', 'volume|sodata|/v/so|/data|true;', '', 'sonet', '900000'].join('\t'),
    ['CONTAINER', 'postiz', 'running#0#always:0#postiz#sha256:ccc#c#none#0#0', '', '', 'volume|pgdata|/v/pg|/data|true;', '', 'bridge', '5'].join('\t'),
    // The multi-member retirement set, and the resources it shares internally.
    ['CONTAINER', 'stylique-caddy', 'running#0#always:0#caddy:2-alpine#sha256:cad#c#none#0#0', '', '', '', '', 'sqnet', '20'].join('\t'),
    ['CONTAINER', 'infallible_hawking', 'exited#0#no:0#oo:latest#sha256:ooo#c#none#1#0', '', '', 'volume|sodata|/v/so|/data|true;', '', 'sqnet', '3'].join('\t'),
    ['IMAGE', 'sha256:aaa', 'twinai-worker:latest,#repo@sha256:d1,#500#c'].join('\t'),
    ['IMAGE', 'sha256:bbb', 'stylique-os:latest,##300#c'].join('\t'),
    ['IMAGE', 'sha256:old', 'twinai-worker:prev,##480#c'].join('\t'),
    ['IMAGE', 'sha256:dang', '###120#c'].join('\t'),
    ['IMAGE', 'sha256:cad', 'caddy:2-alpine,##40#c'].join('\t'),
    ['IMAGE', 'sha256:ooo', 'oo:latest,##60#c'].join('\t'),
    ['IMAGE', 'sha256:ccc', 'postiz,##70#c'].join('\t'),
    ['IMAGE', 'sha256:dep', 'deploy-stylique-os:latest,##80#c'].join('\t'),
    ['VOLUME', 'twdata', 'local', '/v/tw', '10', '', ''].join('\t'),
    ['VOLUME', 'sodata', 'local', '/v/so', '20', '', ''].join('\t'),
    ['VOLUME', 'pgdata', 'local', '/v/pg', '50', '', '/v/pg/PG_VERSION,'].join('\t'),
    ['VOLUME', 'orphan', 'local', '/v/or', '30', '', ''].join('\t'),
    ['VOLUME', 'orphandb', 'local', '/v/od', '40', '', '/v/od/PG_VERSION,'].join('\t'),
    ['NETWORK', 'n1', 'sonet#bridge#stylique-os,'].join('\t'),
    ['NETWORK', 'n2', 'bridge#bridge#twinai-worker,postiz,'].join('\t'),
    ['NETWORK', 'n3', 'deadnet#bridge#'].join('\t'),
    ['NETWORK', 'n4', 'sqnet#bridge#stylique-caddy,infallible_hawking,'].join('\t'),
  ].join('\n')
  const inv = buildInventory(parseRecords(raw))
  // Networks carry BOTH id and name; look up by either so a test can address
  // them by the id the collector emitted.
  const cls = (list, n) => list.find((x) => x.name === n || x.id === n)?.class

  t('twinai-worker is active', cls(inv.containers, 'twinai-worker') === 'active-twinai')
  t('stylique-os is retire-scope', cls(inv.containers, 'stylique-os') === 'retire-scope')
  t('stylique-caddy is retire-scope', cls(inv.containers, 'stylique-caddy') === 'retire-scope')
  t('infallible_hawking is retire-scope', cls(inv.containers, 'infallible_hawking') === 'retire-scope')
  t('postiz defaults to unknown (NOT deletable)', cls(inv.containers, 'postiz') === 'unknown-do-not-touch')
  t('live twinai image is active', cls(inv.images, 'sha256:aaa') === 'active-twinai')
  t('stylique image is retire-scope', cls(inv.images, 'sha256:bbb') === 'retire-scope')
  t('an image used only by a retiring container is retire-scope',
    cls(inv.images, 'sha256:cad') === 'retire-scope')
  t('an unused deploy-stylique-os tag is retire-scope', cls(inv.images, 'sha256:dep') === 'retire-scope')
  t("postiz's image is NOT deletable", cls(inv.images, 'sha256:ccc') === 'unknown-do-not-touch')
  t('older twinai image is rollback', cls(inv.images, 'sha256:old') === 'twinai-rollback')
  t('dangling image is proven-orphaned', cls(inv.images, 'sha256:dang') === 'proven-orphaned')
  t('twinai volume is active', cls(inv.volumes, 'twdata') === 'active-twinai')
  t('a volume shared by TWO retiring containers is retire-scope (the oo-data case)',
    cls(inv.volumes, 'sodata') === 'retire-scope')
  t("postiz's database volume is NOT deletable", cls(inv.volumes, 'pgdata') === 'unknown-do-not-touch')
  t('unused empty volume is proven-orphaned', cls(inv.volumes, 'orphan') === 'proven-orphaned')
  t('unused volume WITH a database is NOT orphaned', cls(inv.volumes, 'orphandb') === 'unknown-do-not-touch')
  t('a network with one retiring member is retire-scope', cls(inv.networks, 'n1') === 'retire-scope')
  t('a network with TWO retiring members is retire-scope', cls(inv.networks, 'n4') === 'retire-scope')
  t('shared bridge is not deletable', ['shared-do-not-touch', 'active-twinai'].includes(cls(inv.networks, 'n2')))
  t('empty network is proven-orphaned', cls(inv.networks, 'n3') === 'proven-orphaned')
  t('the retirement set is disjoint from TwinAI', !RETIRE_CTRS.includes('twinai-worker'))
  t('the removal order puts the edge first', RETIRE_CTRS[0] === 'stylique-caddy')
  {
    let threw = false
    try { assertRetireSetDisjoint(new Set(['a', 'twinai-worker']), ['twinai-worker']) } catch { threw = true }
    t('the disjointness guard THROWS on an overlapping set', threw)
    let threwClean = false
    try { assertRetireSetDisjoint(new Set(['a']), ['twinai-worker']) } catch { threwClean = true }
    t('…and does not throw on a disjoint one', !threwClean)
  }

  // MUTATION CONTROLS — each proves a specific guard is load-bearing.
  // 1. If stylique-os also mounted the TwinAI volume, that volume must stop
  //    being classifiable as stylique-only.
  const shared = raw.replace('volume|sodata|/v/so|/data|true;', 'volume|sodata|/v/so|/data|true;volume|twdata|/v/tw|/x|true;')
  const invS = buildInventory(parseRecords(shared))
  t('MUTATION: volume mounted by both becomes shared-do-not-touch',
    invS.volumes.find((v) => v.name === 'twdata').class === 'shared-do-not-touch')
  // 2. If a proxy config names twinai AND a container, that container must
  //    become shared rather than unknown/deletable.
  const proxied = raw + '\nPROXYREF\tpostiz\t/etc/caddy/twinai.conf'
  const invP = buildInventory(parseRecords(proxied))
  t('MUTATION: proxy-referenced container becomes shared-do-not-touch',
    invP.containers.find((c) => c.name === 'postiz').class === 'shared-do-not-touch')
  // 3. If the ONLY twinai image is the live one, there is no rollback image and
  //    the acceptance gate must be able to see that.
  const noRollback = raw.split('\n').filter((l) => !l.includes('sha256:old')).join('\n')
  const invN = buildInventory(parseRecords(noRollback))
  t('MUTATION: with no spare image, zero are classed twinai-rollback',
    invN.images.filter((i) => i.class === 'twinai-rollback').length === 0)
  // 4. ONE SURVIVOR IS ENOUGH. `allRetiring` is the rule that turned three
  //    do-not-touch resources into deletable ones, so the thing that must be
  //    proven is not that it fires — it is that it STOPS firing the moment a
  //    single user outside the retirement set appears. Postiz is that user
  //    here, and it is not TwinAI on purpose: the rule must protect resources
  //    belonging to services it has never heard of.
  const invPA = buildInventory(parseRecords(
    raw.replace('volume|pgdata|/v/pg|/data|true;', 'volume|pgdata|/v/pg|/data|true;volume|sodata|/v/so|/x|true;')
       .replace('sqnet#bridge#stylique-caddy,infallible_hawking,', 'sqnet#bridge#stylique-caddy,infallible_hawking,postiz,')))
  t('MUTATION: one non-retiring mounter stops a volume being retire-scope',
    invPA.volumes.find((v) => v.name === 'sodata').class !== 'retire-scope')
  t('MUTATION: one non-retiring network member stops it being retire-scope',
    invPA.networks.find((n) => n.id === 'n4').class !== 'retire-scope')
  t('…and the same fixture still retires the untouched stylique-os network',
    invPA.networks.find((n) => n.id === 'n1').class === 'retire-scope')
  // 5. A container the founder listed, that TwinAI turns out to reference, must
  //    NOT be deletable. The decision selects candidates; live evidence vetoes.
  const styliqueProxied = raw + '\nPROXYREF\tstylique-caddy\t/etc/caddy/twinai.conf'
  const invSP = buildInventory(parseRecords(styliqueProxied))
  t('MUTATION: a listed container referenced by TwinAI becomes shared-do-not-touch',
    invSP.containers.find((c) => c.name === 'stylique-caddy').class === 'shared-do-not-touch')
  // 6. The tag rule must be a PREFIX on the repository, not a substring.
  const lookalike = raw.replace('deploy-stylique-os:latest,', 'notdeploy-stylique-os:latest,')
  const invLA = buildInventory(parseRecords(lookalike))
  t('MUTATION: a lookalike tag is NOT retire-scope',
    invLA.images.find((i) => i.id === 'sha256:dep').class === 'unknown-do-not-touch')
  // 7. Hash must actually depend on content.
  t('MUTATION: hash changes when inventory changes', hashInventory(inv) !== hashInventory(invS))
  t('hash is stable across repeated builds',
    hashInventory(buildInventory(parseRecords(raw))) === hashInventory(inv))

  if (failed) { console.error(`resource-inventory selftest: ${failed} failed`); process.exit(1) }
  console.log('resource-inventory selftest: all cases passed')
  process.exit(0)
}

// Only act when this file IS the program. Without this, importing buildInventory
// to construct a REAL-SHAPE fixture runs the CLI and exits 2 on the importer's
// argv — so the test that exists to prove the shape would kill the process that
// runs it. The same import-with-side-effects defect silently disabled
// check_vps_retire_safety.mjs's own selftests once already.
const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (!isEntry) { /* imported for its exports */ }
else if (process.argv.includes('--selftest')) selftest()
else {
  const [, , inFile, outFile] = process.argv
  if (!inFile) { console.error('usage: build_resource_inventory.mjs <raw> [out.json]'); process.exit(2) }
  const inv = buildInventory(parseRecords(readFileSync(inFile, 'utf8')))
  inv.report_sha256 = hashInventory(inv)
  if (outFile) writeFileSync(outFile, JSON.stringify(inv, null, 2))
  console.log(renderTable(inv))
  console.log(`\ninventory sha256: ${inv.report_sha256}`)
}
