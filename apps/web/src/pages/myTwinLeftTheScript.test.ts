import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * ⚠️ SEVENTH FLAG: THE SCRIPT SCREEN ASKED FOR HOMEWORK.
 *
 * Under a script the creator opened to READ, `CreatorQuestionCard` rendered a
 * textarea and asked them to write a paragraph. The question is worth asking;
 * the moment is not. It moves to Settings, and what stays under the script is
 * what Twin knows plus one link.
 *
 * ⚖️ MOVED IS NOT DELETED, AND THAT IS THE HALF A DIFF READS AS "REMOVED".
 * Both ends are pinned here — the card gone from Result AND mounted on
 * Settings — because a change that only did the first would silently end the
 * only channel through which a creator can tell Twin something its videos
 * cannot.
 *
 * ⚠️ THIS OVERRULES A MEASURED DECISION. `CreatorQuestionCard`'s own header
 * records that a dedicated screen is a wall: the Product Library is a complete
 * feature with zero rows because it waits to be visited. The bet is that a line
 * left behind on the delivery surface — stating what is missing and where to fix
 * it — is not the same as no prompt at all. If answers fall to zero, revert.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')
const RESULT = read('apps/web/src/pages/Result.tsx')
const SETTINGS = read('apps/web/src/pages/Settings.tsx')
const LINK = read('apps/web/src/components/TwinKnowledgeLink.tsx')

describe('my twin left the script', () => {
  it('the script screen no longer mounts the question card', () => {
    expect(RESULT).not.toContain('<CreatorQuestionCard')
    expect(RESULT).not.toContain("from '../components/CreatorQuestionCard'")
  })

  it('both script surfaces carry the link — desktop column and mobile tab', () => {
    // ⚠️ THE MOBILE TAB WAS SILENTLY MISSING THIS CARD ONCE BEFORE. Counting
    // both call sites is how that stays fixed through a move.
    const mounts = RESULT.match(/<TwinKnowledgeLink /g) ?? []
    expect(mounts).toHaveLength(2)
  })

  it('the question is asked on Settings, not nowhere', () => {
    expect(SETTINGS).toContain("from '../components/CreatorQuestionCard'")
    expect(SETTINGS).toContain('<CreatorQuestionCard voiceId={defaultVoiceId} />')
  })

  it('the link names an anchor the page actually has, and lands on it', () => {
    expect(LINK).toContain("to=\"/settings#my-twin\"")
    expect(SETTINGS).toContain('id="my-twin"')
    // A tabbed page does not honour a hash by itself.
    expect(SETTINGS).toContain("window.location.hash !== '#my-twin'")
    expect(SETTINGS).toContain("setTab('twin')")
  })

  it('the counts come from strengthSentence, not a second vocabulary', () => {
    // ⚖️ Two screens inventing their own sentence about one store is how they
    // come to report different numbers for it.
    expect(LINK).toContain('strengthSentence')
    expect(LINK).toContain('loadTwinStrength')
  })

  it('an unknown store renders nothing at all', () => {
    // A failed read is not an empty twin.
    expect(LINK).toContain('if (!s) return null')
  })
})
