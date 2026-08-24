import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  COMMUNITY_PLATFORMS, surfacesFor, SURFACES_WITH_OTHER_PEOPLE,
  privacyOfProofItem, needsCovering, mapIsUsable, quotableFigures,
  type CommunityMap, type CommunityPlatform,
} from '../communityMap'
import * as shared from '../index'

const base: CommunityMap = {
  platform: 'skool', url: 'https://skool.com/thing', name: 'The Thing',
  surfaceIds: ['about', 'classroom'],
}

// ⚠️ THE CATALOG EXISTS SO THE CREATOR TICKS RATHER THAN TYPES. A free-text
// surface name is one no writer can match and no check can verify.
describe('every platform offers something to tick', () => {
  it.each(COMMUNITY_PLATFORMS)('%s has surfaces, each with what it proves', (p) => {
    const s = surfacesFor(p as CommunityPlatform)
    expect(s.length).toBeGreaterThan(0)
    for (const surface of s) {
      expect(surface.id).toBeTruthy()
      expect(surface.label).toBeTruthy()
      expect(surface.proves, `${p}/${surface.id}`).toBeTruthy()
    }
  })

  // ⚖️ AN UNKNOWN PLATFORM STILL GETS A SHOT LIST. Every community has a front
  // door, a place things happen, and something pinned — a creator on a platform
  // we have not catalogued must not fall through to nothing.
  it.each([null, undefined, 'myspace'])('%s falls back rather than returning nothing', (p) => {
    expect(surfacesFor(p as CommunityPlatform).length).toBeGreaterThan(0)
  })

  // ⚠️ EVERY PLATFORM MUST OFFER A FRONT DOOR, because the repair path for a
  // scene naming a surface that does not exist is "fall back to the about page".
  // If a platform had no `about`, that repair would have nowhere to land.
  it.each(COMMUNITY_PLATFORMS)('%s has an about surface for the repair to fall back to', (p) => {
    expect(surfacesFor(p as CommunityPlatform).map((s) => s.id)).toContain('about')
  })
})

// ⚠️ ABSENT IS NOT PERMISSION. This is the core of the consent design and the
// one rule that must not be softened for convenience.
describe('unanswered privacy is blur, never permission', () => {
  it.each([undefined, null, {}, { privacy: 'nonsense' }])('%s reads as blur', (v) => {
    expect(privacyOfProofItem(v as never)).toBe('blur')
  })

  it('a real answer is honoured', () => {
    expect(privacyOfProofItem({ privacy: 'mine' })).toBe('mine')
    expect(privacyOfProofItem({ privacy: 'permitted' })).toBe('permitted')
  })
})

describe('a surface with other people in it gets covered', () => {
  it.each(SURFACES_WITH_OTHER_PEOPLE)('%s needs covering when nobody said otherwise', (s) => {
    expect(needsCovering(s, null)).toBe(true)
    expect(needsCovering(s, { privacy: 'blur' })).toBe(true)
  })

  it('the creator’s own post on a feed does not', () => {
    expect(needsCovering('feed', { privacy: 'mine' })).toBe(false)
    expect(needsCovering('feed', { privacy: 'permitted' })).toBe(false)
  })

  // ⚖️ THE ABOUT PAGE IS THE CREATOR'S OWN SHOP WINDOW. Telling somebody to
  // cover names on a page with no names on it is noise, and noise teaches people
  // to skip the instruction that matters.
  it('a page with nobody else on it does not', () => {
    expect(needsCovering('about', null)).toBe(false)
    expect(needsCovering('classroom', null)).toBe(false)
    expect(needsCovering(null, null)).toBe(false)
  })

  // ⚠️ EITHER CONDITION IS ENOUGH — requiring BOTH would let a feed shot ship
  // uncovered whenever the creator happened to name their own post on it.
  it('a permitted item does not un-cover a crowd surface it is not on', () => {
    expect(needsCovering('members', { privacy: 'blur' })).toBe(true)
  })
})

// ⚠️ A MAP WITH NO SURFACES IS NOT A MAP. The writer must stay silent rather
// than invent one, which is what this decides.
describe('an empty map buys silence, not a guess', () => {
  it('a complete map is usable', () => {
    expect(mapIsUsable(base)).toBe(true)
  })

  it.each([
    ['no map', null],
    ['not an object', 'skool'],
    ['no url', { ...base, url: '' }],
    ['no name', { ...base, name: '   ' }],
    ['no surfaces', { ...base, surfaceIds: [] }],
    ['surfaces absent', { ...base, surfaceIds: null }],
  ])('%s is not usable', (_label, m) => {
    expect(mapIsUsable(m as CommunityMap)).toBe(false)
  })
})

// ⚠️ EVERY NUMBER A SCRIPT SAYS MUST EXIST IN THE MAP. "400 founders" may only
// be spoken if memberCount says so — this is what turns a community fact into a
// checkable product fact rather than a sentence the model liked the sound of.
describe('a number may only be said if the map carries it', () => {
  it('offers only the figures that were actually stated', () => {
    const m: CommunityMap = { ...base, memberCount: '400 founders', cadence: '3 calls a week' }
    expect(quotableFigures(m)).toEqual(['400 founders', '3 calls a week'])
  })

  it('an unanswered figure is not quotable, and blank is not a figure', () => {
    expect(quotableFigures({ ...base, memberCount: null, price: '  ' })).toEqual([])
  })

  // ⚖️ AND AN UNUSABLE MAP QUOTES NOTHING, so a half-filled map cannot leak one
  // stray number into a script that has no community scene.
  it('an unusable map quotes nothing at all', () => {
    expect(quotableFigures({ ...base, surfaceIds: [], memberCount: '400 founders' })).toEqual([])
  })
})

describe('the column that holds it', () => {
  const repo = join(import.meta.dirname, '..', '..', '..', '..')
  const sql = readFileSync(join(repo, 'supabase', 'migrations', '0170_a_community_is_a_set_of_surfaces.sql'), 'utf8')

  // ⚠️ ADDITIVE AND RE-RUNNABLE. A migration that fails on its second run is a
  // migration that cannot be applied by hand safely, and this one has to be.
  it('is additive and survives being applied twice', () => {
    expect(sql).toMatch(/add column if not exists community_map jsonb/i)
    expect(sql).toMatch(/drop constraint if exists/i)
  })

  // ⚠️ A MAP THAT IS NOT AN OBJECT IS A BUG, NOT A VARIANT. Readers index into
  // it by key; an array or bare string reads as undefined at every field and
  // builds a community scene out of nothing, silently.
  it('refuses a map that is not an object, and allows null', () => {
    expect(sql).toMatch(/jsonb_typeof\(community_map\) = 'object'/)
    expect(sql).toMatch(/community_map is null or/i)
  })
})

it('is exported from the package index', () => {
  expect(typeof shared.surfacesFor).toBe('function')
  expect(typeof shared.needsCovering).toBe('function')
  expect(typeof shared.mapIsUsable).toBe('function')
})
