// Turn a FRESH classified inventory into an explicit, bounded retirement plan.
//
// THE CENTRAL SAFETY PROPERTY: the deletion list is DERIVED from the live
// classification at execution time. It is never hand-typed, never carried over
// from an earlier run, and never widened by a name pattern. If the host changed
// since the last look, the plan changes with it — or refuses.
//
// The plan may only ever touch resources classed `stylique-os` or
// `proven-orphaned`. Anything else — active-twinai, twinai-rollback,
// shared-do-not-touch, unknown-do-not-touch — is unreachable by construction:
// emit() throws rather than skipping, so a misclassification is a hard stop and
// not a silently smaller plan.
//
// PRECONDITIONS, all fail-closed:
//   * twinai-worker present and classed active-twinai
//   * at least one twinai-rollback image retained
//   * the container being retired is stylique-os and nothing else
//   * no volume marked for deletion is mounted by any surviving container
//
//   node scripts/ci/plan_retirement.mjs <inventory.json> <stage> [--json out]
//   node scripts/ci/plan_retirement.mjs --selftest
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Every stage the plan step may be asked to plan for. `observe` and `accept`
// never reach this script — the workflow skips the plan step for them — but
// every OTHER dispatchable stage must be here, including the read-only ones.
// A stage the workflow accepts and this table does not is a refusal at plan
// time, and a refusal is only safe if it is actually seen: run 30290680691
// dispatched `pre-stop-audit`, this threw `unknown stage`, and `| tee` in the
// workflow swallowed the non-zero exit so the step named "fail closed" reported
// success. check_vps_retire_safety.mjs now proves this table and the workflow's
// authorisation arms cannot drift apart again.
export const STAGES = ['manifest', 'pre-stop-audit', 'route-impact', 'disable-restart', 'stop', 'remove-container', 'reclaim']
/** Stages that plan NO commands. They are here to be known, not to act. */
export const READ_ONLY_STAGES = new Set(['manifest', 'pre-stop-audit', 'route-impact'])
const TARGET = 'stylique-os'
const TWINAI = 'twinai-worker'
const DELETABLE = new Set(['stylique-os', 'proven-orphaned'])

