// FACT CLASSIFICATION, RULES FIRST (relevance-and-classification brief, Part 2–3).
//
// Every fact gets classified once: what it is, who it is about, how heavy it
// is, who is in it and whether it is a whole story. Rules settle what the
// wording gives away for free; whatever they cannot settle is marked
// `needsModel` for the one model call at save time. Shadow only: nothing reads
// these classes to change a script until the routing set says they are right.

export type FactKind =
  | 'complete_story' | 'partial_story' | 'one_line_outcome' | 'belief' | 'product_spec'
  | 'offer' | 'process' | 'customer_reaction' | 'milestone' | 'challenge'
  | 'audience_question' | 'voice_phrase' | 'topic_only'
export type MomentType = 'origin' | 'mistake' | 'customer_reaction' | 'lesson' | 'behind_the_scenes' | 'milestone' | 'challenge' | 'funny' | null
export type Weight = 'light' | 'neutral' | 'heavy'
export type People = 'none' | 'role_only' | 'named' | 'minor'
export type Completeness = 'complete' | 'partial' | 'one_liner'

export interface FactClass {
  kind: FactKind
  moment: MomentType
  subject: 'her' | 'product' | 'business' | 'person' | 'world'
  weight: Weight
  people: People
  completeness: Completeness
  confidence: 'high' | 'medium' | 'low'
  needsModel: string[]
  version: 1
}

