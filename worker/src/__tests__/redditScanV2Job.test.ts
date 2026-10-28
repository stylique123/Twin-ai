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

describe('plan v7.1 gap 3: creator-profile niches join the scan', async () => {
  const { newProfileNiches, pickedCommunitiesRow } = await import('../nicheBrain/redditScanV2Parse.js')
  const { dueForScan, SCAN_V2_MAX_NICHES } = await import('../nicheBrain/redditScanV2.js')
  it('takes new profile niches once, skips known and repeats, honours the per-cycle max', () => {
    const p = [{ profile: { niche: 'Sourdough Baking' } }, { profile: { niche: 'sourdough baking' } }, { profile: { niche: 'Pottery' } }, { profile: { niche: 'Vinyl repair' } }, { profile: null }]
    expect(newProfileNiches(p, new Set(['pottery']), 5)).toEqual([{ niche_key: 'sourdough baking', niche: 'Sourdough Baking' }, { niche_key: 'vinyl repair', niche: 'Vinyl repair' }])
    expect(newProfileNiches(p, new Set(), 1)).toHaveLength(1)
  })
  it('the stored pick carries communities only and is read back as a scan niche', () => {
    const row = pickedCommunitiesRow({ niche_key: 'vinyl repair', niche: 'Vinyl repair' }, ['vinyl', 'turntables'])
    expect(JSON.stringify(row)).not.toMatch(/title|url|user/)
    expect(nichesFromRedditRows([row], new Map())).toEqual([{ niche_key: 'vinyl repair', communities: ['vinyl', 'turntables'], last_scan_at: null }])
  })
  it('one run stays inside the same niche ceiling, never-scanned first', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ niche_key: `n${i}`, communities: ['a', 'b'], last_scan_at: i < 40 ? '2026-01-01T00:00:00Z' : null }))
    const due = dueForScan(many, Date.parse('2026-10-28'))
    expect(due).toHaveLength(SCAN_V2_MAX_NICHES)
    expect(due[0]!.last_scan_at).toBeNull()
  })
})
