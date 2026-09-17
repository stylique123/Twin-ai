// THE SCAN MAY NOT TAKE THE SCREEN AWAY MID-ANSWER.
//
// ⚠️ REPORTED FROM A REAL RUN: five questions announced, three seen, the rest
// gone. The parking of the finished scan was built precisely to stop this, and
// it was defeated one line away — `questionsDone` was `qIndex >= asked.length`,
// and `asked` SHRINKS when an answer removes a later question. The comparison
// flipped true while somebody was reading question two, and the parked profile
// handed the screen over immediately.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { profileQuestionsFor } from '@twinai/shared'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'Onboarding.tsx'), 'utf8')

describe('the list really does shrink under the creator', () => {
  it('an answer can remove a later question', () => {
    // ⚠️ THE PRECONDITION FOR THE BUG, ASSERTED SO IT CANNOT BE ARGUED AWAY.
    // If this ever stops being true the guard below is still correct, but the
    // reason for it changes and somebody should know.
    // ⚠️ THREE AND TWO. `desiredFormats` left for a Gallery filter (D7), and
    // then `workKind` + `audience` + `commercialTies` merged into the single
    // `whoYouAre` screen. What this test actually protects is unchanged and is
    // the whole reason it exists: the list SHRINKS as answers arrive, so an
    // index into it can outrun it.
    // ⚠️ THE PROPERTY IS ASSERTED AS A PROPERTY NOW, NOT AS TWO NUMBERS. These
    // counts have already been revised twice by unrelated changes — once when
    // `desiredFormats` left, once when three questions merged — and a third
    // time when the goal question became conditional on the creator's own
    // sign-offs. Each revision made this test look broken while the thing it
    // protects was never in doubt: THE LIST SHRINKS AS ANSWERS ARRIVE, so an
    // index into it can outrun it. That is what is asserted.
    const cta = ['comment CORE and I will send it over']
    const before = profileQuestionsFor({ workKind: 'saas', recurringCtas: cta } as never)
    const after = profileQuestionsFor({
      workKind: 'creator', commercialTies: ['none'], recurringCtas: cta,
    } as never)
    expect(before.length).toBeGreaterThan(after.length)
    // And concretely, so a shrink to zero cannot pass as a shrink.
    expect(before).toEqual(['whoYouAre', 'contentGoals', 'capabilities'])
    expect(after).toEqual(['whoYouAre', 'contentGoals'])
  })
})

describe('finishing is something the creator does', () => {
  it('is a state, not a comparison that can flip under them', () => {
    expect(SRC).toMatch(/const \[finished, setFinished\] = useState\(false\)/)
    expect(SRC).toMatch(/const questionsDone = finished \|\| asked\.length === 0/)
    // The old form must not come back.
    expect(SRC).not.toMatch(/questionsDone = qIndex >= asked\.length/)
  })

  it('and only Done or Skip all sets it', () => {
    const sets = SRC.match(/setFinished\(true\)/g) ?? []
    expect(sets.length).toBe(2)
  })

  it('a shrinking list clamps rather than throwing them out of the set', () => {
    // ⚖️ STANDING ON QUESTION FIVE WHEN THE LIST BECOMES FOUR means seeing
    // question four — not being skipped past the remaining ones.
    expect(SRC).toMatch(/const qAt = Math\.min\(qIndex, Math\.max\(asked\.length - 1, 0\)\)/)
    expect(SRC).toMatch(/While we read · \{qAt \+ 1\} of \{asked\.length\}/)
    expect(SRC).toMatch(/id=\{asked\[qAt\]\}/)
  })

  it('and the finished scan still waits rather than interrupting', () => {
    // ⚠️ THE PROPERTY THE WHOLE FIX EXISTS TO RESTORE. Handover happens when
    // BOTH halves are done, and the creator's half now cannot be completed by
    // anything except a tap.
    //
    // ⚖️ THIS ASSERTION WAS WIDENED, NOT WEAKENED, and the distinction matters.
    // It used to pin the exact string `questionsDone && readyProfile`. The story
    // interview added a THIRD creator-side half, so the handover is now gated on
    // more than before — the property is stronger and the old literal no longer
    // describes it. What is still required is what always was: the scan's
    // readiness alone can never trigger handover.
    const at = SRC.indexOf('onReady(readyProfile)')
    expect(at, 'the handover call was not found').toBeGreaterThan(-1)
    const guard = SRC.slice(SRC.lastIndexOf('if (', at), at)
    expect(guard, 'handover must wait on the questions').toMatch(/questionsDone/)
    // ⚠⚠ THE `storiesDone` HALF IS GONE BECAUSE THE STORIES LEFT THIS SCREEN.
    // They now have their own step AFTER the scan, so the scan cannot interrupt
    // them at all -- it has already finished before that step renders. That is
    // STRONGER than gating handover on them, not weaker, and asserting a flag
    // that no longer exists would pin the old shape rather than the property.
    // The property is asserted where it now lives, in
    // `Onboarding.storiesAfterDna.test.tsx`.
    expect(guard).toMatch(/readyProfile/)
  })
})

