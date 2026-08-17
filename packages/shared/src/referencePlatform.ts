// THE PLATFORM IS WRITTEN ON THE URL, AND WE WERE ASKING THE CALLER FOR IT.
//
// ⚠️ MEASURED IN PRODUCTION. 44 of 51 reference transcripts have a NULL
// platform, and 34 of those carry "youtube" in the source URL. `ingest-reference`
// reads `body.platform` and the client never sends one, so a fact sitting in
// plain sight on the link was discarded on nearly every ingest — and the studio
// then shows the creator a chip reading "unknown" next to a youtube.com link.
//
// ⚖️ A DERIVABLE FACT MUST NOT BE A PARAMETER. Anything a caller can omit, some
// caller will omit; anything a caller can get wrong, some caller will get wrong.
// The URL is authoritative and always present, so the platform is computed from
// it rather than asked for. Making the SERVER derive it also repairs every
// existing client without shipping one.
//
// ⚖️ AND IT IS THE SAME LIST THE FETCHER ALLOWS. `isSupportedReference` is
// simply "did this resolve to a platform", so the supported-host check and the
// platform check can never disagree — they were separate before, and only one
// of them was ever consulted.

/** Platforms whose links `ingest-reference` can actually fetch and transcribe. */
export const REFERENCE_PLATFORMS = ['tiktok', 'instagram', 'youtube'] as const
export type ReferencePlatform = (typeof REFERENCE_PLATFORMS)[number]

/** Host suffixes, mapped to the platform they mean. Order is irrelevant: a host
 *  matches at most one entry, and `youtu.be` is listed because a shortened link
 *  is the most common way a creator pastes a YouTube video. */
const HOSTS: ReadonlyArray<readonly [string, ReferencePlatform]> = [
  ['tiktok.com', 'tiktok'],
  ['instagram.com', 'instagram'],
  ['youtube.com', 'youtube'],
  ['youtu.be', 'youtube'],
]

/**
 * The platform this reference link belongs to, or null when it is not one we
 * can read.
 *
 * ⚠️ MATCHES ON THE HOST, NEVER ON THE WHOLE STRING. A substring test would
 * accept `https://evil.example.com/?q=youtube.com` — the SSRF surface this
 * allow-list exists to close. `endsWith('.' + d)` admits `www.youtube.com` and
 * `m.tiktok.com` while refusing `nottiktok.com`.
 *
 * ⚖️ NEVER THROWS. It runs on creator-pasted text, which is frequently not a
 * URL at all, and an unparseable string is simply not a supported reference.
 */
export function platformFromUrl(url: string | null | undefined): ReferencePlatform | null {
  const raw = String(url ?? '').trim()
  if (!raw) return null
  let host: string
  try {
    host = new URL(raw).hostname.toLowerCase()
  } catch {
    return null
  }
  for (const [domain, platform] of HOSTS) {
    if (host === domain || host.endsWith('.' + domain)) return platform
  }
  return null
}

/** Can this link be truly READ, as opposed to reasoned about as a pattern?
 *  Defined in terms of `platformFromUrl` so the two can never disagree. */
export function isSupportedReference(url: string | null | undefined): boolean {
  return platformFromUrl(url) !== null
}

/**
 * What to store, given a URL and whatever the caller claimed.
 *
 * ⚠️ THE URL WINS, AND THAT IS THE POINT. A caller that sends `tiktok` for a
 * youtube.com link is wrong, and believing it would put a wrong platform on a
 * row that the link itself contradicts. The claim is only consulted when the
 * URL yields nothing — which is how a non-platform link keeps whatever the
 * caller knew about it.
 */
export function resolveReferencePlatform(
  url: string | null | undefined,
  claimed?: string | null,
): ReferencePlatform | 'other' | null {
  const derived = platformFromUrl(url)
  if (derived) return derived
  const c = String(claimed ?? '').trim().toLowerCase()
  if ((REFERENCE_PLATFORMS as readonly string[]).includes(c)) return c as ReferencePlatform
  if (c === 'other') return 'other'
  // ⚖️ NULL, NOT 'other'. "We could not tell" and "the creator said it is
  // something else" are different facts, and only the second is an answer.
  return null
}
