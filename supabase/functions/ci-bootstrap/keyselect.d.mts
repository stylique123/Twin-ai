// Types for the ci-bootstrap secret-key selection, so the parity test that
// EXECUTES it typechecks under the ratchet (0 test files excluded).
//
// ⚠️ THE ABSENT `key` IS NOT A NULL ONE, and that difference is the reason this
// is declared by hand rather than inferred. This module OMITS `key` when it
// fails closed, while `_shared/serviceKey.ts` returns `key: null`. The parity
// test compares the two selections over one fixture table, so a declaration
// that flattened both into `string | null` would let a real divergence in the
// failure shape typecheck cleanly. `key?: string` is what the code does.
//
// ⚖️ AND `source` NEVER CARRIES KEY BYTES. It is a selection label — an outcome
// or a key NAME — which is why callers may log it. The type says so by
// enumerating the outcomes rather than widening to `string`.

/** Selection outcome, or the name of the key chosen. Never key material. */
export type SecretKeySource =
  | 'missing'
  | 'malformed_json'
  | 'no_valid_secret'
  | 'ambiguous_multiple_secrets'
  | 'secret_key:default'
  | `secret_key:${string}`

export interface SecretKeySelection {
  /** ABSENT, not null, whenever the selection failed closed. */
  key?: string
  source: SecretKeySource
}

/**
 * Pick the staging service secret key from the injected `SUPABASE_SECRET_KEYS`
 * dictionary. Deterministic: prefer the key named `default`; else the sole
 * valid `sb_secret_` value; else fail closed. No legacy fallback — on a rotated
 * project the legacy HS256 JWT is rejected, so handing it out would be worse
 * than refusing.
 */
export function selectSecretKey(rawJson: string | null | undefined): SecretKeySelection
