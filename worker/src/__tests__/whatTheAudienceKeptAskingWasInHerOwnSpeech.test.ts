// WHAT HER AUDIENCE KEPT ASKING WAS IN HER OWN SPEECH, AND NOTHING READ IT.
//
// ⚠️ `audience_questions` WAS DELETED FOR HAVING NO SUPPLY, and the reason given
// was correct: the scan captured what the CREATOR says, not what her audience
// asks, and of 1,080 stored knowledge rows exactly ONE carried an audience-asks
// frame. What that reasoning missed is that creators SAY the demand out loud —
// "a lot of you have been asking how I price these" is her audience's question,
// spoken to camera, already transcribed and already stored.
//
// ⚖️ AND IT IS A REGEX, NOT A MODEL. A cue phrase and the clause after it either
// exist in her sentence or they do not. A model asked the same question would
// paraphrase, rank and occasionally invent; this finds her words or finds
// nothing, and nothing is the common answer.
import { describe, expect, it } from 'vitest'
import { mineTranscript, mineTranscripts, MINED_LINES_MAX } from '../transcriptMining.js'

const texts = (ls: readonly { text: string }[]) => ls.map((l) => l.text)

describe('what the audience keeps asking', () => {
  it('finds the question and keeps the subject', () => {
    const out = mineTranscript('A lot of you have been asking how I price a full rebind.', 1)
    expect(texts(out)).toEqual(['Audience keeps asking: how I price a full rebind.'])
    expect(out[0].evidence).toBe('A lot of you have been asking how I price a full rebind.')
    expect(out[0].kind).toBe('topic')
    expect(out[0].source_video).toBe('1')
  })

  it('reads the several ways a creator says it', () => {
    const lines = [
      'You guys keep asking about the thread I use for the spine.',
      'I get this question a lot: whether the leather cracks in winter.',
      'The most common question I get is how long a rebind actually takes.',
      'So many of you wanted to know where I source the goatskin.',
    ]
    for (const l of lines) {
      const out = mineTranscript(l, 1)
      expect(out.length, `missed: ${l}`).toBe(1)
      expect(out[0].text.startsWith('Audience keeps asking: ')).toBe(true)
      // ⚠️ AND THE CONNECTIVE IS NOT THE SUBJECT. "asking about the thread" and
      // "asked the thread" must produce the same line, or one question stored
      // twice reads as two.
      expect(out[0].text).not.toMatch(/asking: (?:about|whether|that|to|on|me) /)
    }
  })

  // ⚠️ THE SKIP IS THE REASON THE PREFIX CAN BE TRUSTED. "I get that question a
  // lot." is a real sentence about nothing in particular, and recording it would
  // put "Audience keeps asking:" in front of an empty subject.
  it('a cue with no subject after it is not an item', () => {
    for (const l of [
      'I get this question a lot.',
      'A lot of you have been asking.',
      'You guys keep asking, honestly.',
      'People keep asking about that.',
    ]) {
      expect(mineTranscript(l, 1), `should have been skipped: ${l}`).toEqual([])
    }
  })

  // ⚠️ THE CUE MUST NAME THE AUDIENCE AS THE ASKER. Her own reflection is not
  // audience demand, and a cue list that caught it would file her thinking as a
  // request from other people.
  it('her own question to herself is not her audience asking', () => {
    for (const l of [
      'I asked myself whether the price was fair for a full rebind.',
      'I was asked to speak at a bookbinding conference in Leeds.',
      'She asked me if I could rebind her grandmother\'s Bible.',
    ]) {
      expect(texts(mineTranscript(l, 1)).filter((t) => t.startsWith('Audience keeps asking')),
        `false positive: ${l}`).toEqual([])
    }
  })
})

describe('what she promised to cover', () => {
  it('finds the promise and the subject', () => {
    const out = mineTranscript("I'll do a whole video on how I mix the wheat paste.", 1)
    expect(texts(out)).toEqual(['Promised to cover: how I mix the wheat paste.'])
  })

  it('reads the several ways a creator promises one', () => {
    for (const l of [
      "I'm going to make a separate video about the sewing frame build.",
      'I will film a full video on restoring a cracked spine.',
      'More on that soon in another video, I promise.',
      "I'll save that for another video because it takes an hour to explain.",
    ]) {
      const out = mineTranscript(l, 1).filter((x) => x.text.startsWith('Promised to cover'))
      expect(out.length, `missed: ${l}`).toBe(1)
    }
  })

  // ⚖️ A PROMISE IS NOT COVERAGE, AND THE DISTINCTION DECIDES THE KIND. `covered`
  // means "already made, do not repeat" and steers the writer AWAY; a promise is
  // the opposite instruction, so mis-filing one would suppress the very video she
  // said she owed them.
  it('is never filed as covered', () => {
    const out = mineTranscript("I'll do a whole video on the sewing frame build.", 1)
    expect(out.every((l) => l.kind !== 'covered')).toBe(true)
  })

  it('a promise with no subject is not an item', () => {
    for (const l of ["I'll do a whole video on that.", 'I will make a video, promise.']) {
      expect(mineTranscript(l, 1).filter((x) => x.text.startsWith('Promised'))).toEqual([])
    }
  })
})

describe('across a corpus', () => {
  it('one question asked in five videos is one row, pointing at the first', () => {
    const same = 'A lot of you keep asking how I price a full rebind.'
    const out = mineTranscripts([same, same, 'nothing here', same])
    expect(out).toHaveLength(1)
    // ⚠️ THE FIRST OCCURRENCE WINS, the same rule the extractor prompt states for
    // `times_seen`: a creator correcting an item goes and watches the earliest
    // video carrying it.
    expect(out[0].source_video).toBe('1')
  })

  it('numbers each line by the transcript it came from', () => {
    const out = mineTranscripts([
      'nothing of interest here at all',
      'You guys keep asking about the thread I use.',
    ])
    expect(out).toHaveLength(1)
    expect(out[0].source_video).toBe('2')
  })

  // ⚠️ A REGEX DOES NOT GET TIRED. A creator who promises a video in every upload
  // would otherwise fill the 120-row write cap with promises and push out the
  // substance the cap exists to protect.
  it('is bounded, so promises cannot crowd out substance', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      `I'll do a whole video on technique number ${i} and why it matters.`)
    expect(mineTranscripts(many)).toHaveLength(MINED_LINES_MAX)
  })

  it('a corpus with neither cue yields nothing, which is the common case', () => {
    expect(mineTranscripts([
      'Today I am rebinding a 1947 Bible with a cracked spine and loose signatures.',
      'The glue matters more than the leather, and cheap glue fails within a year.',
    ])).toEqual([])
  })

  it('an empty or unreadable corpus is an empty answer, not a throw', () => {
    expect(mineTranscripts([])).toEqual([])
    expect(mineTranscripts(['', '   '])).toEqual([])
    expect(mineTranscript(undefined as unknown as string, 1)).toEqual([])
  })
})
