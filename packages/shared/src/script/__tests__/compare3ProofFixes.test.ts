// compare-3 proof fixes (owner, 26 Nov). General rules, each with a test
// built on the fictional panel; request 6 and 28 of compare-3-proof are the
// cases that showed each defect.
import { describe, it, expect } from 'vitest'
import { chooseStory, eventFit, finalCheck, planAskFirst, questionRulesOk, scriptShipThin, storyIdOfItem, pieceQuestion, SHIP_MIN_WORDS, type WriterItem } from '../factsOnly'

const BATCH = { ref: 'F1', id: 'st-batch', origin: 'her_story', layer: 'fact' as const, text: 'In my experience, the batch I threw out taught me more than any good one; I now write the temperature of every step in a notebook beside the stove.' }
const JARS = { ref: 'F2', id: 'st-jars', origin: 'her_story', layer: 'fact' as const, text: 'I discarded forty jars before stabilizing my cream; the first one separated overnight beside the stove.' }
const PATCH = { ref: 'F3', id: 'st-patch', origin: 'her_story', layer: 'fact' as const, text: 'Before Calm Cream, I patch-tested each new version on my inner arm for three days and kept a simple chart of any redness.' }
const FACT = { ref: 'F4', id: 'p1', origin: 'product_fact', layer: 'fact' as const, text: 'Calm Cream comes in a 50 ml glass jar.', productId: 'cream' }
const FEEL = { ref: 'F5', id: 'answer:mn:fo:piece:st-batch:feeling', origin: 'her_answer', layer: 'fact' as const, text: 'Honestly, my stomach dropped. I was cross with myself, then relieved when it finally came right.' }
const NOTE = { ref: 'N', id: 'note', origin: 'her_answer', layer: 'fact' as const, text: 'the batch I had to throw out' }
const items: WriterItem[] = [BATCH, JARS, PATCH, FACT, FEEL, NOTE]
const said = (beats: Array<{ line?: unknown }>) => beats.map((b) => String(b.line ?? '')).join(' ')

describe('fix 6: the story is chosen by its events and her recent scripts', () => {
  it('both throw-out stories fit "the batch I had to throw out"; the patch-test story does not', () => {
    expect(eventFit(JARS.text, NOTE.text)).toBeGreaterThan(0)
    expect(eventFit(BATCH.text, NOTE.text)).toBeGreaterThan(0)
    expect(eventFit(PATCH.text, NOTE.text)).toBe(0)
  })
  it('a story she used recently gives way to one that fits about as well', () => {
    const rows = [BATCH, JARS, PATCH]
    expect(chooseStory(rows, NOTE.text, new Map([['st-batch', 1]]))?.id).toBe('st-jars')
    expect(chooseStory(rows, NOTE.text, new Map([['st-jars', 2]]))?.id).toBe('st-batch')
  })
  it('no fitting story: none chosen', () => {
    expect(chooseStory([PATCH], 'why I weave in silence')).toBeNull()
  })
})

describe('fix 2: one story per script; a line from another story or its answer is cut', () => {
  // Request 6 as shipped: a patch-test hook and line next to the batch story.
  const shipped = [
    { section: 'Hook', line: 'Stop using new creams before testing on your inner arm.' },
    { section: 'Re-hook', line: 'In my experience, I patch-tested each new version on my inner arm for three days, keeping a simple chart of any redness.' },
    { section: 'Payoff', line: 'I now write the temperature of every step in a notebook beside the stove.' },
  ]
  it('the patch-test line is cut when the script tells the batch story', () => {
    const fc = finalCheck(shipped, items, { note: NOTE.text, centerpieceId: 'st-batch' })
    expect(said(fc.beats)).not.toMatch(/patch-tested/)
    expect(fc.record.lines.some((l) => l.why === 'other_story')).toBe(true)
    expect(fc.record.centerpiece).toBe('st-batch')
  })
  it('an answer belongs to the story it was asked about', () => {
    expect(storyIdOfItem(FEEL.id, items)).toBe('st-batch')
    expect(storyIdOfItem(FACT.id, items)).toBeNull()
    expect(storyIdOfItem('k9', items, new Map([['k9', 'st-jars']]))).toBe('st-jars')
  })
  it('a line built on the batch story\'s answer is cut from a script about the jars', () => {
    const beats = [
      { section: 'Hook', line: 'I discarded forty jars before stabilizing my cream.' },
      { section: 'Story', line: 'Honestly, my stomach dropped.' },
    ]
    const fc = finalCheck(beats, items, { note: NOTE.text, centerpieceId: 'st-jars' })
    expect(said(fc.beats)).not.toMatch(/stomach/)
  })
  it('product facts are not a story and stay', () => {
    const fc = finalCheck([{ line: 'I discarded forty jars before stabilizing my cream.' }, { line: 'Calm Cream comes in a 50 ml glass jar.' }], items, { note: NOTE.text, centerpieceId: 'st-jars' })
    expect(said(fc.beats)).toMatch(/50 ml/)
  })
})

