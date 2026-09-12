import { loadProductEntities, sellsKindOf, type SellsKind } from '@twinai/shared'

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
