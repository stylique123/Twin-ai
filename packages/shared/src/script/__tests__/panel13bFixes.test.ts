// Panel 13b labels (9 Nov): seven fixes, panel accounts only. Each case is the
// line the reader marked, written as a test BEFORE the fix.
import { describe, it, expect } from 'vitest'
import { repairRobotLine, robotPass, splitForCadence } from '../robotPhrases'
import { gateAnswer } from '../answerGate'
import { needsStoryAsk } from '../productFactScope'
import { stripSpokenFiller } from '../scriptHygiene'
import { panelFinalPass, attachStories } from '../panelFinalPass'

const CTA = 'Tickets for Pip and Sprocket Live at https://example.com/pip-live'
const beats = (...l: string[]) => l.map((line, i) => ({ section: i === 0 ? 'Hook' : i === l.length - 1 ? 'CTA' : `Beat ${i}`, line }))
const text = (b: Array<{ line?: unknown }>) => b.map((x) => String(x.line)).join(' ')

describe('1. URLs are byte-for-byte safe', () => {
  it('the robot pass keeps the Pip and Sprocket CTA exactly', () => {
    expect(repairRobotLine(CTA).line).toBe(CTA)
    expect(repairRobotLine(`${CTA}.`).line).toBe(`${CTA}.`)
    const r = robotPass(beats('Puppets are for grown-ups too.', 'Sprocket sings, badly, every night.', CTA))
    expect(r.beats[2].line).toBe(CTA)
  })
  it('cadence splitting never cuts inside a URL', () => {
    const long = `Grab your seats for the silly show, the sing-along and the very serious puppet, ${CTA}, see you there.`
    expect(splitForCadence(long, 10).line).toContain('https://example.com/pip-live')
  })
  it('a stored answer keeps its URL', () => {
    expect(gateAnswer(CTA, {}).keptText).toBe(CTA)
  })
  it('the final pass keeps the URL', () => {
    const r = panelFinalPass(beats('Puppets are for grown-ups too.', 'Sprocket sings, badly, every night.', 'It is written for adults.', CTA), { request: 'Pip and Sprocket Live', material: CTA, stories: [], products: [] })
    expect(r.beats[3].line).toBe(CTA)
  })
})

const calmCream = { id: 'cream', name: 'Calm Cream', facts: ['$28 for a 50 ml jar', '50 ml glass jar', 'Fragrance-free, with no essential oils', 'Made in small batches of sixty jars'] }
const meltBalm = { id: 'balm', name: 'Melt Balm', facts: ['$22 for a 90 g tin', '90 g tin', 'A cleansing balm that rinses off with warm water', 'Made in small batches and poured by hand into each tin'] }
const glowStories = [
  'I made the first jar of the moisturizer in my kitchen because every store cream I tried left my cheeks red by lunchtime.',
  'My first batch separated in the jar overnight, and I threw out forty jars before I got the emulsion right.',
  'Before Calm Cream, I patch-tested each new version on my inner arm for three days and kept a simple chart of any redness.',
  'I think fragrance is in most skincare for the shopper, not for the skin.',
]

describe('2. wrong-product stories', () => {
  it('ties the forty-jars story to the moisturizer (it implies the jar), not the balm', () => {
    const p = attachStories([calmCream, meltBalm], glowStories)
    expect(p.find((x) => x.id === 'cream')!.facts.some((f) => /forty jars/.test(f))).toBe(true)
    expect(p.find((x) => x.id === 'balm')!.facts.some((f) => /forty jars/.test(f))).toBe(false)
  })
  it('cuts the moisturizer\'s batch story from a Melt Balm script', () => {
    const r = panelFinalPass(beats('My cleansing step got simpler.', 'My first batch separated overnight, and I threw out forty jars before I got it right.', 'Melt Balm rinses off with warm water.', 'Each tin is poured by hand.', 'Melt Balm, link in bio.'),
      { request: 'Melt Balm', material: glowStories.join(' '), stories: glowStories, products: [calmCream, meltBalm], subjectId: 'balm' })
    expect(text(r.beats)).not.toMatch(/forty jars/)
    expect(r.cut.wrong_story).toBe(1)
  })
  it('keeps the same story in a Calm Cream script', () => {
    const b = beats('My skin stopped stinging.', 'My first batch separated overnight, and I threw out forty jars.', 'Calm Cream is fragrance-free.', 'It comes in a 50 ml glass jar.', 'Calm Cream, link in bio.')
    const r = panelFinalPass(b, { request: 'Calm Cream', material: glowStories.join(' '), stories: glowStories, products: [calmCream, meltBalm], subjectId: 'cream' })
    expect(r.cut.wrong_story).toBe(0)
    expect(text(r.beats)).toMatch(/forty jars/)
  })
})

