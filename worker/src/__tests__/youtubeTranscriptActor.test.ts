import { describe, it, expect } from 'vitest'
import {
  youtubeVideoId, youtubeCacheKey, youtubeCacheFresh, transcriptActorChoice, starvibeToCaptionItems, STARVIBE_ACTOR,
} from '../youtubeTranscriptActor.js'

// Fictional fixtures only; no real video ids or creators.
const ID = 'AbCdEfGhIj0'

describe('youtubeVideoId', () => {
  it('normalises youtu.be, watch?v= and /shorts/ to one id', () => {
    for (const u of [
      `https://youtu.be/${ID}`, `https://youtu.be/${ID}?t=12`,
      `https://www.youtube.com/watch?v=${ID}`, `https://m.youtube.com/watch?feature=x&v=${ID}`,
      `https://www.youtube.com/shorts/${ID}`, `https://youtube.com/shorts/${ID}?si=fixture`,
    ]) expect(youtubeVideoId(u)).toBe(ID)
    expect(youtubeCacheKey(ID)).toBe(`youtube:${ID}`)
  })
  it('returns null for non-YouTube or malformed urls', () => {
    expect(youtubeVideoId('https://example.com/watch?v=' + ID)).toBeNull()
    expect(youtubeVideoId('https://www.youtube.com/watch?v=short')).toBeNull()
    expect(youtubeVideoId('not a url')).toBeNull()
  })
})

describe('youtubeCacheFresh (30 days)', () => {
  const now = Date.parse('2026-10-26T00:00:00Z')
  it('fresh inside 30 days, stale after', () => {
    expect(youtubeCacheFresh('2026-10-01T00:00:00Z', now)).toBe(true)
    expect(youtubeCacheFresh('2026-09-26T00:00:00Z', now)).toBe(false)
    expect(youtubeCacheFresh('garbage', now)).toBe(false)
  })
})

describe('transcriptActorChoice (flag defaults OFF)', () => {
  it('defaults to pintostudio', () => {
    expect(transcriptActorChoice(undefined)).toBe('pintostudio')
    expect(transcriptActorChoice('')).toBe('pintostudio')
    expect(transcriptActorChoice('pintostudio')).toBe('pintostudio')
  })
  it('selects starvibe only when asked', () => {
    expect(transcriptActorChoice('starvibe')).toBe('starvibe')
    expect(transcriptActorChoice('starvibe/youtube-video-transcript')).toBe('starvibe')
    expect(STARVIBE_ACTOR).toBe('starvibe~youtube-video-transcript')
  })
})

describe('starvibeToCaptionItems (UNVERIFIED schema, fictional fixture)', () => {
  it('maps nested transcript rows to [{data:[{start,dur,text}]}]', () => {
    const fixture = [{ videoId: ID, transcript: [
      { start: '0.5', duration: '2.0', text: 'Hello from a fictional demo.' },
      { offset: 2.5, end: 4, text: ' Second line ' },
      { start: 5, dur: 1, text: '' },
    ] }]
    expect(starvibeToCaptionItems(fixture)).toEqual([{ data: [
      { start: 0.5, dur: 2, text: 'Hello from a fictional demo.' },
      { start: 2.5, dur: 1.5, text: 'Second line' },
    ] }])
  })
  it('accepts flat rows and degrades to empty', () => {
    expect(starvibeToCaptionItems([{ start: 1, dur: 2, text: 'flat' }])).toEqual([{ data: [{ start: 1, dur: 2, text: 'flat' }] }])
    expect(starvibeToCaptionItems(null)).toEqual([{ data: [] }])
  })
})
