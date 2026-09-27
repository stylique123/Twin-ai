// Supabase Edge Function: social
// One-click posting plumbing. Provider-agnostic, exactly like billing: each
// platform is a small adapter, gated by its own secrets, so the whole thing is
// inert until the operator adds that platform's developer-app keys.
//
//   POST { action:"start", platform }     -> { url } | { unconfigured, needs:[] }   (auth required)
//   GET  ?action=callback&code&state      -> 302 redirect to APP_URL/calendar?connected=…
//   POST { action:"publish", post_id }    -> { ok, external_url } | { error }        (auth required)
//   POST { action:"disconnect", platform }-> { ok }                                  (auth required)
//
// verify_jwt = false (set in config.toml): the OAuth callback is hit by the
// browser with no Supabase JWT, so we authenticate start/publish/disconnect
// manually from the Authorization header, and authenticate the callback from a
// signed `state` value.
//
// Secrets (only the platforms you enable):
//   APP_URL
//   YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET
//   TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET
//   META_APP_ID, META_APP_SECRET            (Instagram via the Graph API)
//   OUTSTAND_API_KEY   — when set, YouTube / TikTok / Instagram / LinkedIn connect,
//                        publish and report views through Outstand's managed apps
//                        (no developer app per platform). Native rows keep working.

import { createClient } from 'jsr:@supabase/supabase-js@2.112.2'
import { encryptToken, decryptToken } from './tokenCrypto.ts'
import { serviceKeyFrom } from '../_shared/serviceKey.ts'
import { OUTSTAND_API, OUTSTAND_NETWORKS, OUTSTAND_MARKER, outstandAuthUrl, outstandAccounts, pickAccounts, outstandPostBody, outstandPostResult, outstandMetrics, outstandComments, outstandStatus, insightStyle, queueWindow, type OutstandMetricSet } from '../_shared/outstand.ts'
import { herAnswers, unansweredQuestions, type PlatformComment, type PostQuestion } from '../_shared/postQuestions.ts'
import { youtubeId, samePermalink, matchTikTokByTime, outcomeWindow, statsFrom, type PostStats } from '../_shared/socialStats.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const env = (k: string) => Deno.env.get(k)

// OAuth tokens are encrypted at rest with a key held HERE, not in the database.
// See tokenCrypto.ts for why: this is the only consumer, so the key never needs
// to be reachable from SQL — and a key reachable from SQL does not survive the
// service-role leak §9a.2 names as a threat.
const TOKEN_KEY = () => env('SOCIAL_TOKEN_KEY') ?? ''
const fnBase = () => `${env('SUPABASE_URL')}/functions/v1/social`
const appUrl = () => (env('APP_URL') ?? '').replace(/\/+$/, '')

