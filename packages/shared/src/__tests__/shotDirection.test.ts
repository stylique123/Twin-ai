// THE FOUR LAYERS, and the palette that must not be reachable from two of them.
//
// Every fixture below is a real string from a production run. The point of using
// them verbatim is that a plausible-looking rule can pass on invented examples
// and still miss the sentence that actually shipped — which is how "be inside
// footage that does not exist" survived a prompt rule telling it not to.
import { describe, expect, it } from 'vitest'
import {
  emptyShotDirection, stripPalette, hasPalette, readShotDirection,
  placeToStand, brollAllowed,
} from '../shotDirection'

// ── The real strings ──────────────────────────────────────────────────────
const B_ROLL_AS_LOCATION =
  'Real footage of a dusty, outdated living room being framed out into separate bedrooms'
const EDIT_AS_LOCATION =
  'Footage of a beautifully staged communal living room, then cutting back to the creator in the kitchen'
const PALETTE_LEAK =
  'Same brightly lit kitchen, ensuring the #00E5FF cyan lights are visible'
const RATIONALISED_LEAK =
  'Stark white wall, creator wearing a plain black t-shirt to emphasize the brand colors (#000000 and #FFFFFF)'

describe('the palette is removed, not argued with', () => {
  it('strips the hex and the clause that was reaching for it', () => {
    // §5d's finding: the leak EXPLAINS ITSELF. The model believes connecting
    // wardrobe to brand colour is what the field is for, and you cannot tune
    // away confident correctness.
    const out = stripPalette(RATIONALISED_LEAK)
    expect(out).not.toBeNull()
    expect(hasPalette(out)).toBe(false)
    expect(out).not.toMatch(/brand colors/i)
    // And the useful half survives — the creator still knows where to stand.
    expect(out).toContain('Stark white wall')
    expect(out).toContain('black t-shirt')
  })

  it('leaves no empty parenthesis or dangling punctuation behind', () => {
    // Deleting the code out of "(#000000 and #FFFFFF)" and leaving "()" still
    // instructs the impossible thing, and now looks like a bug as well.
    const out = stripPalette(RATIONALISED_LEAK) ?? ''
    expect(out).not.toMatch(/\(\s*\)/)
    expect(out).not.toMatch(/[,;]\s*$/)
  })

  it('strips a hex from a lighting instruction and keeps the direction', () => {
    const out = stripPalette(PALETTE_LEAK)
    expect(hasPalette(out)).toBe(false)
    expect(out).toContain('brightly lit kitchen')
  })

  it('handles both hex lengths and either case', () => {
    expect(hasPalette('#fff')).toBe(true)
    expect(hasPalette('#FFAA00')).toBe(true)
    expect(stripPalette('a wall #fff')).toBe('a wall')
  })

  it('a field that was ONLY a colour becomes null, not an empty string', () => {
    // An empty string reads as "specified, and blank" to every consumer.
    expect(stripPalette('#00E5FF')).toBeNull()
    expect(stripPalette('   ')).toBeNull()
    expect(stripPalette(null)).toBeNull()
  })

  it('does not eat an ordinary sentence that mentions a colour by name', () => {
    // "Blue wall" is achievable direction. Only the palette is unreachable.
    expect(stripPalette('A plain blue wall behind you')).toBe('A plain blue wall behind you')
  })
})

describe('a legacy background NEVER becomes a location', () => {
  // ⚖️ THE DECISION, with a real population behind it: production holds 39
  // generations carrying 87 non-empty `background` strings. They are not
  // backfilled, because splitting one requires inventing which half was the
  // location — and that invention is the defect itself.

  it('routes the pre-split string to legacyCombined and leaves location null', () => {
    const d = readShotDirection({ background: B_ROLL_AS_LOCATION })
    expect(d.location).toBeNull()
    expect(d.legacyCombined).toBe(B_ROLL_AS_LOCATION)
  })

  it('does the same for the one that was an edit instruction', () => {
    const d = readShotDirection({ background: EDIT_AS_LOCATION })
    expect(d.location).toBeNull()
    expect(d.editorIntent).toBeNull()
    expect(d.legacyCombined).toBe(EDIT_AS_LOCATION)
  })

  it('strips the palette from a legacy string too', () => {
    // A hex code in an instruction a person carries out with their hands is
    // always wrong, whenever it was written.
    const d = readShotDirection({ background: PALETTE_LEAK })
    expect(hasPalette(d.legacyCombined)).toBe(false)
    expect(d.legacyCombined).toContain('brightly lit kitchen')
  })

  it('a consumer that needs a place to stand gets the legacy string, unchanged', () => {
    // No regression for the 39 already in production: the recorder shows what
    // it shows today.
    const d = readShotDirection({ background: B_ROLL_AS_LOCATION })
    expect(placeToStand(d)).toBe(B_ROLL_AS_LOCATION)
  })

  it('the new fields win when a beat carries both', () => {
    const d = readShotDirection({
      background: B_ROLL_AS_LOCATION,
      location: 'Clean neutral wall, facing the window',
    })
    expect(d.location).toBe('Clean neutral wall, facing the window')
    expect(d.legacyCombined).toBeNull()
    expect(placeToStand(d)).toBe('Clean neutral wall, facing the window')
  })
})

describe('the four layers stay separate', () => {
  it('reads each field from either casing', () => {
    const snake = readShotDirection({
      location: 'Clean wall', broll_request: 'City street', editor_intent: 'Cut away on "math"',
      wardrobe: 'Plain dark tee',
    })
    const camel = readShotDirection({
      location: 'Clean wall', brollRequest: 'City street', editorIntent: 'Cut away on "math"',
      wardrobe: 'Plain dark tee',
    })
    expect(snake).toEqual(camel)
  })

  it('NEVER hands b-roll or edit intent to someone looking for a place to stand', () => {
    // The two fields that produced "be inside footage that does not exist". No
    // fallback chain may reach them.
    const d = readShotDirection({
      broll_request: B_ROLL_AS_LOCATION,
      editor_intent: EDIT_AS_LOCATION,
    })
    expect(placeToStand(d)).toBeNull()
  })

  it('keeps a colour reference in b-roll, which is art direction not an instruction', () => {
    // Nobody performs a b-roll note with their hands, so a palette reference
    // there is legitimate. The boundary is about physical instructions.
    const d = readShotDirection({ broll_request: 'Line graph drawn in #FFFF00' })
    expect(d.brollRequest).toContain('#FFFF00')
  })

  it('an unspecified field is null, never an empty string', () => {
    expect(readShotDirection({})).toEqual(emptyShotDirection())
    expect(readShotDirection({ location: '   ' }).location).toBeNull()
    expect(readShotDirection(null)).toEqual(emptyShotDirection())
  })
})

describe('b-roll is gated on what this creator can actually produce', () => {
  const d = readShotDirection({ broll_request: 'Animated line graph flatlining' })

  it('allows it only on an explicit yes', () => {
    expect(brollAllowed(d, true)).toBe(true)
  })

  it('refuses on no, and refuses on UNANSWERED', () => {
    // The same direction `showability` refuses: this decides whether a beat
    // DEPENDS on footage that may never arrive, so silence cannot be a yes.
    // §5d's animated flatlining line graph was handed to a solo founder.
    expect(brollAllowed(d, false)).toBe(false)
    expect(brollAllowed(d, null)).toBe(false)
    expect(brollAllowed(d, undefined)).toBe(false)
  })

  it('is false when there is no request to gate', () => {
    expect(brollAllowed(emptyShotDirection(), true)).toBe(false)
  })
})
