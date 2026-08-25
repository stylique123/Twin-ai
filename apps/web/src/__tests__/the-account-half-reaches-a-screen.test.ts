/**
 * THE ACCOUNT HALF OF THE GATE HAD NO SCREEN.
 *
 * ⚠️ MEASURED ON MAIN BEFORE THIS LANDED: `messageForOwnAccount` was shipped,
 * tested across four files, and written against by the worker on every sample —
 * and `grep -r messageForOwnAccount apps/web` returned NOTHING. The picked-video
 * half of the same gate has been wired at V2Building.tsx since it shipped.
 *
 * ⚖️ THIS TESTS THAT IT IS CONSULTED, NOT THAT IT IS RIGHT. The rules have their
 * own tests in @twinai/shared; what nothing could prove is that a creator ever
 * sees the sentence. That is the exact gap the rule itself lived in.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(WEB, p), 'utf8')

const CARD = read('components/OwnAccountFitCard.tsx')
const LOADER = read('lib/ownSampleLoad.ts')
const DASHBOARD = read('pages/Dashboard.tsx')

describe('a creator can actually see it', () => {
  it('the card is mounted on a screen, not merely defined', () => {
    expect(DASHBOARD).toMatch(/<OwnAccountFitCard\b/)
    expect(DASHBOARD).toMatch(/from '\.\.\/components\/OwnAccountFitCard'/)
  })

  it('the card asks the shared rule what to say', () => {
    expect(CARD).toMatch(/messageForOwnAccount\(/)
  })

  it('silence renders nothing at all, never an empty card', () => {
    // ⚖️ `fine` MEANS SAY NOTHING — a scan that checked nothing, or a sample
    // still being collected. Rendering a card with an empty headline would put
    // a hole on the dashboard where the rule asked for silence.
    expect(CARD).toMatch(/kind === 'fine'\) return null/)
  })

  it('an unreadable row renders nothing rather than a claim', () => {
    expect(CARD).toMatch(/if \(!counts\) return null/)
  })
})

describe('the loader reads the row the worker writes', () => {
  it('goes through the shared reader rather than shaping counts itself', () => {
    // ⚖️ A SECOND OPINION ABOUT WHAT THE COLUMNS MEAN is the drift this repo
    // keeps catching. `ownSampleCounts` owns the null-before-coercion rule.
    expect(LOADER).toMatch(/ownSampleCounts\(/)
  })

  it('never selects the audit column into a creator-facing denominator', () => {
    // ⚠️ `own_sample_no_answer` counts videos the check could not answer for.
    // Folding it into `checked` would inflate a number the sentence says aloud.
    //
    // ⚠️ ASSERTED ON THE SELECT, NOT THE FILE. The first version searched the
    // whole source and failed on the COMMENT explaining why the column is
    // excluded — a guard that punishes the code for documenting itself. The
    // test was wrong; the loader was right.
    const select = /\.select\(([\s\S]*?)\)/.exec(LOADER)
    expect(select).not.toBeNull()
    expect(select![1]).not.toMatch(/own_sample_no_answer/)
  })

  it('a failed read is null, not an empty measurement', () => {
    expect(LOADER).toMatch(/return null/)
    expect(LOADER).not.toMatch(/usable: 0, checked: 0/)
  })
})
