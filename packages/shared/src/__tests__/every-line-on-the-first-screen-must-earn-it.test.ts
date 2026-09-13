// EVERY LINE ON THE FIRST SCREEN MUST EITHER CHANGE WHAT TWIN DOES OR TELL HER
// SOMETHING SHE CAN ACT ON IN ONE TAP.
//
// ⚠️⚠️ AND ONE OF THEM CARRIED A DIAGNOSIS THAT TURNED OUT TO BE WRONG. The
// Instagram entry's comment said "a 100% rate behind a single string is a
// contract that moved" — the actor no longer returning a field we read.
// RE-MEASURED 2026-09-13 over the same 60 rows: 57 are
// `instagram.com/explore/tags/…` HASHTAG BROWSE PAGES and 3 are `/p/` posts.
// ZERO are reels. A hashtag page has no video, so `no audio url found` is the
// actor answering correctly.
//
// ⚖️ INSTAGRAM STAYS ON THE LIST, FOR THE HONEST REASON. No Instagram reference
// has ever produced a transcript — but the cause is that we have never asked for
// a reel, which is the absence of evidence rather than evidence of absence.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { messageForOwnAccount, type AccountCounts } from '../index'

const ZERO_ON_IG: AccountCounts = { usable: 0, checked: 6, complete: true, platform: 'instagram' }

describe('the unreadable-platform line says what Twin DID use', () => {
  it('⚠️ without a count it claims nothing extra', () => {
    // The function cannot see what was learned; a comforting guess would be a
    // second false statement on the same card.
    const m = messageForOwnAccount(ZERO_ON_IG)
    expect(m.detail).not.toMatch(/captions/i)
  })

  it('with a real count it names the captions', () => {
    const m = messageForOwnAccount({ ...ZERO_ON_IG, learnedFrom: 8 })
    expect(m.detail).toMatch(/captions are what it learned from/i)
  })

  it('and it still says whose limit it is, either way', () => {
    for (const learned of [null, 8]) {
      const m = messageForOwnAccount({ ...ZERO_ON_IG, learnedFrom: learned })
      expect(m.detail).toMatch(/limit on our side/i)
      expect(m.headline).toMatch(/cannot read Instagram videos yet/i)
    }
  })

  it('⚠️ a zero or broken count says nothing rather than "none"', () => {
    // It arrives from a caller that counted rows. An empty twin is a claim about
    // her work that this card cannot support.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(messageForOwnAccount({ ...ZERO_ON_IG, learnedFrom: bad }).detail)
        .not.toMatch(/captions/i)
    }
  })

  it('and the count never leaks onto a readable platform', () => {
    const m = messageForOwnAccount({ usable: 0, checked: 6, complete: true, platform: 'tiktok', learnedFrom: 8 })
    expect(m.detail).not.toMatch(/captions are what it learned from/i)
  })
})

describe('the corrected diagnosis is written down, not quietly dropped', () => {
  const SRC = readFileSync(
    resolve(process.cwd(), 'packages/shared/src/gate/talkingHeadFit.ts'), 'utf8')

  it('the "contract that moved" claim is gone', () => {
    expect(SRC).not.toMatch(/a 100% rate behind a single string is a contract that moved/)
  })

  it('the real shape of the 60 rows is recorded', () => {
    expect(SRC).toMatch(/57/)
    expect(SRC).toMatch(/HASHTAG BROWSE PAGES/i)
    expect(SRC).toMatch(/ZERO are reels/i)
  })

  it('and Instagram is still on the list', () => {
    // The outcome did not change — only the reason for it.
    expect(messageForOwnAccount(ZERO_ON_IG).headline).toMatch(/cannot read Instagram/i)
  })
})