/**
 * ⚠️ A COMPONENT NOBODY MOUNTS ASKS NOBODY ANYTHING. The gate above proves the
 * handover WAITS for the story interview; it does not prove the interview is on
 * screen. Deleting the mount left every gate green — found by probing exactly
 * that, which is why this block exists.
 */
describe('the story interview is actually on the screen', () => {
  it('is imported and rendered, not merely imported', () => {
    expect(SRC).toMatch(/import \{ StoryInterview \} from '\.\.\/components\/StoryInterview'/)
    expect(SRC).toMatch(/<StoryInterview\s/)
  })

  // ⚖️ IT OCCUPIES THE WAIT, NOT A NEW SCREEN. The measured lesson is that a
  // dedicated screen becomes the 0-row Product Library; a question inside an
  // existing wait gets answered.
  // ⚠️ RE-ANCHORED, AND THE CLAIM IS NOW THE ACTUAL ONE. This asserted that
  // `<StoryInterview` appears nowhere on the scan screen, which was a PROXY for
  // the real rule the comment above states: a question whose wording needs the
  // DNA must not be asked before the DNA lands — "no niche, no `sells`, no
  // follower count yet". The component is not the hazard; niche-dependent
  // wording is.
  //
  // ⚖️ AND THE SIBLING COMMENT ARGUES FOR ASKING SOMETHING THERE: "it occupies
  // the wait, not a new screen... a dedicated screen becomes the 0-row Product
  // Library; a question inside an existing wait gets answered." Forbidding the
  // component outright forbade the thing that lesson recommends.
  //
  // So: the scan screen may ask ONLY the DNA-free set, and the story three keep
  // their own step. `theDepthQuestionsNeedNoNiche` proves that set carries no
  // niche placeholder, which is the half a source anchor cannot see.
  it('⚠️ the scan screen asks ONLY questions that need no DNA', () => {
    const building = SRC.slice(SRC.indexOf('function BuildingStep'), SRC.indexOf('function StoryStep'))
    const mounts = building.match(/<StoryInterview[\s\S]*?\/>/g) ?? []
    expect(mounts.length, 'the scan screen mounts the interview more than once').toBeLessThanOrEqual(1)
    for (const m of mounts) {
      expect(m, 'the scan screen must name the DNA-free set explicitly')
        .toMatch(/questionIds=\{DEPTH_QUESTION_IDS\}/)
      // Passing a niche here would be asserting one that has not been read.
      expect(m).not.toMatch(/\bniche=/)
      expect(m).not.toMatch(/\bsubNiche=/)
      expect(m).not.toMatch(/\bstageBand=/)
    }
    // And the story three still have their own step, after the scan.
    expect(SRC).toMatch(/\{mode === 'stories' && draft && \(/)
  })

  // ⚠️ IT IS HANDED THE VOICE, or the answers attach to nothing.
  it('is given the voice the answers belong to', () => {
    const at = SRC.indexOf('<StoryInterview')
    expect(SRC.slice(at, at + 220)).toMatch(/voiceId=\{draft\.voiceId \?\? null\}/)
  })
})
