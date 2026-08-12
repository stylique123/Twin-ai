// A FILE THE CODE READS AT RUNTIME MUST BE IN THE IMAGE THAT RUNS IT.
//
// ⚠️ THE DEFECT, EXACTLY. `model_routing_v1.json` was committed, tested, read by
// `modelRouting.ts` on the first `modelForTask()` — and never COPYed into the
// runtime stage of the Dockerfile. Every Gemini call in the worker therefore
// failed with `ENOENT: /app/model_routing_v1.json`: voice synthesis, caption
// knowledge extraction, structure derivation. `scrape_dna` told creators "We
// could not finish building your voice" AFTER successfully scraping their posts.
//
// ⚖️ AND `analysis_rules_v1.json` SAT ONE LINE ABOVE IT, COPIED. Two files of
// the same kind — a frozen JSON authority read at runtime — and only one
// travelled. Nothing in CI could see the difference, because the tests run from
// a checkout where BOTH files are simply present on disk. That is the shape:
// the suite proves the code works in a place the code does not run.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DOCKERFILE = readFileSync(join(REPO, 'worker/Dockerfile'), 'utf8')

/** Every `*_v1.json` the worker's own source names as a file it opens. Derived
 *  from the source rather than listed here on purpose: a hand-kept list is a
 *  second thing to remember, and forgetting it is the bug this test is about. */
function referencedAssets(): string[] {
  const src = execSync(
    "git ls-files 'worker/src/*.ts' 'worker/src/**/*.ts' | grep -v __tests__",
    { cwd: REPO, encoding: 'utf8' },
  ).split('\n').filter(Boolean)
  const found = new Set<string>()
  for (const f of src) {
    const body = readFileSync(join(REPO, f), 'utf8')
    // Only literals inside a join()/readFileSync() argument — a name that
    // appears in prose is documentation, not a read.
    for (const m of body.matchAll(/(?:join\([^)]*?|readFileSync\(\s*)['"]([\w.-]+_v\d+\.json)['"]/g)) {
      found.add(m[1])
    }
  }
  return [...found]
}

describe('runtime assets ship in the image that reads them', () => {
  const assets = referencedAssets()

  it('finds the assets by reading the source, not a hand-kept list', () => {
    // If this ever returns nothing, the detector broke and every assertion
    // below would pass vacuously — the exact failure mode of the first ladder
    // measurement, which reported a flawless 0% because its precondition made
    // the failing case unreachable.
    expect(assets.length).toBeGreaterThan(0)
    expect(assets).toContain('model_routing_v1.json')
  })

  it('every one of them exists in the repo', () => {
    for (const a of assets) {
      expect(existsSync(join(REPO, 'worker', a)), `${a} is read but not committed`).toBe(true)
    }
  })

  it('every one of them is COPYed into the runtime stage', () => {
    // ⚠️ THE RUNTIME STAGE, NOT THE BUILDER. The builder copies `src` wholesale
    // and compiles it, so a file can be present at BUILD time and absent from
    // the shipped image — which is precisely what happened. Everything after
    // the second FROM is what actually runs.
    const runtime = DOCKERFILE.slice(DOCKERFILE.lastIndexOf('\nFROM '))
    for (const a of assets) {
      // ⚠️ THE DESTINATION IS HALF THE ASSERTION, AND OMITTING IT PASSED A FILE
      // THAT IS NOT IN THE APP. `render_catalog_v1.json` is COPYed to /tmp for a
      // BUILD-TIME font digest check and never into /app — so a check that only
      // looked for `COPY <name>` reported it shipped while the runtime read of
      // it would throw the same ENOENT this whole test exists for.
      const name = a.replace('.', '\\.')
      expect(runtime, `${a} is read at runtime but never COPYed into the app directory`)
        .toMatch(new RegExp(`^COPY\\s+${name}\\s+(?:\\./)?(?:/app/)?${name}\\s*$`, 'm'))
    }
  })
})
