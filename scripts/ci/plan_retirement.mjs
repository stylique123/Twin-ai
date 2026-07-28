// Turn a FRESH classified inventory into an explicit, bounded retirement plan.
//
// THE CENTRAL SAFETY PROPERTY: the deletion list is DERIVED from the live
// classification at execution time. It is never hand-typed, never carried over
// from an earlier run, and never widened by a name pattern. If the host changed
// since the last look, the plan changes with it — or refuses.
//
// The plan may only ever touch resources classed `retire-scope` or
// `proven-orphaned`. Anything else — active-twinai, twinai-rollback,
// shared-do-not-touch, unknown-do-not-touch — is unreachable by construction:
// emit() throws rather than skipping, so a misclassification is a hard stop and
// not a silently smaller plan.
//
// THE TARGET SET IS IMPORTED, NOT RESTATED. It used to be one hardcoded string
// here and another in the classifier; two lists that must agree are a list that
// will eventually disagree, and the failure would be silent in the worst
// direction — the classifier marking something deletable that the planner never
// plans, or the planner naming something the classifier never cleared.
//
// PRECONDITIONS, all fail-closed:
//   * twinai-worker present and classed active-twinai
//   * at least one twinai-rollback image retained
//   * every container acted on is in the imported retirement set and classed
//     deletable — a listed container the classifier declined to clear stops the
//     run rather than being acted on anyway
//   * no volume marked for deletion is mounted by any surviving container
//
// THE PLAN IS TYPED, AND THE COMMAND IS DERIVED FROM THE TYPE — NOT THE OTHER
// WAY ROUND. Every entry in `resources` states an OPERATION, a resource TYPE and
// an EXACT key, and carries the argv that performs it. The executor runs that
// argv; the structural comparator authorises exactly that operation on exactly
// that key. Both read the same object, so "what ran" and "what was permitted to
// change" cannot describe different things.
//
// The previous design shipped only command STRINGS, and the comparator recovered
// authorisations by matching `/^docker rmi (\S+)$/` against them. That is a
// parser for a language the planner never promised to speak: `docker rmi -f <id>`
// or a second argument matches nothing, the authorisation silently disappears,
// and the difference between "this deletion was approved" and "this regex did not
// fire" is invisible. Types remove the parser.
//
// The plan is then SEALED: its typed manifest is hashed, and bound to the stage,
// the candidate commit and the digest of the exact BEFORE inventory it was
// derived from. A plan edited after sealing, replayed against a different
// inventory, or reused for another stage or another commit, fails to verify.
//
//   node scripts/ci/plan_retirement.mjs <inventory.json> <stage> [--json out] [--candidate-sha X]
//   node scripts/ci/plan_retirement.mjs --selftest
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { RETIRE_CTRS } from './build_resource_inventory.mjs'

// Every stage the plan step may be asked to plan for. `observe` and `accept`
// never reach this script — the workflow skips the plan step for them — but
// every OTHER dispatchable stage must be here, including the read-only ones.
// A stage the workflow accepts and this table does not is a refusal at plan
// time, and a refusal is only safe if it is actually seen: run 30290680691
// dispatched `pre-stop-audit`, this threw `unknown stage`, and `| tee` in the
// workflow swallowed the non-zero exit so the step named "fail closed" reported
// success. check_vps_retire_safety.mjs now proves this table and the workflow's
// authorisation arms cannot drift apart again.
export const STAGES = ['manifest', 'pre-stop-audit', 'route-impact', 'chrome-exposure', 'stack-dependency', 'reclaim-build-cache', 'disable-restart', 'stop', 'remove-container', 'reclaim']
/** Stages that plan NO commands. They are here to be known, not to act. */
export const READ_ONLY_STAGES = new Set(['manifest', 'pre-stop-audit', 'route-impact', 'chrome-exposure', 'stack-dependency'])
/**
 * The containers this plan retires, IN REMOVAL ORDER, imported from the one
 * place that decides it. Caddy first: it is the edge that still routes to
 * stylique-os, and every later member is unblocked by it having gone.
 */
export const TARGETS = RETIRE_CTRS
const TWINAI = 'twinai-worker'
const DELETABLE = new Set(['retire-scope', 'proven-orphaned'])

export class PlanError extends Error {}

/**
 * Canonical JSON. Key order is fixed, so a digest means the same thing in the
 * process that seals a plan and in the process that verifies it. Exported so
 * there is exactly ONE implementation — two canonicalisers that disagree on
 * anything produce a tamper alarm on an untampered plan, and people then learn
 * to pass `--force`.
 */
