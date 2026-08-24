import { describe, it, expect } from 'vitest'
import { checkCommunityScene, unsupportedFigures, offMapLinks, surfacesNotInCatalog } from '../communityChecks'
import { BLUR_LINE } from '../shotGrammar'
import type { CommunityMap } from '../communityMap'
import * as shared from '../index'

const map: CommunityMap = {
  platform: 'skool',
  url: 'https://skool.com/founders',
  name: 'Founders',
  memberCount: '400 founders',
  cadence: '3 calls a week',
  surfaceIds: ['about', 'feed', 'classroom'],
}

// ⚠️ REPAIR, NOT REFUSE. A community scene is one beat of a script the creator
// has already paid for and is about to film. Rejecting the whole thing over one
// wrong surface costs them every good beat in it.
describe('a scene naming a surface that does not exist is repaired', () => {
  it.each(['leaderboard', 'dashboard', '', null, undefined])('%s falls back to the about page', (id) => {
    const r = checkCommunityScene({ surfaceId: id as string, direction: 'Hold the phone up' }, map)
    expect(r.scene.surfaceId).toBe('about')
    expect(r.repairs).toContain('surface_not_in_map')
  })

  it('a surface the creator ticked is left alone', () => {
    const r = checkCommunityScene({ surfaceId: 'classroom', direction: 'Hold the phone up' }, map)
    expect(r.scene.surfaceId).toBe('classroom')
    expect(r.repairs).not.toContain('surface_not_in_map')
  })
})

// ⚠️ APPENDED DETERMINISTICALLY, NEVER REQUESTED. Asking a model to remember a
// privacy line is asking it to be reliable about the one thing that must never
// be unreliable.
describe('the covering instruction is added, not hoped for', () => {
  it('a feed shot with unanswered permission gets it', () => {
    const r = checkCommunityScene({ surfaceId: 'feed', direction: 'Hold the phone up' }, map)
    expect(r.scene.direction).toContain(BLUR_LINE)
    expect(r.repairs).toContain('privacy_line_missing')
  })

  it('and is not added twice', () => {
    const once = checkCommunityScene({ surfaceId: 'feed', direction: 'Hold it up' }, map)
    const twice = checkCommunityScene(once.scene, map)
    expect(twice.repairs).not.toContain('privacy_line_missing')
    expect(twice.scene.direction).toBe(once.scene.direction)
  })

  it('the creator’s own post does not get it', () => {
    const r = checkCommunityScene(
      { surfaceId: 'feed', direction: 'Hold it up', proofItem: { label: 'my win', surface: 'feed', privacy: 'mine' } },
      map)
    expect(r.scene.direction).not.toContain(BLUR_LINE)
  })

  // ⚠️ THE ORDERING, AND THE FIRST VERSION OF THIS CASE COULD NOT SEE IT. It used
  // `dashboard` — not a crowd surface either way — so reordering the checks
  // produced an identical result and the mutation passed. `members` IS a crowd
  // surface and is NOT in this map, so the two orders differ: repaired first
  // gives an about page with no covering line; repaired last gives an about page
  // carrying a covering line for names it does not have.
  //
  // ⚖️ AND THAT IS NOISE RATHER THAN EXPOSURE, which is why the code comment was
  // narrowed too. Noise is still worth preventing — it is what teaches creators
  // to skip the instruction that matters.
  it('a crowd surface that is not in the map does not leave its covering line behind', () => {
    const r = checkCommunityScene({ surfaceId: 'members', direction: 'Hold it up' }, map)
    expect(r.scene.surfaceId).toBe('about')
    expect(r.scene.direction).not.toContain(BLUR_LINE)
  })
})

describe('the old world does not leak back in', () => {
  it.each([
    'Screen record the feed while you talk',
    'A screen capture of the classroom',
    'Record your screen showing the calendar',
  ])('%s becomes a hold-up', (d) => {
    const r = checkCommunityScene({ surfaceId: 'about', direction: d }, map)
    expect(r.repairs).toContain('screen_capture_direction')
    expect(r.scene.direction).toMatch(/hold your phone up/i)
  })
})

// ⚖️ REPORTED, NOT REWRITTEN. Deleting a number leaves a sentence with a hole in
// it, and silently changing what a creator says is worse than flagging it.
describe('a number is only sayable if the map carries it', () => {
  it('catches a figure nobody stated', () => {
    expect(unsupportedFigures('We are 900 people strong', map)).toEqual(['900'])
  })

  it('allows the figures the creator gave', () => {
    expect(unsupportedFigures('400 founders, 3 calls a week', map)).toEqual([])
  })

  // ⚖️ A BARE SINGLE DIGIT IS A TURN OF PHRASE, not a claim about the business.
  // Treating "the 1 thing" as unsupported makes the check fire constantly and
  // get switched off, which is how a real check dies.
  it('does not fire on a turn of phrase', () => {
    expect(unsupportedFigures('the 1 thing that changed', map)).toEqual([])
  })

  it('is reported on the scene rather than rewritten', () => {
    const r = checkCommunityScene({ surfaceId: 'about', spoken: 'We are 900 strong' }, map)
    expect(r.repairs).toContain('figure_not_in_map')
    expect(r.scene.spoken).toBe('We are 900 strong')
  })
})

describe('only the join page may be linked', () => {
  it('the map url is allowed', () => {
    expect(offMapLinks('Join at https://skool.com/founders', map)).toEqual([])
  })

  it.each([
    'https://discord.gg/xyz',
    'https://skool.com/founders/posts/123',
  ])('%s is flagged', (u) => {
    expect(offMapLinks(`Come here ${u}`, map).length).toBe(1)
  })

  it('trailing punctuation does not make the right link look wrong', () => {
    expect(offMapLinks('Join at https://skool.com/founders.', map)).toEqual([])
  })
})

// ⚠️ NO MAP MEANS NO SCENE AND NO REPAIR EITHER. There is nothing to repair a
// scene against, and inventing a surface is the guess the map exists to prevent.
describe('an unusable map buys silence', () => {
  it.each([null, undefined, { ...map, surfaceIds: [] }])('%s yields no_usable_map', (m) => {
    const r = checkCommunityScene({ surfaceId: 'feed', direction: 'x' }, m as CommunityMap)
    expect(r.repairs).toEqual(['no_usable_map'])
    expect(r.scene.surfaceId).toBe('feed')
  })
})

describe('a hand-edited map is reported, not silently shrunk', () => {
  it('names a surface no catalog offers', () => {
    expect(surfacesNotInCatalog({ ...map, surfaceIds: ['about', 'invented'] })).toEqual(['invented'])
  })

  it('a clean map reports nothing', () => {
    expect(surfacesNotInCatalog(map)).toEqual([])
  })
})

it('is exported from the package index', () => {
  expect(typeof shared.checkCommunityScene).toBe('function')
})
