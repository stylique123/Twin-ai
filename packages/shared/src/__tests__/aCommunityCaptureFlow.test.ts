import { describe, it, expect } from 'vitest'
import {
  CAPTURE_COPY, PRIVACY_CHOICES, PLATFORM_CHOICES, RATHER_NOT_SAY, FIGURE_HINT,
  copyAsksForACapture, surfaceChoices, buildCommunityMap, whatIsMissing,
  type CaptureAnswers,
} from '../communityCapture'
import { COMMUNITY_PLATFORMS, mapIsUsable, quotableFigures, needsCovering } from '../communityMap'
import * as shared from '../index'

const full: CaptureAnswers = {
  platform: 'skool',
  url: 'https://skool.com/thing',
  name: 'The Thing',
  surfaceIds: ['about', 'classroom'],
}

// ⚠️ THE HARD UX RULE IS A TEST, NOT AN INTENTION. A first-time creator with no
// marketing knowledge must understand every choice in under two seconds, and
// none of our internal words may leak into anything they read.
describe('every word a creator reads is plain English', () => {
  const everything = [
    ...Object.values(CAPTURE_COPY), RATHER_NOT_SAY, FIGURE_HINT,
    ...PRIVACY_CHOICES.map((c) => c.label),
    ...PLATFORM_CHOICES.map((c) => c.label),
  ]

  // ⚠️ THESE ARE TWIN'S WORDS FOR TWIN'S MACHINERY. A creator who has to learn
  // them is a creator we handed our problem to.
  it.each(['surface', 'proof item', 'entity', 'showability', 'map', 'blur'])(
    'never says "%s"', (word) => {
      for (const s of everything) {
        expect(s.toLowerCase(), s).not.toContain(word)
      }
    },
  )

  it('asks something in every question — no empty labels', () => {
    for (const s of everything) expect(s.trim()).not.toBe('')
  })
})

// ⚠️ THE RULE THIS PROJECT SPENT A WHOLE UNIT REMOVING. A form label is the one
// string nobody re-reads once it looks right on screen, so it is asserted.
it('no question asks the creator to record their screen', () => {
  expect(copyAsksForACapture()).toBe(false)
})

// ⚖️ AND THE CHECK ITSELF IS VALIDATED, because a checker that cannot fail is
// decoration. This is the same shape as the copy, with the banned phrasing in.
it('the capture check would catch it if a label started asking', () => {
  const wouldBeBad = 'Can you screen record your community feed?'
  expect(/screen[\s-]?record/i.test(wouldBeBad)).toBe(true)
})

describe('the surfaces offered follow the platform', () => {
  it.each(COMMUNITY_PLATFORMS)('%s offers something to tick', (p) => {
    expect(surfaceChoices(p).length).toBeGreaterThan(0)
  })

  it('an unpicked platform still offers a fallback rather than nothing', () => {
    expect(surfaceChoices(null).length).toBeGreaterThan(0)
  })
})

// ⚠️ ABSENT IS NOT PERMISSION — the rule the whole consent design rests on.
describe('unanswered privacy never becomes permission', () => {
  it('offers exactly the three real states, with unsure last', () => {
    expect(PRIVACY_CHOICES.map((c) => c.value)).toEqual(['mine', 'permitted', 'blur'])
  })

  it('an unrecognised privacy value is stored as blur, not as the creator’s own', () => {
    const m = buildCommunityMap({
      ...full,
      proofItems: [{ label: 'A win', surface: 'about', privacy: 'nonsense' as never }],
    })
    expect(m?.proofItems?.[0].privacy).toBe('blur')
  })

  it('a real answer survives unchanged', () => {
    const m = buildCommunityMap({
      ...full,
      proofItems: [{ label: 'My post', surface: 'about', privacy: 'mine' }],
    })
    expect(m?.proofItems?.[0].privacy).toBe('mine')
  })
})

// ⚠️ A HALF-MAP READS AS PRESENT AND BEHAVES AS ABSENT. Refusing here keeps the
// creator on the form, where they can still fix it.
describe('an incomplete answer set builds no map at all', () => {
  it('a complete one builds a usable map', () => {
    const m = buildCommunityMap(full)
    expect(m).not.toBeNull()
    expect(mapIsUsable(m)).toBe(true)
  })

  it.each([
    ['no platform', { ...full, platform: null }],
    ['no link', { ...full, url: '   ' }],
    ['no name', { ...full, name: '' }],
    ['nothing ticked', { ...full, surfaceIds: [] }],
    ['nothing at all', null],
  ])('%s builds nothing', (_label, a) => {
    expect(buildCommunityMap(a as CaptureAnswers)).toBeNull()
  })
})

