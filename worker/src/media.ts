import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from './env.js'
import { readVerdict } from './profileReadVerdict.js'

// --- SSRF guard ------------------------------------------------------------
// The worker downloads user-supplied URLs with yt-dlp, so we ONLY allow the
// social platforms we actually ingest. No file://, no internal IPs, no SSRF.
const ALLOWED_HOSTS = [
  'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com',
  'instagram.com', 'www.instagram.com',
  'youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com',
  // Instagram / Facebook media CDNs. The DNA scrape returns ready-to-fetch mp4
  // URLs on these public Meta edges (scontent-*.cdninstagram.com, *.fbcdn.net).
  // We only ever feed them URLs WE scraped, so allowing them lets the brand-voice
  // build pull audio straight off the clip with ffmpeg+whisper — no paid Apify
  // transcript call. (Public CDN hosts, not internal, so no SSRF exposure.)
  'cdninstagram.com', 'fbcdn.net',
]

function assertAllowedUrl(raw: string): URL {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new Error('Invalid URL')
  }
  if (u.protocol !== 'https:') throw new Error('Only https URLs are allowed')
  const host = u.hostname.toLowerCase()
  const ok = ALLOWED_HOSTS.some((h) => host === h || host.endsWith('.' + h))
  if (!ok) throw new Error(`Host not allowed: ${host}`)
  return u
}

