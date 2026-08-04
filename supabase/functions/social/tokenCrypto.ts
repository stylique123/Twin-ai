// OAUTH TOKENS, ENCRYPTED AT REST — and why the key lives HERE and not in SQL.
//
// §9a.2: "Social OAuth access + refresh tokens are plaintext at rest. Column
// grants are correct so clients can never read them, but any dump or
// service-role leak buys the ability to post as every connected creator."
//
// THE CUSTODY QUESTION DECIDED THE DESIGN, and checking who actually reads
// these tokens decided the custody question. Exactly ONE consumer touches them:
// this edge function. The worker never does. So the key does not need to be
// reachable from SQL, from the worker, or from anywhere else — and a key that
// does not need to be reachable somewhere should not be.
//
// Against the two threats §9a.2 names:
//
//   pg_dump / database leak    in-DB key (Vault): survives, because Supabase
//                              holds the root key outside the dump.
//                              edge-function key: survives too.
//   SERVICE-ROLE KEY LEAK      in-DB key: DOES NOT survive. Decryption is a SQL
//                              call and service_role can make it, so the leak
//                              still buys every creator's tokens.
//                              edge-function key: survives. service_role reads
//                              ciphertext and nothing else.
//
// The second row is the whole decision. Vault defends the dump; only holding
// the key outside the database defends the credential that can read the
// database. Since the sole consumer already runs outside SQL, that costs
// nothing here — which is not true in general and is why this is worth stating
// rather than treating as obvious.
//
// AES-256-GCM via WebCrypto: authenticated, so a tampered ciphertext fails to
// decrypt rather than yielding attacker-chosen plaintext.
//
// AAD BINDS THE ROW TO ITS OWNER. The additional authenticated data is
// `owner_id|platform`, so a ciphertext copied from one connection row to
// another — by an attacker with write access, or by a bad backfill — fails to
// decrypt instead of silently authorising a post as the wrong creator.

/** `v1:<base64 iv>:<base64 ciphertext+tag>`. The prefix is what makes rotation and the plaintext migration expressible. */
const V1 = 'v1'
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export class TokenCryptoError extends Error {}

/** True when a stored value is already ciphertext this module wrote. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${V1}:`)
}

async function importKey(rawKeyB64: string): Promise<CryptoKey> {
  let raw: Uint8Array
  try { raw = unb64(rawKeyB64) } catch { throw new TokenCryptoError('token key is not valid base64') }
  // 32 bytes exactly. A short key is not a weaker key here, it is a
  // misconfiguration — WebCrypto would reject it anyway, but saying so names
  // the cause instead of surfacing an opaque DOMException at publish time.
  if (raw.length !== 32) throw new TokenCryptoError(`token key must be 32 bytes, got ${raw.length}`)
  return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

const aad = (ownerId: string, platform: string) => new TextEncoder().encode(`${ownerId}|${platform}`)

export async function encryptToken(
  plaintext: string, rawKeyB64: string, ownerId: string, platform: string,
): Promise<string> {
  const key = await importKey(rawKeyB64)
  // A FRESH IV PER ENCRYPTION, never derived from the row. GCM loses all
  // confidentiality guarantees if an IV repeats under the same key, and a
  // deterministic IV over a row that gets re-encrypted on every token refresh
  // would repeat constantly.
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(ownerId, platform) },
    key, new TextEncoder().encode(plaintext),
  ))
  return `${V1}:${b64(iv)}:${b64(ct)}`
}

/**
 * Decrypt a stored value.
 *
 * A value with NO prefix is legacy plaintext, from before this existed, and is
 * returned as-is. That is deliberate: the alternative is a big-bang backfill,
 * and a creator whose row failed to convert would silently lose the ability to
 * post. `isEncrypted` lets the caller re-encrypt lazily on the next write, so
 * the plaintext population drains without a migration that can half-succeed.
 */
export async function decryptToken(
  stored: string, rawKeyB64: string, ownerId: string, platform: string,
): Promise<string> {
  if (!isEncrypted(stored)) return stored
  const parts = stored.split(':')
  if (parts.length !== 3) throw new TokenCryptoError('ciphertext is malformed')
  const key = await importKey(rawKeyB64)
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(parts[1]), additionalData: aad(ownerId, platform) },
      key, unb64(parts[2]),
    )
    return new TextDecoder().decode(pt)
  } catch {
    // Wrong key, tampered bytes, or a row moved between owners. All three are
    // "do not post", never "post with something".
    throw new TokenCryptoError('token could not be decrypted')
  }
}
