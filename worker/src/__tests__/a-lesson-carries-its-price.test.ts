// A LESSON WITHOUT ITS PRICE IS BIOGRAPHY, AND A STANCE WITHOUT ITS OPPOSITION
// IS AN ASSERTION.
//
// ⚠️ THE DEFECT, MEASURED ON PRODUCTION (930 rows, 22 creators) AND REPRODUCED
// AGAINST THE LIVE DATABASE ON 2026-08-30:
//
//   of 69  `stated` `experience` rows, ONE  carried a cost/loss/mistake marker
//   of 129 `stated` `opinion`     rows, ZERO named a consensus and contradicted it
//
// The extractor was not failing. It was obeying. `KNOWLEDGE_SYSTEM` defined
// `experience` as "something they personally did" and `opinion` as "a position
// they hold, theirs and contestable", and it produced exactly that: "Has
// googled himself.", "Currently works at Microsoft.", "True success is inner
// peace rather than accumulating wealth." Nothing in the prompt asked what a
// thing had COST them or what consensus they were arguing WITH, so those halves
// were never recorded, and two of the three story questions had no stored
// answer to offer back.
//
// ── WHAT THIS TEST CAN AND CANNOT PROVE ───────────────────────────────────
//
// ⚠️ IT CANNOT PROVE THE MODEL COMPLIES. There is no GEMINI_API_KEY in the
// environment this was written in, so neither the old prompt nor the new one
// was ever executed. NOTHING HERE IS EVIDENCE OF A YIELD. The real measurement
// — old prompt vs new prompt over a sample of the 151 retained `subject='own'`
// transcripts, counting usable `cost` and `consensus` items and confirming the
// existing kinds still come out at the same rate — REMAINS OUTSTANDING and must
// be run by someone holding the key before any improvement is claimed.
//
// ⚖️ WHAT IT DOES PROVE is everything on this side of the model call: that the
// prompt asks for the two fields in words, that the schema will carry them,
// that captions are refused them by construction rather than by instruction,
// and that a returned item of the shape the prompt describes survives the row
// builder, the reader and the slot filler to reach a creator. If the day a real
// scan runs the slots are still empty, this test decides where to look: it is
// the model, not the plumbing.
import { describe, expect, it, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// `voice.ts` reaches `gemini.ts`, which reads required env at module load, so
// the import is dynamic behind stub values — the pattern the rest of this
// directory already uses.
type RawKnowledgeItem = {
  kind: string; text: string; basis: string; times_seen: string
  confidence: string; source_video: string; cost?: string; consensus?: string
}
let clampCaptionBasis: (i: RawKnowledgeItem[]) => RawKnowledgeItem[]
beforeAll(async () => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
  ;({ clampCaptionBasis } = await import('../voice.js') as never)
})

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const VOICE = readFileSync(join(SRC, 'voice.ts'), 'utf8')
const JOB = readFileSync(join(SRC, 'jobs', 'voice.ts'), 'utf8')

// ── THE FROZEN FIXTURES ───────────────────────────────────────────────────
//
// Hand-written excerpts, each plainly carrying the thing the slot asks for.
// They are the yardstick a real run is graded against: an extractor that reads
// these and returns no `cost` on the first two, or no `consensus` on the next
// two, is not doing the job the prompt now describes. The last two are the
// control — they must yield NEITHER field, and an extractor that fills one on
// them has started inventing prices and picking fights nobody named.
export const FIXTURES: ReadonlyArray<{
  id: string
  excerpt: string
  expect: { cost: boolean; consensus: boolean; kind: string }
}> = [
  {
    id: 'inventory',
    excerpt:
      "So I ordered forty thousand dollars of stock before one single person had asked me for it. "
      + "Forty grand, gone, sat in my mum's garage for eight months. That was basically my whole runway. "
      + "Now I don't make anything until forty people have paid for it up front.",
    expect: { cost: true, consensus: false, kind: 'experience' },
  },
  {
    id: 'agency',
    excerpt:
      "I lost the Brightline account because I never put anything in writing. Two years of work, my biggest client, "
      + "and it went in one phone call I couldn't prove the contents of. Everything is a written scope now, every time.",
    expect: { cost: true, consensus: false, kind: 'experience' },
  },
  {
    id: 'followers',
    excerpt:
      "Everybody tells you that you need ten thousand followers before you're allowed to sell anything. That is nonsense. "
      + "You can sell to two hundred people who actually trust you. I did exactly that before I had a thousand.",
    expect: { cost: false, consensus: true, kind: 'opinion' },
  },
  {
    id: 'posting',
    excerpt:
      "The standard advice in this space is post every single day, no matter what. I think daily posting is how good "
      + "creators burn out and start shipping filler. Two considered videos a week beats seven thrown out.",
    expect: { cost: false, consensus: true, kind: 'opinion' },
  },
  // ── CONTROLS. Neither field may appear. ──
  {
    id: 'biography',
    excerpt:
      "I currently work at Microsoft, and on weekends I spend a lot of time talking to strangers between seventy and "
      + "ninety years old, just to hear how they see things.",
    expect: { cost: false, consensus: false, kind: 'experience' },
  },
  {
    id: 'preference',
    excerpt:
      "For me true success is inner peace rather than piling up money. Also Pakistani chai is better than coffee, "
      + "I will not be taking questions on that one.",
    expect: { cost: false, consensus: false, kind: 'opinion' },
  },
]