// --- OAuth `state`: a random, single-use, short-TTL nonce stored server-side -----
// The state carries NO identity — it's an opaque unguessable token. The callback
// looks the nonce up, atomically consumes it, and derives owner_id/platform from the
// stored row, so a replayed or attacker-planted state can't bind tokens to another
// account (the connection-fixation fix). Nonces expire after NONCE_TTL_MS.
const NONCE_TTL_MS = 10 * 60 * 1000
function newNonce(): string {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

interface Adapter {
  label: string
  needs: string[]
  configured: () => boolean
  authorizeUrl: (state: string) => string
  exchange: (code: string) => Promise<{ access_token: string; refresh_token?: string; expires_in?: number }>
  // Optional: swap an expired access token for a fresh one using the stored refresh
  // token. Only platforms with short-lived tokens (YouTube ~1h) need it; others may
  // omit it and simply require a reconnect when the token dies.
  refresh?: (refreshToken: string) => Promise<{ access_token: string; expires_at?: string }>
  account: (accessToken: string) => Promise<{ id: string; label: string }>
  publish: (a: { accessToken: string; accountId: string; videoUrl: string; title: string; caption: string }) => Promise<{ external_url: string }>
  /** Views/likes/comments for a post Twin published. Null when it cannot be
   *  matched — never a guess. */
  stats?: (a: { accessToken: string; accountId: string; externalUrl: string | null; postedAt: string }) => Promise<PostStats | null>
  /** Top-level comments with whether she replied. Null when the post cannot
   *  be matched. TikTok has none: its creator API does not list comments. */
  comments?: (a: { accessToken: string; accountId: string; externalUrl: string | null }) => Promise<PlatformComment[] | null>
}

// Small helper: poll an async condition up to `tries` times with `delayMs` spacing.
async function pollUntil<T>(fn: () => Promise<T | null>, tries: number, delayMs: number): Promise<T | null> {
  for (let i = 0; i < tries; i++) {
    const v = await fn()
    if (v !== null) return v
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return null
}

const REDIRECT = () => `${fnBase()}?action=callback`

const ADAPTERS: Record<string, Adapter> = {
  // YouTube (Shorts) via the Data API v3. Real OAuth + resumable upload.
  youtube: {
    label: 'YouTube',
    needs: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
    configured: () => !!(env('YOUTUBE_CLIENT_ID') && env('YOUTUBE_CLIENT_SECRET')),
    authorizeUrl: (state) => {
      const p = new URLSearchParams({
        client_id: env('YOUTUBE_CLIENT_ID')!,
        redirect_uri: REDIRECT(),
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
        access_type: 'offline',
        prompt: 'consent',
        state,
      })
      return `https://accounts.google.com/o/oauth2/v2/auth?${p}`
    },
    exchange: async (code) => {
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: env('YOUTUBE_CLIENT_ID')!, client_secret: env('YOUTUBE_CLIENT_SECRET')!,
          redirect_uri: REDIRECT(), grant_type: 'authorization_code',
        }),
      })
      if (!r.ok) throw new Error(`YouTube token ${r.status}: ${(await r.text()).slice(0, 160)}`)
      return await r.json()
    },
    refresh: async (refreshToken) => {
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env('YOUTUBE_CLIENT_ID')!, client_secret: env('YOUTUBE_CLIENT_SECRET')!,
          refresh_token: refreshToken, grant_type: 'refresh_token',
        }),
      })
      if (!r.ok) throw new Error(`YouTube refresh ${r.status}: ${(await r.text()).slice(0, 160)}`)
      const j = await r.json()
      return { access_token: j.access_token, expires_at: j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : undefined }
    },
    account: async (accessToken) => {
      const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${accessToken}` } })
      const d = await r.json()
      const ch = d?.items?.[0]
      return { id: ch?.id ?? '', label: ch?.snippet?.title ? `YouTube · ${ch.snippet.title}` : 'YouTube' }
    },
    publish: async ({ accessToken, videoUrl, title, caption }) => {
      // Resumable upload: init with metadata, then PUT the bytes streamed from storage.
      const meta = { snippet: { title: title.slice(0, 95), description: caption.slice(0, 4900) }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } }
      const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Upload-Content-Type': 'video/mp4' },
        body: JSON.stringify(meta),
      })
      if (!init.ok) throw new Error(`YouTube init ${init.status}: ${(await init.text()).slice(0, 160)}`)
      const uploadUrl = init.headers.get('Location')
      if (!uploadUrl) throw new Error('YouTube did not return an upload URL')
      const vid = await fetch(videoUrl)
      if (!vid.ok || !vid.body) throw new Error('Could not read the video file to upload')
      const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: vid.body })
      if (!put.ok) throw new Error(`YouTube upload ${put.status}: ${(await put.text()).slice(0, 160)}`)
      const done = await put.json()
      return { external_url: `https://youtube.com/watch?v=${done.id}` }
    },
  },
  // TikTok + Instagram: structured but require their (review-gated) content APIs.
  // (YouTube stats are attached below, after the table, to keep this block readable.)
  tiktok: {
    label: 'TikTok', needs: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
    configured: () => !!(env('TIKTOK_CLIENT_KEY') && env('TIKTOK_CLIENT_SECRET')),
    authorizeUrl: (state) => {
      const p = new URLSearchParams({ client_key: env('TIKTOK_CLIENT_KEY')!, redirect_uri: REDIRECT(), response_type: 'code', scope: 'user.info.basic,video.publish,video.upload,video.list', state })
      return `https://www.tiktok.com/v2/auth/authorize/?${p}`
    },
    exchange: async (code) => {
      const r = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_key: env('TIKTOK_CLIENT_KEY')!, client_secret: env('TIKTOK_CLIENT_SECRET')!, code, grant_type: 'authorization_code', redirect_uri: REDIRECT() }),
      })
      if (!r.ok) throw new Error(`TikTok token ${r.status}`)
      return await r.json()
    },
    account: async (accessToken) => {
      try {
        const r = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', { headers: { Authorization: `Bearer ${accessToken}` } })
        if (r.ok) { const j = await r.json(); const u = j?.data?.user; return { id: u?.open_id ?? '', label: u?.display_name ? `TikTok · ${u.display_name}` : 'TikTok' } }
      } catch { /* label is best-effort */ }
      return { id: '', label: 'TikTok' }
    },
    // TikTok Content Posting API — Direct Post via PULL_FROM_URL. The video's
    // domain must be verified in the TikTok dev portal, and until the app clears
    // audit only SELF_ONLY is permitted (set TIKTOK_PRIVACY=PUBLIC_TO_EVERYONE after
    // approval to go public).
    publish: async ({ accessToken, videoUrl, title }) => {
      const privacy = env('TIKTOK_PRIVACY') || 'SELF_ONLY'
      const init = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({
          post_info: { title: title.slice(0, 2200), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false },
          source_info: { source: 'PULL_FROM_URL', video_url: videoUrl },
        }),
      })
      const initJson = await init.json().catch(() => ({}))
      if (!init.ok || initJson?.error?.code !== 'ok') {
        throw new Error(`TikTok init: ${initJson?.error?.message || init.status}`)
      }
      const publishId = initJson.data?.publish_id
      // Poll status until the pulled video finishes processing (best-effort, ~60s).
      await pollUntil(async () => {
        const s = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
          method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({ publish_id: publishId }),
        }).then((r) => r.json()).catch(() => null)
        const st = s?.data?.status
        if (st === 'PUBLISH_COMPLETE') return { done: true }
        if (st === 'FAILED') throw new Error(`TikTok publish failed: ${s?.data?.fail_reason || 'unknown'}`)
        return null
      }, 20, 3000)
      // TikTok doesn't return a canonical post URL synchronously; the video lands on
      // the connected profile. Link to the profile as the external reference.
      return { external_url: 'https://www.tiktok.com/' }
    },
    // Matched by time: Direct Post returns no video id (see matchTikTokByTime).
    stats: async ({ accessToken, postedAt }) => {
      const r = await fetch('https://open.tiktokapis.com/v2/video/list/?fields=id,create_time,view_count,like_count,comment_count', {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ max_count: 20 }),
      }).then((x) => x.json()).catch(() => null)
      const v = matchTikTokByTime((r?.data?.videos ?? []) as Array<Record<string, unknown> & { create_time?: number }>, postedAt)
      return statsFrom(v, { views: 'view_count', likes: 'like_count', comments: 'comment_count' })
    },
  },
  instagram: {
    label: 'Instagram', needs: ['META_APP_ID', 'META_APP_SECRET'],
    configured: () => !!(env('META_APP_ID') && env('META_APP_SECRET')),
    authorizeUrl: (state) => {
      const p = new URLSearchParams({ client_id: env('META_APP_ID')!, redirect_uri: REDIRECT(), response_type: 'code', scope: 'instagram_basic,instagram_content_publish,instagram_manage_insights,instagram_manage_comments,pages_show_list', state })
      return `https://www.facebook.com/v21.0/dialog/oauth?${p}`
    },
    exchange: async (code) => {
      const p = new URLSearchParams({ client_id: env('META_APP_ID')!, client_secret: env('META_APP_SECRET')!, redirect_uri: REDIRECT(), code })
      const r = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?${p}`)
      if (!r.ok) throw new Error(`Instagram token ${r.status}`)
      const short = await r.json()
      // Exchange the short-lived token for a long-lived one (~60 days) so posting
      // keeps working past the first hour.
      try {
        const lp = new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: env('META_APP_ID')!, client_secret: env('META_APP_SECRET')!, fb_exchange_token: short.access_token })
        const lr = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?${lp}`)
        if (lr.ok) { const long = await lr.json(); return { access_token: long.access_token, expires_in: long.expires_in ?? 60 * 24 * 3600 } }
      } catch { /* fall back to short-lived */ }
      return short
    },
    // Resolve the connected IG BUSINESS account id via the user's Facebook Page —
    // this is what publishing targets and gets stored as external_account_id.
    account: async (accessToken) => {
      try {
        const pages = await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=instagram_business_account,name&access_token=${accessToken}`).then((r) => r.json())
        for (const pg of pages?.data ?? []) {
          const igId = pg?.instagram_business_account?.id
          if (igId) {
            let handle = 'Instagram'
            try { const ig = await fetch(`https://graph.facebook.com/v21.0/${igId}?fields=username&access_token=${accessToken}`).then((r) => r.json()); if (ig?.username) handle = `Instagram · @${ig.username}` } catch { /* label best-effort */ }
            return { id: igId, label: handle }
          }
        }
      } catch { /* fall through */ }
      return { id: '', label: 'Instagram' }
    },
    // Instagram Reels publish: create a REELS container from the hosted video URL,
    // poll until Meta finishes ingesting it, then publish the container.
    publish: async ({ accessToken, accountId, videoUrl, caption }) => {
      if (!accountId) throw new Error('No Instagram Business account linked. Reconnect Instagram (a Business/Creator account linked to a Facebook Page is required).')
      const mk = new URLSearchParams({ media_type: 'REELS', video_url: videoUrl, caption: caption.slice(0, 2200), access_token: accessToken })
      const created = await fetch(`https://graph.facebook.com/v21.0/${accountId}/media?${mk}`, { method: 'POST' }).then((r) => r.json())
      const creationId = created?.id
      if (!creationId) throw new Error(`Instagram container: ${created?.error?.message || 'failed'}`)
      // Ingest can take a while for video; poll status_code until FINISHED (~90s).
      const ready = await pollUntil(async () => {
        const s = await fetch(`https://graph.facebook.com/v21.0/${creationId}?fields=status_code&access_token=${accessToken}`).then((r) => r.json()).catch(() => null)
        if (s?.status_code === 'FINISHED') return { ok: true }
        if (s?.status_code === 'ERROR') throw new Error('Instagram could not process the video.')
        return null
      }, 30, 3000)
      if (!ready) throw new Error('Instagram is still processing the video — try publishing again shortly.')
      const pub = await fetch(`https://graph.facebook.com/v21.0/${accountId}/media_publish?creation_id=${creationId}&access_token=${accessToken}`, { method: 'POST' }).then((r) => r.json())
      if (!pub?.id) throw new Error(`Instagram publish: ${pub?.error?.message || 'failed'}`)
      let permalink = 'https://www.instagram.com/'
      try { const m = await fetch(`https://graph.facebook.com/v21.0/${pub.id}?fields=permalink&access_token=${accessToken}`).then((r) => r.json()); if (m?.permalink) permalink = m.permalink } catch { /* best-effort */ }
      return { external_url: permalink }
    },
    stats: async ({ accessToken, accountId, externalUrl }) => {
      if (!accountId || !externalUrl) return null
      const list = await fetch(`https://graph.facebook.com/v21.0/${accountId}/media?fields=id,permalink,like_count,comments_count&limit=50&access_token=${accessToken}`)
        .then((x) => x.json()).catch(() => null)
      const m = ((list?.data ?? []) as Array<Record<string, unknown>>).find((x) => samePermalink(String(x.permalink ?? ''), externalUrl))
      if (!m?.id) return null
      const ins = await fetch(`https://graph.facebook.com/v21.0/${m.id}/insights?metric=views&access_token=${accessToken}`)
        .then((x) => x.json()).catch(() => null)
      const views = (ins?.data ?? []).find((d: { name?: string }) => d?.name === 'views')?.values?.[0]?.value
      return statsFrom({ ...m, views }, { views: 'views', likes: 'like_count', comments: 'comments_count' })
    },
  },
  linkedin: {
    label: 'LinkedIn', needs: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    configured: () => !!(env('LINKEDIN_CLIENT_ID') && env('LINKEDIN_CLIENT_SECRET')),
    authorizeUrl: (state) => {
      const p = new URLSearchParams({ response_type: 'code', client_id: env('LINKEDIN_CLIENT_ID')!, redirect_uri: REDIRECT(), scope: 'openid profile w_member_social', state })
      return `https://www.linkedin.com/oauth/v2/authorization?${p}`
    },
    exchange: async (code) => {
      const r = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT(), client_id: env('LINKEDIN_CLIENT_ID')!, client_secret: env('LINKEDIN_CLIENT_SECRET')! }),
      })
      if (!r.ok) throw new Error(`LinkedIn token ${r.status}`)
      return await r.json()
    },
    account: async (accessToken) => {
      try {
        const r = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } })
        if (r.ok) { const j = await r.json(); return { id: j.sub ?? '', label: j.name ? `LinkedIn · ${j.name}` : 'LinkedIn' } }
      } catch { /* fall through to default label */ }
      return { id: '', label: 'LinkedIn' }
    },
    // LinkedIn video post: initialize upload → PUT the bytes → finalize → create a
    // post referencing the video URN. Uses the versioned REST API (w_member_social).
    publish: async ({ accessToken, accountId, videoUrl, caption }) => {
      if (!accountId) throw new Error('No LinkedIn member id — reconnect LinkedIn.')
      const owner = `urn:li:person:${accountId}`
      const version = env('LINKEDIN_VERSION') || '202401'
      const h = { Authorization: `Bearer ${accessToken}`, 'LinkedIn-Version': version, 'X-Restli-Protocol-Version': '2.0.0', 'Content-Type': 'application/json' }
      // Pull the finished video into memory (short-form → a few MB, fine in edge).
      const vid = await fetch(videoUrl)
      if (!vid.ok) throw new Error('Could not read the video to upload.')
      const bytes = new Uint8Array(await vid.arrayBuffer())
      // 1) initialize
      const init = await fetch('https://api.linkedin.com/rest/videos?action=initializeUpload', {
        method: 'POST', headers: h,
        body: JSON.stringify({ initializeUploadRequest: { owner, fileSizeBytes: bytes.byteLength, uploadCaptions: false, uploadThumbnail: false } }),
      }).then((r) => r.json())
      const value = init?.value
      if (!value?.video || !value?.uploadInstructions?.length) throw new Error(`LinkedIn init: ${init?.message || 'failed'}`)
      // 2) upload each part, collecting ETags
      const partIds: string[] = []
      for (const ins of value.uploadInstructions) {
        const part = bytes.subarray(ins.firstByte, ins.lastByte + 1)
        const up = await fetch(ins.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/octet-stream' }, body: part })
        if (!up.ok) throw new Error(`LinkedIn upload part ${up.status}`)
        partIds.push(up.headers.get('etag') || up.headers.get('ETag') || '')
      }
      // 3) finalize
      const fin = await fetch('https://api.linkedin.com/rest/videos?action=finalizeUpload', {
        method: 'POST', headers: h,
        body: JSON.stringify({ finalizeUploadRequest: { video: value.video, uploadToken: value.uploadToken ?? '', uploadedPartIds: partIds } }),
      })
      if (!fin.ok) throw new Error(`LinkedIn finalize ${fin.status}`)
      // 4) create the post
      const post = await fetch('https://api.linkedin.com/rest/posts', {
        method: 'POST', headers: h,
        body: JSON.stringify({
          author: owner,
          commentary: caption.slice(0, 3000),
          visibility: 'PUBLIC',
          distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
          content: { media: { title: caption.slice(0, 100) || 'Video', id: value.video } },
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
        }),
      })
      if (!(post.status >= 200 && post.status < 300)) throw new Error(`LinkedIn post ${post.status}: ${(await post.text()).slice(0, 150)}`)
      const urn = post.headers.get('x-restli-id') || post.headers.get('x-linkedin-id') || ''
      return { external_url: urn ? `https://www.linkedin.com/feed/update/${urn}` : 'https://www.linkedin.com/feed/' }
    },
  },
}

