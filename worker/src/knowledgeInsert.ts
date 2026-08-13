// Shared insert for creator-knowledge rows. See the note on the function.
import { canonicaliseRepeats } from './knowledgeDedupe.js'

interface DbError { code?: string; message?: string }

/** A `select().eq().eq()` chain that resolves to rows. Optional on purpose — see
 *  `canonicalise`, which must degrade rather than refuse when it is absent. */
interface Selectable {
  select: (cols: string) => {
    eq: (c: string, v: unknown) => {
      eq: (c: string, v: unknown) => Promise<{ data: unknown[] | null; error: DbError | null }>
    }
  }
}

interface RpcCapableDb {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: DbError | null }>
  from: (t: string) => {
    insert: (rows: unknown[]) => Promise<{ error: DbError | null }>
  } & Partial<Selectable>
}

/** Re-point re-worded repeats at the phrasing already stored, so the exact-match
 *  merge 0123 built can see them.
 *
 *  ⚠️ MEASURED: two extractor runs over identical input produced 18 items, of
 *  which 6 merged exactly, 3 were new, and 9 WERE THE SAME FACT IN DIFFERENT
 *  WORDS. Those nine take fresh keys and both copies survive — so a re-scan
 *  roughly doubles the store, and two phrasings of one opinion occupy two of the
 *  six substance slots the prompt reserves.
 *
 *  ⚖️ AND IT DEGRADES RATHER THAN REFUSES, like every other step in this file. A
 *  db without `select`, a query that errors, a voice_id that is null — each
 *  returns the rows unchanged and stores them. Storing a duplicate is a wasted
 *  slot; failing the insert loses the scan. */
async function canonicalise(
  db: RpcCapableDb,
  rows: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const owner = rows[0]?.owner_id
  const voice = rows[0]?.voice_id
  if (!owner || !voice) return rows
  const table = db.from('creator_knowledge')
  if (typeof table.select !== 'function') return rows
  try {
    const { data, error } = await table.select('kind,text')
      .eq('owner_id', owner).eq('voice_id', voice)
    if (error || !Array.isArray(data) || data.length === 0) return rows
    const { rows: out, merged } = canonicaliseRepeats(
      rows, data as Array<{ kind?: unknown; text?: unknown }>)
    if (merged > 0) {
      console.warn(JSON.stringify({
        event: 'creator_knowledge_paraphrase_merged', merged, of: rows.length,
      }))
    }
    return out
  } catch {
    // ⚠️ A THROW HERE MUST NOT COST THE SCAN. This is an optimisation on top of
    // a working insert, and it is the kind of code that gets a null-shaped
    // surprise from a client library change.
    return rows
  }
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

  // ⚠️ BEFORE THE MERGE, NOT INSTEAD OF IT. 0123 merges EXACT repeats; this
  // turns a re-wording into an exact repeat so that merge applies to it.
  const outgoing = await canonicalise(db, rows)

  // Preferred path: server-side merge. Repeats increment `times_seen`.
  const { error: rpcErr } = await db.rpc('merge_creator_knowledge', { p_rows: outgoing })
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

  // ⚠️ THE FALLBACK USES THE ORIGINAL ROWS, NOT THE CANONICALISED ONES, AND THAT
  // IS NOT AN OVERSIGHT. Canonicalising turns a re-wording into an EXACT repeat
  // — which is what makes the merge see it, and which would make this plain
  // insert collide with 0121's unique index and fail the whole batch. Feeding
  // canonicalised rows to a path with no merge behind it re-creates the exact
  // defect 0123 was written to fix. Without the merge, dedupe is off.
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
