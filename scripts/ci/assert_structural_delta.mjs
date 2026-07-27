#!/usr/bin/env node
// Prove that a stage changed NOTHING it was not authorised to change.
//
// WHY A BYTE COMPARISON IS THE WRONG TEST
// ---------------------------------------
// Every earlier stage reported "the host is unchanged" by pointing at the disk
// figure and the health probe. That is an impression, not a proof. But the
// obvious fix — diff the two inventory JSONs — is WORSE THAN USELESS: they
// differ on every run for reasons nobody did. In run 30290680691 alone,
// `ctr_tmp_avail_kb` moved 24568432 -> 24568432 between the before and after
// collections, seconds apart, because a container wrote a temp file. Sizes,
// timestamps, free-space counters and log bytes all drift on their own.
//
// A comparator that flags those is a comparator people learn to ignore, and a
// comparator people ignore is worse than none: it launders a real change as
// more expected noise.
//
// So this compares the STRUCTURE that ownership and safety depend on, and
// explicitly permits the values that move by themselves. Volatility is declared
// per field, in the diff, before any run is seen.
//
// UNKNOWN FIELDS FAIL CLOSED. A field this file has never heard of is not
// assumed volatile — a future inventory field carrying real ownership meaning
// would otherwise be silently unwatched, which is exactly how the earlier
// guards in this lane went blind.
//
//   node scripts/ci/assert_structural_delta.mjs before.json after.json
//   node scripts/ci/assert_structural_delta.mjs --selftest
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * Per record type: which fields are STRUCTURAL (compared) and which are
 * VOLATILE (permitted to move). Every field of every record must appear in one
 * list or the other, or the comparator refuses.
 */
export const FIELD_POLICY = {
  containers: {
    // Identity, ownership and the safety contract.
    structural: [
      'name', 'status', 'policy', 'imageRef', 'imageId', 'project', 'labels',
      'mounts', 'ports', 'networks', 'health', 'memLimit', 'exitCode', 'created',
    ],
    // `restarts` moves on its own for a crash-looping container — which is the
    // whole reason stylique-os is being retired. `logSizeKb` grows whenever
    // anything logs.
    volatile: ['restarts', 'logSizeKb'],
  },
  images: {
    structural: ['id', 'tags', 'repoDigests', 'class'],
    volatile: ['sizeBytes', 'created'],
  },
  volumes: {
    // Ownership is mountpoint + who mounts it + whether it holds a database.
    structural: ['name', 'driver', 'mountpoint', 'labels', 'dbFiles', 'class', 'evidence'],
    volatile: ['sizeKb'],
  },
  networks: {
    // `containers` IS structural: an endpoint appearing or vanishing is a
    // topology change, not noise.
    structural: ['id', 'name', 'driver', 'containers', 'class'],
    volatile: [],
  },
}

/** Record types compared by key. */
export const TYPES = Object.keys(FIELD_POLICY)
/** The key that identifies a record within its type. */
const KEY_OF = { containers: 'name', images: 'id', volumes: 'name', networks: 'name' }

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

/**
 * Compare one inventory against another.
 *
 * `authorised` names records this stage was allowed to change or remove, as
 * `type/key`. Everything else must be structurally identical.
 */
export function structuralDelta(before, after, authorised = []) {
  const findings = []
  const ok = new Set(authorised)

  for (const t of TYPES) {
    const policy = FIELD_POLICY[t]
    const known = new Set([...policy.structural, ...policy.volatile])
    const key = KEY_OF[t]

    const list = (inv) => {
      const v = inv?.[t]
      if (!Array.isArray(v)) throw new DeltaError(`inventory.${t} is missing or not an array`)
      return v
    }
    const b = new Map(list(before).map((r) => [r?.[key], r]))
    const a = new Map(list(after).map((r) => [r?.[key], r]))

    // UNKNOWN FIELDS FAIL CLOSED, on both sides.
    for (const [side, m] of [['before', b], ['after', a]]) {
      for (const [k, rec] of m) {
        for (const f of Object.keys(rec ?? {})) {
          if (!known.has(f)) {
            findings.push({
              type: t, key: k, field: f, kind: 'unknown_field',
              detail: `${side}.${t}[${k}] carries field "${f}", which this comparator has no policy for. `
                + 'A field with no declared volatility is not assumed safe.',
            })
          }
        }
      }
    }

    for (const [k, rec] of b) {
      if (!a.has(k)) {
        if (!ok.has(`${t}/${k}`)) {
          findings.push({ type: t, key: k, field: null, kind: 'removed', detail: `${t}/${k} vanished and was not authorised` })
        }
        continue
      }
      if (ok.has(`${t}/${k}`)) continue
      const after2 = a.get(k)
      for (const f of policy.structural) {
        const bv = canon(rec?.[f]); const av = canon(after2?.[f])
        if (bv !== av) {
          findings.push({
            type: t, key: k, field: f, kind: 'changed',
            detail: `${t}/${k}.${f}: ${bv.slice(0, 120)} -> ${av.slice(0, 120)}`,
          })
        }
      }
    }
    for (const k of a.keys()) {
      if (!b.has(k) && !ok.has(`${t}/${k}`)) {
        findings.push({ type: t, key: k, field: null, kind: 'added', detail: `${t}/${k} appeared and was not authorised` })
      }
    }
  }

  return { ok: findings.length === 0, findings }
}

