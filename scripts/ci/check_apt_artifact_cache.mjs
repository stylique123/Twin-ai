// A CACHE THAT INSTALLS THE WRONG BYTES IS WORSE THAN NO CACHE.
//
// ⚠️ THIS ONE RUNS `sudo dpkg -i` ON WHATEVER IT FINDS ON DISK. A restored cache
// that is corrupt, truncated, or tampered with would be installed into the
// runner that then builds and tests the product. The refusals are therefore the
// load-bearing part, not the happy path — and they are the part nobody exercises
// by accident, because in normal operation the cache is always fine.
//
// ⚖️ THE REFUSALS ARE TESTED, AND SO IS THE ACCEPTANCE. For a long time only the
// refusals were, because actually installing .debs needs root and a Debian
// runner — and a suite made entirely of refusals is passed perfectly by a
// function that returns non-zero unconditionally. It never proved the cache
// could be USED. Injecting the dpkg command (APT_DPKG_CMD) costs nothing,
// mutates nothing, and closes that half.
//
//   node scripts/ci/check_apt_artifact_cache.mjs --selftest
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HELPER = join(fileURLToPath(import.meta.url), '..', 'apt_artifact_cache.sh')

/** Run `apt_artifacts_install <set>` against a throwaway cache root.
 *
 *  ⚖️ `dpkg` IS INJECTED, WHICH IS WHAT LETS THE HIT PATH BE TESTED AT ALL.
 *  `true` stands in for an install that works, `false` for one that does not —
 *  no root, no Debian, no mutation of the machine running the test. */
function tryInstall(root, setName, dpkgCmd = 'true') {
  try {
    const out = execFileSync('bash', ['-c',
      `set -euo pipefail; export APT_ARTIFACT_CACHE_ROOT="${root}"; export APT_DPKG_CMD="${dpkgCmd}"; . "${HELPER}"; apt_artifacts_install ${setName}`,
    ], { stdio: 'pipe' })
    return { verdict: 'accepted', out: String(out) }
  } catch (e) {
    return { verdict: 'refused', out: String(e.stdout ?? '') + String(e.stderr ?? '') }
  }
}

/** Run `apt_artifacts_fetch <set> <pkgs...>` with apt itself stubbed out. */
function tryFetch(root, setName, aptStub) {
  try {
    const out = execFileSync('bash', ['-c',
      `set -uo pipefail; export APT_ARTIFACT_CACHE_ROOT="${root}"; export PATH="${aptStub}:$PATH"; `
      + `. "${HELPER}"; apt_artifacts_fetch ${setName} somepkg`,
    ], { stdio: 'pipe' })
    return { verdict: 'accepted', out: String(out) }
  } catch (e) {
    return { verdict: 'refused', out: String(e.stdout ?? '') + String(e.stderr ?? '') }
  }
}

/** A directory holding fake `sudo`/`apt-get` that download nothing at all —
 *  exactly what real apt does when the packages are ALREADY INSTALLED. */
