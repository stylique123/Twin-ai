// THE PRECEDENCE RULE COULD NEVER FIRE, BECAUSE NOTHING WROTE THE WINNING HALF.
//
// ⚠️ D3. `resolveCapabilities` documents `generations.capability_flags` as
// winning "whenever it is present, including when it says false". 0103 declares
// it the half that stops a setting from sorting the person.
// `loadCapabilities` reads it on every Result and DeclaredClips mount. And the
// only writer in the entire product was `saveCapabilityDefaults`, which writes
// the ACCOUNT default — so the per-video answer was structurally always null and
// the account default was structurally always the answer.
//
// ⚖️ THAT IS THE TRAP 0103 NAMES BY NAME: "a setting that sorts the person and
// cannot be escaped for one video." A creator on a borrowed laptop could leave a
// slot they cannot film, or change what is true of them permanently.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..', '..')
const API = readFileSync(join(REPO, 'packages/shared/src/api.ts'), 'utf8')
const CLIPS = readFileSync(join(HERE, '..', 'components', 'DeclaredClips.tsx'), 'utf8')

describe('the per-video half finally has a writer', () => {
  it('writes generations.capability_flags, not the account default', () => {
    const fn = API.slice(API.indexOf('export async function saveVideoCapabilities'),
      API.indexOf('The capability answers in force for one video'))
    expect(fn).toMatch(/\.from\('generations'\)\s*\n?\s*\.update\(\{ capability_flags: merged \}\)/)
    // ⚠️ THE FAILURE THIS REPLACES. Writing the brand default here would be the
    // old behaviour with a new name.
    expect(fn).not.toMatch(/brand_voices/)
  })

  it('sanitises before writing, like the account path does', () => {
    // '"true"', 1 and 'yes' are all things a client could send and none of them
    // may become a confident true (0103).
    const fn = API.slice(API.indexOf('export async function saveVideoCapabilities'),
      API.indexOf('The capability answers in force for one video'))
    expect(fn).toMatch(/sanitizeCapabilityFlagsForWrite\(flags\)/)
  })

  it('refuses an empty write rather than erasing a real answer', () => {
    // ⚖️ Silence resolves to the account, so writing nothing over something is
    // not a no-op — it is a downgrade.
    const fn = API.slice(API.indexOf('export async function saveVideoCapabilities'),
      API.indexOf('The capability answers in force for one video'))
    expect(fn).toMatch(/if \(Object\.keys\(incoming\)\.length === 0\) return/)
  })

  it('merges with the VIDEO\'s own previous answer, never with the account', () => {
    // ⚠️ Folding the default in here would make an unanswered flag look like a
    // per-video decision, and the resolver could no longer say which scope
    // answered — which is the whole reason `CapabilitySource` exists.
    const fn = API.slice(API.indexOf('export async function saveVideoCapabilities'),
      API.indexOf('The capability answers in force for one video'))
    expect(fn).toMatch(/readCapabilityFlags\(data\?\.capability_flags\)/)
  })
})

describe('a creator can actually reach it', () => {
  it('offers the escape only where a screen shot is being asked for', () => {
    expect(CLIPS).toMatch(/visible\.some\(\(slot\) => mediumFor\(slot\) === 'screen'\)/)
  })

  it('calls the per-video writer, not the account one', () => {
    expect(CLIPS).toMatch(/await saveVideoCapabilities\(generationId, \{ can_record_screen: false \}\)/)
    expect(CLIPS).not.toMatch(/saveCapabilityDefaults/)
  })

  it('writes false rather than clearing to unset', () => {
    // ⚠️ Clearing would resolve back to the account default and the slot would
    // return — the creator would press a button and watch nothing happen. UNSET
    // means unasked; this creator has answered.
    expect(CLIPS).not.toMatch(/can_record_screen: null/)
  })

  it('keeps the answering SCOPE in the local update', () => {
    expect(CLIPS).toMatch(/can_record_screen: \{ value: false, source: 'video' as const \}/)
  })

  it('never lets a failed write break the recording screen', () => {
    const handler = CLIPS.slice(CLIPS.indexOf('const notOnThisVideo'), CLIPS.indexOf('const capture ='))
    expect(handler).toMatch(/catch \(err\) \{[\s\S]*console\.warn/)
    expect(handler).not.toMatch(/throw/)
  })
})