// --- subprocess helper (no shell; args are passed as an array) -------------
function run(cmd: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-400)}`))
    })
  })
}

/** Which route produced a transcript, and — when it cost money — why.
 *
 *  ⚠️ THE PRICE OF A YOUTUBE TRANSCRIPT WAS UNOBSERVABLE. `transcribeFromUrl`
 *  tries free captions and falls back to a paid Actor on ANY thrown error: no
 *  captions, a 30-second timeout, a library fault. It logged one `console.error`
 *  on the fallback, nothing at all on success, and stored neither. So "how often
 *  do YouTube captions actually exist" — the question that decides whether that
 *  platform's transcript budget can be raised like TikTok's — could not be
 *  answered from production at any sample size.
 *
 *  ⚖️ AND "NO CAPTIONS" MUST NOT BE POOLED WITH "IT BROKE". They imply opposite
 *  actions: the first is a fact about YouTube that caps the budget, the second is
 *  a bug on our side that inflates the bill while looking identical in a total.
 *  The Python helper already exits 2 with NO_CAPTIONS for one and 1 for the
 *  other; nothing downstream was reading the difference. */
export type TranscriptSource =
  | 'youtube_captions_free'
  | 'youtube_captions_paid'
  | 'instagram_paid'
  | 'local_whisper'

/** Why a paid route ran. Absent on free routes. */
export type PaidBecause = 'no_captions' | 'free_path_failed'

// WHICH ROUTE READ THIS VIDEO — recorded, never inferred.
//
// ⚠️ THE ECONOMIC QUESTION IS "WHAT FRACTION OF TIKTOKS NEED PAID ROUTING", and
// nothing can answer it after the fact if the successful route was not written
// down. A silent fallback chain reports one number — "it worked" — and hides the
// only number that decides whether a 4,297-URL gallery is affordable.
//
// ⚖️ TIKTOK ONLY, DELIBERATELY. YouTube and Instagram have their own routes for
// their own reasons and are NOT part of this ladder. One datacenter IP being
// bullied by TikTok is not an argument for an "all platforms via Apify"
// abstraction, and building one would hide three different cost stories behind
// a single word.
export const DOWNLOAD_ROUTES = [
  /** yt-dlp from our own IP, explicitly impersonating a real browser. Free. */
  'local_impersonated',
  /** yt-dlp through Apify's residential proxy. Paid per GB of egress, and it
   *  keeps the local pipeline — local media, local whisper, local frames. */
  'residential_proxy',
  /** ⚠️ TIER 3, LAST RESORT. An Actor performs the whole per-video extraction,
   *  so it is paid per video and it leaves our pipeline entirely. For individual
   *  high-value URLs that survive both rungs above — never a bulk default. */
  'apify_actor',
] as const
export type DownloadRoute = (typeof DOWNLOAD_ROUTES)[number]

/**
 * ⚖️ THE IMPERSONATION TARGET, ASKED FOR RATHER THAN ASSUMED.
 *
 * ⚠️ THE IMAGE HAS HAD 37 USABLE TARGETS SINCE 33a7b7b AND ASKED FOR NONE OF
 * THEM. `--list-impersonate-targets` reports the capability; the download never
 * passed `--impersonate`, so every TikTok fetch went out as plain yt-dlp. That
 * is the same failure the curl-cffi ceiling was: a dependency present, installed,
 * importable — and not effective, because nothing invoked it.
 *
 * `chrome` rather than a pinned version, because yt-dlp resolves it to the best
 * available target and pinning one would break the day that target moves — which
 * is exactly how the unbounded floor broke us in the other direction.
 */
export const IMPERSONATE_TARGET = 'chrome'

export interface Transcript {
  language: string
  duration_sec: number
  text: string
  words: { w: string; start: number; end: number }[]
  segments: { start: number; end: number; text: string }[]
  /** ⚠️ ABSENT MEANS UNRECORDED, NOT FREE. Transcripts parsed straight out of a
   *  helper's JSON carry whatever that helper wrote, and counting an unstamped
   *  one as free would report a cost of zero for routes never measured. */
  source?: TranscriptSource
  paidBecause?: PaidBecause
  /** ⚠️ ABSENT MEANS UNRECORDED, NOT FREE — the same rule `source` follows.
   *  Only the TikTok ladder sets this. */
  downloadRoute?: DownloadRoute
}

export interface ScrapedPost {
  text: string
  likes: number
  plays: number
  hashtags: string[]
  url: string
  cover?: string // best-effort video cover/thumbnail URL, for reading the brand palette
}

// FREE TikTok profile scrape via yt-dlp. Datacenter IPs are NOT bot-blocked for
// TikTok (unlike YouTube/Instagram), so `--flat-playlist -J` returns full per-video
// metadata in one fast call: the caption (`title`/`description`), `view_count` and
// `like_count`. That's everything the DNA synth needs, with no paid Apify run. The
// profile URL scopes results to THIS creator, so no other-account leak is possible;
// an empty result means private/empty/invalid, which the caller refuses.
/** WHO THE HANDLE ACTUALLY RESOLVED TO.
 *
 *  ⚠️ THESE FACTS WERE ALWAYS HERE AND WERE ALWAYS DISCARDED. yt-dlp's `-J` on a
 *  profile returns the channel name, the canonical uploader id, the follower
 *  count and the playlist size alongside `entries`, and this function read
 *  `entries` and dropped the rest on the floor. That is why a scan of
 *  `@CarterPCs` could build a voice from a 146-subscriber channel called "five"
 *  and report no error: nothing ever looked at the account it landed on.
 *
 *  ⚖️ `null` MEANS NOT READ, AND IS NOT ZERO. yt-dlp omits the follower count on
 *  some accounts, and rounding that absence to 0 is the same three-state defect
 *  this repo keeps finding — it would make every unread account look like a
 *  brand new one. */
export interface ScrapedProfileFacts {
  resolvedHandle: string | null
  displayName: string | null
  audience: number | null
  postCount: number | null
  /** ⚠️ HOW MANY POSTS THE SOURCE ACTUALLY RETURNED, BEFORE ANY FILTERING.
   *  "The account is private or empty" and "we read twelve posts and threw all
   *  twelve away" produce the same empty array and need opposite responses —
   *  the first is the creator's to fix, the second is ours. Reported against a
   *  real failure on a large public Instagram account whose posts carried no
   *  caption text where the reader looked for it. `null` where a source cannot
   *  say. */
  rawCount: number | null
}

export async function scrapeTikTokProfile(
  handle: string, limit = 12,
): Promise<{ posts: ScrapedPost[]; facts: ScrapedProfileFacts }> {
  const h = handle.replace(/^@/, '')
  const url = `https://www.tiktok.com/@${h}`
  assertAllowedUrl(url)
  const { stdout } = await run('yt-dlp', ['--flat-playlist', '-J', '--playlist-end', String(limit), url], 60_000)
  const data = JSON.parse(stdout) as {
    entries?: Record<string, unknown>[]
    channel?: unknown; uploader?: unknown; uploader_id?: unknown
    channel_follower_count?: unknown; playlist_count?: unknown
  }
  const entries = Array.isArray(data.entries) ? data.entries : []
  const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim().replace(/^@/, '') : null)
  const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const facts: ScrapedProfileFacts = {
    resolvedHandle: str(data.uploader_id) ?? str(data.uploader),
    displayName: str(data.channel) ?? str(data.uploader),
    audience: int(data.channel_follower_count),
    // ⚖️ Only the playlist total counts. `entries.length` is capped by `limit`,
    // so reading it here would report "12 posts" for every prolific account and
    // — worse — a real 0 would be indistinguishable from a page that failed.
    postCount: int(data.playlist_count),
    // How many the reader actually got back this run, before any filtering.
    rawCount: entries.length,
  }
  return { posts: buildPosts(entries), facts }
}

/** The original signature, unchanged for callers that only want the posts. */
export async function scrapeTikTokPosts(handle: string, limit = 12): Promise<ScrapedPost[]> {
  return (await scrapeTikTokProfile(handle, limit)).posts
}

