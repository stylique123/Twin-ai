// Saved-take pointer — a CONVENIENCE CACHE only, never the authority. The take
// bytes live in the private `takes` bucket and the durable record is the
// media_assets row (+ generations.source_asset_id) written server-side. On
// recovery, screens consult the database FIRST (getReadySourceAsset) and use
// this localStorage pointer only when the server has no record yet (e.g. the
// upload is still in flight in this same tab).
const KEY = (genId: string) => `twinai_take_${genId}`

export interface SavedTake {
  takePath: string
  contentType: string
  // The durable media_assets id when the take went through the source-asset flow.
  // Absent on legacy/fallback uploads that only wrote the bucket directly.
  sourceAssetId?: string
  savedAt: number
}

export function saveTakePointer(genId: string, take: Omit<SavedTake, 'savedAt'>): void {
  try {
    localStorage.setItem(KEY(genId), JSON.stringify({ ...take, savedAt: Date.now() }))
  } catch { /* storage full/unavailable — the server record still protects */ }
}

export function readTakePointer(genId: string): SavedTake | null {
  try {
    const raw = localStorage.getItem(KEY(genId))
    if (!raw) return null
    const t = JSON.parse(raw) as SavedTake
    return t && typeof t.takePath === 'string' ? t : null
  } catch {
    return null
  }
}

export function clearTakePointer(genId: string): void {
  try { localStorage.removeItem(KEY(genId)) } catch { /* no-op */ }
}
