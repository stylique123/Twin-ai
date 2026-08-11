// THE TAXONOMY EXISTS IN THREE PLACES AND MUST AGREE IN ALL THREE.
//
// `KNOWLEDGE_KINDS` here, a hand-copied array in `worker/src/jobs/voice.ts`, and
// the `creator_knowledge_kind_valid` CHECK in migration 0121. The worker copy is
// deliberate — it has no @twinai/shared runtime dep (see directorContract.ts) —
// but "deliberate duplicate" only stays safe while something compares them.
//
// ⚠️ WHAT DRIFT COSTS. The worker filters extracted items against its copy
// before insert, because an unlisted kind fails the CHECK and takes the whole
// batch with it. Add a kind to shared and 0121 without the worker, and every
// item of that kind is silently dropped for as long as nobody notices — which,
// measured on a real corpus, looks exactly like the creator never saying it.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/** ⚖️ RELATIVE TO THIS FILE, NEVER TO THE WORKING DIRECTORY. These reads used
 *  `../../…`, which resolves against CWD — so the test passed from
 *  `packages/shared` and threw ENOENT from the repo root. A test whose result
 *  depends on where it was invoked from reports on the invocation. */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

import { describe, expect, it } from 'vitest'
import { KNOWLEDGE_KINDS } from '../creatorKnowledge'

const WORKER = readFileSync(join(REPO, 'worker/src/jobs/voice.ts'), 'utf8')
const MIGRATION = readFileSync(join(REPO, 'supabase/migrations/0121_creator_knowledge.sql'), 'utf8')

function liftArray(src: string, name: string, where: string): string[] {
  const m = src.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`))
  if (!m) throw new Error(`could not lift ${name} from ${where} — fix the marker, do not inline the list`)
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
}

describe('the knowledge taxonomy agrees everywhere it is written down', () => {
  it('the worker filter matches shared, in content and in order', () => {
    expect(liftArray(WORKER, 'KNOWLEDGE_KINDS_WORKER', 'the worker'))
      .toEqual([...KNOWLEDGE_KINDS])
  })

  it('the database CHECK admits exactly the same set', () => {
    // The constraint is the last word: anything shared allows and the CHECK
    // refuses is a batch that fails at 3am with a constraint violation.
    const check = MIGRATION.match(/creator_knowledge_kind_valid check \(\s*kind in \(([^)]*)\)/)
    expect(check, 'could not find the kind CHECK in 0121').toBeTruthy()
    const inDb = [...check![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
    expect(inDb.slice().sort()).toEqual([...KNOWLEDGE_KINDS].sort())
  })

  it('the worker rejects a kind the model invented rather than passing it on', () => {
    // MEASURED on a real 501-caption corpus: 10 of 489 items came back as
    // `action` or `tool`. Neither is in the taxonomy, and both would fail the
    // CHECK — so the filter must not contain them.
    const worker = liftArray(WORKER, 'KNOWLEDGE_KINDS_WORKER', 'the worker')
    expect(worker).not.toContain('action')
    expect(worker).not.toContain('tool')
  })

  it('a rejected kind is REPORTED, not silently dropped', () => {
    // Dropping is correct; dropping in silence is how a systematic gap in the
    // taxonomy becomes indistinguishable from nothing happening.
    expect(WORKER).toMatch(/knowledge_kind_rejected/)
  })
})
