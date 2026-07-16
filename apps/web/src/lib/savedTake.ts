// Saved-take pointer — recording durability across a refresh / tab close / phone
// lock. The take BYTES are uploaded to the `takes` bucket the moment recording
// finishes (server-side, durable); only this tiny pointer (the storage path) lives
// in localStorage, keyed by generation id, so a finished recording is never lost
// to an accidental navigation. The rebuilt editor will consume this pointer.
const KEY = (genId: string) => `twinai_take_${genId}`

export interface SavedTake {
  takePath: string
  contentType: string
  savedAt: number
}

export function saveTakePointer(genId: string, take: Omit<SavedTake, 'savedAt'>): void {
  try {
    localStorage.setItem(KEY(genId), JSON.stringify({ ...take, savedAt: Date.now() }))
  } catch { /* storage full/unavailable — the beforeunload guard still protects */ }
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
