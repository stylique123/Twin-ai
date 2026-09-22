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

// ── A LINK CAN NAME A PLATFORM AND STILL NOT BE A VIDEO ───────────────────
//
// ⚠️⚠️ MEASURED 2026-09-22, AND IT OVERTURNS THE REASON INSTAGRAM WAS BLOCKED.
// Every Instagram reference attempt in production, split by what the URL
// actually points at:
//
//   url shape      attempts   clean   "no audio url"   "no speech"
//   hashtag page       109        0            109              0
//   /p/ post            51       22             13             15
//   /reel/               0        0              0              0
//
// ⚖️ SO THE 109 FAILURES ARE NOT A BROKEN INTEGRATION. `instagram.com/explore/
// tags/...` is a BROWSE PAGE. It has no video on it, so "no audio url found" is
// the Actor answering correctly, every single time, and we were reading that
// correct answer as evidence that Instagram cannot be read at all. Real posts
// transcribe 22 times out of 51.
//
// ⚠️ AND A ZERO THAT NOBODY ASKED FOR IS NOT A ZERO. Not one `/reel/` url has
// ever been submitted. "Instagram reels cannot be read" was never measured —
// it was inferred from hashtag pages and then believed.
//
// ⚖️ THE HONEST SPLIT IS THEREFORE BY URL, NOT BY PLATFORM. A browse page
// deserves "that is not a video", which tells the creator what to paste
// instead; a post deserves a real attempt. One of those is a sentence she can
// act on and the other was a door we closed on ourselves.

/** Instagram paths that identify ONE post. Everything else on the domain is a
 *  browse surface — a profile, a hashtag, the explore grid — with no single
 *  video to read. */
const IG_SINGLE_VIDEO = /\/(?:p|reel|reels|tv)\/[^/]+/i

/**
 * Does this link point at ONE video we could actually read?
 *
 * ⚠️ FALSE MEANS "NOT A VIDEO", NEVER "UNREADABLE". The distinction is the
 * whole point: one is a fact about the link the creator pasted, which she can
 * fix in five seconds, and the other is a claim about our own capability that
 * cost Instagram its place in the product for weeks.
 *
 * ⚖️ ONLY INSTAGRAM IS JUDGED HERE, BECAUSE ONLY INSTAGRAM WAS MEASURED.
 * TikTok and YouTube browse urls surely exist too, but inventing patterns for
 * failures nobody has produced is how the last wrong rule got written. A
 * platform with no evidence gets the benefit of the doubt and a real attempt.
 */
export function isSingleVideoUrl(url: string | null | undefined): boolean {
  const raw = String(url ?? '').trim()
  if (raw === '') return false
  if (platformFromUrl(raw) !== 'instagram') return true
  let path: string
  try {
    path = new URL(raw).pathname
  } catch {
    return true
  }
  return IG_SINGLE_VIDEO.test(path)
}
