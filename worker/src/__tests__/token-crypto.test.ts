// OAUTH TOKEN ENCRYPTION — the last live §9a.2 item.
//
// The module lives with its only consumer (supabase/functions/social) but is
// tested from here, because the worker suite is what CI actually runs. It uses
// WebCrypto and `btoa`/`atob` only — all present in Node 22 — so it runs
// unchanged in both runtimes, which is also the property that makes it testable
// at all.
//
// THE CUSTODY DECISION IS WHAT THESE TESTS ARE REALLY PINNING. The key is held
// by the edge function, not by the database, because exactly one consumer reads
// these tokens and it already runs outside SQL. An in-database key (Vault)
// defends a pg_dump but NOT a service-role leak, since decryption is then a SQL
// call service_role can make — and a service-role leak is one of the two
// threats §9a.2 names.
import { describe, expect, it } from 'vitest'
import { encryptToken, decryptToken, isEncrypted, TokenCryptoError }
  from '../../../supabase/functions/social/tokenCrypto.ts'

const KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
const OTHER = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
const OWNER = '11111111-1111-1111-1111-111111111111'

describe('round trip', () => {
  it('a token survives encrypt then decrypt', async () => {
    const ct = await encryptToken('ya29.super-secret', KEY, OWNER, 'youtube')
    expect(await decryptToken(ct, KEY, OWNER, 'youtube')).toBe('ya29.super-secret')
  })

  it('the ciphertext does not contain the plaintext', async () => {
    // The obvious property, asserted because "encrypted" that is really
    // "base64-encoded" is a defect people ship.
    const ct = await encryptToken('ya29.super-secret', KEY, OWNER, 'youtube')
    expect(ct).not.toContain('super-secret')
    expect(atob(ct.split(':')[2])).not.toContain('super-secret')
  })

  it('unicode and long tokens survive intact', async () => {
    const long = 'x'.repeat(4096) + '—naïve🎬'
    expect(await decryptToken(await encryptToken(long, KEY, OWNER, 'tiktok'), KEY, OWNER, 'tiktok')).toBe(long)
  })

  it('an empty token round-trips rather than throwing', async () => {
    expect(await decryptToken(await encryptToken('', KEY, OWNER, 'tiktok'), KEY, OWNER, 'tiktok')).toBe('')
  })
})

describe('IV reuse — the property GCM cannot survive losing', () => {
  it('encrypting the SAME token twice yields DIFFERENT ciphertext', async () => {
    // A deterministic IV over a row re-encrypted on every token refresh would
    // repeat constantly, and a repeated IV under one key destroys GCM's
    // confidentiality outright.
    const a = await encryptToken('same', KEY, OWNER, 'youtube')
    const b = await encryptToken('same', KEY, OWNER, 'youtube')
    expect(a).not.toBe(b)
    expect(a.split(':')[1]).not.toBe(b.split(':')[1])
    expect(await decryptToken(a, KEY, OWNER, 'youtube')).toBe('same')
    expect(await decryptToken(b, KEY, OWNER, 'youtube')).toBe('same')
  })
})

describe('the AAD binds a ciphertext to its owner and platform', () => {
  it('a ciphertext moved to ANOTHER OWNER fails to decrypt', async () => {
    // The failure this exists to prevent: posting to the wrong creator's
    // account because a row was copied, by an attacker or by a bad backfill.
    const ct = await encryptToken('tok', KEY, OWNER, 'youtube')
    await expect(decryptToken(ct, KEY, '22222222-2222-2222-2222-222222222222', 'youtube'))
      .rejects.toThrow(TokenCryptoError)
  })

  it('a ciphertext moved to another PLATFORM fails to decrypt', async () => {
    const ct = await encryptToken('tok', KEY, OWNER, 'youtube')
    await expect(decryptToken(ct, KEY, OWNER, 'tiktok')).rejects.toThrow(TokenCryptoError)
  })
})

describe('failures are failures, never a plausible plaintext', () => {
  it('the WRONG KEY throws', async () => {
    const ct = await encryptToken('tok', KEY, OWNER, 'youtube')
    await expect(decryptToken(ct, OTHER, OWNER, 'youtube')).rejects.toThrow(TokenCryptoError)
  })

  it('TAMPERED ciphertext throws — the point of using GCM', async () => {
    const ct = await encryptToken('tok', KEY, OWNER, 'youtube')
    const parts = ct.split(':')
    const bytes = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0))
    bytes[0] ^= 0xff
    const tampered = `${parts[0]}:${parts[1]}:${btoa(String.fromCharCode(...bytes))}`
    await expect(decryptToken(tampered, KEY, OWNER, 'youtube')).rejects.toThrow(TokenCryptoError)
  })

  it('a malformed ciphertext throws rather than being read as plaintext', async () => {
    await expect(decryptToken('v1:onlytwo', KEY, OWNER, 'youtube')).rejects.toThrow(TokenCryptoError)
  })

  it('a key of the wrong LENGTH is named as such', async () => {
    await expect(encryptToken('tok', btoa('short'), OWNER, 'yt')).rejects.toThrow(/32 bytes/)
  })

  it('a key that is not base64 is named as such', async () => {
    await expect(encryptToken('tok', '!!!not base64!!!', OWNER, 'yt')).rejects.toThrow(TokenCryptoError)
  })
})

describe('legacy plaintext drains rather than being backfilled at once', () => {
  it('an unprefixed value is recognised as NOT encrypted', () => {
    expect(isEncrypted('ya29.plain-old-token')).toBe(false)
    expect(isEncrypted(null)).toBe(false)
    expect(isEncrypted(undefined)).toBe(false)
  })

  it('a real ciphertext IS recognised', async () => {
    expect(isEncrypted(await encryptToken('tok', KEY, OWNER, 'yt'))).toBe(true)
  })

  it('a legacy plaintext row still decrypts to itself, so nobody loses posting', async () => {
    // The alternative — a big-bang backfill — silently costs posting to any
    // creator whose row failed to convert. This lets the plaintext population
    // drain on each row's next write instead.
    expect(await decryptToken('ya29.plain-old-token', KEY, OWNER, 'youtube')).toBe('ya29.plain-old-token')
  })

  it('a token that merely STARTS with v-something is not mistaken for ciphertext', () => {
    expect(isEncrypted('v2ya29-token')).toBe(false)
    expect(isEncrypted('version1:abc')).toBe(false)
  })
})