const FIRST_PERSON_EVENT = /\b(?:I|we)\s+(?:\w+ly\s+)?(?:got|went|had|made|took|lost|threw|sold|bought|tossed|ordered|skipped|almost|started|tried|spent|learned|realized|signed|quit|opened|launched|[a-z]{3,}ed)\b/i
const TURN = /\b(?:but|then|until|so I|that'?s when|after that|instead|turned out|realized|decided|now I|ever since)\b/i
const RESOLUTION = /\b(?:now|since then|ever since|ended up|in the end|finally|today|these days|that'?s why|which is why)\b/i
const PRICE = /(?:\$|£|€)\s?\d|\b\d+\s?(?:dollars?|euros?|pounds?)\b|\b(?:discount|% off|free shipping|bundle|code \w+)\b/i
const SPEC = /\b\d+\s?(?:oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|cups?)\b|\b(?:whole bean|ground|roast(?:ed)? to order|single[- ]origin|medium roast|dark roast|light roast|made from|ingredients?)\b/i
const BELIEF = /\b(?:I (?:think|believe|feel like)|honestly|overrated|underrated|the truth is|most people (?:think|assume)|people assume|myth)\b/i
const PROCESS = /\b(?:first|then|step|always|every (?:batch|morning|time)|I (?:roast|brew|test|store|weigh|cool|bag|ship))\b/i
const REACTION = /\b(?:(?:a |one )?(?:customer|client|someone|people|viewer|follower|buyer)s? (?:told|said|asked|wrote|messaged|tasted|loved|bought))\b/i
const MILESTONE = /\b(?:first (?:sale|order|market|customer|year)|sold out|\d+(?:st|nd|rd|th) (?:order|year|market)|award|featured|anniversary)\b/i
const HEAVY = /\b(?:diagnos\w*|cancer|illness|hospital|surgery|depress\w*|anxiety|grief|died|death|funeral|divorce|bankrupt\w*|debt|evict\w*|lawsuit|sued|arrest\w*|court|police|fired|laid off|miscarriage|abuse|almost gave up|broke)\b|\$\d+ left\b/i
const CHALLENGE = /\b(?:almost gave up|struggl\w*|hardest|couldn'?t|failed|lost (?:money|everything)|permit|inspector|rejected|broke down|overwhelm\w*)\b/i
const FUNNY = /\b(?:hilarious|laughed|funny|ridiculous|my dog|accidentally|barks?|of course)\b/i
const ORIGIN = /\b(?:I started|why I started|how I started|got into|first (?:roast|batch|bag)|the day I decided|began)\b/i
const MISTAKE = /\b(?:mistake|messed up|ruined|tossed|threw (?:it )?out|wrong|shouldn'?t have|without testing|skipped)\b/i
const LESSON = /\b(?:learned|taught me|lesson|now I always|never again|realized)\b/i
const BEHIND = /\b(?:behind the scenes|people never see|before (?:it|they) ship|how I (?:roast|make|pack)|my routine)\b/i
const MINOR = /\b(?:my (?:son|daughter|kids?|child(?:ren)?|baby|toddler|niece|nephew|grandkids?)|years? old)\b/i
const ROLE = /\b(?:a (?:customer|neighbor|friend|woman|man|guy|lady|stranger|supplier|vendor|officer|inspector|barista)|my (?:mom|mother|dad|father|husband|wife|partner|sister|brother|neighbor|friend|boss|landlord|supplier))\b/i
// Two capitalised words mid-sentence that are not the start of the line: a name.
const NAMED = /(?<=[a-z,;:] )[A-Z][a-z]+(?:\s+[A-Z][a-z]+)\b/
const QUESTION = /\?\s*$|^(?:how|why|what|when|where|can|does|do|is|should)\b/i

export function classifyFactRules(text: string, opts: { basis?: string | null; kind?: string | null } = {}): FactClass {
  const t = String(text ?? '').trim()
  const needsModel: string[] = []
  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean)
  const event = FIRST_PERSON_EVENT.test(t)

  // People first: it gates use, not routing.
  const people: People = MINOR.test(t) ? 'minor' : NAMED.test(t) ? 'named' : ROLE.test(t) ? 'role_only' : 'none'

  const weight: Weight = HEAVY.test(t) ? 'heavy' : CHALLENGE.test(t) ? 'neutral' : 'light'

  const completeness: Completeness = event && sentences.length >= 2 && TURN.test(t) && RESOLUTION.test(t)
    ? 'complete' : event && (sentences.length >= 2 || TURN.test(t)) ? 'partial' : 'one_liner'

  let kind: FactKind
  if (opts.kind === 'topic' || opts.basis === 'scan') kind = 'topic_only'
  else if (QUESTION.test(t) && !event) kind = 'audience_question'
  else if (PRICE.test(t) && !event) kind = 'offer'
  else if (REACTION.test(t)) kind = 'customer_reaction'
  else if (event && CHALLENGE.test(t)) kind = 'challenge'
  else if (event && completeness === 'complete') kind = 'complete_story'
  else if (event && completeness === 'partial') kind = 'partial_story'
  else if (MILESTONE.test(t)) kind = 'milestone'
  else if (event) kind = 'one_line_outcome'
  else if (BELIEF.test(t)) kind = 'belief'
  else if (SPEC.test(t)) kind = 'product_spec'
  else if (PROCESS.test(t)) kind = 'process'
  else { kind = 'belief'; needsModel.push('kind') }

  let moment: MomentType = null
  if (event || kind === 'customer_reaction') {
    moment = kind === 'customer_reaction' ? 'customer_reaction'
      : ORIGIN.test(t) ? 'origin'
      : MISTAKE.test(t) ? 'mistake'
      : FUNNY.test(t) ? 'funny'
      : CHALLENGE.test(t) ? 'challenge'
      : MILESTONE.test(t) ? 'milestone'
      : BEHIND.test(t) ? 'behind_the_scenes'
      : LESSON.test(t) ? 'lesson'
      : null
    if (!moment) needsModel.push('moment')
  }

  const subject: FactClass['subject'] = kind === 'product_spec' || kind === 'offer' ? 'product'
    : event || kind === 'belief' ? 'her'
    : kind === 'customer_reaction' ? 'person'
    : kind === 'process' ? 'business'
    : 'world'

  // Weight from words is a floor: a quiet heavy story needs the model to say so.
  if (event && weight === 'light') needsModel.push('weight')
  needsModel.push('objectives', 'slot_fit')

  const confidence = needsModel.includes('kind') ? 'low' : needsModel.length > 3 ? 'medium' : 'high'
  return { kind, moment, subject, weight, people, completeness, confidence, needsModel, version: 1 }
}
