// THE ONE QUESTION ABOUT THE REFERENCE WAS THE ONE NOBODY ASKED.
//
// ⚠️ GOAL, FOCUS AND OUTCOME ARE ALL ABOUT THE CREATOR. They are identical
// whether somebody pasted a three-item listicle or a personal confession — so
// the amount of the reference to carry across, the single thing that changes
// with every link, was never asked, and the transfer layer had to guess what
// "remix this" meant.
//
// ⚖️ AND NO SETTING HERE IS A PERMISSION. "Keep it close" is the most faithful
// option available and it still may not carry the reference's product facts,
// unsupported claims, creator identity, lived experience or exact words. Those
// are refused at every value, which is what makes a faithful setting safe to
// offer at all.
import { describe, expect, it } from 'vitest'
import {
  compileVideoIntent, REFERENCE_USE, REFERENCE_USE_DIRECTIVE, KEEPS_REFERENCE_TOPIC,
  INTENT_QUESTIONS, reachableIntentValues, REFERENCE_USE_MIGRATION,
} from '../videoIntent'

describe('the answer reaches the writer as an instruction', () => {
  it('gives every setting a directive', () => {
    for (const use of REFERENCE_USE) {
      const intent = compileVideoIntent({ referenceUse: use })
      expect(intent.referenceUse, use).toBe(use)
      expect(intent.referenceUseDirective, use).toBe(REFERENCE_USE_DIRECTIVE[use])
    }
  })

  it('says what to KEEP and what to REPLACE, not how it should feel', () => {
    // ⚖️ THE MEASURED RULE. Changing what reaches the writer works; changing how
    // the writer is instructed does not. "Stay close" tells a model nothing it
    // can act on — a beat order and a hook mechanism are decidable.
    for (const [use, line] of Object.entries(REFERENCE_USE_DIRECTIVE)) {
      expect(line, use).toMatch(/keep|take|preserve/i)
      expect(line, use).not.toMatch(/\b(vibe|feel|energy|tone)\b/i)
    }
  })
})

describe('structure and topic are two questions, not one dial', () => {
  it('replacing the subject is what "just how it is built" MEANS', () => {
    // ⚠️ THE BUG THIS SPLIT PREVENTS. Reading one dial for both is how "use the
    // structure" quietly kept the reference's topic — answering a question the
    // creator did not ask.
    expect(KEEPS_REFERENCE_TOPIC.structure).toBe(false)
    // ⚖️ `inspiration` USED TO BE ASSERTED HERE AND IS NOW A MIGRATION ENTRY.
    // It agreed with `structure` on this exact axis — the subject is replaced —
    // which is what made collapsing the two honest rather than convenient. The
    // agreement is still pinned, one line down, through the migration.
    expect(KEEPS_REFERENCE_TOPIC[REFERENCE_USE_MIGRATION.inspiration]).toBe(false)
    expect(KEEPS_REFERENCE_TOPIC.idea_structure).toBe(true)
    expect(KEEPS_REFERENCE_TOPIC.stay_close).toBe(true)
  })

  it('carries the split onto the compiled record', () => {
    expect(compileVideoIntent({ referenceUse: 'structure' }).keepsReferenceTopic).toBe(false)
    expect(compileVideoIntent({ referenceUse: 'stay_close' }).keepsReferenceTopic).toBe(true)
  })
})

describe('unanswered is not a setting', () => {
  it('puts no transfer instruction in the prompt', () => {
    // ⚠️ A creator who never saw this question has not asked for their subject
    // to be replaced, and a default would speak for them.
    const intent = compileVideoIntent({})
    expect(intent.referenceUse).toBeNull()
    expect(intent.referenceUseDirective).toBeNull()
  })

  it('leaves the premise stage exactly as it behaved before', () => {
    // ⚖️ TRUE WHEN UNANSWERED, because adapting the reference's topic is what
    // every generation has always done. Only an explicit answer narrows it.
    expect(compileVideoIntent({}).keepsReferenceTopic).toBe(true)
  })

  it('refuses a value from an older or hand-edited client', () => {
    for (const bad of ['STRUCTURE', 'copy_it', '', null, 7, {}]) {
      expect(compileVideoIntent({ referenceUse: bad }).referenceUse, String(bad)).toBeNull()
    }
  })

  it('records what it resolved, so the choice is auditable', () => {
    expect(compileVideoIntent({ referenceUse: 'structure' }).resolutions.join(' '))
      .toMatch(/subject is replaced/)
    expect(compileVideoIntent({}).resolutions.join(' ')).not.toMatch(/reference use/)
  })
})

