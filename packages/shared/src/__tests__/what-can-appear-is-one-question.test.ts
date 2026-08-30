// ONE SUBJECT WAS ASKED IN TWO PLACES THAT NEVER MET.
//
// ⚠️ REPORTED FROM A SCREENSHOT. "Do your videos feature any products?" sat in
// the middle of the confirm screen; "Can you record your screen?" and "Can you
// put a product in front of the camera?" sat in a separate collapsed section
// further down, with unrelated fields between them. Three answers about the same
// thing — what can actually appear in your video — in two unrelated places.
//
// ⚖️ AND THEY WERE ASKED TOO LATE TO BE FREE. Onboarding already has dead time:
// the scan takes minutes and the screen asks three questions while it runs. A
// question answered there costs nothing; the same question on the confirm screen
// is one more thing between a creator and their first script.
//
// ⚖️ BUT NOT FIRST. The two filming questions were once the ONLY thing asked
// during the scan, so the first thing Twin ever wanted to know was somebody's
// camera setup — before it had established what they do. They are question FOUR,
// after the work kind that decides how question four is even worded.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PROFILE_QUESTION_IDS } from '../creatorProfileQuestions'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'apps', 'web', 'src', 'pages', 'Onboarding.tsx'), 'utf8')

// ⚠️ THE SLICE MOVED WHEN THE QUESTIONS DID. The scan screen no longer inlines
// its questions: `BuildingStep` renders whatever `profileQuestionsFor` says
// applies, and the wording lives in `ProfileQuestion` further down the file. The
// claims below are unchanged — where they are enforced is not.
const BUILDING = SRC.slice(SRC.indexOf('function ProfileQuestion('))
const CONFIRM = SRC.slice(SRC.indexOf('function ConfirmStep('), SRC.indexOf('function ProfileQuestion('))

describe('the three are asked while the scan is running', () => {
  it('asks all three on the scan screen', () => {
    // ⚠️ THE COMMERCIAL QUESTION IS NOW ONE YES/NO, NOT SIX CHIPS PLUS A
    // SEVEN-CHIP FOLLOW-UP. It is still asked on this screen — that is what
    // this line protects — but it asks only whether a commercial thing exists,
    // because the kind and the relationship belong to the Product Library.
    expect(BUILDING).toMatch(/Do you sell or promote anything in your videos\?/)
    expect(BUILDING).toMatch(/Can you record your screen when Twin needs it\?/)
    expect(BUILDING).toMatch(/Can you usually show the product on camera\?/)
  })

  it('asks them as ONE step, not three', () => {
    // ⚖️ Someone deciding whether they show products has already decided
    // whether they can hold one up. Three separate steps would make a creator
    // answer the same thought three times.
    //
    // The step is now `capabilities`, and `PROFILE_QUESTION_IDS` names it once —
    // which is the same claim enforced where the order is actually decided.
    expect(PROFILE_QUESTION_IDS.filter((id) => id === 'capabilities')).toHaveLength(1)
  })

  it('asks them LAST, after what the creator does', () => {
    // ⚠️ THE ORDERING THIS FILE EXISTS TO PROTECT. What a creator can film is
    // only answerable once they have said what they do and what they sell —
    // `asksScreenCapability` reads both — so last is not cosmetic.
    expect(PROFILE_QUESTION_IDS[PROFILE_QUESTION_IDS.length - 1]).toBe('capabilities')
    // `workKind` and `commercialTies` are both asked on the merged `whoYouAre`
    // screen now, so the ordering claim is made against that screen — the
    // property is unchanged: what a creator can film is only answerable after
    // they have said what they do and whether they sell.
    expect(PROFILE_QUESTION_IDS.indexOf('whoYouAre'))
      .toBeLessThan(PROFILE_QUESTION_IDS.indexOf('capabilities'))
  })

  it('lets every one of them be un-answered', () => {
    // ⚠️ `can_record_screen = false` PERMANENTLY HIDES A SURFACE. "They never
    // said" must never become "they said no", so tapping the chosen answer again
    // clears it — the property a screen without a toggle-off would destroy.
    expect(BUILDING).toMatch(/draft\.screenCapability === v \? null : v/)
    expect(BUILDING).toMatch(/draft\.productCapability === v \? null : v/)
    // ⚖️ AND THE DERIVED BOOLEANS FOLLOW IT. "Sometimes" must land as null in
    // the fields every existing reader consults, never as false.
    expect(BUILDING).toMatch(/canRecordScreen: next === 'yes' \? true : next === 'no' \? false : null/)
    expect(BUILDING).toMatch(/canFilmObjects: next === 'yes' \? true : next === 'no' \? false : null/)
  })
})

describe('and they stay together where they can be changed', () => {
  it('keeps all three under one heading on the confirm screen', () => {
    // ⚖️ STILL EDITABLE, DELIBERATELY. The scan questions are optional and
    // skippable; a creator who skipped them needs somewhere to answer, and one
    // who mis-tapped needs somewhere to fix it. What changed is that they are
    // now one section instead of two halves separated by other fields.
    expect(CONFIRM).toMatch(/title="What can appear in your videos\?"/)
    expect(CONFIRM).not.toMatch(/title="How can you film\?"/)
  })

  it('reports "not answered" for the whole group, not half of it', () => {
    expect(CONFIRM).toMatch(
      /badge=\{q4 === null \|\| canRecordScreen === null \|\| canFilmObjects === null \? 'Not answered' : null\}/)
  })

  it('shows what the creator already said during the scan', () => {
    // ⚠️ Seeded from the draft. Re-asking from empty would present a creator's
    // own answer back to them as unanswered, which reads as the app losing it.
    expect(CONFIRM).toMatch(/useState<Q4Answer \| null>\(draft\.q4 \?\? null\)/)
    expect(CONFIRM).toMatch(/useState<boolean \| null>\(draft\.canRecordScreen\)/)
    expect(CONFIRM).toMatch(/useState<boolean \| null>\(draft\.canFilmObjects\)/)
  })
})
