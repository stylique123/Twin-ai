// Editor v2 — resolve the owner's DEFAULT brand into the bounded snapshot, WITH a
// verified logo. Called ONLY by the boot-manifest pin (editorV2): the snapshot
// CONTENT is frozen into the pinned manifest there, and every later stage (incl.
// the Director) reads that frozen copy — never a live re-derivation — so a
// mid-project brand change cannot alter or fail a running edit.
import { createHash } from 'node:crypto'
import { db } from '../db.js'
import { PermanentJobError } from '../errors.js'
import { projectBrandSnapshot, brandSnapshotSha256, type EditorBrandSnapshotV1 } from './brandSnapshot.js'

// The brand logo is a storage `logo_path` (brand_kit.logo_path, `edits` bucket). It is
// VERIFIED only when (a) owned by this creator (the object key is prefixed with the
// owner id) and (b) the object actually downloads — then content-checksummed. Anything
// unverified → no logo (fail-closed): Twin never carries a logo it cannot confirm.
async function resolveVerifiedLogo(
  ownerId: string,
  kit: Parameters<typeof projectBrandSnapshot>[1],
): Promise<{ path: string; sha256: string } | null> {
  const path = kit && typeof kit === 'object' ? (kit as { logo_path?: unknown }).logo_path : null
  if (typeof path !== 'string' || path.length === 0 || path.length > 512) return null
  if (!path.startsWith(`${ownerId}/`)) return null
  const { data, error } = await db.storage.from('edits').download(path)
  if (error) {
    // A genuine "object not found" means the logo legitimately isn't there → none.
    // ANY OTHER error (network blip, 5xx, throttling, expired creds) is UNVERIFIED,
    // not proven-absent — failing it open would silently pin a logoless brand off a
    // transient blip and ship a de-branded video. Unverified must fail closed (throw)
    // so the job retries rather than dropping the creator's real, checksummable logo.
    const msg = (error as { message?: string }).message ?? String(error)
    const status = Number(
      (error as { status?: number }).status ?? (error as { statusCode?: number | string }).statusCode ?? NaN)
    const notFound = status === 404 || /not[_ ]?found|does not exist|no such (file|object|key)/i.test(msg)
    if (notFound) return null
    throw new Error(`brand logo verification could not reach storage (unverified, not absent): ${msg}`)
  }
  if (!data) return null
  const bytes = Buffer.from(await data.arrayBuffer())
  if (bytes.byteLength === 0) return null
  return { path, sha256: createHash('sha256').update(bytes).digest('hex') }
}

// Read the owner's DEFAULT brand voice + kit and project the bounded snapshot (+ its
// SHA). Read fails closed on schema drift; an absent/unready default voice yields a
// stable snapshot-of-empty-inputs (never a silent skip / null) whose visual sources are
// all `none` — the editor knows it has no confirmed brand rather than guessing one.
export async function resolveBrandSnapshot(ownerId: string): Promise<{ snapshot: EditorBrandSnapshotV1; sha: string }> {
  const { data: voice, error } = await db
    .from('brand_voices').select('profile, brand_kit')
    .eq('owner_id', ownerId).eq('is_default', true).maybeSingle()
  if (error) {
    if (/column .*does not exist|profile|brand_kit|is_default/i.test(error.message)) {
      throw new PermanentJobError(
        `brand_voices schema is missing a required column (deployment drift): ${error.message}`,
        'brand_schema_drift')
    }
    throw new Error(`brand voice read failed: ${error.message}`)
  }
  const profile = (voice?.profile ?? null) as Parameters<typeof projectBrandSnapshot>[0]
  const kit = (voice?.brand_kit ?? null) as Parameters<typeof projectBrandSnapshot>[1]
  const verifiedLogo = await resolveVerifiedLogo(ownerId, kit)
  const snapshot = projectBrandSnapshot(profile, kit, verifiedLogo)
  return { snapshot, sha: brandSnapshotSha256(snapshot) }
}
