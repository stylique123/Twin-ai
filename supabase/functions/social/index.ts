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
  account: (accessToken: string) => Promise<{ id: string; label: string }>
  publish: (a: { accessToken: string; videoUrl: string; title: string; caption: string }) => Promise<{ external_url: string }>
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
    account: async () => ({ id: '', label: 'TikTok' }),
    publish: async () => { throw new Error('TikTok content publishing requires app review; connect is ready, posting unlocks on approval.') },
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
      return await r.json()
    },
    account: async () => ({ id: '', label: 'Instagram' }),
    publish: async () => { throw new Error('Instagram publishing requires a Business account + app review; connect is ready, posting unlocks on approval.') },
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
    publish: async () => { throw new Error('LinkedIn video publishing requires app review (w_member_social); connect is ready, posting unlocks on approval.') },
  },
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = new URL(req.url)
  const admin = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!)

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
      return Response.redirect(`${appUrl()}/calendar?connect_error=${encodeURIComponent(String(e).slice(0, 80))}`, 302)
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
    const { data: post } = await admin.from('posts').select('*').eq('id', postId).eq('owner_id', user.id).maybeSingle()
    if (!post) return json({ error: 'Post not found' }, 404)
    const ad = ADAPTERS[post.platform]
    if (!ad) return json({ error: 'Unknown platform' }, 400)
    const { data: conn } = await admin.from('platform_connections').select('*').eq('owner_id', user.id).eq('platform', post.platform).maybeSingle()
    if (!conn?.access_token) return json({ error: `Connect your ${ad.label} account first.` }, 400)

    // The finished render lives in storage on the generation; sign a short URL.
    const { data: gen } = await admin.from('generations').select('edit_path').eq('id', post.generation_id).maybeSingle()
    if (!gen?.edit_path) return json({ error: 'This post has no finished video to publish yet.' }, 400)
    const { data: signed } = await admin.storage.from('renders').createSignedUrl(gen.edit_path, 600)
    if (!signed?.signedUrl) return json({ error: 'Could not read the video file.' }, 500)

    try {
      const res = await ad.publish({ accessToken: conn.access_token, videoUrl: signed.signedUrl, title: (post.caption ?? 'New video').slice(0, 90), caption: post.caption ?? '' })
      await admin.from('posts').update({ status: 'posted', posted_at: new Date().toISOString(), external_url: res.external_url }).eq('id', postId)
      return json({ ok: true, external_url: res.external_url })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Publish failed.' }, 502)
    }
  }

  return json({ error: 'Unknown action' }, 400)
})