// --- Profile scrape via Apify, because yt-dlp reads nothing from here --------
//
// ⚠️ THE SCAN WAS A SILENT NO-OP. `scrape_dna` called `scrapeTikTokProfile` for
// EVERY platform — a YouTube creator was scraped against `tiktok.com/@handle` —
// and yt-dlp is now bot-blocked for TikTok from datacenter IPs as well. A live
// job against a real user finished in 10 seconds, read zero posts, wrote zero
// `creator_knowledge`, kept the voice `ready`, and recorded status `done`. The
// caption-knowledge extraction added in #330 is correct and could never fire,
// because it is downstream of a scrape that hands it an empty list.
//
// ⚖️ FREE FIRST, PAID ONLY WHEN FREE RETURNS NOTHING — the rule
// `youtubeTranscriptFree` → `youtubeTranscriptViaApify` already follows. yt-dlp
// still works for some accounts and costs nothing; Apify is the fallback, not
// the default. An EMPTY result counts as failure here: a profile that parses to
// zero posts is the exact shape of the silent no-op this exists to end.
async function apifyDataset(actor: string, input: unknown, timeoutMs = 300_000): Promise<Record<string, unknown>[]> {
  if (!env.apifyToken) throw new Error('APIFY_TOKEN is not set; cannot scrape profile')
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${env.apifyToken}`
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: ctl.signal,
    })
    if (!r.ok) throw new Error(`apify ${actor} returned ${r.status}`)
    const j = await r.json()
    return Array.isArray(j) ? (j as Record<string, unknown>[]) : []
  } finally {
    clearTimeout(timer)
  }
}

/** An Apify run that reports a failure IN ITS DATASET rather than by failing.
 *
 * ⚠️ THE SHAPE THAT MADE A PUBLIC ACCOUNT LOOK PRIVATE. The Instagram Actor
 * succeeds, exits 0, and writes ONE item that is not a post:
 *
 *   { error: 'no_items', errorDescription: 'Empty or private data for provided
 *     input', requestErrorMessages: ['Error: request timed out after 30 seconds'] }
 *
 * Every item was being mapped to a post, so this became a post with no caption,
 * was dropped by the caption filter, and surfaced to the creator as "we couldn't
 * read any public posts — if that account is private or empty, make it public".
 * The account was public with thousands of posts. The Actor had TIMED OUT.
 *
 * ⚖️ AND THE ACTOR'S OWN WORDING IS NOT TO BE TRUSTED EITHER. It labels a
 * timeout "Empty or private data", which is a guess about a cause it does not
 * know. Passing that through to a creator turns our infrastructure problem into
 * an accusation about their account. */
const isErrorItem = (e: Record<string, unknown>): boolean =>
  typeof e.error === 'string' && e.error.trim() !== ''

/** The read failed on OUR side. Distinct from a genuinely empty account, which
 *  is a fact about the creator and needs the opposite message. */
export class ProfileReadFailedError extends Error {
  readonly detail: string
  constructor(detail: string) {
    super(`profile read failed: ${detail}`)
    this.name = 'ProfileReadFailedError'
    this.detail = detail
  }
}

/** Split a dataset into real records and the run's own error report. */
function partitionItems(items: Record<string, unknown>[]): {
  records: Record<string, unknown>[]; failure: string | null
} {
  const records = items.filter((e) => !isErrorItem(e))
  const errs = items.filter(isErrorItem)
  if (records.length > 0 || errs.length === 0) return { records, failure: null }
  const first = errs[0]
  // ⚠️ THE UNDERLYING MESSAGE IS PREFERRED OVER THE ACTOR'S LABEL, because
  // "request timed out after 30 seconds" is the true cause and "Empty or
  // private data" is the Actor guessing at one.
  const why = Array.isArray(first.requestErrorMessages) && first.requestErrorMessages.length > 0
    ? String(first.requestErrorMessages[0])
    : String(first.errorDescription ?? first.error ?? 'unknown')
  return { records, failure: why.split('\n')[0].slice(0, 200) }
}

/** Read a profile dataset, asking twice when the first answer was not about the
 *  creator.
 *
 *  ⚠️ EXACTLY ONE EXTRA ATTEMPT. A transient timeout clears on the second try
 *  or it is not transient; a loop here would turn one bad afternoon into an
 *  unbounded bill, and the third attempt has never been the one that works.
 *
 *  ⚖️ THE SECOND FAILURE IS THE ONE REPORTED, and both are logged. Reporting
 *  the first would describe a state we already know we could not reproduce. */
async function readProfileRecords(
  actor: string,
  input: unknown,
  where: string,
): Promise<{ items: Record<string, unknown>[]; records: Record<string, unknown>[] }> {
  let last = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    const items = await apifyDataset(actor, input)
    const { records, failure } = partitionItems(items)
    if (failure === null) return { items, records }
    last = failure
    const verdict = readVerdict(failure)
    console.warn(JSON.stringify({
      event: 'profile_read_failed', where, attempt, verdict, detail: failure,
    }))
    if (verdict === 'permanent') break
  }
  throw new ProfileReadFailedError(last)
}


const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const nullableInt = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const nonEmpty = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim().replace(/^@/, '') : null)
const tags = (text: string) =>
  Array.from(new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.slice(1)))).slice(0, 6)

async function tiktokProfileViaApify(handle: string, limit: number) {
  // ⚠️ AN ERROR REPORT IS NOT A POST — the same rule on every Actor-backed
  // reader, because the shape is the Actor platform's, not Instagram's. And a
  // failure that is not about this creator is asked again once before it is
  // allowed to end their scan.
  const { items, records } = await readProfileRecords(env.apifyTiktokProfileActor, {
    profiles: [handle.replace(/^@/, '')],
    profileScrapeSections: ['videos'],
    profileSorting: 'latest',
    resultsPerPage: limit,
    excludePinnedPosts: false,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    downloadSubtitlesOptions: 'NEVER_DOWNLOAD_SUBTITLES',
  }, 'tiktok')
  const authorSource = items.find((e) => !isErrorItem(e)) ?? {}
  const author = (authorSource.authorMeta ?? {}) as Record<string, unknown>
  const posts: ScrapedPost[] = records
    .map((e) => {
      const text = String(e.text ?? '').replace(/\s+/g, ' ').trim()
      const meta = (e.videoMeta ?? {}) as Record<string, unknown>
      return {
        text,
        likes: num(e.diggCount),
        plays: num(e.playCount),
        hashtags: tags(text),
        url: String(e.webVideoUrl ?? ''),
        cover: typeof meta.coverUrl === 'string' ? meta.coverUrl : undefined,
      }
    })
    // ⚖️ A CAPTION IS WHAT THE VOICE IS LEARNED FROM, so a post without one
    // teaches nothing — but the COUNT of what was dropped is kept below, because
    // discarding everything and reading nothing must not look identical.
    .filter((p) => p.text.length > 0)
  const facts: ScrapedProfileFacts = {
    rawCount: records.length,
    resolvedHandle: nonEmpty(author.name),
    displayName: nonEmpty(author.nickName),
    audience: nullableInt(author.fans),
    postCount: nullableInt(author.video),
  }
  return { posts, facts }
}

async function youtubeChannelViaApify(handle: string, limit: number) {
  // ⚠️ AN ERROR REPORT IS NOT A POST. See `partitionItems`; and see
  // `readProfileRecords` for why a transient one is asked again first.
  const { records } = await readProfileRecords(env.apifyYoutubeChannelActor, {
    startUrls: [{ url: `https://www.youtube.com/@${handle.replace(/^@/, '')}` }],
    maxResults: limit,
    // MUST equal maxResults — see the note in env.ts. A shorts-first channel
    // returns nothing at all when this is 0.
    maxResultsShorts: limit,
    maxResultStreams: 0,
    sortVideosBy: 'NEWEST',
  }, 'youtube')
  const first = records[0] ?? {}
  const posts: ScrapedPost[] = records
    .map((e) => {
      const text = String(e.title ?? '').replace(/\s+/g, ' ').trim()
      return {
        text,
        // The channel scraper reports views but not likes. 0 is the honest read
        // of "not returned" for a metric the DNA synth only ranks by.
        likes: 0,
        plays: num(e.viewCount),
        hashtags: tags(text),
        url: String(e.url ?? ''),
        cover: typeof e.thumbnailUrl === 'string' ? e.thumbnailUrl : undefined,
      }
    })
    // ⚖️ A CAPTION IS WHAT THE VOICE IS LEARNED FROM, so a post without one
    // teaches nothing — but the COUNT of what was dropped is kept below, because
    // discarding everything and reading nothing must not look identical.
    .filter((p) => p.text.length > 0)
  const facts: ScrapedProfileFacts = {
    rawCount: records.length,
    resolvedHandle: nonEmpty(first.channelUsername),
    displayName: nonEmpty(first.channelName),
    audience: nullableInt(first.numberOfSubscribers),
    postCount: nullableInt(first.channelTotalVideos),
  }
  return { posts, facts }
}

