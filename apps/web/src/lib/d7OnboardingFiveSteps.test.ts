// D7 — ONBOARDING, 10 STEPS DOWN TO 5.
//
// Four separate defects, each verified against the ACTUAL current code rather
// than assumed from the audit's numbering:
//
//   1. Occupation chips (10 -> 6 that provably change the writer prompt, +
//      `other` as the honest escape hatch every occupation not on the list
//      already had). `founder`, `coach` and `freelancer` have no entry in
//      `WORK_KIND_LINES` or `CLAIMS_QUESTION_KINDS` in generate-blueprint —
//      picking any of them produces the exact same nothing as picking none.
//   2. Goal question: untouched. Fixed in D1 (#607), out of scope here.
//   3. The three story questions ("expensive lesson", "best result",
//      "contrarian") merge into ONE screen with three fields, still writing
//      three separate `creator_knowledge` rows with the same `source_ref`s.
//   4. Capabilities / commercial-ties: confirmed unchanged (see
//      what-can-appear-is-one-question.test.ts in packages/shared — the
//      capabilities question is already one screen; commercialTies is a
//      genuinely distinct question, not a wrongful split).
//   5. `desiredFormats` ("what kinds of videos do you want to make") is
//      removed from the onboarding question list and moved to the Gallery.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PROFILE_QUESTION_IDS, BRIEF_WORK_KINDS } from '@twinai/shared'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const ONBOARDING = readFileSync(join(REPO, 'apps/web/src/pages/Onboarding.tsx'), 'utf8')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const GALLERY = readFileSync(join(REPO, 'apps/web/src/pages/Gallery.tsx'), 'utf8')
const STORY = readFileSync(join(REPO, 'apps/web/src/components/StoryInterview.tsx'), 'utf8')
const PRE_SCRIPT_BRIEF = readFileSync(join(REPO, 'packages/shared/src/preScriptBrief.ts'), 'utf8')

describe('1. occupation chips: 10 down to 7 offered (6 productive + other)', () => {
  it('the writer prompt really does treat founder/coach/freelancer as dead-equal', () => {
    // Pinned against the ACTUAL edge function, not the audit's claim about it.
    const wkl = EDGE.slice(EDGE.indexOf('const WORK_KIND_LINES'), EDGE.indexOf('const workKindOther'))
    for (const dead of ['founder', 'coach', 'freelancer']) {
      expect(wkl, `${dead} must have no WORK_KIND_LINES entry`).not.toMatch(new RegExp(`\\b${dead}:`))
    }
    expect(PRE_SCRIPT_BRIEF).toMatch(/CLAIMS_QUESTION_KINDS: readonly BriefWorkKind\[\] = \['professional', 'ecommerce', 'brand'\]/)
  })

  it('a new signup is offered only the six that change the prompt, plus other', () => {
    expect(ONBOARDING).toMatch(
      /const ONBOARDING_WORK_KINDS: readonly BriefWorkKind\[\] = \[\s*'creator', 'professional', 'ecommerce', 'brand', 'saas', 'local_service', 'other',\s*\]/)
    expect(ONBOARDING).not.toMatch(/ONBOARDING_WORK_KINDS[\s\S]{0,200}'founder'/)
    expect(ONBOARDING).not.toMatch(/ONBOARDING_WORK_KINDS[\s\S]{0,200}'coach'/)
    expect(ONBOARDING).not.toMatch(/ONBOARDING_WORK_KINDS[\s\S]{0,200}'freelancer'/)
  })

  it('both chip renders use the reduced set, not the full stored type', () => {
    expect(ONBOARDING).toMatch(/\{ONBOARDING_WORK_KINDS\.map\(\(k\) => \(/)
    expect(ONBOARDING).toMatch(/values=\{ONBOARDING_WORK_KINDS\} label=\{WORK_KIND_LABEL\} chosen=\{draft\.workKind\}/)
  })

  it('the stored type keeps all ten, so old answers still label correctly', () => {
    // Backward compatibility: a creator who already picked founder/coach/
    // freelancer before this fix must still see a real label, not undefined.
    expect(BRIEF_WORK_KINDS).toContain('founder')
    expect(BRIEF_WORK_KINDS).toContain('coach')
    expect(BRIEF_WORK_KINDS).toContain('freelancer')
    expect(ONBOARDING).toMatch(/founder: 'Founder \/ business owner'/)
  })
})

describe('3. the three story questions are one screen, same three rows', () => {
  it('shows all three prompts on one screen, not one at a time', () => {
    expect(STORY).not.toMatch(/of \{OPENING_THREE\.length\}/)
    expect(STORY).toMatch(/OPENING_THREE\s*\n?\s*\.map/)
  })

  it('still calls answerQuestion / skipQuestion per field, same source_refs', () => {
    expect(STORY).toMatch(/answerQuestion/)
    expect(STORY).toMatch(/skipQuestion/)
    // The ids are untouched — data model unchanged.
    expect(STORY).toMatch(/CREATOR_QUESTIONS, OPENING_THREE/)
  })

  it('still calls onDone exactly once, after all three are resolved', () => {
    expect(STORY).toMatch(/onDone\(\)/)
  })
})

describe('4. capabilities / commercial-ties: confirmed unchanged', () => {
  it('capabilities is still the single, last question in the list', () => {
    expect(PROFILE_QUESTION_IDS[PROFILE_QUESTION_IDS.length - 1]).toBe('capabilities')
    expect(PROFILE_QUESTION_IDS.filter((id) => id === 'capabilities')).toHaveLength(1)
  })
})

describe('5. desiredFormats is out of onboarding and into the Gallery', () => {
  it('is no longer in the onboarding question list', () => {
    expect(PROFILE_QUESTION_IDS).not.toContain('desiredFormats')
    expect(PROFILE_QUESTION_IDS).toEqual(['workKind', 'audience', 'contentGoals', 'commercialTies', 'capabilities'])
  })

  it('the onboarding screen no longer asks the question', () => {
    expect(ONBOARDING).not.toMatch(/What kinds of videos do you want Twin to help you make\?/)
  })

  it('the backend fields are untouched — still real, still read', () => {
    expect(EDGE).toMatch(/DESIRED_FORMAT_PREMISE/)
  })

  it('now lives on the Gallery as a filter', () => {
    expect(GALLERY).toMatch(/DESIRED_FORMATS/)
    expect(GALLERY).toMatch(/formatFilter/)
  })
})
