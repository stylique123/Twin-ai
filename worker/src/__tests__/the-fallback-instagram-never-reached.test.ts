// INSTAGRAM HAD A FALLBACK THE WHOLE TIME AND NEVER ONCE REACHED IT.
//
// ⚠️⚠️ THE REPORT THAT STARTED THIS, VERBATIM FROM THE PRODUCT:
//
//   "Twin cannot read Instagram videos yet — that is a limit on our side, not
//    your link. A TikTok or YouTube link will work."
//
// The message is true about the outcome and wrong about the cause, and the
// cause is two lines of our own code.
//
// ── THE CHAIN, MEASURED ───────────────────────────────────────────────────
//
//   the Apify Actor answers ....... errMsg: "no audio url found"
//   for how many videos ........... 60 of 60 — 0 ok, 0 transcripts (2026-09-12)
//   classifyTranscriptFailure ..... 'no_speech'          ← the defect
//   transcribeFromUrl ............. rethrows on no_speech, skipping the rung
//   yt-dlp + local whisper ........ NEVER RAN, on any Instagram reel, ever
//
// ⚖️ THE EVIDENCE WAS ALREADY IN THE REPOSITORY, IN ANOTHER FILE.
// `classifyReferenceFailure` calls that identical string `actor_contract` and
// states the reasoning in its own comment: "A 100% rate with a single message
// is a CONTRACT signature, not a property of sixty different videos." Two
// classifiers disagreed about one string; the one that only REPORTS had it
// right, and the one that GATES THE FALLBACK had it backwards. Nothing failed
// loudly, because a wrong answer and a settled answer look identical from
// outside.
//
// ⚠️ AND IT SURVIVED BECAUSE THE RULE WAS WRITTEN TWICE. Both platform paths
// carried their own copy of `kind === 'unavailable' || kind === 'no_speech'`,
// so there was no single place naming the rule to disagree with. It is one
// exported set now, and these tests are about that set.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  classifyTranscriptFailure, settledAtVendor, SETTLED_AT_VENDOR, retryWorthScanFailure,
} from '../transcriptFailure.js'

/** The exact string production returned, 60 times out of 60. */
const PRODUCTION = new Error('This Instagram video could not be read: no audio url found')

describe('the string that closed Instagram', () => {
  it('is a contract failure, not a silent reel', () => {
    expect(classifyTranscriptFailure(PRODUCTION)).toBe('actor_contract')
  })

  it('does not settle the question, so the local rung runs', () => {
    // ⚠️ THIS IS THE WHOLE FIX IN ONE ASSERTION. Everything else here is
    // guarding the reasoning around it.
    expect(settledAtVendor(PRODUCTION)).toBe(false)
    expect(SETTLED_AT_VENDOR.has('actor_contract')).toBe(false)
  })

  it('still lets a genuinely silent reel end at the vendor', () => {
    // ⚖️ THE FIX MUST NOT BUY INSTAGRAM BACK BY SPENDING A DOWNLOAD ON EVERY
    // SILENT VIDEO. A reel that was read and said nothing is answered.
    const silent = new Error('This Instagram video has no speech we can read. Try a different reference.')
    expect(classifyTranscriptFailure(silent)).toBe('no_speech')
    expect(settledAtVendor(silent)).toBe(true)
  })

  it('still lets a private or removed reel end at the vendor', () => {
    const gone = new Error("Couldn't read that Instagram video — it may be private or removed. Try another.")
    expect(settledAtVendor(gone)).toBe(true)
  })

  it('is not worth another attempt at the same Actor', () => {
    // ⚖️ THE ACTOR ANSWERED. It answered in a shape we no longer read, and it
    // will answer that way again. The next RUNG is the fix, not the next TRY.
    expect(retryWorthScanFailure(PRODUCTION)).toBe(false)
  })
})

const MEDIA = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'media.ts'), 'utf8')
/** Whole-line comments only — dropping everything after `//` would delete real
 *  code sitting after a string that contains a url. */
const CODE = MEDIA.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('and the rule is stated once, where it can be argued with', () => {
  it('both platform paths ask the shared predicate', () => {
    expect(CODE.match(/settledAtVendor\(apifyErr\)/g)).toHaveLength(2)
  })

  it('neither path carries its own copy of the old condition', () => {
    // ⚠️ THE DUPLICATION IS THE REASON ONE WRONG CLASSIFICATION DISABLED TWO
    // PLATFORMS AT ONCE. A re-inlined copy would restore that.
    expect(CODE).not.toMatch(/kind === 'unavailable' \|\| kind === 'no_speech'/)
  })

  it('Instagram reaches the last rung rather than ending at the vendor', () => {
    const block = CODE.slice(CODE.indexOf('if (isInstagram(u))'))
    const gate = block.indexOf('settledAtVendor(apifyErr)')
    const rung = block.indexOf('lastRungAfterVendor(')
    expect(gate).toBeGreaterThan(-1)
    expect(rung).toBeGreaterThan(gate)
  })
})
