#!/usr/bin/env node
// Prove the build-cache reclaim DID something, and did only that.
//
// WHY THE STRUCTURAL DELTA IS NOT ENOUGH ON ITS OWN
// -------------------------------------------------
// assert_structural_delta.mjs proves the negative: no container, image, volume
// or network record changed. For this stage that is exactly the right claim,
// and it is also the claim a NO-OP satisfies perfectly. A prune that silently
// did nothing — wrong flag, buildkit not in use, command swallowed — produces a
// flawless structural delta and a green run.
//
// The two halves are therefore split on purpose:
//   * the structural delta says nothing was harmed;
//   * this says something was actually reclaimed.
// Neither is a substitute for the other, and a stage that only reported the
// first would be claiming success for the absence of evidence.
//
// It also re-checks the survival facts directly rather than trusting the other
// script: the worker, its image, and the pinned-model volume set are all still
// there. Defence in depth is cheap here and the cost of being wrong is a
// production render box.
//
//   node scripts/ci/assert_cache_reclaim.mjs <before.json> <after.json>
//   node scripts/ci/assert_cache_reclaim.mjs --selftest
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const TWINAI = 'twinai-worker'

/** "12.3GB" / "980.4MB" / "0B" -> bytes. Docker's own df formatting. */
export function toBytes(s) {
  const m = String(s ?? '').trim().match(/^([0-9.]+)\s*([KMGTP]?)i?B?$/i)
  if (!m) return null
  return Math.round(Number(m[1]) * { '': 1, K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15 }[m[2].toUpperCase()])
}

const cacheRow = (inv) => (inv.dockerDf ?? []).find((d) => /build cache/i.test(d.type))
const gib = (kb) => (kb / 1024 / 1024)

export function assess(before, after) {
  const problems = []
  const facts = {}

  const b = cacheRow(before); const a = cacheRow(after)
  if (!b) problems.push('the BEFORE inventory has no build-cache row — there is no baseline to compare against')
  if (!a) problems.push('the AFTER inventory has no build-cache row — the reclaim cannot be shown to have happened')

  if (b && a) {
    const bBytes = b.sizeBytes ?? toBytes(b.size)
    const aBytes = a.sizeBytes ?? toBytes(a.size)
    facts.cacheBefore = `${b.total} entries, ${b.active} active, ${b.size}`
    facts.cacheAfter = `${a.total} entries, ${a.active} active, ${a.size}`
    if (bBytes === null || aBytes === null) {
      problems.push(`build-cache size is unparseable (before ${JSON.stringify(b.size)}, after ${JSON.stringify(a.size)})`)
    } else {
      facts.cacheReclaimed = `${((bBytes - aBytes) / 1e9).toFixed(2)} GB`
      // THE NO-OP CHECK. A prune that changed nothing is a failure, not a pass.
      if (aBytes >= bBytes) {
        problems.push(
          `the build cache did NOT shrink (${b.size} -> ${a.size}). The command ran and reclaimed nothing, `
          + 'which is indistinguishable from it not having run at all.',
        )
      }
    }
    if (a.active > 0) problems.push(`${a.active} build-cache entries are active AFTER the prune — a build started during the stage`)
  }

  // Disk is the reason the stage exists. Report it, and require it moved the
  // right way — other processes write to this disk, so the test is direction,
  // not an exact figure.
  const bfs = before.fs?.root; const afs = after.fs?.root
  if (!bfs || !afs) problems.push('the root filesystem reading is missing from one side — the disk claim cannot be checked')
  else {
    facts.rootBefore = `${gib(bfs.usedKb).toFixed(2)} GiB used (${bfs.usedPct}%), ${gib(bfs.availKb).toFixed(2)} GiB free`
    facts.rootAfter = `${gib(afs.usedKb).toFixed(2)} GiB used (${afs.usedPct}%), ${gib(afs.availKb).toFixed(2)} GiB free`
    facts.freed = `${(gib(afs.availKb) - gib(bfs.availKb)).toFixed(2)} GiB`
    if (afs.availKb <= bfs.availKb) {
      problems.push(`free space did not increase (${gib(bfs.availKb).toFixed(2)} -> ${gib(afs.availKb).toFixed(2)} GiB)`)
    }
  }

  // SURVIVAL. Checked here as well as in the structural delta, on purpose.
  //
  // BY IDENTITY, NOT BY COUNT. The first version of this compared list LENGTHS,
  // which is a measurement adjacent to the thing that matters: a prune that
  // deleted one image and left one new one behind reports the same count and
  // passes. Counting is how you check that a check ran; naming is how you check
  // what survived.
  const KEY = { containers: 'name', images: 'id', volumes: 'name', networks: 'name' }
  const ids = (inv, k) => new Set((inv[k] ?? []).map((r) => r[KEY[k]]).filter((x) => typeof x === 'string'))
  const summary = []
  for (const k of Object.keys(KEY)) {
    const b2 = ids(before, k); const a2 = ids(after, k)
    const gone = [...b2].filter((x) => !a2.has(x))
    const appeared = [...a2].filter((x) => !b2.has(x))
    summary.push(`${k} ${b2.size}->${a2.size}`)
    if (gone.length) problems.push(`${k} disappeared during a build-cache prune: ${gone.join(', ')}`)
    if (appeared.length) problems.push(`${k} appeared during a build-cache prune: ${appeared.join(', ')}`)
    // A list whose entries have no key at all cannot be compared by identity,
    // and silently comparing nothing is the failure mode this replaced.
    if ((before[k] ?? []).length !== b2.size || (after[k] ?? []).length !== a2.size) {
      problems.push(`${k} contains records with no ${KEY[k]} — survival cannot be established by identity`)
    }
  }
  facts.records = summary.join(', ')
  const worker = (after.containers ?? []).find((c) => c.name === TWINAI)
  if (!worker) problems.push(`${TWINAI} is GONE after the prune`)
  else if (worker.status !== 'running') problems.push(`${TWINAI} is ${worker.status} after the prune`)
  const workerImage = worker && (after.images ?? []).some((i) => i.id === worker.imageId)
  if (worker && !workerImage) problems.push(`the image ${TWINAI} runs from (${worker.imageId}) is no longer present`)
  const rollback = (after.images ?? []).filter((i) => i.class === 'twinai-rollback')
  if (rollback.length === 0) problems.push('no twinai-rollback image survives — a bad deploy would be unrecoverable')
  facts.rollbackImages = String(rollback.length)
  const model = after.twinai?.model_path
  if (!model) problems.push('the pinned ASR model path is no longer reported')
  else if (model !== before.twinai?.model_path) problems.push(`the pinned model path moved: ${before.twinai?.model_path} -> ${model}`)
  facts.modelPath = String(model ?? '(missing)')

  return { ok: problems.length === 0, problems, facts }
}

