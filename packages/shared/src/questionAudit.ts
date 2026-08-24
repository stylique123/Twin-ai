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
// ⚠️ THE ROOT CAUSE THIS DOCUMENTS. Six of the scan questions are written only
// into `OnboardingDraft` in localStorage. `savePreScriptBrief` sends exactly six
// keys -- workKind, workKindOther, forbiddenClaims, audience, promotes, offer --
// and none of the six scan answers is among them. THAT is why the same truth is
// collected four times in four wordings: the first answer never left the
// browser, so every later screen had to ask again. The duplication is a
// SYMPTOM of the missing write, not a copywriting mistake.

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
    verdict: 'ORPHANED_LOCAL',
    absentFrom: GENERATION_DIRS,
    cost:
      'The chooser answer is display-only. generate-blueprint reads brief.audience, which '
      + 'is the FREE-TEXT box on the confirm screen -- so the creator answers the same '
      + 'question twice and only the typed one counts.',
  }),
  Object.freeze({
    asked: 'How much do they already know?',
    field: 'audienceKnowledge',
    screen: 'Onboarding scan step',
    verdict: 'ORPHANED_WRONG_WRITER',
    cost:
      'generate-blueprint DOES read audienceKnowledge, and onboarding never writes it -- '
      + 'Settings is its only writer. Answering it during onboarding changes nothing '
      + 'unless the creator later re-answers the same question in Settings.',
  }),
])

export const orphaned = (): readonly AuditedQuestion[] =>
  AUDITED_QUESTIONS.filter((q) => q.verdict !== 'LIVE')

/** ⚠️ THE NUMBER THAT MAKES THE CASE. A creator answering the scan step makes
 *  this many decisions that cannot reach a script. */
export const orphanedCount = (): number => orphaned().length
