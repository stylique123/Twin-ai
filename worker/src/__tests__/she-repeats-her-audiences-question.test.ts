// THE COMMENT CORPUS IS NOT AVAILABLE, AND SHE READS THE COMMENTS OUT LOUD.
//
// ⚠️ §K2 RETRACTED THE CLAIM THAT AUDIENCE COMMENTS ARE ALREADY IN THE PIPELINE.
// Three files assert `commentsDatasetUrl` is present; nothing reads, stores or
// requests it, and prose repeated across files is not corroboration. So audience
// demand has no supply — except that the creator repeats her audience's
// questions on camera, in transcripts this system already holds and already pays
// to fetch.
//
// ⚠️ IT IS A WEAKER SIGNAL THAN THE COMMENTS AND IT IS AVAILABLE TODAY. It is
// her SELECTION of which questions to repeat, not the questions. Recorded as the
// difference it is, never as a substitute.
//
// ⚠️⚠️ AND A REGEX MINER LIVES OR DIES ON ITS FALSE POSITIVES. §I1 records the
// beat-ask generic detector — "an anchored regex" whose leak made every section
// show the same sentence. Most of what follows is negative controls.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  minePassages, passageCorpus, sentences, FOLLOW_SENTENCES, MAX_PASSAGES_PER_KIND,
} from '../knowledgeMine.js'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const VOICE = readFileSync(join(SRC, 'voice.ts'), 'utf8')
const JOB = readFileSync(join(SRC, 'jobs', 'voice.ts'), 'utf8')

const kinds = (t: string) => minePassages([t]).map((p) => p.kind)

describe('audience demand — the phrasings creators actually use', () => {
  for (const line of [
    'A lot of you asked me about the glue. I only use hide glue now.',
    'So many of you have asked which thread I use.',
    'You guys keep asking about my camera setup.',
    'Loads of you wanted to know what the rebind costs.',
    'People keep asking me whether it is worth it.',
    'My DMs are blowing up with questions about pricing.',
    'The most asked question I get is about the leather.',
    'The number one question people ask is how long it takes.',
  ]) {
    it(`catches: ${line.slice(0, 44)}…`, () => {
      expect(kinds(line)).toContain('audience_demand')
    })
  }
})

describe('⚠️ audience demand — the false positives that would poison the store', () => {
  for (const line of [
    // First person asking somebody else. The commonest near-miss by far.
    'I asked my supplier for a better price and they said no.',
    'She asked me to stop using that glue.',
    'Nobody asked for this but here it is.',
    'I asked around and nobody had one.',
    // Answering, not being asked.
    'I answered a question about glue in my last video.',
    // The word without the audience.
    'The asking price was four hundred pounds.',
  ]) {
    it(`does NOT catch: ${line.slice(0, 44)}…`, () => {
      expect(kinds(line)).not.toContain('audience_demand')
    })
  }
})

describe('a promised video is a promise, never her back catalogue', () => {
  for (const line of [
    "I'll do a whole video on the hinge repair.",
    "I'm going to make a separate video about pricing.",
    "That's a whole video on its own.",
    'That is a topic for another day.',
    'Comment below if you want a part two.',
  ]) {
    it(`catches: ${line.slice(0, 44)}…`, () => {
      expect(kinds(line)).toContain('promised_video')
    })
  }

  for (const line of [
    // ⚠️ PAST TENSE IS `covered`, A DIFFERENT RECORD ENTIRELY. Filing it here
    // would tell the writer her back catalogue contains something it does not —
    // or worse, that something she HAS made is still to come.
    'I made a whole video about the hinge repair last year.',
    'I did a video on this already.',
    'I put out a video about pricing in March.',
  ]) {
    it(`does NOT catch past tense: ${line.slice(0, 40)}…`, () => {
      expect(kinds(line)).not.toContain('promised_video')
    })
  }
})

