import { describe, expect, it } from 'vitest'
import {
  confirmedPromotionText, ctaFitsGoal, ctaForGoal, ctaGoalPromptRule, factReachesWriter,
  findRebuttalFraming, isPromotional, promotionBacked, rebuttalFramingAllowed, rebuttalPromptRule,
  removeUnbackedPromotion, removeUnbackedPromotions, repairCtaForGoal, repairRebuttalFraming,
  shotListClaimDiff, stripRebuttalFraming,
} from '../goalFidelity'
import { syncShotListSpokenText } from '../shotListSync'

// Lines verbatim from real generations of owner 8940bed4 (voice d4d49c98).
const GEN_81CF = [ // goal: leads — "I still think" ×3, hook contradicts tension
  { section: 'Hook', line: 'I still think keeping a strict turnaround rule makes sense, even for a special rescue pup.' },
  { section: 'Setup', line: 'Replacing bad snap fasteners cost me 30 free orders — people think fabric\'s the expensive part, it\'s the hardware.' },
  { section: 'Tension', line: 'Normally every order is made to order and takes three full days to cut, sew, and package properly. But when someone is welcoming a rescue dog into their home, rules take a back seat.' },
  { section: 'Re-hook', line: 'And here is the best part, I still think a soft custom scrunchie bandana is the perfect choice. It slips right over the collar with zero tying and no pinching.' },
  { section: 'Payoff and CTA', line: 'I still think celebrating these moments is what matters most. Try one on your dog and tag us in the photo, we repost our favorites.' },
]
const AE40_CTA = 'Dress your pup in something effortless this season. Check out the link in bio to shop, and take advantage of our buy 3 get 1 free offer.'
const TAG_CTA = 'Try one on your dog and tag us in the photo, we repost our favorites.'

describe('1. rebuttal framing', () => {
  it('finds the three real "I still think" rebuttals in 81cfb5ba', () => {
    expect(GEN_81CF.filter((b) => findRebuttalFraming(b.line).length > 0).length).toBe(3)
  })
  it('is only allowed for objectives built on a disagreement', () => {
    expect(rebuttalFramingAllowed('leads', null)).toBe(false)
    expect(rebuttalFramingAllowed('sell', 'product')).toBe(false)
    expect(rebuttalFramingAllowed('conversations', null)).toBe(true)
    expect(rebuttalFramingAllowed('educate', 'opinion')).toBe(true)
    expect(rebuttalFramingAllowed('sell', 'review')).toBe(true)
  })
  it('strips the frame from the real lines, leaving speakable sentences', () => {
    const r = repairRebuttalFraming(GEN_81CF, 'leads', null)
    expect(r.stripped).toBe(3)
    expect(r.beatsTouched).toEqual([0, 3, 4])
    expect(r.beats[0]!.line).toBe('Keeping a strict turnaround rule makes sense, even for a special rescue pup.')
    expect(r.beats[3]!.line).toBe('And here is the best part, a soft custom scrunchie bandana is the perfect choice. It slips right over the collar with zero tying and no pinching.')
    expect(r.beats[4]!.line).toBe('Celebrating these moments is what matters most. Try one on your dog and tag us in the photo, we repost our favorites.')
    for (const b of r.beats) expect(findRebuttalFraming(b.line)).toEqual([])
  })
  it('keeps only the answer of an objection frame', () => {
    expect(stripRebuttalFraming('Some people say fabric is the cost, but it is the hardware.').line)
      .toBe('It is the hardware.')
    expect(stripRebuttalFraming('You might think this takes hours, but it takes two seconds.').line)
      .toBe('It takes two seconds.')
  })
  it('leaves a conversations script alone', () => {
    const r = repairRebuttalFraming(GEN_81CF, 'conversations', null)
    expect(r.stripped).toBe(0)
    expect(r.beats[0]!.line).toBe(GEN_81CF[0]!.line)
  })
  it('the prompt rule names the phrases the check removes, and is silent when allowed', () => {
    expect(rebuttalPromptRule('leads', null)).toMatch(/I still think/)
    expect(rebuttalPromptRule('conversations', null)).toBe('')
  })
})

