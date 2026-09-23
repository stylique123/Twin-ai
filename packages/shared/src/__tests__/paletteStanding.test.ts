// ⚠️ OWNER REPORT: a brand palette was pre-populated on one account with no source
// and no confirmation step, and rendered as if confirmed.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { paletteStanding, brandKitStatus } from '../profileCompletion'

const P = { primary: '#aa3355', secondary: '#112233' }

describe('paletteStanding', () => {
  it('only a manual palette is confirmed', () => {
    expect(paletteStanding({ palette: P, palette_source: 'manual' })).toEqual({ state: 'confirmed', source: 'manual' })
    expect(paletteStanding({ palette: P, palette_source: 'auto' })).toEqual({ state: 'unconfirmed', source: 'auto' })
  })

  it('a palette with no source is unconfirmed and says its source is unknown, never blank', () => {
    expect(paletteStanding({ palette: P })).toEqual({ state: 'unconfirmed', source: 'unknown' })
    expect(paletteStanding({ palette: P, palette_source: 'bogus' }).source).toBe('unknown')
  })

  it('pending and empty are not palettes', () => {
    expect(paletteStanding({ palette: P, palette_source: 'pending' }).state).toBe('pending')
    expect(paletteStanding({ palette: {} , palette_source: 'auto' }).state).toBe('none')
    expect(paletteStanding(null).state).toBe('none')
  })

  it('agrees with brandKitStatus: an unconfirmed palette never makes the kit ready', () => {
    expect(brandKitStatus({ primaryHex: P.primary, paletteSource: 'auto' })).toBe('not_set_up')
    expect(brandKitStatus({ primaryHex: P.primary, paletteSource: null })).toBe('not_set_up')
  })
})

describe('Settings asks before it shows a reading as hers', () => {
  const repo = join(import.meta.dirname, '..', '..', '..', '..')
  const S = readFileSync(join(repo, 'apps', 'web', 'src', 'pages', 'Settings.tsx'), 'utf8')
  it('renders the confirm step for an unconfirmed palette and writes manual on yes', () => {
    expect(S).toMatch(/paletteStanding\(brandKit\)\.state === 'unconfirmed'/)
    expect(S).toMatch(/saveKit\(\{ \.\.\.brandKit, palette_source: 'manual' \}\)[\s\S]{0,80}Yes, these are my colours/)
    expect(S).toContain('unconfirmed</span>')
  })
})
