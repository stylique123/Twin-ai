// GENERATED FROM packages/shared/src/storagePath.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// Is this storage key inside the owner's own folder?
//
// A bare `path.startsWith(`${ownerId}/`)` is not enough: `<me>/../<victim>/a.jpg`
// passes it, and the storage URL then resolves to the victim's folder. Readers
// that use the service role (worker, review page) bypass storage RLS, so this
// check is the only thing standing between one creator and another's files.
export function isOwnedStoragePath(ownerId: string, path: unknown): path is string {
  if (typeof ownerId !== 'string' || ownerId.length === 0 || ownerId.includes('/')) return false
  if (typeof path !== 'string' || path.length === 0 || path.length > 512) return false
  // `%` (encoded dots/slashes) and `\` (normalised to `/` by some URL parsers) are refused outright.
  if (path.includes('%') || path.includes('\\')) return false
  const parts = path.split('/')
  if (parts[0] !== ownerId || parts.length < 2) return false
  return parts.every((p) => p !== '' && p !== '.' && p !== '..')
}
