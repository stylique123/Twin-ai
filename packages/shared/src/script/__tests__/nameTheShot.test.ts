/**
 * THE WRITER NAMED 44% OF SHOTS WITH THEIR POSITION.
 *
 * ⚠️ MEASURED IN PRODUCTION, NOT INFERRED: 98 of 223 shot-list rows carry a bare
 * ordinal in `shot` — "1", "2", "3". The card renders that field as its heading,
 * so a creator holding a phone against their shot list read a card called "2".
 * Every one of those rows still carried a real `shot_type` and real `notes`, so
 * the description was always there; only the name was a number.
 *
 * `shotLabel` already repairs the RENDER — that shipped, and the creator is not
 * waiting on this. What nothing could tell us is whether the WRITER stopped, and
 * a prompt line that changes nothing is this repo's most familiar result. So the
 * prompt line ships WITH a counter, and this file tests that both are wired.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isBareOrdinal } from '../shotLabel'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const COPY = readFileSync(join(REPO, 'supabase/functions/_shared/shotLabel.ts'), 'utf8')

describe('the prompt asks for a name', () => {
  it('tells the writer the field is a name and not a position', () => {
    // ⚖️ ASSERTS THE INSTRUCTION EXISTS AND SAYS BOTH HALVES, not its exact
    // wording. A prompt line is prose and will be reworded; what must survive is
    // that it asks for a name AND forbids the position.
    const at = EDGE.indexOf('is the shot\'s NAME')
    expect(at).toBeGreaterThan(-1)
    const line = EDGE.slice(at, at + 600)
    expect(line).toMatch(/NEVER write its position/)
  })

  it('does not smuggle a backtick into the template literal', () => {
    // ⚠️ THE FIRST DRAFT DID EXACTLY THIS and the edge function stopped parsing:
    // backticks around a field name terminate the prompt's template literal. The
    // parse guard caught it, and this keeps it caught cheaply.
    // ⚠️ THE LINE, NOT A WINDOW AROUND IT. A 600-character slice ran past the
    // end of the bullet and hit the template literal's own closing backtick, so
    // the first version of this failed on correct code. The test was wrong.
    // ⚠️ A TRAILING BACKTICK IS LEGITIMATE and the first two versions of this
    // test forbade it: this bullet is the LAST one, so it carries the template
    // literal's own closing backtick. What must not appear is a backtick INSIDE
    // the instruction, which is what broke the parse.
    const line = EDGE.split('\n').find((l) => l.includes('is the shot\'s NAME'))
    expect(line).toBeDefined()
    expect(line!.replace(/`$/, '')).not.toMatch(/`/)
  })
})

describe('and the counter says whether it worked', () => {
  it('the counter starts null, because absent is not zero', () => {
    // ⚠️ NULL MEANS NOTHING WAS SCANNED. A generation whose shot_list came back
    // empty never looked, and reporting that as "0 numbered shots" would be the
    // cleanest possible reading of no data.
    expect(EDGE).toMatch(/let shotsNumberedNotNamed: number \| null = null/)
  })

  it('the scan runs and assigns it', () => {
    expect(EDGE).toMatch(/shotsNumberedNotNamed = bare/)
  })

  it('it reaches beat_audit, which is what makes it durable', () => {
    expect(EDGE).toMatch(/shots_named_by_number: shotsNumberedNotNamed/)
  })

  it('the check uses the COPIED reader, not a second regex', () => {
    // ⚖️ TWO SPELLINGS OF "IS THIS JUST A NUMBER" is the drift that puts the
    // check and the render into quiet disagreement. The edge imports the copy.
    expect(EDGE).toMatch(/import \{ isBareOrdinal \} from '\.\.\/_shared\/shotLabel\.ts'/)
    expect(COPY).toMatch(/export function isBareOrdinal/)
  })
})

describe('isBareOrdinal, which both sides now share', () => {
  it('catches what the writer actually produced', () => {
    for (const v of ['1', '2', ' 3 ', '4.', '5)']) expect(isBareOrdinal(v)).toBe(true)
  })

  it('and leaves a real name alone', () => {
    for (const v of [
      'Opening line, straight to camera',
      'The still for the thumbnail',
      'Shot 2 — close on your hands',
      '',
    ]) expect(isBareOrdinal(v)).toBe(false)
  })
})
