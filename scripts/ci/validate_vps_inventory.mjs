#!/usr/bin/env node
// Fail-closed validator for the Phase 8 Gate-0 VPS capacity inventory.
//
// The REPORT is informational — it must never fail the vps-diag sign-off, because a
// capacity fact is evidence, not a gate. But GATE-0 ACCEPTANCE is a different question:
// a Gate-0 row cannot be closed on an inventory whose facts are missing, null, out of
// range, or substituted. This validator is that acceptance check, and it fails closed.
//
// Run:  node scripts/ci/validate_vps_inventory.mjs <path>   validate a real report
//       node scripts/ci/validate_vps_inventory.mjs --selftest   hostile cases
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// Ranges are deliberately WIDE. Their job is to catch a broken/substituted capture
// (zero CPUs, absent RAM, a 4 EiB disk from a parse error), not to encode an opinion
// about what hardware we ought to have. A plausible-but-wrong value that sits inside
// these bounds is caught by the semantic checks below instead.
const REQUIRED = {
  'cpu.count': { min: 1, max: 512 },
  'memory.total_kb': { min: 512 * 1024, max: 4096 * 1024 * 1024 },
  'memory.available_kb': { min: 0, max: 4096 * 1024 * 1024 },
  'disk.root_avail_kb': { min: 0, max: 1024 * 1024 * 1024 },
  'disk.docker_avail_kb': { min: 0, max: 1024 * 1024 * 1024 },
  'disk.container_tmp_avail_kb': { min: 0, max: 1024 * 1024 * 1024 },
  'swap.total_kb': { min: 0, max: 1024 * 1024 * 1024 },
  'container.restarts': { min: 0, max: 100000 },
  'host.uptime_s': { min: 1, max: 10 * 365 * 24 * 3600 },
}
// Non-numeric facts that must be present and non-empty.
const REQUIRED_STR = [
  'cpu.model',
  'container.status',
  'container.health',
  'container.image_id',
  'container.image_ref',
  'worker.deployed_sha',
  'worker.registry',
  'media.ffmpeg_version',
]

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o)

export function validateInventory(inv) {
  const errs = []
  if (!inv || typeof inv !== 'object') return ['report is not an object']
  if (inv.schema !== 'vps-inventory-1') errs.push(`schema: expected vps-inventory-1, got ${JSON.stringify(inv.schema)}`)

  // ---- integrity: recompute the hash over the body WITHOUT report_sha256 ----------
  // A substituted report is the case that matters: someone (or a broken step) swaps in
  // facts from a different host or an older run. Recomputing proves the numbers below
  // are the ones the reporter actually hashed.
  const declared = inv.report_sha256
  if (typeof declared !== 'string' || !/^[0-9a-f]{64}$/.test(declared)) {
    errs.push('report_sha256 missing or not 64-hex')
  } else {
    const { report_sha256: _omit, ...body } = inv
    const recomputed = createHash('sha256').update(canonical(body)).digest('hex')
    if (recomputed !== declared) errs.push(`report_sha256 mismatch: declared ${declared.slice(0, 12)}… recomputed ${recomputed.slice(0, 12)}…`)
  }

  // ---- required numeric facts, present and in range ------------------------------
  for (const [path, { min, max }] of Object.entries(REQUIRED)) {
    const v = get(inv, path)
    if (v === undefined || v === null) { errs.push(`${path}: missing/null`); continue }
    if (typeof v !== 'number' || !Number.isFinite(v)) { errs.push(`${path}: not a finite number (${JSON.stringify(v)})`); continue }
    if (v < min || v > max) errs.push(`${path}: ${v} outside [${min}, ${max}]`)
  }
  // ---- required string facts, present and non-empty ------------------------------
  for (const path of REQUIRED_STR) {
    const v = get(inv, path)
    if (typeof v !== 'string' || v.trim() === '') errs.push(`${path}: missing/empty`)
  }

  // ---- semantic checks the ranges cannot express ---------------------------------
  const total = get(inv, 'memory.total_kb'), avail = get(inv, 'memory.available_kb')
  if (typeof total === 'number' && typeof avail === 'number' && avail > total) {
    errs.push(`memory.available_kb (${avail}) exceeds total (${total})`)
  }
  const swT = get(inv, 'swap.total_kb'), swF = get(inv, 'swap.free_kb')
  if (typeof swT === 'number' && typeof swF === 'number' && swF > swT) {
    errs.push(`swap.free_kb (${swF}) exceeds total (${swT})`)
  }
  // ffprobe must be PROVEN present: the validator/renderer cannot work without it.
  if (String(get(inv, 'media.ffprobe_ok')) !== '1') errs.push('media.ffprobe_ok is not 1 (ffprobe unavailable)')
  // The deployed SHA must be a real commit id, not a placeholder or empty capture.
  const sha = get(inv, 'worker.deployed_sha')
  if (typeof sha === 'string' && !/^[0-9a-f]{40}$/.test(sha)) errs.push(`worker.deployed_sha not 40-hex: ${JSON.stringify(sha)}`)
  // Host-key pinning must be PROVEN, not asserted. See the workflow: the marker is only
  // written after a StrictHostKeyChecking=yes session returns 0.
  if (get(inv, 'ssh.strict_host_key_verified') !== true) errs.push('ssh.strict_host_key_verified is not true')
  const kh = get(inv, 'ssh.known_hosts_sha256')
  if (typeof kh !== 'string' || !/^[0-9a-f]{64}$/.test(kh)) errs.push('ssh.known_hosts_sha256 missing or not 64-hex')

  // The container must actually be up; a stopped container's facts describe nothing.
  const st = get(inv, 'container.status')
  if (st && st !== 'running') errs.push(`container.status is ${st}, expected running`)
  return errs
}

