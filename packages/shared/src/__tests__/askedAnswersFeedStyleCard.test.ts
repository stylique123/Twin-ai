// VOICE CAUSE 1(b) — AN ANSWERED QUESTION IS SPEECH TOO.
//
// ⚠️ MEASURED. `askedRows` (creator_knowledge, source = 'asked') was already
// read and already fed the knowledge block, but never reached the style
// compiler — only `transcripts` rows with `subject = 'own'` did. A creator who
// answers every asked question and films nothing sits at 0 sentences in the
// style card and gets none, while their own verbatim words
// (`answerToKnowledge`'s `text`, typed by them, no extraction step) sat unused
// two reads above. This file pins that the compiler input now includes them.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const FN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'supabase', 'functions')
const SRC = readFileSync(join(FN, 'generate-blueprint', 'index.ts'), 'utf8')

const STYLE_BLOCK = (() => {
  const start = SRC.indexOf("let styleRules = ''")
  expect(start).toBeGreaterThan(-1)
  const end = SRC.indexOf('catch {', start)
  expect(end).toBeGreaterThan(start)
  return SRC.slice(start, end)
})()

describe('the style compiler reads answered questions too, not only transcripts (Voice Cause 1b)', () => {
  it('filters askedRows down to genuinely asked-source rows', () => {
    expect(STYLE_BLOCK).toMatch(/askedRows[\s\S]{0,40}filter[\s\S]{0,60}source[\s\S]{0,20}'asked'/)
  })

  // ⚠️ APPENDED, NOT SUBSTITUTED. A creator with both transcripts and answers
  // should reach the 40-sentence floor sooner, not have one source silently
  // replace the other.
  it('passes both sources into the same compiler call', () => {
    expect(STYLE_BLOCK).toMatch(/compileStyleInline\(\[\.\.\.\(ownSpeech[\s\S]{0,200}\.\.\.askedSpeech\]\)/)
  })

  // ⚖️ A CALLER THAT DROPPED `askedSpeech` FROM THE ARRAY LITERAL WOULD STILL
  // TYPECHECK AND STILL PASS EVERY OTHER TEST IN THE SUITE — this is the one
  // that would catch it.
  it('the asked-derived array is actually named in the compiler call, not merely computed', () => {
    const computed = /const askedSpeech = /.test(STYLE_BLOCK)
    const used = /\.\.\.askedSpeech/.test(STYLE_BLOCK)
    expect(computed && used).toBe(true)
  })
})