async function instagramProfileViaApify(handle: string, limit: number) {
  const h = handle.replace(/^@/, '')
  // ⚠️ AN ERROR REPORT IS NOT A POST. This is the function the defect was found
  // in: the Actor timed out on a large public account, wrote one error item, and
  // every downstream layer read it as a caption-less post. Partitioning stopped
  // that becoming a fake post; `readProfileRecords` stops the timeout itself
  // ending the scan on the first try.
  const { records } = await readProfileRecords(env.apifyInstagramProfileActor, {
    directUrls: [`https://www.instagram.com/${h}/`],
    resultsType: 'posts',
    resultsLimit: limit,
    addParentData: false,
  }, 'instagram')
  const first = records[0] ?? {}
  const posts: ScrapedPost[] = records
    .map((e) => {
      const text = String(e.caption ?? '').replace(/\s+/g, ' ').trim()
      return {
        text,
        likes: num(e.likesCount),
        plays: num(e.videoPlayCount) || num(e.videoViewCount),
        hashtags: tags(text),
        url: String(e.url ?? ''),
        cover: typeof e.displayUrl === 'string' ? e.displayUrl : undefined,
      }
    })
    // ⚖️ A CAPTION IS WHAT THE VOICE IS LEARNED FROM, so a post without one
    // teaches nothing — but the COUNT of what was dropped is kept below, because
    // discarding everything and reading nothing must not look identical.
    .filter((p) => p.text.length > 0)
  const facts: ScrapedProfileFacts = {
    rawCount: records.length,
    // ⚖️ THE HANDLE THE POSTS ACTUALLY CAME FROM. This is what lets
    // `assessScanTarget` catch a profile URL that resolved to someone else —
    // the specific hazard that made refusing Instagram the right call until an
    // Actor could report it.
    resolvedHandle: nonEmpty(first.ownerUsername),
    displayName: nonEmpty(first.ownerFullName),
    // ⚖️ NOT READ, AND SAID SO. The `posts` result type carries no follower or
    // post total; those need a second, separately charged `details` run. `null`
    // is the honest answer and the one `scan_target` renders as "audience not
    // read". Rounding to 0 would make every IG creator look brand new — the
    // three-state defect this file already documents twice.
    audience: null,
    postCount: null,
  }
  return { posts, facts }
}

