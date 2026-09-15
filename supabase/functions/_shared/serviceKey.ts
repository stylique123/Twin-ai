// THE CREDENTIAL 25 EDGE FUNCTIONS ASK FOR, AND WHERE IT REALLY COMES FROM.
//
// ⚠️ `SUPABASE_SERVICE_ROLE_KEY` CANNOT BE SET BY AN OPERATOR. The platform
// reserves the `SUPABASE_` prefix and injects those values itself — an attempt
// to set one is refused with "Name must not start with the SUPABASE_ prefix",
// which is exactly what happened when the rotation was attempted by hand on
// 2026-09-15. So a rotated service credential CANNOT reach these functions
// through that variable, and the code has to read the new one.
//
// ⚖️ THE NEW ONE IS ALSO INJECTED, AS A DICTIONARY. `SUPABASE_SECRET_KEYS`
// carries the project's `sb_secret_...` keys, and the gateway maps those to
// `service_role` without JWT verification — the same path the anon side already
// uses with `sb_publishable_...`. `ci-bootstrap` has read it this way since the
// signing-key work; this module is that selection made available to the
// functions that serve creators.
//
// ⚠️ AND UNLIKE `ci-bootstrap`, THIS FALLS BACK, ON PURPOSE. That function
// fails closed because it hands out staging credentials and a wrong answer is
// worse than no answer. These 25 serve live creators: failing closed the moment
// a dictionary is absent would take down script generation, thumbnails and DNA
// scans together. So the legacy injected value is still accepted WHILE IT
// WORKS, and the choice is logged — because a fallback nobody can see is a
// migration that never finishes.
//
// ⚖️ THE LOG NAMES THE OUTCOME, NEVER THE BYTES. `source` is a selection label,
// so it is safe to emit; the key itself is never logged, and the legacy case is
// logged loudly so "the fallback is still firing" is a measurable fact rather
// than an assumption about what production is doing.

/** Where the credential came from. A label, never key material. */
export type ServiceKeySource =
  | 'secret_key:default'
  | `secret_key:${string}`
  | 'legacy_service_role'
  | 'none'

export interface ServiceKeyResult {
  readonly key: string | null
  readonly source: ServiceKeySource
}

/**
 * Pick the service credential from the injected dictionary.
 *
 * ⚠️ PARITY: this selection mirrors `ci-bootstrap/keyselect.mjs`, and
 * `serviceKeyParity.test.ts` EXECUTES both over one fixture table. Two copies
 * of a credential rule that disagree would hand different identities to
 * different functions, which is the one drift here that cannot be allowed to
 * go unnoticed.
 *
 * ⚖️ DETERMINISTIC, AND AMBIGUITY IS A REFUSAL. Prefer the key named
 * `default`; else the SOLE valid `sb_secret_` value; else refuse. Picking
 * arbitrarily from several would make which credential a function uses depend
 * on object key order.
 */
export function selectFromDictionary(rawJson: string | null | undefined): ServiceKeyResult {
  if (!rawJson) return { key: null, source: 'none' }
  let parsed: unknown
  try { parsed = JSON.parse(rawJson) } catch { return { key: null, source: 'none' } }

  const candidates: Array<{ name: string; value: string }> = []
  const push = (name: unknown, value: unknown) => {
    if (typeof value === 'string') {
      candidates.push({ name: String(name ?? ''), value })
      return
    }
    if (value && typeof value === 'object') {
      const o = value as Record<string, unknown>
      const v = o.api_key ?? o.secret ?? o.value ?? o.key
      if (typeof v === 'string') {
        candidates.push({ name: String(name ?? o.name ?? o.id ?? ''), value: v })
      }
    }
  }
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (typeof item === 'string') candidates.push({ name: '', value: item })
      else push((item as Record<string, unknown>)?.name ?? (item as Record<string, unknown>)?.id, item)
    }
  } else if (parsed && typeof parsed === 'object') {
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) push(name, value)
  }

  const valid = candidates.filter((c) => c.value.startsWith('sb_secret_'))
  if (valid.length === 0) return { key: null, source: 'none' }
  const byDefault = valid.find((c) => c.name === 'default')
  if (byDefault) return { key: byDefault.value, source: 'secret_key:default' }
  if (valid.length === 1) return { key: valid[0].value, source: `secret_key:${valid[0].name || 'sole'}` }
  // Several, none named `default`: refuse rather than choose.
  return { key: null, source: 'none' }
}

/**
 * The service credential for a creator-facing edge function.
 *
 * ⚠️ NEVER THROWS. A function that dies here returns a 500 to somebody mid-way
 * through making a video, and the caller can present a missing credential far
 * better than a stack trace can. `key` is null when there is genuinely nothing
 * to use, and the caller decides.
 */
export function resolveServiceKey(env: {
  get(name: string): string | undefined
}): ServiceKeyResult {
  const fromDict = selectFromDictionary(env.get('SUPABASE_SECRET_KEYS') ?? null)
  if (fromDict.key) return fromDict

  const legacy = env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (typeof legacy === 'string' && legacy.trim() !== '') {
    // ⚠️ LOGGED EVERY TIME, because this is the branch that must stop firing
    // before the exposed legacy key can be disabled. Silence here would make
    // "is the migration done?" unanswerable without reading 25 files.
    console.warn(JSON.stringify({
      event: 'service_key_legacy_fallback',
      reason: fromDict.source === 'none' ? 'no_usable_secret_key' : fromDict.source,
    }))
    return { key: legacy, source: 'legacy_service_role' }
  }
  return { key: null, source: 'none' }
}

/**
 * The credential as a string, for the `createClient(url, key)` call sites.
 *
 * ⚠️ THE ABSENT CASE IS HANDLED HERE, ONCE, NOT AT 25 CALL SITES. Every site
 * used to read `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!` — a non-null
 * assertion, which is the cast this repo records as defeating the compiler. An
 * empty string behaves exactly as that `!` did when the variable was unset (the
 * gateway refuses the request), so this is not a new failure mode; what is new
 * is that the absence is now LOGGED instead of being indistinguishable from a
 * working call.
 *
 * ⚖️ AND IT IS A SEPARATE INCIDENT FROM THE FALLBACK. "Fell back to the legacy
 * key" and "found no credential at all" need opposite responses — one means the
 * migration is unfinished, the other means the function cannot work — so they
 * are never pooled into one line.
 */
export function serviceKeyFrom(env: { get(name: string): string | undefined }): string {
  const r = resolveServiceKey(env)
  if (r.key) return r.key
  console.warn(JSON.stringify({ event: 'service_key_absent' }))
  return ''
}
