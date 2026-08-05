// SCREEN RECORDING AS A CLIP TYPE — Phase 12 item 13.
//
// The client half: pick a mime the browser can actually produce, mint one
// attempt id per recording, and run create → upload → finalize against the
// `clip-asset` edge function.
//
// ── ONE ATTEMPT PER RECORDING, AND THAT IS THE WHOLE IDEMPOTENCY STORY ───
//
// A screen capture is retried more than anything else in this product: the
// share-picker is cancelled, the wrong window is chosen, the tab is refreshed
// mid-upload. The attempt id is minted ONCE when recording stops, and every
// retry of the same bytes reuses it — so 0107's RPC converges on one row
// instead of leaving three half-uploaded clips for the creator to choose
// between. A NEW recording gets a NEW id, deliberately: that is a different
// clip, not a retry.
//
// ── WHO IS OFFERED THIS ──────────────────────────────────────────────────
//
// `can_record_screen` gates the OFFER with `isExplicitlyTrue`, which is the
// REVERSE of the footage-checklist rule. `capabilities.ts` had already decided
// it: `isExplicitlyTrue`'s doc names "a screen-recording clip type nobody can
// use" as its example of a feature that must not appear until asked for.
//
// A missing footage checklist costs a creator a video they cannot make; a
// screen-record button on a talking-head creator's plan is an affordance for
// something they do not do. Silence is not a request for it, so an unanswered
// flag hides this and the fix is asking the question.
import { getClient } from './api'

/** What the RPC will accept. Ordered by what browsers actually produce well:
 *  every Chromium and Firefox build records webm, Safari produces mp4. */
const CANDIDATE_MIMES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
] as const

/** The bare type the server stores, without the codec suffix — 0107's CHECK is
 *  on `video/webm` / `video/mp4`, and a codec parameter is a property of the
 *  encoder rather than of the file's kind. */
export function baseMime(mime: string): string {
  return (mime.split(';')[0] ?? '').trim().toLowerCase()
}

export interface RecorderLike {
  isTypeSupported(type: string): boolean
}

/**
 * The best mime this browser can record, or null.
 *
 * NULL IS A REAL ANSWER — a browser with no supported type cannot record a
 * screen, and the surface says so rather than starting a recorder that produces
 * an empty blob. Injected rather than reading the global so this is testable.
 */
export function pickClipMime(recorder: RecorderLike): string | null {
  for (const m of CANDIDATE_MIMES) {
    if (recorder.isTypeSupported(m)) return m
  }
  return null
}

export interface ClipUploadIntent {
  asset_id: string
  bucket: string
  path: string
  token: string
  signed_url: string
  content_type: string
  created: boolean
}

/** Start a clip: the server mints the row and the path, and authorizes exactly
 *  that path. Nothing here proposes a location. */
export async function createClipIntent(input: {
  generationId: string
  recordingAttemptId: string
  contentType: string
  sizeBytes: number
  label?: string | null
}): Promise<ClipUploadIntent> {
  const { data, error } = await getClient().functions.invoke('clip-asset', {
    body: {
      action: 'create',
      generation_id: input.generationId,
      recording_attempt_id: input.recordingAttemptId,
      content_type: baseMime(input.contentType),
      size_bytes: input.sizeBytes,
      label: input.label ?? null,
    },
  })
  if (error) throw new Error(await readClipError(error))
  return data as ClipUploadIntent
}

/** The bytes are up. Idempotent server-side, so a retried call after a dropped
 *  response is safe. */
export async function finalizeClip(assetId: string, sizeBytes: number): Promise<void> {
  const { error } = await getClient().functions.invoke('clip-asset', {
    body: { action: 'finalize', asset_id: assetId, size_bytes: sizeBytes },
  })
  if (error) throw new Error(await readClipError(error))
}

export interface ClipAsset {
  id: string
  storage_path: string
  clip_label: string | null
  status: string
  created_at: string
}

/** This generation's clips. `authenticated` holds SELECT on `media_assets`, so
 *  this is a plain read — only the WRITES need the edge function. */
export async function listClips(generationId: string): Promise<ClipAsset[]> {
  const { data, error } = await getClient()
    .from('media_assets')
    .select('id, storage_path, clip_label, status, created_at')
    .eq('generation_id', generationId)
    .eq('kind', 'clip')
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })
  // A read failure is not "no clips". The caller shows nothing rather than an
  // empty state that would read as "you have not recorded any".
  if (error) throw error
  return (data ?? []) as ClipAsset[]
}

/** The edge function's error body carries the RPC's own vocabulary
 *  (`clip_limit_reached`, `clip_quota_exceeded`). Read it out rather than
 *  reporting a status code, so the screen can say what actually happened. */
async function readClipError(error: unknown): Promise<string> {
  const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context
  if (ctx?.json) {
    try {
      const body = await ctx.json() as { error?: string }
      if (typeof body?.error === 'string' && body.error !== '') return body.error
    } catch { /* fall through to the generic message */ }
  }
  return error instanceof Error ? error.message : 'Could not save that clip.'
}

/** How an RPC code reads to a creator. Anything unrecognised keeps the server's
 *  own words rather than being replaced by a friendlier lie. */
export function clipErrorMessage(raw: string): string {
  if (raw.includes('clip_limit_reached')) return "That's as many clips as one video can hold."
  if (raw.includes('clip_quota_exceeded')) return "You're out of storage — delete an old take to make room."
  if (raw.includes('clip_policy_size')) return 'That recording came out empty or far too long.'
  if (raw.includes('clip_attempt_conflict')) return 'That clip was already saved differently. Record it again.'
  if (raw.includes('clip_forbidden')) return "We couldn't match that clip to your video."
  return raw
}
