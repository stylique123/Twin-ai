// THE GENERAL PASS ANSWERED A DIFFERENT QUESTION WELL, AND NOBODY ASKED THESE SEVEN.
//
// ⚠️ MEASURED. Transcript extraction yields 1.63 rows per transcript, 84% of them
// substance — the general pass works. What it does not do is guarantee that the
// seven things a script actually needs are among its answers: a specific number,
// the thing she pushes back against, one concrete moment, someone else's words, a
// position her field does not hold, a mistake with its price, and the CTA she
// really uses. Across 42 voices the store holds a median of 10 items and 2 voices
// have months of runway, so "it probably came out somewhere in the 84%" is not an
// answer.
//
// ⚖️ AND THE PART THAT MUST NOT DRIFT IS THE HONESTY. Three of the ten questions
// assume a paid offer. Asked of a creator with nothing to sell, a model does not
// answer "nothing" — it produces a plausible price. This file pins that Track B
// cannot run without a stored, live, owned product entity, and that nothing is
// substituted when it does not run.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TRACK_A, TRACK_B, TARGETED_QUESTION_IDS, questionsFor, renderQuestions } from '../targetedQuestions.js'
import { knowledgeRowsFrom } from '../knowledgeRows.js'
import { EXTRACTOR_VERSION } from '../extractorVersion.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MIG = readFileSync(
  join(REPO, 'supabase/migrations/0216_the_conclusion_arrived_without_the_sentence_that_earned_it.sql'), 'utf8')
const VOICE = readFileSync(join(REPO, 'worker/src/voice.ts'), 'utf8')
const JOB = readFileSync(join(REPO, 'worker/src/jobs/voice.ts'), 'utf8')
const REMINE = readFileSync(join(REPO, 'worker/src/jobs/remineKnowledge.ts'), 'utf8')
const GATE = readFileSync(join(REPO, 'worker/src/ownerProducts.ts'), 'utf8')

describe('the two tracks, and what each one assumes', () => {
  it('Track A is seven and Track B is three', () => {
    expect(TRACK_A).toHaveLength(7)
    expect(TRACK_B).toHaveLength(3)
  })

  // ⚠️ THE WHOLE POINT OF THE SPLIT. A creator with nothing to sell still cites
  // numbers, still argues with something, still describes a moment, still gets
  // told things, still holds a position, still made a mistake, and still ends a
  // video by asking for something. None of the seven may assume a business.
  it('no Track A question assumes she sells anything', () => {
    const commercial = /\b(charge|charges|price|pricing|customers? pay|offer|paid|client pays|product)\b/i
    for (const q of TRACK_A) {
      expect(commercial.test(q.ask), `${q.id} assumes a business: ${q.ask}`).toBe(false)
    }
  })

  it('every Track B question is about the offer, which is why it is gated', () => {
    const ids = TRACK_B.map((q) => q.id)
    expect(ids).toEqual(['what_she_charges', 'refuses_to_promise', 'what_she_calls_it'])
  })

  it('without a product the list is SHORTER, never substituted', () => {
    const without = questionsFor(false)
    const with_ = questionsFor(true)
    expect(without).toHaveLength(7)
    expect(with_).toHaveLength(10)
    // ⚖️ THE SEVEN ARE THE SAME SEVEN. A softened commercial question standing in
    // for a real one is the failure this asserts against.
    expect(without.map((q) => q.id)).toEqual(TRACK_A.map((q) => q.id))
    expect(with_.slice(0, 7).map((q) => q.id)).toEqual(TRACK_A.map((q) => q.id))
  })

  it('every id is unique, or two questions share a row in the database', () => {
    expect(new Set(TARGETED_QUESTION_IDS).size).toBe(TARGETED_QUESTION_IDS.length)
  })

  it('the prompt carries the id, the ask and why it matters', () => {
    const rendered = renderQuestions(questionsFor(true))
    for (const q of [...TRACK_A, ...TRACK_B]) {
      expect(rendered).toContain(`[${q.id}]`)
      expect(rendered).toContain(q.ask)
    }
    expect(rendered).toContain('WHY IT MATTERS')
  })
})