describe('the passage carries the ANSWER, not just the question', () => {
  it('takes the matched sentence and what follows it', () => {
    // ⚠️ THE FOLLOWING SENTENCES ARE THE POINT. A matcher returning only the
    // match hands the model the question and withholds the reply.
    const t = 'A lot of you asked about the glue. PVA fails inside a year. Only hide glue holds. Anyway, moving on.'
    const p = minePassages([t])
    expect(p).toHaveLength(1)
    expect(p[0].text).toContain('PVA fails inside a year')
    expect(p[0].text).toContain('Only hide glue holds')
    // Bounded, so the next subject does not get attributed to this question.
    expect(p[0].text).not.toContain('moving on')
    expect(FOLLOW_SENTENCES).toBe(2)
  })

  it('keeps the video number so a row can keep its source_url', () => {
    const p = minePassages(['nothing here', 'A lot of you asked about glue.'])
    expect(p[0].video).toBe(2)
  })

  it('a sentence that is BOTH is recorded once, and demand wins', () => {
    // ⚖️ Emitting it twice would double-count one remark into two rows and
    // inflate every downstream count that reasons about supply.
    const p = minePassages(["A lot of you asked about the hinge, and I'll do a whole video on it."])
    expect(p).toHaveLength(1)
    expect(p[0].kind).toBe('audience_demand')
  })

  it('is bounded per kind', () => {
    const t = Array.from({ length: 40 }, (_, i) => `A lot of you asked about topic ${i}.`).join(' ')
    expect(minePassages([t])).toHaveLength(MAX_PASSAGES_PER_KIND)
  })
})

describe('sentence splitting does not sever a claim mid-number', () => {
  it('keeps a price intact', () => {
    // ⚠️ `split('.')` cuts "£400.50" in half, and a severed quotation stops
    // being true — which is the one thing `evidence` must never be.
    expect(sentences('It costs £400.50 for a rebind. That is the price.'))
      .toEqual(['It costs £400.50 for a rebind.', 'That is the price.'])
  })

  it('does not split on an abbreviation mid-sentence', () => {
    expect(sentences('Hide glue vs. PVA is not close.')).toHaveLength(1)
  })

  it('an empty or junk input is an empty list, not a crash', () => {
    expect(sentences('')).toEqual([])
    expect(minePassages([])).toEqual([])
    expect(minePassages([''])).toEqual([])
  })
})

describe('the pass costs nothing when she never says these things', () => {
  it('an empty corpus is the signal to make no call', () => {
    expect(passageCorpus([])).toBe('')
    const fn = VOICE.slice(VOICE.indexOf('export async function extractKnowledgeFromDemand'))
    expect(fn.slice(0, fn.indexOf('console.log'))).toMatch(/if \(!corpus\) return \[\]/)
  })

  it('groups the two kinds so the prompt can ask a different question of each', () => {
    const c = passageCorpus([
      { video: 1, kind: 'audience_demand', text: 'a' },
      { video: 2, kind: 'promised_video', text: 'b' },
    ])
    expect(c).toMatch(/REPEATS HER AUDIENCE'S QUESTION/)
    expect(c).toMatch(/DESERVES ITS OWN VIDEO/)
    expect(c.indexOf('--- VIDEO 1 ---')).toBeLessThan(c.indexOf('--- VIDEO 2 ---'))
  })
})

describe('the prompt refuses to complete an answer she did not give', () => {
  const P = VOICE.slice(VOICE.indexOf('const DEMAND_SYSTEM'), VOICE.indexOf('export async function extractKnowledgeFromDemand'))

  it('records the question alone rather than inventing the reply', () => {
    // ⚠️ AN INVENTED ANSWER ATTACHED TO A REAL QUESTION is this pass's worst
    // possible output — §G8's shape, with the citation genuine.
    expect(P).toMatch(/Do NOT complete her answer for her/)
    expect(P).toMatch(/not answered here/)
  })

  it('refuses to file a published video as a promised one', () => {
    expect(P).toMatch(/NOT ONE SHE HAS/)
    expect(P).toMatch(/DROP IT/)
  })

  it('keeps the copied sentence out of `text`', () => {
    // 0121: `text` is CHECK-capped at 240 so the schema refuses to become a
    // transcript store. A 240-character truncation of speech is a severed
    // quotation wearing a distillate's clothes.
    expect(P).toMatch(/never a passage copied out of the extract/)
    expect(P).toMatch(/the copied sentence goes in evidence and nowhere else/)
  })

  it('leaves cost and consensus empty, because that is not what this pass is for', () => {
    expect(P).toMatch(/Leave cost and consensus EMPTY/)
  })

  it('expects false matches and says dropping them is correct', () => {
    expect(P).toMatch(/Several of them will be false matches/)
  })
})

describe('it is wired', () => {
  it('runs beside the other three passes', () => {
    expect(JOB).toMatch(/extractKnowledgeFromDemand\(handle, platform, transcripts\)/)
  })

  it('its rows survive the row cap ahead of the general ones', () => {
    const raw = JOB.slice(JOB.indexOf('const raw = ['), JOB.indexOf('const raw = [') + 900)
    expect(raw.indexOf('fromDemand')).toBeLessThan(raw.indexOf('fromAudio'))
  })

  it('reports what it found, so "free when unused" stays checkable', () => {
    expect(VOICE).toMatch(/event: 'demand_passages_found'/)
  })
})