describe('1b. the shot list is derived from the teleprompter', () => {
  it('reports every spoken row that asserts something the teleprompter does not', () => {
    const shots = [
      { shot_type: 'cover_frame', spoken_text: '' },
      { spoken_text: 'I still think keeping a strict turnaround rule makes sense, even for a special rescue pup.' },
      { spoken_text: GEN_81CF[1]!.line },
    ]
    const script = [{ line: 'For a rescue pup I broke my own turnaround rule.' }, { line: GEN_81CF[1]!.line }]
    const drift = shotListClaimDiff(shots, script)
    expect(drift).toHaveLength(1)
    expect(drift[0]).toMatchObject({ row: 1, beat: 0 })
    // Re-derived, the diff is empty.
    expect(shotListClaimDiff(syncShotListSpokenText(shots, script).shots, script)).toEqual([])
  })
})

describe('2/3. promotions are gated like price', () => {
  it('recognises the real promotions on her shop front page', () => {
    expect(isPromotional('BUY 3 GET 1 FREE')).toBe(true)
    expect(isPromotional('Free Shipping on orders over $75 across Canada')).toBe(true)
    expect(isPromotional('20% off everything')).toBe(true)
    expect(isPromotional('use code DOGDAYS at checkout')).toBe(true)
    expect(isPromotional('BOGO this weekend')).toBe(true)
    expect(isPromotional('Handcrafted just for your pup')).toBe(false)
    expect(isPromotional('It takes three full days to cut, sew and package')).toBe(false)
  })
  it('a promotional fact reaches the writer only when user_confirmed', () => {
    expect(factReachesWriter({ field: 'feature', value: 'BUY 3 GET 1 FREE', trust: 'needs_confirmation' })).toBe(false)
    expect(factReachesWriter({ field: 'feature', value: 'BUY 3 GET 1 FREE', trust: 'usable' })).toBe(false)
    expect(factReachesWriter({ field: 'feature', value: 'BUY 3 GET 1 FREE', trust: 'user_confirmed' })).toBe(true)
    expect(factReachesWriter({ field: 'benefit', value: 'Free Shipping on orders over $75', trust: 'usable' })).toBe(false)
    expect(factReachesWriter({ field: 'price', value: '$24', trust: 'usable' })).toBe(false)
    expect(factReachesWriter({ field: 'feature', value: 'Reversible', trust: 'usable' })).toBe(true)
    expect(factReachesWriter({ field: 'claim', value: 'Ready in 7-14 business days', trust: 'needs_confirmation' })).toBe(false)
  })
  it('number words and digits back each other', () => {
    expect(promotionBacked('buy three get one free', 'BUY 3 GET 1 FREE')).toBe(true)
    expect(promotionBacked('buy 3 get 1 free', '')).toBe(false)
    expect(confirmedPromotionText([
      { value: 'BUY 3 GET 1 FREE', trust: 'needs_confirmation' },
      { value: '10% off', trust: 'user_confirmed' },
    ])).toBe('10% off')
  })
  it('cuts the real unbacked promotion clause from ae4031ba and keeps the buy pointer', () => {
    const r = removeUnbackedPromotion(AE40_CTA, '')
    expect(r.removed).toEqual(['buy 3 get 1 free'])
    expect(r.line).toBe('Dress your pup in something effortless this season. Check out the link in bio to shop.')
    expect(isPromotional(r.line)).toBe(false)
  })
  it('keeps a promotion confirmed text backs', () => {
    expect(removeUnbackedPromotion(AE40_CTA, 'BUY 3 GET 1 FREE').line).toBe(AE40_CTA)
  })
  it('drops a whole promotional sentence and reports an emptied beat', () => {
    const r = removeUnbackedPromotions([{ line: 'Free shipping on orders over $75.' }, { line: 'Plain.' }], '')
    expect(r.emptied).toEqual([0])
    expect(r.beats[1]!.line).toBe('Plain.')
  })
})