/** The scan was asked for a platform this worker cannot read. Typed, so the
 *  caller can tell "we do not support this" apart from "we tried and failed" —
 *  those need opposite messages and opposite fixes. */
export class UnsupportedPlatformError extends Error {
  readonly platform: string
  constructor(platform: string) {
    super(`No proven profile source for platform "${platform}"`)
    this.name = 'UnsupportedPlatformError'
    this.platform = platform
  }
}

/** Scrape a creator's own back catalogue for the platform they actually publish on.
 *
 *  ⚠️ PLATFORM WAS IGNORED BEFORE THIS. Every scan went to TikTok regardless of
 *  what the voice said, so a YouTube creator's scan asked tiktok.com for a handle
 *  that does not exist there and read nothing — a second, independent cause of
 *  the same empty result.
 *
 *  ⚠️ AND "KEEP THE EXISTING BEHAVIOUR" WAS NOT INERT. Instagram used to fall
 *  through to the TikTok scraper — so an IG creator's scan asked tiktok.com for
 *  their handle. Best case it read nothing. WORST CASE IT READ SOMEBODY ELSE:
 *  handles are not unique across platforms, so an IG creator whose name belongs
 *  to a different person on TikTok would have had a voice synthesised from a
 *  stranger's videos, with no error raised anywhere. A wrong-person profile is
 *  worse than a missing one, and 14 of 27 production voices are Instagram.
 *
 *  So an unsupported platform now REFUSES. No IG profile Actor has been proven
 *  against a real account from this worker, and guessing one would repeat the
 *  defect this function exists to fix — but silence was never the safe half of
 *  that choice. The refusal is explicit, typed, and reaches the creator as "we
 *  cannot scan Instagram yet" rather than as a scan that quietly returns a
 *  stranger. */
export async function scrapeProfile(
  handle: string, platform: string, limit = 12,
): Promise<{ posts: ScrapedPost[]; facts: ScrapedProfileFacts }> {
  const p = platform.trim().toLowerCase()
  if (p === 'youtube') {
    // yt-dlp is bot-blocked on YouTube from datacenter IPs — the reason the
    // transcript path moved to Apify. There is no free attempt worth making.
    return await youtubeChannelViaApify(handle, limit)
  }
  if (p === 'tiktok') {
    try {
      const free = await scrapeTikTokProfile(handle, limit)
      if (free.posts.length) {
        // ⚠️ POSTS WITHOUT FACTS IS NOT A SUCCESS. Observed on four live TikTok
        // scans: yt-dlp returned real posts but `resolvedHandle` and `audience`
        // both null, so every one stored `followers: 0` and — the part that
        // matters — `assessScanTarget` had NO resolved handle to compare against
        // the requested one. That check is the thing that catches a scan landing
        // on a DIFFERENT account holding the same name, the @CarterPCs trap. It
        // was silently unenforceable for TikTok.
        //
        // ⚖️ ENRICH, DON'T REDO. The free posts are good; only the identity is
        // missing. One Actor result carries `authorMeta`, so this buys the
        // resolved handle and follower count for a single billed item instead of
        // re-scraping the whole profile. A failure here keeps the free posts —
        // an identity we could not read must never cost a scrape that worked.
        if (free.facts.resolvedHandle === null) {
          console.warn(JSON.stringify({ event: 'profile_facts_missing', handle, platform: p }))
          try {
            const enriched = await tiktokProfileViaApify(handle, 1)
            if (enriched.facts.resolvedHandle !== null) {
              return { posts: free.posts, facts: enriched.facts }
            }
          } catch (err) {
            console.warn(JSON.stringify({
              event: 'profile_facts_enrich_failed', handle, platform: p,
              reason: err instanceof Error ? err.message : String(err),
            }))
          }
        }
        return free
      }
      console.warn(JSON.stringify({ event: 'profile_scrape_free_empty', handle, platform: p }))
    } catch (err) {
      console.warn(JSON.stringify({
        event: 'profile_scrape_free_failed', handle, platform: p,
        reason: err instanceof Error ? err.message : String(err),
      }))
    }
    return await tiktokProfileViaApify(handle, limit)
  }
  if (p === 'instagram') {
    // ⚖️ INSTAGRAM JOINS THE LIST BY THE LIST'S OWN RULE — proven, then added.
    // It was refused because it fell through to TikTok and could return a
    // DIFFERENT PERSON holding the same handle. The fix for that is a source
    // that reads Instagram and reports whose posts it returned, not a permanent
    // refusal: 14 of 27 production voices are IG, and every one of them was
    // going to keep reading nothing. Verified against a real public profile
    // (12 posts, 0 failed requests) before being wired, and `resolvedHandle`
    // now carries the owner the posts actually came from so `assessScanTarget`
    // can still catch a mismatch.
    // No free attempt: yt-dlp gets "login required" on Instagram, which is why
    // the TRANSCRIPT path has been on Apify since it was written.
    return await instagramProfileViaApify(handle, limit)
  }
  // ⚖️ A CLOSED LIST, NOT A DEFAULT. Anything that is not a platform we have
  // PROVEN we can read is refused by name. A fallback here is how Instagram
  // ended up asking TikTok for someone else's account, and any platform added
  // later would inherit exactly that.
  throw new UnsupportedPlatformError(p)
}

