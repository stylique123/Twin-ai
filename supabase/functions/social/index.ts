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

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const env = (k: string) => Deno.env.get(k)
const fnBase = () => `${env('SUPABASE_URL')}/functions/v1/social`
const appUrl = () => (env('APP_URL') ?? '').replace(/\/+$/, '')

// --- signed state (platform + user, HMAC over the service role key) ----------
async function hmac(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env('SUPABASE_SERVICE_ROLE_KEY')!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
async function signState(platform: string, userId: string): Promise<string> {
  const body = `${platform}:${userId}:${Date.now()}`
  return `${btoa(body)}.${await hmac(body)}`
}
async function readState(state: string): Promise<{ platform: string; userId: string } | null> {
  const [b64, sig] = state.split('.')
  if (!b64 || !sig) return null
  const body = atob(b64)
  if ((await hmac(body)) !== sig) return null
  const [platform, userId] = body.split(':')
  return { platform, userId }
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
  tiktok: {
    label: 'TikTok', needs: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
    configured: () => !!(env('TIKTOK_CLIENT_KEY') && env('TIKTOK_CLIENT_SECRET')),
    authorizeUrl: (state) => {
      const p = new URLSearchParams({ client_key: env('TIKTOK_CLIENT_KEY')!, redirect_uri: REDIRECT(), response_type: 'code', scope: 'video.publish,video.upload', state })
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
  },
  instagram: {
    label: 'Instagram', needs: ['META_APP_ID', 'META_APP_SECRET'],
    configured: () => !!(env('META_APP_ID') && env('META_APP_SECRET')),
    authorizeUrl: (state) => {
      const p = new URLSearchParams({ client_id: env('META_APP_ID')!, redirect_uri: REDIRECT(), response_type: 'code', scope: 'instagram_basic,instagram_content_publish,pages_show_list', state })
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
async function publishOne(admin: Db, post: { id: string; owner_id: string; platform: string; generation_id: string; caption?: string | null }): Promise<{ ok: boolean; error?: string; external_url?: string; skipped?: boolean }> {
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
  const { data: gen } = await admin.from('generations').select('edit_path').eq('id', post.generation_id).eq('user_id', post.owner_id).maybeSingle()
  if (!gen?.edit_path) return await failPost('No finished video to publish yet')
  const { data: signed } = await admin.storage.from('edits').createSignedUrl(gen.edit_path, 3600)
  if (!signed?.signedUrl) return await failPost('Could not read the video file')
  try {
    // Refresh a short-lived (YouTube) token before publishing so a next-day post
    // doesn't 401. Best-effort: on refresh failure we keep the old token and let
    // the publish surface the auth error (which flags the connection expired below).
    let accessToken = conn.access_token as string
    const expired = conn.token_expires_at && new Date(conn.token_expires_at as string) <= new Date()
    if (expired && conn.refresh_token && ad.refresh) {
      try {
        const fresh = await ad.refresh(conn.refresh_token as string)
        accessToken = fresh.access_token
        await admin.from('platform_connections').update({ access_token: fresh.access_token, ...(fresh.expires_at ? { token_expires_at: fresh.expires_at } : {}), status: 'connected' }).eq('id', conn.id)
      } catch { /* fall through with the stale token */ }
    }
    const res = await ad.publish({ accessToken, accountId: conn.external_account_id ?? '', videoUrl: signed.signedUrl, title: (post.caption ?? 'New video').slice(0, 90), caption: post.caption ?? '' })
    await admin.from('posts').update({ status: 'posted', posted_at: new Date().toISOString(), external_url: res.external_url }).eq('id', post.id)
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = new URL(req.url)
  const admin = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!)

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
      .select('id, owner_id, platform, generation_id, caption')
      .eq('status', 'scheduled')
      .lte('scheduled_for', new Date().toISOString())
      .limit(25)
    let published = 0, failed = 0, skipped = 0
    for (const p of due ?? []) {
      const r = await publishOne(admin, p)
      if (r.ok) published++; else if (r.skipped) skipped++; else failed++
    }
    return json({ ok: true, published, failed, skipped, scanned: (due ?? []).length })
  }

  // ---- OAuth callback (browser redirect, no JWT) ----------------------------
  if (url.searchParams.get('action') === 'callback') {
    const back = (q: string) => Response.redirect(`${appUrl()}/calendar?${q}`, 302)
    try {
      const code = url.searchParams.get('code')
      const st = url.searchParams.get('state')
      if (!code || !st) return back('connect_error=missing')
      const parsed = await readState(st)
      if (!parsed) return back('connect_error=state')
      const ad = ADAPTERS[parsed.platform]
      if (!ad || !ad.configured()) return back('connect_error=unconfigured')
      const tok = await ad.exchange(code)
      let acc = { id: '', label: ad.label }
      try { acc = await ad.account(tok.access_token) } catch { /* label is best-effort */ }
      await admin.from('platform_connections').upsert({
        owner_id: parsed.userId,
        platform: parsed.platform,
        account_label: acc.label,
        external_account_id: acc.id || null,
        access_token: tok.access_token,
        refresh_token: tok.refresh_token ?? null,
        token_expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
        status: 'connected',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'owner_id,platform' })
      return back(`connected=${parsed.platform}`)
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
    if (!ad.configured()) return json({ unconfigured: true, platform, needs: ad.needs })
    const state = await signState(platform, user.id)
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
    const { data: post } = await admin.from('posts').select('id, owner_id, platform, generation_id, caption').eq('id', postId).eq('owner_id', user.id).maybeSingle()
    if (!post) return json({ error: 'Post not found' }, 404)
    const r = await publishOne(admin, post)
    if (!r.ok) return json({ error: r.error ?? 'Publish failed.' }, 502)
    return json({ ok: true, external_url: r.external_url })
  }

  return json({ error: 'Unknown action' }, 400)
})
