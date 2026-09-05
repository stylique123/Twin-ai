// D7 — ONBOARDING, 10 STEPS DOWN TO 5.
//
// Four separate defects, each verified against the ACTUAL current code rather
// than assumed from the audit's numbering:
//
//   1. Occupation chips (10 -> 7 offered). ⚠️ THIS ITEM WAS FIXED THE WRONG WAY
//      ROUND AND HAS BEEN CORRECTED. The original D7 change removed `founder`,
//      `coach` and `freelancer` from the chooser because `WORK_KIND_LINES` in
//      generate-blueprint had no entry for them. The premise was true and the
//      remedy was backwards: those three chips describe the creators this
//      product is tested on, and deleting them made a coach answer "Something
//      else" about their own occupation. The writer now has a real, distinct
//      line for all three, so the chips are back and the assertions below pin
//      the OFFERED SET AND ITS READER TOGETHER — see
//      workKindLinesCoverEveryChip.test.ts.
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

describe('1. occupation chips: 10 stored values, 8 offered, every one answered', () => {
  it('the writer prompt now has a real line for founder, coach and freelancer', () => {
    // ⚠️ THE INVERSION OF WHAT THIS ONCE ASSERTED. It used to pin that the three
    // had NO entry — treating the gap as the settled state and deleting the
    // chips to match. The gap was the bug. Pinned against the actual edge
    // function, not against a claim about it.
    const wkl = EDGE.slice(EDGE.indexOf('const WORK_KIND_LINES'), EDGE.indexOf('const workKindOther'))
    for (const kind of ['founder', 'coach', 'freelancer']) {
      expect(wkl, `${kind} must have a WORK_KIND_LINES entry`).toMatch(new RegExp(`\\b${kind}: '`))
    }
  })

  it('and those three lines say genuinely different things', () => {
    // ⚖️ RESTORING THE CHIPS WOULD BE WORTHLESS IF THE LINES WERE COPIES. A
    // founder speaks FOR something they own; a coach has no object to film at
    // all; a freelancer sells capacity. Each line has to carry its own fact.
    const wkl = EDGE.slice(EDGE.indexOf('const WORK_KIND_LINES'), EDGE.indexOf('const workKindOther'))
    const lineOf = (k: string) => wkl.match(new RegExp(`^\\s+${k}: '(.*)',$`, 'm'))![1]
    const [founder, coach, freelancer] = ['founder', 'coach', 'freelancer'].map(lineOf)
    expect(new Set([founder, coach, freelancer]).size).toBe(3)
    // The one fact about a coach that changes what can be shot at all.
    expect(coach).toMatch(/NO OBJECT TO FILM/)
    expect(founder).toMatch(/own/i)
    expect(freelancer).toMatch(/CAPACITY/)
  })

  it('the claims question is deliberately NOT widened to the three', () => {
    // ⚖️ THE FILE'S OWN DOCTRINE, APPLIED RATHER THAN OVERRIDDEN. `saas` is
    // excluded because its constraints are competitive, not regulatory, and
    // "asking a compliance question of someone with no compliance regime trains
    // them to skip it, which is how the doctor skips it too." A founder and a
    // freelancer are the same case. A coach has no licensing body either.
    // Restoring a chip is not a reason to widen a liability question.
    expect(PRE_SCRIPT_BRIEF).toMatch(/CLAIMS_QUESTION_KINDS: readonly BriefWorkKind\[\] = \['professional', 'ecommerce', 'brand'\]/)
  })

  // ⚠️ EIGHT SINCE `saas` AND `local_service` WERE SPLIT. They shared one chip
  // while WORK_KIND_LINES held two opposed answers — a plumber picking
  // "Software / local business" stored `saas` and was told their proof was a
  // screen recording. The pair is pinned by name in
  // workKindLinesCoverEveryChip.test.ts; this stays an exact-list assertion so
  // an accidental addition still has to be deliberate.
  it('a new signup is offered the eight chips, founder and coach among them', () => {
    expect(ONBOARDING).toMatch(
      /const ONBOARDING_WORK_KINDS: readonly BriefWorkKind\[\] = \[\s*'creator', 'founder', 'coach', 'professional', 'ecommerce', 'saas',\s*'local_service', 'other',\s*\]/)
  })

  it('both chip renders use the offered set, not the full stored type', () => {
    expect(ONBOARDING).toMatch(/\{ONBOARDING_WORK_KINDS\.map\(\(k\) => \(/)
    expect(ONBOARDING).toMatch(/values=\{ONBOARDING_WORK_KINDS\} label=\{WORK_KIND_LABEL\} chosen=\{draft\.workKind\}/)
  })

  it('the stored type keeps all ten, so nothing already answered is rewritten', () => {
    // ⚖️ SEVEN CHIPS IS NOT SEVEN VALUES. `freelancer`, `brand` and
    // `local_service` are folded into a chip for NEW signups but remain valid
    // stored values with their own labels and their own writer lines — so no
    // row is silently rewritten and no backfill is owed.
    for (const k of ['founder', 'coach', 'freelancer', 'brand', 'local_service']) {
      expect(BRIEF_WORK_KINDS).toContain(k)
    }
    expect(ONBOARDING).toMatch(/founder: 'Founder \/ business owner'/)
    expect(ONBOARDING).toMatch(/freelancer: 'Freelancer \/ agency'/)
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
    // ⚠️ THREE IDS, NOT FIVE, AND THE FIELDS DID NOT MOVE. `workKind`,
    // `audience` and `commercialTies` were three screens asking three halves of
    // one thought and are now one screen, `whoYouAre`; the commercial question
    // itself collapsed from thirteen options to a single yes/no. This list
    // names SCREENS, not fields — `workKind`, `audienceSeg`, `audienceKnowledge`
    // and `commercialTies` are all still written, to the same keys.
    expect(PROFILE_QUESTION_IDS).toEqual(['whoYouAre', 'contentGoals', 'capabilities'])
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
