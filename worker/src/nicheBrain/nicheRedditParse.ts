// Pure half of the Reddit researcher (no DB import), so it can be tested.
//
// ⚠️ OWNER 2026-10-04: "use Reddit as a big source … search that niche, sub
// niche, and get what's working, highest rated, most frequent". Reddit threads
// in a niche are where real people ask, complain, argue and ask "what should I
// buy". This reads the top threads of the last year for one sub-niche and keeps
// what a creator can answer: the questions, the pains, the buying asks, the
// arguments and the words people actually use — each with how loud it is.
//
// ⚖️ THE NICHE'S, NEVER HERS. Nothing here is a fact about the creator, and no
// Redditor's words become a claim in her mouth: these are what the AUDIENCE
// says, for her to answer in her own words.

export const REDDIT_KINDS = ['question', 'complaint', 'buying', 'debate', 'phrase'] as const
export type RedditKind = (typeof REDDIT_KINDS)[number]
export interface RedditItem { kind: RedditKind; text: string; weight: number; threads: number }
export interface RedditThread { title: string; body: string; community: string | null; upvotes: number; comments: number; url: string | null; top: string[] }
export const MAX_THREADS = 40
export const MAX_ITEMS = 20

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
const s = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/**
 * Apify's Reddit dataset mixes posts and comments (`dataType`). Posts become
 * threads; a comment joins its post's top comments by `postId` / `parentId`.
 * Removed, deleted and NSFW posts are dropped. Ranked by upvotes.
 */
/** Scrapers name the vote count differently; the first number found wins. */
export function upvotesOf(r: Record<string, unknown>): number {
  for (const k of ['upVotes', 'upvotes', 'ups', 'score', 'numberOfUpvotes', 'votes']) {
    const v = n(r[k])
    if (v > 0) return v
  }
  return 0
}

/**
 * ⚠️ FIRST RUN, 2026-10-04: a site-wide search for "micro coffee roasting
 * business" returned r/AmItheAsshole and r/WFH. Threads are kept only from the
 * niche's own communities when any are known.
 */
