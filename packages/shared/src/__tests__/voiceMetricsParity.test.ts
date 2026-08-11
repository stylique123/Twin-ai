// THE PACKAGING MEASUREMENT EXISTS IN THREE PLACES AND MUST AGREE.
//
// `voiceMetrics` here, `measurePackaging` in the worker (which computes it at
// scan time, the only place the titles exist), and `packagingPromptLine` in the
// edge function (which renders what was stored). Both duplicates are deliberate
// — the worker has no @twinai/shared runtime dep and edge functions cannot
// import it under Deno deploy — but a deliberate duplicate is only safe while
// something compares them.
//
// ⚠️ WHAT DRIFT COSTS. If the worker's thresholds diverge from shared's, a
// creator is measured by one rule and instructed by another. If the edge's
// `PACK_NEVER` creeps from 8 to 20, "they NEVER open with a question" starts
// being said about someone who does it a fifth of the time — a fabricated habit,
// which is the same class of error as a fabricated opinion.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { voiceMetrics } from '../voiceMetrics'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const WORKER = readFileSync(join(REPO, 'worker/src/jobs/scrapeDna.ts'), 'utf8')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const SHARED = readFileSync(join(REPO, 'packages/shared/src/voiceMetrics.ts'), 'utf8')

function lift(src: string, name: string, where: string): string {
  const m = src.match(new RegExp(`const ${name} =\\s*\\n?\\s*(.+)$`, 'm'))
  if (!m) throw new Error(`could not lift ${name} from ${where} — fix the marker, do not inline the text`)
  return m[1].trim()
}

describe('the worker measures what shared defines', () => {
  for (const name of ['QUESTION', 'NUMBER', 'FIRST_PERSON', 'SECOND_PERSON', 'SHOUT', 'IMPERATIVE']) {
    it(`${name} is character-identical`, () => {
      expect(lift(WORKER, name, 'the worker')).toBe(lift(SHARED, name, 'shared'))
    })
  }

  it('both exclude articles from the signature opener', () => {
    // "the" led 3 of 10 real titles and was reported as a style. It is grammar.
    expect(WORKER).toMatch(/ARTICLES = new Set\(\['the', 'a', 'an'\]\)/)
    expect(SHARED).toMatch(/ARTICLES = new Set\(\['the', 'a', 'an'\]\)/)
  })

  it('both use the same noise floor for a signature opener', () => {
    // Two occurrences in fifty is a coincidence, not a habit.
    for (const [src, where] of [[WORKER, 'worker'], [SHARED, 'shared']] as const) {
      expect(src, where).toMatch(/best < Math\.max\(3, n \* 0\.1\)/)
    }
  })
})

describe('the edge instructs on the same thresholds', () => {
  it('NEVER and ALWAYS have not drifted', () => {
    expect(lift(EDGE, 'PACK_NEVER', 'the edge')).toBe(lift(SHARED, 'NEVER', 'shared'))
    expect(lift(EDGE, 'PACK_ALWAYS', 'the edge')).toBe(lift(SHARED, 'ALWAYS', 'shared'))
  })

  it('refuses to instruct below the same sample floor', () => {
    expect(EDGE).toMatch(/minSample = 20/)
    expect(SHARED).toMatch(/minSample = 20/)
  })

  it('carries the same caveat about what it does NOT govern', () => {
    // Titles are packaging, not speech. Losing this line is how a hook rule
    // silently becomes a rule about body prose.
    for (const [src, where] of [[EDGE, 'edge'], [SHARED, 'shared']] as const) {
      expect(src, where).toMatch(/NOT rules about body prose/)
    }
  })
})

describe('the chain is actually connected', () => {
  it('the worker stores what it measured, without clobbering the DNA blob', () => {
    expect(WORKER).toMatch(/const packaging = measurePackaging\(/)
    // Merged, not replaced — overwriting `profile` would lose the synthesis.
    expect(WORKER).toMatch(/profile: \{ \.\.\.\(profile as Record<string, unknown>\), packaging \}/)
  })

  it('the edge reads it and puts it in the prompt', () => {
    // A block computed and never interpolated is the defect this whole file
    // exists to prevent, one level down.
    expect(EDGE).toMatch(/const packagingBlock = packagingPromptLine\(/)
    expect(EDGE).toMatch(/\$\{evidenceBlock\}\$\{packagingBlock\}/)
  })

  it('shared still produces the shape the edge expects to read', () => {
    // The contract between the two ends of the chain: field names.
    const m = voiceMetrics(['Is this real?', 'Stop doing this', 'The best phone', 'I bought one'])
    for (const k of ['sampled', 'questionOpenRate', 'medianWords', 'numberRate',
      'firstPersonRate', 'secondPersonRate', 'shoutRate', 'emojiRate',
      'imperativeOpenRate', 'topOpener']) {
      expect(m, `missing ${k}`).toHaveProperty(k)
      expect(EDGE, `edge never reads ${k}`).toMatch(new RegExp(k))
    }
  })
})