// deno-lint-ignore no-explicit-any
type Db = any
// Publish ONE post via its owner's connection. Shared by the interactive
// `publish` action and the cron `publish_due` scan. Signs the render, calls the
// platform adapter, and records posted/external_url or the failure reason.
ADAPTERS.youtube.stats = async ({ accessToken, externalUrl }) => {
  const id = youtubeId(externalUrl)
  if (!id) return null
  const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${id}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    .then((x) => x.json()).catch(() => null)
  return statsFrom(r?.items?.[0]?.statistics ?? null, { views: 'viewCount', likes: 'likeCount', comments: 'commentCount' })
}

// ---- OUTSTAND (one API, managed platform apps) ------------------------------
const OUTSTAND_KEY = () => env('OUTSTAND_API_KEY') ?? ''
const viaOutstand = (platform: string) => !!OUTSTAND_KEY() && !!OUTSTAND_NETWORKS[platform]
async function outstand(path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> {
  const r = await fetch(`${OUTSTAND_API}${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${OUTSTAND_KEY()}`, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const text = await r.text()
  let j: unknown = null
  try { j = text ? JSON.parse(text) : null } catch { j = { raw: text.slice(0, 300) } }
  if (!r.ok) throw new Error(`outstand ${r.status}: ${text.slice(0, 200)}`)
  return j
}

// YouTube: comment threads on the video; she replied when a reply's author
// channel is hers (accountId is her channel id).
ADAPTERS.youtube.comments = async ({ accessToken, accountId, externalUrl }) => {
  const id = youtubeId(externalUrl)
  if (!id) return null
  const r = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&maxResults=100&order=time&videoId=${id}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    .then((x) => x.json()).catch(() => null)
  if (!Array.isArray(r?.items)) return null
  const mine = (s: { authorChannelId?: { value?: string } } | undefined) => !!accountId && s?.authorChannelId?.value === accountId
  // deno-lint-ignore no-explicit-any
  return r.items.map((t: any) => {
    const top = t?.snippet?.topLevelComment
    return {
      id: String(top?.id ?? t?.id ?? ''), text: String(top?.snippet?.textOriginal ?? ''), at: top?.snippet?.publishedAt ?? null,
      byOwner: mine(top?.snippet),
      // deno-lint-ignore no-explicit-any
      replies: (t?.replies?.comments ?? []).map((c: any) => ({ byOwner: mine(c?.snippet), text: c?.snippet?.textOriginal ?? null })),
    }
  }).filter((c: PlatformComment) => c.id)
}
// Instagram: comments on the matched media; she replied when a reply is from
// her own username.
ADAPTERS.instagram.comments = async ({ accessToken, accountId, externalUrl }) => {
  if (!accountId || !externalUrl) return null
  const [me, list] = await Promise.all([
    fetch(`https://graph.facebook.com/v21.0/${accountId}?fields=username&access_token=${accessToken}`).then((x) => x.json()).catch(() => null),
    fetch(`https://graph.facebook.com/v21.0/${accountId}/media?fields=id,permalink&limit=50&access_token=${accessToken}`).then((x) => x.json()).catch(() => null),
  ])
  const m = ((list?.data ?? []) as Array<Record<string, unknown>>).find((x) => samePermalink(String(x.permalink ?? ''), externalUrl))
  if (!m?.id || !me?.username) return null
  const c = await fetch(`https://graph.facebook.com/v21.0/${m.id}/comments?fields=id,text,username,timestamp,replies{username,text}&limit=100&access_token=${accessToken}`)
    .then((x) => x.json()).catch(() => null)
  if (!Array.isArray(c?.data)) return null
  // deno-lint-ignore no-explicit-any
  return c.data.map((x: any) => ({
    id: String(x?.id ?? ''), text: String(x?.text ?? ''), at: x?.timestamp ?? null,
    byOwner: x?.username === me.username,
    // deno-lint-ignore no-explicit-any
    replies: (x?.replies?.data ?? []).map((r: any) => ({ byOwner: r?.username === me.username, text: r?.text ?? null })),
  })).filter((x: PlatformComment) => x.id)
}

// ---- UNANSWERED QUESTIONS UNDER HER POSTS ----------------------------------
// Posts Twin published in the last 30 days, re-read at most every 12 hours.
// Only questions she never replied to are kept; the worker files them into her
// private brain. A post that cannot be matched is skipped, never guessed.
async function syncQuestions(admin: Db): Promise<{ posts: number; questions: number }> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const stale = new Date(Date.now() - 12 * 3_600_000).toISOString()
  const { data: rows } = await admin.from('posts')
    .select('id, owner_id, platform, external_url, external_post_id')
    .eq('status', 'posted').gte('posted_at', since)
    .or(`questions_synced_at.is.null,questions_synced_at.lt.${stale}`)
    .limit(15)
  let posts = 0, questions = 0
  for (const p of rows ?? []) {
    const ad = ADAPTERS[p.platform as string]
    await admin.from('posts').update({ questions_synced_at: new Date().toISOString() }).eq('id', p.id)
    try {
      const { data: conn } = await admin.from('platform_connections').select('*').eq('owner_id', p.owner_id).eq('platform', p.platform).maybeSingle()
      if (!conn?.access_token) continue
      let list: PlatformComment[] | null = null
      if (conn.provider === OUTSTAND_MARKER) {
        // Through Outstand only Instagram / LinkedIn expose comment text. Her
        // replies are not visible here, so only questions are kept.
        if (!insightStyle(p.platform as string).commentsReadable || !p.external_post_id || !OUTSTAND_KEY()) continue
        list = outstandComments(await outstand(`/posts/${encodeURIComponent(String(p.external_post_id))}/comments`))
          .map((c) => ({ id: c.id, text: c.text, at: c.at, byOwner: false, replies: [] }))
      } else {
        if (!ad?.comments || !TOKEN_KEY()) continue
        const accessToken = await decryptToken(conn.access_token as string, TOKEN_KEY(), p.owner_id as string, p.platform as string)
        list = await ad.comments({ accessToken, accountId: conn.external_account_id ?? '', externalUrl: p.external_url as string | null })
      }
      if (!list) continue
      const qs: PostQuestion[] = unansweredQuestions(list)
      const answered = herAnswers(list)
      posts++
      if (answered.length) {
        await admin.from('post_questions').upsert(answered.map((a) => ({
          owner_id: p.owner_id, post_id: p.id, platform: p.platform, external_comment_id: a.id,
          question: a.question.slice(0, 240), her_reply: a.reply, asked_at: a.at,
        })), { onConflict: 'platform,external_comment_id' }) // she may have answered since: overwrite
      }
      if (!qs.length) continue
      await admin.from('post_questions').upsert(qs.map((q) => ({
        owner_id: p.owner_id, post_id: p.id, platform: p.platform, external_comment_id: q.id, question: q.question.slice(0, 240), asked_at: q.at,
      })), { onConflict: 'platform,external_comment_id', ignoreDuplicates: true })
      questions += qs.length
    } catch { /* one post never stops the tick */ }
  }
  if (posts) console.log(JSON.stringify({ event: 'post_questions_sync', posts, questions }))
  return { posts, questions }
}

// ---- VIEWS BACK (the learning loop's real signal) --------------------------
// Posts Twin published in the last 30 days, re-read at most every 6 hours.
// Writes the numbers onto the post AND into `generation_outcomes` (24h / 7d
// windows) — the table the niche brain's learner already reads. A token that
// cannot be decrypted or a post that cannot be matched is skipped, never guessed.
/** Writes one reading onto the post and into generation_outcomes (24h / 7d). */
async function recordStats(admin: Db, p: { id: string; generation_id?: string | null; posted_at: string }, st: PostStats): Promise<void> {
  await admin.from('posts').update({
    views: st.views, likes: st.likes, comments: st.comments, stats_synced_at: new Date().toISOString(),
  }).eq('id', p.id)
  if (p.generation_id && st.views !== null) {
    const w = outcomeWindow(p.posted_at)
    const { data: existing } = await admin.from('generation_outcomes').select('id, views_24h, views_7d').eq('generation_id', p.generation_id).maybeSingle()
    const patch: Record<string, unknown> = { was_published: true }
    if (w.views_24h && existing?.views_24h == null) patch.views_24h = st.views
    if (w.views_7d && existing?.views_7d == null) patch.views_7d = st.views
    if (existing) await admin.from('generation_outcomes').update(patch).eq('id', existing.id)
    // Every generation already has an outcome row (0191); none means it is not ours to invent.
  }
}

async function syncStats(admin: Db): Promise<{ read: number; skipped: number }> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const stale = new Date(Date.now() - 6 * 3_600_000).toISOString()
  const { data: rows } = await admin.from('posts')
    .select('id, owner_id, platform, generation_id, external_url, external_post_id, posted_at, stats_synced_at')
    .eq('status', 'posted').gte('posted_at', since)
    .or(`stats_synced_at.is.null,stats_synced_at.lt.${stale}`)
    .limit(25)
  let read = 0, skipped = 0
  for (const p of rows ?? []) {
    const ad = ADAPTERS[p.platform as string]
    const stamp = () => admin.from('posts').update({ stats_synced_at: new Date().toISOString() }).eq('id', p.id)
    try {
      const { data: conn } = await admin.from('platform_connections').select('*').eq('owner_id', p.owner_id).eq('platform', p.platform).maybeSingle()
      if (!conn?.access_token) { skipped++; await stamp(); continue }
      if (conn.provider === OUTSTAND_MARKER) {
        const pid = (p as { external_post_id?: string | null }).external_post_id
        if (!pid || !OUTSTAND_KEY()) { skipped++; await stamp(); continue }
        const m = outstandMetrics(await outstand(`/posts/${encodeURIComponent(pid)}/analytics`))
        if (!p.external_url) {
          const u = outstandPostResult(await outstand(`/posts/${encodeURIComponent(pid)}`).catch(() => null)).url
          if (u) await admin.from('posts').update({ external_url: u }).eq('id', p.id)
        }
        if (!m) { skipped++; await stamp(); continue }
        await recordStats(admin, p, m)
        await admin.from('post_stat_snapshots').insert({ post_id: p.id, owner_id: p.owner_id, ...m })
        read++
        continue
      }
      if (!ad?.stats || !TOKEN_KEY()) { skipped++; await stamp(); continue }
      const accessToken = await decryptToken(conn.access_token as string, TOKEN_KEY(), p.owner_id as string, p.platform as string)
      const st = await ad.stats({ accessToken, accountId: conn.external_account_id ?? '', externalUrl: p.external_url as string | null, postedAt: p.posted_at as string })
      if (!st) { skipped++; await stamp(); continue }
      await recordStats(admin, p, st)
      read++
    } catch {
      skipped++; await stamp()
    }
  }
  if (read || skipped) console.log(JSON.stringify({ event: 'social_stats_sync', read, skipped }))
  return { read, skipped }
}

