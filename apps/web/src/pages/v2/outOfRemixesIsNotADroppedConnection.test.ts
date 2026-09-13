// SHE WAS OUT OF REMIXES AND THE SCREEN TOLD HER THE CONNECTION HAD DROPPED.
//
// ⚠️⚠️ REPORTED LIVE 2026-09-13. A creator with none left saw "Checking whether
// your script finished — the connection dropped. Your script may already be
// finished", sat through the rescue poll, and was told neither the true thing
// nor the one thing she could do about it.
//
// ⚠️ THE REFUSAL HAD NO CODE, WHICH IS EXACTLY WHY IT FELL THROUGH. This screen
// matches refusals on `code` and handles them ABOVE the rescue, because they are
// decisions rather than lost answers — the file says so itself: "no generation is
// coming for them and waiting would only stall a creator who needs to act".
// `INSUFFICIENT_CREDITS` returned a sentence and a 402 and nothing else, so it
// could not be told apart from a dead request and was treated as one.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { OUT_OF_REMIXES_CODE } from '@twinai/shared'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const SCREEN = read('apps/web/src/pages/v2/V2Building.tsx')
const API = read('packages/shared/src/api.ts')
const EDGE = read('supabase/functions/generate-blueprint/index.ts')

/**
 * Code only — a comment naming a symbol is not a branch.
 *
 * ⚠⚠ AND THIS CAUGHT ME. The first version dropped lines STARTING with `//`,
 * `*` or `/*`, which is the repo's stated rule — but a multi-line JSX comment
 * (`{/* … *\/}`) has continuation lines that begin with ordinary prose, and one
 * of mine contains the words "buy now" while EXPLAINING why the screen must not
 * say them. The assertion matched the comment protecting the rule. That is the
 * exact trap this codebase has recorded twice; it is now handled by removing
 * comment BLOCKS before the line filter rather than by loosening the assertion.
 */
const CODE = SCREEN
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n')

describe('the refusal is recognised without reading the sentence', () => {
  it('the server really does answer 402 for this', () => {
    // The whole fix rests on this being the status. If it changes, the client
    // stops recognising the case and silently regresses to the rescue.
    const at = EDGE.indexOf('INSUFFICIENT_CREDITS')
    expect(at).toBeGreaterThan(-1)
    expect(EDGE.slice(at, at + 420)).toMatch(/\}, 402\)/)
  })

  it('the client derives the code from the STATUS, not the copy', () => {
    // `api.ts` records why the sentence is the wrong key: matching it "breaks
    // the moment the copy is reworded".
    expect(API).toMatch(/context\?\.status === 402/)
    expect(API).not.toMatch(/includes\(['"]out of remixes['"]\)/i)
  })

  it('and an explicit body code still wins, so the server keeps the meaning', () => {
    const at = API.indexOf('context?.status === 402')
    expect(API.slice(Math.max(0, at - 120), at)).toMatch(/!code &&/)
  })
})

describe('it is handled ABOVE the rescue, like every other decision', () => {
  it('the branch exists', () => {
    expect(CODE).toMatch(/code === OUT_OF_REMIXES_CODE/)
  })

  it('⚠️ and it returns BEFORE setRescuing — the whole defect in one ordering', () => {
    const branch = CODE.indexOf('code === OUT_OF_REMIXES_CODE')
    const rescue = CODE.indexOf('setRescuing(true)')
    expect(branch).toBeGreaterThan(-1)
    expect(rescue).toBeGreaterThan(-1)
    expect(branch).toBeLessThan(rescue)
    // It must actually return, not fall through to the poll.
    expect(CODE.slice(branch, rescue)).toMatch(/return/)
  })

  it('it sits with the other coded refusals, not off on its own', () => {
    for (const other of ['READINESS_INCOMPLETE_CODE', 'SELL_WITHOUT_TARGET_CODE']) {
      expect(CODE.indexOf(other)).toBeLessThan(CODE.indexOf('setRescuing(true)'))
    }
  })
})

describe('what she is told is true, and actionable', () => {
  it('the screen renders the case at all', () => {
    expect(CODE).toMatch(/\) : outOfRemixes \? \(/)
    expect(CODE).toMatch(/You are out of remixes/)
  })

  it('⚖️ it shows the SERVER’s sentence, not a second one written here', () => {
    // The function is the only place that knows which earning routes are live.
    expect(CODE).toMatch(/\{outOfRemixes\}/)
  })

  it('it says no remix was used, because none was', () => {
    expect(CODE).toMatch(/No remix was used for this one/)
  })

  it('⚠️ and it does NOT promise a purchase completes', () => {
    // Measured 2026-09-13: zero profiles on a paid plan, zero billing webhooks
    // ever fired. "Buy now" is a claim this screen cannot support.
    expect(CODE).toMatch(/See your plan/)
    expect(CODE).not.toMatch(/Buy (now|more remixes)/i)
  })

  it('and the route it offers is the one that holds checkout', () => {
    expect(CODE).toMatch(/nav\('\/settings\?tab=plan'\)/)
  })
})

describe('the code constant is shared, not retyped', () => {
  it('it is exported once and imported by the screen', () => {
    expect(OUT_OF_REMIXES_CODE).toBe('OUT_OF_REMIXES')
    expect(SCREEN).toMatch(/import \{[^}]*OUT_OF_REMIXES_CODE[^}]*\} from '\.\.\/\.\.\/lib\/api'/)
  })
})
