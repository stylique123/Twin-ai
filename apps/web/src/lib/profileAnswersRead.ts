import {
  resolveProfileAnswers, readStoredBrief, type CreatorProfileAnswers,
} from '@twinai/shared'
import { readOnboardingDraft, profileAnswersOf } from './onboardingDraft'

/**
 * THE ANSWERS THIS CREATOR GAVE AT SIGNUP, READ THE ONE WAY.
 *
 * ⚠️ THIS LOGIC WAS AN INLINE IIFE ON SETTINGS, AND WAVE 5.2 NEEDED IT ON A
 * SECOND SCREEN. Copying it would put two readers behind one claim — and the
 * claim here is "you told me this at signup", so two readers that fell out of
 * step would produce two different accounts of what somebody said.
 *
 * ⚖️ THE CONFIRMED ANSWER BEATS THE HALF-FINISHED FORM, PER FIELD. A stored
 * brief written before a question existed has no key for it, so preferring the
 * whole stored object would discard a draft answer to a question the brief
 * predates.
 *
 * ⚠️ THE DRAFT IS DEVICE-LOCAL AND NEVER PERSISTED SERVER-SIDE. On a second
 * device there is nothing to read, so this UNDER-reports what Twin knows. That
 * is the safe direction for a screen that quotes the creator back to themselves
 * — silence is honest, a guess is not — but it is a real gap, and the fix is to
 * persist the answers rather than to assume them here.
 */
export function readProfileAnswers(
  profileId: string | null | undefined,
  preScriptBrief: unknown,
): CreatorProfileAnswers {
  let draft = null
  try {
    const d = profileId ? readOnboardingDraft(localStorage, profileId) : null
    draft = d ? profileAnswersOf(d) : null
  } catch { draft = null }
  return resolveProfileAnswers({
    stored: readStoredBrief(preScriptBrief) as never,
    draft,
  })
}
