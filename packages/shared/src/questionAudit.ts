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
    // ⚠️ THIS VERDICT WAS TRUE UNTIL THE READER WAS WIRED, AND THE GUARD
    // FAILED THE MOMENT IT WAS. That is the audit doing its job: good news
    // breaks the test on purpose, so a fix cannot land while the record
    // still calls it an orphan.
    verdict: 'LIVE',
    cost:
      'None any more. generate-blueprint reads it through standingGoalDirectiveInline, which '
      + 'fills the `- Goal:` line ONLY where the creator gave no per-video answer -- the '
      + 'remix pop-up outranks it, always. The first goal in stored order is used and a '
      + 'second is deliberately ignored rather than blended into a third goal nobody chose.',
  }),
  Object.freeze({
    asked: 'What kinds of videos do you want Twin to help you make?',
    field: 'desiredFormats',
    screen: 'Gallery filter',
    // ⚠️ D7 OF THE CONSOLIDATION SPEC MOVED THIS OFF ONBOARDING. Asking a
    // creator to commit to a fixed answer about what they want to MAKE before
    // they had seen a single Twin script was the worst moment to ask it. The
    // question is now a Gallery filter, changeable on every visit -- the
    // field and its reader are unchanged; only where it is asked moved.
    verdict: 'LIVE',
    cost:
      'None any more. generate-blueprint reads it through renderDesiredFormatsInline, which '
      + 'shapes concept.premise -- NOT the shot list, because the shot vocabulary is '
      + 'talking_head or cover_frame with no third option and inventing one would reverse '
      + 'the no-B-roll scope decision through a side door. \u26a0\ufe0f `recommend` still '
      + 'contributes nothing: it is an explicit request NOT to be constrained.',
  }),
  Object.freeze({
    asked: 'Should Twin stay close to what you already do?',
    field: 'formatExploration',
    screen: 'Retired with the onboarding desiredFormats step (D7)',
    // ⚠️ ASKED ALONGSIDE `desiredFormats` UNTIL D7 REMOVED THE SHARED STEP.
    // No Gallery home was built for this one specifically -- out of D7's
    // stated scope -- so it is simply unanswered from here forward, exactly
    // as it already was for every creator who skipped it.
    verdict: 'LIVE',
    cost:
      'None any more. It is the WEIGHT between the formats the scan observed and the ones '
      + 'the creator asked for, read together with desiredFormats or not at all -- without '
      + 'it, \u201cI want to try reviews\u201d and \u201cmostly what I already make\u201d '
      + 'pull opposite ways with nothing to settle them. Unanswered gets the NEUTRAL '
      + 'weighting, never the adventurous one.',
  }),
  Object.freeze({
    asked: 'What kind of service?',
    field: 'ownServiceKind',
    screen: 'Retired from onboarding with the thirteen-option collapse; field still read',
    // ⚠️ RETIRED FROM THE SCREEN, NOT FROM THE CODEBASE, and the distinction is
    // the whole point of this entry. Onboarding asked six commercial-tie chips
    // plus this follow-up — thirteen options for facts the Product Library
    // already collects behind an attestation. It now asks one yes/no. The FIELD
    // is untouched: still stored, still loaded, still saved, and still consumed
    // by `refinedEntityType` at mint time exactly as the cost note below says.
    // Stop asking, keep reading.
    verdict: 'ORPHANED_NO_READER',
    absentFrom: GENERATION_DIRS,
    // ⚠️ THIS NOTE SAID "ZERO CONSUMERS OF ANY KIND" AND THAT WAS FALSE. The
    // verdict is right -- generation does not read this field -- but the cost
    // was not, and a cost note is what somebody reads before deciding to delete
    // a question. `refinedEntityType` consumes it at mint time: SERVICE plus
    // `community` becomes a COMMUNITY entity, which is the mapping the whole
    // community shot-list rests on. Deleting this field would silently retype
    // every community creator as a plain SERVICE.
    cost:
      'Not read by generation, which is what the verdict says. But it is NOT unread: '
      + '`refinedEntityType` consumes it when the entity is minted, and SERVICE + community '
      + 'is what produces a COMMUNITY entity at all. The cost is that the answer reaches '
      + 'the script only THROUGH the entity type -- never in its own right.',
  }),
  Object.freeze({
    asked: 'What kind of thing do you sell?',
    field: 'ownProductKind',
    screen: 'Retired from onboarding with the thirteen-option collapse; field still read',
    // ⚠️ RETIRED FROM THE SCREEN, NOT FROM THE CODEBASE, and the distinction is
    // the whole point of this entry. Onboarding asked six commercial-tie chips
    // plus this follow-up — thirteen options for facts the Product Library
    // already collects behind an attestation. It now asks one yes/no. The FIELD
    // is untouched: still stored, still loaded, still saved, and still consumed
    // by `refinedEntityType` at mint time exactly as the cost note below says.
    // Stop asking, keep reading.
    verdict: 'ORPHANED_NO_READER',
    absentFrom: GENERATION_DIRS,
    // ⚠️ AND THIS ONE SAID "AND NOTHING ELSE", WHICH WAS ALSO FALSE. It gates the
    // capability question AND refines the minted entity type through
    // `refinedEntityType` -- course, digital and marketplace each produce a
    // different type, and the type decides the show moments. A reader who
    // believed "nothing else" would delete a field that changes what the camera
    // is told to do.
    cost:
      'Not read by generation, which is what the verdict says. It gates the capability '
      + 'question AND refines the minted entity type via `refinedEntityType`, which decides '
      + 'the show moments. The cost is that it reaches the script only THROUGH the type. '
      + 'The product type that matters later is the one on the PRODUCT, asked again in the '
      + 'Library -- this is one of the places the same truth is collected.',
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
