// THE COMPARISON IS WIRED, AND THIS KEEPS IT WIRED.
//
// ⚠️ `referenceBorrowingBaseline` ends in a test that SKIPS without a key and
// throws `UNWIRED` with one. `scripts/qa/borrowing-rerun.mjs` is that
// comparison, built. But a harness nobody runs between key-having sessions rots
// silently — and the failure would surface as a bad measurement, not an error.
//
// ⚖️ SO ITS DRY RUN IS EXERCISED HERE. `--dry-run` does everything except the
// model call: bundles the REAL `measureVerbatimOverlap` with esbuild, loads the
// four fixtures, asserts arm symmetry, and re-derives the frozen figures. If
// the bundled measure ever disagrees with the baseline this file's suite pins,
// the harness would be comparing against a different stick than the "before" it
// is meant to improve on.
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

function dryRun(): { stdout: string; stderr: string } {
  let stderr = ''
  const stdout = execFileSync(
    process.execPath,
    [join(REPO, 'scripts/qa/borrowing-rerun.mjs'), '--dry-run'],
    { cwd: REPO, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  return { stdout, stderr }
}

describe('the borrowing comparison harness', () => {
  it('dry-runs clean and re-derives the frozen 26 / 4 / 17', () => {
    const { stdout } = dryRun()
    const out = JSON.parse(stdout) as {
      dryRun?: boolean
      measure: { name: string; highOverlapRunWords: number }
      rows: Array<{ run: string; sentences: number; high: number; longestRun: number }>
    }
    expect(out.dryRun).toBe(true)
    // ⚠️ THE MEASURE IS THE SHIPPED ONE, NOT A COPY — the harness bundles it.
    expect(out.measure.name).toBe('measureVerbatimOverlap')
    expect(out.measure.highOverlapRunWords).toBe(6)

    const total = out.rows.reduce((a, r) => ({
      sentences: a.sentences + r.sentences,
      high: a.high + r.high,
      worst: Math.max(a.worst, r.longestRun),
    }), { sentences: 0, high: 0, worst: 0 })
    expect(total).toEqual({ sentences: 26, high: 4, worst: 17 })
  })

  // ⚖️ run-b IS THE NEGATIVE CONTROL AND ITS VALUE IS THAT IT IS ZERO. A
  // comparison whose control already shows overlap cannot tell a reduction from
  // noise, so its frozen zero is worth pinning separately.
  it('keeps run-b at zero high-overlap sentences, frozen', () => {
    const out = JSON.parse(dryRun().stdout) as { rows: Array<{ run: string; high: number }> }
    expect(out.rows.find((r) => r.run === 'b')?.high).toBe(0)
  })

  // ⚠️ AND IT MUST REFUSE, LOUDLY, WITHOUT A KEY. A harness that returned an
  // empty result instead of failing would read as "no borrowing found".
  it('refuses to run without a model key rather than returning nothing', () => {
    let failed = false
    let stderr = ''
    try {
      execFileSync(process.execPath, [join(REPO, 'scripts/qa/borrowing-rerun.mjs')], {
        cwd: REPO, encoding: 'utf8', timeout: 60_000,
        env: { ...process.env, GEMINI_API_KEY: '' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      failed = true
      stderr = String((e as { stderr?: string }).stderr ?? '')
    }
    expect(failed, 'the harness exited 0 without a key — it must fail instead').toBe(true)
    expect(stderr).toMatch(/CANNOT run without a model call/)
  })
})