export function render(d) {
  const L = ['== structural delta (volatile values permitted) =='];
  if (d.ok) L.push('  no unauthorised structural change')
  for (const f of d.findings) L.push(`  [${f.kind}] ${f.detail}`)
  L.push(`  UNAUTHORISED STRUCTURAL DELTA: ${d.ok ? 'none' : d.findings.length}`)
  return L.join('\n')
}

// ------------------------------------------------------------------ selftest
const inv = (over = {}) => ({
  containers: [{
    name: 'twinai-worker', status: 'running', policy: 'unless-stopped',
    imageRef: 'twinai-worker:latest', imageId: 'sha256:0200', project: null, labels: '',
    mounts: [], ports: '', networks: ['bridge'], health: 'healthy', memLimit: 0,
    exitCode: 0, created: 'c1', restarts: 0, logSizeKb: 10,
  }, {
    // The REAL pre-retirement state: crash-looping under unless-stopped. An
    // earlier version of this fixture already had it exited/no, so the
    // "stopped without authorisation" control mutated nothing and passed
    // vacuously — the control caught its own vacuity.
    name: 'stylique-os', status: 'restarting', policy: 'unless-stopped',
    imageRef: 'stylique-os:latest', imageId: 'sha256:bbbb', project: 'deploy', labels: '',
    mounts: [{ type: 'volume', name: 'oo-data', source: '/v/oo', destination: '/data', rw: false }],
    ports: '', networks: ['styliquenet'], health: 'unhealthy', memLimit: 0,
    exitCode: 0, created: 'c2', restarts: 23329, logSizeKb: 133000,
  }],
  images: [{ id: 'sha256:0200', tags: ['twinai-worker:latest'], repoDigests: [], class: 'active-twinai', sizeBytes: 1, created: 'x' }],
  volumes: [{ name: 'oo-data', driver: 'local', mountpoint: '/v/oo', labels: '', dbFiles: '', class: 'shared-do-not-touch', evidence: 'mounted by stylique-os,infallible_hawking', sizeKb: 4 }],
  networks: [{ id: 'n1', name: 'styliquenet', driver: 'bridge', containers: ['stylique-caddy', 'stylique-dashboard'], class: 'unknown-do-not-touch' }],
  ...over,
})

/** Deep-clone then mutate one field of one record. */
function mutate(base, type, key, field, value) {
  const c = JSON.parse(JSON.stringify(base))
  const k = KEY_OF[type]
  c[type].find((r) => r[k] === key)[field] = value
  return c
}

