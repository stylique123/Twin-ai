import { describe, expect, it } from 'vitest'
import { threadsFromDataset, cleanRedditItems, redditPrompt, redditSearches } from './nicheRedditParse.js'

describe('Reddit niche research (owner 2026-10-04)', () => {
  const rows = [
    { dataType: 'post', id: 'a', title: 'What grinder should I buy under $150?', body: 'Just starting out', upVotes: 900, numberOfComments: 210, parsedCommunityName: 'espresso', url: 'https://reddit.com/a' },
    { dataType: 'post', id: 'b', title: 'Why does my pour over taste sour?', body: '[removed]', upVotes: 300, numberOfComments: 80 },
    { dataType: 'post', id: 'c', title: 'nsfw thing here please', over18: true, upVotes: 5000 },
    { dataType: 'post', id: 'd', title: '[deleted]', upVotes: 50 },
    { dataType: 'comment', postId: 'a', body: 'Get a hand grinder first, honestly the best value.', upVotes: 400 },
    { dataType: 'comment', postId: 'a', body: 'short', upVotes: 900 },
    { dataType: 'comment', parentId: 't3_b', body: 'Grind finer and use hotter water for sure.', upVotes: 120 },
  ]
  it('turns posts into ranked threads with their top comments, dropping removed and NSFW', () => {
    const t = threadsFromDataset(rows)
    expect(t.map((x) => x.title)).toEqual(['What grinder should I buy under $150?', 'Why does my pour over taste sour?'])
    expect(t[0].top).toEqual(['Get a hand grinder first, honestly the best value.'])
    expect(t[0].community).toBe('espresso')
    expect(t[1].body).toBe('')
    expect(t[1].top).toEqual(['Grind finer and use hotter water for sure.'])
  })
  it('fences the threads as untrusted data', () => {
    const p = redditPrompt('home espresso', threadsFromDataset(rows))
    expect(p).toContain('<<<UNTRUSTED_DATA reddit threads')
    expect(p).toContain('[900 upvotes, 210 comments, r/espresso]')
  })
  it('keeps well-formed items, deduped and loudest first', () => {
    const items = cleanRedditItems({ items: [
      { kind: 'question', text: 'Is a $150 grinder enough?', weight: 300, threads: 3 },
      { kind: 'buying', text: 'Which grinder under $150?', weight: 900, threads: 5 },
      { kind: 'question', text: 'is a $150 grinder enough', weight: 10, threads: 1 },
      { kind: 'gossip', text: 'not a kind', weight: 1, threads: 1 },
      { kind: 'phrase', text: 'ok', weight: 1, threads: 1 },
    ] })
    expect(items.map((i) => i.kind)).toEqual(['buying', 'question'])
  })
  it('searches the sub-niche and its niche when different', () => {
    expect(redditSearches('home espresso', 'Coffee')).toEqual(['home espresso', 'Coffee'])
    expect(redditSearches('coffee', 'Coffee')).toEqual(['coffee'])
  })
})

describe('Reddit: the niche\'s own communities (first-run fix)', () => {
  it('reads upvotes under any field name', async () => {
    const { upvotesOf } = await import('./nicheRedditParse.js')
    expect(upvotesOf({ upVotes: 0, score: 512 })).toBe(512)
    expect(upvotesOf({ ups: 9 })).toBe(9)
    expect(upvotesOf({})).toBe(0)
  })
  it('keeps threads from the niche subreddits only', async () => {
    const { inCommunities } = await import('./nicheRedditParse.js')
    const t = (c: string) => ({ title: 'x', body: '', community: c, upvotes: 1, comments: 1, url: null, top: [] })
    expect(inCommunities(t('roasting'), ['roasting', 'Coffee'])).toBe(true)
    expect(inCommunities(t('AmItheAsshole'), ['roasting', 'Coffee'])).toBe(false)
    expect(inCommunities(t('anything'), [])).toBe(true)
  })
  it('cleans subreddit names', async () => {
    const { cleanSubreddits } = await import('./nicheRedditParse.js')
    expect(cleanSubreddits({ subreddits: ['r/roasting', '/r/Coffee', 'espresso', 'not a sub!', 'roasting'] })).toEqual(['roasting', 'Coffee', 'espresso'])
  })
})
