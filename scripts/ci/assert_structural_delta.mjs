#!/usr/bin/env node
// Prove that a stage changed NOTHING it was not authorised to change — where
// "authorised" means one named field of one named record, not a record-wide pass.
//
// WHY A BYTE COMPARISON IS THE WRONG TEST
// ---------------------------------------
// The two inventory JSONs differ on every run for reasons nobody caused: free
// space, log bytes, restart counts and image sizes all drift. A comparator that
// flags those is one people learn to ignore, and a comparator people ignore
// launders a real change as more expected noise. So volatility is declared per
// field, in the diff, before any run is seen.
//
// WHY RECORD-WIDE AUTHORISATION IS ALSO WRONG
// -------------------------------------------
// The first version of this file took a set of `type/key` strings and skipped
// EVERY structural field of an authorised record. `disable-restart` is meant to
// permit exactly one field — the restart policy — but that design would have
// waved through a simultaneous change to imageId, mounts, ports, networks,
// memLimit, labels or status on the same container, and its positive control
// proved only that overbroad authorisation works. Least privilege has to be
// expressible or it is not enforced.
//
// Authorisations are therefore TYPED OPERATIONS:
//
//   { op: 'change',         type, key, fields: [...] }   only those fields
//   { op: 'remove',         type, key }                  that record may vanish
//   { op: 'add',            type, key }                  that record may appear
//   { op: 'remove-endpoint',type, key, endpoint }        one name leaves a list
//
// A field not explicitly named still compares. An authorisation that is never
// exercised is itself a finding: the stage did not do what it declared, and a
// plan that over-declares is a plan nobody is really reading.
//
//   node scripts/ci/assert_structural_delta.mjs <before.json> <after.json> \
//        --stage <stage> [--plan plan.json]
//   node scripts/ci/assert_structural_delta.mjs --selftest
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const TARGET = 'stylique-os'

/** Per record type: STRUCTURAL fields are compared; VOLATILE ones may move. */
export const FIELD_POLICY = {
  containers: {
    structural: [
      'name', 'status', 'policy', 'imageRef', 'imageId', 'project', 'labels',
      'mounts', 'ports', 'networks', 'health', 'memLimit', 'exitCode', 'created',
    ],
    volatile: ['restarts', 'logSizeKb'],
  },
  images: { structural: ['id', 'tags', 'repoDigests', 'class'], volatile: ['sizeBytes', 'created'] },
  volumes: {
    structural: ['name', 'driver', 'mountpoint', 'labels', 'dbFiles', 'class', 'evidence'],
    volatile: ['sizeKb'],
  },
  networks: { structural: ['id', 'name', 'driver', 'containers', 'class'], volatile: [] },
}
export const TYPES = Object.keys(FIELD_POLICY)
const KEY_OF = { containers: 'name', images: 'id', volumes: 'name', networks: 'name' }
/** Top-level inventory keys that are not record arrays but are expected. */
export const NON_RECORD_ROOT_KEYS = [
  'fs', 'inodes', 'dockerDf', 'hostDirs', 'ctrLogs', 'proxyRefs', 'twinai', 'report_sha256',
]

export class DeltaError extends Error {
  constructor(message) { super(message); this.name = 'DeltaError' }
}

const canon = (v) => {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}
export const sha256 = (s) => createHash('sha256').update(s).digest('hex')

/**
 * The inventory must be exactly the shape this comparator understands.
 *
 * Unknown ROOT keys were previously ignored entirely — only record fields were
 * checked — so a whole new top-level section could carry ownership meaning and
 * go unwatched. Duplicate record keys were collapsed by Map construction, so a
 * malformed inventory listing a container twice would silently compare only the
 * last one.
 */
export function validateInventory(inv, label) {
  const problems = []
  if (inv === null || typeof inv !== 'object' || Array.isArray(inv)) {
    throw new DeltaError(`${label} is not a JSON object`)
  }
  const known = new Set([...TYPES, ...NON_RECORD_ROOT_KEYS])
  for (const k of Object.keys(inv)) {
    if (!known.has(k)) problems.push(`${label}: unknown top-level key ${JSON.stringify(k)}`)
  }
  for (const t of TYPES) {
    const v = inv[t]
    if (!Array.isArray(v)) { problems.push(`${label}.${t} is missing or not an array`); continue }
    const seen = new Set()
    for (const r of v) {
      if (r === null || typeof r !== 'object' || Array.isArray(r)) {
        problems.push(`${label}.${t} contains a non-object record`); continue
      }
      const k = r[KEY_OF[t]]
      if (typeof k !== 'string' || k.length === 0) {
        problems.push(`${label}.${t} has a record with a missing or empty ${KEY_OF[t]}`); continue
      }
      if (seen.has(k)) problems.push(`${label}.${t} lists ${JSON.stringify(k)} more than once`)
      seen.add(k)
    }
  }
  return problems
}