// Canonical JSON identical to the reporter's: sorted keys, no whitespace.
export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined)
      .map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
  }
  return JSON.stringify(v)
}

function withHash(o) { return { ...o, report_sha256: createHash('sha256').update(canonical(o)).digest('hex') } }

function good() {
  return withHash({
    schema: 'vps-inventory-1',
    cpu: { count: 4, model: 'Intel Xeon E3-1275' },
    memory: { total_kb: 16303456, available_kb: 11220044 },
    swap: { total_kb: 0, free_kb: 0 },
    disk: { root_avail_kb: 41234567, root_used_pct: 38, docker_avail_kb: 41234567, container_tmp_avail_kb: 40000000 },
    container: { status: 'running', health: 'healthy', restarts: 0, created: '2026-07-01T00:00:00Z', started: '2026-07-01T00:00:05Z', image_id: 'sha256:abc', image_ref: 'twinai-worker:latest', image_revision: '7d46dce' },
    worker: { deployed_sha: '7d46dce09bafedd566b7ed40d1082615a2cccd74', registry: 'build_voice,editor_v2,ingest,scrape_dna,validate_source', recent_claim_log_lines: 3 },
    media: { ffmpeg_version: 'ffmpeg version 6.1', ffprobe_ok: '1' },
    host: { uptime_s: 987654, loadavg: '0.1|0.2|0.3', other_container_restarts: 'stylique-os:0 ' },
    ssh: { strict_host_key_verified: true, known_hosts_sha256: 'a'.repeat(64) },
  })
}

