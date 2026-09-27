// OUTSTAND — one posting API for YouTube, TikTok, Instagram and LinkedIn
// (owner's decision, 2026-09-27). Pure part: request shapes and TOLERANT
// readers for Outstand's responses.
//
// ⚠️ WRITTEN FROM THE PUBLIC DOCS, NOT A LIVE KEY. The docs site was not
// reachable from the build environment, so every reader accepts both snake and
// camel case and an optional `data` wrapper, and returns null rather than
// guessing when a field is absent. The first real connection is the test.
//
// ⚖️ MANAGED KEYS: Outstand hosts the approved platform apps for these
// networks, so no developer app or app review is needed on Twin's side.

export const OUTSTAND_API = 'https://api.outstand.so/v1'

/** Twin platform → Outstand network name. Only managed-key networks. */
export const OUTSTAND_NETWORKS: Readonly<Record<string, string>> = Object.freeze({
  youtube: 'youtube', tiktok: 'tiktok', instagram: 'instagram', linkedin: 'linkedin',
})

/** `platform_connections.provider` for a row that goes through Outstand. */
export const OUTSTAND_MARKER = 'outstand'

/** Outstand refuses a scheduledAt more than 30 days ahead; Twin holds the rest. */
export const OUTSTAND_MAX_AHEAD_MS = 30 * 86_400_000

/** Which analytics shape each network really gives (owner's blueprint):
 *  Instagram / LinkedIn → history over time + readable comments;
 *  TikTok / YouTube → lifetime totals only, comment text not available. */
export function insightStyle(platform: string): { chart: 'timeseries' | 'lifetime'; commentsReadable: boolean } {
  return platform === 'instagram' || platform === 'linkedin'
    ? { chart: 'timeseries', commentsReadable: true }
    : { chart: 'lifetime', commentsReadable: false }
}

/** Should this scheduled post be handed to Outstand now? (within 30 days, not yet due) */
export function queueWindow(scheduledForIso: string | null | undefined, nowMs = Date.now()): 'due' | 'hand_off' | 'hold' {
  const t = Date.parse(String(scheduledForIso ?? ''))
  if (!Number.isFinite(t) || t <= nowMs + 2 * 60_000) return 'due'
  return t - nowMs <= OUTSTAND_MAX_AHEAD_MS ? 'hand_off' : 'hold'
}

type J = Record<string, unknown>
const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? v as J : {})
const unwrap = (v: unknown): J => { const o = obj(v); return Object.keys(obj(o.data)).length ? obj(o.data) : o }
const str = (...vals: unknown[]): string | null => {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim()
  for (const v of vals) if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return null
}
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
const list = (v: unknown, ...keys: string[]): J[] => {
  if (Array.isArray(v)) return v.map(obj)
  const o = obj(v)
  for (const k of keys) if (Array.isArray(o[k])) return (o[k] as unknown[]).map(obj)
  if (Object.keys(obj(o.data)).length) return list(o.data, ...keys)
  return Array.isArray(o.data) ? (o.data as unknown[]).map(obj) : []
}

/** The URL to send her to, from POST /social-networks/:network/auth-url. */
export function outstandAuthUrl(resp: unknown): string | null {
  const o = unwrap(resp)
  const u = str(o.url, o.auth_url, o.authUrl, o.authorization_url, o.authorizationUrl)
  return u && /^https:\/\//.test(u) ? u : null
}

export interface OutstandAccount { id: string; network: string | null; username: string | null; avatar: string | null }

function account(a: J): OutstandAccount | null {
  const id = str(a.id, a.account_id, a.accountId, a.social_account_id, a.socialAccountId, a.page_id, a.pageId)
  if (!id) return null
  return {
    id,
    network: str(a.network, a.platform, a.provider)?.toLowerCase() ?? null,
    username: str(a.username, a.name, a.handle, a.display_name, a.displayName),
    avatar: str(a.avatar_url, a.avatarUrl, a.profile_picture, a.profilePicture, a.picture),
  }
}

/** Accounts offered by GET /social-accounts/pending/:session (or returned by finalize / list). */
export function outstandAccounts(resp: unknown): OutstandAccount[] {
  return list(resp, 'accounts', 'available_accounts', 'availableAccounts', 'pages', 'social_accounts', 'socialAccounts', 'items')
    .map(account).filter((a): a is OutstandAccount => a !== null)
}

