// THE THREE QUESTIONS NOW HAVE THEIR OWN STEP, AFTER THE DNA.
//
// ⚠️⚠️ THEY USED TO RENDER DURING THE SCAN, AND THAT IS WHY THEY READ AS GENERIC.
// At that moment there is no niche, no `sells`, no follower count — so every
// creator met the same three sentences, including "what does almost everyone in
// your NICHE believe", asked before her niche had been read. The wording table
// existed and its inputs arrived after the screen.
//
// ⚖️ AND IT IS A STEP, NOT A BLOCK ON THE REVIEW SCREEN. The measured failure was
// placement: on the first real production run EVERY question below the fold on
// the confirm screen came back unanswered. A step is passed through; the Product
// Library is a finished feature with zero rows because it waits to be visited.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = readFileSync(fileURLToPath(new URL('./Onboarding.tsx', import.meta.url)), 'utf8')
/** Code only — a comment naming a symbol is not a render. */
const CODE = SRC.split('\n').filter((l) => {
  const t = l.trim()
  return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
}).join('\n')

describe('the flow has a step between the scan and the review', () => {
  it('`stories` is a mode', () => {
    expect(CODE).toMatch(/type Mode = 'handle' \| 'building' \| 'stories' \| 'confirm'/)
  })

  it('the finished scan lands on it, not straight on the review screen', () => {
    expect(CODE).toMatch(/setMode\('stories'\)/)
  })

  it('and the review screen comes after it', () => {
    const stories = CODE.indexOf("{mode === 'stories'")
    const confirm = CODE.indexOf("{mode === 'confirm'")
    expect(stories).toBeGreaterThan(-1)
    expect(confirm).toBeGreaterThan(stories)
    expect(CODE).toMatch(/onDone=\{\(\) => setMode\('confirm'\)\}/)
  })
})

describe('the scan screen no longer asks them', () => {
  // ⚠️ RE-ANCHORED. "Racing the DNA" is the hazard, and only a question whose
  // WORDING needs the DNA can race it. The scan screen now asks two that cannot
  // — `DEPTH_QUESTION_IDS`, proven niche-free in
  // `theDepthQuestionsNeedNoNiche` — and the three that can still wait for their
  // own step. Forbidding the component forbade both.
  it('⚠️ the scan screen never asks a question that races the DNA', () => {
    const building = CODE.slice(CODE.indexOf('function BuildingStep'), CODE.indexOf('function StoryStep'))
    const mounts = building.match(/<StoryInterview[\s\S]*?\/>/g) ?? []
    for (const m of mounts) {
      expect(m).toMatch(/questionIds=\{DEPTH_QUESTION_IDS\}/)
      expect(m).not.toMatch(/\bniche=/)
    }
    // The story three are asked by the `stories` step and nowhere else.
    const story = CODE.slice(CODE.indexOf('function StoryStep'))
    expect(story).toMatch(/<StoryInterview/)
  })

  // ⚠️ STILL TRUE, AND "them" MEANS THE STORY THREE. The scan does wait on the
  // two DNA-free depth questions (`depthDone`), which is the SAME parking this
  // file already requires for the categorical set: "the finished scan is parked
  // ... finishing early means WAITING, never interrupting." What must never
  // return is the scan waiting on questions that could not be worded yet.
  it('and the scan no longer waits on the story three to finish', () => {
    expect(CODE).not.toMatch(/storiesDone/)
    // The parking that does exist is gated on a tap, never on a comparison.
    expect(CODE).toMatch(/questionsDone && depthDone && readyProfile/)
  })
})

describe('the step is given what the scan learned', () => {
  const step = CODE.slice(CODE.indexOf('function StoryStep'), CODE.indexOf('export function ConfirmStep'))

  it('it passes the niche', () => {
    expect(step).toMatch(/niche=\{draft\.profile\?\.niche \?\? null\}/)
  })

  it('it passes what she sells, read in the background', () => {
    expect(step).toMatch(/loadSellsFacet\(\)/)
    expect(step).toMatch(/sells=\{sells\}/)
  })

  it('it passes the follower band, which is on the VOICE row and not the profile', () => {
    expect(step).toMatch(/loadVoiceStageBand\(/)
    expect(step).toMatch(/stageBand=\{band\}/)
  })

  it('⚠️ and it NEVER blocks on either lookup', () => {
    // A creator ready to type must not wait on a read that only changes wording.
    // Both start as null, which renders the plain bank.
    expect(step).toMatch(/useState<SellsKind \| 'none' \| null>\(null\)/)
    expect(step).toMatch(/useState<string \| null>\(null\)/)
    expect(step).not.toMatch(/if \(!sells\) return/)
    expect(step).not.toMatch(/Loading|Spinner|spinner/)
  })
})
