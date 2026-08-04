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
  const { data, error } = await db
    .from('brand_glossary_terms').select('term').eq('owner_id', ownerId)
  if (error) {
    // NOT swallowed into an empty glossary. An empty glossary is a real state
    // that changes captions (no floor is lowered), and reporting a failed read
    // as that state would silently drop every hard word the creator ever typed
    // — on the field the plan calls the highest-value one in the product.
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