function stubAptThatDownloadsNothing(root) {
  const bin = join(root, 'stubbin')
  mkdirSync(bin, { recursive: true })
  for (const name of ['sudo', 'apt-get', 'sha256sum-noop']) {
    writeFileSync(join(bin, name), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 })
  }
  return bin
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
  check('an absent cache is refused', tryInstall(root, 'nosuchset').verdict, 'refused')

  // ⚠️ A DIRECTORY WITH NO DIGEST FILE. Could be a half-written cache; there is
  // nothing to verify against, so there is nothing to trust.
  mkdirSync(join(root, 'nodigest'), { recursive: true })
  writeFileSync(join(root, 'nodigest', 'x.deb'), 'anything')
  check('a cache with no digest file is refused', tryInstall(root, 'nodigest').verdict, 'refused')

  // ⚠️ A DIGEST FILE WITH NO PACKAGES. Verifying vacuously and installing
  // nothing would report success and leave the runner without ffmpeg.
  mkdirSync(join(root, 'nodebs'), { recursive: true })
  writeFileSync(join(root, 'nodebs', '.sha256'), '')
  check('a cache holding no .deb is refused', tryInstall(root, 'nodebs').verdict, 'refused')

  // ⚠️ THE ONE THAT MATTERS: CONTENTS CHANGED AFTER THE DIGEST WAS TAKEN.
  const t = join(root, 'tampered')
  mkdirSync(t, { recursive: true })
  writeFileSync(join(t, 'a.deb'), 'original')
  execFileSync('bash', ['-c', `cd "${t}" && sha256sum ./a.deb > .sha256`])
  writeFileSync(join(t, 'a.deb'), 'TAMPERED')
  check('a cache that fails its own digest is refused', tryInstall(root, 'tampered').verdict, 'refused')

  // ── TEST A — THE FETCH THAT DOWNLOADED NOTHING ──────────────────────────
  //
  // ⚠️ THE DEMONSTRATED DEFECT. The old caller installed from the mirror FIRST
  // and warmed the cache afterwards, by which point apt considered the packages
  // satisfied and `--download-only` fetched nothing. `sha256sum ./*.deb` then
  // ran on an unmatched glob, and the caller's `|| echo "::warning::"` swallowed
  // the error — so the cache could never populate, forever, silently.
  {
    const stub = stubAptThatDownloadsNothing(root)
    const r = tryFetch(root, 'emptyfetch', stub)
    check('a fetch that downloaded zero artifacts FAILS', r.verdict, 'refused')
    check('and says so rather than dying on an unmatched glob',
      /no \.deb artifacts downloaded/.test(r.out) ? 'explained' : 'silent', 'explained')
    // ⚠️ AND NO FAKE CACHE IS LEFT BEHIND for the next run to "verify" and trust.
    check('and leaves no digest file to be trusted later',
      existsSync(join(root, 'emptyfetch', '.sha256')) ? 'left one' : 'clean', 'clean')
  }

  // ── TEST B — THE INSTALL THAT FAILED AND SAID IT SUCCEEDED ──────────────
  //
  // ⚠️ THE SECOND DEMONSTRATED DEFECT. The old body was
  // `dpkg -i ... || { dpkg --configure -a || true; }` followed by an
  // UNCONDITIONAL "installed … from the artifact cache". A cache that failed to
  // install returned 0, so the caller's network fallback — which exists exactly
  // for this — never ran.
  {
    const g = join(root, 'goodbytes')
    mkdirSync(g, { recursive: true })
    writeFileSync(join(g, 'a.deb'), 'real enough')
    execFileSync('bash', ['-c', `cd "${g}" && sha256sum a.deb > .sha256`])

    const bad = tryInstall(root, 'goodbytes', 'false')
    check('a VALID cache whose install fails returns non-zero', bad.verdict, 'refused')
    check('and never claims it installed from the cache',
      /apt_cache_installed/.test(bad.out) ? 'claimed' : 'silent', 'silent')

    // ── TEST C — THE POSITIVE HIT PATH, the half the suite never had ───────
    //
    // ⚖️ EVERY CASE ABOVE ASSERTS A REFUSAL. A function that returned non-zero
    // unconditionally would pass all of them, which means none of them prove the
    // cache can ever be USED.
    const good = tryInstall(root, 'goodbytes', 'true')
    check('a valid cache with a working install is accepted', good.verdict, 'accepted')
    const said = (good.out.match(/apt_cache_installed/g) ?? []).length
    check('and reports the install exactly once', String(said), '1')

    // ⚠️ AND IT DOES NOT NAME A ROUTE. The first version printed
    // `route=cache_hit` here, so apt_ensure's warm path emitted BOTH that and
    // `route=cache_warmed_then_installed` — observed in the very first real run.
    // A route is a property of the path taken, which only the caller knows.
    check('and names no route of its own',
      /apt_route/.test(good.out) ? 'named one' : 'silent', 'silent')
  }

  // ── TEST D — ONE ROUTE LINE PER SET PER RUN ─────────────────────────────
  //
  // ⚠️ MEASURED FROM THE FIRST REAL RUN, WHICH LOGGED TWO. `grep -c
  // route=cache_hit` is how anybody will answer "is the cache working", so a
  // warm that also reports a hit is a measurement that lies in the direction of
  // good news — the failure mode this whole task exists to remove.
  {
    const bin = join(root, 'ensurebin')
    mkdirSync(bin, { recursive: true })
    // apt "downloads" one package into whatever archive dir it is handed.
    writeFileSync(join(bin, 'sudo'), '#!/usr/bin/env bash\nexec "$@"\n', { mode: 0o755 })
    writeFileSync(join(bin, 'apt-get'),
      '#!/usr/bin/env bash\nfor a in "$@"; do case "$a" in -o) shift;; Dir::Cache::archives=*) d="${a#*=}";; esac; done\n'
      + 'if [ -n "${d:-}" ]; then mkdir -p "$d"; printf x > "$d/warm.deb"; fi\nexit 0\n', { mode: 0o755 })

    let out = ''
    try {
      out = String(execFileSync('bash', ['-c',
        `set -uo pipefail; export APT_ARTIFACT_CACHE_ROOT="${root}"; export APT_DPKG_CMD="true"; `
        + `export PATH="${bin}:$PATH"; apt_get_retry() { return 0; }; . "${HELPER}"; apt_ensure warmset warmpkg`,
      ], { stdio: 'pipe' }))
    } catch (e) { out = String(e.stdout ?? '') + String(e.stderr ?? '') }

    const routes = out.match(/apt_route set=\S+ route=\S+/g) ?? []
    check('a warm-then-install emits exactly one apt_route line', String(routes.length), '1')
    check('and that line says it warmed, not that it hit',
      routes[0] ?? '(none)', 'apt_route set=warmset route=cache_warmed_then_installed')
  }

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
  if (!text.includes('apt_ensure')) {
    console.error(`::error::${wf} does not consult the artifact cache`)
    bad++
  }
  // ⚠️ THE ORDERING IS THE FIX, SO THE ORDERING IS GUARDED. A caller that
  // installs from the mirror and warms afterwards downloads nothing, because apt
  // considers the packages satisfied — the cache then never populates. Calling
  // apt_get_retry directly beside the cache is how that came back last time.
  const direct = text.split('\n').filter((l) => /^\s*apt_get_retry /.test(l))
  if (direct.length) {
    console.error(`::error::${wf} calls apt_get_retry directly — the miss path must go through apt_ensure, which warms the cache and installs THOSE bytes`)
    bad++
  }
}
if (bad) process.exit(1)
console.log('apt-artifact-cache guard: OK (cache consulted, retry retained in both workflows)')
