// A CACHE THAT INSTALLS THE WRONG BYTES IS WORSE THAN NO CACHE.
//
// ⚠️ THIS ONE RUNS `sudo dpkg -i` ON WHATEVER IT FINDS ON DISK. A restored cache
// that is corrupt, truncated, or tampered with would be installed into the
// runner that then builds and tests the product. The refusals are therefore the
// load-bearing part, not the happy path — and they are the part nobody exercises
// by accident, because in normal operation the cache is always fine.
//
// ⚖️ SO THE REFUSALS ARE TESTED, NOT THE INSTALL. Actually installing .debs needs
// root and a Debian runner; asserting that a bad cache is REFUSED needs neither,
// and it is the half that protects anything.
//
//   node scripts/ci/check_apt_artifact_cache.mjs --selftest
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HELPER = join(fileURLToPath(import.meta.url), '..', 'apt_artifact_cache.sh')

/** Run `apt_artifacts_install <set>` against a throwaway cache root. */
function tryInstall(root, setName) {
  try {
    execFileSync('bash', ['-c',
      `set -euo pipefail; export APT_ARTIFACT_CACHE_ROOT="${root}"; . "${HELPER}"; apt_artifacts_install ${setName}`,
    ], { stdio: 'pipe' })
    return 'accepted'
  } catch {
    return 'refused'
  }
}

if (process.argv.includes('--selftest')) {
  const root = mkdtempSync(join(tmpdir(), 'aptcache-'))
  let failed = 0
  const check = (name, got, want) => {
    if (got !== want) { console.error(`selftest: ${name} — got ${got}, want ${want}`); failed++ }
    else console.log(`  ok: ${name}`)
  }

  // ⚠️ NO CACHE AT ALL. Must refuse so the caller falls back to the mirror,
  // rather than "succeeding" having installed nothing.
  check('an absent cache is refused', tryInstall(root, 'nosuchset'), 'refused')

  // ⚠️ A DIRECTORY WITH NO DIGEST FILE. Could be a half-written cache; there is
  // nothing to verify against, so there is nothing to trust.
  mkdirSync(join(root, 'nodigest'), { recursive: true })
  writeFileSync(join(root, 'nodigest', 'x.deb'), 'anything')
  check('a cache with no digest file is refused', tryInstall(root, 'nodigest'), 'refused')

  // ⚠️ A DIGEST FILE WITH NO PACKAGES. Verifying vacuously and installing
  // nothing would report success and leave the runner without ffmpeg.
  mkdirSync(join(root, 'nodebs'), { recursive: true })
  writeFileSync(join(root, 'nodebs', '.sha256'), '')
  check('a cache holding no .deb is refused', tryInstall(root, 'nodebs'), 'refused')

  // ⚠️ THE ONE THAT MATTERS: CONTENTS CHANGED AFTER THE DIGEST WAS TAKEN.
  const t = join(root, 'tampered')
  mkdirSync(t, { recursive: true })
  writeFileSync(join(t, 'a.deb'), 'original')
  execFileSync('bash', ['-c', `cd "${t}" && sha256sum ./a.deb > .sha256`])
  writeFileSync(join(t, 'a.deb'), 'TAMPERED')
  check('a cache that fails its own digest is refused', tryInstall(root, 'tampered'), 'refused')

  rmSync(root, { recursive: true, force: true })
  if (failed) process.exit(1)
  console.log('apt-artifact-cache selftest: all cases passed')
  process.exit(0)
}

// Non-selftest: assert the workflows still keep the retry as the fallback.
// ⚠️ "DO NOT REMOVE THE BANDAGE THE SAME COMMIT YOU TRANSPLANT THE ARTERY."
// A cache miss is exactly the moment the mirror might be down, so the retry has
// to survive. Deleting it would look like a tidy-up and would restore the
// original failure mode.
import { readFileSync } from 'node:fs'
const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')
let bad = 0
for (const wf of ['staging-integration.yml', 'pr-checks.yml']) {
  const text = readFileSync(join(REPO, '.github', 'workflows', wf), 'utf8')
  if (!text.includes('apt_get_retry')) {
    console.error(`::error::${wf} no longer defines apt_get_retry — the artifact cache is not a substitute for the miss path`)
    bad++
  }
  if (!text.includes('apt_artifacts_install')) {
    console.error(`::error::${wf} does not consult the artifact cache`)
    bad++
  }
}
if (bad) process.exit(1)
console.log('apt-artifact-cache guard: OK (cache consulted, retry retained in both workflows)')