/** Reject malformed, duplicated, wildcard or unknown authorisations. */
export function validateAuthorisations(auths) {
  const problems = []
  const seen = new Set()
  for (const a of auths) {
    const sig = canon(a)
    if (seen.has(sig)) problems.push(`duplicate authorisation ${sig}`)
    seen.add(sig)
    if (!['change', 'remove', 'add', 'remove-endpoint'].includes(a?.op)) {
      problems.push(`unknown authorisation op ${JSON.stringify(a?.op)}`); continue
    }
    if (!TYPES.includes(a?.type)) { problems.push(`unknown authorisation type ${JSON.stringify(a?.type)}`); continue }
    if (typeof a.key !== 'string' || a.key.length === 0 || a.key === '*') {
      problems.push(`authorisation key must be an exact non-wildcard name (got ${JSON.stringify(a.key)})`)
    }
    if (a.op === 'change') {
      if (!Array.isArray(a.fields) || a.fields.length === 0) {
        problems.push(`change authorisation for ${a.type}/${a.key} names no fields`)
      } else {
        for (const f of a.fields) {
          if (f === '*') problems.push(`wildcard field in ${a.type}/${a.key}`)
          else if (!FIELD_POLICY[a.type].structural.includes(f)) {
            problems.push(`${a.type}/${a.key}: ${JSON.stringify(f)} is not a structural field`)
          }
        }
      }
    }
    if (a.op === 'remove-endpoint' && (typeof a.endpoint !== 'string' || a.endpoint.length === 0)) {
      problems.push(`remove-endpoint for ${a.type}/${a.key} names no endpoint`)
    }
  }
  return problems
}

/**
 * Authorisations for a stage, derived from the BEFORE inventory and, for
 * reclaim, byte-exactly from the approved plan.
 *
 * Read-only stages authorise nothing at all. Nothing here is generic: reclaim
 * never gets a blanket container exemption, and remove-container's network
 * changes are pinned to the endpoints the target was actually attached to.
 */
export function authorisationsForStage(stage, before, plan = null) {
  switch (stage) {
    case 'manifest': case 'pre-stop-audit': case 'route-impact':
    case 'observe': case 'accept':
      return []
    case 'disable-restart':
      return [{ op: 'change', type: 'containers', key: TARGET, fields: ['policy'] }]
    case 'stop':
      // The lifecycle fields a stop legitimately moves — and only those. A stop
      // that also changed the image or the mounts is not a stop.
      return [{ op: 'change', type: 'containers', key: TARGET, fields: ['status', 'exitCode', 'health'] }]
    case 'remove-container': {
      const auths = [{ op: 'remove', type: 'containers', key: TARGET }]
      // The endpoint necessarily leaves every network it was attached to. Pin
      // that to the networks recorded BEFORE, one endpoint each, rather than
      // exempting the `containers` field wholesale.
      for (const n of before.networks ?? []) {
        if (Array.isArray(n.containers) && n.containers.includes(TARGET)) {
          auths.push({ op: 'remove-endpoint', type: 'networks', key: n.name, endpoint: TARGET })
        }
      }
      return auths
    }
    case 'reclaim': {
      if (plan === null) throw new DeltaError('reclaim requires the approved plan to derive its authorisations')
      const cmds = Array.isArray(plan.cmds) ? plan.cmds : []
      const auths = []
      for (const c of cmds) {
        let m
        if ((m = /^docker rmi (\S+)$/.exec(c))) auths.push({ op: 'remove', type: 'images', key: m[1] })
        else if ((m = /^docker network rm (\S+)$/.exec(c))) auths.push({ op: 'remove', type: 'networks', key: m[1] })
        else if ((m = /^docker volume rm (\S+)$/.exec(c))) auths.push({ op: 'remove', type: 'volumes', key: m[1] })
        // builder prune and journal vacuum touch no inventory record.
      }
      return auths
    }
    default:
      throw new DeltaError(`unknown stage ${JSON.stringify(stage)}`)
  }
}

