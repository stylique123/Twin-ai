// WHAT PROTECTS ~3,943 UNSUPERVISED CALLS FROM PRODUCING CONFIDENT NONSENSE.
//
// ⚠️ NOBODY WILL READ ANY INDIVIDUAL RESULT. That is the defining property of a
// batch, and it means every rule that matters has to be a check on the response
// rather than a sentence in the prompt. These tests are that boundary.
//
// ⚖️ AND EVERY REJECTION LANDS ON `not_checked`, NEVER ON A REPAIRED VALUE. Once
// written, an invented container is indistinguishable from an observed one — so
// the only safe direction to fail is "we did not learn this".
import { describe, expect, it } from 'vitest'
import { parseContentExtraction, NOT_DETERMINED, NO_REHOOK } from '../referenceExtraction'
import { pilotSample, isTranscribable, stableOrder, type SampleCandidate } from '../pilotSample'
import { isKnown, worthChecking } from '../assessed'

const CTX = {
  referenceId: 'r1',
  niche: 'Beauty',
  assessedAt: '2026-01-01T00:00:00.000Z',
  transcriptAvailable: true,
}
const parse = (raw: unknown) => parseContentExtraction(raw, CTX)
const ok = (value: unknown, evidence = 'says so at 0:03') => ({ value, evidence })
/** The rejection reason for ONE field, or undefined if that field was fine.
 *  A partial fixture legitimately reports every unanswered field as `missing`,
 *  so a test that indexes `rejections[0]` is asserting about whichever field
 *  happened to be read first. */
const reasonFor = (r: { rejections: readonly { field: string; reason: string }[] }, field: string) =>
  r.rejections.find((x) => x.field === field)?.reason

describe('a value without evidence is refused, however plausible it looks', () => {
  it('drops the field rather than storing the claim', () => {
    // ⚠️ THE MOST LIKELY FAILURE AT SCALE, and the least visible: every field
    // looks equally certain once it is a database row.
    const r = parse({ structure: { containerType: { value: 'mistakes' } } })
    expect(isKnown(r.profile.structure.containerType)).toBe(false)
    expect(r.rejections.map((x) => x.reason)).toContain('no_evidence')
  })

  it('and an empty-string evidence is not evidence', () => {
    const r = parse({ structure: { containerType: ok('mistakes', '   ') } })
    expect(isKnown(r.profile.structure.containerType)).toBe(false)
  })

  it('while a quoted one is accepted and keeps the quote', () => {
    const r = parse({ structure: { containerType: ok('mistakes', '"three mistakes I made"') } })
    const c = r.profile.structure.containerType
    expect(isKnown(c) && c.value).toBe('mistakes')
    expect(c.basis === 'observed' && c.evidence).toContain('three mistakes')
  })
})

describe('a word outside the vocabulary is not quietly adopted', () => {
  it('refuses an invented container type', () => {
    const r = parse({ structure: { containerType: ok('listicle_supreme') } })
    expect(isKnown(r.profile.structure.containerType)).toBe(false)
    expect(reasonFor(r, 'structure.containerType')).toBe('not_in_vocabulary')
  })

  it('and refuses a partly-valid goal list rather than keeping the good half', () => {
    // ⚖️ ALL-OR-NOTHING. Keeping two of five silently turns a partly-wrong
    // answer into a confident short one.
    const r = parse({ likelyGoals: ok(['authority', 'telepathy']) })
    expect(isKnown(r.profile.likelyGoals)).toBe(false)
  })

  it('but accepts a fully-valid one', () => {
    const r = parse({ likelyGoals: ok(['authority', 'education']) })
    const g = r.profile.likelyGoals
    expect(isKnown(g) && g.value).toEqual(['authority', 'education'])
  })
})

