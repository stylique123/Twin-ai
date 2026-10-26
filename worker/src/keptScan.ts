// THE SCAN WE ALREADY PAID FOR, KEPT SO A RETRY DOES NOT PAY AGAIN.
//
// ⚠️ 2026-10-26: onboarding scans read the account through Apify (paid), then
// failed at the voice-building model call on a quota refusal. Each retry then
// re-ran Apify to fetch the same posts, only to hit the same refusal.
//
// ⚖️ NO NEW TABLE, NO MIGRATION. The posts ride the scrape_dna job's own
// `result` (written as soon as they are read, and again on the failure result),
// and the next scrape_dna for the SAME voice, handle and platform reuses them
// instead of reading again. `fail_job` keeps `result` on a queue retry, so a
// re-claimed job finds its own row too.
import type { ScrapedPost } from './media.js'

export const KEPT_SCAN_MAX_AGE_MS = 24 * 60 * 60 * 1000
/** The pool is already capped; this caps each caption. */
const MAX_TEXT = 2_000

export interface KeptScan {
  handle: string
  platform: string
  read_at: string
  posts: ScrapedPost[]
  facts: Record<string, unknown> | null
}

export function keepScan(handle: string, platform: string, posts: ScrapedPost[], facts: unknown, now = new Date()): KeptScan {
  return {
    handle, platform, read_at: now.toISOString(),
    posts: posts.map((p) => ({ ...p, text: String(p.text ?? '').slice(0, MAX_TEXT) })),
    facts: facts && typeof facts === 'object' ? (facts as Record<string, unknown>) : null,
  }
}

/** Validate a stored kept scan. Anything malformed, stale, empty or for a
 *  different handle/platform is ignored — a fresh read is always safe. */
export function usableKeptScan(raw: unknown, handle: string, platform: string, now = Date.now()): KeptScan | null {
  if (!raw || typeof raw !== 'object') return null
  const k = raw as Partial<KeptScan>
  if (k.handle !== handle || k.platform !== platform) return null
  const at = Date.parse(String(k.read_at ?? ''))
  if (!Number.isFinite(at) || now - at > KEPT_SCAN_MAX_AGE_MS || at > now + 60_000) return null
  if (!Array.isArray(k.posts)) return null
  const posts = k.posts.filter((p): p is ScrapedPost =>
    !!p && typeof p === 'object' && typeof (p as ScrapedPost).text === 'string' && (p as ScrapedPost).text.trim().length > 0)
  if (!posts.length) return null
  return { handle, platform, read_at: String(k.read_at), posts, facts: k.facts ?? null }
}
