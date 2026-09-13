// The gallery offers "Remix in my voice" on every card. For 365 of them the
// click ends in a refusal we could have predicted before it happened.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { remixOffer, mayPromiseRemix } from '../galleryRemixOffer'
import { UNREADABLE_PLATFORMS } from '../gate/talkingHeadFit'
import { REFERENCE_UNREAD_TEXT } from '../referenceAnalysis'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../..')

describe('the platforms we have never read do not get a remix button', () => {
  it('every unreadable platform is refused', () => {
    // Driven off the list itself, so a platform added to it is covered here
    // without anybody remembering to add a case.
    expect(UNREADABLE_PLATFORMS.length).toBeGreaterThan(0)
    for (const p of UNREADABLE_PLATFORMS) {
      expect(remixOffer(p).kind).toBe('refused')
      expect(mayPromiseRemix(p)).toBe(false)
    }
  })

  it('the platforms we CAN read keep theirs — 5,779 of 6,144 cards', () => {
    for (const p of ['tiktok', 'youtube', 'TikTok', ' YouTube ']) {
      expect(remixOffer(p).kind).toBe('offer')
      expect(mayPromiseRemix(p)).toBe(true)
    }
  })

  it('an unknown or missing platform is OFFERED, not refused', () => {
    // ⚠️ THE DEFAULT MATTERS MORE THAN THE REFUSAL. Refusing on absence would
    // silently empty most of a gallery whose cards are largely unassessed —
    // the "unset is not false" rule this repo keeps re-learning.
    for (const p of [null, undefined, '', '   ', 'vimeo', 'unknown']) {
      expect(remixOffer(p).kind).toBe('offer')
    }
  })
})

describe('one limit, one sentence', () => {
  it('the refusal reuses the studio\'s wording exactly', () => {
    // Two surfaces explaining one limit in two wordings is how a creator
    // concludes they hit two different problems.
    const r = remixOffer('instagram')
    expect(r.kind === 'refused' && r.because).toBe(REFERENCE_UNREAD_TEXT.platform_unreadable)
  })

  it('it says whose limit it is, and never blames the creator', () => {
    const r = remixOffer('instagram')
    const text = r.kind === 'refused' ? r.because : ''
    expect(text).toMatch(/our side/i)
    expect(text).not.toMatch(/\byour (account|video|fault)\b/i)
    // And it names a way forward rather than ending on the refusal.
    expect(text).toMatch(/TikTok|YouTube/)
  })
})

describe('the gallery actually asks', () => {
  const gallery = readFileSync(
    resolve(REPO, 'apps/web/src/pages/Gallery.tsx'), 'utf8')
  // ⚠️ CODE LINES ONLY. A guard that greps source text must tell a mention from
  // a call — this file's own history has two cases of a comment satisfying the
  // assertion that was supposed to police it. Whole-line comments are dropped;
  // never everything after `//`, or a real call sitting after a URL disappears.
  const code = gallery.split('\n').filter((l) => !l.trim().startsWith('//')
    && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n')

  it('calls the rule rather than re-deciding locally', () => {
    expect(code).toMatch(/\bremixOffer\s*\(/)
    // A second authority for one rule is the defect class this repo keeps
    // closing: the gallery must not test the platform itself.
    expect(code).not.toMatch(/===\s*['"]instagram['"]/)
  })

  it('EVERY remix button is gated — counted against the rule, not spotted', () => {
    // ⚠️ THIS ASSERTION WAS HOLLOW ON ITS FIRST DRAFT, and two mutants walked
    // through it: replacing one `remixOffer(...)` call with a hard-coded
    // `{ kind: 'offer' }` left the NAME `canRemix` in the file, and a
    // name-counting test passed. A negative control written against one
    // spelling of a mistake tests that spelling, not the mistake.
    //
    // ⚖️ SO IT IS A PROPERTY NOW: there is exactly one call to the rule for
    // every button that offers the remix. One button losing its gate changes
    // the balance, whatever the local variable is called.
    const buttons = code.match(/Remix in my voice/g) ?? []
    const asks = code.match(/remixOffer\s*\(/g) ?? []
    expect(buttons.length).toBeGreaterThanOrEqual(2)
    expect(asks.length).toBe(buttons.length)
  })

  it('each button sits inside the offered branch, not beside it', () => {
    // The count above cannot tell a gate that wraps the button from one that
    // merely stands near it. Every button must be preceded by the branch that
    // admits it, with no second button squeezed in between.
    for (const m of code.matchAll(/Remix in my voice/g)) {
      const before = code.slice(0, m.index)
      const gate = before.lastIndexOf("canRemix.kind === 'offer'")
      expect(gate).toBeGreaterThan(-1)
      expect(before.slice(gate)).not.toMatch(/Remix in my voice/)
    }
  })

  it('the blurb does not promise a remix the card will not get', () => {
    // "Tap Remix and TwinAI rebuilds its hook…" describes something that will
    // not happen on a refused card.
    expect(code).toMatch(/mayPromiseRemix\s*\(/)
  })
})