export function canonJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonJson).join(',')}]`
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonJson(v[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}
export const sha256hex = (s) => createHash('sha256').update(s).digest('hex')


/**
 * THE CLOSED COMMAND CATALOG — the only shell this tooling can ever produce.
 *
 * THE DEFECT THIS CLOSES. A sealed plan used to carry `argv` as an INDEPENDENT
 * field alongside the typed tuple, and verifyPlanBinding checked each separately:
 * that op/type/key/fields were well-formed, and that argv was a non-empty array
 * of strings. Nothing tied them together. A resource could claim
 *
 *     { op:'remove', type:'images', key:'sha256:A', argv:['docker','volume','rm','B'] }
 *
 * and pass every check. Both digests covered it, because digests only prove the
 * bytes were not edited after sealing — never that the semantic tuple describes
 * the command. The executor would then delete VOLUME B while the comparator
 * authorised removing IMAGE A. The structural delta would go red afterwards, on
 * the unauthorised removal and the unexercised authorisation — but the volume
 * would already be gone. A guard that reports the deletion it failed to prevent
 * is not the guard this was supposed to be.
 *
 * So argv is no longer an input. It is DERIVED from the tuple, at execution, by
 * this table. There is nothing left for the two to disagree about, and a command
 * family that is not in this table cannot be produced at all.
 *
 * The stage list on each entry is the second half: a command may be correct in
 * form and still belong to another stage. `journalctl --vacuum-size` is a legal
 * command that `reclaim-build-cache` has no business running.
 */
export const REMOVE_COMMANDS = {
  containers: { argv: (k) => ['docker', 'rm', k], stages: ['remove-container'] },
  images: { argv: (k) => ['docker', 'rmi', k], stages: ['reclaim'] },
  volumes: { argv: (k) => ['docker', 'volume', 'rm', k], stages: ['reclaim'] },
  networks: { argv: (k) => ['docker', 'network', 'rm', k], stages: ['reclaim'] },
}

/** Field-set -> command. The declared structural effect selects the verb. */
export const CHANGE_COMMANDS = [
  { fields: ['policy'], argv: (k) => ['docker', 'update', '--restart=no', k], stages: ['disable-restart'] },
  { fields: ['status', 'exitCode', 'health'], argv: (k) => ['docker', 'stop', '--time', '30', k], stages: ['stop'] },
]

/** Commands that touch no inventory record. Named, so `none` is not a blank cheque. */
export const BARE_COMMANDS = {
  'builder-prune': { argv: ['docker', 'builder', 'prune', '--all', '--force'], stages: ['reclaim-build-cache', 'reclaim'] },
  'journal-vacuum': { argv: ['journalctl', '--vacuum-size=200M'], stages: ['reclaim'] },
}

/** Exactly the fields a plan resource may carry. Anything else is a refusal. */
const RESOURCE_FIELDS = ['op', 'type', 'key', 'fields', 'command', 'argv']
/** Exactly the fields a sealed plan may carry. */
const PLAN_FIELDS = ['stage', 'resources', 'cmds', 'notes', 'backups', 'record', 'binding', 'resourcesSha256', 'planSha256']

/**
 * The one derivation. Returns the argv this typed resource MEANS, for this
 * stage, or throws with the exact reason it cannot mean anything.
 */
export function deriveArgv(stage, r) {
  const bad = (m) => { throw new PlanError(m) }
  if (r === null || typeof r !== 'object' || Array.isArray(r)) bad('a plan resource is not an object')
  for (const k of Object.keys(r)) {
    if (!RESOURCE_FIELDS.includes(k)) bad(`plan resource carries unexpected field ${JSON.stringify(k)}`)
  }

  if (r.op === 'none') {
    if (r.type !== null || r.key !== null) bad(`a "none" resource names ${r.type}/${r.key}; it must name no record`)
    if (r.fields !== null && r.fields !== undefined) bad('a "none" resource declares fields')
    const entry = BARE_COMMANDS[r.command]
    if (entry === undefined) bad(`unknown bare command ${JSON.stringify(r.command)}`)
    if (!entry.stages.includes(stage)) {
      bad(`command ${JSON.stringify(r.command)} is not permitted in stage ${JSON.stringify(stage)} (only ${entry.stages.join(', ')})`)
    }
    return [...entry.argv]
  }

  if (r.command !== undefined && r.command !== null) bad(`resource ${r.op}/${r.type}/${r.key} names a bare command as well as a record`)
  if (typeof r.key !== 'string' || r.key.length === 0 || r.key === '*' || /\s/.test(r.key)) {
    bad(`resource ${r.op}/${r.type} must name one exact resource (got ${JSON.stringify(r.key)})`)
  }

  if (r.op === 'remove') {
    if (r.fields !== null && r.fields !== undefined) bad(`a removal of ${r.type}/${r.key} declares fields`)
    const entry = REMOVE_COMMANDS[r.type]
    if (entry === undefined) bad(`cannot remove unknown type ${JSON.stringify(r.type)}`)
    if (!entry.stages.includes(stage)) {
      bad(`stage ${JSON.stringify(stage)} may not remove a ${r.type} (only ${entry.stages.join(', ')} may)`)
    }
    return entry.argv(r.key)
  }

  if (r.op === 'change') {
    if (r.type !== 'containers') bad(`only a container can be changed, not a ${r.type}`)
    if (!Array.isArray(r.fields) || r.fields.length === 0) bad(`a change to ${r.key} names no fields`)
    const want = canonJson([...r.fields].sort())
    const entry = CHANGE_COMMANDS.find((cc) => canonJson([...cc.fields].sort()) === want)
    if (entry === undefined) {
      bad(`no command in the catalog produces exactly the field set [${r.fields.join(', ')}] — `
        + 'a declared effect with no corresponding command cannot be executed or authorised')
    }
    if (!entry.stages.includes(stage)) {
      bad(`stage ${JSON.stringify(stage)} may not change [${r.fields.join(', ')}] (only ${entry.stages.join(', ')} may)`)
    }
    return entry.argv(r.key)
  }

  bad(`unknown plan operation ${JSON.stringify(r.op)}`)
  return []
}

/** Every argv a sealed plan implies, derived — never read from the plan. */
export function derivePlanCommands(plan) {
  if (plan === null || typeof plan !== 'object') throw new PlanError('the plan is not an object')
  if (!Array.isArray(plan.resources)) throw new PlanError('the plan carries no typed resource manifest')
  return plan.resources.map((r) => deriveArgv(plan.stage, r))
}

/** Operations a plan entry may declare. `none` touches no inventory record. */
export const PLAN_OPS = ['change', 'remove', 'none']
/** Record types a plan entry may name. Exactly the inventory's record roots. */
export const PLAN_TYPES = ['containers', 'images', 'volumes', 'networks']

/**
 * Seal a plan: hash the typed manifest, and bind it to the stage, the candidate
 * commit and the BEFORE inventory it was derived from.
 *
 * `beforeInventorySha256` is over the inventory FILE BYTES, which is what the
 * comparator re-hashes. Anything else would compare two different things and
 * quietly always agree.
 */
export function sealPlan(p, { candidateSha, beforeInventorySha256 }) {
  for (const [k, v] of Object.entries({ candidateSha, beforeInventorySha256 })) {
    if (typeof v !== 'string' || v.length === 0) throw new PlanError(`sealPlan: ${k} is required to bind the plan`)
  }
  const binding = { stage: p.stage, candidateSha, beforeInventorySha256 }
  return {
    ...p,
    binding,
    resourcesSha256: sha256hex(canonJson(p.resources)),
    planSha256: sha256hex(canonJson({ stage: p.stage, resources: p.resources, binding })),
  }
}

/**
 * Verify a sealed plan against the run that is about to use it. Returns the list
 * of problems; empty means the plan is the one this stage, this commit and this
 * inventory produced, unmodified.
 */
export function verifyPlanBinding(plan, { stage, candidateSha, beforeInventorySha256 }) {
  if (plan === null || typeof plan !== 'object' || Array.isArray(plan)) return ['the plan is not a JSON object']
  const problems = []

  for (const k of Object.keys(plan)) {
    if (!PLAN_FIELDS.includes(k)) problems.push(`the plan carries unexpected top-level field ${JSON.stringify(k)}`)
  }
  if (plan.stage !== stage) problems.push(`the plan was built for stage ${JSON.stringify(plan.stage)}, this run is ${JSON.stringify(stage)}`)

  const b = plan.binding
  if (b === null || typeof b !== 'object' || Array.isArray(b)) {
    problems.push('the plan carries no binding — it cannot be shown to belong to this run')
  } else {
    for (const k of Object.keys(b)) {
      if (!['stage', 'candidateSha', 'beforeInventorySha256'].includes(k)) {
        problems.push(`the binding carries unexpected field ${JSON.stringify(k)}`)
      }
    }
    if (b.stage !== stage) problems.push(`the plan is bound to stage ${JSON.stringify(b.stage)}, this run is ${JSON.stringify(stage)}`)
    // A candidate commit is a 40-hex object name. Anything else is not a commit,
    // and a binding to a non-commit binds to nothing.
    if (typeof b.candidateSha !== 'string' || !/^[0-9a-f]{40}$/.test(b.candidateSha)) {
      problems.push(`the plan's candidate commit ${JSON.stringify(b.candidateSha)} is not a 40-character hex object name`)
    }
    if (typeof candidateSha !== 'string' || !/^[0-9a-f]{40}$/.test(candidateSha)) {
      problems.push(`this run's candidate commit ${JSON.stringify(candidateSha)} is not a 40-character hex object name`)
    } else if (b.candidateSha !== candidateSha) {
      problems.push(`the plan was generated by commit ${JSON.stringify(b.candidateSha)}, this run is ${JSON.stringify(candidateSha)}`)
    }
    if (typeof b.beforeInventorySha256 !== 'string' || !/^[0-9a-f]{64}$/.test(b.beforeInventorySha256)) {
      problems.push(`the plan's before-inventory digest ${JSON.stringify(b.beforeInventorySha256)} is not a sha256`)
    } else if (b.beforeInventorySha256 !== beforeInventorySha256) {
      problems.push(
        'the plan was generated against a DIFFERENT before-inventory '
        + `(plan ${JSON.stringify(b.beforeInventorySha256)}, this run ${JSON.stringify(beforeInventorySha256)}) — `
        + 'a plan derived from a host that has since changed authorises deletions nobody re-checked',
      )
    }
  }

  if (!Array.isArray(plan.resources)) {
    problems.push('the plan carries no typed resource manifest')
    return problems
  }
  if (plan.resourcesSha256 !== sha256hex(canonJson(plan.resources))) {
    problems.push('the typed resource manifest does not match its own digest — the plan was modified after it was sealed')
  }
  if (b !== null && typeof b === 'object' && !Array.isArray(b)
      && plan.planSha256 !== sha256hex(canonJson({ stage: plan.stage, resources: plan.resources, binding: b }))) {
    problems.push('the plan digest does not match the plan — it was modified after it was sealed')
  }

  // THE BIJECTION. Every resource's argv must be EXACTLY what the closed catalog
  // derives from its typed tuple for this stage. This is the check whose absence
  // let a tuple naming one resource carry a command deleting another.
  const seen = new Set()
  for (const r of plan.resources) {
    let derived
    try { derived = deriveArgv(stage, r) }
    catch (e) { problems.push(`refusing this plan resource: ${e.message}`); continue }

    // No target may appear twice: two removals of the same key, or the same bare
    // command emitted twice, are a malformed plan, not a stronger one.
    const target = r.op === 'none' ? `none:${r.command}` : `${r.op}:${r.type}:${r.key}`
    if (seen.has(target)) problems.push(`the plan names ${target} more than once`)
    seen.add(target)

    if (!Array.isArray(r.argv)) { problems.push(`plan resource ${target} carries no argv to compare`); continue }
    if (canonJson(r.argv) !== canonJson(derived)) {
      problems.push(
        `plan resource ${target} does not describe the command it carries: `
        + `the typed operation means [${derived.join(' ')}] but the plan stores [${r.argv.join(' ')}]`,
      )
    }
  }
  return problems
}

