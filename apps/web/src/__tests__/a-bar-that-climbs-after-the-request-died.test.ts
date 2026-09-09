// PROGRESS IS A CLAIM ABOUT WHAT IS BEING DONE.
//
// ⚠️ THE RESCUE LOOP IS RIGHT AND THE SCREEN OVER IT WAS NOT. When the build
// fetch dies, V2Building spends up to ninety seconds (RESCUE_ATTEMPTS ×
// RECOVERY_POLL_MS) asking whether the server finished the thing the request
// lost — measured in production: charged 13:55:33, generation row written
// 13:58:08, so the single old lookup missed it by eighteen seconds. Keeping the
// loop is correct.
//
// ⚠️ FOR THE WHOLE OF THAT WINDOW THE CREATOR SAW A PROGRESS BAR ADVANCING
// THROUGH STEPS THAT WERE NO LONGER HAPPENING. Nothing was being built. The bar
// was reporting on a fetch that did not exist any more.
//
// ⚖️ AND THE HONEST SENTENCE IS NOT "it failed" EITHER. The server often HAS
// finished — that is the entire reason the loop exists — so the screen says it
// is checking, and says nothing about the outcome until it knows one.
//
// ⚖️ SOURCE-ANCHORED, LIKE THE OTHER V2Building CHECKS. This screen has no
// render harness in the suite; every guard on it reads the file. Each assertion
// below names one mechanism, so a mutation to any of them fails a test that
// says what broke rather than "the string moved".
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'v2', 'V2Building.tsx'), 'utf8')

describe('the screen stops claiming progress once the request is gone', () => {
  it('enters the rescue state before the loop, not after it', () => {
    const enter = SRC.indexOf('setRescuing(true)')
    const loop = SRC.indexOf('for (let i = 0; i < RESCUE_ATTEMPTS; i++)')
    expect(enter).toBeGreaterThan(-1)
    expect(loop).toBeGreaterThan(-1)
    // ⚠️ ORDER, NOT PRESENCE. Setting it after the loop would leave the bar
    // climbing for the entire ninety seconds and flip only at the very end —
    // the defect exactly, with the fix present in the file.
    expect(enter).toBeLessThan(loop)
  })

  it('freezes the percentage climb the same way an error does', () => {
    // ⚖️ FREEZES, NOT RESETS. The work up to that point did happen; rewinding
    // the bar would be its own lie.
    expect(SRC).toMatch(/if \(error \|\| rescuing\) return/)
    expect(SRC).toMatch(/\}, \[active, ingesting, error, rescuing\]\)/)
  })

  it('stops the step ticker on the same failure path', () => {
    // The interval that advances the step list is cleared in the catch, before
    // the rescue loop begins — a spinner walking down a list of steps is the
    // same false claim as the bar.
    const cut = SRC.slice(SRC.indexOf('} catch (e) {'), SRC.indexOf('setRescuing(true)'))
    expect(cut).toMatch(/clearInterval\(ticker\)/)
  })

  it('says it is CHECKING — not building, and not that it failed', () => {
    expect(SRC).toMatch(/Checking whether your script finished/)
    expect(SRC).toMatch(/Your script may already be finished/)
    // ⚠️ THE FAILURE SENTENCE MUST STILL WAIT FOR THE LOOP TO END. Announcing a
    // failure while a script is landing is the worst of the three outcomes: the
    // creator is charged, told it failed, and has no reason to go looking.
    expect(SRC.indexOf('setRescuing(false)')).toBeLessThan(SRC.indexOf('setError(creatorFacingMessage(e))'))
  })

  it('hides the bar and the steps rather than freezing them on screen', () => {
    // ⚖️ A FROZEN BAR READS AS A STALL. An absent one matches what is true.
    expect(SRC).toMatch(/rescuing \? 'hidden' : ''/)
    expect(SRC.match(/rescuing \? 'hidden' : ''/g)?.length).toBe(2)
  })
})
