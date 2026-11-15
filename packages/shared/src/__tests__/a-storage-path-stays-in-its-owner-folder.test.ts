// A creator's storage key must stay inside her own folder, even after a URL parser
// resolves `..` (security audit #2/#3: `<me>/../<victim>/cover.jpg` passed the old prefix check).
import { describe, it, expect } from 'vitest'
import { isOwnedStoragePath } from '../storagePath'

const ME = '11111111-1111-1111-1111-111111111111'
const VICTIM = '22222222-2222-2222-2222-222222222222'

describe('isOwnedStoragePath', () => {
  it('accepts a plain key in her own folder', () => {
    expect(isOwnedStoragePath(ME, `${ME}/products/cover.jpg`)).toBe(true)
    expect(isOwnedStoragePath(ME, `${ME}/logo.png`)).toBe(true)
  })

  it('refuses the traversal the old check let through', () => {
    const attack = `${ME}/../${VICTIM}/cover.jpg`
    expect(attack.startsWith(`${ME}/`)).toBe(true) // the old check
    expect(new URL(`https://x.supabase.co/storage/v1/object/edits/${attack}`).pathname)
      .toBe(`/storage/v1/object/edits/${VICTIM}/cover.jpg`) // where it really lands
    expect(isOwnedStoragePath(ME, attack)).toBe(false)
  })

  it.each([
    ['dot segment', `${ME}/./cover.jpg`],
    ['empty segment', `${ME}//cover.jpg`],
    ['trailing slash', `${ME}/`],
    ['encoded dots', `${ME}/%2e%2e/${VICTIM}/cover.jpg`],
    ['encoded slash', `${ME}/..%2f${VICTIM}/cover.jpg`],
    ['backslash', `${ME}/..\\${VICTIM}\\cover.jpg`],
    ['someone else\'s folder', `${VICTIM}/cover.jpg`],
    ['owner id as a prefix of another id', `${ME}x/cover.jpg`],
    ['bare owner id', ME],
    ['too long', `${ME}/${'a'.repeat(600)}`],
  ])('refuses %s', (_label, path) => {
    expect(isOwnedStoragePath(ME, path)).toBe(false)
  })

  it('refuses non-strings and an empty owner', () => {
    expect(isOwnedStoragePath(ME, null)).toBe(false)
    expect(isOwnedStoragePath(ME, 42)).toBe(false)
    expect(isOwnedStoragePath('', '/cover.jpg')).toBe(false)
  })
})
