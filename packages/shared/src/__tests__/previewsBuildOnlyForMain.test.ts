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
} & Record<string, unknown>

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

// ⚠️ AND THE CONFIG MUST BE ONE VERCEL WILL ACCEPT AT ALL. I tried to document
// this decision inside vercel.json as an "_ignoreCommand" array of prose, and
// every deployment then failed with:
//   The `vercel.json` schema validation failed with the following message:
//   should NOT have additional property `_ignoreCommand`
// The schema rejects unknown keys and JSON takes no comments, so the rationale
// belongs HERE, in the guard, which this repo already argues is where a rule
// lives. The failure came before ignoreCommand was ever evaluated -- a config
// typo does not break one branch, it breaks every deploy including production.
describe('vercel will accept this file', () => {
  const ALLOWED = new Set([
    '$schema', 'ignoreCommand', 'installCommand', 'buildCommand',
    'outputDirectory', 'rewrites', 'headers', 'redirects', 'git', 'github',
    'framework', 'devCommand', 'regions', 'functions', 'crons', 'cleanUrls',
    'trailingSlash', 'public', 'installCommand',
  ])

  it('carries no key Vercel would reject', () => {
    for (const k of Object.keys(cfg as Record<string, unknown>)) {
      expect(ALLOWED.has(k), `${k} is not a documented vercel.json property`).toBe(true)
    }
  })

  // ⚖️ THE SPECIFIC SHAPE OF MY MISTAKE. An underscore-prefixed key looks like a
  // conventional "ignore me" marker and is not one.
  it('has no underscore-prefixed pseudo-comment keys', () => {
    for (const k of Object.keys(cfg as Record<string, unknown>)) {
      expect(k.startsWith('_'), `${k} is a comment pretending to be config`).toBe(false)
    }
  })
})

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
