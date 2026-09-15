// TWO COPIES OF A CREDENTIAL RULE, AND THEY MUST NOT DISAGREE.
//
// ⚠️ THE PREFIX THE PLATFORM RESERVED IS WHY THIS EXISTS. An operator cannot
// set `SUPABASE_SERVICE_ROLE_KEY` — the attempt is refused with "Name must not
// start with the SUPABASE_ prefix" — so a rotated service credential cannot
// reach an edge function through that variable. It arrives in the injected
// `SUPABASE_SECRET_KEYS` dictionary instead, and `ci-bootstrap/keyselect.mjs`
// has selected from it since the signing-key work.
//
// ⚖️ `_shared/serviceKey.ts` IS THAT SELECTION FOR THE 25 CREATOR-FACING
// FUNCTIONS, and this executes BOTH so they cannot drift. Two copies handing
// different identities to different functions is the one drift here that
// cannot be allowed to pass unnoticed — and reading the source would catch a
// renamed field and miss a changed tie-break.
//
// ⚠️ THEY DIFFER IN EXACTLY ONE INTENDED WAY, ASSERTED BELOW: `ci-bootstrap`
// fails closed with no legacy fallback, because it hands out staging
// credentials and a wrong answer is worse than none. The shared one falls back
// to the injected legacy value WHILE IT WORKS, because failing closed on 25
// creator-facing functions would take script generation, thumbnails and DNA
// scans down together.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { selectSecretKey } from '../../../../supabase/functions/ci-bootstrap/keyselect.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SHARED_RAW = readFileSync(join(REPO, 'supabase/functions/_shared/serviceKey.ts'), 'utf8')

function sharedCopy() {
  // ⚠️ `export` KEYWORDS STRIPPED BEFORE TRANSPILING, the fix the
  // paragraphUsedParity precedent records: esbuild emits CJS machinery
  // referencing `module`/`exports`, which do not exist inside `new Function`.
  // Types go too — `export type`/`export interface` leave nothing to run.
  const src = SHARED_RAW
    .replace(/^export (type|interface) [\s\S]*?^\}$/gm, '')
    .replace(/^export type [^\n]*$/gm, '')
    .replace(/^export /gm, '')
  const js = transformSync(src, { loader: 'ts', format: 'cjs' }).code
  return new Function(`${js}; return { selectFromDictionary, resolveServiceKey }`)() as {
    selectFromDictionary: (raw: string | null) => { key: string | null; source: string }
    resolveServiceKey: (env: { get(n: string): string | undefined }) =>
      { key: string | null; source: string }
  }
}
const shared = sharedCopy()

const S1 = 'sb_secret_aaaaaaaaaaaaaaaaaaaa'
const S2 = 'sb_secret_bbbbbbbbbbbbbbbbbbbb'

// ⚠️ THE TABLE MUST DISCRIMINATE. Two selectors that both return nothing agree
// perfectly and prove nothing, so hits, refusals and every documented shape are
// present, and the assertions below check the table produced both.
const FIXTURES: Array<[string, string | null]> = [
  ['absent', null],
  ['empty string', ''],
  ['malformed json', '{not json'],
  ['object map, default present', JSON.stringify({ default: S1, other: S2 })],
  ['object map, sole key not named default', JSON.stringify({ onlyone: S1 })],
  ['object map, several none default', JSON.stringify({ a: S1, b: S2 })],
  ['array of objects with api_key', JSON.stringify([{ name: 'default', api_key: S1 }])],
  ['array of plain strings, sole', JSON.stringify([S1])],
  ['array of plain strings, several', JSON.stringify([S1, S2])],
  ['nested value/secret/key aliases', JSON.stringify({ default: { secret: S1 } })],
  ['wrong prefix is not a secret key', JSON.stringify({ default: 'eyJhbGciOiJIUzI1NiJ9.x.y' })],
  ['empty object', JSON.stringify({})],
  ['empty array', JSON.stringify([])],
  ['non-string non-object values', JSON.stringify({ default: 42 })],
]

describe('the two selectors agree on which key to use', () => {
  for (const [name, raw] of FIXTURES) {
    it(name, () => {
      const mine = shared.selectFromDictionary(raw)
      const theirs = selectSecretKey(raw)
      // The shared copy normalises "no usable key" to a single `none`; the
      // bootstrap copy distinguishes why (missing / malformed_json /
      // no_valid_secret / ambiguous_multiple_secrets). What must match is the
      // DECISION — which key, or none — never the diagnostic label.
      expect(mine.key ?? null).toBe(theirs.key ?? null)
    })
  }
})

describe('the fixture table is not vacuous', () => {
  it('produces selections', () => {
    const picked = FIXTURES.filter(([, raw]) => shared.selectFromDictionary(raw).key !== null)
    expect(picked.length).toBeGreaterThan(3)
  })

  it('and produces refusals, including ambiguity', () => {
    const refused = FIXTURES.filter(([, raw]) => shared.selectFromDictionary(raw).key === null)
    expect(refused.length).toBeGreaterThan(5)
    // The tie-break that must never become "pick one arbitrarily".
    expect(shared.selectFromDictionary(JSON.stringify({ a: S1, b: S2 })).key).toBeNull()
    expect(selectSecretKey(JSON.stringify({ a: S1, b: S2 })).key ?? null).toBeNull()
  })

  it('prefers the key named default over any other', () => {
    const r = shared.selectFromDictionary(JSON.stringify({ other: S2, default: S1 }))
    expect(r.key).toBe(S1)
    expect(r.source).toBe('secret_key:default')
  })
})

describe('the one intended difference: this copy falls back, ci-bootstrap does not', () => {
  it('prefers the dictionary when it yields a key', () => {
    const r = shared.resolveServiceKey({
      get: (n) => n === 'SUPABASE_SECRET_KEYS' ? JSON.stringify({ default: S1 })
        : n === 'SUPABASE_SERVICE_ROLE_KEY' ? 'legacy-jwt' : undefined,
    })
    expect(r.key).toBe(S1)
    expect(r.source).toBe('secret_key:default')
  })

  it('falls back to the injected legacy value while it still works', () => {
    const r = shared.resolveServiceKey({
      get: (n) => n === 'SUPABASE_SERVICE_ROLE_KEY' ? 'legacy-jwt' : undefined,
    })
    expect(r.key).toBe('legacy-jwt')
    expect(r.source).toBe('legacy_service_role')
  })

  it('and says so out loud, because that branch must stop firing', () => {
    // A fallback nobody can see is a migration that never finishes.
    expect(SHARED_RAW).toMatch(/event: 'service_key_legacy_fallback'/)
  })

  it('never logs the key itself, only the outcome label', () => {
    const emit = SHARED_RAW.slice(SHARED_RAW.indexOf("event: 'service_key_legacy_fallback'"))
    const block = emit.slice(0, emit.indexOf('}))'))
    expect(block).not.toMatch(/legacy\b(?!_)/)
    expect(block).not.toMatch(/\.key\b/)
  })

  it('returns null rather than throwing when there is nothing at all', () => {
    // A throw here is a 500 to somebody mid-way through making a video.
    const r = shared.resolveServiceKey({ get: () => undefined })
    expect(r.key).toBeNull()
    expect(r.source).toBe('none')
  })

  it('ci-bootstrap still has NO legacy fallback, which is its own contract', () => {
    const boot = readFileSync(
      join(REPO, 'supabase/functions/ci-bootstrap/keyselect.mjs'), 'utf8')
    const code = boot.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    expect(code).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
  })
})
