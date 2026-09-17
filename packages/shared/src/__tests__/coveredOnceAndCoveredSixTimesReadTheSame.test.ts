// "COVERED ONCE" AND "COVERED SIX TIMES" REACHED THE WRITER AS THE SAME LINE.
//
// ⚠️ THE ALREADY-COVERED LIST RENDERED ONLY THE SUBJECT. `times_seen` — how many
// of the creator's videos carried it — has existed on every row since 0121 and
// was never rendered anywhere, so a subject they have returned to six times
// arrived indistinguishable from one they mentioned once. Those are opposite
// instructions: the first is their THESIS, the thing their audience comes for;
// the second is a topic to approach from a new angle. Treating them the same
// either wastes their strongest subject or repeats their weakest.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const code = EDGE.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('the count reaches the writer', () => {
  it('the covered list renders times_seen', () => {
    expect(code).toMatch(/covered in \$\{Math\.trunc\(n\)\} of their videos/)
    expect(code).toMatch(/const n = Number\(\(k as \{ times_seen\?: unknown \}\)\.times_seen\)/)
  })

  // ⚖️ ONLY WHEN IT IS MORE THAN ONE. "(once)" on every line is noise and 1 is
  // the default reading anyway — so the guard is on the CONDITION, not just on
  // the string, or a mirror that printed "covered in 1 of their videos" would
  // pass.
  it('a count of one adds nothing', () => {
    expect(code).toMatch(/Number\.isFinite\(n\) && n > 1/)
  })

  // ⚠️ AND IT IS STILL NEVER SPOKEN. The first version of this list said only "do
  // not repeat" and a run produced the spoken line "megapixel count. We've had a
  // video on this, but it's still true" — our notes narrated to the audience. A
  // count makes the list MORE interesting to a model, so the refusal has to still
  // be there.
  it('the list still says it is never spoken', () => {
    // ⚠️ ANCHORED ON THE PUSHED LIST, NOT ON "ALREADY COVERED" — that phrase also
    // opens a DIFFERENT block 6,000 lines earlier (the same-premise warning), and
    // slicing from the first occurrence measured the wrong one. This repo's own
    // rule: never anchor on a string that also appears in a different block
    // earlier in the file.
    const block = EDGE.slice(EDGE.indexOf("knowledgeParts.push('\\nALREADY COVERED"))
      .slice(0, 1600)
    expect(block).toMatch(/THIS LIST IS NEVER SPOKEN/)
    expect(block).toMatch(/must not appear in any line/)
  })
})

describe('the yield has a denominator that is written down', () => {
  const JOB = readFileSync(join(REPO, 'worker/src/jobs/voice.ts'), 'utf8')

  // ⚠️ "1.63 ROWS PER TRANSCRIPT" DIVIDES BY VIDEOS, which hides the character
  // cap that actually decides how much text the extractor read. One owner holds
  // 162,668 characters against a 60,000-character ceiling, so ~100k has never
  // been read by any extraction — and that loss was recorded nowhere.
  it('build_voice stores the characters it read, not only the video count', () => {
    expect(JOB).toMatch(/transcript_chars: transcripts\.reduce\(\(n, t\) => n \+ t\.length, 0\)/)
    expect(JOB).toMatch(/videos_used: transcripts\.length/)
  })
})
