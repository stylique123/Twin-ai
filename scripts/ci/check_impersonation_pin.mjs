// AN IMPORTABLE DEPENDENCY IS NOT A COMPATIBLE ONE.
//
// ⚠️ THIS SHIPPED BROKEN FOR MONTHS WITH THE DEPENDENCY INSTALLED. requirements
// .txt read `curl-cffi>=0.7.0` — an open-ended floor — so pip resolved to the
// newest release and yt-dlp refused it:
//
//     ImportError: Only curl_cffi versions 0.5.10 and 0.10.x through 0.15.x
//     are supported
//
// `pip3 install` succeeded. `import curl_cffi` succeeded. Every impersonation
// target still printed "(unavailable)", TikTok reads failed, and 70 production
// reference assessments died on it. The chain everybody knew — a declared
// dependency is not an installed one, an installed one is not an importable one
// — was missing its last rung.
//
// ⚖️ MEASURED: on 0.16.0 yt-dlp lists 5 targets, all unavailable, and the probe
// counts 0. On 0.15.0 it lists 37 usable targets and the probe counts 37. Same
// yt-dlp, same machine, one pin apart.
//
// ⚖️ SO THE CEILING IS LOAD-BEARING AND A GUARD HOLDS IT. An unbounded floor is
// not a pin, it is a promise that the newest release will always work — which
// is exactly the promise that failed. This does NOT assert a particular
// version: yt-dlp's supported window moves, and when it widens the bound should
// follow. It asserts that a bound EXISTS, because dropping it is the specific
// mistake that cost months.
//
//   node scripts/ci/check_impersonation_pin.mjs
//   node scripts/ci/check_impersonation_pin.mjs --selftest
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')

/**
 * ⚠️ READS THE SPEC, NOT THE INSTALLED VERSION. CI installs from this file, so
 * checking what happens to be installed here would test the runner rather than
 * what the image will resolve to.
 */
export function checkPin(requirementsText) {
  const lines = String(requirementsText ?? '').split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
  const line = lines.find((l) => /^curl[-_]cffi\b/i.test(l))
  if (!line) return 'curl-cffi is not pinned at all — TikTok cannot be read without it'
  // An exact pin is a bound.
  if (/==/.test(line)) return null
  // Otherwise there must be an upper bound of some kind.
  const hasCeiling = /<=?\s*\d/.test(line)
  if (!hasCeiling) {
    return `curl-cffi has no UPPER bound: "${line}". An open-ended floor lets pip `
      + 'resolve past what yt-dlp supports, which installs cleanly, imports cleanly, '
      + 'and reports every impersonation target as "(unavailable)". Add a ceiling '
      + "matching yt-dlp's supported window."
  }
  return null
}

if (process.argv.includes('--selftest')) {
  let failed = 0
  const cases = [
    ['the real historical bug FAILS', 'curl-cffi>=0.7.0\n', true],
    ['a bounded range passes', 'curl-cffi>=0.10,<0.16\n', false],
    ['an exact pin passes', 'curl-cffi==0.15.0\n', false],
    ['a <= ceiling passes', 'curl-cffi>=0.10,<=0.15.0\n', false],
    ['underscore spelling is still found', 'curl_cffi>=0.7.0\n', true],
    ['absent entirely FAILS', 'yt-dlp>=2025.1.15\n', true],
    // ⚠️ A COMMENT DESCRIBING THE PIN IS NOT THE PIN. The real file carries a
    // long comment quoting the bad version, and matching that would pass a file
    // whose actual requirement is unbounded.
    ['a comment mentioning a ceiling does NOT satisfy it',
      '# was curl-cffi<0.16 once\ncurl-cffi>=0.7.0\n', true],
  ]
  for (const [name, text, expectFail] of cases) {
    const got = checkPin(text) !== null
    if (got !== expectFail) { console.error(`selftest: ${name} — wrong`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) process.exit(1)
  console.log('impersonation-pin selftest: all cases passed')
  process.exit(0)
}

const problem = checkPin(readFileSync(join(REPO, 'worker', 'requirements.txt'), 'utf8'))
if (problem) {
  console.error(`::error::${problem}`)
  process.exit(1)
}
console.log('impersonation-pin guard: OK (curl-cffi is bounded above)')
