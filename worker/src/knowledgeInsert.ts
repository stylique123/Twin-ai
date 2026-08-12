// Shared insert for creator-knowledge rows. See the note on the function.

/** Insert knowledge rows, tolerating a database that has not had 0122 applied.
 *
 * ⚠️ A NEW COLUMN IN A ROW LITERAL IS A HARD FAILURE UNTIL THE MIGRATION LANDS.
 * PostgREST rejects the whole insert with PGRST204 for an unknown column, so
 * shipping `source` naively would silently stop storing ALL creator knowledge
 * between this deploy and the owner applying the migration — turning an additive
 * improvement into the exact "empty knowledge table" defect that was just fixed.
 *
 * ⚖️ SO IT RETRIES WITHOUT THE FIELD, AND SAYS SO. Dropping `source` loses the
 * provenance for those rows, which is recoverable; losing the rows is not. The
 * fallback logs loudly rather than passing silently, because a permanent
 * silent fallback would mean the column never gets used and nobody notices.
 */
export async function insertKnowledge(
  db: { from: (t: string) => { insert: (rows: unknown[]) => Promise<{ error: { code?: string; message?: string } | null }> } },
  rows: Array<Record<string, unknown>>,
): Promise<{ error: { message?: string } | null; sourceStored: boolean }> {
  const { error } = await db.from('creator_knowledge').insert(rows)
  if (!error) return { error: null, sourceStored: true }
  const missingColumn = error.code === 'PGRST204'
    || /column .*source.* does not exist/i.test(String(error.message ?? ''))
  if (!missingColumn) return { error, sourceStored: false }
  console.warn(JSON.stringify({
    event: 'creator_knowledge_source_column_absent',
    detail: 'migration 0122 not applied; storing rows WITHOUT provenance',
  }))
  const { error: retryErr } = await db.from('creator_knowledge')
    .insert(rows.map(({ source, ...rest }) => rest))
  return { error: retryErr, sourceStored: false }
}