function selftest() {
  const cases = []
  const add = (name, mutate, mustMatch) => cases.push({ name, mutate, mustMatch })

  add('baseline is accepted', (o) => o, null)
  // MISSING facts
  add('missing cpu.count', (o) => { delete o.cpu.count; return o }, /cpu\.count: missing/)
  add('null memory.total_kb', (o) => { o.memory.total_kb = null; return o }, /memory\.total_kb: missing/)
  add('missing container tmp disk', (o) => { delete o.disk.container_tmp_avail_kb; return o }, /container_tmp_avail_kb: missing/)
  add('empty cpu.model', (o) => { o.cpu.model = '   '; return o }, /cpu\.model: missing\/empty/)
  add('missing ffmpeg version', (o) => { delete o.media.ffmpeg_version; return o }, /ffmpeg_version: missing/)
  // MALFORMED facts
  add('cpu.count zero', (o) => { o.cpu.count = 0; return o }, /cpu\.count: 0 outside/)
  add('cpu.count as string', (o) => { o.cpu.count = '4'; return o }, /cpu\.count: not a finite number/)
  add('absurd disk', (o) => { o.disk.root_avail_kb = 9e18; return o }, /root_avail_kb: .* outside/)
  add('available RAM exceeds total', (o) => { o.memory.available_kb = o.memory.total_kb + 1; return o }, /exceeds total/)
  add('swap free exceeds total', (o) => { o.swap.free_kb = 1; o.swap.total_kb = 0; return o }, /swap\.free_kb .* exceeds total/)
  add('ffprobe unavailable', (o) => { o.media.ffprobe_ok = '0'; return o }, /ffprobe unavailable/)
  add('short deployed sha', (o) => { o.worker.deployed_sha = '7d46dce'; return o }, /deployed_sha not 40-hex/)
  add('container not running', (o) => { o.container.status = 'exited'; return o }, /status is exited/)
  add('wrong schema', (o) => { o.schema = 'vps-inventory-2'; return o }, /schema: expected/)
  // HOST-KEY PINNING must be proven, not asserted
  add('pinning claimed without proof', (o) => { o.ssh.strict_host_key_verified = false; return o }, /strict_host_key_verified is not true/)
  add('missing known_hosts hash', (o) => { delete o.ssh.known_hosts_sha256; return o }, /known_hosts_sha256 missing/)
  // SUBSTITUTED report — facts swapped after hashing
  add('substituted facts (stale hash)', (o) => { o.cpu.count = 64; return o }, /report_sha256 mismatch/)
  // A whole-report swap from a DIFFERENT host, carrying the original hash. The earlier
  // version of this case substituted an identical body, so the hash legitimately matched
  // and the case proved nothing — a vacuous fixture, caught by its own selftest.
  add('substituted whole body from another host, hash kept', (o) => {
    const h = o.report_sha256
    const other = good()
    other.cpu = { count: 64, model: 'AMD EPYC 7763' }
    other.memory = { total_kb: 528000000, available_kb: 400000000 }
    other.container.image_id = 'sha256:deadbeef'
    other.worker.deployed_sha = 'b'.repeat(40)
    other.report_sha256 = h
    return other
  }, /report_sha256 mismatch/)
  add('hash stripped', (o) => { delete o.report_sha256; return o }, /report_sha256 missing/)

  let fails = 0
  for (const { name, mutate, mustMatch } of cases) {
    const errs = validateInventory(mutate(JSON.parse(JSON.stringify(good()))))
    if (mustMatch === null) {
      if (errs.length) { console.log(`  FAIL  ${name} — expected clean, got: ${errs.join('; ')}`); fails++ }
      else console.log(`  PASS  ${name}`)
    } else if (!errs.some((e) => mustMatch.test(e))) {
      console.log(`  FAIL  ${name} — expected /${mustMatch.source}/, got: ${errs.join('; ') || '(no errors — validator is VACUOUS here)'}`)
      fails++
    } else console.log(`  PASS  ${name} → rejected`)
  }
  console.log(`\nvalidate_vps_inventory selftest: ${cases.length - fails} passed, ${fails} failed`)
  process.exit(fails ? 1 : 0)
}

const arg = process.argv[2]
if (arg === '--selftest') selftest()
else if (!arg) { console.error('usage: validate_vps_inventory.mjs <report.json> | --selftest'); process.exit(2) }
else {
  let inv
  try { inv = JSON.parse(readFileSync(arg, 'utf8')) }
  catch (e) { console.error(`::error::cannot read/parse ${arg}: ${e.message}`); process.exit(1) }
  const errs = validateInventory(inv)
  if (errs.length) {
    for (const e of errs) console.error(`::error::vps inventory invalid — ${e}`)
    console.error('vps-inventory: FAILED — Gate-0 cannot be accepted on an inventory with missing, malformed or substituted facts')
    process.exit(1)
  }
  console.log('vps-inventory: OK — all required facts present, in range, and hash-verified')
}
