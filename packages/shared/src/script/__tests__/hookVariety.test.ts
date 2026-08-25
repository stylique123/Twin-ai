import { describe, expect, it } from 'vitest'
import { COLLIDING_AT_LEAST, hookCollision, hookVarietyNote } from '../hookVariety'

/** ⚠️ A REAL PRODUCTION MENU. All five open identically. */
const ALL_FIVE_THE_SAME = [
  'Hey friends, I had this weird realisation that winning on the default path still felt empty.',
  'Hey friends, I am sharing the exact roadmap that gave me financial freedom.',
  'Hey friends, if you feel burnt out by hustle culture but still want to build something huge.',
  'Hey friends, my friend quit his prestige job and built a lifestyle business instead.',
  'Hey friends, I finally realised that treating your career like an optimisation game breaks you.',
]

/** ⚠️ ALSO REAL, AND GENUINELY VARIED — five different openings. */
const A_REAL_MENU = [
  'Everyone tells you to focus on organic content. Here is why that advice is wrong.',
  'If your business is making less than a million a year, stop worrying about brand.',
  'I lost everything twice before twenty seven because I followed these exact rules.',
  'Making money is a game of math, but most founders treat it like a feeling.',
  'The fastest way to kill your business is taking scaling advice from people who never scaled.',
]

describe('five options that open identically are not five options', () => {
  // ⚠️ THE COUNT IS THREE, NOT FIVE, AND THAT IS CORRECT. All five begin
  // "Hey friends," but the THIRD word splits them: "I" three times, then "if"
  // and "my". At the three-word window the largest group is three.
  //
  // ⚖️ AND THE WINDOW STAYS AT THREE. Two words would count all five here, but
  // it would also collide the genuinely varied "If you are..." / "If you
  // want..." / "If your business..." menu pinned further down — a real
  // production menu with five different angles. Catching this generation with
  // a count of three, rather than catching it with a five and inventing a
  // false positive elsewhere, is the trade this module makes deliberately.
  it('finds the collision in a real production menu', () => {
    const c = hookCollision(ALL_FIVE_THE_SAME)!
    expect(c.count).toBe(3)
    expect(c.total).toBe(5)
    expect(c.opening).toBe('Hey friends, I')
  })

  it('and says so in plain English', () => {
    expect(hookVarietyNote(ALL_FIVE_THE_SAME)).toBe(
      '3 of these 5 start with "Hey friends, I", so they are closer to one option than 5. Change a couple if you want something different to shoot next time.')
  })

  // ⚖️⚖️ THE JUDGMENT THIS MODULE TURNS ON. "Hey friends" is that creator's
  // real signature. The note must report that the CHOICES collide, never that
  // the WORDS are wrong.
  it('never criticises the creator’s own words', () => {
    const note = hookVarietyNote(ALL_FIVE_THE_SAME)!
    expect(note).not.toMatch(/\b(generic|cliché|cliche|boring|weak|bad|avoid|stop saying|overused|repetitive)\b/i)
  })
})

describe('a varied menu is left alone', () => {
  it('says nothing about five different openings', () => {
    expect(hookCollision(A_REAL_MENU)).toBeNull()
    expect(hookVarietyNote(A_REAL_MENU)).toBeNull()
  })

  // ⚖️ THE THRESHOLD, CHOSEN FROM THE DATA. Eight of 41 generations have some
  // PAIR sharing an opener; that is ordinary and still leaves real choice.
  // Flagging pairs would put a note on a fifth of everything for nothing.
  it('a mere pair is not a pattern', () => {
    const twoMatch = [
      'Hey friends, I had a realisation about money.',
      'Hey friends, I quit my job last year.',
      'Everyone tells you to focus on organic content.',
      'I lost everything twice before twenty seven.',
      'The fastest way to kill your business is bad advice.',
    ]
    expect(COLLIDING_AT_LEAST).toBe(3)
    expect(hookCollision(twoMatch)).toBeNull()
  })

  it('but three of five is', () => {
    const threeMatch = [
      'Hey friends, I had a realisation about money.',
      'Hey friends, I quit my job last year.',
      'Hey friends, I want to talk about burnout.',
      'I lost everything twice before twenty seven.',
      'The fastest way to kill your business is bad advice.',
    ]
    expect(hookCollision(threeMatch)!.count).toBe(3)
  })
})

describe('the opening is matched on words, not on punctuation or case', () => {
  it('ignores case and stray punctuation', () => {
    const c = hookCollision([
      'HEY FRIENDS, I did a thing.',
      'Hey friends -- I did another thing.',
      'hey friends! i did a third thing.',
    ])!
    expect(c.count).toBe(3)
  })

  // ⚠️ AND IT DOES NOT OVER-MATCH. Two hooks that merely both start "If you"
  // are different hooks; three leading words is the line.
  it('does not treat different hooks as the same', () => {
    expect(hookCollision([
      'If you are a solo founder, you need to hear this.',
      'If you want to buy yourself a boss, follow these steps.',
      'If your business makes under a million, stop worrying.',
    ])).toBeNull()
  })
})

describe('nothing to judge', () => {
  it.each([
    ['not an array', 'nope'],
    ['null', null],
    ['undefined', undefined],
    ['empty', []],
    ['too short to have a majority', ['One hook only.', 'One hook only.']],
  ])('%s reads as no collision', (_l, v) => {
    expect(hookCollision(v)).toBeNull()
    expect(hookVarietyNote(v)).toBeNull()
  })

  it('ignores blanks and non-strings among the options', () => {
    const c = hookCollision([
      'Hey friends, I did a thing.', '   ', null, 7,
      'Hey friends, I did another.', 'Hey friends, I did a third.',
    ] as unknown[])!
    expect(c.total).toBe(3)
    expect(c.count).toBe(3)
  })
})