function buildPosts(entries: Record<string, unknown>[]): ScrapedPost[] {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  // Best-effort cover URL — yt-dlp's flat-playlist TikTok extractor often includes
  // `thumbnails[]`; grab the last (largest) one. Absent on some accounts — that's
  // fine, the DNA synth just falls back to caption-only color inference.
  const cover = (e: Record<string, unknown>): string | undefined => {
    const thumbs = e.thumbnails
    if (Array.isArray(thumbs) && thumbs.length) {
      const last = thumbs[thumbs.length - 1] as Record<string, unknown>
      if (typeof last?.url === 'string') return last.url
    }
    return typeof e.thumbnail === 'string' ? e.thumbnail : undefined
  }
  return entries
    .map((e) => {
      const text = String(e.title || e.description || '').replace(/\s+/g, ' ').trim()
      const hashtags = Array.from(new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.slice(1)))).slice(0, 6)
      return { text, likes: num(e.like_count), plays: num(e.view_count), hashtags, url: String(e.url ?? ''), cover: cover(e) }
    })
    .filter((p) => p.text.length > 0)
}

// --- YouTube: captions via Apify (datacenter IPs are bot-blocked by yt-dlp) ---
const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com']
function isYouTube(u: URL): boolean {
  const h = u.hostname.toLowerCase()
  return YT_HOSTS.some((x) => h === x || h.endsWith('.' + x))
}

// Apify caption Actors return segment-level timing only (no per-word boundaries).
// Synthesize word-level timing by spreading each segment's duration evenly across
// its words, so a YouTube/Instagram transcript carries the same `words[]` shape as
// a Whisper one. This gives the structure analysis word-level pacing to reason
// about (words/min, where a beat lands) instead of coarse 5-10 word chunks, and
// keeps any caption rendering downstream working on reference-sourced clips.
function wordsFromSegments(segments: { start: number; end: number; text: string }[]): Transcript['words'] {
  const words: Transcript['words'] = []
  for (const seg of segments) {
    const toks = seg.text.split(/\s+/).filter(Boolean)
    const span = Math.max(0, seg.end - seg.start)
    const per = toks.length ? span / toks.length : 0
    toks.forEach((w, i) => {
      words.push({
        w,
        start: Number((seg.start + i * per).toFixed(3)),
        end: Number((seg.start + (i + 1) * per).toFixed(3)),
      })
    })
  }
  return words
}

// FREE YouTube transcript via youtube-transcript-api (a Python helper). YouTube
// does not block our datacenter IP (verified), so we try this first and only pay
// for the Apify Actor if it fails. ~1s and $0 vs ~25s and paid. The helper exits
// non-zero on any problem (no captions, transient block) so the caller falls back.
async function youtubeTranscriptFree(rawUrl: string): Promise<Transcript> {
  const { stdout } = await run(
    'python3',
    [join(import.meta.dirname, '..', 'youtube_transcript.py'), rawUrl],
    30_000,
  )
  const t = JSON.parse(stdout) as Transcript
  if (!t.text || !t.text.trim()) throw new Error('empty transcript')
  return t
}