/** Which offered accounts to connect: the ones on this network, else all. */
export function pickAccounts(accounts: readonly OutstandAccount[], network: string): OutstandAccount[] {
  const same = accounts.filter((a) => a.network === network)
  return (same.length ? same : accounts).slice(0, 1)
}

/** Body for POST /posts. `scheduledAt` only when handing off a future post
 *  (≤ 30 days); YouTube gets its own title. */
export function outstandPostBody(
  accountId: string, caption: string, videoUrl: string,
  opts: { scheduledAt?: string | null; platform?: string; title?: string | null } = {},
): J {
  const body: J = {
    accounts: [accountId],
    containers: [{ content: caption, media: [{ url: videoUrl, filename: 'twin-video.mp4' }] }],
  }
  if (opts.scheduledAt) body.scheduledAt = opts.scheduledAt
  if (opts.platform === 'youtube' && opts.title) body.youtube = { title: opts.title.slice(0, 100) }
  return body
}

/** Map Outstand's post status onto Twin's. */
export function outstandStatus(s: string | null): 'posted' | 'failed' | 'pending' {
  const v = String(s ?? '').toLowerCase()
  if (/^(published|posted|success|succeeded|complete|completed|live)$/.test(v)) return 'posted'
  if (/fail|error|reject|cancel/.test(v)) return 'failed'
  return 'pending'
}

export interface OutstandPostResult { id: string | null; url: string | null; status: string | null; error: string | null }

/** Reads POST /posts or GET /posts/:id. */
export function outstandPostResult(resp: unknown): OutstandPostResult {
  const o = unwrap(resp)
  const post = Object.keys(obj(o.post)).length ? obj(o.post) : o
  const accts = list(post, 'socialAccounts', 'social_accounts', 'accounts', 'results', 'targets')
  const first = accts[0] ?? {}
  return {
    id: str(post.id, post.post_id, post.postId),
    url: str(first.platformPostURL, first.platformPostUrl, first.platform_post_url, first.url, post.url),
    status: str(first.status, post.status),
    error: str(first.error, post.error, obj(post.error).message),
  }
}

/** Views/likes/comments from GET /posts/:id/analytics, summed across accounts. */
export interface OutstandMetricSet { views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null; impressions: number | null }
export function outstandMetrics(resp: unknown): OutstandMetricSet | null {
  const o = unwrap(resp)
  const rows = list(o, 'accounts', 'socialAccounts', 'results', 'metrics')
  const sources = rows.length ? rows.map((r) => Object.keys(obj(r.metrics)).length ? obj(r.metrics) : r)
    : [Object.keys(obj(o.metrics)).length ? obj(o.metrics) : o]
  const sum = (keys: string[]) => {
    let seen = false, total = 0
    for (const s of sources) for (const k of keys) { const n = num(s[k]); if (n !== null) { seen = true; total += n; break } }
    return seen ? total : null
  }
  const out: OutstandMetricSet = {
    views: sum(['views', 'video_views', 'videoViews', 'plays']), likes: sum(['likes', 'like_count', 'likeCount']),
    comments: sum(['comments', 'comment_count', 'commentCount']), shares: sum(['shares', 'share_count', 'shareCount', 'reposts']),
    saves: sum(['saves', 'saved', 'save_count', 'saveCount', 'bookmarks']), impressions: sum(['impressions', 'impression_count']),
  }
  return Object.values(out).every((v) => v === null) ? null : out
}

export interface OutstandComment { id: string; username: string | null; text: string; at: string | null }
/** Comment text from GET /posts/:id/comments (Instagram / LinkedIn only). */
export function outstandComments(resp: unknown): OutstandComment[] {
  return list(resp, 'comments', 'items', 'results').flatMap((c) => {
    const text = str(c.text, c.message, c.content, c.body)
    const id = str(c.id, c.comment_id, c.commentId)
    if (!text || !id) return []
    return [{ id, username: str(c.username, c.author, obj(c.from).username, obj(c.author).name), text: text.slice(0, 500), at: str(c.timestamp, c.created_at, c.createdAt) }]
  }).slice(0, 50)
}
