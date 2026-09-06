// `completed` IS A STATEMENT ABOUT THE PIPELINE, NEVER ABOUT A VIDEO EXISTING.
//
// ⚠️ THE SCAFFOLD PATH REACHES `completed` WITH NO OUTPUT ON PURPOSE. With
// EDITOR_RENDER_ENABLED unset, compile and render are simulated and the project
// still reaches `completed` with `output_asset_id` NULL — and 0096's completion
// trigger permits it. So `status === 'completed'` says the pipeline stopped, not
// that there is something to watch.
//
// ⚖️ `contracts.ts` ALREADY SOLVED THIS, AND NOTHING KEPT IT SOLVED. It names the
// conjunction once as `editProducedVideo` / `editFinishedWithoutVideo` and
// explains why: a site that spells the conjunction out by hand is one refactor
// away from dropping the second half, and dropping it is SILENT — a player with
// no source, craft checks about a render that never happened, a "done" badge on
// nothing. It is wrong exactly on the runs that finished empty, which is the
// population nobody has fixtures for.
//
// ⚠️ SO THE PROPERTY HELD BY LUCK, NOT BY ENFORCEMENT. Grepped 2026-09-05: zero
// bare callers today. Nothing stopped the next one. This is the enforcement.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { editProducedVideo, editFinishedWithoutVideo } from '../editor/contracts'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

/** The one file allowed to spell the conjunction out: it IS the definition. */
const HOME = 'packages/shared/src/editor/contracts.ts'

const ROOTS = [
  'apps/web/src', 'packages/shared/src', 'supabase/functions', 'worker/src',
]

function* sources(dir: string): Generator<string> {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return }
  for (const e of entries) {
    const p = join(dir, e)
    if (e === 'node_modules' || e === 'dist') continue
    if (statSync(p).isDirectory()) { yield* sources(p); continue }
    if (/\.(ts|tsx)$/.test(e)) yield p
  }
}

/** ⚠️ CODE LINES ONLY, AND WHOLE-LINE COMMENTS ONLY. This subject is heavily
 *  commented — `contracts.ts` discusses `status === 'completed'` in prose at
 *  length — and a guard that matched those would fire on the very file that
 *  fixes the bug. Stripping everything after `//` instead would delete a real
 *  call that trails a string containing a URL, which is the failure this repo
 *  has already recorded twice. */
function codeLines(src: string): { line: string; n: number }[] {
  return src.split('\n').map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => {
      const t = line.trim()
      return t !== '' && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
}

describe('nothing asks "is it done" by comparing a status', () => {
  it('has no bare `status === \'completed\'` outside contracts.ts', () => {
    const offenders: string[] = []
    let scanned = 0
    for (const root of ROOTS) {
      for (const file of sources(join(REPO, root))) {
        const rel = relative(REPO, file).split('\\').join('/')
        if (rel === HOME) continue
        if (/\.test\.tsx?$/.test(rel)) continue
        scanned++
        for (const { line, n } of codeLines(readFileSync(file, 'utf8'))) {
          if (/===\s*'completed'/.test(line) || /===\s*"completed"/.test(line)) {
            offenders.push(`${rel}:${n}  ${line.trim()}`)
          }
        }
      }
    }
    // Guards the guard: an empty walk would make this pass vacuously.
    expect(scanned, 'no sources were scanned — the roots moved').toBeGreaterThan(200)
    expect(
      offenders,
      'Use editProducedVideo() or editFinishedWithoutVideo() from '
      + '@twinai/shared. `completed` alone is true of runs that finished with '
      + `no video:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  // ⚖️ AND THE PREDICATES MUST ACTUALLY SPLIT THE STATE, or the rule above would
  // be pointing callers at something that does not answer their question.
  it('the two predicates disagree on exactly the empty-completed case', () => {
    const done = { status: 'completed', output_asset_id: 'asset_1' } as never
    const empty = { status: 'completed', output_asset_id: null } as never
    const running = { status: 'rendering', output_asset_id: null } as never

    expect(editProducedVideo(done)).toBe(true)
    expect(editFinishedWithoutVideo(done)).toBe(false)

    // ⚠️ THE RUN THE SCAFFOLD PRODUCES. A bare status check calls this a success.
    expect(editProducedVideo(empty)).toBe(false)
    expect(editFinishedWithoutVideo(empty)).toBe(true)

    // Neither is true before the pipeline stops.
    expect(editProducedVideo(running)).toBe(false)
    expect(editFinishedWithoutVideo(running)).toBe(false)

    for (const nothing of [null, undefined]) {
      expect(editProducedVideo(nothing)).toBe(false)
      expect(editFinishedWithoutVideo(nothing)).toBe(false)
    }
  })
})