/** Single-quote one argv element for a POSIX shell. */
export const shQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`

// Docker's own accounting is the authority on build cache: `active` is how many
// entries a running build depends on. Reclaiming with active > 0 could evict a
// layer something is mid-way through using.
function buildCacheReclaimable(inv) {
  const bc = inv.dockerDf.find((d) => /build cache/i.test(d.type))
  if (!bc) return null
  return { entries: bc.total, active: bc.active, size: bc.size, reclaimable: bc.reclaimable }
}

export function plan(inv, stage) {
  if (!STAGES.includes(stage)) throw new PlanError(`unknown stage: ${stage}`)

  // ---- preconditions -------------------------------------------------------
  const worker = inv.containers.find((c) => c.name === TWINAI)
  if (!worker) throw new PlanError(`precondition failed: ${TWINAI} is not present on this host`)
  if (worker.class !== 'active-twinai') throw new PlanError(`precondition failed: ${TWINAI} is classed ${worker.class}`)
  const rollback = inv.images.filter((i) => i.class === 'twinai-rollback')
  if (rollback.length === 0) throw new PlanError('precondition failed: no twinai-rollback image retained — a bad deploy would be unrecoverable')

  // Present targets, IN REMOVAL ORDER — the order of TARGETS, never the order
  // the inventory happened to list them in. A plan whose command order depends
  // on how `docker ps` sorted its output is a plan whose safety depends on
  // something nobody controls.
  const targets = TARGETS.map((n) => inv.containers.find((c) => c.name === n)).filter(Boolean)
  const absent = TARGETS.filter((n) => !inv.containers.some((c) => c.name === n))
  const resources = []
  const notes = []
  // `cmds` is DERIVED from the typed manifest at the end of this function, so a
  // command and the operation it is authorised as can never describe different
  // things. It exists for humans reading plan.txt.
  const done = () => ({ stage, resources, cmds: resources.map((r) => r.argv.join(' ')), notes, backups: [] })

  // Every acting resource goes through here. One outside DELETABLE cannot reach
  // the plan even by mistake — this throws instead of skipping, so a
  // misclassification stops the run rather than quietly shrinking it.
  const emit = (cls, what, r) => {
    if (!DELETABLE.has(cls)) throw new PlanError(`refusing to act on "${what}": classed ${cls}, which is not deletable`)
    resources.push(r)
  }
  /** A command that touches NO inventory record, and so authorises nothing. */
  const bare = (command) => resources.push({
    op: 'none', type: null, key: null, fields: null, command,
    argv: [...BARE_COMMANDS[command].argv],
  })

  // `pre-stop-audit` plans nothing. Its evidence is the probe's verdict, not a
  // command list, so the honest plan is an empty one. It still runs the
  // preconditions above on purpose: a host whose twinai-worker is missing or
  // misclassified is not a host to be auditing a retirement on.
  if (stage === 'pre-stop-audit' || stage === 'route-impact') {
    notes.push('read-only stage: no command is planned; the evidence is the probe verdict')
    for (const n of absent) notes.push(`${n} is not present on this host`)
    return done()
  }

  if (stage === 'manifest') {
    // Read + backup only. Nothing here mutates.
    if (targets.length === 0) { notes.push('no retirement-set container is present — nothing to record'); return done() }
    for (const n of absent) notes.push(`already absent: ${n}`)
    const exclusive = inv.volumes.filter((v) => v.class === 'retire-scope')
    // A volume the classifier held back BECAUSE a retiring container mounts it
    // alongside something that survives. Naming it is the point: this is the
    // list a reader checks to see what the retirement deliberately left behind.
    const shared = inv.volumes.filter((v) => v.class === 'shared-do-not-touch'
      && TARGETS.some((n) => new RegExp(`(^|[ ,(])${n}([ ,)]|$)`).test(v.evidence)))
    for (const v of shared) notes.push(`SHARED VOLUME, will NOT be deleted: ${v.name} (${v.evidence})`)
    return {
      ...done(),
      // Backups are taken for host-local persistent data only, and only for
      // volumes this run would later delete.
      backups: exclusive.map((v) => ({ volume: v.name, mountpoint: v.mountpoint, sizeKb: v.sizeKb })),
      record: {
        // ROLLBACK EVIDENCE, one entry per container, keyed by name. A single
        // `container` object could only ever describe one of five, and the four
        // it omitted would be unreconstructable.
        containers: targets.map((t) => ({
          container: { name: t.name, image: t.imageRef, imageId: t.imageId, status: t.status, restarts: t.restarts, policy: t.policy, created: t.created, exitCode: t.exitCode, health: t.health },
          mounts: t.mounts, networks: t.networks, ports: t.ports, labels: t.labels, project: t.project,
        })),
        absent,
        images: inv.images.filter((i) => i.class === 'retire-scope').map((i) => ({ id: i.id, tags: i.tags, repoDigests: i.repoDigests, sizeBytes: i.sizeBytes })),
        networksOwned: inv.networks.filter((n) => n.class === 'retire-scope').map((n) => n.name),
        volumesOwned: exclusive.map((v) => v.name),
        volumesShared: shared.map((v) => ({ name: v.name, evidence: v.evidence })),
      },
    }
  }

  // ---- BUILD CACHE ONLY, AND DELIBERATELY OUT OF SEQUENCE -------------------
  //
  // The disk pressure this whole retirement exists to relieve is 84% used with
  // 23 GiB free against a 30 GiB target. The single largest consumer is Docker
  // BUILD CACHE — 68.3 GB, of which Docker itself reports 65.1 GB reclaimable
  // and ZERO active. Reclaiming it alone clears the threshold.
  //
  // None of that has anything to do with stylique-os, its volumes, or the Caddy
  // route still pointing at it. Those are a genuinely hard problem — the host
  // and container Caddyfiles diverge and no route could be parsed — and leaving
  // 60 GiB of provably-unused cache trapped behind that investigation is a
  // sequencing accident, not a safety property.
  //
  // So this stage does exactly one thing and authorises NOTHING. `builder prune`
  // reaches the build cache only: no image, volume, network or container record
  // may change, and the structural comparator is given an empty authorisation
  // set precisely so that any record that does move is a failure. The container
  // being retired may still be present and running; this stage does not care and
  // must never be made to.
  //
  // NOT `docker system prune`: that would also sweep the dangling images,
  // stopped containers and unused networks this plan deliberately refuses to
  // touch without classification.
  if (stage === 'reclaim-build-cache') {
    const bc = buildCacheReclaimable(inv)
    if (!bc) throw new PlanError('refusing: docker system df reported no build-cache row, so there is no evidence of what would be reclaimed')
    if (bc.active > 0) {
      throw new PlanError(`refusing: ${bc.active} build-cache entries are ACTIVE — a running build depends on them`)
    }
    if (bc.entries === 0) throw new PlanError('refusing: the build cache is already empty — nothing to reclaim')
    bare('builder-prune')
    notes.push(`build cache: ${bc.entries} entries, 0 active, ${bc.size} total, ${bc.reclaimable} reclaimable`)
    notes.push('touches the build cache ONLY: no container, image, volume or network record may change')
    notes.push(targets.length
      ? `present and NOT acted on by this stage: ${targets.map((t) => `${t.name} (${t.status})`).join(', ')}`
      : 'no retirement-set container is present; irrelevant to this stage')
    notes.push('NOT REVERSIBLE, and does not need to be: build cache is regenerable by rebuilding. No application data is touched.')
    return done()
  }

  // The container must exist for the stages that ACT ON IT. `reclaim` is the
  // opposite case: it runs only once the container is already gone, and its own
  // guard below refuses if it is still there.
  if (targets.length === 0 && stage !== 'reclaim') {
    throw new PlanError('no retirement-set container is present on this host — nothing to retire')
  }
  for (const n of absent) notes.push(`already absent, not acted on: ${n}`)

  // The `fields` on a change are the structural effect the stage DECLARES. The
  // comparator permits those and nothing else on that record, so a stop that
  // also swapped the image is a failure rather than a footnote.
  if (stage === 'disable-restart') {
    // Reversible: `docker update --restart=unless-stopped` restores it.
    // A container already on `no` is planned anyway: the command is idempotent,
    // and SKIPPING it would make the plan depend on the current policy, so a
    // re-run after a partial failure would emit a different plan than the one
    // that was reviewed.
    for (const t of targets) {
      emit(t.class, t.name, {
        op: 'change', type: 'containers', key: t.name, fields: ['policy'],
        argv: ['docker', 'update', '--restart=no', t.name],
      })
      notes.push(`reversible: docker update --restart=${t.policy.split(':')[0]} ${t.name}`)
    }
  }

  if (stage === 'stop') {
    for (const t of targets) {
      emit(t.class, t.name, {
        op: 'change', type: 'containers', key: t.name, fields: ['status', 'exitCode', 'health'],
        argv: ['docker', 'stop', '--time', '30', t.name],
      })
      notes.push(`reversible: docker start ${t.name}`)
    }
  }

  if (stage === 'remove-container') {
    // EVERY target is checked before ANY is planned. Emitting as we go would
    // build a partial plan and then throw, and the reviewer would be reading a
    // command list that the run had already refused to be a complete version of.
    const live = targets.filter((t) => t.status === 'running' || t.status === 'restarting')
    if (live.length) {
      throw new PlanError(`refusing to remove ${live.map((t) => `${t.name} (${t.status})`).join(', ')}`
        + ' — run the stop stage first and observe TwinAI health')
    }
    for (const t of targets) {
      // NEVER `-v`: volumes are deleted only by `reclaim`, and only after the
      // independent surviving-mounter check there.
      emit(t.class, t.name, {
        op: 'remove', type: 'containers', key: t.name, fields: null, argv: ['docker', 'rm', t.name],
      })
    }
    notes.push('no -v flag: volumes are handled separately, and only after the shared-mount check')
  }

  if (stage === 'reclaim') {
    // ALL of them, not any of them. A surviving retirement-set container still
    // holds images, mounts volumes and joins networks that this stage is about
    // to delete, and the classification that cleared them was computed while it
    // was still gone from nothing.
    const remaining = TARGETS.filter((n) => inv.containers.some((c) => c.name === n))
    if (remaining.length) {
      throw new PlanError(`refusing to reclaim while ${remaining.join(', ')} still exist${remaining.length === 1 ? 's' : ''} — remove them first`)
    }
    // Images: stylique-os-classed, and dangling ones. Individually, BY ID.
    //
    // The id is both the argv argument and the typed key, so the thing deleted
    // and the thing authorised are the same string by construction. A tag would
    // be neither: `images` records are keyed by id, so a tag-keyed authorisation
    // matches no record and the deletion reads as unauthorised.
    for (const i of inv.images.filter((x) => DELETABLE.has(x.class))) {
      emit(i.class, i.tags.join(',') || i.id, {
        op: 'remove', type: 'images', key: i.id, fields: null, argv: ['docker', 'rmi', i.id],
      })
    }
    // Networks: only ones with nothing attached or only the retired container.
    for (const n of inv.networks.filter((x) => DELETABLE.has(x.class) && !['bridge', 'host', 'none'].includes(x.name))) {
      emit(n.class, n.name, {
        op: 'remove', type: 'networks', key: n.name, fields: null, argv: ['docker', 'network', 'rm', n.name],
      })
    }
    // Volumes: a second, INDEPENDENT mount check on top of the classification.
    // Two agreeing checks, because this is the only irreversible data deletion.
    const mounted = new Set(inv.containers.flatMap((c) => c.mounts.filter((m) => m.type === 'volume').map((m) => m.name)))
    for (const v of inv.volumes.filter((x) => DELETABLE.has(x.class))) {
      if (mounted.has(v.name)) throw new PlanError(`refusing to delete volume ${v.name}: still mounted by a surviving container`)
      if (v.dbFiles) throw new PlanError(`refusing to delete volume ${v.name}: contains database files (${v.dbFiles})`)
      emit(v.class, v.name, {
        op: 'remove', type: 'volumes', key: v.name, fields: null, argv: ['docker', 'volume', 'rm', v.name],
      })
    }
    // Build cache. NOT `docker system prune` — that would also sweep resources
    // this plan deliberately refused to touch. `builder prune` reaches the build
    // cache only, and only when Docker itself reports zero active entries.
    const bc = buildCacheReclaimable(inv)
    if (bc && bc.active === 0 && bc.entries > 0) {
      bare('builder-prune')
      notes.push(`build cache: ${bc.entries} entries, 0 active, ${bc.size} total, ${bc.reclaimable} reclaimable`)
    } else if (bc && bc.active > 0) {
      notes.push(`build cache NOT reclaimed: ${bc.active} entries are active`)
    }
    // Journal is host log data, not application data: bound it, never delete
    // application state.
    bare('journal-vacuum')
    notes.push('journal vacuumed to 200M (host logs only; no application data)')
  }

  return done()
}

// ------------------------------------------------------------------ selftest
function selftest() {
  let failed = 0
  const t = (name, fn, expectThrow) => {
    let threw = null
    try { fn() } catch (e) { threw = e }
    const ok = expectThrow ? threw instanceof PlanError : threw === null
    if (ok) console.log(`  ok: ${name}`)
    else { console.error(`SELFTEST FAIL: ${name} — ${threw ? threw.message : 'did not throw'}`); failed++ }
  }

  // A container record for a member of the retirement set. Defaults are the
  // stopped, already-audited state; individual tests override what they mean to
  // exercise.
  const ctr = (name, over = {}) => ({
    name, class: 'retire-scope', mounts: [], status: 'exited', restarts: 0,
    policy: 'unless-stopped:0', imageRef: `${name}:latest`, imageId: `sha256:${name}`,
    created: 'c', exitCode: 0, health: 'none', networks: [], ports: '', labels: '',
    project: null, ...over,
  })

  // The fixture carries EVERY member of the imported retirement set, built from
  // TARGETS rather than listed by hand. A hand-written fixture would keep
  // passing after the set changed, and would be testing a host that no longer
  // matches the one the planner will act on.
  const base = () => ({
    containers: [
      { name: TWINAI, class: 'active-twinai', mounts: [], status: 'running', networks: [] },
      ...TARGETS.map((n) => ctr(n, n === 'stylique-os'
        ? { mounts: [{ type: 'volume', name: 'oo-data' }], restarts: 23082, imageRef: 'stylique-os:latest', imageId: 'sha256:b', exitCode: 1, health: 'unhealthy', networks: ['sonet'] }
        : {})),
    ],
    images: [
      { id: 'sha256:a', tags: ['twinai-worker:latest'], repoDigests: [], sizeBytes: 1, class: 'active-twinai' },
      { id: 'sha256:p', tags: ['twinai-worker:prev'], repoDigests: [], sizeBytes: 1, class: 'twinai-rollback' },
      { id: 'sha256:s', tags: ['stylique-os:v1'], repoDigests: [], sizeBytes: 1, class: 'retire-scope' },
      { id: 'sha256:z', tags: ['postgres:17-alpine'], repoDigests: [], sizeBytes: 1, class: 'unknown-do-not-touch' },
    ],
    volumes: [
      // Shared with a container OUTSIDE the retirement set, so it stays.
      { name: 'oo-data', class: 'shared-do-not-touch', evidence: 'mounted by stylique-os,postiz', dbFiles: '' },
      { name: 'dead', class: 'proven-orphaned', evidence: 'x', dbFiles: '' },
      { name: 'pgdata', class: 'unknown-do-not-touch', evidence: 'mounted by postiz-postgres', dbFiles: '/v/pg/PG_VERSION' },
    ],
    networks: [{ id: 'n1', name: 'sonet', class: 'retire-scope', containers: ['stylique-os'] }],
    dockerDf: [{ type: 'Build Cache', total: 380, active: 0, size: '68.3GB', reclaimable: '65.1GB' }],
  })

  t('manifest stage works', () => plan(base(), 'manifest'), false)
  t('stop stage works', () => plan(base(), 'stop'), false)

  // The stage whose absence from STAGES threw `unknown stage` on run
  // 30290680691. It must be KNOWN, must plan nothing, and must still be subject
  // to the preconditions — a read-only stage that skipped them would be a
  // second, weaker path through this file.
  t('pre-stop-audit is a known stage', () => plan(base(), 'pre-stop-audit'), false)
  t('route-impact is a known stage', () => plan(base(), 'route-impact'), false)
  t('an unknown stage still throws', () => plan(base(), 'not-a-stage'), true)
  t('pre-stop-audit still enforces the preconditions', () => {
    const i = base(); i.containers = i.containers.filter((c) => c.name !== TWINAI)
    return plan(i, 'pre-stop-audit')
  }, true)

  // PRECONDITIONS
  t('missing twinai-worker aborts', () => {
    const i = base(); i.containers = i.containers.filter((c) => c.name !== TWINAI); return plan(i, 'stop')
  }, true)
  t('no rollback image aborts', () => {
    const i = base(); i.images = i.images.filter((x) => x.class !== 'twinai-rollback'); return plan(i, 'stop')
  }, true)
  t('removing a RUNNING container aborts', () => {
    const i = base(); i.containers[1].status = 'running'; return plan(i, 'remove-container')
  }, true)
  t('…and so does the LAST target being running, not just the first', () => {
    const i = base(); i.containers[i.containers.length - 1].status = 'running'
    return plan(i, 'remove-container')
  }, true)
  // THE DECISION SELECTS CANDIDATES; THE CLASSIFICATION HAS THE VETO.
  // Being on the founder's list is what makes a container a candidate. Being
  // classed deletable is what makes acting on it permitted, and the classifier
  // withholds that the moment it finds live evidence of a dependency — a
  // TwinAI-serving proxy config naming it, say. Without this gate the list
  // alone would authorise the deletion and the evidence would be decoration.
  for (const cls of ['shared-do-not-touch', 'unknown-do-not-touch', 'active-twinai']) {
    for (const stg of ['disable-restart', 'stop', 'remove-container']) {
      t(`MUTATION: a listed container classed ${cls} aborts ${stg}`, () => {
        const i = base(); i.containers.find((c) => c.name === TARGETS[2]).class = cls
        return plan(i, stg)
      }, true)
    }
  }
  t('reclaim while the container still exists aborts', () => plan(base(), 'reclaim'), true)
  t('…and while only ONE of them is left', () => {
    const i = base()
    i.containers = i.containers.filter((c) => c.name === TWINAI || c.name === TARGETS[TARGETS.length - 1])
    return plan(i, 'reclaim')
  }, true)

  // The reclaim happy path: every retirement-set container already removed.
  const removed = () => { const i = base(); i.containers = i.containers.filter((c) => !TARGETS.includes(c.name)); return i }
  t('reclaim after removal works', () => plan(removed(), 'reclaim'), false)

  const r = plan(removed(), 'reclaim')
  const has = (s) => r.cmds.some((c) => c.includes(s))
  const check = (name, cond) => { if (cond) console.log(`  ok: ${name}`); else { console.error(`SELFTEST FAIL: ${name}`); failed++ } }
  check('pre-stop-audit plans ZERO commands', plan(base(), 'pre-stop-audit').cmds.length === 0)
  check('route-impact plans ZERO commands', plan(base(), 'route-impact').cmds.length === 0)
  check('pre-stop-audit takes no backups', plan(base(), 'pre-stop-audit').backups.length === 0)
  check('reclaim removes the stylique image by id', has('docker rmi sha256:s'))
  check('reclaim NEVER removes the active twinai image', !has('sha256:a'))
  check('reclaim NEVER removes the rollback image', !has('sha256:p'))
  check('reclaim NEVER removes the shared oo-data volume', !has('oo-data'))
  check('reclaim removes the orphaned volume', has('docker volume rm dead'))
  check('reclaim uses builder prune, never system prune', has('builder prune') && !has('system prune'))
  check('reclaim NEVER removes a do-not-touch image', !has('sha256:z'))
  check('reclaim NEVER removes the postiz database volume', !has('pgdata'))
  check('remove-container never passes -v', !plan((() => { const i = base(); return i })(), 'remove-container').cmds.some((c) => /docker rm .*-v|rm -v/.test(c)))

  // THE MULTI-TARGET PROPERTIES. Each acting stage must reach EVERY member of
  // the set, exactly once, in the imported order — a plan that quietly acted on
  // one of five would look identical in shape to a correct one.
  for (const [stg, verb] of [['disable-restart', 'docker update --restart=no'], ['stop', 'docker stop --time 30'], ['remove-container', 'docker rm']]) {
    const p = plan(base(), stg)
    const named = p.resources.filter((x) => x.type === 'containers').map((x) => x.key)
    check(`${stg} acts on ALL ${TARGETS.length} targets`, named.length === TARGETS.length)
    check(`${stg} acts on each target exactly once`, new Set(named).size === named.length)
    check(`${stg} preserves the imported removal order`, canonJson(named) === canonJson([...TARGETS]))
    check(`${stg} never names twinai-worker`, !named.includes(TWINAI))
    check(`${stg} emits the ${verb.split(' ').slice(0, 2).join(' ')} command for each`,
      p.cmds.filter((c) => c.startsWith(verb)).length === TARGETS.length)
  }
  check('the edge is removed before the container it routes to',
    plan(base(), 'stop').resources.findIndex((x) => x.key === 'stylique-caddy')
    < plan(base(), 'stop').resources.findIndex((x) => x.key === 'stylique-os'))
  check('a target absent from the host is skipped, not invented', (() => {
    const i = base(); i.containers = i.containers.filter((c) => c.name !== TARGETS[1])
    const named = plan(i, 'stop').resources.map((x) => x.key)
    return named.length === TARGETS.length - 1 && !named.includes(TARGETS[1])
  })())
  check('…and the plan says so rather than staying silent', (() => {
    const i = base(); i.containers = i.containers.filter((c) => c.name !== TARGETS[1])
    return plan(i, 'stop').notes.some((n) => n.includes(TARGETS[1]) && /absent/.test(n))
  })())
  check('the manifest records EVERY target, not just one', (() => {
    const rec = plan(base(), 'manifest').record
    return rec.containers.length === TARGETS.length
      && canonJson(rec.containers.map((c) => c.container.name)) === canonJson([...TARGETS])
  })())

  // MUTATION CONTROLS — each proves a specific guard is load-bearing.
  t('MUTATION: a shared volume misclassed as deletable is still refused (mount check)', () => {
    const i = removed(); i.volumes[0].class = 'proven-orphaned'
    // oo-data is still listed as mounted by the surviving twinai container
    i.containers[0].mounts = [{ type: 'volume', name: 'oo-data' }]
    return plan(i, 'reclaim')
  }, true)
  t('MUTATION: a volume holding a database is refused even when classed orphaned', () => {
    const i = removed(); i.volumes[1].dbFiles = '/v/dead/PG_VERSION'; return plan(i, 'reclaim')
  }, true)
  t('MUTATION: an unknown-classed image cannot enter the plan', () => {
    const i = removed(); i.images.push({ id: 'sha256:x', tags: ['postiz'], repoDigests: [], sizeBytes: 1, class: 'unknown-do-not-touch' })
    const p = plan(i, 'reclaim')
    if (p.cmds.some((c) => c.includes('sha256:x'))) throw new PlanError('unknown image entered the plan')
    return p
  }, false)
  // Build cache must NOT be reclaimed while entries are active.
  const activeCache = () => { const i = removed(); i.dockerDf[0].active = 12; return i }
  check('MUTATION: active build cache is not pruned', !plan(activeCache(), 'reclaim').cmds.some((c) => c.includes('builder prune')))
  check('control: with zero active it IS pruned', plan(removed(), 'reclaim').cmds.some((c) => c.includes('builder prune')))

  // ---- BUILD-CACHE-ONLY STAGE ----------------------------------------------
  console.log('-- reclaim-build-cache: one command, zero authorisations')
  t('reclaim-build-cache is a known stage', () => plan(base(), 'reclaim-build-cache'), false)
  const rbc = plan(base(), 'reclaim-build-cache')
  check('it plans exactly ONE command', rbc.resources.length === 1)
  check('…which is builder prune, never system prune',
    rbc.cmds[0] === 'docker builder prune --all --force')
  check('…typed `none`, so it authorises no inventory record at all',
    rbc.resources[0].op === 'none' && rbc.resources[0].type === null && rbc.resources[0].key === null)
  // THE POINT OF THE STAGE: it must not be blocked by the container it has
  // nothing to do with. base() carries stylique-os; a running one must be fine.
  check('it runs while stylique-os is still PRESENT', plan(base(), 'reclaim-build-cache').resources.length === 1)
  t('…and while stylique-os is RUNNING', () => {
    const i = base(); i.containers[1].status = 'running'; return plan(i, 'reclaim-build-cache')
  }, false)
  t('…and when stylique-os is already gone', () => plan(removed(), 'reclaim-build-cache'), false)
  // MUTATION CONTROLS — each guard is load-bearing.
  t('MUTATION: an ACTIVE build cache is refused', () => {
    const i = base(); i.dockerDf[0].active = 12; return plan(i, 'reclaim-build-cache')
  }, true)
  t('MUTATION: an already-empty cache is refused (nothing to prove)', () => {
    const i = base(); i.dockerDf[0].total = 0; return plan(i, 'reclaim-build-cache')
  }, true)
  t('MUTATION: no build-cache row at all is refused (no evidence)', () => {
    const i = base(); i.dockerDf = []; return plan(i, 'reclaim-build-cache')
  }, true)
  t('MUTATION: it still enforces the twinai-worker precondition', () => {
    const i = base(); i.containers = i.containers.filter((c) => c.name !== TWINAI)
    return plan(i, 'reclaim-build-cache')
  }, true)
  t('MUTATION: it still enforces the rollback-image precondition', () => {
    const i = base(); i.images = i.images.filter((x) => x.class !== 'twinai-rollback')
    return plan(i, 'reclaim-build-cache')
  }, true)
  check('it names NO image, volume, network or container',
    !rbc.resources.some((r) => r.type !== null))

  // ---- THE TYPED RESOURCE MANIFEST ----------------------------------------
  console.log('-- typed plan manifest: the command and the authorisation are one object')
  const rr = plan(removed(), 'reclaim')
  const find = (op, type, key) => rr.resources.find((x) => x.op === op && x.type === type && x.key === key)
  check('every command is derived from a typed resource',
    rr.cmds.length === rr.resources.length && rr.cmds.every((c, i) => c === rr.resources[i].argv.join(' ')))
  // TAGS vs IMAGE IDS. `docker rmi` is given the id, and the typed key IS that
  // id — the same string, not two strings a regex has to reconcile.
  check('an image is keyed by its ID, not by a tag', find('remove', 'images', 'sha256:s') !== undefined)
  check('…and no image resource is keyed by a tag',
    !rr.resources.some((r) => r.type === 'images' && /:/.test(r.key) && !r.key.startsWith('sha256:')))
  check('…and the argv argument IS the typed key',
    find('remove', 'images', 'sha256:s').argv.at(-1) === 'sha256:s')
  // FLAGS AND MULTI-ARGUMENT COMMANDS. `docker builder prune --all --force` and
  // `journalctl --vacuum-size=200M` authorise nothing; under the old regex they
  // simply failed to match, which looks identical to "no authorisation needed"
  // and is not the same statement.
  const bares = rr.resources.filter((r) => r.op === 'none')
  check('flagged commands are typed `none`, explicitly authorising nothing', bares.length === 2)
  check('…and none of them names a resource', bares.every((r) => r.type === null && r.key === null))
  check('…and they keep every flag as a separate argv element',
    bares.some((r) => r.argv.join(' ') === 'docker builder prune --all --force'))
  check('a stop declares the lifecycle fields it will move',
    canonJson(plan(base(), 'stop').resources[0].fields) === canonJson(['status', 'exitCode', 'health']))
  check('a disable-restart declares only the policy field',
    canonJson(plan(base(), 'disable-restart').resources[0].fields) === canonJson(['policy']))
  check('read-only stages emit ZERO typed resources',
    plan(base(), 'pre-stop-audit').resources.length === 0 && plan(base(), 'route-impact').resources.length === 0)

  console.log('-- sealing binds a plan to its stage, its commit and its inventory')
  const BIND = { candidateSha: 'c'.repeat(40), beforeInventorySha256: 'b'.repeat(64) }
  const sealed = sealPlan(rr, BIND)
  const V = (p, over = {}) => verifyPlanBinding(p, { stage: 'reclaim', ...BIND, ...over })
  check('CONTROL: an untouched sealed plan verifies', V(sealed).length === 0)
  check('a plan for another STAGE is refused', V(sealed, { stage: 'stop' }).length > 0)
  check('a plan from another COMMIT is refused', V(sealed, { candidateSha: 'd'.repeat(40) }).length > 0)
  check('a plan built against a STALE before-inventory is refused',
    V(sealed, { beforeInventorySha256: 'e'.repeat(64) }).length > 0)
  // TAMPERING: adding, retargeting or widening a resource after sealing.
  const tamperAdd = JSON.parse(JSON.stringify(sealed))
  tamperAdd.resources.push({ op: 'remove', type: 'volumes', key: 'oo-data', fields: null, argv: ['docker', 'volume', 'rm', 'oo-data'] })
  check('TAMPER: an appended deletion is refused', V(tamperAdd).length > 0)
  const tamperKey = JSON.parse(JSON.stringify(sealed))
  tamperKey.resources.find((r) => r.type === 'images').key = 'sha256:a'
  check('TAMPER: a retargeted key is refused', V(tamperKey).length > 0)
  const tamperArgv = JSON.parse(JSON.stringify(sealed))
  tamperArgv.resources.find((r) => r.type === 'images').argv = ['docker', 'rmi', 'sha256:a']
  check('TAMPER: an argv edited away from its key is refused', V(tamperArgv).length > 0)
  const tamperBind = JSON.parse(JSON.stringify(sealed))
  tamperBind.binding.beforeInventorySha256 = 'e'.repeat(64)
  check('TAMPER: rewriting the binding to match a stale inventory is refused',
    V(tamperBind, { beforeInventorySha256: 'e'.repeat(64) }).length > 0)
  const noBinding = JSON.parse(JSON.stringify(sealed)); delete noBinding.binding
  check('an unsealed plan is refused', V(noBinding).length > 0)
  const wildcard = sealPlan({ ...rr, resources: [{ op: 'remove', type: 'images', key: '*', fields: null, argv: ['docker', 'rmi', '*'] }] }, BIND)
  check('a wildcard key is refused', V(wildcard).length > 0)
  const badOp = sealPlan({ ...rr, resources: [{ op: 'exec', type: 'images', key: 'x', fields: null, argv: ['x'] }] }, BIND)
  check('an unknown operation is refused', V(badOp).length > 0)
  const noArgv = sealPlan({ ...rr, resources: [{ op: 'remove', type: 'images', key: 'x', fields: null, argv: [] }] }, BIND)
  check('a resource with no executable argv is refused', V(noArgv).length > 0)
  t('sealing without a candidate commit throws', () => sealPlan(rr, { candidateSha: '', beforeInventorySha256: 'b' }), true)

  // ---- THE SEMANTIC BINDING: tuple <-> command ----------------------------
  console.log('-- the typed tuple MUST describe the command; argv is derived, not trusted')
  const R = (over) => sealPlan({ ...rr, stage: over.stage ?? 'reclaim', resources: [over.r] }, BIND)
  const V2 = (p2, stage = 'reclaim') => verifyPlanBinding(p2, { stage, ...BIND })
  const refuses = (name, r, stage = 'reclaim', match = null) => {
    const p2 = R({ r, stage })
    const probs = V2(p2, stage)
    const ok = probs.length > 0 && (match === null || probs.some((x) => match.test(x)))
    check(`${name} -> REFUSED`, ok)
  }
  const good = { op: 'remove', type: 'images', key: 'sha256:s', fields: null, argv: ['docker', 'rmi', 'sha256:s'] }
  check('CONTROL: a truthful tuple verifies', V2(R({ r: good })).length === 0)

  // THE EXACT DEFECT: tuple names an image, argv deletes a volume.
  refuses('a tuple naming an image whose argv deletes a volume',
    { op: 'remove', type: 'images', key: 'sha256:A', fields: null, argv: ['docker', 'volume', 'rm', 'B'] },
    'reclaim', /does not describe the command it carries/)
  refuses('the WRONG COMMAND FAMILY for the type',
    { op: 'remove', type: 'images', key: 'sha256:s', fields: null, argv: ['docker', 'network', 'rm', 'sha256:s'] })
  refuses('a MISMATCHED KEY between tuple and argv',
    { op: 'remove', type: 'images', key: 'sha256:s', fields: null, argv: ['docker', 'rmi', 'sha256:OTHER'] })
  refuses('an EXTRA FLAG the catalog never emits',
    { op: 'remove', type: 'images', key: 'sha256:s', fields: null, argv: ['docker', 'rmi', '--force', 'sha256:s'] })
  refuses('an EXTRA ARGUMENT (a second target smuggled in)',
    { op: 'remove', type: 'volumes', key: 'dead', fields: null, argv: ['docker', 'volume', 'rm', 'dead', 'oo-data'] })
  refuses('a container removal during RECLAIM (stage-incompatible op)',
    { op: 'remove', type: 'containers', key: TARGETS[0], fields: null, argv: ['docker', 'rm', TARGETS[0]] })
  refuses('an image removal during REMOVE-CONTAINER (stage-incompatible op)',
    { op: 'remove', type: 'images', key: 'sha256:s', fields: null, argv: ['docker', 'rmi', 'sha256:s'] },
    'remove-container', /may not remove a images/)
  refuses('a JOURNAL VACUUM during reclaim-build-cache (stage-incompatible bare command)',
    { op: 'none', type: null, key: null, fields: null, command: 'journal-vacuum', argv: ['journalctl', '--vacuum-size=200M'] },
    'reclaim-build-cache', /not permitted in stage/)
  refuses('a STOP command during disable-restart (wrong field set for the stage)',
    { op: 'change', type: 'containers', key: TARGETS[0], fields: ['status', 'exitCode', 'health'], argv: ['docker', 'stop', '--time', '30', TARGETS[0]] },
    'disable-restart', /may not change/)
  refuses('a field set NO catalog command produces',
    { op: 'change', type: 'containers', key: TARGETS[0], fields: ['imageId'], argv: ['docker', 'update', '--restart=no', TARGETS[0]] },
    'disable-restart', /no command in the catalog produces/)
  refuses('an UNNAMED bare command',
    { op: 'none', type: null, key: null, fields: null, argv: ['docker', 'builder', 'prune', '--all', '--force'] },
    'reclaim', /unknown bare command/)
  refuses('a bare command that also names a record',
    { op: 'none', type: 'volumes', key: 'x', fields: null, command: 'builder-prune', argv: ['docker', 'builder', 'prune', '--all', '--force'] })
  refuses('a resource carrying an UNEXPECTED FIELD',
    { op: 'remove', type: 'images', key: 'sha256:s', fields: null, argv: ['docker', 'rmi', 'sha256:s'], sudo: true },
    'reclaim', /unexpected field/)
  refuses('a key containing whitespace (two targets in one string)',
    { op: 'remove', type: 'volumes', key: 'dead oo-data', fields: null, argv: ['docker', 'volume', 'rm', 'dead oo-data'] })

  console.log('-- duplicate targets, plan shape, and the candidate commit')
  check('a DUPLICATE target is refused', V2(sealPlan({ ...rr, stage: 'reclaim', resources: [good, { ...good }] }, BIND))
    .some((x) => /more than once/.test(x)))
  check('a DUPLICATE bare command is refused', (() => {
    const bp = { op: 'none', type: null, key: null, fields: null, command: 'builder-prune', argv: ['docker', 'builder', 'prune', '--all', '--force'] }
    return V2(sealPlan({ ...rr, stage: 'reclaim', resources: [bp, { ...bp }] }, BIND)).some((x) => /more than once/.test(x))
  })())
  check('an UNEXPECTED TOP-LEVEL plan field is refused', (() => {
    const p2 = { ...R({ r: good }), extra: 1 }
    return V2(p2).some((x) => /unexpected top-level field/.test(x))
  })())
  check('a NON-40-HEX candidate commit is refused', verifyPlanBinding(
    sealPlan({ ...rr, stage: 'reclaim', resources: [good] }, { candidateSha: 'HEAD', beforeInventorySha256: 'b'.repeat(64) }),
    { stage: 'reclaim', candidateSha: 'HEAD', beforeInventorySha256: 'b'.repeat(64) },
  ).some((x) => /not a 40-character hex/.test(x)))
  check('a NON-SHA256 before-inventory digest is refused', verifyPlanBinding(
    sealPlan({ ...rr, stage: 'reclaim', resources: [good] }, { candidateSha: 'c'.repeat(40), beforeInventorySha256: 'nope' }),
    { stage: 'reclaim', candidateSha: 'c'.repeat(40), beforeInventorySha256: 'nope' },
  ).some((x) => /is not a sha256/.test(x)))
  check('an unexpected BINDING field is refused', (() => {
    const p2 = R({ r: good }); p2.binding = { ...p2.binding, extra: 1 }
    return V2(p2).some((x) => /binding carries unexpected field/.test(x))
  })())

  // OLD-HEAD COUNTEREXAMPLE. d651363 checked the tuple and the argv as two
  // independent facts; this replicates that logic exactly and shows it passes
  // the lying tuple the corrected head refuses.
  console.log('-- OLD HEAD (d651363) accepted a tuple that did not describe its command')
  const legacyVerify = (r) => {
    const probs = []
    if (!PLAN_OPS.includes(r.op)) probs.push('op')
    if (r.op !== 'none') {
      if (!PLAN_TYPES.includes(r.type)) probs.push('type')
      if (typeof r.key !== 'string' || !r.key || r.key === '*') probs.push('key')
    }
    if (r.op === 'change' && (!Array.isArray(r.fields) || !r.fields.length)) probs.push('fields')
    if (!Array.isArray(r.argv) || !r.argv.length || !r.argv.every((x) => typeof x === 'string' && x.length > 0)) probs.push('argv')
    return probs
  }
  const lie = { op: 'remove', type: 'images', key: 'sha256:A', fields: null, argv: ['docker', 'volume', 'rm', 'oo-data'] }
  check('OLD HEAD: the lying tuple passed every one of its checks', legacyVerify(lie).length === 0)
  check('CORRECTED HEAD: the same tuple is refused', V2(R({ r: lie })).length > 0)
  check('…and the executor would have deleted a VOLUME while authorising an IMAGE',
    lie.argv.join(' ') === 'docker volume rm oo-data' && lie.type === 'images')
  check('CORRECTED HEAD: what that tuple actually MEANS is an image removal',
    deriveArgv('reclaim', { ...lie, argv: undefined }).join(' ') === 'docker rmi sha256:A')

  check('shQuote neutralises a quote', shQuote("a'b") === `'a'\\''b'`)

  if (failed) { console.error(`plan-retirement selftest: ${failed} failed`); process.exit(1) }
  console.log('plan-retirement selftest: all cases passed'); process.exit(0)
}

