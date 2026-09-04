import { describe, it, expect } from 'vitest'
import { scrapedPostRows } from '../scrapedPostRows'
import type { ScrapedPost } from '../media'

const post = (p: Partial<ScrapedPost>): ScrapedPost => ({
  text: 'a caption', likes: 10, plays: 100, hashtags: [], url: 'https://x.com/1', ...p,
} as ScrapedPost)

const base = { ownerId: 'owner-1', voiceId: 'voice-1', platform: 'tiktok', handle: 'lukefitphysio' }

describe('scrapedPostRows — keep what the scan fetched', () => {
  it('carries the post across intact', () => {
    const [r] = scrapedPostRows({ ...base, posts: [post({
      text: ' Deadlifts are misunderstood ', url: ' https://tiktok.com/@x/1 ',
      plays: 543000, likes: 21000, hashtags: ['physio', 'gym'], cover: 'https://cdn/1.jpg',
    })] })
    expect(r).toEqual({
      owner_id: 'owner-1', voice_id: 'voice-1', platform: 'tiktok', handle: 'lukefitphysio',
      url: 'https://tiktok.com/@x/1', caption: 'Deadlifts are misunderstood',
      hashtags: ['physio', 'gym'], cover_url: 'https://cdn/1.jpg',
      plays: 543000, likes: 21000,
    })
  })

  // ⚠️⚠️ THE WHOLE REASON THE COLUMN IS NULLABLE.
  it('an unread count is stored as NULL, never as 0', () => {
    const [r] = scrapedPostRows({ ...base, posts: [post({ plays: null, likes: null })] })
    expect(r.plays).toBeNull()
    expect(r.likes).toBeNull()
  })

  it('a genuine zero is stored as 0, not dropped to null', () => {
    const [r] = scrapedPostRows({ ...base, posts: [post({ plays: 0, likes: 0 })] })
    expect(r.plays).toBe(0)
    expect(r.likes).toBe(0)
  })

  it('a nonsense count becomes null rather than a stored lie', () => {
    const [r] = scrapedPostRows({ ...base, posts: [post({ plays: NaN as unknown as number, likes: -5 })] })
    expect(r.plays).toBeNull()
    expect(r.likes).toBeNull()
  })

  it('a fractional count is truncated, because a view is a whole thing', () => {
    const [r] = scrapedPostRows({ ...base, posts: [post({ plays: 12.9 })] })
    expect(r.plays).toBe(12)
  })

  // ⚠️ THE UPSERT THAT WOULD FAIL THE WHOLE BATCH.
  it('a duplicate url is collapsed to one row, last one winning', () => {
    const rows = scrapedPostRows({ ...base, posts: [
      post({ url: 'https://a/1', plays: 10 }),
      post({ url: 'https://a/2', plays: 20 }),
      post({ url: 'https://a/1', plays: 99 }),
    ] })
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.url === 'https://a/1')?.plays).toBe(99)
  })

  it('drops a post the table would refuse rather than losing the good rows with it', () => {
    const rows = scrapedPostRows({ ...base, posts: [
      post({ url: '', text: 'no url' }),
      post({ url: 'https://a/2', text: '   ' }),
      post({ url: 'https://a/3', text: 'keeps this one' }),
    ] })
    expect(rows.map((r) => r.url)).toEqual(['https://a/3'])
  })

  it('a missing voice id is null, not an empty string', () => {
    const [r] = scrapedPostRows({ ...base, voiceId: null, posts: [post({})] })
    expect(r.voice_id).toBeNull()
    const [s] = scrapedPostRows({ ...base, voiceId: '  ', posts: [post({})] })
    expect(s.voice_id).toBeNull()
  })

  it('a missing cover is null, not an empty string', () => {
    const [r] = scrapedPostRows({ ...base, posts: [post({ cover: undefined })] })
    expect(r.cover_url).toBeNull()
  })

  it('non-string hashtags cannot reach a text[] column', () => {
    const [r] = scrapedPostRows({ ...base, posts: [post({
      hashtags: ['ok', 7, null] as unknown as string[],
    })] })
    expect(r.hashtags).toEqual(['ok'])
  })

  it('no owner means no rows — never rows attributed to nobody', () => {
    expect(scrapedPostRows({ ...base, ownerId: '', posts: [post({})] })).toEqual([])
    expect(scrapedPostRows({ ...base, ownerId: '   ', posts: [post({})] })).toEqual([])
  })

  it('an empty scrape yields an empty batch, not a throw', () => {
    expect(scrapedPostRows({ ...base, posts: [] })).toEqual([])
  })
})
