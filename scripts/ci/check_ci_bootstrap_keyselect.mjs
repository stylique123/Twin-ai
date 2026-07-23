#!/usr/bin/env node
// Offline selftest for the ci-bootstrap staging secret-key selection logic.
// Runtime-agnostic: imports the SAME pure function the Deno edge function uses
// (supabase/functions/ci-bootstrap/keyselect.mjs) and asserts the fail-closed
// contract without any network, Supabase, or secret access.
//
// Covers the credential-path correction cases:
//   * valid "default" key in the object-map dictionary  -> selected
//   * valid key in the array-shape dictionary           -> selected
//   * sole valid sb_secret_ value under another name    -> selected
//   * malformed JSON                                     -> fail closed
//   * empty dictionary                                   -> fail closed
//   * non-sb_secret value                                -> fail closed
//   * legacy-only environment (no SUPABASE_SECRET_KEYS)  -> fail closed
//   * ambiguous multiple secrets (no "default")          -> fail closed
// and asserts NO case ever leaks key bytes through `source`.
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const modUrl = new URL('../../supabase/functions/ci-bootstrap/keyselect.mjs', import.meta.url)
const { selectSecretKey } = await import(modUrl.href)

let failures = 0
const SECRET = 'sb_secret_abcdef0123456789'
const OTHER = 'sb_secret_zzz9998887776665'

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    failures++
    console.error(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`)
  } else {
    console.log(`ok   ${name}`)
  }
}

// 1) valid default in object-map shape
check('valid default (object map)',
  selectSecretKey(JSON.stringify({ default: SECRET, other: OTHER })),
  { key: SECRET, source: 'secret_key:default' })

// 2) valid default in array shape { name, api_key }
check('valid default (array shape)',
  selectSecretKey(JSON.stringify([{ name: 'default', api_key: SECRET }, { name: 'other', api_key: OTHER }])),
  { key: SECRET, source: 'secret_key:default' })

// 3) sole valid secret under a non-default name -> selected deterministically
check('sole valid non-default name',
  selectSecretKey(JSON.stringify({ ci_only: SECRET })),
  { key: SECRET, source: 'secret_key:ci_only' })

// 4) malformed JSON -> fail closed, no bytes
check('malformed JSON',
  selectSecretKey('{not json'),
  { source: 'malformed_json' })

// 5) empty dictionary -> fail closed
check('empty object dictionary',
  selectSecretKey('{}'),
  { source: 'no_valid_secret' })
check('empty array dictionary',
  selectSecretKey('[]'),
  { source: 'no_valid_secret' })

// 6) non-sb_secret value -> fail closed
check('non-sb_secret value',
  selectSecretKey(JSON.stringify({ default: 'service_role_legacy_jwt' })),
  { source: 'no_valid_secret' })

// 7) legacy-only environment: SUPABASE_SECRET_KEYS unset entirely
check('legacy-only (undefined)',
  selectSecretKey(undefined),
  { source: 'missing' })
check('legacy-only (empty string)',
  selectSecretKey(''),
  { source: 'missing' })

// 8) ambiguous: multiple valid secrets, none named "default"
check('ambiguous multiple secrets',
  selectSecretKey(JSON.stringify({ a: SECRET, b: OTHER })),
  { source: 'ambiguous_multiple_secrets' })

// Invariant: `source` must NEVER contain key bytes for ANY of the above shapes.
const bytePeek = [
  undefined, '', '{bad', '{}', '[]',
  JSON.stringify({ default: SECRET }),
  JSON.stringify({ ci_only: SECRET }),
  JSON.stringify({ a: SECRET, b: OTHER }),
  JSON.stringify([{ name: 'default', api_key: SECRET }]),
  JSON.stringify({ default: 'service_role_legacy_jwt' }),
]
for (const raw of bytePeek) {
  const { source } = selectSecretKey(raw)
  if (typeof source === 'string' && (source.includes(SECRET) || source.includes(OTHER) || source.includes('sb_secret_'))) {
    failures++
    console.error(`FAIL byte-leak: source leaked key material -> ${source}`)
  }
}
if (!failures) console.log('ok   source never leaks key bytes')

if (failures) {
  console.error(`\n${failures} selftest failure(s)`)
  process.exit(1)
}
console.log('\nAll ci-bootstrap keyselect selftests passed.')
