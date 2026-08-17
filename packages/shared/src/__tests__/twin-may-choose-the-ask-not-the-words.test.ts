// TWIN MAY DECIDE WHAT THE VIEWER IS ASKED TO DO. IT MAY NOT DECIDE, AND THEN
// CLAIM, WHAT THE CREATOR WANTED TO SAY.
//
// ⚖️ TWO THINGS SHARE ONE WORD. The MECHANISM — follow, comment, book a call — is
// a creative decision, and the goal and the reference are legitimate inputs to
// it. The TEXT is the sentence said out loud, and the creator's own wording is
// theirs alone.
//
// ⚠️ THE FAILURE IS QUIET AND FLATTERING: derive "Follow for more" from the goal,
// store it as the default CTA, and every later screen reports a confirmed
// preference nobody expressed. It is the palette defect in a different column —
// a machine's reading promoted to a person's decision — and once stored, nothing
// distinguishes it from the real thing.
import { describe, expect, it } from 'vitest'
import { resolveCta, hasConfirmedCta, MECHANISM_FROM_GOAL, CTA_MECHANISMS } from '../cta'
import { VIDEO_GOALS } from '../videoIntent'
import { contentProfile } from '../profileCompletion'
import { BRIEF_STORED_KEYS, sanitizeBriefForWrite } from '../preScriptBrief'

describe('the creator owns the wording', () => {
  it('uses what they typed, and says it came from them', () => {
    const r = resolveCta({ defaultCta: 'Try Twin free', goal: 'sell' })
    expect(r.text).toBe('Try Twin free')
    expect(r.source).toBe('user_confirmed')
  })

  it('never labels a sentence it wrote as theirs', () => {
    // ⚠️ THE CENTRAL CLAIM OF THE MODULE.
    for (const goal of VIDEO_GOALS) {
      const r = resolveCta({ goal })
      expect(r.source, goal).toBe('generated')
      expect(r.text, goal).toBeTruthy()
    }
  })

  it('produces nothing at all when it has nothing to go on', () => {
    // ⚖️ A CHEERFUL DEFAULT WOULD BE A SENTENCE PUT IN SOMEBODY'S MOUTH to fill a
    // field. Null is the honest answer.
    expect(resolveCta({})).toEqual({ text: null, mechanism: null, source: null })
  })
})

describe('the mechanism is Twin’s to choose', () => {
  it('covers every goal, because a missed one silently loses the CTA', () => {
    // ⚠️ I WROTE THIS MAP AGAINST A GOAL LIST I HAD ASSUMED — it had `awareness`
    // and `community`, and the real enum has neither. With an index signature
    // every real goal would have returned undefined and fallen through to the
    // no-mechanism branch. The exhaustive Record turns that into a type error.
    for (const goal of VIDEO_GOALS) {
      expect(CTA_MECHANISMS, goal).toContain(MECHANISM_FROM_GOAL[goal])
    }
  })

  it('lets the reference outrank the goal on the ask, never on the words', () => {
    // ⚖️ The reference is measured evidence about what this shape of video asks
    // for; the goal is a stated intention. Neither writes a sentence.
    const r = resolveCta({ goal: 'sell', referenceMechanism: 'comment' })
    expect(r.mechanism).toBe('comment')
    expect(r.source).toBe('generated')
  })
})

describe('a non-commercial video does not carry a sales pitch', () => {
  it('sets aside even the creator’s own CTA when the ask may not be commercial', () => {
    // ⚠️ SOMEONE WHOSE DEFAULT IS "Try Twin free" STILL MAKES NON-COMMERCIAL
    // VIDEOS. Pasting a product pitch onto the end of one is the CTA overriding
    // the creative decision rather than serving it.
    const r = resolveCta({ defaultCta: 'Try Twin free', goal: 'sell', commercial: false })
    expect(r.text).not.toBe('Try Twin free')
    expect(r.source).toBe('generated')
    expect(r.mechanism).toBe('follow')
  })

  it('but keeps their wording for a non-commercial ask', () => {
    const r = resolveCta({ defaultCta: 'Follow along', goal: 'followers', commercial: false })
    expect(r.text).toBe('Follow along')
    expect(r.source).toBe('user_confirmed')
  })
})