describe('3. ask when there is no material', () => {
  const potter = ['My first kiln load came out with every mug glued to the shelf because I glazed the bottoms.', 'I think a bare clay foot is honest, mind you, it shows what the mug is made of.']
  const signal = ['I asked an AI tool to summarize my own newsletter and it confidently quoted a sentence I never wrote.', 'I tested three AI summarizers on the same issue of my newsletter, and the catch was only one kept the numbers right.']
  const coach = ['One of my first clients trained in a hallway with one pair of dumbbells, and we built her whole plan around that hallway.', 'The first time I tried a deadlift I copied a video and my lower back felt it for a week, which is why I teach the hip hinge with a broomstick first.']
  it('asks for "things only potters say"', () => {
    expect(needsStoryAsk('things only potters say out loud in the studio', potter, { stories: potter }).ask).toBe(true)
  })
  it('asks for "how I decide which story leads the newsletter"', () => {
    expect(needsStoryAsk('how I decide which story leads the newsletter', signal, { stories: signal }).ask).toBe(true)
  })
  it('asks for a "client story" with no matching client story', () => {
    expect(needsStoryAsk('stay close to this student taught the teacher video for a client story', coach, { stories: coach }).ask).toBe(true)
  })
  it('asks for any request whose topic nothing she has said touches', () => {
    expect(needsStoryAsk('how to wash wool gently', ['I make handmade kitchen pottery.']).ask).toBe(true)
  })
  it('asks for "the day I nearly quit roasting" when roasting stories never mention quitting', () => {
    expect(needsStoryAsk('the day I nearly quit roasting', ['I started roasting in my garage with a popcorn popper.'], { stories: ['I started roasting in my garage with a popcorn popper.'] }).ask).toBe(true)
  })
  it('writes when a story matches', () => {
    expect(needsStoryAsk('why the bottom of a handmade mug is not glazed', potter, { stories: potter }).ask).toBe(false)
    expect(needsStoryAsk('my first kiln load', potter, { stories: potter }).ask).toBe(false)
    expect(needsStoryAsk('how to tell if your coffee beans are stale', ['To check if your beans are stale, read the roast date.']).ask).toBe(false)
  })
})

describe('4. filler cleanup on every copied line', () => {
  const flow7 = "I think, um, … so yeah, I mean, most small shops don't actually need a help desk."
  it('strips the FlowDesk opinion line', () => {
    expect(stripSpokenFiller(flow7, true)).toBe("I think most small shops don't actually need a help desk.")
  })
  it('the final pass cleans an opinion line added after hygiene', () => {
    const r = panelFinalPass(beats('Stop answering twice.', 'Tag every email for a week.', flow7, 'Try FlowDesk free for 14 days.'), { request: 'why small teams should not buy a help desk yet', material: flow7, stories: [flow7], products: [] })
    expect(text(r.beats)).not.toMatch(/\bum\b|so yeah|I mean|…/)
    expect(r.cut.filler).toBe(1)
  })
})

describe('5. "why X and the one change that fixes it"', () => {
  const coffee = ['Harbor Blend is a medium roast I make for drip and pour-over.', 'If your pour-over tastes sour, grind a step finer; that is the first thing I change.']
  it('puts her grind change in when the script left it out, and cuts the unbacked result', () => {
    const r = panelFinalPass(beats('Sour pour-over? It is not the beans.', 'Most people brew too fast.', 'Fix that and the sourness disappears.', 'Follow for more brewing tips.'),
      { request: 'why your pour over tastes sour and the one grind change that fixes it', material: coffee.join(' '), stories: coffee, products: [] })
    expect(text(r.beats)).toMatch(/grind a step finer/)
    expect(text(r.beats)).not.toMatch(/disappears/)
    expect(r.cut.change_added).toBe(1)
    expect(r.cut.unbacked_result).toBe(1)
  })
  it('asks when her material has no change for it', () => {
    expect(needsStoryAsk('why your pour over tastes sour and the one grind change that fixes it', ['Harbor Blend is a medium roast I make for drip and pour-over.'], { stories: ['Harbor Blend is a medium roast I make for drip and pour-over.'] }).ask).toBe(true)
  })
})