/** A signed link must outlive a hand-off: until the post time plus two days. */
function signSeconds(scheduledFor: string | null | undefined): number {
  const t = Date.parse(String(scheduledFor ?? ''))
  if (!Number.isFinite(t)) return 3600
  return Math.max(3600, Math.ceil((t - Date.now()) / 1000) + 2 * 86_400)
}

/** Publish now, or hand a future post (≤ 30 days) to Outstand's own scheduler. */
async function sendToOutstand(
  admin: Db,
  post: { id: string; platform: string; caption?: string | null; title?: string | null; scheduled_for?: string | null },
  conn: { external_account_id?: string | null },
  videoUrl: string,
  current: { editProjectId: string; outputAssetId: string } | null,
  handOff: boolean,
  failPost: (msg: string) => Promise<{ ok: boolean; error?: string }>,
): Promise<{ ok: boolean; error?: string; external_url?: string }> {
  if (!OUTSTAND_KEY()) return await failPost('Posting service is not configured')
  const lineage = { edit_project_id: current?.editProjectId ?? null, output_asset_id: current?.outputAssetId ?? null }
  try {
    const body = outstandPostBody(String(conn.external_account_id ?? ''), post.caption ?? '', videoUrl, {
      scheduledAt: handOff ? post.scheduled_for ?? null : null, platform: post.platform, title: post.title ?? post.caption?.slice(0, 90) ?? null,
    })
    let res: unknown
    try { res = await outstand('/posts', { method: 'POST', body }) } catch (e) {
      // An option Outstand does not know (the YouTube title key) must not cost the post.
      if (!body.youtube || !/400/.test(e instanceof Error ? e.message : '')) throw e
      delete body.youtube
      res = await outstand('/posts', { method: 'POST', body })
    }
    const r = outstandPostResult(res)
    if (!r.id) return await failPost(r.error ?? 'The posting service did not accept the video')
    const state = outstandStatus(r.status)
    await admin.from('posts').update(handOff || state === 'pending'
      ? { status: 'outstand_queued', external_post_id: r.id, external_url: r.url, error: null, ...lineage }
      : { status: state === 'failed' ? 'failed' : 'posted', posted_at: new Date().toISOString(), external_post_id: r.id, external_url: r.url, error: r.error, ...lineage },
    ).eq('id', post.id)
    return { ok: state !== 'failed', external_url: r.url ?? undefined, error: state === 'failed' ? r.error ?? 'Publish failed' : undefined }
  } catch (e) {
    return await failPost(e instanceof Error ? e.message : 'Publish failed')
  }
}