describe('the prompt asks, in words, for the two halves it used to drop', () => {
  const P = VOICE.slice(VOICE.indexOf('const KNOWLEDGE_SYSTEM'), VOICE.indexOf('export interface RawKnowledgeItem'))

  it('names both fields and marks them optional', () => {
    expect(P).toMatch(/- cost —/)
    expect(P).toMatch(/- consensus —/)
    expect(P).toMatch(/TWO OPTIONAL FIELDS/)
  })

  it('tells the model that an empty field is the correct normal answer', () => {
    // ⚖️ THE COUNTERWEIGHT TO THE WHOLE CHANGE. A prompt that asks for a cost
    // without licensing silence gets a cost on every errand the creator ran —
    // which is the `pov`/`enemy` defect ("COMPLETENESS IS MANDATORY") rebuilt
    // in a new column. This line is why that does not happen.
    expect(P).toMatch(/LEAVE cost EMPTY/)
    expect(P).toMatch(/LEAVE consensus EMPTY/)
    expect(P).toMatch(/empty one is the normal, correct, unpenalised answer/)
  })

  it('refuses to let a preference count as a consensus', () => {
    expect(P).toMatch(/A PREFERENCE OR A COMPARISON IS NOT A CONSENSUS/)
  })

  it('forbids re-filing an item, so existing capture cannot degrade', () => {
    // ⚠️ THE MOST IMPORTANT LINE IN THE ADDITION. `KIND_RANK` ranks
    // `experience` top and both `creatorState` and `knowledgeResolver` gate on
    // `kind === 'experience'`. If the model started filing costly lessons as a
    // new kind, the richest material would silently leave all three readers.
    expect(P).toMatch(/NEITHER FIELD CHANGES kind, AND NEITHER IS A NEW kind/)
    expect(P).toMatch(/plain biographical and named-product items must keep coming out exactly as before/)
  })

  it('leaves the load-bearing doctrine of the original prompt intact', () => {
    // The additions must not have restyled what was already working.
    expect(P).toMatch(/A BARE NAME IS NOT AN ITEM/)
    expect(P).toMatch(/BE HONEST WITH basis AND DO NOT ROUND IT UP/)
    expect(P).toMatch(/RETURN AN EMPTY LIST IF THE TRANSCRIPTS CARRY NO SUBSTANCE/)
    expect(P).toMatch(/FACT AND OPINION ARE DIFFERENT KINDS/)
  })

  it('carries both fields in the response schema, and requires neither', () => {
    const schema = VOICE.slice(VOICE.indexOf('const knowledgeSchema'), VOICE.indexOf('const KNOWLEDGE_SYSTEM'))
    expect(schema).toMatch(/cost: \{ type: 'STRING' \}/)
    expect(schema).toMatch(/consensus: \{ type: 'STRING' \}/)
    const required = schema.slice(schema.indexOf("['kind'"))
    expect(required).not.toMatch(/'cost'/)
    expect(required).not.toMatch(/'consensus'/)
  })

  it('never asks a caption for either field', () => {
    const C = VOICE.slice(VOICE.indexOf('const CAPTION_SYSTEM'), VOICE.indexOf('export async function extractKnowledgeFromCaptions'))
    expect(C).not.toMatch(/consensus/)
    expect(C).not.toMatch(/- cost/)
  })
})

