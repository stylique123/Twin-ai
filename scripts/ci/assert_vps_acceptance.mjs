// Lane A5 ACCEPTANCE GATE. Compares the BEFORE and AFTER resource inventories
// and refuses unless every stated condition holds.
//
// The thresholds are fixed HERE, in the diff, so they cannot be quietly relaxed
// afterwards to make a disappointing cleanup look successful. If cleanup cannot
// reach them without touching unknown or shared resources, the correct outcome
// is a FAILURE naming the remaining consumers — not a smaller number.
//
//   node scripts/ci/assert_vps_acceptance.mjs before.json after.json
//   node scripts/ci/assert_vps_acceptance.mjs --selftest
import { readFileSync } from 'node:fs'
import { RETIRE_CTRS } from './build_resource_inventory.mjs'

// --- FROZEN THRESHOLDS -------------------------------------------------------
export const MAX_ROOT_USED_PCT = 80
export const MIN_ROOT_FREE_GIB = 30
// Gate-0 §capacity: peak temp disk <= 3x source + expected output + 1 GiB.
// Source cap is the worker's own WORKER_MAX_DOWNLOAD_BYTES default (600 MiB);
// expected output is bounded by the same cap, since a render never legitimately
// produces more than it consumed at this length limit.
export const MAX_SOURCE_MIB = 600
export const RENDER_TEMP_REQUIRED_MIB = 3 * MAX_SOURCE_MIB + MAX_SOURCE_MIB + 1024 // 3x + output + 1 GiB
const GIB_KB = 1024 * 1024

export function check(before, after) {
  const fail = []
  const pass = []
  const ok = (cond, msg) => (cond ? pass : fail).push(msg)

  // 0. THE TWO INVENTORIES MUST SPEAK THE SAME LANGUAGE.
  //
  // Condition 5 asserts that everything classed do-not-touch BEFORE still
  // exists AFTER. That is only a safety property while both sides use the same
  // class vocabulary. Under schema 1 the newly-retiring containers were classed
  // `unknown-do-not-touch`, so a schema-1 baseline against a schema-2 result
  // would demand that the retirement had not happened — reporting a completed,
  // correct cleanup as a protected-resource violation, which is the single most
  // expensive kind of wrong answer this gate can give. Refuse the comparison
  // instead of performing a meaningless one.
  const bs = before.schema ?? '(absent)'
  const as = after.schema ?? '(absent)'
  ok(bs === as, `inventory schemas match (before ${bs}, after ${as})`)
  if (bs !== as) {
    return { ok: false, pass, reclaimedKb: 0, fail: [...fail,
      'REFUSING to compare: the baseline was collected by a different classifier version. '
      + 'Re-run the manifest stage to capture a fresh BEFORE inventory and anchor the accept stage to it.'] }
  }

  const bw = before.containers.find((c) => c.name === 'twinai-worker')
  const aw = after.containers.find((c) => c.name === 'twinai-worker')

  // 1. TwinAI survived, healthy, and was not restarted by the cleanup.
  ok(!!aw, 'twinai-worker present after cleanup')
  if (aw) {
    ok(aw.status === 'running', `twinai-worker status is running (got ${aw.status})`)
    ok(aw.health === 'healthy' || aw.health === 'none', `twinai-worker health is not failing (got ${aw.health})`)
    ok(!!bw && aw.restarts === bw.restarts,
      `twinai-worker restart count unchanged (before ${bw?.restarts}, after ${aw.restarts})`)
  }

  // 2. Identity intact: job registry and pinned ASR model.
  ok(after.twinai.src_sha === before.twinai.src_sha,
    `worker source SHA unchanged (${before.twinai.src_sha} -> ${after.twinai.src_sha})`)
  ok(after.twinai.model_path === before.twinai.model_path,
    `pinned model path unchanged (${after.twinai.model_path})`)
  ok(Number(after.twinai.model_cache_kb || 0) > 0 &&
     Number(after.twinai.model_cache_kb) === Number(before.twinai.model_cache_kb),
    `ASR model cache intact (${before.twinai.model_cache_kb} -> ${after.twinai.model_cache_kb} KiB)`)

  // 3. No active TwinAI resource was deleted, and rollback is still possible.
  const beforeActive = before.images.filter((i) => i.class === 'active-twinai').map((i) => i.id)
  const afterIds = new Set(after.images.map((i) => i.id))
  for (const id of beforeActive) ok(afterIds.has(id), `active TwinAI image ${id.slice(7, 19)} still present`)
  ok(after.images.some((i) => i.class === 'twinai-rollback'), 'at least one TwinAI rollback image retained')

  // 4. THE RETIREMENT ACTUALLY HAPPENED — all of it.
  //    This checked one name while the plan acts on five, so four containers
  //    could survive a "successful" retirement without the gate noticing.
  //    A retirement that half-ran is not a retirement that passed.
  for (const n of RETIRE_CTRS) {
    const c = after.containers.find((x) => x.name === n)
    ok(!c, `${n} container is gone`)
  }

  // 5. Nothing classed do-not-touch was removed.
  const protectedBefore = [...before.containers, ...before.volumes, ...before.networks]
    .filter((r) => r.class === 'shared-do-not-touch' || r.class === 'unknown-do-not-touch')
    .map((r) => r.name)
  const afterNames = new Set([...after.containers, ...after.volumes, ...after.networks].map((r) => r.name))
  for (const n of protectedBefore) ok(afterNames.has(n), `protected resource "${n}" was not removed`)

  // 6. Disk. Both conditions, not either.
  const root = after.fs.root ?? {}
  ok(root.usedPct <= MAX_ROOT_USED_PCT, `root usage ${root.usedPct}% <= ${MAX_ROOT_USED_PCT}%`)
  const freeGib = root.availKb / GIB_KB
  ok(freeGib >= MIN_ROOT_FREE_GIB, `root free ${freeGib.toFixed(2)} GiB >= ${MIN_ROOT_FREE_GIB} GiB`)

  // 7. The render temp-space formula still passes, measured where a render
  //    actually writes: inside the container.
  const ctrTmpMib = Number(after.twinai.ctr_tmp_avail_kb || 0) / 1024
  ok(ctrTmpMib >= RENDER_TEMP_REQUIRED_MIB,
    `container /tmp ${ctrTmpMib.toFixed(0)} MiB >= required ${RENDER_TEMP_REQUIRED_MIB} MiB (3x source + output + 1 GiB)`)

  const reclaimedKb = (before.fs.root?.usedKb ?? 0) - (after.fs.root?.usedKb ?? 0)
  return { ok: fail.length === 0, pass, fail, reclaimedKb }
}

