// IDEA MODE ASKS ABOUT HER PARAGRAPH, OR NOT AT ALL (owner, coffee report 2.1, 2.2).
//
// ⚠️ MEASURED ON FOUR IDEAS: "What specific moment or tension is at the center
// of what you just described?" and "What's the one feeling you want someone to
// still have after watching?" appeared unchanged every time. The owner's rule:
// if a question could be asked unchanged of another paragraph, cut it.
//
// ⚖️ ONE SMALL MODEL CALL reads the paragraph and returns 0-3 questions, each
// pointing at her own words, plus its reading of WHY the video exists. This file
// is the pure half: the prompt, the schema and the checks that throw away any
// question that does not quote her. The call fails open — no questions, build
// goes ahead — because a slow courtesy must never block a script.
//
// Deno copy is GENERATED (scripts/ci/generate_shared_pilot_core.mjs); no imports.

export const IDEA_PURPOSES = [
  { value: 'personal_brand', label: 'your story' },
  { value: 'educate', label: 'teaching something' },
  { value: 'conversations', label: 'answering a question' },
  { value: 'authority', label: 'showing how you do it' },
  { value: 'entertain', label: 'something fun to watch' },
  { value: 'sell', label: 'promoting something you sell' },
] as const
export type IdeaPurpose = (typeof IDEA_PURPOSES)[number]['value']

export const IDEA_Q_SYSTEM = [
  'A creator typed a short paragraph about a video she wants to make. Decide what is MISSING for a script that uses only her words and facts, and why the video exists.',
  'Return AT MOST ONE question: the single missing fact the script would otherwise have to invent. Return none when the paragraph already has a concrete moment, fact or answer to build on — say so in "enough".',
  'Every question must point at her own words: put the exact phrase from her paragraph it is about in "quote" (copied character for character, 2-8 words).',
  'Ask for a MOMENT, a FACT or WHAT SHE DOES ("Think of one batch where you noticed it: what was different in the cup?"). Never ask for a feeling, a goal, an audience, a call to action or a hashtag.',
  'Match her tone: if she sounds neutral or proud, do not frame the question around a mess, mistake, problem or failure unless she named one. "You just figure it out step by step" asks for one step she figured out, not for something that went wrong.',
  'Never ask something the paragraph already answers. Never suggest an answer. Plain words, under 20 words, one question each.',
  'purpose: pick the ONE reason the video exists from: personal_brand (her story), educate (teaching something), conversations (answering a question people ask), authority (showing how she does it), entertain (fun to watch), sell (promoting something she sells). Pick sell ONLY if she says she wants people to buy, order, book or try something she sells. confidence 0-1 (under 0.5 when the paragraph is too thin to tell). signal: the phrase that told you.',
].join('\n')

export const IDEA_Q_SCHEMA = {
  type: 'OBJECT',
  properties: {
    enough: { type: 'BOOLEAN' },
    questions: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { quote: { type: 'STRING' }, question: { type: 'STRING' } }, required: ['quote', 'question'] },
    },
    purpose: { type: 'STRING' },
    confidence: { type: 'NUMBER' },
    signal: { type: 'STRING' },
  },
  required: ['enough', 'questions', 'purpose', 'confidence'],
}

export interface IdeaQuestion { quote: string; question: string }
export interface IdeaRead {
  questions: IdeaQuestion[]
  purpose: { value: IdeaPurpose; label: string; confidence: number; signal: string | null } | null
}

const norm = (t: string) => t.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Questions a template could have asked of any paragraph. */
const GENERIC = /\b(feel|feeling|emotion|audience|viewers? (should|to)|call to action|cta|hashtag|goal of|takeaway|message you want)\b/i

/** Keep only questions that quote her paragraph and ask for material. */
export function cleanIdeaRead(raw: unknown, paragraph: string): IdeaRead {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const para = norm(paragraph)
  const questions: IdeaQuestion[] = []
  const seen = new Set<string>()
  for (const q of Array.isArray(r.questions) ? r.questions : []) {
    const o = (q && typeof q === 'object' ? q : {}) as Record<string, unknown>
    const quote = typeof o.quote === 'string' ? o.quote.trim() : ''
    const question = typeof o.question === 'string' ? o.question.replace(/\s+/g, ' ').trim() : ''
    const nq = norm(quote)
    if (!question || question.length > 160 || !question.endsWith('?')) continue
    if (nq.split(' ').length < 2 || !para.includes(nq)) continue
    if (GENERIC.test(question) || seen.has(norm(question))) continue
    seen.add(norm(question))
    questions.push({ quote: quote.slice(0, 80), question })
    if (questions.length >= 1) break
  }
  const p = IDEA_PURPOSES.find((x) => x.value === r.purpose)
  const confidence = typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? Math.max(0, Math.min(1, r.confidence)) : 0
  const signal = typeof r.signal === 'string' && para.includes(norm(r.signal)) && norm(r.signal) !== '' ? r.signal.trim().slice(0, 80) : null
  // ⚖️ SELL AND LEADS NEED HER OWN WORDS BEHIND THEM: a guessed commercial
  // purpose would grant a pitch nobody asked for.
  const commercial = p?.value === 'sell'
  // Round 2 (Part 4): the signal must itself be a buying word, not any phrase —
  // "coffee roastery" is not "buy my coffee".
  const BUY = /\b(buy|order|shop|book|try|purchase|pre-?order|sale|discount|link in bio|available|launch)/i
  const purpose = p && confidence >= 0.5 && (!commercial || (signal && BUY.test(signal)))
    ? { value: p.value, label: p.label, confidence, signal } : null
  return { questions: r.enough === true ? [] : questions, purpose }
}