describe('a caption is stripped of both fields by construction, not by instruction', () => {
  // ⚖️ PROMPT RULES IN THIS FILE HAVE NOW FAILED FOUR TIMES — the `promotes`
  // enum, the enumeration unit, the `stated` basis on Nathan Espinoza's twelve
  // headlines, and this. Where the defect is decidable at the call site, it is
  // decided at the call site.
  const raw = (over: Partial<RawKnowledgeItem>): RawKnowledgeItem => ({
    kind: 'experience', text: 'I lost everything on my first store', basis: 'stated',
    times_seen: '1', confidence: '0.9', source_video: '1', ...over,
  })

  it('drops a cost a headline invited the model to invent', () => {
    const [out] = clampCaptionBasis([raw({ cost: '$40,000' })])
    expect(out.cost).toBeUndefined()
    expect(out.basis).toBe('demonstrated')
  })

  it('drops a consensus read off a title', () => {
    const [out] = clampCaptionBasis([raw({ kind: 'opinion', consensus: 'everyone says dropshipping is dead' })])
    expect(out.consensus).toBeUndefined()
  })

  it('leaves everything else about the item alone', () => {
    const [out] = clampCaptionBasis([raw({ text: 'took apart the Z Fold 8' })])
    expect(out.text).toBe('took apart the Z Fold 8')
    expect(out.kind).toBe('experience')
    expect(out.source_video).toBe('1')
  })
})

describe('the row builder carries both fields to the database', () => {
  it('maps them onto the insert, normalised', () => {
    expect(JOB).toMatch(/cost: shortOrNull\(r\.cost\)/)
    expect(JOB).toMatch(/consensus: shortOrNull\(r\.consensus\)/)
  })

  it('collapses a blank to null rather than storing an empty string', () => {
    // "Nobody recorded a cost" and "it cost nothing" are different facts and
    // only null says the first.
    expect(JOB).toMatch(/const shortOrNull = \(v: unknown\): string \| null =>/)
    expect(JOB).toMatch(/return t === '' \? null : t\.slice\(0, 240\)/)
  })

  it('does not add a kind, so the closed taxonomy is untouched', () => {
    // ⚠️ `creator_knowledge_kind_valid` CHECKs nine kinds and an unlisted one
    // fails the WHOLE batch. The worker's mirror of that list must still hold
    // exactly nine, or `knowledgeKindParity` is being routed around.
    const list = JOB.slice(JOB.indexOf('const KNOWLEDGE_KINDS_WORKER'))
      .slice(0, JOB.slice(JOB.indexOf('const KNOWLEDGE_KINDS_WORKER')).indexOf(']'))
    expect(list.match(/'/g)!.length / 2).toBe(9)
    expect(list).not.toMatch(/lesson|contrarian/)
  })
})

describe('the insert degrades instead of losing the scan when the migration is behind', () => {
  it('strips the two new columns on PGRST204 rather than dropping every row', () => {
    // ⚠️ PostgREST rejects the WHOLE batch for ONE unknown column. Shipping
    // `source` naively once stopped ALL creator knowledge from being stored;
    // two more columns is two more chances at exactly that.
    const INSERT = readFileSync(join(SRC, 'knowledgeInsert.ts'), 'utf8')
    expect(INSERT).toMatch(/column .\*\(source\|cost\|consensus\).\* does not exist/)
    expect(INSERT).toMatch(/\{ source, cost, consensus, \.\.\.rest \}/)
  })
})

describe('the frozen fixtures state what a real run must produce', () => {
  it('holds four positives and two controls', () => {
    expect(FIXTURES.filter((f) => f.expect.cost)).toHaveLength(2)
    expect(FIXTURES.filter((f) => f.expect.consensus)).toHaveLength(2)
    expect(FIXTURES.filter((f) => !f.expect.cost && !f.expect.consensus)).toHaveLength(2)
  })

  it('every positive fixture actually contains the thing it claims to', () => {
    // A fixture that does not carry a cost cannot grade an extractor on cost.
    for (const f of FIXTURES.filter((x) => x.expect.cost)) {
      expect(f.excerpt).toMatch(/forty thousand dollars|Two years of work/)
    }
    for (const f of FIXTURES.filter((x) => x.expect.consensus)) {
      expect(f.excerpt).toMatch(/Everybody tells you|The standard advice/)
    }
  })

  it('the controls are the real production sentences that must stay empty', () => {
    const controls = FIXTURES.filter((f) => !f.expect.cost && !f.expect.consensus)
    // Both are near-verbatim rows from the live store — the flat biography and
    // the mild preference the old prompt produced. Neither may acquire a field.
    expect(controls.map((c) => c.id)).toEqual(['biography', 'preference'])
    expect(controls[0].excerpt).toMatch(/work at Microsoft/)
    expect(controls[1].excerpt).toMatch(/inner peace rather than/)
  })
})