/** Compare, enforcing each authorisation exactly and requiring each be used. */
export function structuralDelta(before, after, auths = []) {
  const findings = []
  const add = (kind, type, key, field, detail) => findings.push({ kind, type, key, field, detail })

  for (const p of validateInventory(before, 'before')) add('schema', null, null, null, p)
  for (const p of validateInventory(after, 'after')) add('schema', null, null, null, p)
  for (const p of validateAuthorisations(auths)) add('bad_authorisation', null, null, null, p)
  if (findings.length > 0) return { ok: false, findings, exercised: [] }

  const used = new Set()
  const find = (op, type, key) => auths.find((a) => a.op === op && a.type === type && a.key === key)

  for (const t of TYPES) {
    const policy = FIELD_POLICY[t]
    const known = new Set([...policy.structural, ...policy.volatile])
    const key = KEY_OF[t]
    const b = new Map(before[t].map((r) => [r[key], r]))
    const a = new Map(after[t].map((r) => [r[key], r]))

    for (const [side, m] of [['before', b], ['after', a]]) {
      for (const [k, rec] of m) {
        for (const f of Object.keys(rec)) {
          if (!known.has(f)) {
            add('unknown_field', t, k, f,
              `${side}.${t}[${k}] carries field "${f}", which has no declared volatility policy`)
          }
        }
      }
    }

    for (const [k, rec] of b) {
      if (!a.has(k)) {
        const auth = find('remove', t, k)
        if (auth === undefined) add('removed', t, k, null, `${t}/${k} vanished and no removal was authorised`)
        else used.add(canon(auth))
        continue
      }
      const after2 = a.get(k)
      const changeAuth = find('change', t, k)
      const epAuth = find('remove-endpoint', t, k)
      for (const f of policy.structural) {
        const bv = canon(rec[f]); const av = canon(after2[f])
        if (bv === av) continue

        // A remove-endpoint authorisation permits EXACTLY one name leaving the
        // list — not an arbitrary rewrite of it.
        if (epAuth !== undefined && f === 'containers' && Array.isArray(rec[f]) && Array.isArray(after2[f])) {
          const expect = rec[f].filter((x) => x !== epAuth.endpoint)
          if (canon(expect) === av) { used.add(canon(epAuth)); continue }
          add('changed', t, k, f,
            `${t}/${k}.${f}: authorised only to drop ${epAuth.endpoint}, but changed ${bv} -> ${av}`)
          continue
        }
        if (changeAuth !== undefined && changeAuth.fields.includes(f)) { used.add(canon(changeAuth)); continue }
        add('changed', t, k, f, `${t}/${k}.${f}: ${bv.slice(0, 120)} -> ${av.slice(0, 120)}`)
      }
    }
    for (const k of a.keys()) {
      if (b.has(k)) continue
      const auth = find('add', t, k)
      if (auth === undefined) add('added', t, k, null, `${t}/${k} appeared and no addition was authorised`)
      else used.add(canon(auth))
    }
  }

  // AN UNEXERCISED AUTHORISATION IS A FINDING. It means the stage did not do
  // what its plan declared, and an over-declared plan is one nobody is reading.
  for (const auth of auths) {
    if (!used.has(canon(auth))) {
      add('unused_authorisation', auth.type, auth.key, null,
        `authorised ${auth.op} on ${auth.type}/${auth.key}${auth.fields ? ` (${auth.fields.join(',')})` : ''} never happened`)
    }
  }

  return { ok: findings.length === 0, findings, exercised: [...used] }
}

export function render(d, ctx = {}) {
  const L = ['== structural delta (volatile values permitted; least-privilege authorisation) ==']
  for (const [k, v] of Object.entries(ctx)) L.push(`  ${k.padEnd(22)}: ${v}`)
  if (d.ok) L.push('  no unauthorised structural change; every authorisation was exercised')
  for (const f of d.findings) L.push(`  [${f.kind}] ${f.detail}`)
  L.push(`  UNAUTHORISED STRUCTURAL DELTA: ${d.ok ? 'none' : d.findings.length}`)
  return L.join('\n')
}