describe('the meter cannot be satisfied by Twin’s own sentence', () => {
  const answers = {
    workKind: 'creator', audience: ['a'], contentGoals: ['teach'],
    desiredFormats: ['talking_head'], commercialTies: ['none'],
  } as never

  it('counts a typed CTA and refuses a generated one', () => {
    // ⚠️ THE MEASURABLE CONSEQUENCE OF THE PROVENANCE SPLIT. Only text a person
    // typed reaches `input.cta`, because a generated line is produced per video
    // and never written back to the profile.
    const withTyped = contentProfile({ answers, dnaReady: true, cta: 'Try Twin free' })
    expect(withTyped.percent).toBe(100)

    const generated = resolveCta({ goal: 'followers' })
    const withGenerated = contentProfile({ answers, dnaReady: true, cta: null })
    expect(generated.text).toBeTruthy()
    expect(withGenerated.percent).toBeLessThan(100)
    expect(withGenerated.gaps.map((g) => g.id)).toContain('cta')
  })

  it('treats whitespace as unanswered', () => {
    expect(hasConfirmedCta('   ')).toBe(false)
    expect(hasConfirmedCta(null)).toBe(false)
    expect(hasConfirmedCta('Follow me')).toBe(true)
  })
})

describe('only the creator’s wording is stored', () => {
  it('has a home in the brief', () => {
    expect(BRIEF_STORED_KEYS).toContain('defaultCta')
    expect(sanitizeBriefForWrite({ defaultCta: '  Try Twin free  ' }).defaultCta)
      .toBe('Try Twin free')
  })

  it('drops an empty one rather than storing a blank preference', () => {
    expect(sanitizeBriefForWrite({ defaultCta: '   ' })).not.toHaveProperty('defaultCta')
  })
})

// ── AND THE ANSWER REACHES THE SCRIPT ─────────────────────────────────────
//
// ⚠️ `answers.cta` UNBLOCKED THE READINESS GATE AND WAS THEN DROPPED. It was not
// merged into the brief, not persisted, and never interpolated into the prompt —
// so a creator answered "What should viewers do after watching?" and the script
// still ended on whatever the model chose. Same asked-and-discarded failure that
// `brief_consumers.json` exists to prevent, one layer above the brief.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

describe('the writer is told the creator’s own CTA', () => {
  it('stops re-asking somebody who already told us', () => {
    // ⚠️ `brief.cta` IS NOT A STORED KEY, so this fallback was always undefined
    // and every commercial video asked again.
    expect(EDGE).toMatch(/answers\.cta \?\? brief\.defaultCta \?\? brief\.cta/)
  })

  it('merges the answer into THIS generation, not only the next one', () => {
    // ⚖️ The brief is read before the questions are asked, so persisting alone
    // would fix the following video and leave the paid one unchanged.
    expect(EDGE).toMatch(/if \(readyPresent\(answers\.cta\)\) brief\.defaultCta =/)
    expect(EDGE).toMatch(/if \(readyPresent\(answers\.cta\)\) stable\.defaultCta =/)
  })

  it('puts their wording in the prompt and tells the model not to smooth it', () => {
    expect(EDGE).toMatch(/THE CREATOR'S OWN CALL TO ACTION/)
    expect(EDGE).toMatch(/\$\{ctaWordingLine\}/)
    expect(EDGE).toMatch(/Do NOT paraphrase it/)
  })

  it('still refuses a commercial ask on a video that may not carry one', () => {
    // ⚠️ THE CREATOR'S CTA DOES NOT OUTRANK THE COMMERCIAL PERMISSION. Their
    // wording is theirs; whether a purchase ask is allowed at all is decided by
    // the relationship, and this line must not become a way around that.
    expect(EDGE).toMatch(/unless this video may not carry a commercial ask at all/)
  })

  it('only a typed sentence can reach the column', () => {
    // ⚖️ Nothing generated flows into `answers.cta` or `defaultCta` — provenance
    // is structural, so there is no flag to set wrongly.
    const region = EDGE.slice(EDGE.indexOf('stable.defaultCta'), EDGE.indexOf('stable.defaultCta') + 400)
    expect(region).not.toMatch(/GENERATED_TEXT|resolveCta/)
  })
})
