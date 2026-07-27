#!/usr/bin/env node
// Prove that a stage changed NOTHING it was not authorised to change — where
// "authorised" means one named field of one named record, named by a plan that
// is bound to this stage, this commit and this exact before-inventory.
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
// The first version took a set of `type/key` strings and skipped EVERY
// structural field of an authorised record. `disable-restart` is meant to permit
// exactly one field — the restart policy — but that design would have waved
// through a simultaneous change to imageId, mounts, ports, networks, memLimit,
// labels or status on the same container. Least privilege has to be expressible
// or it is not enforced.
//
// WHY THE AUTHORISATIONS COME FROM A TYPED PLAN, NOT FROM PARSING ONE
// -------------------------------------------------------------------
// The second version recovered reclaim's authorisations by matching
// `/^docker rmi (\S+)$/` against the plan's command STRINGS. That is a parser
// for a language the planner never promised to speak: a flag, a second argument
// or a tag instead of an id matches nothing, the authorisation silently
// vanishes, and "this deletion was approved" becomes indistinguishable from
// "this regex did not fire". plan_retirement.mjs now emits typed resources —
// operation, type, exact key, argv — and the executor and this comparator read
// the same objects.
//
// Authorisations are TYPED OPERATIONS:
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
//        --stage <stage> [--plan plan.json] [--candidate-sha X]
//   node scripts/ci/assert_structural_delta.mjs --selftest
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import {
  PlanError, canonJson, plan as planFor, sha256hex, verifyPlanBinding,
} from './plan_retirement.mjs'

const TARGET = 'stylique-os'

/**
 * EVERY root key build_resource_inventory.mjs actually emits, taken from the
 * committed builder rather than from memory.
 *
 * The first version of this list was written from recollection: it invented
 * `ctrLogs`, which does not exist, and omitted `schema`, `twinaiImages` and
 * `listening`, which do. The comparator would therefore have FAILED on a
 * completely unchanged host — the worst possible failure for a guard whose whole
 * job is to distinguish "nothing happened" from "something did". The selftest
 * now builds its fixture by CALLING buildInventory, so this list cannot drift
 * from the builder again without a test going red.
 */
export const RECORD_ROOTS = ['containers', 'images', 'volumes', 'networks']
export const NON_RECORD_ROOTS = [
  'schema', 'dockerDf', 'fs', 'inodes', 'hostDirs',
  'twinai', 'twinaiImages', 'proxyRefs', 'listening', 'report_sha256',
]
/**
 * Roots that MUST be present on both sides. A missing one is a truncated
 * inventory, and two truncated inventories compare equal — the failure mode
 * where a guard passes loudest with nothing in front of it.
 *
 * The four ignored telemetry roots are deliberately not required: their absence
 * changes no verdict, and requiring them would fail runs for no safety reason.
 */
export const REQUIRED_ROOTS = [
  'schema', 'containers', 'images', 'volumes', 'networks',
  'twinai', 'twinaiImages', 'proxyRefs', 'listening',
]
export const TYPES = RECORD_ROOTS
const KEY_OF = { containers: 'name', images: 'id', volumes: 'name', networks: 'name' }

/**
 * Per record type: STRUCTURAL fields are compared; VOLATILE ones may move;
 * DERIVED ones are computed from other fields in the same inventory.
 *
 * `class` and `evidence` are the classifier's output. Every input it reads —
 * a container's imageId and mounts, an image's tags, a volume's dbFiles, a
 * network's container list, and the proxy reference table — is itself compared,
 * as structural record fields above or as a structural root below. So the
 * classification cannot move without a compared field moving, and comparing it
 * as well adds no information while guaranteeing a false failure the moment a
 * legitimately authorised removal reclassifies a surviving neighbour (removing
 * stylique-os turns `oo-data` from "mounted by two" into "mounted by one").
 * The selftest proves the entailment by mutating each classifier INPUT and
 * requiring the delta to fail.
 */
export const FIELD_POLICY = {
  containers: {
    structural: [
      'name', 'status', 'policy', 'imageRef', 'imageId', 'project', 'labels',
      'mounts', 'ports', 'networks', 'health', 'memLimit', 'exitCode', 'created',
    ],
    volatile: ['restarts', 'logSizeKb'],
    derived: ['class', 'evidence'],
  },
  images: {
    structural: ['id', 'tags', 'repoDigests'],
    volatile: ['sizeBytes', 'created'],
    derived: ['class', 'evidence'],
  },
  volumes: {
    structural: ['name', 'driver', 'mountpoint', 'labels', 'dbFiles'],
    volatile: ['sizeKb'],
    derived: ['class', 'evidence'],
  },
  networks: {
    structural: ['id', 'name', 'driver', 'containers'],
    volatile: [],
    derived: ['class', 'evidence'],
  },
}

/**
 * Non-record roots carry identity and topology, and were previously compared
 * NOT AT ALL — schema-validated and then ignored. `twinai.src_sha` could change,
 * the pinned model path could move, a proxy reference could appear and a new
 * port could open, and this comparator would still have said "no unauthorised
 * structural change".
 *
 *   structural: null, volatile: null  — pure telemetry, wholly ignored
 *   structural: null, volatile: []    — the whole value is compared canonically
 *   structural: [...]                 — those keys/fields are compared
 *   keyed: 'k'                        — an array of records keyed by k
 */
