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

  // 4. The crash loop is gone.
  const so = after.containers.find((c) => c.name === 'stylique-os')
  ok(!so, 'stylique-os container is gone')
  if (so) ok(so.restarts === 0, `stylique-os is no longer restart-looping (restarts=${so.restarts})`)

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
  before.containers.push({ name: 'stylique-os', class: 'stylique-os', status: 'restarting', health: 'unhealthy', restarts: 23082 })

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
  t('a surviving stylique-os container fails', check(before, mk({
    containers: [...mk().containers, { name: 'stylique-os', class: 'stylique-os', status: 'exited', health: 'none', restarts: 23082 }],
  })).ok, false)
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
