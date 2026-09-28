// THE GUESSED PURPOSE DECIDES THE SCRIPT'S SHAPE, NOT JUST ITS LABEL (owner,
// round 2, Part 3). A paragraph with a personal thread AND a product is not two
// topics side by side: one leads, the other supports. The edge function mirrors
// this as PURPOSE_SHAPE_INLINE; a parity test holds the two identical.

export type PurposeShape = 'story_led' | 'product_led' | 'equal'

const SHAPE_BY_GOAL: Record<string, PurposeShape> = {
  personal_brand: 'story_led',
  inspire: 'story_led',
  conversations: 'story_led',
  sell: 'product_led',
  leads: 'product_led',
  educate: 'product_led',
  authority: 'equal',
  entertain: 'equal',
  community: 'equal',
}

export const PURPOSE_SHAPE_DIRECTIVE: Record<PurposeShape, string> = {
  story_led: 'SHAPE — STORY LEADS, PRODUCT SUPPORTS: open on her personal thread; the product appears only as evidence or payoff ("this is what came out of all that"); close by inviting the viewer to relate to the story, not to buy.',
  product_led: 'SHAPE — PRODUCT LEADS, STORY SUPPORTS: open on the product; her personal material explains why it is good or earns the trust to talk about it; close product-forward.',
  equal: 'SHAPE — EQUAL, SLICE OF LIFE: no hard pitch either way; an honest look at her day that happens to include the product; close on connection, not a sale.',
}

/** Null when there is nothing to arrange: no product, or no purpose. */
export function purposeShape(goal: string | null | undefined, hasProduct: boolean): PurposeShape | null {
  if (!hasProduct || !goal) return null
  return SHAPE_BY_GOAL[goal] ?? null
}