/** The 30-day queue engine: hand future posts to Outstand once they are within
 *  its window, and read back the ones already handed off. */
async function syncOutstandQueue(admin: Db): Promise<{ handed: number; settled: number }> {
  if (!OUTSTAND_KEY()) return { handed: 0, settled: 0 }
  let handed = 0, settled = 0
  const horizon = new Date(Date.now() + 30 * 86_400_000).toISOString()
  const { data: future } = await admin.from('posts')
    .select('id, owner_id, platform, generation_id, caption, title, media_path, scheduled_for, edit_project_id, output_asset_id')
    .eq('status', 'scheduled').gt('scheduled_for', new Date().toISOString()).lte('scheduled_for', horizon).limit(20)
  for (const p of future ?? []) {
    if (queueWindow(p.scheduled_for as string) !== 'hand_off') continue
    const { data: conn } = await admin.from('platform_connections').select('provider').eq('owner_id', p.owner_id).eq('platform', p.platform).maybeSingle()
    if (conn?.provider !== OUTSTAND_MARKER) continue
    const r = await publishOne(admin, p, { handOff: true })
    if (r.ok) handed++
  }
  const { data: queued } = await admin.from('posts').select('id, external_post_id, scheduled_for')
    .eq('status', 'outstand_queued').lte('scheduled_for', new Date().toISOString()).limit(25)
  for (const q of queued ?? []) {
    try {
      const r = outstandPostResult(await outstand(`/posts/${encodeURIComponent(String(q.external_post_id))}`))
      const state = outstandStatus(r.status)
      if (state === 'pending') continue
      await admin.from('posts').update(state === 'posted'
        ? { status: 'posted', posted_at: new Date().toISOString(), external_url: r.url }
        : { status: 'failed', error: (r.error ?? 'The platform rejected the post').slice(0, 300) }).eq('id', q.id)
      settled++
    } catch { /* read again next tick */ }
  }
  if (handed || settled) console.log(JSON.stringify({ event: 'outstand_queue', handed, settled }))
  return { handed, settled }
}

