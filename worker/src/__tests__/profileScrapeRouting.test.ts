// THE SCAN MUST ACTUALLY READ THE ACCOUNT, ON THE PLATFORM IT IS ON.
//
// ⚠️ THE DEFECT, EXACTLY. `scrape_dna` called `scrapeTikTokProfile(handle)` for
// EVERY voice and that function reaches tiktok.com with yt-dlp. Two independent
// failures fell out of one line:
//
//   1. A YouTube creator's scan asked tiktok.com for a handle that does not
//      exist there.
//   2. TikTok now bot-blocks the datacenter IP, so even a real TikTok handle
//      read nothing — the same block that already moved YouTube and Instagram
//      TRANSCRIPTS to Apify, arriving late for the PROFILE scrape.
//
// A live job against a real user finished in 10 seconds, read zero posts, wrote
// zero `creator_knowledge`, left the voice `ready` and recorded status `done`.
// Nothing in the system said the scan had read nothing — which is why the
// caption-knowledge extraction wired in #330 could never fire.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SCAN = readFileSync(join(REPO, 'worker/src/jobs/scrapeDna.ts'), 'utf8')
const MEDIA = readFileSync(join(REPO, 'worker/src/media.ts'), 'utf8')
const ENV = readFileSync(join(REPO, 'worker/src/env.ts'), 'utf8')

describe('the scan reads the platform the creator actually publishes on', () => {
  it('passes the platform through instead of assuming TikTok', () => {
    expect(SCAN).toMatch(/scrapeProfile\(handle, platform\)/)
    // Matches a CALL, not the prose above it — the comment explaining the old
    // line necessarily quotes the old line.
    expect(SCAN).not.toMatch(/await scrapeTikTokProfile\(handle\)/)
  })

  it('routes YouTube to the channel Actor, with no pointless free attempt', () => {
    // yt-dlp is bot-blocked on YouTube from datacenter IPs — that is why the
    // transcript path already lives on Apify. Trying it first would only add
    // latency to a call that cannot succeed.
    const block = MEDIA.slice(MEDIA.indexOf('export async function scrapeProfile'))
    expect(block).toMatch(/if \(p === 'youtube'\)[\s\S]*?youtubeChannelViaApify/)
  })

  it('enriches the identity when the free path returns posts but no facts', () => {
    // ⚠️ OBSERVED ON FOUR LIVE SCANS. yt-dlp returned real TikTok posts with
    // `resolvedHandle` and `audience` both null, so each voice stored
    // `followers: 0` and `assessScanTarget` had nothing to compare the requested
    // handle against — the wrong-account check the @CarterPCs trap exists for
    // was unenforceable, and nothing said so.
    const block = MEDIA.slice(MEDIA.indexOf("if (p === 'tiktok')"))
    const upToFallback = block.slice(0, block.indexOf('profile_scrape_free_empty'))
    expect(upToFallback).toMatch(/if \(free\.facts\.resolvedHandle === null\)/)
    // One billed item, not a re-scrape: the posts are already good.
    expect(upToFallback).toMatch(/tiktokProfileViaApify\(handle, 1\)/)
    // A failed enrichment must never cost a scrape that worked.
    expect(upToFallback).toMatch(/profile_facts_enrich_failed/)
    expect(upToFallback).toMatch(/return free/)
  })

  it('tries free before paid on TikTok, and treats EMPTY as failure', () => {
    // ⚖️ An empty parse is the exact shape of the silent no-op: yt-dlp exits 0,
    // returns a profile with no entries, and every check downstream passes on
    // nothing. Falling back only on a thrown error would have kept the bug.
    const block = MEDIA.slice(MEDIA.indexOf("if (p === 'tiktok')"))
    expect(block).toMatch(/const free = await scrapeTikTokProfile\(handle, limit\)/)
    // The free result is preferred whenever it carried posts. It is a block
    // rather than a one-liner now because a post-bearing result with no identity
    // gets enriched first — see the test above.
    expect(block).toMatch(/if \(free\.posts\.length\) \{/)
    expect(block).toMatch(/profile_scrape_free_empty/)
    expect(block).toMatch(/return await tiktokProfileViaApify\(handle, limit\)/)
  })
})

describe('the Actor inputs carry the two settings that silently return nothing', () => {
  it('keeps maxResultsShorts equal to maxResults', () => {
    // Setting it to 0 returns NOTHING for a shorts-first channel, which reads
    // exactly like a wrong handle. This cost a full debugging cycle once.
    const block = MEDIA.slice(MEDIA.indexOf('async function youtubeChannelViaApify'))
    expect(block.slice(0, block.indexOf('const first'))).toMatch(/maxResultsShorts: limit/)
  })

  it('sends the lowercase TikTok sort enum', () => {
    // 'Latest' is rejected by the Actor; 'latest' is accepted.
    const block = MEDIA.slice(MEDIA.indexOf('async function tiktokProfileViaApify'))
    expect(block.slice(0, block.indexOf('const author'))).toMatch(/profileSorting: 'latest'/)
  })

  it('names both Actors in env, so a deploy can override them', () => {
    expect(ENV).toMatch(/apifyTiktokProfileActor:.*APIFY_TIKTOK_PROFILE_ACTOR/)
    expect(ENV).toMatch(/apifyYoutubeChannelActor:.*APIFY_YOUTUBE_CHANNEL_ACTOR/)
  })
})

describe('Instagram, the platform that was still reading nothing', () => {
  it('routes Instagram to its own Actor rather than to TikTok', () => {
    // ⚠️ After TikTok and YouTube landed, EVERY voice still missing knowledge
    // was an IG one — 14 of them — because IG fell through to the TikTok path
    // and asked tiktok.com for an Instagram handle.
    const block = MEDIA.slice(MEDIA.indexOf('export async function scrapeProfile'))
    expect(block).toMatch(/if \(p === 'instagram'\)[\s\S]*?instagramProfileViaApify/)
  })

  it('reports an unread audience as null, never 0', () => {
    // The `posts` result type carries captions but no follower count; that is a
    // separately charged run. 0 would make every IG creator look brand new.
    const block = MEDIA.slice(MEDIA.indexOf('async function instagramProfileViaApify'))
    expect(block.slice(0, block.indexOf('return { posts, facts }'))).toMatch(/audience: null/)
  })
})
