// WHICH QUESTIONS TWIN ACTUALLY ASKS, AND WHETHER ANYTHING READS THE ANSWER.
//
// ── WHY THIS EXISTS, AND WHY IT IS NOT `questionRegistry.ts` ───────────────
//
// `questionRegistry.ts` states the rule -- "every question names a DOWNSTREAM
// READER, or it does not exist" -- and it is correct and complete and NOTHING
// CONSULTS IT. Its canonicalField names do not match the fields any screen
// writes, and `questionsToAsk` has no caller outside its own tests. It is a spec
// that the product never adopted.
//
// ⚠️ SO THIS FILE IS THE OTHER DIRECTION: it starts from the questions the
// product REALLY ASKS, names the field each one writes, and records whether that
// field survives to anything that changes a script. The registry says what ought
// to be true; this says what is.
//
// ⚖️ AND IT MAINTAINS ITSELF, WHICH THE REGISTRY DID NOT. Every ORPHANED verdict
// here is checked by a test that greps the live tree. Wire a reader for a field
// listed as orphaned and the test FAILS, demanding the verdict be updated. An
// audit that can silently go stale is the thing it was written to prevent.
//
// ⚠️ THE ROOT CAUSE THIS DOCUMENTS, NOW HALF-FIXED. The scan questions USED TO
// BE written only into `OnboardingDraft` in localStorage: `savePreScriptBrief`
// sent exactly six keys -- workKind, workKindOther, forbiddenClaims, audience,
// promotes, offer -- and not one scan answer was among them. THAT is why the
// same truth was collected four times in four wordings: the first answer never
// left the browser, so every later screen had to ask again. The duplication was
// a SYMPTOM of the missing write, not a copywriting mistake.
//
// ⚖️ THE WRITE IS NOW WIRED, AND THAT IS NOT THE SAME AS DONE. Those fields moved
// from ORPHANED_LOCAL to ORPHANED_NO_READER, not to LIVE. They survive the
// browser; nothing in generate-blueprint or the worker reads them yet.
// Persisting is necessary and insufficient, and the verdict says so rather than
// letting a half-fix read as a finished one.

export type AuditVerdict =
  /** Persisted server-side AND read by something that changes a script. */
  | 'LIVE'
  /** Written to localStorage only. A second device has never heard of it. */
  | 'ORPHANED_LOCAL'
  /** Persisted, but nothing downstream reads it. */
  | 'ORPHANED_NO_READER'
  /** Read by generation, but only ever written by a DIFFERENT screen than the
   *  one that asks -- so answering where it is asked achieves nothing. */
  | 'ORPHANED_WRONG_WRITER'

export interface AuditedQuestion {
  /** The question as a creator reads it. Verbatim, so a grep finds the screen. */
  asked: string
  /** The field the answer is written into. */
  field: string
  /** Where it is asked. */
  screen: string
  verdict: AuditVerdict
  /** ⚠️ FOR AN ORPHAN, THE EVIDENCE THAT IT IS ONE. A directory the field must
   *  NOT appear in. The guard greps this, so the claim cannot rot. */
  absentFrom?: readonly string[]
  /**
   * ⚠️ THE BRIEF KEY THIS ANSWER ARRIVES UNDER, WHEN IT IS NOT ITS OWN NAME.
   *
   * `audienceSeg` is the case that forced this field to exist. The audit called
   * it display-only; it has in fact reached generation since #398, because the
   * confirm step seeds the free-text `audience` from the chooser label when the
   * creator typed nothing. The answer counts -- it just does not travel under
   * its own name, and a guard that greps only for `audienceSeg` in the write
   * call concludes "not persisted" and is wrong.
   *
   * ⚖️ SO THE INDIRECTION IS DECLARED RATHER THAN INFERRED. The guard checks
   * that the key IS in the write AND that the page really links the two, so a
   * claimed path that does not exist fails instead of excusing an orphan.
   */
  travelsAs?: string
  /** What is lost by asking it. Never "nothing" -- a question with no reader
   *  still costs the creator a decision and costs Twin their trust when the
   *  answer visibly changes nothing. */
  cost: string
}

/** ⚠️ THE DIRECTORIES WHERE AN ANSWER WOULD HAVE TO APPEAR TO CHANGE A SCRIPT.
 *  A field absent from all of these cannot alter a single word Twin writes,
 *  whatever else reads it for a progress meter. */
export const GENERATION_DIRS = Object.freeze(['supabase/functions', 'worker/src'])