export function render(r) {
  const L = ['== build-cache reclaim ==']
  for (const [k, v] of Object.entries(r.facts)) L.push(`  ${k.padEnd(16)}: ${v}`)
  for (const p of r.problems) L.push(`  PROBLEM: ${p}`)
  L.push(r.ok ? '  RESULT: cache reclaimed; every record, the worker, its image, a rollback image and the pinned model survive'
    : `  RESULT: FAILED (${r.problems.length})`)
  return L.join('\n')
}

// ------------------------------------------------------------------ selftest
function selftest() {
  let failed = 0
  const t = (name, got, exp) => {
    if (got === exp) console.log(`  ok: ${name}`)
    else { console.error(`SELFTEST FAIL: ${name} => ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); failed++ }
  }
  const base = () => ({
    containers: [{ name: TWINAI, status: 'running', imageId: 'sha256:aaa' }, { name: 'stylique-os', status: 'restarting', imageId: 'sha256:bbb' }],
    images: [{ id: 'sha256:aaa', class: 'active-twinai' }, { id: 'sha256:prev', class: 'twinai-rollback' }, { id: 'sha256:bbb', class: 'retire-scope' }],
    volumes: [{ name: 'oo-data' }], networks: [{ name: 'styliquenet' }],
    dockerDf: [{ type: 'Build Cache', total: 380, active: 0, size: '68.3GB', sizeBytes: 68300000000, reclaimable: '65.1GB' }],
    fs: { root: { totalKb: 157155328, usedKb: 126152192, availKb: 24567296, usedPct: 84 } },
    twinai: { model_path: '/opt/models/faster-whisper-small' },
  })
  const reclaimed = () => {
    const a = base()
    a.dockerDf[0] = { type: 'Build Cache', total: 12, active: 0, size: '3.2GB', sizeBytes: 3200000000, reclaimable: '0B' }
    a.fs.root.usedKb = 62592000; a.fs.root.availKb = 88127488; a.fs.root.usedPct = 41
    return a
  }
  const clone = (o) => JSON.parse(JSON.stringify(o))

  t('toBytes GB', toBytes('68.3GB'), 68300000000)
  t('toBytes junk', toBytes('n/a'), null)

  console.log('-- the happy path')
  const good = assess(base(), reclaimed())
  t('POSITIVE: a real reclaim passes', good.ok, true)
  t('…and reports what was freed', good.facts.cacheReclaimed, '65.10 GB')

  console.log('-- THE NO-OP. A prune that reclaimed nothing must not pass.')
  t('an unchanged cache FAILS', assess(base(), base()).ok, false)
  t('…and says so in words', assess(base(), base()).problems.some((p) => /did NOT shrink/.test(p)), true)
  const grew = clone(reclaimed()); grew.dockerDf[0].sizeBytes = 99000000000; grew.dockerDf[0].size = '99GB'
  t('a cache that GREW fails', assess(base(), grew).ok, false)
  const noRowAfter = clone(reclaimed()); noRowAfter.dockerDf = []
  t('a missing after build-cache row fails', assess(base(), noRowAfter).ok, false)
  const noRowBefore = clone(base()); noRowBefore.dockerDf = []
  t('a missing before build-cache row fails', assess(noRowBefore, reclaimed()).ok, false)

  console.log('-- disk must actually move the right way')
  const noDisk = clone(reclaimed()); noDisk.fs.root.availKb = 1000
  t('free space going DOWN fails', assess(base(), noDisk).ok, false)
  const noFs = clone(reclaimed()); delete noFs.fs
  t('a missing filesystem reading fails', assess(base(), noFs).ok, false)

  console.log('-- nothing else may have moved')
  for (const [label, mutate] of [
    ['a container disappeared', (a) => { a.containers = a.containers.filter((c) => c.name !== 'stylique-os') }],
    ['an image disappeared', (a) => { a.images = a.images.filter((i) => i.id !== 'sha256:bbb') }],
    ['a volume disappeared', (a) => { a.volumes = [] }],
    ['a network disappeared', (a) => { a.networks = [] }],
    ['a container appeared', (a) => { a.containers.push({ name: 'x', status: 'running', imageId: 'sha256:aaa' }) }],
  ]) {
    const a = clone(reclaimed()); mutate(a)
    t(`${label} -> FAIL`, assess(base(), a).ok, false)
  }
  // THE CASE A COUNT CANNOT SEE. One image deleted, one appeared: the list is
  // the same length and every count-based check passes. Survival is a statement
  // about WHICH records exist, so it is compared by identity.
  const swapped = clone(reclaimed())
  swapped.images = swapped.images.filter((i) => i.id !== 'sha256:bbb')
  swapped.images.push({ id: 'sha256:new', class: 'unknown-do-not-touch' })
  t('SWAP: same count, different records -> FAIL', assess(base(), swapped).ok, false)
  t('…and it names both sides', (() => {
    const p = assess(base(), swapped).problems.join(' | ')
    return /sha256:bbb/.test(p) && /sha256:new/.test(p)
  })(), true)
  t('CONTROL: a count-only check would NOT have caught it',
    clone(reclaimed()).images.length === swapped.images.length, true)
  // A record with no key at all cannot be compared by identity, and quietly
  // comparing nothing is exactly what this replaced.
  const keyless = clone(reclaimed()); keyless.volumes = [{ mountpoint: '/x' }]
  t('a record with no key -> FAIL', assess(base(), keyless).ok, false)

  console.log('-- the protected facts are re-checked here too')
  const noWorker = clone(reclaimed()); noWorker.containers = noWorker.containers.filter((c) => c.name !== TWINAI)
  t('the worker vanishing fails', assess(base(), noWorker).ok, false)
  const stoppedWorker = clone(reclaimed()); stoppedWorker.containers[0].status = 'exited'
  t('the worker no longer running fails', assess(base(), stoppedWorker).ok, false)
  const noWorkerImage = clone(reclaimed())
  noWorkerImage.images = noWorkerImage.images.filter((i) => i.id !== 'sha256:aaa')
  t('the worker\'s own image vanishing fails', assess(base(), noWorkerImage).ok, false)
  const noRollback = clone(reclaimed())
  noRollback.images = noRollback.images.filter((i) => i.class !== 'twinai-rollback')
  t('losing the last rollback image fails', assess(base(), noRollback).ok, false)
  const movedModel = clone(reclaimed()); movedModel.twinai.model_path = '/opt/models/other'
  t('the pinned model path moving fails', assess(base(), movedModel).ok, false)
  const noModel = clone(reclaimed()); delete noModel.twinai
  t('the model path going missing fails', assess(base(), noModel).ok, false)
  // …and one more positive, so the whole block above cannot be passing because
  // assess() simply refuses everything.
  t('CONTROL: the untouched happy path still passes', assess(base(), reclaimed()).ok, true)
  t('an active build after the prune fails', (() => {
    const a = clone(reclaimed()); a.dockerDf[0].active = 3; return assess(base(), a).ok
  })(), false)

  if (failed) { console.error(`cache-reclaim selftest: ${failed} failed`); process.exit(1) }
  console.log('cache-reclaim selftest: all cases passed'); process.exit(0)
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (!isEntry) { /* imported for its exports */ }
else if (process.argv.includes('--selftest')) selftest()
else {
  const [, , beforeF, afterF] = process.argv
  if (!beforeF || !afterF) { console.error('usage: assert_cache_reclaim.mjs <before.json> <after.json>'); process.exit(2) }
  let before; let after
  try { before = JSON.parse(readFileSync(beforeF, 'utf8')) }
  catch (e) { console.error(`::error::before inventory ${beforeF} is missing or invalid: ${e.message}`); process.exit(1) }
  try { after = JSON.parse(readFileSync(afterF, 'utf8')) }
  catch (e) { console.error(`::error::after inventory ${afterF} is missing or invalid: ${e.message}`); process.exit(1) }
  const r = assess(before, after)
  console.log(render(r))
  if (!r.ok) { console.error('::error::the build-cache reclaim did not do what it claimed, or did more'); process.exit(1) }
}
