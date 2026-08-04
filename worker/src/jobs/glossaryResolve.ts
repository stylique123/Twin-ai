// THE PINNED GLOSSARY — §6's "any hard words?", frozen at pin time.
//
// PINNED, NEVER LIVE, for exactly the reason the brand snapshot is: a creator
// adding a hard word while an edit is running must not retro-alter that edit,
// and a glossary row deleted mid-project must not FAIL one. The compiler reads
// the manifest's copy, so a crash-resume re-compiles the identical plan from
// the identical terms — which is what "deterministic" is protecting here.
//
// BOUNDED THE SAME WAY THE SNAPSHOT IS. The manifest is hashed and stored, so
// an unbounded list would be an unbounded manifest. The cap and the per-term
// length are the shared module's (`MAX_GLOSSARY_TERMS`, 200 x 64 chars), and
// they are re-enforced here rather than trusted, because the worker does not
// import the client's validation and a row can be written by anything holding
// the owner's credentials.
import { db } from '../db.js'
import { canonicalJson, sha256Hex } from './editorManifest.js'
import { foldGlossaryKey } from './editorCompile.js'
import { UNDEFINED_TABLE } from './editorCompileStage.js'

/** Mirrors `packages/shared/src/editor/glossary.ts`. A test compares the two
 *  folding functions directly — a term folded two ways is a term the two halves
 *  of the product disagree about. */
export const MAX_GLOSSARY_TERMS = 200
export const MAX_GLOSSARY_TERM_CHARS = 64

export interface PinnedGlossary {
  terms: string[]
  sha: string
}

/**
 * Read the owner's glossary into the form the manifest pins.
 *
 * SORTED BY FOLDED KEY, deduplicated, capped. The order is not cosmetic: the
 * manifest hashes this list, so a glossary that arrived in a different row
 * order would produce a different manifest sha for the same glossary — and a
 * resumed project would read that as a changed input and fail closed.
 *
 * AN EMPTY GLOSSARY IS THE ORDINARY CASE, and pins as an empty list rather than
 * as an absent field, so "this creator has no hard words" and "this project
 * predates the glossary" stay distinguishable in the manifest.
 */
export async function resolveGlossary(ownerId: string): Promise<PinnedGlossary> {
  return readGlossaryResult(await db
    .from('brand_glossary_terms').select('term').eq('owner_id', ownerId))
}

/** The decision the read encodes, split out so it is testable without a
 *  database — it is the one place a database error means "carry on". */
export function readGlossaryResult(
  result: { data: unknown; error: { code?: string; message?: string } | null },
): PinnedGlossary {
  const { data, error } = result
  if (error) {
    // ── THE TABLE ITSELF BEING ABSENT IS THE PRE-MIGRATION STATE ──────────
    //
    // A push to `main` touching `worker/` DEPLOYS THE WORKER; migrations are
    // applied separately and by hand. This function runs inside `pinManifest`,
    // which every editor project passes through at its FIRST stage — so
    // without this branch, the window between the deploy and `db push` is a
    // total editor outage, not a degraded caption. Every project would fail to
    // pin.
    //
    // `42P01` is treated as an empty glossary because it is ENTAILED, not
    // because it is convenient: no table means no row means no creator has
    // stored a term, so the glossary genuinely IS empty at pin time. Freezing
    // an empty one is then the pin doing exactly its job — a creator adding a
    // term after the pin is the case pinning exists to hold out, and a term
    // added after a pin taken during the window is no different.
    //
    // EVERY OTHER ERROR STILL THROWS. A permission failure or a timeout is a
    // database that MIGHT be holding terms it will not give us, and pinning an
    // empty glossary from one of those WOULD silently drop every hard word the
    // creator ever typed — on the field the plan calls the highest-value one in
    // the product, for the life of that project.
    if ((error as { code?: string }).code === UNDEFINED_TABLE) {
      return { terms: [], sha: sha256Hex(canonicalJson([])) }
    }
    throw new Error(`glossary read failed: ${error.message}`)
  }
  const byKey = new Map<string, string>()
  for (const row of (data ?? []) as Array<{ term?: unknown }>) {
    if (typeof row?.term !== 'string') continue
    const term = row.term.normalize('NFC').trim()
    if (term === '' || term.length > MAX_GLOSSARY_TERM_CHARS || /\s/.test(term)) continue
    const key = foldGlossaryKey(term)
    if (!byKey.has(key)) byKey.set(key, term)
  }
  const terms = [...byKey.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, MAX_GLOSSARY_TERMS)
    .map(([, term]) => term)
  return { terms, sha: sha256Hex(canonicalJson(terms)) }
}