// Run an Apify transcript Actor synchronously and read its captions, mapping
// them into our Transcript shape. Throws a clear, user-facing message on failure
// (no token configured, or no captions on the video) so the UI can show why.
async function youtubeTranscriptViaApify(rawUrl: string): Promise<Transcript> {
  if (!env.apifyToken) {
    throw new Error('YouTube analysis is not configured yet. Try a TikTok or Instagram link, or contact support.')
  }
  // run-sync-get-dataset-items returns the dataset directly as [{ data: [...] }].
  // (The older /run-sync + key-value-store path returned an empty body here and
  // broke JSON parsing — "Unexpected end of JSON input".)
  const url = `https://api.apify.com/v2/acts/${env.apifyYoutubeActor}/run-sync-get-dataset-items?token=${env.apifyToken}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl: rawUrl, targetLanguage: 'en' }),
    // Bound the synchronous Apify run so a stuck connection can't hold the worker
    // indefinitely (Apify's own sync cap is ~5 min; 330s lets its error surface first).
    signal: AbortSignal.timeout(330_000),
  })
  if (!res.ok) {
    throw new Error(`YouTube transcript service error ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const items = (await res.json()) as { data?: { start?: string | number; dur?: string | number; text?: string }[] }[]
  const rows = (Array.isArray(items) ? items[0]?.data : null) ?? []
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('This video has no captions we can read. Try a different reference.')
  }

  const segments = rows
    .map((r) => {
      const start = Number(r.start) || 0
      const dur = Number(r.dur) || 0
      return { start, end: Number((start + dur).toFixed(3)), text: String(r.text ?? '').trim() }
    })
    .filter((s) => s.text)
  if (segments.length === 0) throw new Error('This video has no captions we can read. Try a different reference.')

  const text = segments.map((s) => s.text).join(' ')
  const duration_sec = Math.ceil(segments[segments.length - 1].end)
  return { language: 'en', duration_sec, text, words: wordsFromSegments(segments), segments }
}

// --- Instagram: transcript via Apify (yt-dlp gets "login required"/rate-limited) ---
const IG_HOSTS = ['instagram.com', 'www.instagram.com']
function isInstagram(u: URL): boolean {
  const h = u.hostname.toLowerCase()
  return IG_HOSTS.some((x) => h === x || h.endsWith('.' + x))
}

// Direct media edges (Instagram/FB CDN): the scrape already handed us a ready mp4
// URL, so we pull the audio straight off it locally instead of a paid transcript
// Actor. This is what makes the brand-voice audio upgrade actually run (the URLs
// the DNA scrape passes live on these hosts, which the old allowlist rejected).
const DIRECT_MEDIA_HOSTS = ['cdninstagram.com', 'fbcdn.net']
function isDirectMedia(u: URL): boolean {
  const h = u.hostname.toLowerCase()
  return DIRECT_MEDIA_HOSTS.some((x) => h === x || h.endsWith('.' + x))
}