// ------------------------------------------------------------------ selftest
const inv = () => ({
  containers: [
    { name: 'twinai-worker', status: 'running', policy: 'unless-stopped', imageRef: 'twinai-worker:latest', imageId: 'sha256:0200', project: null, labels: '', mounts: [], ports: '', networks: ['bridge'], health: 'healthy', memLimit: 0, exitCode: 0, created: 'c1', restarts: 0, logSizeKb: 10 },
    { name: TARGET, status: 'restarting', policy: 'unless-stopped', imageRef: 'stylique-os:latest', imageId: 'sha256:bbbb', project: 'deploy', labels: '', mounts: [{ type: 'volume', name: 'oo-data', source: '/v/oo', destination: '/data', rw: false }], ports: '', networks: ['styliquenet', 'deploy_default'], health: 'unhealthy', memLimit: 0, exitCode: 0, created: 'c2', restarts: 23329, logSizeKb: 133000 },
  ],
  images: [
    { id: 'sha256:0200', tags: ['twinai-worker:latest'], repoDigests: [], class: 'active-twinai', sizeBytes: 1, created: 'x' },
    { id: 'sha256:sty1', tags: ['stylique-os:v1'], repoDigests: [], class: 'stylique-os', sizeBytes: 1, created: 'x' },
  ],
  volumes: [
    { name: 'oo-data', driver: 'local', mountpoint: '/v/oo', labels: '', dbFiles: '', class: 'shared-do-not-touch', evidence: 'mounted by stylique-os,infallible_hawking', sizeKb: 4 },
    { name: 'dead-vol', driver: 'local', mountpoint: '/v/d', labels: '', dbFiles: '', class: 'proven-orphaned', evidence: 'unmounted', sizeKb: 1 },
  ],
  networks: [
    { id: 'n1', name: 'styliquenet', driver: 'bridge', containers: ['stylique-caddy', TARGET], class: 'unknown-do-not-touch' },
    { id: 'n2', name: 'deploy_default', driver: 'bridge', containers: [TARGET, 'stylique-chrome'], class: 'unknown-do-not-touch' },
  ],
})
const clone = (o) => JSON.parse(JSON.stringify(o))
const ctr = (i, n) => i.containers.find((c) => c.name === n)

