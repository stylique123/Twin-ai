// The private leak-check pattern for batchAudit.mjs lives OUTSIDE the repo: it names
// details of a real creator's private stories, and this repository is public.
// Source, in order:
//   1. env BATCH_AUDIT_LEAK_PATTERN (a repository secret/variable, or set locally);
//   2. the gitignored file scripts/ops/.private/leak-pattern.txt (first non-blank line).
// Neither present: the check is reported as NOT RUN (never as clean).
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const LEAK_PATTERN_ENV = 'BATCH_AUDIT_LEAK_PATTERN'
export const DEFAULT_LEAK_PATTERN_FILE = join(dirname(fileURLToPath(import.meta.url)), '.private', 'leak-pattern.txt')

/** @returns {{ regex: RegExp | null, status: 'run' | 'not run', source: string, reason?: string }} */
export function loadLeakPattern({ env = process.env, file = DEFAULT_LEAK_PATTERN_FILE } = {}) {
  let raw = null
  let source = ''
  if (env[LEAK_PATTERN_ENV] && env[LEAK_PATTERN_ENV].trim()) {
    raw = env[LEAK_PATTERN_ENV].trim()
    source = `env ${LEAK_PATTERN_ENV}`
  } else if (file && existsSync(file)) {
    raw = readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#')) ?? null
    source = 'private file'
  }
  if (!raw) return { regex: null, status: 'not run', source: 'none', reason: `neither ${LEAK_PATTERN_ENV} nor the private pattern file is set` }
  try {
    return { regex: new RegExp(raw, 'i'), status: 'run', source }
  } catch {
    // Never echo the pattern itself: it is private.
    return { regex: null, status: 'not run', source, reason: `the pattern from ${source} is not a valid regular expression` }
  }
}