// Only act when this file IS the program. Without this, `import { STAGES }` from
// another script runs the whole CLI — check_vps_retire_safety.mjs --selftest ran
// the PLANNER's selftest and exited 0, so its own cases silently never ran. An
// import with side effects is another way for a guard to disappear quietly.
const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (!isEntry) { /* imported for its exports */ }
else if (process.argv.includes('--selftest')) selftest()
else {
  const [, , invFile, stage] = process.argv
  const flag = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null }
  if (!invFile || !stage) {
    console.error('usage: plan_retirement.mjs <inventory.json> <stage> [--json out] [--candidate-sha X]')
    process.exit(2)
  }
  // The plan is bound to the commit that produced it and to the exact inventory
  // it read. Without a candidate commit it cannot be, so refuse rather than
  // emit an unbindable plan that a later step would have to trust on faith.
  const candidateSha = flag('--candidate-sha') ?? process.env.GITHUB_SHA ?? ''
  if (!candidateSha) {
    console.error('::error::no candidate commit (pass --candidate-sha or set GITHUB_SHA) — a plan that cannot be bound cannot be verified')
    process.exit(1)
  }
  const invText = readFileSync(invFile, 'utf8')
  let p
  try {
    p = sealPlan(plan(JSON.parse(invText), stage), {
      candidateSha,
      beforeInventorySha256: sha256hex(invText),
    })
  } catch (e) {
    if (e instanceof PlanError) { console.error(`::error::retirement plan refused: ${e.message}`); process.exit(1) }
    throw e
  }
  console.log(`== retirement plan: ${p.stage} ==`)
  console.log(`  bound to commit        : ${p.binding.candidateSha}`)
  console.log(`  bound to inventory sha : ${p.binding.beforeInventorySha256}`)
  console.log(`  plan sha256            : ${p.planSha256}`)
  for (const n of p.notes) console.log(`  note: ${n}`)
  for (const b of p.backups ?? []) console.log(`  backup: volume ${b.volume} (${b.sizeKb} KiB) at ${b.mountpoint}`)
  if (!p.resources.length) console.log('  (no commands)')
  for (const r of p.resources) {
    const what = r.op === 'none' ? 'no inventory record' : `${r.op} ${r.type}/${r.key}${r.fields ? ` fields=${r.fields.join(',')}` : ''}`
    console.log(`  CMD: ${r.argv.join(' ')}`)
    console.log(`       authorises: ${what}`)
  }
  const out = flag('--json')
  if (out) writeFileSync(out, JSON.stringify(p, null, 2))
}
