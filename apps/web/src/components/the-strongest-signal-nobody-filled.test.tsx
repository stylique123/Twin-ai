// THE STRONGEST SIGNAL IN THE PROMPT, AND NOBODY HAS EVER FILLED IT.
//
// ⚠️⚠️ MEASURED END TO END, 2026-09-13:
//   · it SAVES — `saveDNA` writes the whole `dna` object to `profiles.dna` and
//     re-reads it, throwing if the write did not take
//   · it REACHES THE WRITER — `generate-blueprint` reads `voice_samples`
//     verbatim, bounded at 3000 chars, under a label calling it "the single
//     strongest voice signal"
//   · and it is EMPTY on 0 of 56 profiles and 0 of 55 voices
//
// The path works. The box sits inside a COLLAPSED editor on a tab, so nobody has
// found it. Complete feature, zero rows — the same shape as the Product Library,
// which this repo already names as the failure a dedicated screen produces.
//
// ⚖️ SO THE OFFER GOES WHERE THE PROBLEM IS NAMED. A creator whose videos cannot
// be read is told so on the Dashboard; pasting her writing is the only route she
// has left, and that sentence now points AT the box rather than at the page.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// ⚖️ ANCHORED TO THIS FILE, NOT TO process.cwd(). CI runs each workspace with
// cwd = that workspace, so a repo-root-relative path built from cwd doubles
// into apps/web/apps/web/... and the file fails to COLLECT -- every test in it
// still reports as passing, which is how it hides. This is the pattern the
// long-standing tests in this repo already use.
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')


const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8')
const CARD = read('apps/web/src/components/OwnAccountFitCard.tsx')
const SETTINGS = read('apps/web/src/pages/Settings.tsx')
const EDGE = read('supabase/functions/generate-blueprint/index.ts')

describe('the writer really does read it — the claim this rests on', () => {
  it('generate-blueprint reads voice_samples', () => {
    expect(EDGE).toMatch(/voice_samples\?: string \| null \)\?\.voice_samples|voice_samples/)
    expect(EDGE).toMatch(/const voiceSamples = /)
  })

  it('and it is bounded, because it is pasted by a person', () => {
    const at = EDGE.indexOf('const voiceSamples = ')
    expect(EDGE.slice(at, at + 240)).toMatch(/\.slice\(0, 3000\)/)
  })
})

describe('the offer appears where the problem is named', () => {
  it('the card links at the box, not the page', () => {
    expect(CARD).toMatch(/to="\/settings#how-you-write"/)
    expect(CARD).not.toMatch(/to="\/settings"/)
  })

  it('⚠️ ONLY when the platform is one we cannot read', () => {
    // A creator whose videos we CAN read does not need to retype her posts;
    // offering it to her is busywork dressed as help.
    expect(CARD).toMatch(/m\.kind === 'none' && unreadablePlatform/)
  })

  it('and it asks the shared rule rather than string-matching instagram', () => {
    // That list is a confession meant to shrink; a local compare would drift
    // from it the day it does.
    expect(CARD).toMatch(/platformIsUnreadable\(counts\.platform\)/)
    expect(CARD).not.toMatch(/=== 'instagram'/)
  })
})

describe('the anchor lands on the box, and opens it', () => {
  it('the box carries the id', () => {
    expect(SETTINGS).toMatch(/id="how-you-write"/)
  })

  it('the hash selects the tab', () => {
    expect(SETTINGS).toMatch(/setTab\('twin'\)/)
  })

  it("⚠️ and OPENS the collapsed editor — otherwise the link lands on a closed section", () => {
    // The whole point. An anchor that scrolls to a folded panel is the same
    // broken promise as no anchor at all.
    expect(SETTINGS).toMatch(/if \(hash === '#how-you-write'\) setDnaOpen\(true\)/)
  })

  it('and the existing #my-twin anchor still works', () => {
    expect(SETTINGS).toMatch(/hash !== '#my-twin' && hash !== '#how-you-write'/)
    expect(SETTINGS).toMatch(/id="my-twin"/)
  })
})
