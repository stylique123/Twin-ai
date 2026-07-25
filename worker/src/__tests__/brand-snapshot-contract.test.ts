// Parity: worker-local brand snapshot (worker/src/jobs/brandSnapshot.ts) must
// match the shared authority (packages/shared/src/editor/brandSnapshot.ts) —
// byte-identical projection. Excluded from the worker tsc build, so it CAN
// import shared by relative path.
import { describe, it, expect } from 'vitest'
import * as W from '../jobs/brandSnapshot.js'
import * as S from '../../../packages/shared/src/editor/brandSnapshot'
import { CAPTION_PRESET_IDS as SHARED_CAPTION_PRESET_IDS } from '../../../packages/shared/src/editor/catalogs'
import { canonicalJson } from '../jobs/editorManifest.js'

const VLOGO = { path: 'me/brandkit/logo.png', sha256: 'a'.repeat(64) }
const cases: Array<[unknown, unknown, unknown]> = [
  [{ tone: 'warm', pacing: 'fast and energetic', hook_style: 'question', editing_style: 'word by word', dos: ['a', 'b'], donts: ['c'] }, { palette: { primary: '#AABBCC' }, palette_source: 'manual', caption_style: 'punchy' }, null],
  [null, null, undefined],
  [{ editing_style: 'minimal subtitle', pacing: 'slow' }, { palette: { primary: 'not-a-hex' }, palette_source: 'pending', caption_preset_id: 'made-up' }, null],
  [{ tone: 'bold', dos: Array.from({ length: 40 }, (_, i) => `do-${i}`) }, { palette: { primary: '#0a0b0c' }, palette_source: 'auto' }, VLOGO],
  // a verified logo is emitted; an invalid one (bad sha) is dropped to none — same on both sides.
  [{ tone: 'x' }, { logo_path: VLOGO.path }, VLOGO],
  [{ tone: 'x' }, { logo_path: VLOGO.path }, { path: VLOGO.path, sha256: 'nope' }],
]

describe('brand-snapshot parity: worker == shared', () => {
  for (let i = 0; i < cases.length; i++) {
    it(`projects case ${i} byte-identically`, () => {
      const [profile, kit, vlogo] = cases[i]
      const w = W.projectBrandSnapshot(profile as any, kit as any, vlogo as any)
      const s = S.projectBrandSnapshot(profile as any, kit as any, vlogo as any)
      expect(canonicalJson(w)).toBe(canonicalJson(s))
    })
  }
  it('shares the caption preset catalog', () => {
    expect([...W.CAPTION_PRESET_IDS]).toEqual([...SHARED_CAPTION_PRESET_IDS])
  })
})