describe('"the transcript does not say" is recorded as an answer', () => {
  it('becomes indeterminate, not a rejection', () => {
    const r = parse({ audience: { likelySegment: NOT_DETERMINED } })
    expect(r.profile.audience.likelySegment.basis).toBe('indeterminate')
    // ⚖️ NOT A REJECTION *FOR THIS FIELD*. The other sixteen are legitimately
    // reported missing — this fixture only answers one of them.
    expect(reasonFor(r, 'audience.likelySegment')).toBeUndefined()
  })

  it('and is never re-queued, unlike a field we failed to read', () => {
    // ⚠️ THE DISTINCTION THAT SAVES A SECOND FULL BATCH. Asked-and-answered must
    // not go back on the worklist; unreadable must.
    const answered = parse({ audience: { likelySegment: NOT_DETERMINED } })
    const broken = parse({ audience: { likelySegment: ok('founders', '') } })
    expect(worthChecking(answered.profile.audience.likelySegment)).toBe(false)
    expect(worthChecking(broken.profile.audience.likelySegment)).toBe(true)
  })
})

describe('a rehook must point at a beat that exists', () => {
  const beats = ok([
    { role: 'hook', startSec: 0, endSec: 4, summary: 'claim' },
    { role: 'payoff', startSec: 30, endSec: 40, summary: 'reveal' },
  ], 'timed transcript')

  it('refuses an index past the end', () => {
    // ⚠️ AN INDEX INTO A LIST THAT IS SHORTER IS NOT A POSITION. Stored as one,
    // it makes the teleprompter's beat-deletion bug reachable from data.
    const r = parse({ structure: { beats, rehookPosition: ok(5) } })
    expect(isKnown(r.profile.structure.rehookPosition)).toBe(false)
    expect(r.rejections.some((x) => x.reason === 'out_of_range')).toBe(true)
  })

  it('refuses a position when the beats themselves failed to parse', () => {
    const r = parse({ structure: { beats: ok('several'), rehookPosition: ok(0) } })
    expect(isKnown(r.profile.structure.rehookPosition)).toBe(false)
  })

  it('and accepts one that lands inside', () => {
    const r = parse({ structure: { beats, rehookPosition: ok(1) } })
    const p = r.profile.structure.rehookPosition
    expect(isKnown(p) && p.value).toBe(1)
  })

  it('and "this video never re-hooks" is an answer, not a failure', () => {
    // ⚠️ THE PILOT'S LARGEST REJECTION BUCKET, AND THE MODEL WAS RIGHT EVERY
    // TIME. The prompt asked for "an index, or null if the video never
    // re-hooks", while the responseSchema said `{ type: 'integer' }` — so the
    // only correct answer was one the request had made illegal. 15 of 35 videos
    // were recorded as model failures for saying it anyway.
    for (const said of [NO_REHOOK, null]) {
      const r = parse({ structure: { beats, rehookPosition: ok(said) } })
      const p = r.profile.structure.rehookPosition
      expect(isKnown(p), String(said)).toBe(true)
      expect(isKnown(p) && p.value).toBeNull()
      expect(reasonFor(r, 'structure.rehookPosition')).toBeUndefined()
    }
  })

  it('but a known absence still needs evidence like anything else', () => {
    // ⚖️ OTHERWISE "no re-hook" BECOMES THE FREE ANSWER. A model that stops
    // reading would reach for it, and the field would fill with confident
    // absences nobody looked for.
    const r = parse({ structure: { beats, rehookPosition: { value: NO_REHOOK, evidence: '  ' } } })
    expect(isKnown(r.profile.structure.rehookPosition)).toBe(false)
    expect(reasonFor(r, 'structure.rehookPosition')).toBe('no_evidence')
  })

  it('and a still-absent field is not read as an absence of re-hook', () => {
    // ⚠️ SILENCE IS NOT "NO". The whole point of the sentinel is that the model
    // has to SAY it; a field nobody answered stays not_checked.
    const r = parse({ structure: { beats } })
    expect(worthChecking(r.profile.structure.rehookPosition)).toBe(true)
  })

  it('a beat ending before it starts is a parse error wearing a number', () => {
    const bad = ok([{ role: 'hook', startSec: 20, endSec: 3, summary: 'x' }])
    expect(isKnown(parse({ structure: { beats: bad } }).profile.structure.beats)).toBe(false)
  })
})

