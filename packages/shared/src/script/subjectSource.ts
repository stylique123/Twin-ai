/**
 * FIX 12 (Wave 4) — THE SUBJECT PICKER'S OPTIONS MUST REACH DISTINCT SOURCES,
 * OR SAY SO WHEN ONE IS EMPTY.
 *
 * ⚠️ THE DEFECT THIS EXISTS FOR, QUOTED. "What should this video be about?"
 * (`content_focus` in `videoIntent.ts`) offers "Something I know well"
 * (`expertise`) and "Something I've experienced" (`experience`) as genuinely
 * different choices, and `FOCUS_PREFERS` DOES point them at different
 * knowledge kinds. But that routing is only a SOFT re-ranking
 * (`preferKinds`/`preferKindsInline` — a stable partition, not a filter), and
 * `wantsOwnExperience` — the flag `compileVideoIntent` derives specifically
 * for `experience`/`story` and documents as having "ONE READER: the
 * premise-compatibility stage" — has no reader anywhere in this codebase.
 * So when a creator's knowledge holds no `experience`-kind item, choosing
 * "Something I've experienced" produced exactly what choosing "Something I
 * know well" would have: the writer fell through to the same
 * framework/opinion pool, and nothing told anyone the subject question had
 * gone unanswered. Run D: subject="something_ive_experienced" shipped a
 * script with zero first-person lines, and neither the creator nor the
 * generation record was ever told why.
 *
 * ⚖️ CLARIFICATION IS FREE, CREATION IS PAID — `generationReadiness.ts`'s
 * rule, applied here to the one content-focus option nothing else was
 * checking. `product`/`review` already have their own empty-source gate
 * (`assessReadiness`'s `offer`/`claims` fields, which correctly block and ask
 * when nothing is on record — see run-b's fixture). `expertise`/`opinion`
 * being wrong costs a rewrite, not a fabricated life event, so neither is
 * gated here. `experience`/`story` is the one focus whose entire premise is
 * something ONLY the creator can supply, and it had no gate at all.
 *
 * ⚖️ THIS MODULE DECIDES ONE THING: given the chosen focus and what the
 * creator's knowledge actually holds, is the source this focus promised
 * genuinely there — and when it is not, it returns the honest instruction and
 * the `needsUser` signal, never a silent substitution.
 */
import { evidenceLevel, type SubstanceItem } from '../knowledgeResolver'

/** Focus values whose whole premise is something only the creator can
 *  supply — "I did this", not "I know about this" or "I believe this". */
const REQUIRES_OWN_EXPERIENCE: ReadonlySet<string> = new Set(['experience', 'story'])

export interface SubjectSourceVerdict {
  /** The content-focus value this was computed for, or `null` when none was
   *  stated (every field below is then trivially satisfied). */
  focus: string | null
  /** True for the focus options whose premise nothing but the creator's own
   *  record can honestly fill. */
  requiresOwnSource: boolean
  /** True when the creator's knowledge holds at least one stated experience
   *  item. Always true when `requiresOwnSource` is false — there is nothing
   *  to check. */
  sourceAvailable: boolean
  /** True exactly when this focus's source was required and genuinely empty
   *  — the case that must be asked about, never silently substituted. */
  needsUser: boolean
  /** The line for the writer (and, when `needsUser`, the question worth
   *  surfacing to the creator). '' when nothing is required. */
  instruction: string
}

const EMPTY_VERDICT: Omit<SubjectSourceVerdict, 'focus'> = {
  requiresOwnSource: false, sourceAvailable: true, needsUser: false, instruction: '',
}

/** The question worth putting in front of the creator when this fires. Kept
 *  here, not in a screen component, for the same reason `ASK` lives in
 *  `generationReadiness.ts`: which fields ask and what they ask is a fact
 *  about the contract, not about where it renders. */
export const SUBJECT_SOURCE_ASK =
  "What's something you personally did, learned, tried or went through that this video could be about? One sentence is enough."

/**
 * Decide whether the chosen subject/content-focus points at a source that is
 * genuinely there.
 *
 * ⚖️ NEVER THROWS: it runs inside a paid generation, same discipline as every
 * other inline check in `generate-blueprint`.
 */
export function resolveSubjectSource(
  focus: string | null | undefined,
  knowledge: readonly SubstanceItem[],
): SubjectSourceVerdict {
  const f = typeof focus === 'string' && focus.trim() !== '' ? focus : null
  if (f === null || !REQUIRES_OWN_EXPERIENCE.has(f)) {
    return { focus: f, ...EMPTY_VERDICT }
  }

  const sourceAvailable = (knowledge ?? []).some((k) => evidenceLevel(k) === 'experience')
  if (sourceAvailable) {
    return {
      focus: f, requiresOwnSource: true, sourceAvailable: true, needsUser: false,
      instruction:
        'THE CREATOR CHOSE "SOMETHING I\'VE EXPERIENCED" AS THE SUBJECT OF THIS VIDEO. '
        + 'Ground it in a supplied experience item — ground the premise in what they '
        + 'actually told us, not in a generic explainer wearing a first-person voice.',
    }
  }

  return {
    focus: f, requiresOwnSource: true, sourceAvailable: false, needsUser: true,
    instruction:
      'THE CREATOR CHOSE "SOMETHING I\'VE EXPERIENCED" AS THE SUBJECT OF THIS VIDEO, AND '
      + 'NOTHING ON RECORD IS A STATED EXPERIENCE.\n'
      + 'Do NOT invent one, and do NOT silently write it as generic second-person advice '
      + 'instead — that answers a question the creator asked with an answer they did not '
      + 'give. Where a beat needs the missing experience, mark it `needs_user` with a '
      + `specific question ("${SUBJECT_SOURCE_ASK}") rather than writing a line that reads `
      + 'as if the subject question had never been asked.',
  }
}