describe('the bank and the database agree', () => {
  // ⚠️ A `question_id` THE CHECK REFUSES FAILS THE WHOLE BATCH, exactly as an
  // unlisted `kind` does — so a bank that has drifted from 0216 does not lose one
  // answer, it loses the scan. This is the same guard `knowledgeKindParity` makes
  // for the taxonomy, and it exists because the cost is identical.
  it('every id in the bank is allowed by 0216, and the CHECK names no others', () => {
    const block = MIG.slice(MIG.indexOf('creator_knowledge_question_known'))
    const listed = [...block.slice(0, block.indexOf('));')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(listed.length).toBeGreaterThan(0)
    expect([...listed].sort()).toEqual([...TARGETED_QUESTION_IDS].sort())
  })

  it('NULL stays legal, because 1,339 stored rows answer no question', () => {
    expect(MIG).toMatch(/check \(question_id is null or question_id in \(/)
  })

  it('the merge carries both new columns and never erases them with a NULL', () => {
    const insertList = MIG.match(/insert into public\.creator_knowledge\s*\n\s*\(([^)]*)\)/)
    expect(insertList?.[1]).toContain('evidence')
    expect(insertList?.[1]).toContain('question_id')
    expect(MIG).toMatch(/evidence = coalesce\(excluded\.evidence, public\.creator_knowledge\.evidence\)/)
    expect(MIG).toMatch(/question_id = coalesce\(excluded\.question_id, public\.creator_knowledge\.question_id\)/)
  })
})

describe('the evidence is required of the targeted pass and of nothing else', () => {
  it('the schema requires it, unlike cost and consensus', () => {
    const schema = VOICE.slice(VOICE.indexOf('const targetedSchema = obj('))
      .slice(0, 2000)
    expect(schema).toMatch(/\['question_id', 'kind', 'text', 'basis', 'times_seen', 'confidence', 'source_video', 'evidence'\]/)
  })

  it('the prompt refuses a plausible answer and says the empty list is correct', () => {
    const sys = VOICE.slice(VOICE.indexOf('const TARGETED_SYSTEM ='))
      .slice(0, VOICE.slice(VOICE.indexOf('const TARGETED_SYSTEM =')).indexOf('THE QUESTIONS:'))
    expect(sys).toMatch(/A QUESTION WITH NO ANSWER IN THESE TRANSCRIPTS IS SKIPPED ENTIRELY/)
    expect(sys).toMatch(/NEVER write evidence that does not appear in the transcripts/)
    // ⚠️ AND IT MUST NOT OFFER `inferred` AS THE WAY OUT. A guess filed with a
    // weaker basis is still a guess, and `inferred` rows steer the writer.
    expect(sys).toMatch(/the correct action is to skip the question, not to file a guess/)
  })

  // ⚠️ MEASURED 2026-09-17 ON PRODUCTION, THROUGH THE SUPABASE MCP. Of 331 stored
  // own transcripts, TWO — 83,228 characters, 16.5% of the entire own-speech
  // corpus — are multi-speaker show and interview content on the creator's own
  // channel, and one of them opens with a GUEST introducing herself and her own
  // business ("I'm ... and I teach crafters how to make stickers") under an owner
  // whose every other transcript is a solo business channel. Nothing in the data
  // says who is speaking: `>>` markers are a CAPTION convention and appear in
  // plain monologues too, so they cannot be used to detect this.
  //
  // ⚖️ SO IT IS A PROMPT RULE, WHICH THIS REPO NORMALLY DISTRUSTS — and the reason
  // it is the right tool here is that the defect is NOT decidable from metadata.
  // Where a call site can decide (captions are captions by construction), the
  // clamp lives in code; where only the text can tell, the instruction is all
  // there is, and silence is strictly worse.
  //
  // ⚠️ AND IT IS ON BOTH PROMPTS. Only 60,000 characters of that owner's 162,668
  // are read per run, which is very likely why no misattributed row has been
  // stored YET — a fact that changes the moment a re-mine reads a different
  // window.
  it('both extraction prompts refuse to record a guest as the creator', () => {
    const targeted = VOICE.slice(VOICE.indexOf('const TARGETED_SYSTEM ='))
      .slice(0, VOICE.slice(VOICE.indexOf('const TARGETED_SYSTEM =')).indexOf('THE QUESTIONS:'))
    const general = VOICE.slice(VOICE.indexOf('const KNOWLEDGE_SYSTEM ='))
      .slice(0, VOICE.slice(VOICE.indexOf('const KNOWLEDGE_SYSTEM =')).indexOf('export interface RawKnowledgeItem'))
    for (const [name, sys] of [['targeted', targeted], ['general', general]] as const) {
      expect(sys, `${name} prompt does not mention the multi-speaker case`)
        .toMatch(/NOT ONE PERSON TALKING/)
      expect(sys, `${name} prompt does not say to record nothing from it`)
        .toMatch(/record NOTHING from it/)
    }
  })

  it('a row carries the evidence through to the insert, trimmed and capped', () => {
    const [row] = knowledgeRowsFrom({
      items: [{
        kind: 'claim', text: 'She charges £400 for a full rebind.', basis: 'stated',
        times_seen: '1', confidence: '0.9', source_video: '1',
        question_id: 'what_she_charges',
        evidence: '  a full rebind   is four hundred   ',
        __source: 'transcript' as const,
      }],
      ownerId: 'o', voiceId: 'v', urls: ['u'], cap: 5, version: EXTRACTOR_VERSION,
    })
    expect(row.evidence).toBe('a full rebind is four hundred')
    expect(row.question_id).toBe('what_she_charges')
  })

  it('a general-pass row carries neither, and that is not a gap', () => {
    const [row] = knowledgeRowsFrom({
      items: [{
        kind: 'opinion', text: 'Cheap rebinds fail.', basis: 'stated',
        times_seen: '1', confidence: '0.8', source_video: '1',
        __source: 'transcript' as const,
      }],
      ownerId: 'o', voiceId: 'v', urls: ['u'], cap: 5, version: EXTRACTOR_VERSION,
    })
    expect(row.evidence).toBeNull()
    expect(row.question_id).toBeNull()
  })

  it('a blank evidence string is none recorded, never evidence that is empty', () => {
    const [row] = knowledgeRowsFrom({
      items: [{
        kind: 'opinion', text: 'x', basis: 'stated', times_seen: '1', confidence: '1',
        source_video: '1', evidence: '   ', question_id: '  ',
        __source: 'transcript' as const,
      }],
      ownerId: 'o', voiceId: 'v', urls: [], cap: 5, version: EXTRACTOR_VERSION,
    })
    expect(row.evidence).toBeNull()
    expect(row.question_id).toBeNull()
  })
})

describe('the pass runs, and it runs alongside the general one', () => {
  it('build_voice asks all three passes, not two', () => {
    expect(JOB).toMatch(/const \[fromAudio, fromCaptions, fromTargeted\] = await Promise\.all\(\[/)
    expect(JOB).toMatch(/extractTargetedKnowledge\(handle, platform, transcripts, questionsFor\(hasProduct\)\)/)
    // ⚠️ THE GENERAL PASS MUST STILL BE THERE. This is an addition; a replacement
    // would trade 455 substance rows for ten answers.
    expect(JOB).toMatch(/extractKnowledgeFromAudio\(handle, platform, transcripts\)/)
    expect(JOB).toMatch(/extractKnowledgeFromCaptions\(handle, platform, captions\)/)
  })

  // ⚖️ THE SLICE IS TAKEN FROM THE FRONT, so an answer the writer was measured to
  // need must not be what a hundred caption rows push over the write cap.
  it('the targeted answers are first in the row list', () => {
    const raw = JOB.slice(JOB.indexOf('const raw = ['))
    expect(raw.indexOf('fromTargeted')).toBeLessThan(raw.indexOf('fromAudio'))
    expect(raw.indexOf('fromAudio')).toBeLessThan(raw.indexOf('fromCaptions'))
  })

  it('the re-mine runs it too, which is what version 3 is for', () => {
    expect(REMINE).toMatch(/extractTargetedKnowledge\(handle, platform, texts, questionsFor\(hasProduct\)\)/)
    // ⚖️ RE-ANCHORED: the regex pass (audience questions, promised videos) joined
    // the list ahead of both model passes, because it is free and because the
    // write cap slices from the front. The claim is unchanged — the targeted
    // answers and the general pass are BOTH in what the re-mine stores.
    expect(REMINE).toMatch(/\.\.\.targeted,\n\s+\.\.\.general,/)
    expect(REMINE).toMatch(/const mined = mineTranscripts\(texts\)/)
    expect(EXTRACTOR_VERSION).toBe(3)
  })
})

describe('Track B cannot run on a guess', () => {
  it('the gate asks the database, not the transcript', () => {
    expect(GATE).toMatch(/\.from\('product_entities'\)/)
    expect(GATE).toMatch(/\.in\('relationship', OWNED\)/)
    // ⚠️ ARCHIVED IS WITHDRAWN (0124). Reading an archived offer would re-grant
    // the pricing questions the creator explicitly revoked.
    expect(GATE).toMatch(/\.is\('archived_at', null\)/)
  })

  it('unknown means NO, so a failed read never asks for a price', () => {
    // ⚖️ The cost of a false negative is pricing facts not extracted this scan.
    // The cost of a false positive is an invented price in a script she reads to
    // her audience. Those are not close.
    const code = GATE.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    expect((code.match(/return false/g) ?? []).length).toBeGreaterThanOrEqual(3)
    expect(code).not.toMatch(/return true\s*$/m)
  })

  it('only OWNED relationships count — an affiliate\'s price is not her fact', () => {
    expect(GATE).toMatch(/const OWNED = \['OWN_PRODUCT', 'OWN_SERVICE'\] as const/)
  })
})