export const ROOT_POLICY = {
  schema: { structural: null, volatile: [] },
  // Deployed identity: the worker's source commit and the pinned model path are
  // the two facts the Whisper/model convergence gate rests on. Everything else
  // here is a `du` reading.
  twinai: {
    structural: ['src_sha', 'model_path'],
    volatile: ['model_cache_kb', 'models_root_kb', 'tmp_kb', 'tmp_entries', 'ctr_tmp_avail_kb'],
  },
  // TwinAI image identity, including the rollback set. Losing a rollback image
  // is exactly what the retirement must not do. Sizes and dates drift.
  twinaiImages: { structural: ['tag', 'id'], volatile: ['created', 'size'], keyed: 'tag' },
  // Which proxy references what. A new live route is a topology change, and it
  // is also a classifier input (a proxy naming twinai makes a container shared).
  proxyRefs: { structural: ['proxy', 'hits'], volatile: [], keyed: 'proxy' },
  // Listener addresses and ports. A newly exposed port is a security change.
  //
  // NORMALISED, NOT IGNORED. Three things in an `ss -ltn` line move on their
  // own and say nothing about what is exposed:
  //   * the accept-queue depths (Recv-Q/Send-Q), which track live load;
  //   * file-descriptor numbers, which are reassigned across restarts;
  //   * the row order, which the kernel does not promise.
  // Each is named here rather than tolerated in silence, so that what survives
  // — the address, the port and the owning process — is compared strictly
  // instead of being drowned in churn nobody caused. (The collector emits at
  // most 40 rows, sorted, so the sample itself is deterministic.)
  listening: {
    structural: null,
    volatile: [],
    sorted: true,
    normalize: (s) => String(s)
      .replace(/fd=\d+/g, 'fd=?')
      .replace(/\s+/g, ' ')
      .trim()
      // A bare integer token is a queue depth; a port is never bare (`:80`).
      .replace(/(?<= )\d+(?= )/g, '#'),
  },
  // Pure telemetry: every value moves on its own, and the disk thresholds are
  // assert_vps_acceptance.mjs's job, not this comparator's.
  dockerDf: { structural: null, volatile: null },
  fs: { structural: null, volatile: null },
  inodes: { structural: null, volatile: null },
  hostDirs: { structural: null, volatile: null },
  // A digest OF the inventory, including its volatile parts. Comparing it would
  // fail on every run and mean nothing.
  report_sha256: { structural: null, volatile: null },
}

export class DeltaError extends Error {
  constructor(message) { super(message); this.name = 'DeltaError' }
}

