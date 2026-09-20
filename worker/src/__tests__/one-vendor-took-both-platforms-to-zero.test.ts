// ONE VENDOR STOPPED ANSWERING AND TWO PLATFORMS WENT TO ZERO, BECAUSE NEITHER
// HAD ANYWHERE ELSE TO GO.
//
// ⚠️ MEASURED 2026-09-20: a youtube recovery returned 0 of 15 and an instagram
// one 0 of 5, while tiktok recovered 4–5 per voice in the same hour. The
// asymmetry is structural, not coincidental — YouTube and Instagram both
// TERMINATE at an Apify Actor, and tiktok downloads and transcribes on this
// box. A vendor failure is therefore total for two platforms and invisible to
// the third.
//
// ⚠️ AND THE ROW SAID ONLY `{failed: 5}`. The reason went to `console.error`
// and the count went to the durable result, so "out of credits", "actor
// deleted", "reel is private" and "our own timeout" were one integer — four
// causes needing four different responses, recorded identically.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { classifyTranscriptFailure } from '../transcriptFailure.js'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const MEDIA = readFileSync(join(SRC, 'media.ts'), 'utf8')
const VOICE = readFileSync(join(SRC, 'jobs', 'voice.ts'), 'utf8')

describe('the failure class survives the log', () => {
  it('separates the causes that need opposite responses', () => {
    // Ours and total — every video fails until a human acts.
    expect(classifyTranscriptFailure(new Error('apify act returned 402 payment required'))).toBe('billing')
    expect(classifyTranscriptFailure(new Error('Instagram transcript service error 404: no such act')))
      .toBe('actor_missing')
    // Worth another go.
    expect(classifyTranscriptFailure(new Error('service error 503'))).toBe('transient')
    expect(classifyTranscriptFailure(new Error('The operation timed out'))).toBe('transient')
    expect(classifyTranscriptFailure(new Error('429 too many requests'))).toBe('rate_limited')
    // A settled fact about ONE post — never ours, never worth a retry.
    expect(classifyTranscriptFailure(new Error("Couldn't read that Instagram video — it may be private")))
      .toBe('unavailable')
    expect(classifyTranscriptFailure(new Error('This video has no speech we can read'))).toBe('no_speech')
    expect(classifyTranscriptFailure(new Error('APIFY_TOKEN is not set'))).toBe('not_configured')
  })

  it('names the bot check, which was `unknown` on its first real occurrence', () => {
    // ⚠️ MEASURED 2026-09-20 on all ten woodsyleather urls, and it landed in
    // `failed_unknown` — the one class that tells you nothing. This is not a
    // fact about the video and not a blip; it is YouTube refusing this IP.
    expect(classifyTranscriptFailure(new Error(
      "ERROR: [youtube] SMgirNSwIYk: Sign in to confirm you\u2019re not a bot. "
      + 'Use --cookies-from-browser or --cookies for the authentication.',
    ))).toBe('bot_check')
  })

  it('records the class on the durable row, not only in a log', () => {
    expect(VOICE).toMatch(/bump\(`failed_\$\{kind\}`\)/)
  })

  it('carries ONE sample message, so a long run cannot become a log file', () => {
    expect(VOICE).toMatch(/if \(!firstFailureDetail\)/)
    expect(VOICE).toMatch(/failure_sample/)
  })

  it('reports the reason on the all-failed row too — the case that needed it most', () => {
    const allFailed = VOICE.slice(VOICE.indexOf("no usable spoken transcripts") - 300)
    expect(allFailed.slice(0, 600)).toMatch(/failure_sample/)
  })
})

describe('neither platform ends at a single vendor any more', () => {
  it('youtube falls back past Apify to the local download path', () => {
    expect(MEDIA).toMatch(/youtube_apify_failed_falling_back_local/)
  })

  it('instagram does too — it previously had NO fallback at all', () => {
    expect(MEDIA).toMatch(/instagram_apify_failed_falling_back_local/)
  })

  it('but never spends a download on a question already settled', () => {
    // A private reel and a silent video are facts about the post. Retrying
    // them locally burns a download to re-learn the same answer.
    const guards = MEDIA.match(/if \(kind === 'unavailable' \|\| kind === 'no_speech'\) throw apifyErr/g) ?? []
    expect(guards.length).toBe(2)
  })

  it('retries only the two classes whose answer can change', () => {
    expect(MEDIA).toMatch(/const RETRYABLE: ReadonlySet<TranscriptFailure> = new Set\(\['transient', 'rate_limited'\]\)/)
  })

  it('the local rung is the SAME path tiktok already proves works', () => {
    expect(MEDIA).toMatch(/async function transcribeViaDownload/)
    expect(MEDIA).toMatch(/return await transcribeViaDownload\(rawUrl, viaProxy\)/)
  })

  it('does NOT erase why the vendor failed — the first version of this did', () => {
    // The local error used to propagate alone, so the durable row recorded a
    // yt-dlp message and nothing about Apify: the same "reason went to a log
    // that expires" defect, one layer up. Both classes now ride one message.
    expect(MEDIA).toMatch(/vendor\(\$\{vendorKind\}\).*local\(\$\{localKind\}\)/)
  })

  it('asks for a residential egress first, because the datacenter IP is what is blocked', () => {
    // local_impersonated goes out from this box — the very thing both platforms
    // block, and the entire reason their vendor routes exist.
    expect(MEDIA).toMatch(/env\.apifyProxyPassword/)
    expect(MEDIA).toMatch(/kind: 'residential_proxy'/)
  })
})

// ── THE SCAN PATH HAD THE SAME HOLE ─────────────────────────────────────────
//
// ⚠️ MEASURED 2026-09-20: a youtube scan — a path that goes STRAIGHT to an
// Apify Actor with NO free attempt — failed in TWO SECONDS. That is an
// immediate HTTP rejection, not a run that executed, and the status code that
// would have named it went to `console.error`. The row kept only the sentence
// shown to the creator, which is deliberately vague because it is written for
// a person: "We couldn't read @handle just now."
//
// ⚖️ THE CREATOR STILL READS THE KIND SENTENCE. The class and one sample are
// added BESIDE it, not in place of it — an operator needs "billing" and a
// creator needs "try again shortly", and those are different audiences for the
// same event.
const SCRAPE = readFileSync(join(SRC, 'jobs', 'scrapeDna.ts'), 'utf8')

describe('a failed scan records why, not only what we told the creator', () => {
  it('classifies the cause onto the durable result', () => {
    expect(SCRAPE).toMatch(/failure_class: classifyTranscriptFailure\(cause\)/)
  })

  it('keeps the creator-facing sentence unchanged beside it', () => {
    expect(SCRAPE).toMatch(/reason: msg, kept_existing: true, \.\.\.diag/)
    expect(SCRAPE).toMatch(/reason: msg, \.\.\.diag/)
  })

  it('carries a bounded sample, never the whole error', () => {
    expect(SCRAPE).toMatch(/\.slice\(0, 200\)/)
  })

  it('stays silent when there is no cause to report', () => {
    // `fail` is also called for reasons that are not exceptions; those must not
    // invent a class. An absent cause means an absent diagnosis.
    expect(SCRAPE).toMatch(/cause === undefined \? \{\} :/)
  })

  it('passes the real error at every catch site, not a re-thrown string', () => {
    const sites = SCRAPE.match(/^\s+err,$/gm) ?? []
    expect(sites.length).toBeGreaterThanOrEqual(3)
  })
})
