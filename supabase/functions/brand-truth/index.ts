// Supabase Edge Function: brand-truth
//
// C3 — THE READERS EXISTED AND THE WRITER DID NOT.
//
// `BrandTruthSnapshotV1`, its projection, its validator, its canonical form and
// the `brand_truth_snapshots` table (0095) have all shipped. So has the
// consumer: `creativeTransferPlan.ts` pins `brandTruthSnapshotId` and
// `brandTruthSha256` and refuses a plan whose digests the server did not issue.
//
// Nothing ever issued one. The ledger calls this "the sharpest instance of the
// system that exists but does not connect", and it is worse than an absent
// feature — the plan validator's mismatch checks have never been able to fire,
// so the lineage they enforce has been decorative since the day it landed.
//
// This is the writer.
//
// ── WHY THE SERVER PROJECTS, RATHER THAN STORING A CLIENT'S PROJECTION ────
//
// 0095 says it plainly, and its grants back it up: `brand_truth_snapshots` has
// no INSERT policy for any role, so only service_role can write, "because a
// client that could insert one could assert its own brand truth, which is
// authority level 1."
//
// A projection accepted over the wire is exactly that insert wearing a hat. So
// this function reads `profiles.dna` and the `brand_voices` row ITSELF, with the
// service key, and the request body carries nothing but which brand voice to
// project. Everything a caller sends is a selector; nothing a caller sends
// becomes content.
//
// ── IDEMPOTENT BY DIGEST, WHICH IS WHY THE COPY MUST BE EXACT ─────────────
//
// 0095's unique index on `(owner_id, snapshot_sha256)` encodes the rule:
// "re-projecting an unchanged brand must REUSE the snapshot rather than
// accumulate duplicates." So this looks the digest up before inserting, and
// reports which happened.
//
// That rule is only as good as the projection being deterministic across every
// place it runs. `_shared/brandTruth.ts` is a byte-for-byte copy of the shared
// module and `check_brand_truth_parity.mjs` fails the build if it stops being —
// because a drifted copy would hash one brand two ways, silently end the reuse,
// and leave every plan pinning whichever copy produced its digest.
//
//   POST { brand_voice_id? }  ->  { id, sha256, reused }
//
// `brand_voice_id` omitted means the creator's default voice. A creator with no
// brand voice at all is NOT an error: they have a `profiles.dna` and the
// projection is defined for it, so the snapshot records what is known and marks
// the rest absent with a reason, which is the whole point of the type.
import { createClient } from 'jsr:@supabase/supabase-js@2.112.2'
import {
  BrandTruthError, canonicalBrandTruth, projectBrandTruth, validateBrandTruthSnapshot,
  type BrandTruthSources,
} from '../_shared/brandTruth.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const url = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''
  // The USER client establishes who is asking. It is used for nothing else —
  // every read below goes through `admin`, because the projection must see the
  // real stored rows rather than whatever RLS would let the caller see.
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Not authenticated' }, 401)

  const body = await req.json().catch(() => ({} as { brand_voice_id?: string }))
  const requestedVoice = typeof body.brand_voice_id === 'string' ? body.brand_voice_id : null

  // OWNERSHIP IS RE-ESTABLISHED HERE. `admin` bypasses RLS, so a brand voice id
  // is only usable if the row's owner is the caller — otherwise a creator could
  // project, persist and later cite somebody else's brand as their own truth.
  // `brand_voices` KEYS ON `owner_id`, NOT `user_id`. The first version of this
  // function used `user_id` — a column that does not exist on that table — and
  // then DISCARDED the error, so the explicit-id path always 404'd and the
  // default path silently projected a snapshot with no brand data in it at all.
  // The wrong column was survivable; swallowing the error is what made it
  // invisible, so the error is read below rather than dropped.
  let voice: Record<string, unknown> | null = null
  if (requestedVoice) {
    const { data, error } = await admin
      .from('brand_voices')
      .select('id, owner_id, profile, brand_kit')
      .eq('id', requestedVoice)
      .eq('owner_id', user.id)
      .maybeSingle()
    // A FAILED LOOKUP IS NOT AN ABSENT ROW. Reporting a query error as "no such
    // brand voice" is exactly how the column-name bug hid: the caller sees a
    // plausible 404 and nothing anywhere says the read never worked.
    if (error) return json({ error: 'Could not read the brand voice', code: 'brand_voice_read_failed' }, 500)
    // Deliberately the same answer as a nonexistent id: a distinct "not yours"
    // would let anyone probe which brand voices exist.
    if (!data) return json({ error: 'No such brand voice' }, 404)
    voice = data as Record<string, unknown>
  } else {
    const { data, error } = await admin
      .from('brand_voices')
      .select('id, owner_id, profile, brand_kit, is_default')
      .eq('owner_id', user.id)
      .order('is_default', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return json({ error: 'Could not read the brand voice', code: 'brand_voice_read_failed' }, 500)
    voice = (data as Record<string, unknown> | null) ?? null
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('dna')
    .eq('id', user.id)
    .maybeSingle()

  const kit = (voice?.brand_kit ?? null) as BrandTruthSources['brandKit']
  const sources: BrandTruthSources = {
    ownerId: user.id,
    brandVoiceId: (voice?.id as string | undefined) ?? null,
    // `profiles.dna` — self-reported, authority level 2.
    selfReported: ((profile?.dna ?? null) as Record<string, unknown> | null),
    // The RAW stored synthesis object, NOT projected through `VoiceProfile`.
    // The Batch A audit found the interface is not on the write path, so reading
    // it through the type would make `editing_style` invisible by construction.
    synthesized: ((voice?.profile ?? null) as Record<string, unknown> | null),
    brandKit: kit,
  }

  let snapshot
  try {
    snapshot = validateBrandTruthSnapshot(projectBrandTruth(sources))
  } catch (e) {
    // A projection failure is OURS, not the caller's, and it must not be
    // reported as a bad request — the caller sent a selector and nothing else.
    // The stable code travels so a client can explain it; the message does not,
    // because it can quote stored brand content.
    const code = e instanceof BrandTruthError ? e.code : 'brand_truth_projection_failed'
    return json({ error: 'Could not project brand truth', code }, 500)
  }

  const canonical = canonicalBrandTruth(snapshot)
  const sha256 = await sha256Hex(canonical)

  // REUSE BEFORE INSERT. Same facts, same digest, same row — 0095's unique index
  // on (owner_id, snapshot_sha256) says so, and a plan that pins this digest
  // must keep resolving to the snapshot it was built against.
  const { data: existing } = await admin
    .from('brand_truth_snapshots')
    .select('id')
    .eq('owner_id', user.id)
    .eq('snapshot_sha256', sha256)
    .maybeSingle()
  if (existing?.id) return json({ id: existing.id, sha256, reused: true })

  const { data: inserted, error } = await admin
    .from('brand_truth_snapshots')
    .insert({
      owner_id: user.id,
      brand_voice_id: (voice?.id as string | undefined) ?? null,
      schema_version: 1,
      snapshot,
      snapshot_sha256: sha256,
    })
    .select('id')
    .single()

  if (error) {
    // 23505 = the unique index, which means a CONCURRENT call inserted the same
    // digest between our lookup and our insert. That is the index doing its job,
    // not a failure: re-read and return the row that won. Reporting an error
    // here would make two honest clients racing look like a broken feature.
    if ((error as { code?: string }).code === '23505') {
      const { data: raced } = await admin
        .from('brand_truth_snapshots')
        .select('id')
        .eq('owner_id', user.id)
        .eq('snapshot_sha256', sha256)
        .maybeSingle()
      if (raced?.id) return json({ id: raced.id, sha256, reused: true })
    }
    return json({ error: 'Could not persist brand truth' }, 500)
  }

  return json({ id: inserted.id, sha256, reused: false })
})