describe('6. no invented pressure, customer behaviour or false cause', () => {
  const tide = { id: 'mug', name: 'Tide Mug', facts: ['$38 per mug', 'Dishwasher safe, with an unglazed foot'] }
  const potter = 'Before glazing I wax the foot, wipe a finger\'s width above it with a damp sponge, and let it dry overnight.'
  it('cuts "before they\'re gone" and "people always ask"', () => {
    const r = panelFinalPass(beats('This mug holds the tide.', 'People always ask me how the glaze pools.', 'The Tide Mug is $38.', 'Grab one before they\'re gone. Link in bio.'),
      { request: 'Tide Mug', material: potter, stories: [potter], products: [tide], subjectId: 'mug' })
    expect(text(r.beats)).not.toMatch(/before they're gone|people always ask/i)
    expect(text(r.beats)).toMatch(/Link in bio/)
    expect(r.cut.pressure).toBe(2)
  })
  it('keeps urgency she said herself', () => {
    const r = panelFinalPass(beats('New batch.', 'It is $38.', 'It holds 12 oz.', 'Launch price until the end of the month.'),
      { request: 'Tide Mug', material: 'Launch price until the end of the month', stories: [], products: [] })
    expect(r.cut.pressure).toBe(0)
  })
  it('drops the false cause "wax the foot, so it\'s dishwasher safe" and keeps both true facts', () => {
    const r = panelFinalPass(beats('Why is the bottom bare?', 'I wax the foot, so it\'s dishwasher safe.', 'The Tide Mug is $38.', 'Link in bio.'),
      { request: 'Tide Mug', material: `${potter} Dishwasher safe, with an unglazed foot`, stories: [potter], products: [tide], subjectId: 'mug' })
    expect(text(r.beats)).not.toMatch(/so it's dishwasher/i)
    expect(text(r.beats)).toMatch(/I wax the foot\. It's dishwasher safe\./)
    expect(r.cut.false_cause).toBe(1)
  })
})

describe('7. repeat check', () => {
  const arm = 'The first time I performed Sprocket live, his arm fell off mid-joke and the crowd laughed harder at that than at anything I wrote.'
  const pipStories = [arm, 'Backstage, Sprocket\'s spare arm lives in a sock drawer, and once I grabbed a sock instead.', 'I once forgot the whole second act and Sprocket improvised a complaint about the lighting.']
  it('keeps the arm-falls story once (plus a hook tease), not three times', () => {
    const r = panelFinalPass(beats('His arm fell off. Mid-joke.', 'The first time we played live, Sprocket\'s arm fell off mid-joke.', 'The crowd laughed harder at that than at anything I wrote.', 'And when that arm fell off, the room was ours.', 'Remember: the arm fell off and they loved it.', 'Tickets at https://example.com/pip-live'),
      { request: 'the worst thing that went wrong live on air', material: pipStories.join(' '), stories: pipStories, products: [] })
    const tellings = r.beats.filter((b) => /arm fell off/i.test(String(b.line))).length
    expect(tellings).toBeLessThanOrEqual(2)
    expect(r.cut.story_repeat).toBeGreaterThanOrEqual(2)
  })
  it('cuts scarf lines that restate facts already said', () => {
    const scarf = { id: 'scarf', name: 'Harbor Fog Scarf', facts: ['Hand-woven from undyed wool', 'About 180 cm long and 30 cm wide', 'Woven by hand on a floor loom, then washed and pressed', '$85 per scarf'] }
    const b = beats('The first scarf took a whole winter.', 'The Harbor Fog Scarf is hand-woven from undyed wool.', 'It is about 180 cm long and 30 cm wide.', 'I weave it on a floor loom, then wash and press it.', 'It is $85.', 'Slowly, it comes right.', 'Thread by thread.', 'Undyed wool, hand-woven, nothing added.', 'It measures 180 by 30 cm.', 'Harbor Fog Scarf, link in bio.')
    const r = panelFinalPass(b, { request: 'Harbor Fog Scarf', material: scarf.facts.join(' '), stories: [], products: [scarf], subjectId: 'scarf' })
    expect(text(r.beats)).not.toMatch(/Undyed wool, hand-woven|180 by 30/)
    expect(r.cut.fact_repeat).toBe(2)
    expect(text(r.beats)).toMatch(/link in bio/)
  })
})

describe('CTA protection (review of #1356)', () => {
  const harbor = { id: 'harbor', name: 'Harbor Blend', facts: ['$17 for a 12 oz bag', '12 oz whole-bean bag', 'Roasted on Tuesdays and shipped within two days of roasting'] }
  const ctx = { request: 'Harbor Blend', material: harbor.facts.join('\n'), stories: [], products: [harbor], subjectId: 'harbor', offers: ['Harbor Blend, 12 oz bags at https://example.com/harbor'] }
  it('keeps a CTA sentence that repeats an earlier fact, with its link', () => {
    const cta = 'Grab a 12 oz bag of Harbor Blend at https://example.com/harbor.'
    const r = panelFinalPass(beats('Fresh beans change everything.', 'Harbor Blend is a 12 oz whole-bean bag.', 'I roast it on Tuesdays and ship within two days.', cta), ctx)
    expect(r.beats[r.beats.length - 1].line).toBe(cta)
    expect(r.cut.fact_repeat).toBe(0)
  })
  it('keeps "link in bio" and offer-text sentences under the pressure, result and false-cause cuts', () => {
    const r = panelFinalPass(beats('Fresh beans change everything.', 'It is roasted on Tuesdays.', 'It ships in two days.', 'Hurry, link in bio. Harbor Blend, 12 oz bags at https://example.com/harbor, so it\'s always fresh.'), ctx)
    expect(r.beats[r.beats.length - 1].line).toBe('Hurry, link in bio. Harbor Blend, 12 oz bags at https://example.com/harbor, so it\'s always fresh.')
    expect(r.cut.pressure + r.cut.false_cause).toBe(0)
  })
})
