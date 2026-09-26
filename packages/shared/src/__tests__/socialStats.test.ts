import { describe, expect, it } from 'vitest'
import { matchTikTokByTime, outcomeWindow, samePermalink, statsFrom, youtubeId } from '../socialStats'

describe('views back from the platforms', () => {
  it('reads YouTube ids and compares Instagram permalinks loosely', () => {
    expect(youtubeId('https://youtube.com/watch?v=abc123XYZ')).toBe('abc123XYZ')
    expect(youtubeId('https://youtube.com/shorts/Qw_-e9812')).toBe('Qw_-e9812')
    expect(youtubeId('https://www.tiktok.com/')).toBeNull()
    expect(samePermalink('https://www.instagram.com/reel/AbC/?igsh=1', 'https://www.instagram.com/reel/abc')).toBe(true)
    expect(samePermalink('', '')).toBe(false)
  })
  it('matches a TikTok video only if it was created shortly after Twin posted it', () => {
    const posted = '2026-09-26T10:00:00Z'
    const t = Date.parse(posted) / 1000
    const vids = [{ id: 'old', create_time: t - 86400 }, { id: 'ours', create_time: t + 40 }, { id: 'later', create_time: t + 5 * 3600 }]
    expect(matchTikTokByTime(vids, posted)?.id).toBe('ours')
    expect(matchTikTokByTime([vids[0], vids[2]], posted)).toBeNull()
  })
  it('fills the 24h and 7d windows by age, and never invents a number', () => {
    const now = Date.parse('2026-09-26T00:00:00Z')
    expect(outcomeWindow('2026-09-25T12:00:00Z', now)).toEqual({ views_24h: false, views_7d: false })
    expect(outcomeWindow('2026-09-24T00:00:00Z', now)).toEqual({ views_24h: true, views_7d: false })
    expect(outcomeWindow('2026-09-10T00:00:00Z', now)).toEqual({ views_24h: true, views_7d: true })
    expect(statsFrom({ viewCount: '120', likeCount: '9' }, { views: 'viewCount', likes: 'likeCount', comments: 'commentCount' }))
      .toEqual({ views: 120, likes: 9, comments: null })
    expect(statsFrom({}, { views: 'a', likes: 'b', comments: 'c' })).toBeNull()
  })
})
