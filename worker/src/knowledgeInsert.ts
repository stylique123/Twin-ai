// Shared insert for creator-knowledge rows. See the note on the function.

interface RpcCapableDb {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { code?: string; message?: string } | null }>
  from: (t: string) => { insert: (rows: unknown[]) => Promise<{ error: { code?: string; message?: string } | null }> }
}

/** Store knowledge rows, merging repeats instead of losing the batch.
 *
 * ⚠️ A PLAIN BATCH INSERT LOSES EVERYTHING ON ONE COLLISION. 0121 puts a UNIQUE
 * index on (owner_id, voice_id, kind, lower(btrim(text))) so that repeats merge —
 * but Postgres fails the WHOLE statement on the first conflict. So the second
 * time a creator was scanned, if the extractor phrased even ONE item exactly as
 * before, every other item in that batch — all the new material — was discarded,
 * and the caller logged `knowledge insert failed` and moved on. The index was
 * built for a merge that had never been written; `merge_creator_knowledge`
 * (0123) is that merge, and it increments `times_seen` rather than colliding.
 *
 * ⚠️ A NEW COLUMN IN A ROW LITERAL IS A HARD FAILURE UNTIL THE MIGRATION LANDS.
 * PostgREST rejects the whole insert with PGRST204 for an unknown column, so
 * shipping `source` naively would silently stop storing ALL creator knowledge
 * between this deploy and the owner applying 0122 — turning an additive
 * improvement into the exact "empty knowledge table" defect that was just fixed.
 *
 * ⚖️ SO EACH STEP DEGRADES RATHER THAN BREAKS, AND SAYS SO. Missing RPC falls
 * back to the insert; missing column drops `source` and retries. Losing
 * provenance, or losing the merge, is recoverable; losing the rows is not. Every
 * fallback logs, because a permanent silent fallback means the new path never
 * runs and nobody notices.
 */
export async function insertKnowledge(
  db: RpcCapableDb,
  rows: Array<Record<string, unknown>>,
): Promise<{ error: { message?: string } | null; sourceStored: boolean; merged: boolean }> {
  if (rows.length === 0) return { error: null, sourceStored: true, merged: true }

  // Preferred path: server-side merge. Repeats increment `times_seen`.
  const { error: rpcErr } = await db.rpc('merge_creator_knowledge', { p_rows: rows })
  if (!rpcErr) return { error: null, sourceStored: true, merged: true }

  // PGRST202 = no such function. Anything else is a real failure of a path that
  // exists, and must NOT be masked by falling back to the one it replaced.
  const rpcMissing = rpcErr.code === 'PGRST202'
    || /could not find the function|does not exist/i.test(String(rpcErr.message ?? ''))
  if (!rpcMissing) return { error: rpcErr, sourceStored: false, merged: false }
  console.warn(JSON.stringify({
    event: 'creator_knowledge_merge_absent',
    detail: 'migration 0123 not applied; falling back to plain insert, repeats will fail the batch',
  }))

  const { error } = await db.from('creator_knowledge').insert(rows)
  if (!error) return { error: null, sourceStored: true, merged: false }
  const missingColumn = error.code === 'PGRST204'
    || /column .*source.* does not exist/i.test(String(error.message ?? ''))
  if (!missingColumn) return { error, sourceStored: false, merged: false }
  console.warn(JSON.stringify({
    event: 'creator_knowledge_source_column_absent',
    detail: 'migration 0122 not applied; storing rows WITHOUT provenance',
  }))
  const { error: retryErr } = await db.from('creator_knowledge')
    .insert(rows.map(({ source, ...rest }) => rest))
  return { error: retryErr, sourceStored: false, merged: false }
}