function selftest() {
  let failed = 0
  const t = (name, got, exp) => { if (got === exp) console.log(`  ok: ${name}`); else { console.error(`SELFTEST FAIL: ${name} => ${got}, expected ${exp}`); failed++ } }

  const mk = (o = {}) => ({
    schema: 'vps-resource-inventory-2',
    containers: [{ name: 'twinai-worker', class: 'active-twinai', status: 'running', health: 'healthy', restarts: 0 },
      { name: 'postiz', class: 'unknown-do-not-touch', status: 'running', health: 'none', restarts: 0 }],
    images: [{ id: 'sha256:a', class: 'active-twinai' }, { id: 'sha256:p', class: 'twinai-rollback' }],
    volumes: [{ name: 'oo-data', class: 'shared-do-not-touch' }],
    networks: [],
    fs: { root: { usedKb: 60 * GIB_KB, availKb: 90 * GIB_KB, usedPct: 40 } },
    twinai: { src_sha: 'abc', model_path: '/opt/models/x', model_cache_kb: '500000', ctr_tmp_avail_kb: String(90 * GIB_KB) },
    ...o,
  })
  const before = mk({ fs: { root: { usedKb: 120 * GIB_KB, availKb: 23 * GIB_KB, usedPct: 84 } } })
  for (const n of RETIRE_CTRS) {
    before.containers.push({ name: n, class: 'retire-scope', status: 'restarting', health: 'unhealthy', restarts: 23082 })
  }

  t('clean cleanup passes', check(before, mk()).ok, true)
  t('a restarted twinai worker fails', check(before, mk({
    containers: [{ name: 'twinai-worker', class: 'active-twinai', status: 'running', health: 'healthy', restarts: 1 },
      { name: 'postiz', class: 'unknown-do-not-touch', status: 'running', health: 'none', restarts: 0 }],
  })).ok, false)
  t('a deleted rollback image fails', check(before, mk({ images: [{ id: 'sha256:a', class: 'active-twinai' }] })).ok, false)
  t('a deleted active image fails', check(before, mk({ images: [{ id: 'sha256:p', class: 'twinai-rollback' }] })).ok, false)
  t('a deleted protected container fails', check(before, mk({
    containers: [{ name: 'twinai-worker', class: 'active-twinai', status: 'running', health: 'healthy', restarts: 0 }],
  })).ok, false)
  t('a deleted shared volume fails', check(before, mk({ volumes: [] })).ok, false)
  t('root still at 84% fails', check(before, mk({ fs: { root: { usedKb: 120 * GIB_KB, availKb: 23 * GIB_KB, usedPct: 84 } } })).ok, false)
  t('81% fails (threshold is 80, not "about 80")',
    check(before, mk({ fs: { root: { usedKb: 100 * GIB_KB, availKb: 40 * GIB_KB, usedPct: 81 } } })).ok, false)
  t('under 80% but under 30 GiB free still fails',
    check(before, mk({ fs: { root: { usedKb: 100 * GIB_KB, availKb: 29 * GIB_KB, usedPct: 70 } } })).ok, false)
  // EVERY member, not just the first. A gate that only noticed stylique-os
  // would pass a run in which the other four were still sitting there.
  for (const n of RETIRE_CTRS) {
    t(`a surviving ${n} container fails`, check(before, mk({
      containers: [...mk().containers, { name: n, class: 'retire-scope', status: 'exited', health: 'none', restarts: 0 }],
    })).ok, false)
  }
  // A stale baseline must be REFUSED, not silently compared across vocabularies.
  t('a schema-1 baseline is refused', check({ ...before, schema: 'vps-resource-inventory-1' }, mk()).ok, false)
  t('…and the refusal says why', check({ ...before, schema: 'vps-resource-inventory-1' }, mk())
    .fail.some((f) => /REFUSING to compare/.test(f)), true)
  t('…and an inventory with no schema field at all is refused',
    check({ ...before, schema: undefined }, mk()).ok, false)
  t('a wiped ASR model cache fails', check(before, mk({
    twinai: { src_sha: 'abc', model_path: '/opt/models/x', model_cache_kb: '0', ctr_tmp_avail_kb: String(90 * GIB_KB) },
  })).ok, false)
  t('a changed worker SHA fails', check(before, mk({
    twinai: { src_sha: 'DIFFERENT', model_path: '/opt/models/x', model_cache_kb: '500000', ctr_tmp_avail_kb: String(90 * GIB_KB) },
  })).ok, false)
  t('insufficient container /tmp for a render fails', check(before, mk({
    twinai: { src_sha: 'abc', model_path: '/opt/models/x', model_cache_kb: '500000', ctr_tmp_avail_kb: String(1024 * 1024) },
  })).ok, false)
  t('the temp formula is 3x source + output + 1 GiB', RENDER_TEMP_REQUIRED_MIB, 3 * 600 + 600 + 1024)

  if (failed) { console.error(`vps-acceptance selftest: ${failed} failed`); process.exit(1) }
  console.log('vps-acceptance selftest: all cases passed'); process.exit(0)
}

if (process.argv.includes('--selftest')) selftest()
else {
  const [, , beforeFile, afterFile] = process.argv
  if (!beforeFile || !afterFile) { console.error('usage: assert_vps_acceptance.mjs <before.json> <after.json>'); process.exit(2) }
  const r = check(JSON.parse(readFileSync(beforeFile, 'utf8')), JSON.parse(readFileSync(afterFile, 'utf8')))
  for (const p of r.pass) console.log(`  PASS  ${p}`)
  for (const f of r.fail) console.error(`  FAIL  ${f}`)
  console.log(`\nreclaimed: ${(r.reclaimedKb / GIB_KB).toFixed(2)} GiB`)
  console.log(`vps-acceptance: ${r.ok ? 'PASSED' : 'FAILED'}`)
  if (!r.ok) process.exit(1)
}