describe('4. sell and get-leads end differently', () => {
  it('the real shared ending fits neither goal', () => {
    expect(ctaFitsGoal(TAG_CTA, 'leads')).toBe('no_contact_ask')
    expect(ctaFitsGoal(TAG_CTA, 'sell', 'Reversible Scrunchie Bandana')).toBe('no_buy_pointer')
  })
  it('leads needs a direct-contact ask and never a buy', () => {
    expect(ctaFitsGoal('DM me "BANDANA" and I will send you the options.', 'leads')).toBe('fits')
    expect(ctaFitsGoal('Comment "custom" below and I will message you.', 'leads')).toBe('fits')
    expect(ctaFitsGoal('Book a call through the link in my bio.', 'leads')).toBe('fits')
    expect(ctaFitsGoal('Shop the link in my bio.', 'leads')).toBe('buy_on_leads')
    expect(ctaFitsGoal('Buy yours today, or DM me.', 'leads')).toBe('buy_on_leads')
  })
  it('sell names the product and points to buying', () => {
    expect(ctaFitsGoal('Grab yours — the Reversible Scrunchie Bandana is in my shop.', 'sell', 'Reversible Scrunchie Bandana')).toBe('fits')
    expect(ctaFitsGoal('Check out the link in bio to shop.', 'sell', 'Reversible Scrunchie Bandana')).toBe('offer_not_named')
    expect(ctaFitsGoal('Send me a message.', 'sell', 'Reversible Scrunchie Bandana')).toBe('no_buy_pointer')
  })
  it('repairs the real ending into two structurally different CTAs', () => {
    const beats = [{ line: 'Hook.' }, { line: TAG_CTA }]
    const leads = repairCtaForGoal(beats, 'leads', 'Reversible Scrunchie Bandana')
    const sell = repairCtaForGoal(beats, 'sell', 'Reversible Scrunchie Bandana')
    expect(leads.replaced && sell.replaced).toBe(true)
    expect(ctaFitsGoal(leads.line, 'leads')).toBe('fits')
    expect(ctaFitsGoal(sell.line, 'sell', 'Reversible Scrunchie Bandana')).toBe('fits')
    expect(leads.line).not.toBe(sell.line)
    expect(ctaFitsGoal(leads.line, 'sell', 'Reversible Scrunchie Bandana')).not.toBe('fits')
  })
  it('keeps the non-CTA lead-in of a multi-sentence closing beat', () => {
    const r = repairCtaForGoal([{ line: 'Dress your pup in something effortless this season. Check out the link in bio to shop.' }], 'sell', 'Reversible Scrunchie Bandana')
    expect(r.line).toBe('Dress your pup in something effortless this season. Grab your Reversible Scrunchie Bandana — the link is in my bio.') // 2026-09-24: owner-approved wording
  })
  it('states a price only when the caller confirmed one', () => {
    expect(ctaForGoal('sell', 'Scrunchie Bandana', '$24')).toMatch(/\$24/)
    expect(ctaForGoal('sell', 'Scrunchie Bandana')).not.toMatch(/\$/)
  })
  it('leaves other goals unchecked', () => {
    expect(repairCtaForGoal([{ line: TAG_CTA }], 'educate').replaced).toBe(false)
  })
  it('the prompt rules differ by goal', () => {
    expect(ctaGoalPromptRule('leads')).toMatch(/DIRECT-CONTACT/)
    expect(ctaGoalPromptRule('sell', 'Scrunchie Bandana', false)).toMatch(/Do NOT state a price/)
    expect(ctaGoalPromptRule('educate')).toBe('')
  })
})
