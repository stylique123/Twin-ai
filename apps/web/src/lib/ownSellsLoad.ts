import { loadProductEntities, sellsKindOf, sellsFacetOf, type SellsKind } from '@twinai/shared'

/**
 * WHAT THIS CREATOR SELLS, FOR THE ONE QUESTION THAT ASSUMES A RELATIONSHIP.
 *
 * ⚠️ A LOCAL WRAPPER RATHER THAN A SHARED CALL IN THE COMPONENT, and that is
 * structural rather than tidiness. Every other read the question card makes goes
 * through a lib beside this one — `loadQuestionsPut`, `loadKnowledgeCounts`,
 * `loadVoiceNiche`. Importing a network function straight into the component
 * reached past that seam, and the card stopped rendering entirely: an unmocked
 * client in a test environment leaves the promise pending, `loadNext` never
 * finishes, and the section is empty. The card's own history has that exact
 * failure recorded — "dismissing one question ended the queue" — and this would
 * have been the same shape from a different cause.
 *
 * ⚖️ AND `null` IS THE ANSWER FOR EVERY UNCERTAIN CASE, never a guess. A failed
 * read, an empty library, a mixed one — all of them mean "we do not know what
 * kind of buyer she has", which is the state every creator was in before this
 * existed and which the bucket wording already serves honestly.
 */
export async function loadOwnSells(): Promise<SellsKind | null> {
  try {
    return sellsKindOf(await loadProductEntities())
  } catch {
    return null
  }
}

/**
 * The same read, but able to say "she sells nothing" out loud.
 *
 * ⚠⚠ `loadOwnSells` COLLAPSES TWO OPPOSITE FACTS INTO null AND IS RIGHT TO, for
 * the one question it serves: a failed read, an empty library and a mixed one all
 * mean "we do not know what kind of buyer she has". But the opening three need
 * the distinction — a creator with no products of her own is a commentator and
 * can be asked what she got wrong publicly, while a creator with a service AND a
 * candle line has two kinds of buyer and must be asked neither one’s question.
 *
 * ⚖️ A FAILED READ IS STILL null, NEVER 'none'. "The query threw" is not
 * evidence that she sells nothing, and treating it as such would ask a chef the
 * commentator’s question because the network blinked.
 */
export async function loadSellsFacet(): Promise<SellsKind | 'none' | null> {
  try {
    return sellsFacetOf(await loadProductEntities())
  } catch {
    return null
  }
}