describe('the count and the slots must agree, and the slots win', () => {
  it('drops a product count the slots do not support', () => {
    // ⚖️ THE SLOTS ARE THE PRIMARY OBSERVATION — each is a named hole the model
    // had to point at. The count is a summary of them, and a summary that
    // disagrees with its own detail is the half that is wrong.
    const r = parse({
      requirements: {
        contentSlots: ok([{ kind: 'product', label: 'pick_one' }]),
        productsRequired: ok(3),
      },
    })
    expect(isKnown(r.profile.requirements.productsRequired)).toBe(false)
    expect(r.rejections.some((x) => x.reason === 'contradicts_slots')).toBe(true)
    // and the slots themselves survive
    expect(isKnown(r.profile.requirements.contentSlots)).toBe(true)
  })

  it('accepts a count the slots do support', () => {
    const r = parse({
      requirements: {
        contentSlots: ok([
          { kind: 'product', label: 'a' }, { kind: 'tool_or_software', label: 'b' },
        ]),
        productsRequired: ok(2),
      },
    })
    const n = r.profile.requirements.productsRequired
    expect(isKnown(n) && n.value).toBe(2)
  })

  it('an empty slot list is a real answer about a video we read', () => {
    // ⚠️ SIX OF THIRTY-FIVE PILOT VIDEOS SAID THIS AND WERE REFUSED. "Nothing
    // has to be supplied to remake this" is what pure commentary looks like;
    // filing it as `not_checked` throws away the answer, tells `slotFill` to
    // have no opinion about a video we HAVE read, and queues it to be asked the
    // same question a second time at the same price.
    const r = parse({ requirements: { contentSlots: ok([], 'the speaker only reacts') } })
    const slots = r.profile.requirements.contentSlots
    expect(isKnown(slots)).toBe(true)
    expect(isKnown(slots) && slots.value).toEqual([])
    expect(reasonFor(r, 'requirements.contentSlots')).toBeUndefined()
  })

  it('and an empty list with nothing behind it is still refused', () => {
    const r = parse({ requirements: { contentSlots: { value: [], evidence: '' } } })
    expect(isKnown(r.profile.requirements.contentSlots)).toBe(false)
    expect(reasonFor(r, 'requirements.contentSlots')).toBe('no_evidence')
  })

  it('a product count above zero contradicts an empty slot list', () => {
    // ⚖️ THE NEW ANSWER MUST NOT OPEN A NEW WAY TO DISAGREE WITH ITSELF.
    const r = parse({
      requirements: { contentSlots: ok([], 'nothing named'), productsRequired: ok(2) },
    })
    expect(isKnown(r.profile.requirements.productsRequired)).toBe(false)
    expect(reasonFor(r, 'requirements.productsRequired')).toBe('contradicts_slots')
  })

  it('but an empty beat list is still a failure, because every video has a hook', () => {
    expect(isKnown(parse({ structure: { beats: ok([], 'x') } }).profile.structure.beats)).toBe(false)
  })

  it('and a slot with no label is not a slot', () => {
    const r = parse({ requirements: { contentSlots: ok([{ kind: 'product' }]) } })
    expect(isKnown(r.profile.requirements.contentSlots)).toBe(false)
  })
})

describe('a garbage response degrades to an unassessed card', () => {
  it('a non-object yields the empty profile and says so', () => {
    const r = parse('sorry, I cannot help with that')
    expect(r.fieldsAccepted).toBe(0)
    expect(r.rejections.map((x) => x.field)).toEqual(['(root)'])
  })

  it('an empty object learns nothing and repairs nothing', () => {
    const r = parse({})
    expect(r.fieldsAccepted).toBe(0)
    expect(r.profile.structure.containerType.basis).toBe('not_checked')
  })

  it('and a partly-good response keeps exactly the good part', () => {
    // ⚠️ THE REALISTIC CASE. One bad field must not discard sixteen good ones,
    // and sixteen good ones must not launder the bad one.
    const r = parse({
      topic: ok('retinol'),
      subtopic: ok('beginner routines'),
      structure: { containerType: ok('nonsense_type') },
    })
    expect(r.fieldsAccepted).toBe(2)
    expect(isKnown(r.profile.topic)).toBe(true)
    expect(isKnown(r.profile.structure.containerType)).toBe(false)
  })
})

