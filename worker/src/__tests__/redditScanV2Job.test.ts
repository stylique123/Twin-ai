// Plan v7.1 WP5: the scan's caller. Fictional fixtures; no username or post text survives.
import { describe, expect, it } from 'vitest'
import { nichesFromRedditRows, painSentence, threadsFromRows, topicOf } from '../nicheBrain/redditScanV2Parse.js'
import { buildPainMap } from '../nicheBrain/redditScanV2.js'

describe('reddit scan v2 caller', () => {
  it('names a topic from two specific words', () => {
    expect(topicOf('Why does my glaze keep crawling on bisque?')).toBe('crawling glaze')
    expect(topicOf('help?')).toBeNull()
  })
  it('reads niches with 2+ known communities from v1 rows', () => {
    const n = nichesFromRedditRows([{ niche_key: 'pottery', threads: [{ community: 'r/Pottery' }, { community: 'Ceramics' }, { community: 'pottery' }] }, { niche_key: 'solo', threads: [{ community: 'one' }] }], new Map())
    expect(n).toEqual([{ niche_key: 'pottery', communities: ['pottery', 'ceramics'], last_scan_at: null }])
  })
  it('keeps no username and no title in the pattern or its sentence', () => {
    const map = new Map([['pottery', 'pottery'], ['ceramics', 'pottery']])
    const rows = Array.from({ length: 6 }, (_, i) => ({
      dataType: 'post', parsedCommunityName: i % 2 ? 'Ceramics' : 'pottery', url: `https://www.reddit.com/r/x/comments/${i}`,
      title: `My glaze keeps crawling again ${i}`, createdAt: '2026-10-01T00:00:00Z', username: 'someone_fictional',
    }))
    const patterns = buildPainMap(threadsFromRows(rows, map), topicOf)
    expect(patterns).toHaveLength(1)
    const all = JSON.stringify(patterns) + painSentence(patterns[0]!)
    expect(all).not.toMatch(/someone_fictional|keeps crawling again/)
  })
})
