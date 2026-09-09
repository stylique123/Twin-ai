// THE ENQUEUE RLS HAD BEEN REFUSING FOR FOUR WEEKS
//
// ⚠️ MEASURED, NOT SUSPECTED: production holds 12 products, 5 of them with a
// URL, and 0 knowledge rows between them. `pg_policy` on `public.jobs` returns
// exactly two policies — `own jobs read` and `admin read jobs` — both
// `polcmd = 'r'`. The last `extract_product` job of any kind was 2026-08-12,
// the day migration 0030 dropped "user enqueue autoedit" and made
// enqueue-autoedit the only writer of `jobs`.
//
// ⚖️ SO `requestProductExtraction`'S BROWSER INSERT COULD NEVER HAVE SUCCEEDED,
// and the fix must not be to give the browser its policy back — a page that can
// insert a job can spend credits, which is the leak 0030 closed. The enqueue
// moved behind `enqueue-extraction`, which verifies entity ownership and writes
// with the service role.
//
// ⚠️ THIS GUARD IS THE PART THAT LASTS. The bug was invisible because nothing
// tied "the browser writes `jobs`" to "`jobs` has no INSERT policy"; the two
// facts lived in different files and neither was wrong on its own.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const API = readFileSync(join(REPO, 'packages/shared/src/api.ts'), 'utf8')
const FN = readFileSync(join(REPO, 'supabase/functions/enqueue-extraction/index.ts'), 'utf8')
const DEPLOY = readFileSync(join(REPO, '.github/workflows/deploy-edge.yml'), 'utf8')

/** Whole-line comments dropped, so a `//` line naming the old call cannot pass
 *  for the call itself — and nothing after `//` on a code line is removed,
 *  because that would eat a trailing comment's line and take real code with it. */
const codeOnly = (s: string) =>
  s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('the browser does not write jobs, because RLS will not let it', () => {
  it('no insert into `jobs` survives anywhere in the browser API', () => {
    // ⚖️ ASSERTED OVER THE WHOLE FILE, not over one function. The next enqueue
    // someone adds here fails the same way this one did, silently, and this is
    // the line that stops it.
    expect(codeOnly(API)).not.toMatch(/from\(['"]jobs['"]\)\s*\.?\s*\n?\s*\.insert\(/)
  })

  it('the extraction enqueue goes through the credentialed function', () => {
    const body = API.slice(
      API.indexOf('export async function requestProductExtraction('),
      API.indexOf('/** Promote the facts a creator has checked.'),
    )
    expect(body).toMatch(/functions\.invoke\('enqueue-extraction'/)
    expect(body).toMatch(/entity_id: entityId/)
  })

  it('and it no longer takes an owner id, because a caller cannot be trusted with one', () => {
    // ⚠️ UNDER THE SERVICE ROLE A CALLER-SUPPLIED OWNER IS AN INSTRUCTION, NOT A
    // FACT. Keeping the argument would also have left a parameter written by
    // three call sites and read by nothing — the defect class this repo keeps
    // finding.
    expect(API).toMatch(/export async function requestProductExtraction\(\s*\n?\s*entityId: string, url: string,/)
  })

  it('the function proves ownership from the token, not from the body', () => {
    expect(FN).toMatch(/userClient\.auth\.getUser\(\)/)
    expect(FN).toMatch(/from\('product_entities'\)/)
    expect(FN).toMatch(/owner_id\s*!==\s*user\.id/)
    // The insert names the caller's own id — never one that arrived in the body.
    expect(FN).toMatch(/owner_id: user\.id, type: 'extract_product'/)
    expect(codeOnly(FN)).not.toMatch(/body\.owner_id|body\.ownerId/)
  })

  it('and it is classified for deployment, or it would never reach production', () => {
    // ⚠️ THE CLOSED LIST IS WHY answer-beat-ask SAT UNDEPLOYED FOR A MONTH. An
    // unclassified function fails every edge deploy, including everyone else's.
    expect(DEPLOY).toMatch(/PROD="[^"]*enqueue-extraction/s)
  })
})
