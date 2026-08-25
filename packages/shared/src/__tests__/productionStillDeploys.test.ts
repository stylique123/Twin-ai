import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const repo = join(import.meta.dirname, '..', '..', '..', '..')
const vercelJson = () => JSON.parse(readFileSync(join(repo, 'vercel.json'), 'utf8')) as Record<string, unknown>
const workflowPath = join(repo, '.github', 'workflows', 'deploy-production.yml')

// ⚠️ WHAT THIS FILE EXISTS TO PREVENT. `git.deploymentEnabled: false` stops
// Vercel deploying ANY branch on push — previews AND production. That is the
// whole trade: it ends the deploy-cap blockage, and it moves production deploys
// onto something we now own. If that something ever stops working, main keeps
// merging and the site keeps serving stale code with NOTHING SAYING SO.
//
// ⚖️ MEASURED, WHICH IS WHY THE TRADE IS WORTH IT AT ALL. Over 24 hours the
// project created 40+ deployments before 16:00 and hit the 100/window cap four
// times; 14 of the 20 in one sampled page were CANCELED previews. ⚠️ AND MY
// FIRST MEASUREMENT WAS WRONG: I reported "20 today" from a single PAGE of a
// paginated result and recommended skipping the fix on that basis. The page
// count was not the total.
describe('turning off git deploys does not turn off production', () => {
  it('automatic git deploys are off — the thing that spent the budget', () => {
    const git = vercelJson().git as { deploymentEnabled?: unknown } | undefined
    expect(git, 'vercel.json needs a git block').toBeDefined()
    expect(git!.deploymentEnabled).toBe(false)
  })

  // ⚠️ THE LOAD-BEARING PAIR. Disabling git deploys without a replacement is the
  // outage; a replacement without the disable is pointless. Neither half may
  // ship alone, so the presence of one asserts the presence of the other.
  it('and something else deploys production instead', () => {
    const git = vercelJson().git as { deploymentEnabled?: unknown } | undefined
    if (git?.deploymentEnabled === false) {
      expect(existsSync(workflowPath), 'deploy-production.yml must exist').toBe(true)
      const wf = readFileSync(workflowPath, 'utf8')
      expect(wf).toMatch(/branches:\s*\[main\]/)
      expect(wf).toMatch(/VERCEL_DEPLOY_HOOK_URL/)
    }
  })

  // ⚠️ ABSENT IS NOT "SKIP", AND THIS IS THE EXACT SILENT FAILURE THE WORKFLOW
  // IS WRITTEN AGAINST. `if: secrets.X != ''` reads as caution and produces a
  // GREEN run that deployed nothing — the board looks healthy while the site
  // goes stale. A missing secret must be RED.
  // ⚠️ AND THIS CASE WAS TOO WEAK ON ITS FIRST WRITING. It asserted that `exit 1`
  // appeared ANYWHERE in the file — which it does, in the curl branch — so when
  // I mutated the missing-secret path into `echo "no hook, skipping"` the guard
  // PASSED. It could not fail on the one thing it exists for. It now reads the
  // emptiness branch itself.
  it('a missing deploy hook is a red run, never a quiet skip', () => {
    const wf = readFileSync(workflowPath, 'utf8')
    const at = wf.indexOf('if [ -z "${HOOK}" ]; then')
    expect(at, 'the workflow must test the secret for emptiness').toBeGreaterThan(-1)
    const branch = wf.slice(at, wf.indexOf('fi', at))
    expect(branch, 'an empty secret must exit non-zero').toMatch(/exit 1/)
    expect(branch).not.toMatch(/skip/i)
    // The guard must not gate the whole job on the secret being present, which
    // is how "no secret" becomes "no run" becomes "green".
    expect(wf).not.toMatch(/if:\s*\$\{\{\s*secrets\.VERCEL_DEPLOY_HOOK_URL\s*!=\s*''/)
  })

  // ⚖️ A PIPE HIDES THE EXIT CODE — the lesson this repo has already paid for.
  // The hook's HTTP status is read from curl itself and asserted.
  it('the hook response code is checked, not assumed', () => {
    const wf = readFileSync(workflowPath, 'utf8')
    expect(wf).toMatch(/%\{http_code\}/)
    expect(wf).toMatch(/production was NOT asked to deploy/)
  })

  // ⚠️ AND A GREEN RUN MUST NOT CLAIM MORE THAN IT PROVED. A 2xx from the hook
  // means Vercel ACCEPTED the request — not that the build succeeded or that the
  // new version is live. Without a token we cannot poll to READY, so the run has
  // to say so rather than let a tick imply it.
  it('the workflow states what it has not proven', () => {
    const wf = readFileSync(workflowPath, 'utf8')
    expect(wf).toMatch(/NOT PROVEN/)
  })

  // ⚖️ THE OLD LEVER GOES, because leaving it would be a second, contradictory
  // answer to the same question. ignoreCommand only ever skipped the BUILD; the
  // deployment was still created and still counted against the cap — measured,
  // after I first claimed otherwise.
  //
  // ⚠️ AND ITS GUARD WENT WITH IT, WHICH IS A DELETION AND NEEDS SAYING.
  // previewsBuildOnlyForMain.test.ts executed the real ignoreCommand in a real
  // shell and was a GOOD test — it is the one that caught `[ "$REF" != "main" ]`
  // silently disabling production when the ref is empty. It is removed because
  // its SUBJECT is gone, not because it failed: there is no command left to run.
  // The property it protected — that production still deploys — is the whole
  // point of this file, which is why it was written before the deletion.
  it('the ignoreCommand that never reduced the count is gone', () => {
    expect(vercelJson().ignoreCommand).toBeUndefined()
  })

  // A config typo here breaks EVERY deploy including production, and the only
  // place it surfaces is the deployment record — not the repo, not the suite.
  it('vercel.json carries no key outside the documented set', () => {
    const allowed = new Set([
      '$schema', 'git', 'installCommand', 'buildCommand', 'outputDirectory', 'rewrites', 'headers',
    ])
    for (const key of Object.keys(vercelJson())) {
      expect(allowed.has(key), `unexpected vercel.json key: ${key}`).toBe(true)
      expect(key.startsWith('_'), `underscore pseudo-comment: ${key}`).toBe(false)
    }
  })
})