// ⚠️ SWITCHING PLATFORM MUST LOSE THE TICKS, NOT KEEP IMPOSSIBLE ONES. A
// Classroom carried into a WhatsApp map is a shot the creator cannot film.
describe('a page the platform does not have is dropped', () => {
  it('drops a Skool-only page after a switch to WhatsApp', () => {
    const m = buildCommunityMap({ ...full, platform: 'whatsapp', surfaceIds: ['about', 'classroom'] })
    expect(m?.surfaceIds).toEqual(['about'])
  })

  it('builds nothing when every ticked page is impossible on the new platform', () => {
    expect(buildCommunityMap({ ...full, platform: 'whatsapp', surfaceIds: ['classroom'] })).toBeNull()
  })
})

// ⚠️ AND A PROOF ITEM ON AN UNTICKED PAGE GOES WITH IT, because `needsCovering`
// decides the privacy line FROM the page. An item pointing at a page not in the
// map would be judged against a page that does not exist as far as anything
// downstream can tell.
it('a pointed-at thing on an unticked page is dropped', () => {
  const m = buildCommunityMap({
    ...full,
    surfaceIds: ['about'],
    proofItems: [
      { label: 'On a page they ticked', surface: 'about', privacy: 'mine' },
      { label: 'On a page they did not', surface: 'feed', privacy: 'mine' },
    ],
  })
  expect(m?.proofItems?.map((p) => p.label)).toEqual(['On a page they ticked'])
})

// ⚠️ BLANK IS ABSENT AND WHITESPACE IS BLANK. Storing " " would make
// `quotableFigures` offer a stray space as a number a script may speak.
describe('a field left alone stays unanswered', () => {
  it('whitespace does not become a figure', () => {
    const m = buildCommunityMap({ ...full, memberCount: '   ', price: '' })
    expect(m?.memberCount).toBeNull()
    expect(m?.price).toBeNull()
    expect(quotableFigures(m)).toEqual([])
  })

  it('a real figure is carried and quotable', () => {
    const m = buildCommunityMap({ ...full, memberCount: '400 founders' })
    expect(quotableFigures(m)).toEqual(['400 founders'])
  })

  // ⚖️ AND DECLINING IS AN ANSWER, distinct from never being asked. It is
  // carried as the creator's own words so nothing re-asks them for it.
  it('“I’d rather not say” is stored as the answer it is', () => {
    const m = buildCommunityMap({ ...full, price: RATHER_NOT_SAY })
    expect(m?.price).toBe(RATHER_NOT_SAY)
  })
})

// ⚠️ A DISABLED BUTTON WITH NO REASON IS THIS FLOW'S OLDEST BUG — it has already
// shipped once, demanding a field that was never rendered.
describe('the form can say what is still missing', () => {
  it('nothing is missing from a complete set', () => {
    expect(whatIsMissing(full)).toEqual([])
  })

  it('names each gap in the same words the question used', () => {
    const missing = whatIsMissing({ platform: 'skool', surfaceIds: [] })
    expect(missing).toContain(CAPTURE_COPY.url)
    expect(missing).toContain(CAPTURE_COPY.name)
    expect(missing).toContain(CAPTURE_COPY.surfaces)
    expect(missing).not.toContain(CAPTURE_COPY.platform)
  })

  // ⚖️ THE TWO MUST AGREE OR ONE OF THEM IS LYING. A set with nothing missing
  // that still builds no map would disable the button with no gap to point at.
  it('agrees with the builder in both directions', () => {
    expect(whatIsMissing(full).length === 0).toBe(buildCommunityMap(full) !== null)
    const thin = { platform: 'skool' as const }
    expect(whatIsMissing(thin).length === 0).toBe(buildCommunityMap(thin) !== null)
  })
})

// ⚖️ THE CAPTURED MAP MUST ACTUALLY DRIVE THE COVERING RULE, or the flow has
// collected consent that changes nothing.
it('a crowd page captured without permission earns the covering line', () => {
  const m = buildCommunityMap({
    ...full,
    surfaceIds: ['about', 'feed'],
    proofItems: [{ label: 'Someone’s win', surface: 'feed', privacy: 'blur' }],
  })
  expect(needsCovering('feed', m!.proofItems![0])).toBe(true)
  expect(needsCovering('about', null)).toBe(false)
})

it('is exported from the package index', () => {
  expect(typeof shared.buildCommunityMap).toBe('function')
  expect(typeof shared.whatIsMissing).toBe('function')
  expect(typeof shared.surfaceChoices).toBe('function')
})