const canon = canonJson
export const sha256 = sha256hex

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
  const known = new Set([...RECORD_ROOTS, ...NON_RECORD_ROOTS])
  for (const k of Object.keys(inv)) {
    if (!known.has(k)) problems.push(`${label}: unknown top-level key ${JSON.stringify(k)}`)
  }
  for (const k of REQUIRED_ROOTS) {
    if (!(k in inv)) problems.push(`${label}: required top-level key ${JSON.stringify(k)} is missing — the inventory is truncated`)
  }
  for (const t of RECORD_ROOTS) {
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
    if (!RECORD_ROOTS.includes(a?.type)) { problems.push(`unknown authorisation type ${JSON.stringify(a?.type)}`); continue }
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

const READ_ONLY = new Set(['manifest', 'pre-stop-audit', 'route-impact', 'observe'])

/**
 * The endpoint departures a container's removal necessarily causes.
 *
 * THE TWO VIEWS MUST AGREE. `container.networks` comes from inspecting the
 * container; `network.containers` comes from inspecting each network. They
 * describe the same attachments from opposite ends. If they disagree, one of
 * them is wrong and there is no evidence which — so this refuses rather than
 * picking the view that authorises more. Authorising from the network side
 * alone would let a network the container is really attached to go unmentioned,
 * and a departure from it would then read as unauthorised long after the fact.
 */
export function endpointAuthorisations(before, name) {
  const target = (before.containers ?? []).find((c) => c.name === name)
  const fromNetworks = (before.networks ?? [])
    .filter((n) => Array.isArray(n.containers) && n.containers.includes(name))
    .map((n) => n.name)
  if (target !== undefined) {
    const claimed = [...new Set(Array.isArray(target.networks) ? target.networks : [])].sort()
    const observed = [...new Set(fromNetworks)].sort()
    if (canon(claimed) !== canon(observed)) {
      throw new DeltaError(
        `the BEFORE inventory disagrees with itself about ${name}'s networks: the container record says `
        + `[${claimed.join(', ')}] and the network records say [${observed.join(', ')}]. One view is wrong and `
        + 'there is no evidence which, so no endpoint departure can be authorised.',
      )
    }
  }
  return fromNetworks.map((n) => ({ op: 'remove-endpoint', type: 'networks', key: n, endpoint: name }))
}

/**
 * What the WHOLE retirement was authorised to do to this baseline.
 *
 * `accept` compares a baseline collected before the retirement started against
 * the host as it is now, so its authorisation is cumulative rather than
 * per-stage. It is RE-DERIVED from the baseline by the same planner that drove
 * the retirement — not read from a stage's plan, which would only describe one
 * step — so a resource the plan would never have named is still unauthorised
 * here.
 *
 * A network reclaim deletes outright needs no separate endpoint authorisation:
 * the record is gone, so nothing is left for an endpoint to leave.
 */
export function acceptAuthorisations(before) {
  let reclaim
  try {
    reclaim = planFor({ ...before, containers: (before.containers ?? []).filter((c) => c.name !== TARGET) }, 'reclaim')
  } catch (e) {
    throw new DeltaError(
      `accept cannot re-derive what the retirement was authorised to do from this baseline: ${e.message}`
      + (e instanceof PlanError ? '' : ' (the baseline may not be a full inventory)'),
    )
  }
  const auths = []
  const removedNetworks = new Set()
  for (const r of reclaim.resources) {
    if (r.op === 'none') continue
    auths.push({ op: r.op, type: r.type, key: r.key })
    if (r.op === 'remove' && r.type === 'networks') removedNetworks.add(r.key)
  }
  if ((before.containers ?? []).some((c) => c.name === TARGET)) {
    auths.push({ op: 'remove', type: 'containers', key: TARGET })
    for (const a of endpointAuthorisations(before, TARGET)) {
      if (!removedNetworks.has(a.key)) auths.push(a)
    }
  }
  return auths
}

/**
 * Authorisations for a stage: the stage's own TYPED PLAN, plus the structural
 * consequences that plan necessarily causes but cannot itself command.
 *
 * Read-only stages authorise nothing at all, and a read-only stage whose plan
 * names a resource to act on is a contradiction that stops the run.
 */
export function authorisationsForStage(stage, before, plan = null) {
  if (READ_ONLY.has(stage)) {
    const acting = Array.isArray(plan?.resources) ? plan.resources.filter((r) => r?.op !== 'none') : []
    if (acting.length > 0) {
      throw new DeltaError(`stage ${JSON.stringify(stage)} is read-only, but its plan names ${acting.length} resource(s) to act on`)
    }
    return []
  }
  if (stage === 'accept') return acceptAuthorisations(before)
  if (!['disable-restart', 'stop', 'remove-container', 'reclaim'].includes(stage)) {
    throw new DeltaError(`unknown stage ${JSON.stringify(stage)}`)
  }
  if (plan === null || !Array.isArray(plan.resources)) {
    throw new DeltaError(`stage ${JSON.stringify(stage)} requires the approved typed plan to derive its authorisations`)
  }
  const auths = []
  for (const r of plan.resources) {
    if (r.op === 'none') continue
    auths.push(r.op === 'change'
      ? { op: 'change', type: r.type, key: r.key, fields: [...r.fields] }
      : { op: r.op, type: r.type, key: r.key })
  }
  // Removing a container removes its endpoints from every network it was in.
  // That is a consequence, not a command, so no plan entry describes it.
  if (stage === 'remove-container') auths.push(...endpointAuthorisations(before, TARGET))
  return auths
}

/** Compare the non-record roots according to ROOT_POLICY. */
function rootDelta(before, after, add) {
  for (const root of NON_RECORD_ROOTS) {
    const pol = ROOT_POLICY[root]
    if (pol === undefined) {
      // A root added to the known list without a policy would otherwise be
      // silently ignored — the exact hole this whole section closes.
      add('unpoliced_root', root, null, null, `root "${root}" is known but has no volatility policy declared`)
      continue
    }
    if (pol.structural === null && pol.volatile === null) continue
    const b = before[root]; const a = after[root]

    if (pol.structural === null) {
      const project = (v) => {
        if (!Array.isArray(v)) return canon(v)
        const list = pol.normalize ? v.map(pol.normalize) : v
        return canon(pol.sorted ? [...list].sort() : list)
      }
      const bv = project(b); const av = project(a)
      if (bv !== av) add('root_changed', root, null, null, `${root}: ${bv.slice(0, 160)} -> ${av.slice(0, 160)}`)
      continue
    }

    const known = new Set([...pol.structural, ...pol.volatile])
    if (pol.keyed) {
      const index = (v, side) => {
        const m = new Map()
        if (!Array.isArray(v)) { add('root_shape', root, null, null, `${side}.${root} is not an array`); return m }
        for (const r of v) {
          if (r === null || typeof r !== 'object' || Array.isArray(r)) {
            add('root_shape', root, null, null, `${side}.${root} contains a non-object record`); continue
          }
          const k = r[pol.keyed]
          if (typeof k !== 'string' || k.length === 0) {
            add('root_shape', root, null, null, `${side}.${root} has a record with no ${pol.keyed}`); continue
          }
          if (m.has(k)) add('root_shape', root, k, null, `${side}.${root} lists ${JSON.stringify(k)} more than once`)
          for (const f of Object.keys(r)) {
            if (!known.has(f)) add('unknown_field', root, k, f, `${side}.${root}[${k}] carries field "${f}", which has no declared volatility policy`)
          }
          m.set(k, r)
        }
        return m
      }
      const bm = index(b, 'before'); const am = index(a, 'after')
      for (const [k, rec] of bm) {
        if (!am.has(k)) { add('root_removed', root, k, null, `${root}/${k} vanished`); continue }
        for (const f of pol.structural) {
          const bv = canon(rec[f]); const av = canon(am.get(k)[f])
          if (bv !== av) add('root_changed', root, k, f, `${root}/${k}.${f}: ${bv.slice(0, 120)} -> ${av.slice(0, 120)}`)
        }
      }
      for (const k of am.keys()) if (!bm.has(k)) add('root_added', root, k, null, `${root}/${k} appeared`)
      continue
    }

    // A flat key/value map (twinai). Same discipline as a record: an undeclared
    // key fails rather than passing unexamined.
    for (const [side, v] of [['before', b], ['after', a]]) {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) {
        add('root_shape', root, null, null, `${side}.${root} is not an object`); continue
      }
      for (const k of Object.keys(v)) {
        if (!known.has(k)) add('unknown_field', root, null, k, `${side}.${root} carries key "${k}", which has no declared volatility policy`)
      }
    }
    for (const f of pol.structural) {
      const bv = canon(b?.[f]); const av = canon(a?.[f])
      if (bv !== av) add('root_changed', root, null, f, `${root}.${f}: ${bv.slice(0, 120)} -> ${av.slice(0, 120)}`)
    }
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

  for (const t of RECORD_ROOTS) {
    const policy = FIELD_POLICY[t]
    const known = new Set([...policy.structural, ...policy.volatile, ...policy.derived])
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

  // The roots outside the four record types. No stage authorises a change to any
  // of them: none of them is something the retirement acts on.
  rootDelta(before, after, add)

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
//
// THE FIXTURE IS BUILT BY THE REAL BUILDER. `inv()` below runs the raw collector
// record stream through buildInventory, so every root key, every record field
// and every derived value is exactly what a production inventory carries. The
// previous fixture was hand-written to match this comparator's expectations,
// which is why a root-key list invented from memory passed all 32 of its cases
// and would have failed on the first unchanged host.
const RAW = [
  // name, status#restarts#policy#imageRef#imageId#created#health#memLimit#exitCode, project, labels, mounts, ports, networks, logKb
  ['CONTAINER', 'twinai-worker', 'running#0#unless-stopped:0#twinai-worker:latest#sha256:0200#2025-01-02T03:04:05Z#healthy#0#0', '', '', 'volume|twdata|/var/lib/docker/volumes/twdata/_data|/data|true;', '', 'bridge', '1024'].join('\t'),
  ['CONTAINER', TARGET, 'restarting#23329#unless-stopped:0#stylique-os:latest#sha256:bbbb#2024-05-06T07:08:09Z#unhealthy#0#0', 'deploy', 'com.docker.compose.project=deploy', 'volume|oo-data|/var/lib/docker/volumes/oo-data/_data|/data|false;', '', 'styliquenet deploy_default', '133000'].join('\t'),
  ['CONTAINER', 'infallible_hawking', 'running#1#always:0#oo/app:1#sha256:cccc#2024-01-01T00:00:00Z#none#0#0', '', '', 'volume|oo-data|/var/lib/docker/volumes/oo-data/_data|/data|true;', '', 'styliquenet', '12'].join('\t'),
  ['IMAGE', 'sha256:0200', 'twinai-worker:latest#twinai-worker@sha256:d1#1200000000#2025-01-02'].join('\t'),
  ['IMAGE', 'sha256:prev', 'twinai-worker:prev##1190000000#2024-12-20'].join('\t'),
  ['IMAGE', 'sha256:bbbb', 'stylique-os:latest##980000000#2024-05-06'].join('\t'),
  ['IMAGE', 'sha256:cccc', 'oo/app:1##410000000#2024-01-01'].join('\t'),
  ['IMAGE', 'sha256:dang', '##60000000#2024-02-02'].join('\t'),
  ['VOLUME', 'twdata', 'local', '/var/lib/docker/volumes/twdata/_data', '4096', '', ''].join('\t'),
  ['VOLUME', 'oo-data', 'local', '/var/lib/docker/volumes/oo-data/_data', '8192', '', ''].join('\t'),
  ['VOLUME', 'dead-vol', 'local', '/var/lib/docker/volumes/dead-vol/_data', '64', '', ''].join('\t'),
  ['NETWORK', 'n1', 'styliquenet#bridge#stylique-os,infallible_hawking,'].join('\t'),
  ['NETWORK', 'n2', 'deploy_default#bridge#stylique-os,'].join('\t'),
  ['NETWORK', 'n3', 'bridge#bridge#twinai-worker,'].join('\t'),
  ['DOCKERDF', 'Build Cache#380#0#68.3GB#65.1GB'].join('\t'),
  ['DOCKERDF', 'Images#42#3#98.33GB#31.43GB'].join('\t'),
  ['FS', 'root', '157155328#126152192#24567296#84%', '/'].join('\t'),
  ['INODES', 'root', '9830400#1204553#8625847#13%'].join('\t'),
  ['HOSTDIR', '/var/lib/docker', '104857600'].join('\t'),
  ['HOSTDIR2', '/var/log', '2097152'].join('\t'),
  ['TWINAI', 'model_path', '/opt/models/faster-whisper-small'].join('\t'),
  ['TWINAI', 'model_cache_kb', '482300'].join('\t'),
  ['TWINAI', 'models_root_kb', '482300'].join('\t'),
  ['TWINAI', 'tmp_kb', '128'].join('\t'),
  ['TWINAI', 'tmp_entries', '3'].join('\t'),
  ['TWINAI', 'ctr_tmp_avail_kb', '24567296'].join('\t'),
  ['TWINAI', 'src_sha', '4626dff0000000000000000000000000000000ab'].join('\t'),
  ['TWINAIIMAGE', 'twinai-worker:latest#sha256:0200#2025-01-02 03:04:05 +0000 UTC#1.2GB'].join('\t'),
  ['TWINAIIMAGE', 'twinai-worker:prev#sha256:prev#2024-12-20 00:00:00 +0000 UTC#1.19GB'].join('\t'),
  ['PROXYREF', 'stylique-caddy', '/etc/caddy/Caddyfile'].join('\t'),
  ['LISTEN', 'LISTEN 0 4096 0.0.0.0:80 0.0.0.0:* users:(("docker-proxy",pid=?,fd=4))'].join('\t'),
  ['LISTEN', 'LISTEN 0 4096 0.0.0.0:443 0.0.0.0:* users:(("docker-proxy",pid=?,fd=7))'].join('\t'),
  ['META', 'collected_by', 'vps-diag'].join('\t'),
].join('\n')

const clone = (o) => JSON.parse(JSON.stringify(o))
const ctr = (i, n) => i.containers.find((c) => c.name === n)
const img = (i, id) => i.images.find((x) => x.id === id)
const net = (i, n) => i.networks.find((x) => x.name === n)
const vol = (i, n) => i.volumes.find((x) => x.name === n)

async function selftest() {
  const { buildInventory, parseRecords, hashInventory } = await import('./build_resource_inventory.mjs')
  const { sealPlan } = await import('./plan_retirement.mjs')

  /** A REAL production-shape inventory, produced by the real builder. */
  const inv = () => {
    const i = buildInventory(parseRecords(RAW))
    i.report_sha256 = hashInventory(i)
    return i
  }

  let failed = 0
  const t = (name, got, exp) => {
    if (got === exp) console.log(`  ok: ${name}`)
    else { console.error(`SELFTEST FAIL: ${name} => ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); failed++ }
  }
  const BIND = { candidateSha: 'c'.repeat(40), beforeInventorySha256: 'b'.repeat(64) }
  // A stage's plan, sealed exactly as the workflow seals it.
  const planned = (b, stage) => sealPlan(planFor(b, stage), BIND)
  const run = (b, a, stage, plan) => structuralDelta(b, a, authorisationsForStage(stage, b, plan ?? (
    ['disable-restart', 'stop', 'remove-container', 'reclaim'].includes(stage) ? planned(b, stage) : null)))

  console.log('-- the fixture is the REAL shape, and this comparator understands all of it')
  // THE CASE THAT WOULD HAVE CAUGHT THE INVENTED ROOT KEY. A hand-written
  // fixture agrees with whatever the comparator believes; the builder does not.
  t('a production-shape inventory validates with ZERO problems', validateInventory(inv(), 'prod').length, 0)
  t('…and every root the builder emits is declared here',
    Object.keys(inv()).filter((k) => ![...RECORD_ROOTS, ...NON_RECORD_ROOTS].includes(k)).join(',') || 'none', 'none')
  t('…and every declared non-record root has a policy',
    NON_RECORD_ROOTS.filter((r) => ROOT_POLICY[r] === undefined).join(',') || 'none', 'none')
  t('…and every record field the builder emits has a declared policy', (() => {
    const missing = []
    for (const t2 of RECORD_ROOTS) {
      const p = FIELD_POLICY[t2]
      const known = new Set([...p.structural, ...p.volatile, ...p.derived])
      for (const r of inv()[t2]) for (const f of Object.keys(r)) if (!known.has(f)) missing.push(`${t2}.${f}`)
    }
    return [...new Set(missing)].join(',') || 'none'
  })(), 'none')
  t('the unchanged host passes', run(inv(), inv(), 'route-impact').ok, true)

  // OLD-HEAD COUNTEREXAMPLE. The rejected head's list, copied verbatim from
  // commit 1078f4f. It was written from recollection and never met a real
  // inventory, so all 32 of its cases passed while it would have failed the
  // first run against an untouched host. This keeps the counterexample in the
  // suite rather than in a commit message.
  const OLD_HEAD_ROOTS = ['fs', 'inodes', 'dockerDf', 'hostDirs', 'ctrLogs', 'proxyRefs', 'twinai', 'report_sha256']
  const oldKnown = new Set([...RECORD_ROOTS, ...OLD_HEAD_ROOTS])
  const unknownToOldHead = Object.keys(inv()).filter((k) => !oldKnown.has(k)).sort()
  t('OLD HEAD: its root list would have failed an UNCHANGED host', unknownToOldHead.length > 0, true)
  t('OLD HEAD: …on exactly these real roots', unknownToOldHead.join(','), 'listening,schema,twinaiImages')
  t('OLD HEAD: …and it named a root the builder never emits',
    OLD_HEAD_ROOTS.filter((k) => !(k in inv())).join(','), 'ctrLogs')
  t('CORRECTED HEAD: the same host is clean', validateInventory(inv(), 'x').length, 0)

  console.log('-- read-only stages authorise NOTHING')
  for (const s of ['manifest', 'pre-stop-audit', 'route-impact', 'observe']) {
    t(`${s} authorises nothing`, authorisationsForStage(s, inv(), planned(inv(), s === 'observe' ? 'manifest' : s)).length, 0)
  }
  t('a read-only stage whose plan names a resource is refused', (() => {
    try { authorisationsForStage('route-impact', inv(), planned(inv(), 'stop')); return false }
    catch (e) { return e instanceof DeltaError }
  })(), true)
  const volatileOnly = clone(inv())
  ctr(volatileOnly, TARGET).restarts = 23400
  ctr(volatileOnly, 'twinai-worker').logSizeKb = 99999
  img(volatileOnly, 'sha256:0200').sizeBytes = 987654321
  vol(volatileOnly, 'oo-data').sizeKb = 9999
  volatileOnly.twinai.tmp_kb = '9999'
  volatileOnly.twinaiImages[0].size = '1.3GB'
  volatileOnly.fs.root.availKb = 1
  volatileOnly.dockerDf[0].reclaimable = '0B'
  volatileOnly.report_sha256 = 'f'.repeat(64)
  t('volatile drift alone passes', run(inv(), volatileOnly, 'route-impact').ok, true)
  t('OLD BEHAVIOUR: a raw JSON compare would have flagged that',
    JSON.stringify(inv()) === JSON.stringify(volatileOnly), false)
  t('any structural change under a read-only stage fails',
    run(inv(), (() => { const a = clone(inv()); ctr(a, TARGET).policy = 'no'; return a })(), 'route-impact').ok, false)

  console.log('-- NON-RECORD ROOTS are compared, not merely schema-checked')
  const rootCase = (name, mutate, expectOk) => {
    const a = clone(inv()); mutate(a)
    t(name, run(inv(), a, 'route-impact').ok, expectOk)
  }
  // Each of these was previously invisible.
  rootCase('the worker SOURCE COMMIT changing is a finding', (a) => { a.twinai.src_sha = 'd'.repeat(40) }, false)
  rootCase('the pinned MODEL PATH moving is a finding', (a) => { a.twinai.model_path = '/opt/models/other' }, false)
  rootCase('a ROLLBACK IMAGE disappearing is a finding', (a) => { a.twinaiImages = a.twinaiImages.filter((x) => x.tag !== 'twinai-worker:prev') }, false)
  rootCase('a TwinAI image ID changing under the same tag is a finding', (a) => { a.twinaiImages[0].id = 'sha256:dead' }, false)
  rootCase('a NEW PROXY REFERENCE is a finding', (a) => { a.proxyRefs.push({ proxy: 'nginx', hits: '/etc/nginx/x.conf' }) }, false)
  rootCase('a proxy losing its reference is a finding', (a) => { a.proxyRefs[0].hits = 'none' }, false)
  rootCase('a NEWLY EXPOSED PORT is a finding', (a) => { a.listening.push('LISTEN 0 4096 0.0.0.0:9999 0.0.0.0:* users:(("x",pid=?,fd=3))') }, false)
  rootCase('a port no longer listening is a finding', (a) => { a.listening = a.listening.slice(0, 1) }, false)
  rootCase('the schema version changing is a finding', (a) => { a.schema = 'vps-resource-inventory-2' }, false)
  rootCase('an undeclared key inside twinai is a finding', (a) => { a.twinai.newFact = 'x' }, false)
  rootCase('an undeclared field on a twinaiImages record is a finding', (a) => { a.twinaiImages[0].digest = 'x' }, false)
  // POSITIVE VOLATILITY CONTROLS — the declared noise really is permitted, or
  // every one of the findings above would be unfalsifiable.
  rootCase('CONTROL: a model-cache size change is permitted', (a) => { a.twinai.model_cache_kb = '999999' }, true)
  rootCase('CONTROL: a TwinAI image size/date change is permitted', (a) => { a.twinaiImages[0].size = '9GB'; a.twinaiImages[0].created = 'later' }, true)
  rootCase('CONTROL: fd renumbering, queue depth and reordering in `listening` are permitted', (a) => {
    a.listening = [...a.listening].reverse()
      .map((l) => l.replace('fd=?', 'fd=99').replace('LISTEN 0 4096', 'LISTEN 7 4096'))
  }, true)
  // …and the normalisation must not swallow the thing it exists to protect.
  rootCase('a port change survives that normalisation', (a) => {
    a.listening[0] = a.listening[0].replace('0.0.0.0:80', '0.0.0.0:8080')
  }, false)
  rootCase('a bind-address change survives that normalisation', (a) => {
    a.listening[0] = a.listening[0].replace('0.0.0.0:80', '127.0.0.1:80')
  }, false)
  rootCase('an owning-process change survives that normalisation', (a) => {
    a.listening[0] = a.listening[0].replace('docker-proxy', 'nc')
  }, false)
  rootCase('CONTROL: docker df / disk telemetry is permitted to move', (a) => {
    a.dockerDf[0].total = 1; a.fs.root.usedPct = 12; a.inodes.root.used = 5; a.hostDirs[0].sizeKb = 1
  }, true)

  console.log('-- DERIVED classification is entailed by fields that ARE compared')
  // `class`/`evidence` are not compared. That is only safe because every input
  // the classifier reads is. Each of these mutates one such input.
  for (const [label, mutate] of [
    ['a container image identity', (a) => { ctr(a, 'twinai-worker').imageId = 'sha256:DEAD' }],
    ['a container mount list', (a) => { ctr(a, 'infallible_hawking').mounts = [] }],
    ['an image tag set', (a) => { img(a, 'sha256:prev').tags = [] }],
    ['a volume database marker', (a) => { vol(a, 'dead-vol').dbFiles = '/x/PG_VERSION' }],
    ['a network membership list', (a) => { net(a, 'styliquenet').containers = ['infallible_hawking'] }],
    ['the proxy reference table', (a) => { a.proxyRefs[0].hits = '/etc/caddy/twinai.conf' }],
  ]) {
    const a = clone(inv()); mutate(a)
    t(`a change to ${label} is caught`, run(inv(), a, 'route-impact').ok, false)
  }

  console.log('-- disable-restart: ONLY the policy field')
  const dr = clone(inv()); ctr(dr, TARGET).policy = 'no'
  t('POSITIVE: the exact allowed delta passes', run(inv(), dr, 'disable-restart').ok, true)
  for (const [label, f, v] of [
    ['image identity', 'imageId', 'sha256:DEAD'], ['mounts', 'mounts', []],
    ['networks', 'networks', ['styliquenet']], ['ports', 'ports', '0.0.0.0:9999->9999/tcp'],
    ['memory limit', 'memLimit', 1073741824], ['labels', 'labels', 'x=1'],
    ['status', 'status', 'exited'],
  ]) {
    const bad = clone(dr); ctr(bad, TARGET)[f] = v
    t(`disable-restart cannot hide a ${label} change`, run(inv(), bad, 'disable-restart').ok, false)
  }
  t('disable-restart cannot hide a non-record ROOT change',
    run(inv(), (() => { const a = clone(dr); a.twinai.src_sha = 'e'.repeat(40); return a })(), 'disable-restart').ok, false)

  console.log('-- stop: ONLY the lifecycle fields')
  const st = clone(inv()); const s2 = ctr(st, TARGET)
  s2.status = 'exited'; s2.exitCode = 137; s2.health = 'none'
  t('POSITIVE: the exact allowed delta passes', run(inv(), st, 'stop').ok, true)
  for (const [label, f, v] of [['policy', 'policy', 'no'], ['image', 'imageId', 'sha256:DEAD'], ['mounts', 'mounts', []]]) {
    const bad = clone(st); ctr(bad, TARGET)[f] = v
    t(`stop cannot hide a ${label} change`, run(inv(), bad, 'stop').ok, false)
  }

  console.log('-- remove-container: the container plus ITS endpoints only')
  const stopped = () => { const i = clone(inv()); ctr(i, TARGET).status = 'exited'; return i }
  const rm = clone(stopped())
  rm.containers = rm.containers.filter((c) => c.name !== TARGET)
  for (const n of rm.networks) n.containers = n.containers.filter((x) => x !== TARGET)
  t('POSITIVE: removal plus its own endpoint departures passes', run(stopped(), rm, 'remove-container').ok, true)
  const rmBad = clone(rm)
  net(rmBad, 'styliquenet').containers = []
  t('cannot hide ANOTHER endpoint leaving the same network', run(stopped(), rmBad, 'remove-container').ok, false)
  const rmBad2 = clone(rm); rmBad2.volumes = rmBad2.volumes.filter((v) => v.name !== 'dead-vol')
  t('cannot hide an unrelated resource removal', run(stopped(), rmBad2, 'remove-container').ok, false)
  const rmBad3 = clone(rm); ctr(rmBad3, 'twinai-worker').imageId = 'sha256:DEAD'
  t('cannot hide a change to a surviving container', run(stopped(), rmBad3, 'remove-container').ok, false)

  // BLOCKER: the container's own network list and the network records must agree.
  console.log('-- the two views of an attachment must agree before either authorises anything')
  t('CONTROL: the real inventory is self-consistent', endpointAuthorisations(inv(), TARGET).length, 2)
  t('a network record that omits the target is refused', (() => {
    const b = stopped(); net(b, 'deploy_default').containers = []
    try { authorisationsForStage('remove-container', b, planned(b, 'remove-container')); return false }
    catch (e) { return e instanceof DeltaError }
  })(), true)
  t('a container record that omits a network it is really in is refused', (() => {
    const b = stopped(); ctr(b, TARGET).networks = ['styliquenet']
    try { authorisationsForStage('remove-container', b, planned(b, 'remove-container')); return false }
    catch (e) { return e instanceof DeltaError }
  })(), true)

  console.log('-- reclaim: derived from the TYPED plan, not from parsing commands')
  const gone = () => {
    const i = clone(inv())
    i.containers = i.containers.filter((c) => c.name !== TARGET)
    for (const n of i.networks) n.containers = n.containers.filter((x) => x !== TARGET)
    return i
  }
  const rPlan = planned(gone(), 'reclaim')
  const reclaimed = (() => {
    const a = gone()
    a.images = a.images.filter((i) => !['sha256:bbbb', 'sha256:dang'].includes(i.id))
    a.volumes = a.volumes.filter((v) => v.name !== 'dead-vol')
    a.networks = a.networks.filter((n) => n.name !== 'deploy_default')
    return a
  })()
  t('POSITIVE: exactly the planned resources pass', run(gone(), reclaimed, 'reclaim', rPlan).ok, true)
  t('reclaim gets NO generic container exemption',
    authorisationsForStage('reclaim', gone(), rPlan).some((a) => a.type === 'containers'), false)
  // TAGS vs IDS: a plan that named the image by TAG authorises nothing, because
  // `images` records are keyed by id. The regex parser could not tell.
  t('an image authorisation keyed by a TAG does not authorise the id', (() => {
    const bad = clone(rPlan)
    bad.resources.find((r) => r.key === 'sha256:bbbb').key = 'stylique-os:latest'
    const d = structuralDelta(gone(), reclaimed, authorisationsForStage('reclaim', gone(), bad))
    return d.ok
  })(), false)
  const unplanned = clone(reclaimed)
  unplanned.volumes = unplanned.volumes.filter((v) => v.name !== 'oo-data')
  t('deleting an UNPLANNED resource fails', run(gone(), unplanned, 'reclaim', rPlan).ok, false)
  t('a plan-less mutating stage throws', (() => {
    try { authorisationsForStage('reclaim', gone(), null); return false } catch (e) { return e instanceof DeltaError }
  })(), true)
  t('a plan with no typed manifest throws', (() => {
    try { authorisationsForStage('reclaim', gone(), { cmds: ['docker rmi sha256:bbbb'] }); return false }
    catch (e) { return e instanceof DeltaError }
  })(), true)

  console.log('-- accept: cumulative, re-derived from the baseline')
  const acceptAuths = authorisationsForStage('accept', inv(), null)
  t('accept authorises the container removal', acceptAuths.some((a) => a.op === 'remove' && a.type === 'containers' && a.key === TARGET), true)
  t('accept authorises the planned image deletions', acceptAuths.some((a) => a.type === 'images' && a.key === 'sha256:bbbb'), true)
  t('accept NEVER authorises the active TwinAI image', acceptAuths.some((a) => a.key === 'sha256:0200'), false)
  t('accept NEVER authorises the rollback image', acceptAuths.some((a) => a.key === 'sha256:prev'), false)
  t('accept NEVER authorises the shared oo-data volume', acceptAuths.some((a) => a.key === 'oo-data'), false)
  t('accept does not double-authorise a network it also deletes',
    acceptAuths.filter((a) => a.key === 'deploy_default').length, 1)
  t('POSITIVE: the fully retired host passes accept', run(inv(), reclaimed, 'accept').ok, true)
  const acceptBad = clone(reclaimed); acceptBad.volumes = acceptBad.volumes.filter((v) => v.name !== 'oo-data')
  t('accept catches a deletion the retirement never planned', run(inv(), acceptBad, 'accept').ok, false)
  const acceptBad2 = clone(reclaimed); acceptBad2.twinai.src_sha = 'a'.repeat(40)
  t('accept catches a worker identity change', run(inv(), acceptBad2, 'accept').ok, false)
  t('accept refuses a baseline it cannot re-derive from', (() => {
    const b = clone(inv()); b.images = b.images.filter((i) => i.id !== 'sha256:prev')
    try { authorisationsForStage('accept', b, null); return false } catch (e) { return e instanceof DeltaError }
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
  t('a DERIVED field cannot be authorised', A({ op: 'change', type: 'containers', key: 'x', fields: ['class'] }), true)
  t('an empty field list is rejected', A({ op: 'change', type: 'containers', key: 'x', fields: [] }), true)
  t('duplicate authorisations are rejected', validateAuthorisations([
    { op: 'remove', type: 'images', key: 'i' }, { op: 'remove', type: 'images', key: 'i' }]).length > 0, true)
  t('CONTROL: a well-formed authorisation is accepted',
    A({ op: 'change', type: 'containers', key: TARGET, fields: ['policy'] }), false)

  console.log('-- inventory schema')
  const badRoot = clone(inv()); badRoot.somethingNew = { a: 1 }
  t('an unknown ROOT key fails', run(inv(), badRoot, 'route-impact').ok, false)
  for (const k of REQUIRED_ROOTS) {
    const missing = clone(inv()); delete missing[k]
    t(`a truncated inventory missing "${k}" fails`, run(inv(), missing, 'route-impact').ok, false)
  }
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

  console.log('-- plan binding (the comparator refuses a plan that is not this run\'s)')
  const bind = (over = {}) => verifyPlanBinding(rPlan, { stage: 'reclaim', ...BIND, ...over })
  t('CONTROL: this run\'s plan verifies', bind().length, 0)
  t('another stage\'s plan is refused', bind({ stage: 'stop' }).length > 0, true)
  t('another commit\'s plan is refused', bind({ candidateSha: 'd'.repeat(40) }).length > 0, true)
  t('a stale before-inventory is refused', bind({ beforeInventorySha256: 'e'.repeat(64) }).length > 0, true)

  if (failed) { console.error(`structural-delta selftest: ${failed} failed`); process.exit(1) }
  console.log('structural-delta selftest: all cases passed'); process.exit(0)
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (!isEntry) { /* imported for its exports */ }
else if (process.argv.includes('--selftest')) await selftest()
else {
  const argv = process.argv.slice(2)
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
  const FLAGS = ['--stage', '--plan', '--candidate-sha']
  const [beforeF, afterF] = argv.filter((x, i) => !x.startsWith('--') && !FLAGS.includes(argv[i - 1]))
  const stage = flag('--stage')
  const planF = flag('--plan')
  const candidateSha = flag('--candidate-sha') ?? process.env.GITHUB_SHA ?? ''
  if (!beforeF || !afterF || !stage) {
    console.error('usage: assert_structural_delta.mjs <before.json> <after.json> --stage <stage> [--plan plan.json]')
    process.exit(2)
  }
  // BOTH FILES ARE REQUIRED. The previous workflow step skipped itself when an
  // inventory was missing — most dangerous exactly when a mutation ran and the
  // after-collection failed. Missing evidence fails; it does not skip.
  let beforeText; let before; let after; let plan = null
  try { beforeText = readFileSync(beforeF, 'utf8'); before = JSON.parse(beforeText) }
  catch (e) { console.error(`::error::before inventory ${beforeF} is missing or invalid: ${e.message}`); process.exit(1) }
  try { after = JSON.parse(readFileSync(afterF, 'utf8')) }
  catch (e) { console.error(`::error::after inventory ${afterF} is missing or invalid: ${e.message}`); process.exit(1) }
  if (planF !== null) {
    try { plan = JSON.parse(readFileSync(planF, 'utf8')) }
    catch (e) { console.error(`::error::plan ${planF} is missing or invalid: ${e.message}`); process.exit(1) }
    if (!candidateSha) { console.error('::error::no candidate commit to verify the plan against'); process.exit(1) }
    const problems = verifyPlanBinding(plan, { stage, candidateSha, beforeInventorySha256: sha256(beforeText) })
    if (problems.length > 0) {
      for (const p of problems) console.error(`::error::the plan does not belong to this run: ${p}`)
      process.exit(1)
    }
  }
  let auths; let d
  try {
    auths = authorisationsForStage(stage, before, plan)
    d = structuralDelta(before, after, auths)
  } catch (e) { console.error(`::error::structural delta could not be computed: ${e.message}`); process.exit(1) }
  console.log(render(d, {
    stage,
    candidateSha: candidateSha || '(unset)',
    beforeInventorySha256: sha256(beforeText),
    planSha256: plan === null ? '(no plan)' : String(plan.planSha256),
    authorisations: JSON.stringify(auths),
  }))
  if (!d.ok) { console.error('::error::the host changed structurally in a way this stage did not authorise'); process.exit(1) }
}
