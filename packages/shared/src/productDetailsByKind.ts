/**
 * Plan 1.4: THE PRODUCT DETAILS POP-UP, BY KIND (product-details-by-type brief,
 * aligned to the Need Check, Part 16). Product-scope questions are asked once
 * per product; each answer is stored on the product as her own fact, so a
 * script never asks it again.
 *
 * Three questions per kind are required; urgency is always optional (no
 * answer means no scarcity wording). Pure: the card renders this list and the
 * Need Check reads `missingProductDetails` to decide what is still open.
 */
import type { ExtractedField } from './productExtraction'

export type HoldUp = 'hold_up' | 'close_up' | 'no'

export interface ProductDetailQuestion {
  /** `hold_up` is stored as showability plus a `show_action` fact. */
  key: 'hold_up' | 'screen' | 'process_step' | 'problem' | 'faq' | 'includes' | 'urgency'
  writesTo: ExtractedField
  prompt: string
  placeholder: string
  required: boolean
}

const Q: Record<ProductDetailQuestion['key'], Omit<ProductDetailQuestion, 'required'>> = {
  hold_up: { key: 'hold_up', writesTo: 'show_action', prompt: 'Can you hold it up on camera?', placeholder: 'Why, or what the close-up shows' },
  screen: { key: 'screen', writesTo: 'page_section', prompt: 'Which screen can you show, and what is on it?', placeholder: 'e.g. the dashboard with this week’s orders' },
  process_step: { key: 'process_step', writesTo: 'process_step', prompt: 'What are the steps, start to finish?', placeholder: 'e.g. grind, bloom 30 seconds, pour' },
  problem: { key: 'problem', writesTo: 'problem', prompt: 'What problem does it fix for the person buying?', placeholder: 'In the words they would use' },
  faq: { key: 'faq', writesTo: 'faq', prompt: 'What makes people hesitate before buying?', placeholder: 'The question you hear most' },
  includes: { key: 'includes', writesTo: 'includes', prompt: 'What is included?', placeholder: 'e.g. two calls and a written plan' },
  urgency: { key: 'urgency', writesTo: 'urgency', prompt: 'Is there a real deadline or limited stock? (optional)', placeholder: 'Leave empty if not; scripts then use no scarcity wording' },
}

const BY_KIND: Record<string, ReadonlyArray<ProductDetailQuestion['key']>> = {
  PHYSICAL_PRODUCT: ['hold_up', 'process_step', 'faq'],
  APP: ['screen', 'problem', 'faq'],
  SAAS: ['screen', 'problem', 'faq'],
  DIGITAL_PRODUCT: ['screen', 'includes', 'faq'],
  COURSE: ['screen', 'includes', 'faq'],
  COMMUNITY: ['screen', 'includes', 'faq'],
  SERVICE: ['includes', 'problem', 'faq'],
}

/** The questions for this kind: three required, then urgency (optional). Unknown kinds get none. */
export function productDetailsByKind(kind: unknown): ProductDetailQuestion[] {
  const req = BY_KIND[String(kind ?? '').toUpperCase()]
  if (!req) return []
  return [...req.map((k) => ({ ...Q[k], required: true })), { ...Q.urgency, required: false }]
}

/** Map her hold-up answer to the stored showability. */
export function showabilityForHoldUp(a: HoldUp): 'ALWAYS' | 'NEVER' {
  return a === 'no' ? 'NEVER' : 'ALWAYS'
}

interface FactLike { field?: unknown; value?: unknown; trust?: unknown }

/** Required questions with no usable fact yet (confirmed or her own). */
export function missingProductDetails(kind: unknown, knowledge: readonly FactLike[] | null | undefined, showability?: unknown): ProductDetailQuestion['key'][] {
  const have = new Set((knowledge ?? []).filter((f) => f && f.trust === 'usable' && String(f.value ?? '').trim()).map((f) => String(f.field)))
  return productDetailsByKind(kind)
    .filter((q) => q.required)
    .filter((q) => q.key === 'hold_up'
      ? !(showability === 'ALWAYS' || showability === 'NEVER' || have.has('show_action'))
      : !have.has(q.writesTo))
    .map((q) => q.key)
}