// Pull audio straight from a direct media URL (a scraped Instagram/FB CDN mp4) with
// ffmpeg and transcribe locally with faster-whisper — free, no transcript Actor.
// ffmpeg streams just the audio (`-vn`) into whisper's native 16 kHz mono, capped
// at maxMediaSecs, and the temp audio is always discarded (analyze-and-discard).
async function transcribeDirectMedia(rawUrl: string): Promise<Transcript> {
  const dir = await mkdtemp(join(tmpdir(), 'twinai-'))
  const audioPath = join(dir, 'audio.wav')
  const outPath = join(dir, 'transcript.json')
  try {
    await run(
      'ffmpeg',
      ['-y', '-i', rawUrl, '-vn', '-ac', '1', '-ar', '16000', '-t', String(env.maxMediaSecs), audioPath],
      120_000,
    )
    await run(
      'python3',
      [join(import.meta.dirname, '..', 'whisper_transcribe.py'),
       '--audio', audioPath, '--out', outPath,
       '--model', env.whisperModel, '--device', env.whisperDevice,
       '--language', 'auto', '--beam-size', '1', '--max-seconds', String(env.maxMediaSecs)],
      Math.max(180_000, env.maxMediaSecs * 1000),
    )
    return JSON.parse(await readFile(outPath, 'utf8')) as Transcript
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// Run an Apify Instagram transcript Actor and map its dataset output into our
// Transcript shape. The Actor returns one dataset item shaped as:
//   { text, duration, errMsg, segments: [{ start, end, text }] }
// Throws a clear, user-facing message when the token is missing, the reel is
// unavailable (empty result), or the clip has no readable speech.
async function instagramTranscriptViaApify(rawUrl: string): Promise<Transcript> {
  if (!env.apifyToken) {
    throw new Error('Instagram analysis is not configured yet. Try a TikTok link, or contact support.')
  }
  const url = `https://api.apify.com/v2/acts/${env.apifyInstagramActor}/run-sync-get-dataset-items?token=${env.apifyToken}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl: rawUrl }),
    // Bound the synchronous Apify run (see YouTube path above).
    signal: AbortSignal.timeout(330_000),
  })
  if (!res.ok) {
    throw new Error(`Instagram transcript service error ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const items = (await res.json()) as {
    text?: string
    duration?: number
    errMsg?: string
    segments?: { start?: number; end?: number; text?: string }[]
  }[]
  const item = Array.isArray(items) ? items[0] : null
  // The Actor returns an empty dataset for private/removed/region-locked reels.
  if (!item) throw new Error("Couldn't read that Instagram video — it may be private or removed. Try another.")
  if (item.errMsg) throw new Error(`This Instagram video could not be read: ${String(item.errMsg).slice(0, 150)}`)

  const segments = (Array.isArray(item.segments) ? item.segments : [])
    .map((s) => {
      const start = Number(s.start) || 0
      const end = Number(s.end) || start
      return { start, end: Number(end.toFixed(3)), text: String(s.text ?? '').trim() }
    })
    .filter((s) => s.text)

  const text =
    typeof item.text === 'string' && item.text.trim()
      ? item.text.trim()
      : segments.map((s) => s.text).join(' ')
  if (!text) throw new Error('This Instagram video has no speech we can read. Try a different reference.')

  const duration_sec = Number(item.duration) || (segments.length ? Math.ceil(segments[segments.length - 1].end) : 0)
  return { language: 'en', duration_sec, text, words: wordsFromSegments(segments), segments }
}

// Download audio from an allow-listed URL, transcribe with faster-whisper, and
// ALWAYS discard the raw media afterwards (analyze-and-discard / privacy).
// YouTube + Instagram are the exceptions: we fetch transcripts via Apify (see
// above) because both bot-block yt-dlp from datacenter IPs.
export async function transcribeFromUrl(rawUrl: string): Promise<Transcript> {
  const u = assertAllowedUrl(rawUrl)
  if (isYouTube(u)) {
    // Free first (YouTube doesn't block us), Apify only as a paid fallback.
    try {
      return { ...(await youtubeTranscriptFree(rawUrl)), source: 'youtube_captions_free' }
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e)
      // ⚠️ THE HELPER ALREADY DISTINGUISHES THESE AND NOBODY READ IT.
      // `youtube_transcript.py` exits 2 with NO_CAPTIONS on its stderr when the
      // video genuinely has none, and 1 on anything else. Pooling them would
      // report our own timeouts as evidence about YouTube.
      const paidBecause: PaidBecause = /NO_CAPTIONS/.test(why) ? 'no_captions' : 'free_path_failed'
      console.error(`free YT transcript failed (${paidBecause}), falling back to Apify:`, why)
      return { ...(await youtubeTranscriptViaApify(rawUrl)), source: 'youtube_captions_paid', paidBecause }
    }
  }
  if (isInstagram(u)) return { ...(await instagramTranscriptViaApify(rawUrl)), source: 'instagram_paid' }
  // scraped IG/FB CDN mp4 → free local whisper
  if (isDirectMedia(u)) return { ...(await transcribeDirectMedia(rawUrl)), source: 'local_whisper' }
  const dir = await mkdtemp(join(tmpdir(), 'twinai-'))
  const audioPath = join(dir, 'audio.m4a')
  const outPath = join(dir, 'transcript.json')
  try {
    // 1. Download audio only (no video) — cheaper + faster than full media.
    //
    // ⚠️ `--impersonate` IS THE POINT OF THIS LINE. Without it yt-dlp sends its
    // own TLS fingerprint, TikTok answers with something the extractor cannot
    // parse, and the error reads "Unexpected response from webpage request" —
    // which sounds like TikTok changed their page and is actually us being
    // identified. The image has carried 37 usable targets since 33a7b7b and
    // asked for none of them.
    //
    // ⚖️ AND IT IS RUNG ONE OF A NAMED LADDER, NOT A RETRY. If this fails the
    // next rung is the residential proxy and the one after is an Actor, each
    // costing more than the last — so which rung succeeded is recorded on the
    // row rather than collapsed into "it worked".
    await run(
      'yt-dlp',
      ['-f', 'bestaudio/best', '-x', '--audio-format', 'm4a', '--no-playlist',
       '--impersonate', IMPERSONATE_TARGET,
       '--max-filesize', '200M', '-o', audioPath, rawUrl],
      120_000,
    )
    // 2. Transcribe via the Python faster-whisper wrapper (prints JSON).
    await run(
      'python3',
      [join(import.meta.dirname, '..', 'whisper_transcribe.py'),
       '--audio', audioPath, '--out', outPath,
       '--model', env.whisperModel, '--device', env.whisperDevice,
       // Reference clips can be in any language, so detect here (unlike the
       // creator's own take, which we pin to avoid English->Arabic misdetection).
       '--language', 'auto', '--beam-size', '1',
       '--max-seconds', String(env.maxMediaSecs)],
      Math.max(180_000, env.maxMediaSecs * 1000),
    )
    // ⚠️ THE TIKTOK ROUTE. yt-dlp + local whisper, free per video and bounded
    // only by this box's CPU — the one platform whose budget is already raised.
    return {
      ...(JSON.parse(await readFile(outPath, 'utf8')) as Transcript),
      source: 'local_whisper',
      downloadRoute: 'local_impersonated',
    }
  } finally {
    // Discard raw media + working files no matter what.
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
