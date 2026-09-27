import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  outstandAuthUrl, outstandAccounts, pickAccounts, outstandPostBody, outstandPostResult, outstandMetrics,
  outstandComments, outstandStatus, insightStyle, queueWindow, OUTSTAND_NETWORKS,
} from '../outstand'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

describe('Outstand publishing (owner decision 2026-09-27)', () => {
  it('covers the four networks on managed keys', () => {
    expect(Object.keys(OUTSTAND_NETWORKS).sort()).toEqual(['instagram', 'linkedin', 'tiktok', 'youtube'])
  })
  it('reads responses in either casing, with or without a data wrapper', () => {
    expect(outstandAuthUrl({ data: { url: 'https://auth.example/x' } })).toBe('https://auth.example/x')
    expect(outstandAuthUrl({ authUrl: 'https://a.b/c' })).toBe('https://a.b/c')
    expect(outstandAuthUrl({ url: 'javascript:alert(1)' })).toBeNull()
    const accs = outstandAccounts({ data: { accounts: [{ id: 'a1', network: 'Instagram', username: 'sortof' }, { id: 'a2', network: 'facebook' }] } })
    expect(pickAccounts(accs, 'instagram')).toEqual([{ id: 'a1', network: 'instagram', username: 'sortof', avatar: null }])
  })
  it('sends the video and, for YouTube, its own title; schedules only when handing off', () => {
    const b = outstandPostBody('acc', 'cap', 'https://v/x.mp4', { platform: 'youtube', title: 'My mug', scheduledAt: '2026-10-01T09:00:00Z' })
    expect(b).toEqual({ accounts: ['acc'], containers: [{ content: 'cap', media: [{ url: 'https://v/x.mp4', filename: 'twin-video.mp4' }] }], scheduledAt: '2026-10-01T09:00:00Z', youtube: { title: 'My mug' } })
    expect(outstandPostBody('acc', 'c', 'u')).not.toHaveProperty('scheduledAt')
  })
  it('reads the post back and maps its status', () => {
    const r = outstandPostResult({ id: 'p1', status: 'pending', socialAccounts: [{ status: 'published', platformPostURL: 'https://tiktok.com/v/1' }] })
    expect(r).toEqual({ id: 'p1', url: 'https://tiktok.com/v/1', status: 'published', error: null })
    expect(outstandStatus('published')).toBe('posted')
    expect(outstandStatus('failed')).toBe('failed')
    expect(outstandStatus('scheduled')).toBe('pending')
  })
  it('sums metrics across accounts and never calls impressions views', () => {
    expect(outstandMetrics({ accounts: [{ metrics: { views: 10, likes: 2 } }, { metrics: { views: 5 } }] }))
      .toMatchObject({ views: 15, likes: 2, comments: null })
    expect(outstandMetrics({ impressions: 900 })).toMatchObject({ views: null, impressions: 900 })
    expect(outstandMetrics({})).toBeNull()
  })
  it('shapes insights by what each network gives', () => {
    expect(insightStyle('instagram')).toEqual({ chart: 'timeseries', commentsReadable: true })
    expect(insightStyle('linkedin')).toEqual({ chart: 'timeseries', commentsReadable: true })
    expect(insightStyle('tiktok')).toEqual({ chart: 'lifetime', commentsReadable: false })
    expect(insightStyle('youtube')).toEqual({ chart: 'lifetime', commentsReadable: false })
    expect(outstandComments({ comments: [{ id: 'c', username: 'amy', text: 'Is it dishwasher safe?' }, { id: 'd' }] }))
      .toEqual([{ id: 'c', username: 'amy', text: 'Is it dishwasher safe?', at: null }])
  })
  it('the 30-day queue: due now, hand off within 30 days, hold beyond', () => {
    const now = Date.parse('2026-09-27T00:00:00Z')
    expect(queueWindow('2026-09-27T00:01:00Z', now)).toBe('due')
    expect(queueWindow('2026-10-10T00:00:00Z', now)).toBe('hand_off')
    expect(queueWindow('2026-12-01T00:00:00Z', now)).toBe('hold')
  })
  it('is wired end to end: connect, queue, publish, insights, composer', () => {
    const social = readFileSync(join(REPO, 'supabase/functions/social/index.ts'), 'utf8')
    for (const s of ['/social-networks/', '/social-accounts/pending/', '/finalize', 'syncOutstandQueue(admin)', "action === 'insights'", 'post_stat_snapshots', "from('post-media')"]) {
      expect(social, s).toContain(s)
    }
    const cal = readFileSync(join(REPO, 'apps/web/src/pages/Calendar.tsx'), 'utf8')
    expect(cal).toContain('schedulePosts(')
    expect(cal).toContain('data-testid="youtube-title"')
    expect(cal).toContain('<PostInsightsPanel')
  })
})
