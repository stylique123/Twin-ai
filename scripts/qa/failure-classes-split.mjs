#!/usr/bin/env node
// TWO POPULATIONS WEARING ONE ERROR COUNT.
//
// ⚠️ WRITTEN BEFORE THE DATA EXISTS, ON PURPOSE. Today this returns zero rows:
// `download_trace` is NULL on all 222 UNKNOWN_DOWNLOAD_FAILURE references, so
// there is nothing yet to split. A query that returns zero rows is a working
// query. A query that does not exist when the data arrives is how the counts
// get pooled a second time.
//
// ── WHY THIS IS NOT PARANOIA ──────────────────────────────────────────────
//
// 504 TikTok references were reported as "errored". 445 of them are `no_speech`
// — silent videos, correctly recorded, explicitly NOT a failure. Only 45 are
// real blocks. That split was found because somebody thought to ask, not
// because anything computed it, and until it was asked the retryable and the
// permanently-blocked were one number that justified neither retrying nor
// stopping.
//
// ⚖️ AND THE DISTINCTION IS ALREADY DECIDED, NOT INVENTED HERE.
// `RETRYABLE_VIA_PROXY` in worker/src/downloadFailure.ts is the set that says
// which failures may graduate to paid residential egress. This reads THAT set
// rather than restating it, so a code added there widens this report with no
// second edit — the single-authority rule that the refund rule and the claims
// question both cost us before it was learned.
//
//   node scripts/qa/failure-classes-split.mjs --sql        # the query, to run via MCP
//   node scripts/qa/failure-classes-split.mjs --selftest
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')
const out = join(mkdtempSync(join(tmpdir(), 'split-')), 'm.mjs')
await build({
  entryPoints: [join(REPO, 'worker/src/downloadFailure.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
})
const { RETRYABLE_VIA_PROXY, DOWNLOAD_FAILURES } = await import(pathToFileURL(out).href)

const retryable = [...RETRYABLE_VIA_PROXY].sort()
const permanent = DOWNLOAD_FAILURES.filter((c) => !RETRYABLE_VIA_PROXY.has(c)).sort()
const lit = (xs) => xs.map((x) => `'${x}'`).join(', ')

const sql = () => `-- GENERATED from RETRYABLE_VIA_PROXY. Do not hand-edit; re-run --sql.
--   retryable (a different IP might fix it): ${retryable.length}
--   permanent (nothing we buy changes it):   ${permanent.length}
select
  platform,
  case
    when visual_failure_code in (${lit(retryable)}) then 'retryable_via_proxy'
    when visual_failure_code in (${lit(permanent)}) then 'permanent_or_unpayable'
    else 'uncoded'
  end                                                        as class,
  visual_failure_code,
  count(*)                                                    as n,
  -- ⚠️ THE RESIDUE IS WHAT MAKES AN UNKNOWN INVESTIGABLE. A row with a code and
  -- no trace is the 222 all over again; counting them separately says whether
  -- the next sweep produced diagnosable failures or another lump.
  count(*) filter (where download_trace is not null)          as with_residue,
  count(*) filter (where download_trace is null)              as no_residue
from public.reference_content_profiles
where visual_failure_code is not null
group by 1, 2, 3
order by 1, 2, 4 desc;`

if (process.argv.includes('--selftest')) {
  let bad = 0
  const fail = (m) => { console.error(`selftest: ${m}`); bad++ }
  // ⚠️ AN EMPTY SET WOULD MAKE EVERY ROW 'permanent' AND READ AS A FINDING.
  if (retryable.length === 0) fail('RETRYABLE_VIA_PROXY parsed empty')
  if (permanent.length === 0) fail('permanent set parsed empty')
  // The two must partition: no code in both, none in neither.
  for (const c of DOWNLOAD_FAILURES) {
    const inR = retryable.includes(c), inP = permanent.includes(c)
    if (inR === inP) fail(`${c} is in ${inR ? 'both' : 'neither'} class`)
  }
  // ⚖️ THE ONE CODE THAT MUST NEVER GRADUATE. "We do not know why this failed"
  // is not evidence that an IP would fix it, and paying to re-ask is the waste
  // the allowlist exists to prevent.
  if (retryable.includes('UNKNOWN_DOWNLOAD_FAILURE')) fail('UNKNOWN must not be retryable')
  if (!sql().includes('with_residue')) fail('the residue column is missing')
  if (bad) { console.error(`failure-classes-split selftest: ${bad} FAILED`); process.exit(1) }
  console.log(`failure-classes-split selftest: OK `
    + `(${retryable.length} retryable, ${permanent.length} permanent, partition holds)`)
  process.exit(0)
}

if (process.argv.includes('--sql')) { console.log(sql()); process.exit(0) }
console.error('one of --sql | --selftest required')
process.exit(1)
