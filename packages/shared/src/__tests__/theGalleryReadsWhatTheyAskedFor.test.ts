import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { briefToProfileAnswers } from '../briefToProfileAnswers'
import { assembleCreatorProfile } from '../profileAssembler'
import { galleryCreatorView } from '../galleryCreatorView'
import * as shared from '../index'

// ⚠️ THE CHAIN WAS COMPLETE AND TERMINATED IN A LITERAL. `desiredFormats` has
// been collected since onboarding existed; profileAssembler turns it into
// `preferredFormats`; galleryCreatorView reads that. And Gallery.tsx passed
// `profile: null`, hardcoded — so every creator's format preference resolved to
// [] in production, and the comment in desiredFormatModes.ts ("the format group
// has been dark this whole time") was describing this line.
//
// ⚖️ WHICH IS WORSE THAN A MISSING FEATURE, because a hardcoded null reads as a
// decision somebody made rather than a wire nobody connected.

const NOW = '2026-08-24T00:00:00Z'
const view = (brief: Record<string, unknown>) => galleryCreatorView({
  profile: assembleCreatorProfile({ answers: briefToProfileAnswers(brief), now: NOW }),
  capabilities: null,
  entities: [],
})

describe('what they asked for reaches the gallery', () => {
  it('a chosen format becomes a production mode', () => {
    expect(view({ desiredFormats: ['pov'] }).preferredFormats).toEqual(['pov_skit'])
  })

  it('chosen goals arrive as goals', () => {
    expect(view({ contentGoals: ['authority', 'leads'] }).goals).toEqual(['authority', 'leads'])
  })

  it('an empty brief constrains nothing', () => {
    const v = view({})
    expect(v.preferredFormats).toEqual([])
    expect(v.goals).toEqual([])
  })
})

describe('free text is never promoted into an answer', () => {
  // ⚠️ THE CAST THAT WOULD HAVE COMPILED. §8a requires every "Other" to carry
  // free text, so `audience` really does hold sentences. `as AudienceSegment`
  // would have shipped one downstream as though somebody picked it — the same
  // shape as the 'DENIED' as PersonalUse bug that passed tsc and then failed a
  // database CHECK constraint.
  it('an unrecognised audience becomes null, not a segment', () => {
    expect(briefToProfileAnswers({ audience: 'small business owners in Leeds' }).audience)
      .toBeNull()
  })

  it('a recognised audience survives', () => {
    expect(briefToProfileAnswers({ audience: 'founders' }).audience).toBe('founders')
  })

  it('an unrecognised knowledge level becomes null', () => {
    expect(briefToProfileAnswers({ audienceKnowledge: 'quite clued up' }).audienceKnowledge)
      .toBeNull()
  })

  // ⚖️ FILTERED, NOT REJECTED. Somebody who picked two real formats and one we
  // no longer offer picked two real formats.
  it('one bad entry does not discard the good ones beside it', () => {
    expect(briefToProfileAnswers({ desiredFormats: ['pov', 'nonsense', 'walking'] }).desiredFormats)
      .toEqual(['pov', 'walking'])
  })

  it('a list of only unrecognised values is null, not an empty list', () => {
    expect(briefToProfileAnswers({ desiredFormats: ['nonsense'] }).desiredFormats).toBeNull()
  })

  it('a non-array is null rather than a crash', () => {
    expect(briefToProfileAnswers({ desiredFormats: 'pov' as unknown as string[] }).desiredFormats)
      .toBeNull()
    expect(briefToProfileAnswers(null).audience).toBeNull()
  })
})

describe('the page actually passes a profile', () => {
  const repo = join(import.meta.dirname, '..', '..', '..', '..')
  const code = readFileSync(join(repo, 'apps', 'web', 'src', 'pages', 'Gallery.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  // ⚠️ THE ONE LINE THE WHOLE CHAIN DIED ON.
  it('no longer hardcodes profile: null', () => {
    expect(code).not.toMatch(/profile:\s*null/)
    expect(code).toMatch(/profile:\s*myProfile/)
  })

  it('loads the brief and assembles it', () => {
    expect(code).toMatch(/loadPreScriptBrief\(/)
    expect(code).toMatch(/assembleCreatorProfile\(/)
  })

  // ⚖️ THROUGH THE ADAPTER, NOT A CAST. A cast at this call site would defeat
  // the compiler exactly where the loose type exists to be handled.
  it('narrows the brief rather than casting it', () => {
    expect(code).toMatch(/answers:\s*briefToProfileAnswers\(brief\)/)
    expect(code).not.toMatch(/brief as CreatorProfileAnswers/)
  })
})

describe('the module is reachable at all', () => {
  it('is exported from the package index', () => {
    expect(typeof shared.briefToProfileAnswers).toBe('function')
  })
})