async function selftest() {
  let failed = 0
  const t = (name, got, exp) => {
    if (got === exp) console.log(`  ok: ${name}`)
    else { console.error(`SELFTEST FAIL: ${name} => ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); failed++ }
  }
  const run = (b, a, stage, plan = null) => structuralDelta(b, a, authorisationsForStage(stage, b, plan))

  console.log('-- read-only stages authorise NOTHING')
  for (const s of ['manifest', 'pre-stop-audit', 'route-impact', 'observe', 'accept']) {
    t(`${s} authorises nothing`, authorisationsForStage(s, inv()).length, 0)
  }
  t('a read-only stage passes on an unchanged host', run(inv(), inv(), 'route-impact').ok, true)
  const volatileOnly = clone(inv())
  ctr(volatileOnly, TARGET).restarts = 23400
  ctr(volatileOnly, 'twinai-worker').logSizeKb = 99999
  volatileOnly.images[0].sizeBytes = 987654321
  volatileOnly.volumes[0].sizeKb = 4096
  t('volatile drift alone passes', run(inv(), volatileOnly, 'route-impact').ok, true)
  t('OLD BEHAVIOUR: a raw JSON compare would have flagged that',
    JSON.stringify(inv()) === JSON.stringify(volatileOnly), false)
  t('any structural change under a read-only stage fails',
    run(inv(), (() => { const a = clone(inv()); ctr(a, TARGET).policy = 'no'; return a })(), 'route-impact').ok, false)

  console.log('-- disable-restart: ONLY the policy field')
  const dr = clone(inv()); ctr(dr, TARGET).policy = 'no'
  t('POSITIVE: the exact allowed delta passes', run(inv(), dr, 'disable-restart').ok, true)
  // THE HOLE THE AUDIT FOUND: record-wide authorisation waved these through.
  for (const [label, f, v] of [
    ['image identity', 'imageId', 'sha256:DEAD'], ['mounts', 'mounts', []],
    ['networks', 'networks', ['styliquenet']], ['ports', 'ports', '0.0.0.0:9999->9999/tcp'],
    ['memory limit', 'memLimit', 1073741824], ['labels', 'labels', 'x=1'],
    ['status', 'status', 'exited'],
  ]) {
    const bad = clone(dr); ctr(bad, TARGET)[f] = v
    t(`disable-restart cannot hide a ${label} change`, run(inv(), bad, 'disable-restart').ok, false)
  }

  console.log('-- stop: ONLY the lifecycle fields')
  const st = clone(inv()); const s2 = ctr(st, TARGET)
  s2.status = 'exited'; s2.exitCode = 137; s2.health = 'none'
  t('POSITIVE: the exact allowed delta passes', run(inv(), st, 'stop').ok, true)
  for (const [label, f, v] of [['policy', 'policy', 'no'], ['image', 'imageId', 'sha256:DEAD'], ['mounts', 'mounts', []]]) {
    const bad = clone(st); ctr(bad, TARGET)[f] = v
    t(`stop cannot hide a ${label} change`, run(inv(), bad, 'stop').ok, false)
  }

  console.log('-- remove-container: the container plus ITS endpoints only')
  const rm = clone(inv())
  rm.containers = rm.containers.filter((c) => c.name !== TARGET)
  for (const n of rm.networks) n.containers = n.containers.filter((x) => x !== TARGET)
  t('POSITIVE: removal plus its own endpoint departures passes', run(inv(), rm, 'remove-container').ok, true)
  const rmBad = clone(rm)
  rmBad.networks.find((n) => n.name === 'styliquenet').containers = []
  t('cannot hide ANOTHER endpoint leaving the same network', run(inv(), rmBad, 'remove-container').ok, false)
  const rmBad2 = clone(rm); rmBad2.volumes = rmBad2.volumes.filter((v) => v.name !== 'dead-vol')
  t('cannot hide an unrelated resource removal', run(inv(), rmBad2, 'remove-container').ok, false)
  const rmBad3 = clone(rm); ctr(rmBad3, 'twinai-worker').imageId = 'sha256:DEAD'
  t('cannot hide a change to a surviving container', run(inv(), rmBad3, 'remove-container').ok, false)

  console.log('-- reclaim: derived byte-exactly from the approved plan')
  const gone = clone(inv()); gone.containers = gone.containers.filter((c) => c.name !== TARGET)
  for (const n of gone.networks) n.containers = n.containers.filter((x) => x !== TARGET)
  const plan = { cmds: ['docker rmi sha256:sty1', 'docker volume rm dead-vol', 'docker builder prune --all --force'] }
  const reclaimed = clone(gone)
  reclaimed.images = reclaimed.images.filter((i) => i.id !== 'sha256:sty1')
  reclaimed.volumes = reclaimed.volumes.filter((v) => v.name !== 'dead-vol')
  t('POSITIVE: exactly the planned resources pass', run(gone, reclaimed, 'reclaim', plan).ok, true)
  t('reclaim gets NO generic container exemption',
    authorisationsForStage('reclaim', gone, plan).some((a) => a.type === 'containers'), false)
  const unplanned = clone(reclaimed)
  unplanned.volumes = unplanned.volumes.filter((v) => v.name !== 'oo-data')
  t('deleting an UNPLANNED resource fails', run(gone, unplanned, 'reclaim', plan).ok, false)
  t('a plan-less reclaim throws', (() => {
    try { authorisationsForStage('reclaim', gone, null); return false } catch (e) { return e instanceof DeltaError }
  })(), true)

  console.log('-- an UNEXERCISED authorisation is a finding')
  t('disable-restart that changed nothing fails', run(inv(), inv(), 'disable-restart').ok, false)
  t('…and says the authorisation was never used',
    run(inv(), inv(), 'disable-restart').findings.some((f) => f.kind === 'unused_authorisation'), true)

  console.log('-- authorisation hygiene')
  const A = (o) => validateAuthorisations([o]).length > 0
  t('a wildcard key is rejected', A({ op: 'change', type: 'containers', key: '*', fields: ['policy'] }), true)
  t('a wildcard field is rejected', A({ op: 'change', type: 'containers', key: 'x', fields: ['*'] }), true)
  t('an unknown type is rejected', A({ op: 'change', type: 'secrets', key: 'x', fields: ['a'] }), true)
  t('an unknown field is rejected', A({ op: 'change', type: 'containers', key: 'x', fields: ['nope'] }), true)
  t('a VOLATILE field cannot be authorised', A({ op: 'change', type: 'containers', key: 'x', fields: ['restarts'] }), true)
  t('an empty field list is rejected', A({ op: 'change', type: 'containers', key: 'x', fields: [] }), true)
  t('duplicate authorisations are rejected', validateAuthorisations([
    { op: 'remove', type: 'images', key: 'i' }, { op: 'remove', type: 'images', key: 'i' }]).length > 0, true)
  t('CONTROL: a well-formed authorisation is accepted',
    A({ op: 'change', type: 'containers', key: TARGET, fields: ['policy'] }), false)

  console.log('-- inventory schema')
  const badRoot = clone(inv()); badRoot.somethingNew = { a: 1 }
  t('an unknown ROOT key fails', run(inv(), badRoot, 'route-impact').ok, false)
  const dup = clone(inv()); dup.containers.push(clone(ctr(inv(), TARGET)))
  t('a duplicate record key fails', run(inv(), dup, 'route-impact').ok, false)
  const noKey = clone(inv()); delete ctr(noKey, TARGET).name
  t('a missing record key fails', run(inv(), noKey, 'route-impact').ok, false)
  const emptyKey = clone(inv()); ctr(emptyKey, TARGET).name = ''
  t('an empty record key fails', run(inv(), emptyKey, 'route-impact').ok, false)
  const notArr = clone(inv()); notArr.volumes = {}
  t('a non-array record section fails', run(inv(), notArr, 'route-impact').ok, false)
  const extraField = clone(inv()); ctr(extraField, 'twinai-worker').capAdd = ['SYS_ADMIN']
  t('an unknown record FIELD fails', run(inv(), extraField, 'route-impact').ok, false)
  t('CONTROL: known non-record root keys are fine', (() => {
    const b = clone(inv()); const a = clone(inv())
    b.report_sha256 = 'a'.repeat(64); a.report_sha256 = 'b'.repeat(64)
    b.fs = { root: {} }; a.fs = { root: {} }
    return run(b, a, 'route-impact').ok
  })(), true)

  if (failed) { console.error(`structural-delta selftest: ${failed} failed`); process.exit(1) }
  console.log('structural-delta selftest: all cases passed'); process.exit(0)
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (!isEntry) { /* imported for its exports */ }
else if (process.argv.includes('--selftest')) await selftest()
else {
  const argv = process.argv.slice(2)
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
  const [beforeF, afterF] = argv.filter((x) => !x.startsWith('--') && argv[argv.indexOf(x) - 1] !== '--stage' && argv[argv.indexOf(x) - 1] !== '--plan')
  const stage = flag('--stage')
  const planF = flag('--plan')
  if (!beforeF || !afterF || !stage) {
    console.error('usage: assert_structural_delta.mjs <before.json> <after.json> --stage <stage> [--plan plan.json]')
    process.exit(2)
  }
  // BOTH FILES ARE REQUIRED. The previous workflow step skipped itself when an
  // inventory was missing — most dangerous exactly when a mutation ran and the
  // after-collection failed. Missing evidence fails; it does not skip.
  let before; let after; let plan = null
  try { before = JSON.parse(readFileSync(beforeF, 'utf8')) }
  catch (e) { console.error(`::error::before inventory ${beforeF} is missing or invalid: ${e.message}`); process.exit(1) }
  try { after = JSON.parse(readFileSync(afterF, 'utf8')) }
  catch (e) { console.error(`::error::after inventory ${afterF} is missing or invalid: ${e.message}`); process.exit(1) }
  if (planF !== null) {
    try { plan = JSON.parse(readFileSync(planF, 'utf8')) }
    catch (e) { console.error(`::error::plan ${planF} is missing or invalid: ${e.message}`); process.exit(1) }
  }
  let auths; let d
  try {
    auths = authorisationsForStage(stage, before, plan)
    d = structuralDelta(before, after, auths)
  } catch (e) { console.error(`::error::structural delta could not be computed: ${e.message}`); process.exit(1) }
  console.log(render(d, {
    stage,
    candidateSha: process.env.GITHUB_SHA ?? '(unset)',
    beforeInventorySha256: sha256(readFileSync(beforeF, 'utf8')),
    planSha256: planF === null ? '(no plan)' : sha256(readFileSync(planF, 'utf8')),
    authorisations: JSON.stringify(auths),
  }))
  if (!d.ok) { console.error('::error::the host changed structurally in a way this stage did not authorise'); process.exit(1) }
}
