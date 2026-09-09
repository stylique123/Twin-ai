// A HAUL WITH NOTHING IN THE ROOM.
//
// ⚠️ MEASURED ON THE REAL CORPUS, 2026-09-09, BEFORE A SINGLE ROW HAD BEEN
// WRITTEN. `gallery_items` holds 15,671 cards and all three of 0106's columns
// are null in every one of them. The object markers select 476 of those cards —
// and 182 of the 476, THIRTY-EIGHT PERCENT, are the AI virtual-try-on cluster:
//
//   "The best haul is the one you didn't have to return 📦✨ Try it on before it
//    ships with TryBit. #VirtualTryOn #AITryOn"
//   "POV: my closet exists in AI now so obviously I needed a try-on haul"
//
// Both match `haul`. Both match `try-on`. Neither has a product in the room —
// they are phone-screen demonstrations of an app.
//
// ⚠️⚠️ AND THE WRONG ANSWER WOULD HAVE BEEN PERMANENT. The backfill's candidate
// filter is `where requirements_source is null`, so a card stamped by a false
// positive is excluded from every later pass — including the vision pass that
// would have seen there was nothing in shot. This is not a wrong answer that
// gets corrected; it is a wrong answer that closes the file.
//
// ⚖️ SO THE DISQUALIFIER RETURNS null, NEVER false. Text can establish that
// something IS in frame and can never establish that nothing is, and that
// asymmetry is the whole module.
import { describe, expect, it } from 'vitest'
import { assessFromText, isConclusive, OBJECT_DISQUALIFIERS } from '../referenceAssessment'

const card = (title: string, why = '104 views.') => ({ title, why })

/** Verbatim from production rows, trimmed only of emoji that add nothing. */
const VIRTUAL = [
  "The best haul is the one you didn't have to return. Try it on before it ships with TryBit. #TryBit #VirtualTryOn #OnlineShopping #FashionTok #AITryOn",
  'POV: my closet exists in AI now so obviously I needed a try-on haul. Which dress are you picking, 1, 2 or 3? #AITwin #AIInfluencer #AIFashion #VirtualTryOn #TryOnHaul',
  'Your new fitting room fits in your pocket. Upload one photo and see exactly how any outfit looks on you. #Fittly #virtualtryon #AIstyling #fashionAI #tryonhaul',
]

/** ⚠️ MISSED, AND RECORDED RATHER THAN QUIETLY DROPPED. This card is the same
 *  kind of thing and the list does not catch it: it matches `haul` through
 *  `#zarahaul` and says "virtually" and "#ai" without ever saying "virtual
 *  try-on". Catching it needs `'virtual'` or `' ai '` as a bare disqualifier,
 *  which would silence "virtually impossible" and a large slice of a corpus
 *  where "ai" is in every third hashtag.
 *
 *  ⚖️ SO THE MISS IS MEASURED INSTEAD. Of 480 candidates, 182 are caught and 35
 *  more contain `virtual`/`ai` and are not — roughly 84% of the suspicious
 *  cluster. That residual is the argument for the vision pass, not for a wider
 *  keyword. */
const KNOWN_MISS =
  'Now you can try all your outfits on virtually before ordering, no more bad orders #zara #ai #zarahaul #outfit #virtual'

/** Also verbatim, and these DO put a thing in front of a lens. */
const REAL = [
  '@Meta Glasses X Kylie Jenner unboxing, try on, & transition review #metaglasses #fashiontech',
  'Ich sag ehrlich die neuen Tech Fleeces kommen steinhart #streetwear #nike #techfleece #unboxing',
  'Kerzen-Business hacks fuer Anfaenger. Im Tedi findet man fast alles #tedihaul #candlemaking',
]

describe('a virtual try-on is not an object in the room', () => {
  it.each(VIRTUAL)('concludes nothing for: %s', (title) => {
    const a = assessFromText(card(title))
    // ⚠️ null, NOT false. "We could not tell from the text" and "there is
    // definitely nothing in shot" are different facts and only one is knowable.
    expect(a.requiresFilmingObjects).toBeNull()
    expect(isConclusive(a)).toBe(false)
  })

  it('carries no evidence for a card it disqualified', () => {
    // ⚖️ AN EMPTY EVIDENCE LIST IS THE HONEST OUTPUT. Reporting `haul` as
    // evidence while concluding nothing would be a claim with a citation and no
    // conclusion, which reads as a bug rather than a refusal.
    expect(assessFromText(card(VIRTUAL[0])).evidence).toEqual([])
  })
})

describe('and a real haul still is one', () => {
  it.each(REAL)('still concludes for: %s', (title) => {
    const a = assessFromText(card(title))
    expect(a.requiresFilmingObjects).toBe(true)
    expect(isConclusive(a)).toBe(true)
  })
})

describe('what this does not catch, stated', () => {
  it('still concludes for a virtual haul that never says "virtual try-on"', () => {
    // ⚠️ THIS TEST ASSERTS A WRONG ANSWER ON PURPOSE. It is here so the residual
    // is visible in the suite rather than discovered later as a surprise: 35 of
    // 480 candidates look like this. If a future change catches it, this test
    // fails and the number in the header above is what needs updating.
    expect(assessFromText(card(KNOWN_MISS)).requiresFilmingObjects).toBe(true)
  })
})

describe('the disqualifier does not reach past objects', () => {
  it('a screen marker still concludes even beside a disqualifier', () => {
    // ⚠️ THE POINT OF THE CLUSTER IS THAT IT IS A SCREEN, so a card that says
    // so must keep its screen answer. Disqualifying the OBJECT claim must not
    // silence the one thing these cards genuinely establish.
    const a = assessFromText(card('AI try-on haul, full screen recording of the app'))
    expect(a.requiresFilmingObjects).toBeNull()
    expect(a.requiresScreenRecording).toBe(true)
    expect(isConclusive(a)).toBe(true)
  })

  it('every disqualifier is lowercase, because the haystack is', () => {
    // A capitalised entry silently never matches — the corpus is lowercased
    // before comparison, so `AITryOn` would be dead weight that looks live.
    for (const d of OBJECT_DISQUALIFIERS) expect(d).toBe(d.toLowerCase())
  })
})
