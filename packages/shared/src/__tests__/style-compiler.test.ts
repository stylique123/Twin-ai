// LABELS DESCRIBE A CREATOR. RULES TELL A WRITER WHAT TO DO.
//
// ⚠️ THE TEST THAT MATTERS MOST HERE IS THE REFUSAL. A style profile is the most
// confident-sounding thing this system can emit — precise percentages about a
// person's voice — and it would sound exactly as confident computed from three
// sentences of somebody else's video.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  compileStyle, renderStyleRules, sentencesOf, MIN_SENTENCES, SHORT_SENTENCE_WORDS, NOT_MEASURED,
} from '../styleCompiler'

const SQL = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'migrations', '0135_transcript_subject.sql'), 'utf8')
const WORKER = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'worker', 'src', 'jobs', 'transcribe.ts'), 'utf8')

/** Enough sentences to clear the threshold, in a deliberate shape. */
const punchy = Array.from({ length: 45 }, (_, i) => `You need to stop doing this now. It costs you ${i} hours.`).join(' ')

describe('it refuses before it describes', () => {
  it('an empty corpus is not a style', () => {
    const s = compileStyle([])
    expect(s.reportable).toBe(false)
    expect(s.sentences).toBe(0)
  })

  it('whitespace and empty strings are not speech', () => {
    expect(compileStyle(['', '   ', '\n\n']).reportable).toBe(false)
  })

  it('a handful of sentences is NOT reportable, however clear the pattern', () => {
    // ⚠️ THE PATTERN HERE IS UNANIMOUS — every sentence short, every one "you".
    // Unanimity over five sentences is still five sentences.
    const s = compileStyle(['You should stop. You must move. You will win. You can do it. You know this.'])
    expect(s.sentences).toBeLessThan(MIN_SENTENCES)
    expect(s.reportable).toBe(false)
  })

  it('renders NOTHING rather than a hedged block when unreportable', () => {
    // ⚖️ An absent block leaves today's DNA labels doing their job. A hedged one
    // tells the writer about a creator this system has never heard speak.
    expect(renderStyleRules(compileStyle(['You should stop. You must move.']))).toBe('')
  })

  it('renders once the corpus carries it', () => {
    const out = renderStyleRules(compileStyle([punchy]))
    expect(out).toMatch(/MEASURED FROM \d+ SENTENCES OF THEIR OWN RECORDED SPEECH/)
    expect(out).toMatch(/Sentence length: median \d+ words/)
  })
})

describe('what it measures, it measures correctly', () => {
  it('splits caption wrapping WITHOUT counting it as a sentence break', () => {
    // ⚠️ PRODUCTION TRANSCRIPTS ARE HARD-WRAPPED MID-SENTENCE by the caption
    // renderer. Splitting on newlines would measure the caption width and report
    // it as the creator's sentence length.
    const wrapped = 'This is the most dangerous\nproblem in mathematics, one that\nyoung mathematicians avoid. Pick a number.'
    expect(sentencesOf(wrapped)).toHaveLength(2)
    expect(sentencesOf(wrapped)[0]).toContain('problem in mathematics')
  })

  it('uses the MEDIAN, so one ASR run-on cannot move the number', () => {
    const normal = Array.from({ length: 44 }, () => 'Short punchy line here.').join(' ')
    const withRunOn = normal + ' ' + Array.from({ length: 300 }, () => 'word').join(' ') + '.'
    expect(compileStyle([withRunOn]).medianSentenceWords)
      .toBe(compileStyle([normal]).medianSentenceWords)
  })

  it('counts direct address and questions as shares of sentences', () => {
    const s = compileStyle([Array.from({ length: 50 }, (_, i) =>
      i % 2 === 0 ? 'Do you want this?' : 'The answer is simple.').join(' ')])
    expect(s.secondPersonShare).toBeCloseTo(0.5, 1)
    expect(s.questionShare).toBeCloseTo(0.5, 1)
  })

  it('a short-sentence share reflects the boundary it names', () => {
    const s = compileStyle([punchy])
    expect(SHORT_SENTENCE_WORDS).toBe(12)
    expect(s.shortSentenceShare).toBeGreaterThan(0.9)
  })
})

describe('one habit is a habit; three are a range', () => {
  it('reports a single opener move when every sample opens that way', () => {
    const claims = Array.from({ length: 4 }, () =>
      Array.from({ length: 12 }, () => 'The tool changed everything for us.').join(' '))
    expect(compileStyle(claims).opener).toBe('claim')
  })

  it('reports MIXED rather than picking the most common of several', () => {
    const body = Array.from({ length: 20 }, () => 'It works well.').join(' ')
    const s = compileStyle([`Do you know this? ${body}`, `The truth is simple. ${body}`, `You are wrong. ${body}`])
    expect(s.opener).toBe('mixed')
    // ⚖️ And a mixed opener produces NO opener line — an invented rule is worse
    // than a missing one.
    expect(renderStyleRules(s)).not.toMatch(/They open on a/)
  })
})

describe('the absence is named, not hidden', () => {
  it('says out loud what it does not compute', () => {
    expect(NOT_MEASURED).toContain('warmth')
    expect(NOT_MEASURED).toContain('whether_the_writing_is_good')
  })
})

describe('provenance is recorded where it is still known (0135)', () => {
  it('the worker writes the subject from the JOB TYPE', () => {
    // ⚠️ THE ONLY PLACE THAT CAN TELL. `ingest` analyses a pasted reference;
    // `transcribe` transcribes one of the creator's own posts. One line after the
    // insert the two rows are identical.
    expect(WORKER).toMatch(/subject: job\.type === 'ingest' \? 'reference' : 'own'/)
  })

  it('the column admits only the two it knows, and NULL', () => {
    expect(SQL).toMatch(/subject is null or subject in \('own', 'reference'\)/)
  })

  it('backfills ONLY the decidable direction', () => {
    // ⚠️ A row matching a generation's reference_url IS a reference — a fact.
    // The rest are not thereby the creator's own, and must stay NULL.
    expect(SQL).toMatch(/set subject = 'reference'/)
    expect(SQL).not.toMatch(/set subject = 'own'/)
  })

  it('never defaults to own, which would launder unknown rows into a voice', () => {
    expect(SQL).not.toMatch(/default 'own'/)
    expect(SQL).not.toMatch(/subject text not null/)
  })
})
