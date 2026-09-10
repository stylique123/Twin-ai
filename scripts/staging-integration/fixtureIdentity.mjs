// Which run a staging fixture user belongs to, written into the user itself.
//
// THE MEASUREMENT THAT MADE THIS NECESSARY. Staging's database was 842 MB
// against production's 137 MB — six times bigger than the thing it stands in
// for — and it was not bloat. Dead tuples were negligible (86 rows on the
// 174 MB table, 132 on the 156 MB one) and autovacuum was keeping up. The
// size was LIVE ROWS:
//
//     auth.users              12,482   ← every single one a fixture
//     edit_events            397,723
//     media_analyses         103,529
//     jobs                    85,662
//     media_assets            52,503   (production has 5)
//     generations             49,029   (production has 85)
//
// Twelve thousand four hundred and eighty-two users, and ZERO of them real:
// every address matches `@staging.test`, and the oldest is dated 2026-07-17,
// the day the project was created. Staging has never been cleaned once. It
// accretes 200-475 users and 8,000-18,000 edit_events PER DAY, and the
// harness's last act is to kill the worker and exit.
//
// ⚠️ THE COST IS NOT THE DISK, IT IS THE IO. Read caching still works — heap
// cache hit is 99.79%, because the hot set is whatever the current run just
// wrote. What scales with the garbage is VACUUM: autovacuum must scan a
// 130 MB heap to collect the handful of dead tuples one run produces, and it
// must do that again after the next run, on an instance whose entire
// shared_buffers is 224 MB. The junk is not idle — it is re-read, forever.
//
// WHY A TAG IN THE EMAIL RATHER THAN A LIST OF IDS. The nine phases are nine
// separate processes, nine separate workflow steps. There is no shared memory
// to collect ids into, and a file passed between steps is one more thing that
// can be missing when a phase crashes. `GITHUB_RUN_ID`/`GITHUB_RUN_ATTEMPT`
// are already visible to every step of the job, so the run can be stamped
// into the address at creation and read back off the row at purge time. The
// user carries its own provenance.
//
// ⚠️ AND THE TAG IS WHAT MAKES THE PURGE SAFE TO SCOPE. "Delete everything
// matching @staging.test" would be correct today and catastrophic the first
// time two runs overlap — it would delete the other run's users out from under
// its assertions, and the failure would look like an authorization defect.
// Deleting only `.r<this run>` cannot do that, whatever else goes wrong.

import { randomUUID } from 'node:crypto'

/**
 * The domain that marks a row as harness-created.
 *
 * Load-bearing: the age-gated sweep uses it to find residue from runs that
 * crashed before their purge step, and that sweep is the only thing that ever
 * reclaims those. It must never be given to a real account.
 */
export const FIXTURE_DOMAIN = 'staging.test'

/**
 * Identifies the run that owns a fixture, as a label safe to embed in an
 * email local-part (lowercase alphanumerics only).
 *
 * In CI this is the workflow run and its attempt, so a re-run of a failed run
 * gets its own tag and cannot purge the rows the first attempt is still being
 * debugged for. Off CI it is a random stamp per invocation, which is the same
 * guarantee by a different route: a local run purges what it made and nothing
 * else.
 */
export function fixtureRunTag(env = process.env) {
  const id = String(env.GITHUB_RUN_ID ?? '').replace(/[^0-9a-z]/gi, '')
  const attempt = String(env.GITHUB_RUN_ATTEMPT ?? '').replace(/[^0-9a-z]/gi, '')
  if (id) return attempt ? `${id}a${attempt}`.toLowerCase() : id.toLowerCase()
  return `local${randomUUID().replace(/-/g, '').slice(0, 12)}`
}

const RUN_TAG = fixtureRunTag()

/**
 * A fresh fixture email for `label`, stamped with the current run.
 *
 * ⚠️ THE UUID STAYS. The run tag is shared by every user the run creates, so
 * it cannot be the unique part — two phases asking for the same label in the
 * same run must still get two different users, or the second signup collides
 * with the first and the phase fails for a reason that has nothing to do with
 * what it is testing.
 */
export function fixtureEmail(label, runTag = RUN_TAG) {
  const safe = String(label).replace(/[^0-9a-z-]/gi, '').toLowerCase() || 'fixture'
  return `${safe}-${randomUUID().slice(0, 8)}.r${runTag}@${FIXTURE_DOMAIN}`
}

/** The SQL LIKE pattern matching exactly the users one run created. */
export function runPattern(runTag = RUN_TAG) {
  return `%.r${runTag}@${FIXTURE_DOMAIN}`
}

if (process.argv.includes('--selftest')) {
  let failed = 0
  const check = (what, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want)
    if (!ok) { failed++; console.log(`  ✗ ${what} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`) }
    else console.log(`  ✓ ${what}`)
  }

  check('CI run id and attempt both reach the tag',
    fixtureRunTag({ GITHUB_RUN_ID: '34464999052', GITHUB_RUN_ATTEMPT: '2' }), '34464999052a2')

  // A re-run must not be able to purge the first attempt's rows: that data is
  // the only evidence of why the first attempt failed.
  check('a re-run gets a DIFFERENT tag from the first attempt',
    fixtureRunTag({ GITHUB_RUN_ID: '7', GITHUB_RUN_ATTEMPT: '1' })
      !== fixtureRunTag({ GITHUB_RUN_ID: '7', GITHUB_RUN_ATTEMPT: '2' }), true)

  check('off CI the tag is local and unique',
    fixtureRunTag({}) !== fixtureRunTag({}), true)

  check('the local tag is still a legal local-part',
    /^local[0-9a-f]{12}$/.test(fixtureRunTag({})), true)

  // Two phases, one label, one run. If the tag were the whole identity the
  // second signup would collide.
  check('same label in the same run yields two distinct users',
    fixtureEmail('owner', 'r1') !== fixtureEmail('owner', 'r1'), true)

  check('the run tag is recoverable from the address',
    fixtureEmail('owner', '34464999052a2').endsWith('.r34464999052a2@staging.test'), true)

  // The guard downstream matches on the module, but the pattern is what the
  // purge actually runs, so it is asserted against a real generated address.
  const mk = fixtureEmail('peer', '900a1')
  const pat = runPattern('900a1').replace(/%/g, '')
  check('runPattern matches the addresses it is meant to match', mk.endsWith(pat), true)

  check('runPattern does NOT match another run', mk.endsWith(runPattern('900a2').replace(/%/g, '')), false)

  // An unsanitised label would produce an address the pattern cannot match,
  // and the row would then be immortal.
  check('a label with an @ in it cannot escape the domain',
    fixtureEmail('bad@evil.com', 'r1').split('@').length, 2)
  check('a label of pure punctuation still yields a usable address',
    fixtureEmail('***', 'r1').startsWith('fixture-'), true)

  console.log(failed === 0 ? 'fixtureIdentity selftest OK' : `fixtureIdentity selftest FAILED (${failed})`)
  process.exit(failed === 0 ? 0 : 1)
}
