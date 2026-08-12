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

  it('tries free before paid on TikTok, and treats EMPTY as failure', () => {
    // ⚖️ An empty parse is the exact shape of the silent no-op: yt-dlp exits 0,
    // returns a profile with no entries, and every check downstream passes on
    // nothing. Falling back only on a thrown error would have kept the bug.
    const block = MEDIA.slice(MEDIA.indexOf("if (p === 'tiktok')"))
    expect(block).toMatch(/const free = await scrapeTikTokProfile\(handle, limit\)/)
    expect(block).toMatch(/if \(free\.posts\.length\) return free/)
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

describe('Instagram is left alone rather than guessed at', () => {
  it('does not route Instagram to an unproven Actor', () => {
    // ⚖️ No IG profile Actor has been run against a real account from this
    // worker. Wiring one on the strength of its listing would repeat the defect
    // this file exists to close: a path nobody watched return nothing.
    const block = MEDIA.slice(MEDIA.indexOf('export async function scrapeProfile'))
    expect(block).not.toMatch(/'instagram'/)
  })
})