async function publishOne(admin: Db, post: { id: string; owner_id: string; platform: string; generation_id: string | null; caption?: string | null; edit_project_id?: string | null; output_asset_id?: string | null; media_path?: string | null; title?: string | null; scheduled_for?: string | null }, opts: { handOff?: boolean } = {}): Promise<{ ok: boolean; error?: string; external_url?: string; skipped?: boolean }> {
  const ad = ADAPTERS[post.platform]
  if (!ad) return { ok: false, error: 'Unknown platform' }
  // ATOMIC CLAIM — flip scheduled → posting and only proceed if THIS call won the
  // update. Two runners (a cron-tick overlap while a slow upload is in flight, a
  // double-click, or a retry) can no longer publish the same post twice: the
  // second one claims nothing and returns skipped.
  // Claim from 'scheduled' (cron/first publish) OR 'failed' (an explicit retry) —
  // but never from 'posting'/'posted', so a duplicate trigger is a no-op.
  const { data: claimed } = await admin
    .from('posts').update({ status: 'posting' })
    .eq('id', post.id).in('status', ['scheduled', 'failed'])
    .select('id').maybeSingle()
  if (!claimed) return { ok: false, error: 'Already being published', skipped: true }

  const failPost = async (msg: string) => {
    await admin.from('posts').update({ status: 'failed', error: msg.slice(0, 300) }).eq('id', post.id)
    return { ok: false, error: msg }
  }
  const { data: conn } = await admin.from('platform_connections').select('*').eq('owner_id', post.owner_id).eq('platform', post.platform).maybeSingle()
  if (!conn?.access_token) return await failPost(`${ad.label} not connected`)
  // ── A VIDEO SHE UPLOADED HERSELF (composer), not a Twin render. No approval
  // gate applies (nothing was generated), and only the posting service can
  // publish it.
  if (post.media_path && !post.generation_id) {
    if (conn.provider !== OUTSTAND_MARKER) return await failPost('Uploaded videos post through the posting service — reconnect this account')
    const { data: s1 } = await admin.storage.from('post-media').createSignedUrl(post.media_path, signSeconds(post.scheduled_for))
    if (!s1?.signedUrl) return await failPost('Could not read the uploaded video')
    return await sendToOutstand(admin, post, conn, s1.signedUrl, null, opts.handOff === true, failPost)
  }
  // PUBLISH-1 + APPROVAL-1. WHICH FILE GOES OUT, and whether it was cleared to.
  //
  // This signed `generations.edit_path` unconditionally. Every consequence
  // follows from that one line: an editor-v2 render could not be published at
  // all (no `edit_path`, so "No finished video to publish yet" on a video that
  // exists), and where a legacy path DID exist alongside a v2 render, the
  // legacy one was published — a different file from the one the creator
  // reviewed and a client approved.
  if (!post.generation_id) return await failPost('No finished video to publish yet')
  const { data: gen } = await admin
    .from('generations')
    .select('edit_path, approved, approved_output_asset_id, brand_voice_id')
    .eq('id', post.generation_id).eq('user_id', post.owner_id).maybeSingle()
  if (!gen) return await failPost('No finished video to publish yet')

  // WHAT THIS POST IS ABOUT, decided when it was scheduled — not now.
  //
  // `schedulePost` records the render the creator was looking at. If they
  // re-edited between then and now, `currentOutput` resolves to the NEW render,
  // and publishing that would quietly change what the scheduled post is about.
  // Nobody decided that; it is the passage of time doing it for them.
  //
  // So a BOUND post publishes what it was bound to. A post scheduled before
  // this existed carries NULL, which means "we did not record which" and NOT
  // "there is no video" — those resolve now, exactly as they always did.
  const current = post.output_asset_id && post.edit_project_id
    ? { editProjectId: post.edit_project_id, outputAssetId: post.output_asset_id }
    : await currentOutput(admin, post.generation_id!)

  // THE APPROVAL GATE, and it fails CLOSED on an explicit requirement only.
  //
  // `needs_approval` unset is not consent and is not refusal — a creator never
  // asked whether anyone signs off has not said that someone does, and blocking
  // their scheduled post on a question we failed to ask would invent a workflow
  // they never described. So this refuses only when the brand said `true`.
  //
  // When it does refuse, it refuses a SUPERSEDED approval too: approving one
  // render and publishing the next is the exact failure 0111 exists to make
  // visible, and it is worse than never approving because everyone believes it
  // was checked.
  // Via the GENERATION: `posts` carries no brand_voice_id, and the brand that
  // owns the approval policy is the one the video was made for.
  const { data: voice } = gen.brand_voice_id
    ? await admin.from('brand_voices').select('default_capability_flags')
        .eq('id', gen.brand_voice_id).maybeSingle()
    : { data: null }
  const needsApproval = (voice?.default_capability_flags as Record<string, unknown> | null)?.needs_approval
  if (needsApproval === true) {
    if (gen.approved !== true) return await failPost('This needs approval before it can be posted')
    const bound = gen.approved_output_asset_id
    if (!bound) {
      return await failPost('Approved before we recorded which version — re-approve it before posting')
    }
    if (!current || current.outputAssetId !== bound) {
      return await failPost('This video changed after it was approved — send it for approval again')
    }
  }

  const signedUrl = current
    ? await signOutput(admin, current.editProjectId, signSeconds(opts.handOff ? post.scheduled_for : null))
    : (gen.edit_path
        ? (await admin.storage.from('edits').createSignedUrl(gen.edit_path, signSeconds(opts.handOff ? post.scheduled_for : null))).data?.signedUrl ?? null
        : null)
  if (!current && !gen.edit_path) return await failPost('No finished video to publish yet')
  // A BOUND POST THAT CANNOT BE SIGNED FAILS. It does NOT fall back to the
  // generation's current render, which is the tempting repair and the wrong one:
  // silently substituting a different file is precisely what binding exists to
  // prevent, and a creator would learn about the substitution from their own
  // published feed. Failing is recoverable; publishing the wrong video is not.
  if (!signedUrl) {
    return await failPost(post.output_asset_id
      ? 'The video this post was scheduled from is no longer readable — re-schedule it from the current version'
      : 'Could not read the video file')
  }
  const signed = { signedUrl }
  if (conn.provider === OUTSTAND_MARKER) {
    return await sendToOutstand(admin, post, conn, signed.signedUrl, current, opts.handOff === true, failPost)
  }
  // A native connection cannot hold a post for later; only the posting service can.
  if (opts.handOff) return { ok: false, skipped: true }
  try {
    // Refresh a short-lived (YouTube) token before publishing so a next-day post
    // doesn't 401. Best-effort: on refresh failure we keep the old token and let
    // the publish surface the auth error (which flags the connection expired below).
    // DECRYPT BEFORE USE. A legacy plaintext row returns itself, so a creator
    // connected before encryption existed keeps posting; a row that fails to
    // decrypt throws, and failPost below records it rather than attempting a
    // publish with a token we cannot vouch for.
    let accessToken = await decryptToken(
      conn.access_token as string, TOKEN_KEY(), post.owner_id as string, post.platform as string)
    const expired = conn.token_expires_at && new Date(conn.token_expires_at as string) <= new Date()
    if (expired && conn.refresh_token && ad.refresh) {
      try {
        const storedRefresh = await decryptToken(
          conn.refresh_token as string, TOKEN_KEY(), post.owner_id as string, post.platform as string)
        const fresh = await ad.refresh(storedRefresh)
        accessToken = fresh.access_token
        // The refresh is also where a LEGACY PLAINTEXT ROW gets converted: the
        // new token is written encrypted regardless of how the old one was
        // stored, so the plaintext population drains without a backfill that
        // could half-succeed and cost someone their connection.
        await admin.from('platform_connections').update({
          access_token: await encryptToken(fresh.access_token, TOKEN_KEY(), post.owner_id as string, post.platform as string),
          ...(fresh.expires_at ? { token_expires_at: fresh.expires_at } : {}), status: 'connected',
        }).eq('id', conn.id)
      } catch { /* fall through with the stale token */ }
    }
    const res = await ad.publish({ accessToken, accountId: conn.external_account_id ?? '', videoUrl: signed.signedUrl, title: (post.caption ?? 'New video').slice(0, 90), caption: post.caption ?? '' })
    // PUBLISH-1: RECORD WHAT WENT OUT, not merely that something did.
    //
    // `posts.edit_project_id` and `posts.output_asset_id` were added by 0098 —
    // its column comment calls the first one "THE join key" — and nothing has
    // ever written either. So a published post could not be traced back to the
    // render it published, which is what LEARNING-1 needs to attribute an
    // outcome to a decision, and what a dispute needs to answer "what did you
    // actually post".
    //
    // Written at the moment of success and from the SAME `current` used to sign
    // the URL, so the record cannot describe a different file from the one the
    // platform received. Null for a legacy publish, which is honest: those have
    // no v2 lineage to record.
    await admin.from('posts').update({
      status: 'posted',
      posted_at: new Date().toISOString(),
      external_url: res.external_url,
      edit_project_id: current?.editProjectId ?? null,
      output_asset_id: current?.outputAssetId ?? null,
    }).eq('id', post.id)
    return { ok: true, external_url: res.external_url }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Publish failed'
    // An auth/expiry failure means the stored token is dead — flag the connection
    // so the UI stops showing "Connected · post now" and prompts a reconnect.
    if (/\b401\b|unauthor|expired|invalid[_ ]?(grant|token)|token has been expired/i.test(msg)) {
      await admin.from('platform_connections').update({ status: 'expired' }).eq('owner_id', post.owner_id).eq('platform', post.platform)
    }
    return await failPost(msg)
  }
}