describe('what the creator reads', () => {
  it('is asked on the remix screen', () => {
    const q = INTENT_QUESTIONS.find((x) => x.field === 'reference_use')
    expect(q).toBeTruthy()
    // ⚠️ THREE, NOT FOUR. The four read as two pairs of paraphrases — "just how
    // it is built" against "just the good bit", "the idea and how it is built"
    // against "keep it close" — and a control whose options cannot be told apart
    // is a coin toss the creator is asked to perform. This is now an ordered
    // three-point scale, and declaration order is presentation order.
    expect(q!.options).toHaveLength(3)
    expect(q!.options.map((o) => o.value)).toEqual(['structure', 'idea_structure', 'stay_close'])
  })

  it('offers exactly the values the compiler accepts', () => {
    // ⚖️ A chip whose value the server discards is a question that lies.
    expect(reachableIntentValues('reference_use').sort()).toEqual([...REFERENCE_USE].sort())
  })

  it('never says "structure", "transfer" or "adapt" on screen', () => {
    // ⚠️ THE HARD UX RULE. A 15-year-old creator and a 55-year-old business
    // owner both have to understand every option in under two seconds, and none
    // of them should have to know what Twin calls this internally.
    const q = INTENT_QUESTIONS.find((x) => x.field === 'reference_use')!
    const shown = [q.question, ...q.options.flatMap((o) => [o.label, o.hint ?? ''])].join(' ').toLowerCase()
    for (const jargon of ['transfer', 'adapt', 'fidelity', 'mechanic', 'preserve', 'reference use']) {
      expect(shown, jargon).not.toContain(jargon)
    }
  })
})

// ── EDGE ↔ SHARED PARITY, EXECUTED ────────────────────────────────────────
//
// ⚠️ TWO COPIES EXIST BECAUSE EDGE FUNCTIONS CANNOT IMPORT `@twinai/shared`.
// That is a deliberate inlining, and the only thing that keeps a deliberate copy
// honest is a test that RUNS both — a text comparison waves through a directive
// that differs by one clause, which is exactly the drift that matters here,
// because the clause is what the writer obeys.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

describe('the edge copy says exactly what the shared one says', () => {
  it('carries the same four directives, word for word', () => {
    for (const use of REFERENCE_USE) {
      // The inlined table is a plain object literal, so each directive appears
      // verbatim. An escaped apostrophe in the source is the only difference.
      const want = REFERENCE_USE_DIRECTIVE[use].replace(/'/g, "\\'")
      expect(EDGE.includes(want), use).toBe(true)
    }
  })

  it('agrees on which settings keep the topic', () => {
    expect(EDGE).toMatch(
      /structure: false, idea_structure: true, stay_close: true,/)
  })

  it('defaults to keeping the topic when unanswered, on both sides', () => {
    expect(EDGE).toMatch(/keepsReferenceTopic: referenceUse === null \? true/)
    expect(compileVideoIntent({}).keepsReferenceTopic).toBe(true)
  })

  it('reads the answer off the request and puts it in the prompt', () => {
    // ⚠️ THE TWO LINES THAT MAKE THIS MORE THAN A STORED OPINION.
    expect(EDGE).toMatch(/referenceUse: body\.reference_use/)
    expect(EDGE).toMatch(/\$\{doNotUseBlock\}\$\{referenceUseBlock\}/)
  })

  it('keeps the dial UNDER the rules it may not override', () => {
    // ⚖️ ORDER OF AUTHORITY, VISIBLE IN THE PROMPT ITSELF. "Keep it close" is
    // bounded by the DO NOT USE block rather than an exception to it, so the
    // block must be built first and printed first.
    expect(EDGE.indexOf('const doNotUseBlock')).toBeLessThan(EDGE.indexOf('const referenceUseBlock'))
  })
})