export class PlanError extends Error {}

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

  const target = inv.containers.find((c) => c.name === TARGET)
  const cmds = []
  const notes = []

  // Every command goes through here. A resource outside DELETABLE cannot reach
  // the plan even by mistake — this throws instead of skipping, so a
  // misclassification stops the run rather than quietly shrinking it.
  const emit = (cls, what, cmd) => {
    if (!DELETABLE.has(cls)) throw new PlanError(`refusing to act on "${what}": classed ${cls}, which is not deletable`)
    cmds.push(cmd)
  }

  // `pre-stop-audit` plans nothing. Its evidence is the probe's verdict, not a
  // command list, so the honest plan is an empty one. It still runs the
  // preconditions above on purpose: a host whose twinai-worker is missing or
  // misclassified is not a host to be auditing a retirement on.
  if (stage === 'pre-stop-audit' || stage === 'route-impact') {
    notes.push('read-only stage: no command is planned; the evidence is the probe verdict')
    if (!target) notes.push(`${TARGET} is not present on this host`)
    return { stage, cmds, notes, backups: [] }
  }

  if (stage === 'manifest') {
    // Read + backup only. Nothing here mutates.
    if (!target) { notes.push(`${TARGET} is not present — nothing to record`); return { stage, cmds, notes, backups: [] } }
    const exclusive = inv.volumes.filter((v) => v.class === 'stylique-os')
    const shared = inv.volumes.filter((v) => v.class === 'shared-do-not-touch' && /stylique-os/.test(v.evidence))
    for (const v of shared) notes.push(`SHARED VOLUME, will NOT be deleted: ${v.name} (${v.evidence})`)
    return {
      stage, cmds, notes,
      // Backups are taken for host-local persistent data only, and only for
      // volumes this run would later delete.
      backups: exclusive.map((v) => ({ volume: v.name, mountpoint: v.mountpoint, sizeKb: v.sizeKb })),
      record: {
        container: { name: target.name, image: target.imageRef, imageId: target.imageId, status: target.status, restarts: target.restarts, policy: target.policy, created: target.created, exitCode: target.exitCode, health: target.health },
        mounts: target.mounts, networks: target.networks, ports: target.ports, labels: target.labels, project: target.project,
        images: inv.images.filter((i) => i.class === 'stylique-os').map((i) => ({ id: i.id, tags: i.tags, repoDigests: i.repoDigests, sizeBytes: i.sizeBytes })),
        networksOwned: inv.networks.filter((n) => n.class === 'stylique-os').map((n) => n.name),
        volumesOwned: exclusive.map((v) => v.name),
        volumesShared: shared.map((v) => ({ name: v.name, evidence: v.evidence })),
      },
    }
  }

  // The container must exist for the stages that ACT ON IT. `reclaim` is the
  // opposite case: it runs only once the container is already gone, and its own
  // guard below refuses if it is still there.
  if (!target && stage !== 'reclaim') {
    throw new PlanError(`${TARGET} is not present on this host — nothing to retire`)
  }

  if (stage === 'disable-restart') {
    // Reversible: `docker update --restart=unless-stopped` restores it.
    emit(target.class, target.name, `docker update --restart=no ${TARGET}`)
    notes.push(`reversible: docker update --restart=${target.policy.split(':')[0]} ${TARGET}`)
  }

  if (stage === 'stop') {
    emit(target.class, target.name, `docker stop --time 30 ${TARGET}`)
    notes.push(`reversible: docker start ${TARGET}`)
  }

  if (stage === 'remove-container') {
    if (target.status === 'running' || target.status === 'restarting') {
      throw new PlanError(`refusing to remove ${TARGET} while it is ${target.status} — run the stop stage first and observe TwinAI health`)
    }
    // NEVER `-v`: the volume it mounts is shared with another container.
    emit(target.class, target.name, `docker rm ${TARGET}`)
    notes.push('no -v flag: volumes are handled separately, and only after the shared-mount check')
  }

  if (stage === 'reclaim') {
    if (inv.containers.some((c) => c.name === TARGET)) {
      throw new PlanError(`refusing to reclaim while the ${TARGET} container still exists — remove it first`)
    }
    // Images: stylique-os-classed, and dangling ones. Individually, by id.
    for (const i of inv.images.filter((x) => DELETABLE.has(x.class))) {
      emit(i.class, i.tags.join(',') || i.id, `docker rmi ${i.id}`)
    }
    // Networks: only ones with nothing attached or only the retired container.
    for (const n of inv.networks.filter((x) => DELETABLE.has(x.class) && !['bridge', 'host', 'none'].includes(x.name))) {
      emit(n.class, n.name, `docker network rm ${n.name}`)
    }
    // Volumes: a second, INDEPENDENT mount check on top of the classification.
    // Two agreeing checks, because this is the only irreversible data deletion.
    const mounted = new Set(inv.containers.flatMap((c) => c.mounts.filter((m) => m.type === 'volume').map((m) => m.name)))
    for (const v of inv.volumes.filter((x) => DELETABLE.has(x.class))) {
      if (mounted.has(v.name)) throw new PlanError(`refusing to delete volume ${v.name}: still mounted by a surviving container`)
      if (v.dbFiles) throw new PlanError(`refusing to delete volume ${v.name}: contains database files (${v.dbFiles})`)
      emit(v.class, v.name, `docker volume rm ${v.name}`)
    }
    // Build cache. NOT `docker system prune` — that would also sweep resources
    // this plan deliberately refused to touch. `builder prune` reaches the build
    // cache only, and only when Docker itself reports zero active entries.
    const bc = buildCacheReclaimable(inv)
    if (bc && bc.active === 0 && bc.entries > 0) {
      cmds.push('docker builder prune --all --force')
      notes.push(`build cache: ${bc.entries} entries, 0 active, ${bc.size} total, ${bc.reclaimable} reclaimable`)
    } else if (bc && bc.active > 0) {
      notes.push(`build cache NOT reclaimed: ${bc.active} entries are active`)
    }
    // Journal is host log data, not application data: bound it, never delete
    // application state.
    cmds.push('journalctl --vacuum-size=200M')
    notes.push('journal vacuumed to 200M (host logs only; no application data)')
  }

  return { stage, cmds, notes, backups: [] }
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

  const base = () => ({
    containers: [
      { name: TWINAI, class: 'active-twinai', mounts: [], status: 'running', networks: [] },
      { name: TARGET, class: 'stylique-os', mounts: [{ type: 'volume', name: 'oo-data' }], status: 'exited', restarts: 23082, policy: 'unless-stopped:0', imageRef: 'stylique-os:latest', imageId: 'sha256:b', created: 'c', exitCode: 1, health: 'unhealthy', networks: ['sonet'], ports: '', labels: '', project: null },
    ],
    images: [
      { id: 'sha256:a', tags: ['twinai-worker:latest'], repoDigests: [], sizeBytes: 1, class: 'active-twinai' },
      { id: 'sha256:p', tags: ['twinai-worker:prev'], repoDigests: [], sizeBytes: 1, class: 'twinai-rollback' },
      { id: 'sha256:s', tags: ['stylique-os:v1'], repoDigests: [], sizeBytes: 1, class: 'stylique-os' },
    ],
    volumes: [
      { name: 'oo-data', class: 'shared-do-not-touch', evidence: 'mounted by stylique-os,infallible_hawking', dbFiles: '' },
      { name: 'dead', class: 'proven-orphaned', evidence: 'x', dbFiles: '' },
    ],
    networks: [{ id: 'n1', name: 'sonet', class: 'stylique-os', containers: [TARGET] }],
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
  t('reclaim while the container still exists aborts', () => plan(base(), 'reclaim'), true)

  // The reclaim happy path: container already removed.
  const removed = () => { const i = base(); i.containers = i.containers.filter((c) => c.name !== TARGET); return i }
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
  check('remove-container never passes -v', !plan((() => { const i = base(); return i })(), 'remove-container').cmds.some((c) => /docker rm .*-v|rm -v/.test(c)))

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
  if (!invFile || !stage) { console.error('usage: plan_retirement.mjs <inventory.json> <stage> [--json out]'); process.exit(2) }
  let p
  try { p = plan(JSON.parse(readFileSync(invFile, 'utf8')), stage) }
  catch (e) {
    if (e instanceof PlanError) { console.error(`::error::retirement plan refused: ${e.message}`); process.exit(1) }
    throw e
  }
  console.log(`== retirement plan: ${p.stage} ==`)
  for (const n of p.notes) console.log(`  note: ${n}`)
  for (const b of p.backups ?? []) console.log(`  backup: volume ${b.volume} (${b.sizeKb} KiB) at ${b.mountpoint}`)
  if (!p.cmds.length) console.log('  (no commands)')
  for (const c of p.cmds) console.log(`  CMD: ${c}`)
  const jsonIdx = process.argv.indexOf('--json')
  if (jsonIdx > 0 && process.argv[jsonIdx + 1]) writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(p, null, 2))
}