async function selftest() {
  let failed = 0
  const t = (name, got, exp) => {
    if (got === exp) console.log(`  ok: ${name}`)
    else { console.error(`SELFTEST FAIL: ${name} => ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); failed++ }
  }

  console.log('-- POSITIVE CONTROL: identical inventories pass')
  t('identical inventories have no delta', structuralDelta(inv(), inv()).ok, true)

  console.log('-- VOLATILE values are permitted')
  // THE OLD-BEHAVIOUR COUNTEREXAMPLE. A byte/JSON comparison fails on all of
  // these, every run, for reasons nobody caused.
  const volatileOnly = mutate(
    mutate(mutate(inv(), 'containers', 'stylique-os', 'restarts', 23400),
      'containers', 'twinai-worker', 'logSizeKb', 99999),
    'volumes', 'oo-data', 'sizeKb', 4096)
  volatileOnly.images[0].sizeBytes = 987654321
  volatileOnly.images[0].created = 'later'
  t('restarts, log size, volume size, image size+created all drift freely',
    structuralDelta(inv(), volatileOnly).ok, true)
  t('OLD BEHAVIOUR: a raw JSON comparison would have flagged that as a change',
    JSON.stringify(inv()) === JSON.stringify(volatileOnly), false)

  console.log('-- one mutation per PROTECTED field class')
  const cases = [
    ['container image identity', mutate(inv(), 'containers', 'twinai-worker', 'imageId', 'sha256:DEAD')],
    ['container restart policy', mutate(inv(), 'containers', 'twinai-worker', 'policy', 'no')],
    ['container status', mutate(inv(), 'containers', 'twinai-worker', 'status', 'exited')],
    ['container health contract', mutate(inv(), 'containers', 'twinai-worker', 'health', 'unhealthy')],
    ['container ports', mutate(inv(), 'containers', 'twinai-worker', 'ports', '0.0.0.0:9999->9999/tcp')],
    ['container networks', mutate(inv(), 'containers', 'twinai-worker', 'networks', ['bridge', 'styliquenet'])],
    ['container mounts', mutate(inv(), 'containers', 'stylique-os', 'mounts', [])],
    ['container memory limit', mutate(inv(), 'containers', 'twinai-worker', 'memLimit', 1073741824)],
    ['protected image identity', mutate(inv(), 'images', 'sha256:0200', 'tags', ['twinai-worker:tampered'])],
    ['image classification', mutate(inv(), 'images', 'sha256:0200', 'class', 'stylique-os')],
    ['volume ownership evidence', mutate(inv(), 'volumes', 'oo-data', 'evidence', 'mounted by nobody')],
    ['volume mountpoint', mutate(inv(), 'volumes', 'oo-data', 'mountpoint', '/v/elsewhere')],
    ['volume DATABASE marker', mutate(inv(), 'volumes', 'oo-data', 'dbFiles', 'PG_VERSION')],
    ['volume classification', mutate(inv(), 'volumes', 'oo-data', 'class', 'proven-orphaned')],
    ['network endpoints', mutate(inv(), 'networks', 'styliquenet', 'containers', ['stylique-caddy'])],
    ['network driver', mutate(inv(), 'networks', 'styliquenet', 'driver', 'host')],
  ]
  for (const [label, after] of cases) {
    t(`${label} is DETECTED`, structuralDelta(inv(), after).ok, false)
  }

  console.log('-- appearance and disappearance')
  const removed = JSON.parse(JSON.stringify(inv())); removed.containers.pop()
  t('an unauthorised removal is detected', structuralDelta(inv(), removed).ok, false)
  t('…but an AUTHORISED removal passes', structuralDelta(inv(), removed, ['containers/stylique-os']).ok, true)
  const added = JSON.parse(JSON.stringify(inv()))
  added.volumes.push({ name: 'sneaky', driver: 'local', mountpoint: '/v/x', labels: '', dbFiles: '', class: 'proven-orphaned', evidence: 'e', sizeKb: 1 })
  t('an unauthorised appearance is detected', structuralDelta(inv(), added).ok, false)

  console.log('-- UNKNOWN fields fail closed')
  const extra = JSON.parse(JSON.stringify(inv()))
  extra.containers[0].capAdd = ['SYS_ADMIN']
  t('a field with no declared policy blocks', structuralDelta(inv(), extra).ok, false)
  t('…and names the field',
    structuralDelta(inv(), extra).findings.some((f) => f.field === 'capAdd' && f.kind === 'unknown_field'), true)
  t('an unknown field on the BEFORE side blocks too', structuralDelta(extra, inv()).ok, false)

  console.log('-- NON-VACUITY: the comparator sees a real unauthorised change')
  // Not a synthetic field flip: the exact shape of an unauthorised mutation —
  // stylique-os stopped WITHOUT authorisation, while everything else holds.
  const stoppedUnauthorised = mutate(inv(), 'containers', 'stylique-os', 'status', 'exited')
  stoppedUnauthorised.containers.find((c) => c.name === 'stylique-os').policy = 'no'
  const d = structuralDelta(inv(), stoppedUnauthorised)
  t('an unauthorised policy change is caught', d.ok, false)
  t('…and is attributed to the right record and field',
    d.findings.some((f) => f.type === 'containers' && f.key === 'stylique-os' && f.field === 'policy'), true)
  // …and the SAME change, authorised, passes. Without this the check above
  // could be satisfied by a comparator that rejects everything.
  t('CONTROL: the same change PASSES when authorised',
    structuralDelta(inv(), stoppedUnauthorised, ['containers/stylique-os']).ok, true)

  console.log('-- malformed input refuses')
  t('a missing array throws', (() => {
    try { structuralDelta({ containers: [] }, inv()); return false } catch (e) { return e instanceof DeltaError }
  })(), true)

  if (failed) { console.error(`structural-delta selftest: ${failed} failed`); process.exit(1) }
  console.log('structural-delta selftest: all cases passed'); process.exit(0)
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (!isEntry) { /* imported for its exports */ }
else if (process.argv.includes('--selftest')) await selftest()
else {
  const [, , beforeF, afterF, ...rest] = process.argv
  if (!beforeF || !afterF) { console.error('usage: assert_structural_delta.mjs <before.json> <after.json> [type/key ...]'); process.exit(2) }
  let d
  try {
    d = structuralDelta(JSON.parse(readFileSync(beforeF, 'utf8')), JSON.parse(readFileSync(afterF, 'utf8')), rest)
  } catch (e) { console.error(`::error::structural delta could not be computed: ${e.message}`); process.exit(1) }
  console.log(render(d))
  if (!d.ok) { console.error('::error::the host changed structurally in a way this stage did not authorise'); process.exit(1) }
}
