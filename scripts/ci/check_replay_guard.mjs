#!/usr/bin/env node
// OFFLINE REPLAY GUARD (plan v6.1 §27). Replays the stored FICTIONAL panel
// 10/11 scripts through the deterministic post-writer stages with the current
// code and compares to scripts/ci/replay_guard_baseline.json. Exits 1 on any
// violation. No paid calls, no network. Logic: packages/shared/src/script/replayGuard.ts
// (also run by vitest in the required `Install + test @twinai/shared` step).
//   node scripts/ci/check_replay_guard.mjs            check
//   node scripts/ci/check_replay_guard.mjs --print    print metrics only
import { buildSync } from 'esbuild'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const dir = mkdtempSync(join(tmpdir(), 'replay-guard-'))
const out = join(dir, 'replayGuard.mjs')
try {
  buildSync({ entryPoints: [join(root, 'packages/shared/src/script/replayGuard.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' })
  const g = await import(pathToFileURL(out).href)
  const fixture = JSON.parse(readFileSync(join(here, 'fixtures/replay_panel_10_11.json'), 'utf8'))
  const baseline = JSON.parse(readFileSync(join(here, 'replay_guard_baseline.json'), 'utf8'))
  const m = g.replayByPanel(fixture.cases)
  console.log(`replay guard: ${JSON.stringify(m)}`)
  console.log(`baseline:     ${JSON.stringify(baseline)}`)
  if (!process.argv.includes('--print')) {
  const v = g.compareToBaseline(m, baseline)
  if (v.length) { for (const x of v) console.error(`  ✗ ${x}`); console.error('replay guard FAILED — block the merge (plan v6.1 §27)'); process.exitCode = 1 }
  else console.log('replay guard OK')
  }
} finally { rmSync(dir, { recursive: true, force: true }) }
