// GENERATED FROM packages/shared/src/script/inferShowability.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
/**
 * INFER SHOWABILITY (trial 2026-10-08): `product_entities.showability` is born
 * UNKNOWN whenever no capability flag was answered (productEntity.ts
 * `inferShowability(type, flags)` returns UNKNOWN on a null flag, and the
 * column defaults to UNKNOWN in 0120). UNKNOWN never reaches the show-it beat,
 * which enforces only ALWAYS/SOMETIMES.
 *
 * A pure, deterministic read of the product itself (type, name, facts, offer),
 * used ONLY in memory on the trial path. It never writes.
 *
 *   ALWAYS     handheld / consumable / wearable / visible objects
 *   SOMETIMES  large or installed items (furniture, appliances, vehicles...)
 *   NEVER      services and digital things (nothing to hold)
 *   UNKNOWN    truly nothing to go on
 */
export type InferredShowability = 'ALWAYS' | 'SOMETIMES' | 'NEVER' | 'UNKNOWN'

export interface InferShowabilityIn {
  type?: unknown
  name?: unknown
  facts?: readonly unknown[] | null
  offer?: unknown
}

const DIGITAL_TYPES = new Set(['SAAS', 'APP', 'DIGITAL_PRODUCT', 'COURSE'])

const LARGE = [
  'sofa', 'couch', 'mattress', 'bed', 'wardrobe', 'dresser', 'furniture', 'table', 'desk', 'cabinet',
  'fridge', 'refrigerator', 'freezer', 'oven', 'stove', 'dishwasher', 'washer', 'dryer', 'washing machine',
  'treadmill', 'rower', 'hot tub', 'jacuzzi', 'sauna', 'shed', 'pergola', 'solar panel', 'solar panels',
  'boiler', 'heat pump', 'air conditioner', 'hvac', 'installation', 'installed', 'flooring',
  'car', 'vehicle', 'van', 'truck', 'boat', 'trailer', 'caravan', 'piano', 'pool',
]

const HANDHELD = [
  'coffee', 'beans', 'bean', 'tea', 'chocolate', 'cookie', 'cookies', 'cake', 'bread', 'loaf', 'sauce', 'jam',
  'honey', 'snack', 'snacks', 'granola', 'spice', 'spices', 'wine', 'beer', 'juice', 'syrup', 'candy', 'food',
  'roast', 'blend', 'espresso', 'pastry', 'pastries',
  'mug', 'mugs', 'cup', 'cups', 'bottle', 'jar', 'tin', 'pot', 'pan', 'grinder', 'kettle', 'dripper', 'scale',
  'knife', 'knives', 'plate', 'bowl',
  'bag', 'bags', 'tote', 'backpack', 'wallet', 'purse', 'shirt', 'tshirt', 't-shirt', 'tee', 'hoodie', 'sweater',
  'jacket', 'dress', 'jeans', 'pants', 'socks', 'hat', 'cap', 'scarf', 'shoes', 'sneakers', 'boots', 'apparel',
  'clothing', 'jewelry', 'jewellery', 'necklace', 'ring', 'earrings', 'bracelet', 'watch', 'sunglasses',
  'soap', 'candle', 'candles', 'cream', 'serum', 'lotion', 'shampoo', 'balm', 'lipstick', 'makeup', 'perfume',
  'oil', 'skincare', 'supplement', 'supplements', 'vitamins',
  'tool', 'tools', 'hammer', 'drill', 'wrench', 'brush', 'pen', 'notebook', 'book', 'journal', 'print', 'poster',
  'sticker', 'stickers', 'toy', 'puzzle', 'charger', 'headphones', 'earbuds',
  'speaker', 'lamp', 'camera', 'kit', 'box', 'gadget', 'plant', 'plants', 'pottery',
]

const NOT_AN_OBJECT = [
  'coaching', 'consulting', 'consultation', 'session', 'sessions', 'service', 'therapy', 'lessons',
  'ebook', 'e-book', 'pdf', 'template', 'templates', 'download', 'downloadable', 'online course', 'software',
  'app', 'preset', 'presets', 'webinar',
]

function textOf(input: InferShowabilityIn): string {
  const facts = Array.isArray(input.facts) ? input.facts : []
  return [input.name, input.offer, ...facts]
    .map((x) => (typeof x === 'string' ? x : ''))
    .join(' ')
    .toLowerCase()
}

function hasAny(text: string, words: readonly string[]): boolean {
  const padded = ` ${text.replace(/[^a-z0-9-]+/g, ' ')} `
  return words.some((w) => padded.includes(` ${w} `))
}

export function inferShowability(input: InferShowabilityIn): InferredShowability {
  const type = String(input.type ?? '').trim().toUpperCase()
  if (type === 'SERVICE' || DIGITAL_TYPES.has(type)) return 'NEVER'
  const text = textOf(input)
  if (type === 'PHYSICAL_PRODUCT') {
    // A physical product is an object; keywords only refine large/installed.
    return hasAny(text, LARGE) ? 'SOMETIMES' : 'ALWAYS'
  }
  if (!text.trim()) return 'UNKNOWN'
  if (hasAny(text, LARGE)) return 'SOMETIMES'
  if (hasAny(text, HANDHELD)) return 'ALWAYS'
  if (hasAny(text, NOT_AN_OBJECT)) return 'NEVER'
  return 'UNKNOWN'
}
