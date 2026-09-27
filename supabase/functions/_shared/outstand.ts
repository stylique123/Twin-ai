// GENERATED FROM packages/shared/src/outstand.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
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

/** Marks a platform_connections row as going through Outstand (in `scopes`). */
export const OUTSTAND_MARKER = 'outstand'

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

export interface OutstandAccount { id: string; network: string | null; username: string | null }

function account(a: J): OutstandAccount | null {
  const id = str(a.id, a.account_id, a.accountId, a.social_account_id, a.socialAccountId, a.page_id, a.pageId)
  if (!id) return null
  return {
    id,
    network: str(a.network, a.platform, a.provider)?.toLowerCase() ?? null,
    username: str(a.username, a.name, a.handle, a.display_name, a.displayName),
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

/** Body for POST /posts. Twin schedules itself, so this always publishes now. */
export function outstandPostBody(accountId: string, caption: string, videoUrl: string): J {
  return {
    accounts: [accountId],
    containers: [{ content: caption, media: [{ url: videoUrl, filename: 'twin-video.mp4' }] }],
  }
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
export function outstandMetrics(resp: unknown): { views: number | null; likes: number | null; comments: number | null } | null {
  const o = unwrap(resp)
  const rows = list(o, 'accounts', 'socialAccounts', 'results', 'metrics')
  const sources = rows.length ? rows.map((r) => Object.keys(obj(r.metrics)).length ? obj(r.metrics) : r)
    : [Object.keys(obj(o.metrics)).length ? obj(o.metrics) : o]
  const sum = (keys: string[]) => {
    let seen = false, total = 0
    for (const s of sources) for (const k of keys) { const n = num(s[k]); if (n !== null) { seen = true; total += n; break } }
    return seen ? total : null
  }
  const out = { views: sum(['views', 'video_views', 'videoViews', 'plays']), likes: sum(['likes', 'like_count', 'likeCount']), comments: sum(['comments', 'comment_count', 'commentCount']) }
  return out.views === null && out.likes === null && out.comments === null ? null : out
}
