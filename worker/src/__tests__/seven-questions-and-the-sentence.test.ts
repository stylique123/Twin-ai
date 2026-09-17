// A CONCLUSION WITHOUT THE SENTENCE IT CAME FROM.
//
// ⚠️ THE DEFECT, IN ONE COMPARISON. The store holds "she cares about pricing".
// What she said was "I charge £400 because the cheap rebinds come apart inside a
// year". The first is a summary of a person; the second is something a script
// can be built out of. The extractor has only ever been asked for the
// conclusion, and the transcript is never retained (0121), so the usable half is
// destroyed at the moment of extraction and cannot be recovered.
//
// ⚠️ AND THE GENERAL PASS COULD NOT BE ASKED TO FIX IT. An open question —
// "record what they know" — is answered by whatever is most salient, which is
// why the same six facts keep coming back. These seven are asked as their own
// task, in their own call, and the general pass is untouched beside them.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const VOICE = readFileSync(join(SRC, 'voice.ts'), 'utf8')
const JOB = readFileSync(join(SRC, 'jobs', 'voice.ts'), 'utf8')
const INSERT = readFileSync(join(SRC, 'knowledgeInsert.ts'), 'utf8')

const TRACK_A = VOICE.slice(
  VOICE.indexOf('const TRACK_A_SYSTEM'),
  VOICE.indexOf('export async function extractKnowledgeTargeted'),
)

describe('all seven questions are actually asked', () => {
  // ⚠️ THE COUNT IS THE TEST. A prompt that drifts to six questions loses a
  // whole category of material silently, and nothing downstream could tell.
  const NUMBERED = TRACK_A.match(/^\d\. [A-Z]/gm) ?? []

  it('asks exactly seven, numbered', () => {
    expect(NUMBERED).toHaveLength(7)
    expect(NUMBERED.map((n) => n[0])).toEqual(['1', '2', '3', '4', '5', '6', '7'])
  })

  it('each question names the kind its answers are filed under', () => {
    // ⚠️ `creator_knowledge_kind_valid` CHECKs a closed set of nine and
    // PostgREST fails the WHOLE batch on one bad row. A question whose answers
    // have no home is a question whose answers take the scan down with them.
    const KINDS = ['fact', 'opinion', 'topic', 'example', 'experience', 'framework', 'claim', 'product', 'covered']
    const assigned = [...TRACK_A.matchAll(/-> kind "([a-z]+)"/g)].map((m) => m[1])
    expect(assigned).toHaveLength(7)
    for (const k of assigned) expect(KINDS).toContain(k)
  })

  it('covers the seven subjects, not seven rewordings of one', () => {
    for (const subject of [
      /SPECIFIC NUMBER/, /PUSH BACK AGAINST/, /SPECIFIC MOMENT/,
      /SOMEONE ELSE HAS SAID|SOMEONE ELSE SAID TO THEM/i,
      /BELIEVE THAT OTHERS/, /MISTAKE DID THEY MAKE/, /END OF A VIDEO/,
    ]) expect(TRACK_A).toMatch(subject)
  })

  it('an unanswered question returns nothing rather than a plausible filler', () => {
    // ⚠️ THE FABRICATION THIS WHOLE FILE'S CLAMPS EXIST TO PREVENT. Seven
    // questions is seven shapes inviting seven guesses.
    expect(TRACK_A).toMatch(/INCLUDING ZERO/)
    expect(TRACK_A).toMatch(/Do NOT produce one item per question to fill the shape/)
    expect(TRACK_A).toMatch(/RETURN AN EMPTY LIST/)
  })

  it('asks no Track B question, because a creator who sells nothing has no answer', () => {
    // ⚖️ AN EMPTY TRACK B IS THE CORRECT RESULT FOR A COMMENTARY CREATOR, and
    // asking anyway is an invitation to invent a price or a method name to fill
    // the shape. Track B waits on the product-entity work; Track A ships now.
    expect(TRACK_A).not.toMatch(/what (do|does) (they|she|he) charge/i)
    expect(TRACK_A).not.toMatch(/refuse to promise/i)
  })
})