export const AUDITED_QUESTIONS: readonly AuditedQuestion[] = Object.freeze([
  Object.freeze({
    asked: 'What do you want your content to help you do?',
    field: 'contentGoals',
    screen: 'Onboarding scan step',
    verdict: 'ORPHANED_NO_READER',
    absentFrom: GENERATION_DIRS,
    cost:
      'The creator picks up to two goals and is told the limit, which reads as a '
      + 'consequential decision. No writer, director or CTA reads it -- so the goal they '
      + 'chose changes nothing about the script they get.',
  }),
  Object.freeze({
    asked: 'What kinds of videos do you want Twin to help you make?',
    field: 'desiredFormats',
    screen: 'Onboarding scan step',
    verdict: 'ORPHANED_NO_READER',
    absentFrom: GENERATION_DIRS,
    cost:
      'This is the question that separates what a creator ALREADY makes from what they '
      + 'WANT next -- the distinction Creator DNA cannot observe. It reaches nothing. '
      + 'desiredFormatModes.ts says so in its own header.',
  }),
  Object.freeze({
    asked: 'Should Twin stay close to what you already do?',
    field: 'formatExploration',
    screen: 'Onboarding scan step',
    verdict: 'ORPHANED_NO_READER',
    absentFrom: GENERATION_DIRS,
    cost:
      'The cleanest dead field in the flow: its only reader is inside '
      + 'compileCreatorProfile, which has no production caller. A creator asking Twin to '
      + 'push them somewhere new is answered by nothing at all.',
  }),
  Object.freeze({
    asked: 'What kind of service?',
    field: 'ownServiceKind',
    screen: 'Onboarding scan step (conditional)',
    verdict: 'ORPHANED_NO_READER',
    absentFrom: GENERATION_DIRS,
    cost:
      'Zero consumers of any kind -- not even an ask-gate for a later question. It is a '
      + 'question whose entire effect is the tap that answers it.',
  }),
  Object.freeze({
    asked: 'What kind of thing do you sell?',
    field: 'ownProductKind',
    screen: 'Onboarding scan step (conditional)',
    verdict: 'ORPHANED_NO_READER',
    absentFrom: GENERATION_DIRS,
    cost:
      'Gates whether a capability question is asked, and nothing else. The product type '
      + 'that matters is the one on the PRODUCT, which is asked again in the Library -- '
      + 'this is one of the four places the same truth is collected.',
  }),
  Object.freeze({
    asked: 'Who do you mainly want to reach?',
    field: 'audienceSeg',
    screen: 'Onboarding scan step',
    // ⚠️ THIS VERDICT WAS WRONG WHEN IT WAS WRITTEN, not stale by drift. The
    // seeding line landed in #398 on 17 August; this audit was written on the
    // 24th and recorded the answer as display-only anyway. The claim was never
    // checked against the tree it described.
    //
    // ⚖️ AND THE RULE ADDED WITH THE AUDIT DID NOT CATCH IT EITHER, because it
    // greps the write call for the field's OWN name and this answer travels
    // under `audience`. A guard that can only see one spelling of a path will
    // keep reporting orphans that are not.
    verdict: 'LIVE',
    travelsAs: 'audience',
    cost:
      'None. The chooser fills the free-text `audience` when the creator typed nothing, '
      + 'and generate-blueprint reads that -- so the answer counts. What IS still true is '
      + 'that the same fact is asked twice, once as a chooser and once as a box, and the '
      + 'typed one silently wins. That is a duplication worth removing, not an orphan.',
  }),
  Object.freeze({
    asked: 'How much do they already know?',
    field: 'audienceKnowledge',
    screen: 'Onboarding scan step',
    // ⚠️ THIS VERDICT WENT STALE AND NOTHING NOTICED, WHICH IS THE FINDING.
    // It read ORPHANED_WRONG_WRITER -- "generate-blueprint reads it, onboarding
    // never writes it". Then the six-answer write landed, onboarding began
    // persisting it, and the audit went on reporting an orphan that had been
    // fixed. The entry carried no `absentFrom` and its verdict had no case, so
    // there was nothing to break.
    //
    // ⚖️ AN AUDIT THAT CAN GO STALE IS THE THING THE AUDIT EXISTS TO PREVENT.
    // The guard now requires every verdict to be checked by something, so a
    // verdict with no evidence is itself a failure.
    verdict: 'LIVE',
    cost:
      'None any more, and the history is the point: it WAS asked on a screen that did '
      + 'not persist it, so the answer only counted if the creator later re-answered the '
      + 'same question in Settings. Onboarding now writes it and generate-blueprint reads '
      + 'it -- the chain is complete end to end.',
  }),
])

export const orphaned = (): readonly AuditedQuestion[] =>
  AUDITED_QUESTIONS.filter((q) => q.verdict !== 'LIVE')

/** ⚠️ THE NUMBER THAT MAKES THE CASE. A creator answering the scan step makes
 *  this many decisions that cannot reach a script. */
export const orphanedCount = (): number => orphaned().length