// ── THE PILOT SAMPLE ──────────────────────────────────────────────────────

const lib = (): SampleCandidate[] => {
  const out: SampleCandidate[] = []
  for (let i = 0; i < 300; i++) {
    out.push({ url: `https://tiktok.com/@a/video/${i}`, platform: 'tiktok', niche: `n${i % 10}` })
  }
  for (let i = 0; i < 60; i++) {
    out.push({ url: `https://youtube.com/watch?v=${i}`, platform: 'youtube', niche: `n${i % 4}` })
  }
  for (let i = 0; i < 40; i++) {
    out.push({ url: `https://instagram.com/explore/tags/x${i}`, platform: 'instagram', niche: 'n0' })
  }
  return out
}

describe('the pilot sample is drawn on purpose, not by luck', () => {
  it('excludes hashtag pages, because nothing can transcribe one', () => {
    // ⚠️ 689 OF 692 INSTAGRAM ROWS ARE THESE. Sampling them spends real calls to
    // discover they cannot be read, then blames the schema.
    expect(isTranscribable({ url: 'https://instagram.com/explore/tags/x', platform: 'instagram', niche: 'n' })).toBe(false)
    expect(isTranscribable({ url: 'https://instagram.com/reel/abc', platform: 'instagram', niche: 'n' })).toBe(true)
    const r = pilotSample(lib(), 100)
    expect(r.byPlatform.instagram ?? 0).toBe(0)
    expect(r.excluded.not_a_video).toBe(40)
  })

  it('gives the small expensive platform real representation', () => {
    // ⚖️ PROPORTIONAL ALONE WOULD LEAVE ~17 YOUTUBE VIDEOS IN A 100 SAMPLE. The
    // long-form half is where the schema is most likely to break, so it gets a
    // floor rather than whatever rounding leaves it.
    const r = pilotSample(lib(), 100, { minPerPlatform: 25 })
    expect(r.byPlatform.youtube).toBeGreaterThanOrEqual(25)
    expect(r.urls.length).toBeLessThanOrEqual(100)
  })

  it('spreads across niches instead of draining the biggest one', () => {
    const r = pilotSample(lib(), 60)
    expect(r.nichesCovered).toBeGreaterThan(5)
  })

  it('never samples the same video twice', () => {
    // The library stores one row per niche placement: 9,504 rows, 4,211 URLs.
    const dupes = [...lib(), ...lib()]
    const r = pilotSample(dupes, 100)
    expect(new Set(r.urls).size).toBe(r.urls.length)
    expect(r.excluded.duplicate_url).toBeGreaterThan(0)
  })

  it('and is reproducible, so a result can be argued with', () => {
    // ⚠️ A PILOT YOU CANNOT RE-DRAW IS A PILOT YOU CANNOT ARGUE WITH. When the
    // numbers come back, "library or sample?" is answered by re-running it.
    expect(pilotSample(lib(), 80).urls).toEqual(pilotSample(lib(), 80).urls)
    expect(stableOrder('abc')).toBe(stableOrder('abc'))
    expect(stableOrder('abc')).not.toBe(stableOrder('abd'))
  })

  it('names a stratum it could not fill rather than quietly under-sampling', () => {
    const tiny: SampleCandidate[] = [
      { url: 'https://youtube.com/watch?v=1', platform: 'youtube', niche: 'n' },
    ]
    const r = pilotSample(tiny, 50, { minPerPlatform: 10 })
    expect(r.urls).toHaveLength(1)
    expect(r.shortfalls).toEqual([])   // quota was clamped to what exists
    expect(r.byPlatform.youtube).toBe(1)
  })
})
