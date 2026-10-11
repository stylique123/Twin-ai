// THE EDGE COPY OF `testAccount.ts` MUST BE THE SHARED ONE, BYTE FOR BYTE.
//
// It decides which accounts are test accounts (excluded from every corpus and
// lesson) and when the invention gate measures instead of repairing. If the
// copies drift, the tests prove one rule and the edge runs another.
//
//   node scripts/ci/check_test_account_parity.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')
const SOURCE = join(REPO, 'packages', 'shared', 'src', 'script', 'testAccount.ts')
const COPY = join(REPO, 'supabase', 'functions', '_shared', 'testAccount.ts')

const a = readFileSync(SOURCE, 'utf8').split('\n')
const b = readFileSync(COPY, 'utf8').split('\n')
for (let k = 0; k < Math.max(a.length, b.length); k++) {
  if (a[k] !== b[k]) {
    console.error(`testAccount.ts drifted at line ${k + 1}:\n  shared: ${a[k] ?? '(missing)'}\n  edge:   ${b[k] ?? '(missing)'}\nFix: cp packages/shared/src/script/testAccount.ts supabase/functions/_shared/testAccount.ts`)
    process.exit(1)
  }
}
console.log('testAccount.ts: edge copy matches shared')
