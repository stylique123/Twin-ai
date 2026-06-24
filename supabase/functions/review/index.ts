// Supabase Edge Function: review
// Login-free CLIENT APPROVAL for a finished video. An agency shares
// /review/:token; the client watches the rendered reel, reads the script, and
// approves or requests changes — no account, no app access.
//
//   POST { action:"get", token }                 -> { brand, hook, script[], video_url, thumb_url, status, note, reference_url, created_at } | 404
//   POST { action:"submit", token, decision, note } -> { ok, status }   decision: "approved" | "changes"
//   (GET ?token=… also returns the payload, for direct/no-JS access.)
//
// verify_jwt = false (config.toml): the client has no Supabase JWT. The
// unguessable review_token IS the access control (mirrors the brand_report
// client-report links). Service role is used ONLY to look up that one row by its
// token and to sign the private edits-bucket media — never to expose anything the
// token doesn't point at.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const env = (k: string) => Deno.env.get(k)

const admin = () =>
  createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

async function sign(db: ReturnType<typeof admin>, path: string | null, seconds = 60 * 60 * 24): Promise<string | null> {
  if (!path) return null
  const { data } = await db.storage.from('edits').createSignedUrl(path, seconds)
  return data?.signedUrl ?? null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const db = admin()

  try {
    // Read the request once: GET carries the token in the query; POST carries an
    // action in the body (so the frontend can use supabase.functions.invoke).
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const action = req.method === 'GET' ? 'get' : String(body.action ?? 'get')

    if (action === 'get') {
      const token = (req.method === 'GET'
        ? new URL(req.url).searchParams.get('token')
        : String(body.token ?? ''))?.trim()
      if (!token) return json({ error: 'missing token' }, 400)
      const { data: g } = await db
        .from('generations')
        .select('id, blueprint, selected_hook, edit_path, thumb_path, reference_url, review_status, review_note, created_at, brand_voice_id')
        .eq('review_token', token)
        .maybeSingle()
      if (!g) return json({ error: 'not_found' }, 404)

      let brand = 'Your brand'
      let brand_logo: string | null = null
      if (g.brand_voice_id) {
        const { data: bv } = await db
          .from('brand_voices')
          .select('label, handle, brand_kit')
          .eq('id', g.brand_voice_id)
          .maybeSingle()
        brand = (bv?.label && bv.label.trim()) || (bv?.handle ? `@${bv.handle}` : brand)
        // White-label: show the CLIENT's own logo (from their brand kit) so the
        // approval page reads as the agency's, not TwinAI's.
        const logoPath = (bv?.brand_kit as { logo_path?: string } | null)?.logo_path
        if (logoPath) brand_logo = await sign(db, logoPath)
      }

      const bp = (g.blueprint ?? {}) as Record<string, unknown>
      const hook =
        (g.selected_hook && String(g.selected_hook)) ||
        (Array.isArray(bp.hook_options) && bp.hook_options.length ? String((bp.hook_options as unknown[])[0]) : '')
      const script = Array.isArray(bp.script) ? (bp.script as unknown[]).map((l) => String(l)) : []

      return json({
        brand,
        brand_logo,
        hook,
        script,
        reference_url: g.reference_url ?? null,
        video_url: await sign(db, g.edit_path),
        thumb_url: await sign(db, g.thumb_path),
        status: g.review_status ?? 'pending',
        note: g.review_note ?? null,
        created_at: g.created_at,
      })
    }

    if (action === 'submit') {
      const token = String(body.token ?? '').trim()
      const decision = String(body.decision ?? '')
      const note = body.note ? String(body.note).slice(0, 2000) : null
      if (!token) return json({ error: 'missing token' }, 400)
      if (decision !== 'approved' && decision !== 'changes') return json({ error: 'bad decision' }, 400)

      // Look the row up by token first so we only ever touch the one it points at.
      const { data: g } = await db.from('generations').select('id, user_id').eq('review_token', token).maybeSingle()
      if (!g) return json({ error: 'not_found' }, 404)

      const { error } = await db
        .from('generations')
        .update({
          review_status: decision,
          review_note: note,
          reviewed_at: new Date().toISOString(),
          approved: decision === 'approved',
        })
        .eq('id', g.id)
      if (error) return json({ error: 'update_failed' }, 500)

      // Notify the agency owner of the client's decision (covers them being away).
      await db.from('notifications').insert({
        user_id: g.user_id,
        type: decision === 'approved' ? 'review_approved' : 'review_changes',
        title: decision === 'approved' ? 'A client approved your video' : 'A client requested changes',
        body: note ? note.slice(0, 140) : (decision === 'approved' ? 'Tap to view the approved video.' : 'Tap to see the requested changes.'),
        link: `/result/${g.id}`,
      }).then(() => {}, () => {})

      return json({ ok: true, status: decision })
    }

    return json({ error: 'method not allowed' }, 405)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'error' }, 500)
  }
})
