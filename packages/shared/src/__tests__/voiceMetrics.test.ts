// MEASURED FROM REAL TITLES — the fixtures are verbatim from the 2026-08-11 scan.
import { describe, expect, it } from 'vitest'
import { voiceMetrics, voiceMetricsPromptLine } from '../voiceMetrics'

/** Kallaway, TikTok. The scan found ZERO question-openers in 50 titles, and the
 *  writer still gave him four out of four. This is the defect in fixture form. */
const KALLAWAY = [
  "This Chinese 'ghost factory' operates in total darkness",
  'Google just invented AI that lets humans talk to dolphins',
  'The most advanced robot hand ever built',
  'ASML just shipped the machine that makes every chip',
  'A Japanese farmer built an AI that sorts broccoli',
  "The world's first skin-cancer detecting robot",
  'Midjourney just changed how films get made',
  'This soccer ball generates electricity',
  'Boston Dynamics just taught Atlas to build',
  'The AI that reads 1000 year old scrolls',
]

/** Johnny, YouTube shorts — questions, SHOUTING and hashtags. */
const JOHNNY = [
  'Is this the PERFECT Foldable phone design? #samsungzfold8',
  "This is the phone Google DOESN'T want you to buy #googlepixel1",
  'Can this IPHONE be fixed?!! #iphone14promax',
  'I bought the most UNIQUE Samsung phone #samsunga80',
  'Can this phone REPLACE my iPhone? #googlepixel',
  'Is the NEW SIRI actually USEFUL NOW?! #siriai',
  'AM I giving away a FAKE iPhone #iphone16',
  'Is this the most OVERKILL smartphone?! #ruggedphone',
  'HIDDEN iPhone Features PART 2 #ios',
  'These iPhones will NOT GET iOS 27 #ios27',
]

describe('a rate can be violated; an adjective cannot', () => {
  it('finds the zero that the adjectives missed', () => {
    // The single fact that would have stopped four wrong hooks.
    expect(voiceMetrics(KALLAWAY).questionOpenRate).toBe(0)
    expect(voiceMetrics(JOHNNY).questionOpenRate).toBeGreaterThan(40)
  })

  it('separates two tech creators an adjective would call identical', () => {
    const k = voiceMetrics(KALLAWAY)
    const j = voiceMetrics(JOHNNY)
    // Both are "energetic tech creators". They package nothing alike.
    expect(j.shoutRate).toBeGreaterThan(k.shoutRate)
    expect(j.firstPersonRate).toBeGreaterThan(k.firstPersonRate)
  })

  it('reports the sample size rather than hiding it', () => {
    expect(voiceMetrics(KALLAWAY).sampled).toBe(10)
    expect(voiceMetrics([]).sampled).toBe(0)
  })
})

describe('the prompt line instructs only where the evidence is decisive', () => {
  it('turns a measured zero into an explicit prohibition', () => {
    const line = voiceMetricsPromptLine(voiceMetrics(KALLAWAY), 5)
    expect(line).toMatch(/almost NEVER package a video as a question/)
    expect(line).toMatch(/Do not write a question hook/)
    expect(line).toMatch(/0% of 10/)
  })

  it('SAYS NOTHING when the sample cannot support a claim about habits', () => {
    // ⚖️ Twelve titles cannot establish that someone "never" does a thing.
    // A fabricated habit is the same class of error as a fabricated opinion.
    expect(voiceMetricsPromptLine(voiceMetrics(KALLAWAY.slice(0, 4)))).toBe('')
    expect(voiceMetricsPromptLine(voiceMetrics([]))).toBe('')
  })

  it('stays silent on a middling rate rather than inventing a rule', () => {
    // 38% is a tendency, not a rule. Only 0-ish and high-ish become instructions.
    const mixed = [...KALLAWAY.slice(0, 6), ...JOHNNY.slice(0, 4)]
    const line = voiceMetricsPromptLine(voiceMetrics(mixed), 5)
    expect(line).not.toMatch(/NEVER package a video as a question/)
    expect(line).not.toMatch(/usually package as a question/)
  })

  it('never claims a top opener from a coincidence', () => {
    // Two occurrences in fifty is noise; the field stays null.
    expect(voiceMetrics(KALLAWAY).topOpener).toBeNull()
    expect(voiceMetrics(['Stop this', 'Stop that', 'Stop it', 'Other']).topOpener).toBe('stop')
  })

  it('says out loud that it describes packaging, not body prose', () => {
    // Titles are how they PACKAGE. Applying them to spoken prose would be
    // inference dressed as measurement.
    expect(voiceMetricsPromptLine(voiceMetrics(JOHNNY), 5)).toMatch(/NOT rules about body prose/)
  })
})
