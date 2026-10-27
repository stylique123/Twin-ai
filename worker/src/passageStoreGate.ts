/**
 * Plan 2.2: the passage store is on only for owners named in PASSAGE_STORE_OWNERS.
 * Plan v7.1 WP4: 'all' stores for every owner (her own words, her own table, never
 * shown); the owner sets it. Unset is still nobody.
 */
export function passageStoreOn(ownerId: string, list = process.env.PASSAGE_STORE_OWNERS ?? ''): boolean {
  const ids = list.split(',').map((s) => s.trim()).filter(Boolean)
  return ids.includes('all') || ids.includes(ownerId)
}
