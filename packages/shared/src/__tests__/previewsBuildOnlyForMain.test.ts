import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

// ⚠️ THIS GUARD RUNS THE ACTUAL COMMAND IN AN ACTUAL SHELL. Asserting on the
// STRING would prove only that somebody typed something plausible; the whole
// mechanism is an exit code, and an inverted one disables production deploys
// while looking correct in a diff.

const repo = join(import.meta.dirname, '..', '..', '..', '..')
const cfg = JSON.parse(readFileSync(join(repo, 'vercel.json'), 'utf8')) as {
  ignoreCommand?: string
}

/** Returns Vercel's meaning: exit 0 = build skipped, exit 1 = build proceeds. */
function decide(ref: string | undefined): 'skipped' | 'builds' {
  const cmd = cfg.ignoreCommand
  if (typeof cmd !== 'string' || cmd === '') throw new Error('no ignoreCommand')
  try {
    execFileSync('sh', ['-c', cmd], {
      env: ref === undefined ? { PATH: process.env.PATH ?? '' }
        : { PATH: process.env.PATH ?? '', VERCEL_GIT_COMMIT_REF: ref },
      stdio: 'ignore',
    })
    return 'skipped'   // exit 0
  } catch {
    return 'builds'    // non-zero
  }
}

describe('the command exists at all', () => {
  it('vercel.json sets ignoreCommand', () => {
    expect(typeof cfg.ignoreCommand).toBe('string')
    expect(cfg.ignoreCommand).not.toBe('')
  })
})

describe('production still deploys', () => {
  // ⚠️ THE CASE THAT MUST NEVER BREAK. Everything else here is a cost saving;
  // this one is the product being shipped.
  it('main builds', () => {
    expect(decide('main')).toBe('builds')
  })
})

describe('branches do not', () => {
  it.each([
    'u2-the-gallery-reads-what-they-asked-for',
    'pin-supabase-cli-everywhere',
    'rebuild/editor-v2-transcript-schema-fix',
    'claude/twinai-script-content-wiring-nsgr1w',
    'mainline',      // ⚖️ NOT main. A prefix match here would be a silent bug.
    'not-main',
  ])('%s is skipped', (ref) => {
    expect(decide(ref)).toBe('skipped')
  })
})

describe('an absent ref fails OPEN, which is the whole asymmetry', () => {
  // ⚠️ THE BUG I WROTE FIRST AND CAUGHT BY RUNNING IT. A bare
  // `[ "$REF" != "main" ]` exits 0 on an empty ref — so an unset variable would
  // SKIP, and production would quietly stop deploying. That is the same shape as
  // the edge deploy that died at setup and left main looking healthy with stale
  // functions: a deploy nobody notices did not happen.
  //
  // ⚖️ SO THE MISSING CASE BUILDS. A wasted build is a rounding error; a
  // silently undeployed production is the failure this repo has already had.
  it('an empty ref builds', () => {
    expect(decide('')).toBe('builds')
  })

  it('an unset ref builds', () => {
    expect(decide(undefined)).toBe('builds')
  })
})
