/** Plan 2.2: the passage store is on only for owners named in PASSAGE_STORE_OWNERS. */
export function passageStoreOn(ownerId: string, list = process.env.PASSAGE_STORE_OWNERS ?? ''): boolean {
  return list.split(',').map((s) => s.trim()).filter(Boolean).includes(ownerId)
}