export function inCommunities(t: RedditThread, communities: readonly string[]): boolean {
  if (!communities.length) return true
  const c = String(t.community ?? '').toLowerCase().replace(/^r\//, '')
  return communities.some((x) => x.toLowerCase().replace(/^r\//, '') === c)
}

export const SUBREDDIT_SYSTEM = [
  'Name the subreddits where people in ONE creator niche actually talk about it: hobbyists, buyers, beginners and professionals.',
  'Only real, active subreddits you are confident exist and are on-topic. Prefer specific ones over huge general ones (r/roasting over r/AskReddit).',
  'Return 3 to 6 names without the r/ prefix, most relevant first.',
].join('\n')
export const SUBREDDIT_SCHEMA = { type: 'object', properties: { subreddits: { type: 'array', items: { type: 'string' } } }, required: ['subreddits'] }
export function cleanSubreddits(raw: unknown): string[] {
  const list = (raw as { subreddits?: unknown } | null)?.subreddits
  if (!Array.isArray(list)) return []
  return [...new Set(list.map((x) => String(x ?? '').trim().replace(/^\/?r\//i, '')).filter((x) => /^[A-Za-z0-9_]{3,21}$/.test(x)))].slice(0, 6)
}

export function threadsFromDataset(rows: ReadonlyArray<Record<string, unknown>>): RedditThread[] {
  const posts = new Map<string, RedditThread & { id: string }>()
  for (const r of rows) {
    if (String(r.dataType ?? 'post') !== 'post') continue
    if (r.over18 === true || r.isNsfw === true) continue
    const title = s(r.title, 300)
    if (title.length < 8 || /^\[(removed|deleted)\]$/i.test(title)) continue
    const id = String(r.id ?? r.parsedId ?? r.url ?? title)
    const body = s(r.body, 1200)
    posts.set(id, {
      id, title, body: /^\[(removed|deleted)\]$/i.test(body) ? '' : body,
      community: s(r.parsedCommunityName ?? r.communityName, 60) || null,
      upvotes: upvotesOf(r), comments: n(r.numberOfComments ?? r.numComments ?? r.num_comments ?? r.commentsCount),
      url: typeof r.url === 'string' ? r.url : null, top: [],
    })
  }
  const comments = rows.filter((r) => String(r.dataType ?? '') === 'comment')
    .sort((a, b) => upvotesOf(b) - upvotesOf(a))
  for (const c of comments) {
    const text = s(c.body, 400)
    if (text.length < 15 || /^\[(removed|deleted)\]$/i.test(text)) continue
    const p = posts.get(String(c.postId ?? '')) ?? posts.get(String(c.parentId ?? '').replace(/^t3_/, ''))
    if (p && p.top.length < 4) p.top.push(text)
  }
  return [...posts.values()].sort((a, b) => b.upvotes - a.upvotes).slice(0, MAX_THREADS)
    .map(({ id: _id, ...t }) => t)
}

export const REDDIT_SYSTEM = [
  'You read Reddit threads from one creator niche and report what the AUDIENCE in that niche keeps saying.',
  'Use ONLY the threads given. Never invent a question, a product, a number or a quote.',
  'Group repeats: the same question asked in different words is ONE item, and `threads` is how many threads raised it.',
  'Kinds:',
  '- question: what people keep asking (how, why, which, is it worth it).',
  '- complaint: what frustrates or disappoints them.',
  '- buying: "what should I buy" asks, and what the most upvoted answers recommend (name products only as the threads do).',
  '- debate: a point people disagree on, with both sides in a few words.',
  '- phrase: a word or short phrase real people in this niche use that an outsider would not.',
  'Write each item as one plain sentence in the audience\'s own terms. `weight` is the summed upvotes of the threads it came from.',
  'Keep ONLY what is about the niche itself; drop threads that merely mention a niche word (a celebrity story that involves coffee is not about coffee roasting).',
  'Aim for 10 to 20 items when the threads support it; fewer only when they genuinely do not.',
  'Leave out anything personal about a named user, anything sexual, medical advice to an individual, and slurs.',
  `Return at most ${MAX_ITEMS} items, loudest first.`,
].join('\n')

export const REDDIT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: [...REDDIT_KINDS] },
          text: { type: 'string' },
          weight: { type: 'number' },
          threads: { type: 'number' },
        },
        required: ['kind', 'text', 'weight', 'threads'],
      },
    },
  },
  required: ['items'],
}

/** The threads as the model reads them: fenced as untrusted data. */
export function redditPrompt(subNiche: string, threads: readonly RedditThread[]): string {
  const blocks = threads.map((t, i) => [
    `#${i + 1} [${t.upvotes} upvotes, ${t.comments} comments${t.community ? `, r/${t.community}` : ''}] ${t.title}`,
    t.body ? `  ${t.body.slice(0, 500)}` : '',
    ...t.top.map((c) => `  > ${c.slice(0, 280)}`),
  ].filter(Boolean).join('\n'))
  const body = blocks.join('\n\n').split('<<<UNTRUSTED_DATA').join('').split('END_UNTRUSTED_DATA>>>').join('')
  return `Niche: ${subNiche}\n<<<UNTRUSTED_DATA reddit threads\n${body}\nEND_UNTRUSTED_DATA>>>`
}

/** Keeps well-formed items only, deduped by text, loudest first. */
export function cleanRedditItems(raw: unknown): RedditItem[] {
  const list = (raw as { items?: unknown } | null)?.items
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: RedditItem[] = []
  for (const x of list as Array<Record<string, unknown>>) {
    const kind = String(x?.kind ?? '') as RedditKind
    if (!REDDIT_KINDS.includes(kind)) continue
    const text = s(x.text, 240)
    const key = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (text.length < 6 || seen.has(key)) continue
    seen.add(key)
    out.push({ kind, text, weight: Math.max(0, Math.round(n(x.weight))), threads: Math.max(1, Math.round(n(x.threads))) })
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, MAX_ITEMS)
}

/** The search terms for one sub-niche: the sub-niche, and its niche when different. */
export function redditSearches(subNiche: string, niche: string | null): string[] {
  const a = s(subNiche, 80)
  const b = s(niche, 80)
  return [...new Set([a, b && b.toLowerCase() !== a.toLowerCase() ? b : ''].filter((x) => x.length >= 3))]
}