describe('evidence is a copied sentence, and never a manufactured one', () => {
  it('demands ONE real sentence and drops the item when there is none', () => {
    expect(TRACK_A).toMatch(/Copy ONE sentence of the creator's actual speech/)
    expect(TRACK_A).toMatch(/do not paraphrase it/)
    expect(TRACK_A).toMatch(/drop it rather than writing evidence from memory/)
  })

  it('says out loud that evidence is not a script line', () => {
    // A sentence that reaches the writer labelled "she said" is a licence taken
    // literally unless something forbids it.
    expect(TRACK_A).toMatch(/SUPPORTING MATERIAL AND NOT A SCRIPT LINE/)
  })

  it('forbids the round-up that a copied sentence invites', () => {
    // An item carrying a sentence is almost always `stated`; the risk runs the
    // other way, where a model infers past the sentence and keeps the receipt.
    expect(TRACK_A).toMatch(/you have inferred past what the sentence says/)
  })

  it('the field is optional in the schema, because captions have no speech', () => {
    const SCHEMA = VOICE.slice(VOICE.indexOf('const knowledgeSchema'), VOICE.indexOf('const KNOWLEDGE_SYSTEM'))
    expect(SCHEMA).toMatch(/evidence: \{ type: 'STRING' \}/)
    // Requiring it would make the model manufacture one.
    expect(SCHEMA).not.toMatch(/'source_video', 'evidence'/)
  })
})

describe('the pass is addition, not replacement', () => {
  it('the general extractor still runs on every scan', () => {
    expect(JOB).toMatch(/extractKnowledgeFromAudio\(handle, platform, transcripts\)/)
    expect(JOB).toMatch(/extractKnowledgeTargeted\(handle, platform, transcripts\)/)
    expect(JOB).toMatch(/extractKnowledgeFromCaptions\(handle, platform, captions\)/)
  })

  it('both speech passes read IDENTICAL material, through one batcher', () => {
    // ⚖️ If they batched differently, an item found by one and not the other
    // would be unattributable to the prompt — which is the only reason to run
    // two passes at all.
    expect(VOICE).toMatch(/export function buildExtractBatches/)
    const uses = VOICE.match(/buildExtractBatches\(transcripts\)/g) ?? []
    expect(uses).toHaveLength(2)
  })

  it('targeted rows survive the row cap ahead of general ones', () => {
    // ⚠️ `KNOWLEDGE_ROWS_PER_SCAN` is a hard `.slice`, and this repo has four
    // recorded instances of a silent downstream cap absorbing an upstream raise.
    // If the passes together exceed it, the rows carrying a sentence are the
    // ones that must survive.
    //
    // ⚠️ THE WINDOW WIDENED WHEN A FOURTH PASS LANDED. The claim is unchanged —
    // rows carrying a copied sentence must survive the cap ahead of rows that do
    // not — and the demand pass carries one too, so it sits between them.
    const raw = JOB.slice(JOB.indexOf('const raw = ['), JOB.indexOf('const raw = [') + 1200)
    expect(raw.indexOf('fromTargeted')).toBeLessThan(raw.indexOf('fromAudio'))
    expect(raw.indexOf('fromDemand')).toBeLessThan(raw.indexOf('fromAudio'))
  })

  it('both speech passes are tagged `transcript`, not a third source value', () => {
    // They are the same speech read twice. A new `source` value would fork a
    // column whose job is to say how strong the evidence is.
    expect(JOB).toMatch(/fromTargeted\.map\(\(r\) => \(\{ \.\.\.r, __source: 'transcript' as const \}\)\)/)
  })

  it('a failing targeted pass never costs the scan its knowledge or its voice', () => {
    const fn = VOICE.slice(VOICE.indexOf('export async function extractKnowledgeTargeted'))
    expect(fn.slice(0, fn.indexOf('console.log'))).toMatch(/catch \{\s*\n\s*return items/)
  })

  it('reports what the second set of model calls bought', () => {
    // ⚠️ THE PASS DOUBLES GEMINI CALLS PER SCAN. The trade has to be measurable
    // rather than assumed, and `with_evidence` is the number that decides it.
    expect(VOICE).toMatch(/event: 'targeted_extract_done'/)
    expect(VOICE).toMatch(/with_evidence:/)
  })
})

describe('evidence survives the write path', () => {
  it('the worker normalises it at 0215\'s cap, not at text\'s', () => {
    // ⚠️ Truncating a sentence to 240 produces a SEVERED quotation, which is
    // worse than no quotation.
    expect(JOB).toMatch(/evidence: longOrNull\(r\.evidence\)/)
    expect(JOB).toMatch(/const longOrNull[\s\S]{0,200}slice\(0, 400\)/)
  })

  it('a worker ahead of the migration loses the sentence, never the batch', () => {
    expect(INSERT).toMatch(/source, cost, consensus, extractor_version, evidence, \.\.\.rest/)
    expect(INSERT).toMatch(/\|evidence\)/)
  })
})