/**
 * The generation's CURRENT editor-v2 output, by the one rule the whole product
 * now uses: newest completion wins, id breaking a tie.
 *
 * `review/index.ts`, `resolveFinishedOutputs` and `set_generation_approval`
 * order this identically, and they must: the video a reviewer WATCHES, the
 * asset an approval BINDS to, and the file that gets PUBLISHED have to be the
 * same render or the approval means nothing.
 */
async function currentOutput(
  admin: ReturnType<typeof createClient>, generationId: string,
): Promise<{ editProjectId: string; outputAssetId: string } | null> {
  const { data } = await admin
    .from('edit_projects')
    .select('id, output_asset_id')
    .eq('generation_id', generationId)
    .eq('status', 'completed')
    .not('output_asset_id', 'is', null)
    .order('completed_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data?.id || !data.output_asset_id) return null
  return { editProjectId: data.id, outputAssetId: data.output_asset_id }
}

/** A signed URL for a completed project's video, or null if it is not READY. */
async function signOutput(
  admin: ReturnType<typeof createClient>, editProjectId: string, seconds = 3600,
): Promise<string | null> {
  const { data: out } = await admin
    .from('edit_outputs')
    .select('storage_bucket, storage_path, state, kind')
    .eq('edit_project_id', editProjectId).eq('kind', 'video').maybeSingle()
  // READY MEANS PROBED. Publishing a reserved-but-not-ready row would push
  // bytes that may not exist to a platform, where it cannot be taken back.
  if (!out || out.state !== 'ready') return null
  const { data: signed } = await admin.storage
    .from(out.storage_bucket).createSignedUrl(out.storage_path, seconds)
  return signed?.signedUrl ?? null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = new URL(req.url)
  const admin = createClient(env('SUPABASE_URL')!, serviceKeyFrom(Deno.env))

  // ---- Cron: publish all due scheduled posts (internal, shared-secret auth) ---
  // Called on a schedule by pg_cron with the x-cron-secret header. Publishes every
  // post whose scheduled_for has passed. No user JWT — this runs across all owners.
  // (Read the body once, up front, so the condition below stays a simple boolean —
  // a prior version tried to inline the async body-read inside the `if` condition
  // itself and had a mismatched paren, which silently broke the whole check and
  // made every cron call fall through to the "not authenticated" 401 path.)
  const cronHeader = req.headers.get('x-cron-secret')
  const cronBody = cronHeader ? await req.clone().json().catch(() => ({} as { action?: string })) : null
  if (url.searchParams.get('action') === 'publish_due' || cronBody?.action === 'publish_due') {
    const secret = env('CRON_SECRET')
    if (!secret || cronHeader !== secret) return json({ error: 'Forbidden' }, 403)
    const { data: due } = await admin
      .from('posts')
      .select('id, owner_id, platform, generation_id, caption, title, media_path, scheduled_for, edit_project_id, output_asset_id')
      .eq('status', 'scheduled')
      .lte('scheduled_for', new Date().toISOString())
      .limit(25)
    let published = 0, failed = 0, skipped = 0
    for (const p of due ?? []) {
      const r = await publishOne(admin, p)
      if (r.ok) published++; else if (r.skipped) skipped++; else failed++
    }
    // Same cron tick: read views back for recently published posts.
    const stats = await syncStats(admin).catch(() => ({ read: 0, skipped: 0 }))
    const questions = await syncQuestions(admin).catch(() => ({ posts: 0, questions: 0 }))
    const queue = await syncOutstandQueue(admin).catch(() => ({ handed: 0, settled: 0 }))
    return json({ ok: true, published, failed, skipped, scanned: (due ?? []).length, stats, questions, queue })
  }

  // ---- OAuth callback (browser redirect, no JWT) ----------------------------
  if (url.searchParams.get('action') === 'callback') {
    const back = (q: string) => Response.redirect(`${appUrl()}/calendar?${q}`, 302)
    try {
      const code = url.searchParams.get('code')
      const st = url.searchParams.get('state')
      const session = url.searchParams.get('session') ?? url.searchParams.get('sessionToken') ?? url.searchParams.get('session_token')
      if (session && st && OUTSTAND_KEY()) {
        const { data: nonce } = await admin.from('oauth_nonce').delete().eq('nonce', st)
          .select('owner_id, platform, created_at').maybeSingle()
        if (!nonce) return back('connect_error=state')
        if (Date.now() - new Date(nonce.created_at).getTime() > NONCE_TTL_MS) return back('connect_error=expired')
        const network = OUTSTAND_NETWORKS[nonce.platform]
        if (!network) return back('connect_error=unconfigured')
        const offered = outstandAccounts(await outstand(`/social-accounts/pending/${encodeURIComponent(session)}`))
        const chosen = pickAccounts(offered, network)
        if (!chosen.length) return back('connect_error=no_account')
        // The live API takes `accounts` (the docs' `socialAccountIds` is rejected).
        const done = outstandAccounts(await outstand(`/social-accounts/pending/${encodeURIComponent(session)}/finalize`, {
          method: 'POST', body: { accounts: chosen.map((a) => a.id) },
        }))
        const acc = pickAccounts(done.length ? done : chosen, network)[0]
        await admin.from('platform_connections').upsert({
          owner_id: nonce.owner_id, platform: nonce.platform,
          account_label: `${ADAPTERS[nonce.platform]?.label ?? nonce.platform}${acc.username ? ` · ${acc.username}` : ''}`,
          external_account_id: acc.id,
          // No platform token is held by Twin on this path: Outstand holds it.
          access_token: OUTSTAND_MARKER, refresh_token: null, token_expires_at: null,
          provider: OUTSTAND_MARKER, username: acc.username, avatar_url: acc.avatar,
          status: 'connected', updated_at: new Date().toISOString(),
        }, { onConflict: 'owner_id,platform' })
        return back(`connected=${nonce.platform}`)
      }
      if (!code || !st) return back('connect_error=missing')
      // Atomically CONSUME the nonce (delete-returning): a replay finds no row, and
      // owner_id/platform come from the stored row, never from the redirect.
      const { data: nonce } = await admin
        .from('oauth_nonce')
        .delete()
        .eq('nonce', st)
        .select('owner_id, platform, created_at')
        .maybeSingle()
      if (!nonce) return back('connect_error=state')
      if (Date.now() - new Date(nonce.created_at).getTime() > NONCE_TTL_MS) return back('connect_error=expired')
      const ad = ADAPTERS[nonce.platform]
      if (!ad || !ad.configured()) return back('connect_error=unconfigured')
      // FAIL CLOSED ON A MISSING KEY. Without it the only alternatives are
      // storing the token in plaintext — reintroducing the exact defect — or
      // pretending the connection succeeded. Refusing to connect is the honest
      // third option, and it is loud enough to be fixed in minutes.
      if (!TOKEN_KEY()) return back('connect_error=unconfigured')
      const tok = await ad.exchange(code)
      let acc = { id: '', label: ad.label }
      try { acc = await ad.account(tok.access_token) } catch { /* label is best-effort */ }
      await admin.from('platform_connections').upsert({
        owner_id: nonce.owner_id,
        platform: nonce.platform,
        account_label: acc.label,
        external_account_id: acc.id || null,
        access_token: await encryptToken(tok.access_token, TOKEN_KEY(), nonce.owner_id, nonce.platform),
        refresh_token: tok.refresh_token
          ? await encryptToken(tok.refresh_token, TOKEN_KEY(), nonce.owner_id, nonce.platform)
          : null,
        token_expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
        status: 'connected',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'owner_id,platform' })
      return back(`connected=${nonce.platform}`)
    } catch (e) {
      console.error('social: oauth callback failed', e)
      return Response.redirect(`${appUrl()}/calendar?connect_error=connect_failed`, 302)
    }
  }

  // ---- Authenticated actions ------------------------------------------------
  const userClient = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Not authenticated' }, 401)

  let body: { action?: string; platform?: string; post_id?: string } = {}
  try { body = await req.json() } catch { /* GET-less actions only */ }
  const action = body.action ?? ''
  const platform = (body.platform ?? '').toLowerCase()

  if (action === 'start') {
    const ad = ADAPTERS[platform]
    if (!ad) return json({ error: 'Unknown platform' }, 400)
    if (viaOutstand(platform)) {
      const state = newNonce()
      await admin.from('oauth_nonce').insert({ nonce: state, owner_id: user.id, platform })
      try {
        const res = await outstand(`/social-networks/${OUTSTAND_NETWORKS[platform]}/auth-url`, {
          method: 'POST', body: { redirect_uri: `${REDIRECT()}&state=${state}` },
        })
        const link = outstandAuthUrl(res)
        if (!link) { console.error('social: outstand auth-url had no url', JSON.stringify(res).slice(0, 300)); return json({ error: 'Could not start the connection' }, 502) }
        return json({ url: link })
      } catch (e) {
        console.error('social: outstand auth-url failed', e instanceof Error ? e.message : e)
        return json({ error: 'Could not start the connection' }, 502)
      }
    }
    if (!ad.configured()) return json({ unconfigured: true, platform, needs: ad.needs })
    // Mint a single-use nonce bound to THIS authenticated user; the callback consumes
    // it and trusts the stored owner_id, never the redirect. Best-effort GC of old
    // nonces keeps the table from growing.
    const state = newNonce()
    await admin.from('oauth_nonce').insert({ nonce: state, owner_id: user.id, platform })
    void admin.from('oauth_nonce').delete().lt('created_at', new Date(Date.now() - NONCE_TTL_MS).toISOString())
    return json({ url: ad.authorizeUrl(state) })
  }

  if (action === 'disconnect') {
    await admin.from('platform_connections').delete().eq('owner_id', user.id).eq('platform', platform)
    return json({ ok: true })
  }

  if (action === 'publish') {
    const postId = body.post_id
    if (!postId) return json({ error: 'Missing post_id' }, 400)
    // Ownership: the post row must be the caller's (publishOne re-verifies the
    // generation belongs to post.owner_id before signing its render).
    const { data: post } = await admin.from('posts').select('id, owner_id, platform, generation_id, caption, title, media_path, scheduled_for, edit_project_id, output_asset_id').eq('id', postId).eq('owner_id', user.id).maybeSingle()
    if (!post) return json({ error: 'Post not found' }, 404)
    const r = await publishOne(admin, post)
    if (!r.ok) return json({ error: r.error ?? 'Publish failed.' }, 502)
    return json({ ok: true, external_url: r.external_url })
  }

  // ---- INSIGHTS: one post's numbers and comments, shaped by what the network gives.
  if (action === 'insights') {
    const postId = body.post_id
    if (!postId) return json({ error: 'Missing post_id' }, 400)
    const { data: p } = await admin.from('posts').select('id, owner_id, platform, external_post_id, views, likes, comments')
      .eq('id', postId).eq('owner_id', user.id).maybeSingle()
    if (!p) return json({ error: 'Post not found' }, 404)
    const style = insightStyle(p.platform as string)
    const { data: history } = await admin.from('post_stat_snapshots')
      .select('taken_at, views, likes, comments, shares, saves, impressions').eq('post_id', p.id).order('taken_at').limit(200)
    let latest: OutstandMetricSet | null = null
    let comments: unknown[] | null = null
    const { data: conn } = await admin.from('platform_connections').select('provider').eq('owner_id', user.id).eq('platform', p.platform).maybeSingle()
    if (conn?.provider === OUTSTAND_MARKER && p.external_post_id && OUTSTAND_KEY()) {
      latest = outstandMetrics(await outstand(`/posts/${encodeURIComponent(String(p.external_post_id))}/analytics`).catch(() => null))
      if (style.commentsReadable) {
        comments = outstandComments(await outstand(`/posts/${encodeURIComponent(String(p.external_post_id))}/comments`).catch(() => null))
      }
    }
    return json({
      platform: p.platform, chart: style.chart, commentsReadable: style.commentsReadable,
      latest: latest ?? { views: p.views, likes: p.likes, comments: p.comments, shares: null, saves: null, impressions: null },
      history: history ?? [], comments,
    })
  }

  return json({ error: 'Unknown action' }, 400)
})