describe('fix 1: her answer for this request is used, with its story', () => {
  it('when no line uses it, her words go in after the last line of that story', () => {
    const beats = [
      { section: 'Hook', line: 'The batch I threw out taught me more than any good one.' },
      { section: 'Payoff', line: 'I now write the temperature of every step in a notebook beside the stove.' },
    ]
    const fc = finalCheck(beats, items, { note: NOTE.text, centerpieceId: 'st-batch', answerIds: [FEEL.id] })
    const out = fc.beats.map((b) => String(b.line))
    expect(out.some((l) => /stomach dropped/.test(l))).toBe(true)
    expect(fc.record.lines.some((l) => l.why === 'answer_added' && l.source === FEEL.id)).toBe(true)
  })
  it('an answer already in the script is not added twice', () => {
    const beats = [{ line: 'The batch I threw out taught me more than any good one.' }, { line: 'Honestly, my stomach dropped.' }]
    const fc = finalCheck(beats, items, { note: NOTE.text, centerpieceId: 'st-batch', answerIds: [FEEL.id] })
    expect(fc.record.lines.filter((l) => l.why === 'answer_added')).toHaveLength(0)
  })
})

describe('fix 3: a creator with no usable story gets one specific story question first', () => {
  const loom: WriterItem[] = [{ ref: 'N', id: 'note', origin: 'her_answer', layer: 'fact', text: 'how I started weaving' }]
  const req = { note: 'how I started weaving', goal: 'personal_brand' }
  it('first time: a question that names the request, never a stop', () => {
    const d = planAskFirst(req, loom, { storiesOnFile: 0 })
    expect(d.action).toBe('ask')
    if (d.action === 'ask') {
      expect(d.questions).toHaveLength(1)
      expect(d.questions[0]!.question).toMatch(/how I started weaving/)
      expect(d.questions[0]!.question).not.toMatch(/one real thing|audience|niche/i)
    }
  })
  it('once that question was asked: the next steps (a stop)', () => {
    const first = planAskFirst(req, loom, { storiesOnFile: 0 })
    const key = first.action === 'ask' ? first.questions[0]!.key : ''
    expect(planAskFirst(req, loom, { storiesOnFile: 0, askedKeys: [key] }).action).toBe('stop')
  })
})

describe('fix 5: a thin script asks the one question that would fix it', () => {
  it(`the bar is ${SHIP_MIN_WORDS} spoken words and 3 lines, the same as the hard floor`, () => {
    expect(SHIP_MIN_WORDS).toBe(40)
    const short = [{ line: 'The batch I threw out taught me more than any good one.' }, { line: 'I now write the temperature of every step.' }]
    expect(scriptShipThin(short).thin).toBe(true)
    const ok = [{ line: 'The batch I threw out taught me more than any good one, and I still think about it.' }, { line: 'I now write the temperature of every step in a notebook beside the stove.' }, { line: 'Every single batch since then has its own page, with the time and the heat.' }]
    expect(scriptShipThin(ok).thin).toBe(false)
  })
  it('the fixing question deepens the story and passes the question rules', () => {
    const q = pieceQuestion(BATCH)!
    expect(q.question).toMatch(/^In your story "/)
    expect(questionRulesOk(q, { note: NOTE.text }, {})).toBe(true)
  })
  it('the second question for the same story is new and goes one piece deeper', () => {
    const q1 = pieceQuestion(BATCH)!
    const q2 = pieceQuestion(BATCH, { askedKeys: [q1.key], askedTexts: [q1.question], savedForStory: [FEEL.text] })!
    expect(q2.key).not.toBe(q1.key)
    expect(q2.key.startsWith('mn:fo:piece:st-batch:')).toBe(true)
  })
})
