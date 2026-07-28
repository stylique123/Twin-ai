// Track C · Batch A.1 — `BrandTruthSnapshotV1` controls.
//
// The four controls at the bottom of docs/track-c-batch-a-dna-drift-audit.md were
// PREDECLARED before this projection was written. They are reproduced verbatim as
// the describe titles, so a reader can check that what was promised is what runs:
//
//   NEGATIVE  a stored profile carrying editing_style and brand_colors must
//             project without loss; dropping either fails.
//   NEGATIVE  profile.brand_colors disagreeing with BrandKit.palette must resolve
//             deterministically and record the conflict; silent selection fails.
//   MUTATION  removing the provenance label from one field must make the
//             business-fact restriction fail — proving the label is load-bearing.
//   MUTATION  a `goal` arriving with provenance `inferred` must be refused at
//             authority level 2, and the test must fail if that check is removed.
//
// A mutation control here means: take the CORRECT snapshot, break exactly one
// thing, and require the validator to catch it. Without that, a validator that
// returns its input unchanged would pass every positive test in this file.
import { describe, it, expect } from 'vitest'
import {
  projectBrandTruth, validateBrandTruthSnapshot, canonicalBrandTruth,
  BrandTruthError, AUTHORITY_LEVEL,
  type BrandTruthSources, type BrandTruthSnapshotV1, type TruthField,
} from '../brandTruth.js'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/**
 * A realistic stored row. The synthesized half is the RAW provider object shape
 * from `supabase/functions/_shared/dna.ts:339-363` — including the two fields
 * `VoiceProfile` cannot express — because that is what `dna-poll:288` actually
 * writes into `brand_voices.profile`.
 */
function sources(over: Partial<BrandTruthSources> = {}): BrandTruthSources {
  return {
    ownerId: '11111111-1111-4111-8111-111111111111',
    brandVoiceId: '22222222-2222-4222-8222-222222222222',
    selfReported: {
      niche: 'Fitness',
      audience: 'busy parents',
      product: 'a 12-week home programme',
      goal: 'sell the programme',
      voice: 'direct, warm',
      platforms: ['instagram', 'tiktok'],
      editing_style: 'fast jump cuts, burned-in captions',
    },
    synthesized: {
      summary: 'plain-spoken coach who cuts through fitness noise',
      niche: 'Fitness',
      sub_niche: 'home strength for parents',
      audience: 'parents of young children',
      audience_pain: 'no time to get to a gym',
      dream_outcome: 'strong without a gym membership',
      offer: 'a paid 12-week plan',
      tone: 'direct',
      pacing: 'brisk',
      hook_style: '[number] + [who it is for] + [promise]',
      hook_patterns: ['Contrarian claim', 'Number drop'],
      editing_style: 'jump cuts with keyword captions',
      vocabulary: ['reps', 'progressive overload'],
      recurring_ctas: ['comment PLAN'],
      pov: ['you do not need a gym'],
      enemy: 'the 2-hour workout',
      dos: ['show the whole set'],
      donts: ['never fake a PR'],
      sample_hooks: ['3 lifts that fixed my back'],
      formats: ['before/after', 'myth-busting listicle'],
      title_style: 'big number + bold promise',
      thumbnail_style: 'face left, big text right',
      brand_colors: { primary: '#123456', secondary: '#abcdef', highlight: '#FF00AA' },
    },
    brandKit: {
      palette: { primary: '#123456', secondary: '#abcdef', highlight: '#ff00aa' },
      palette_source: 'auto',
      logo_path: 'logos/x.png',
    },
    ...over,
  }
}

const field = (s: BrandTruthSnapshotV1, path: string): TruthField<unknown> => {
  const [g, k] = path.split('.')
  return (s as unknown as Record<string, Record<string, TruthField<unknown>>>)[g][k]
}

describe('the projection is a gate, not a description', () => {
  it('produces a snapshot that validates', () => {
    const s = projectBrandTruth(sources())
    expect(() => validateBrandTruthSnapshot(s)).not.toThrow()
    expect(s.schemaVersion).toBe(1)
  })

  it('hashes canonically — key order cannot change the bytes', () => {
    const a = projectBrandTruth(sources())
    // Same facts, different insertion order in the SOURCE object.
    const reordered = sources()
    reordered.synthesized = Object.fromEntries(
      Object.entries(reordered.synthesized as Record<string, unknown>).reverse(),
    )
    const b = projectBrandTruth(reordered)
    expect(canonicalBrandTruth(b)).toEqual(canonicalBrandTruth(a))
    // Guard the guard: a real difference must still change the bytes.
    const c = projectBrandTruth(sources({
      synthesized: { ...(sources().synthesized as object), tone: 'wry' },
    }))
    expect(canonicalBrandTruth(c)).not.toEqual(canonicalBrandTruth(a))
  })

  it('refuses a snapshot with no owner', () => {
    expect(() => projectBrandTruth(sources({ ownerId: '   ' }))).toThrow(BrandTruthError)
  })

  it('treats synthesis placeholders as ABSENT rather than as values', () => {
    // The synthesis prompt bans these strings; a placeholder that survives into
    // the snapshot becomes a "fact" downstream.
    const s = projectBrandTruth(sources({
      synthesized: { ...(sources().synthesized as object), enemy: 'n/a', tone: '   ' },
    }))
    expect(field(s, 'brandVoice.enemy').value).toBeNull()
    expect(field(s, 'brandVoice.tone').value).toBeNull()
    expect(s.absences.map((a) => a.field)).toContain('brandVoice.enemy')
  })
})

// ---------------------------------------------------------------- control 1
describe('CONTROL 1 (negative) — editing_style and brand_colors project without loss', () => {
  // D1/D2: both are produced by the runtime and stored in `brand_voices.profile`,
  // and NEITHER is expressible in `VoiceProfile`. A projection routed through the
  // shared interface would silently drop them.
  it('reads editing_style out of the RAW stored profile when the user did not assert one', () => {
    const src = sources()
    delete (src.selfReported as Record<string, unknown>).editing_style
    const s = projectBrandTruth(src)
    const f = field(s, 'brandVoice.editingStyle')
    expect(f.value, 'D1: editing_style was dropped').toBe('jump cuts with keyword captions')
    expect(f.provenance).toBe('inferred')
  })

  it('prefers the SELF-REPORTED editing_style, because level 2 outranks level 6', () => {
    const s = projectBrandTruth(sources())
    const f = field(s, 'brandVoice.editingStyle')
    expect(f.value).toBe('fast jump cuts, burned-in captions')
    expect(f.provenance).toBe('user_asserted')
    expect(AUTHORITY_LEVEL[f.provenance!]).toBeLessThan(AUTHORITY_LEVEL.inferred)
  })

  it('reads brand_colors out of the RAW stored profile when there is no brand kit', () => {
    const s = projectBrandTruth(sources({ brandKit: null }))
    const f = field(s, 'visualIdentity.colors')
    expect(f.value, 'D2: brand_colors was dropped').toEqual({
      primary: '#123456', secondary: '#abcdef', highlight: '#ff00aa',
    })
  })

  it('MUTATION: dropping either field from the stored row is REPORTED, not defaulted', () => {
    // The negative half of the control: the projection must not invent a value,
    // and must say which kind of absence this is. `editing_style` and
    // `brand_colors` are both outside the runtime REQUIRED set, so the provider
    // was always free to omit them.
    const src = sources()
    delete (src.selfReported as Record<string, unknown>).editing_style
    delete (src.synthesized as Record<string, unknown>).editing_style
    delete (src.synthesized as Record<string, unknown>).brand_colors
    const s = projectBrandTruth(src)
    expect(field(s, 'brandVoice.editingStyle').value).toBeNull()
    expect(field(s, 'brandVoice.editingStyle').absenceReason)
      .toBe('not_in_required_set_and_omitted')
    expect(() => validateBrandTruthSnapshot(s)).not.toThrow()
    // And an absence that carries no reason is refused outright.
    const broken = clone(s)
    broken.brandVoice.editingStyle.absenceReason = null
    expect(() => validateBrandTruthSnapshot(broken)).toThrow(/absence reason/)
  })
})

// ---------------------------------------------------------------- control 2
describe('CONTROL 2 (negative) — two homes for the palette resolve deterministically and record the conflict', () => {
  const disagreeing = (palette_source: 'auto' | 'manual' | 'pending'): BrandTruthSources =>
    sources({
      brandKit: {
        palette: { primary: '#000011', secondary: '#000022', highlight: '#000033' },
        palette_source,
        logo_path: null,
      },
    })

  it('a MANUAL kit wins and is user_asserted — the creator hand-picked it', () => {
    const s = projectBrandTruth(disagreeing('manual'))
    const f = field(s, 'visualIdentity.colors')
    expect(f.value).toEqual({ primary: '#000011', secondary: '#000022', highlight: '#000033' })
    expect(f.provenance).toBe('user_asserted')
    expect(f.authoritative).toBe(true)
  })

  it('a PENDING kit yields to synthesis — the scan read no colours at all', () => {
    const s = projectBrandTruth(disagreeing('pending'))
    expect(field(s, 'visualIdentity.colors').value).toEqual({
      primary: '#123456', secondary: '#abcdef', highlight: '#ff00aa',
    })
  })

  it('an AUTO kit wins, because it is the home the renderer reads', () => {
    const s = projectBrandTruth(disagreeing('auto'))
    expect(field(s, 'visualIdentity.colors').value).toEqual({
      primary: '#000011', secondary: '#000022', highlight: '#000033',
    })
  })

  it('SILENT SELECTION FAILS: every disagreement is recorded with both candidates', () => {
    for (const src of ['auto', 'manual', 'pending'] as const) {
      const s = projectBrandTruth(disagreeing(src))
      const c = s.conflicts.find((x) => x.field === 'visualIdentity.colors')
      expect(c, `${src}: the losing candidate was dropped instead of recorded`).toBeDefined()
      expect(c!.candidates).toHaveLength(2)
      expect(c!.candidates.map((x) => x.source).sort())
        .toEqual([`brand_kit:${src}`, 'profile.brand_colors'].sort())
      expect(c!.candidates.some((x) => x.source === c!.chosenSource)).toBe(true)
      expect(() => validateBrandTruthSnapshot(s)).not.toThrow()
    }
  })

  it('AGREEMENT is not a conflict — the normal case stays quiet', () => {
    // dna-poll writes both homes in ONE statement, so they normally agree.
    // Recording that as a conflict would bury the real drift in noise. The
    // fixture's two homes agree except for hex case, which is not a difference.
    const s = projectBrandTruth(sources())
    expect(s.conflicts).toHaveLength(0)
  })

  it('MUTATION: a conflict whose candidates all agree is refused', () => {
    const s = projectBrandTruth(disagreeing('auto'))
    const broken = clone(s)
    broken.conflicts[0].candidates[1].value = broken.conflicts[0].candidates[0].value
    expect(() => validateBrandTruthSnapshot(broken)).toThrow(/not a conflict/)
  })

  it('MUTATION: a conflict resolved to a source that was never a candidate is refused', () => {
    const s = projectBrandTruth(disagreeing('auto'))
    const broken = clone(s)
    broken.conflicts[0].chosenSource = 'somewhere_else'
    expect(() => validateBrandTruthSnapshot(broken)).toThrow(/not among its candidates/)
  })
})

// ---------------------------------------------------------------- control 3
describe('CONTROL 3 (mutation) — the provenance label is load-bearing, not decorative', () => {
  it('an INFERRED business fact is retained but is NOT authoritative, and the demotion is recorded', () => {
    // `offer` has no self-reported counterpart in this row, so it comes from
    // synthesis — i.e. from a prompt that explicitly prefers "a confident,
    // specific inference" to a blank. It may inform a bounded creative choice.
    // It may never be cited as truth.
    const src = sources()
    const s = projectBrandTruth(src)
    const offer = field(s, 'businessTruth.offer')
    expect(offer.value).toBe('a paid 12-week plan')
    expect(offer.provenance).toBe('inferred')
    expect(offer.authoritative).toBe(false)
    expect(s.nonAuthoritativeSignals.map((n) => n.field)).toContain('businessTruth.offer')
  })

  it('a USER-ASSERTED business fact IS authoritative', () => {
    const s = projectBrandTruth(sources())
    const product = field(s, 'businessTruth.product')
    expect(product.provenance).toBe('user_asserted')
    expect(product.authoritative).toBe(true)
  })

  it('MUTATION: removing the provenance label makes the business-fact check FAIL', () => {
    // THE control. If the label were decorative, stripping it would change
    // nothing and this snapshot would still validate.
    const s = projectBrandTruth(sources())
    const broken = clone(s)
    broken.businessTruth.offer.provenance = null
    expect(() => validateBrandTruthSnapshot(broken)).toThrow(/provenance label/)
  })

  it('MUTATION: claiming an inferred business fact is authoritative FAILS', () => {
    const s = projectBrandTruth(sources())
    const broken = clone(s)
    broken.businessTruth.offer.authoritative = true
    expect(() => validateBrandTruthSnapshot(broken)).toThrow(/authoritative/)
  })

  it('MUTATION: demoting a fact without recording it FAILS', () => {
    // A demotion nobody can see is not a safeguard.
    const s = projectBrandTruth(sources())
    const broken = clone(s)
    broken.nonAuthoritativeSignals = broken.nonAuthoritativeSignals
      .filter((n) => n.field !== 'businessTruth.offer')
    expect(() => validateBrandTruthSnapshot(broken)).toThrow(/nonAuthoritativeSignals/)
  })

  it('CONTROL ON THE CONTROL: the unmutated snapshot passes every check above', () => {
    // Without this, all four mutations could be passing because the validator
    // rejects everything.
    expect(() => validateBrandTruthSnapshot(projectBrandTruth(sources()))).not.toThrow()
  })
})

// ---------------------------------------------------------------- control 4
describe('CONTROL 4 (mutation) — an inferred `goal` is refused at authority level 2', () => {
  it('goal comes from the SELF-REPORTED record only', () => {
    // D3: the runtime schema never asks for `goal`. Anything filling that slot
    // from synthesis would put a level-6 inference where §5 requires level 2.
    const s = projectBrandTruth(sources())
    const g = field(s, 'userIntent.goal')
    expect(g.value).toBe('sell the programme')
    expect(g.provenance).toBe('user_asserted')
    expect(AUTHORITY_LEVEL[g.provenance!]).toBe(2)
  })

  it('a synthesized `goal` cannot leak into the user-intent slot', () => {
    // Even when the stored profile happens to carry one.
    const src = sources()
    ;(src.synthesized as Record<string, unknown>).goal = 'grow the audience'
    delete (src.selfReported as Record<string, unknown>).goal
    const s = projectBrandTruth(src)
    expect(field(s, 'userIntent.goal').value).toBeNull()
    expect(field(s, 'userIntent.goal').absenceReason).toBe('no_self_reported_value')
  })

  it('MUTATION: a goal labelled `inferred` is REFUSED by the validator', () => {
    // THE control. This is the shape the defect would take if a future change
    // started filling `goal` from synthesis.
    const s = projectBrandTruth(sources())
    const broken = clone(s)
    broken.userIntent.goal.provenance = 'inferred'
    expect(() => validateBrandTruthSnapshot(broken)).toThrow(/level-2 user-intent slot/)
  })

  it('MUTATION: `derived` and `observed` are refused there too, not just `inferred`', () => {
    // The rule is "only the user may assert user intent", not "not inferred".
    // A check written against one label would pass this and still be wrong.
    for (const p of ['derived', 'observed'] as const) {
      const broken = clone(projectBrandTruth(sources()))
      broken.userIntent.goal.provenance = p
      expect(() => validateBrandTruthSnapshot(broken), `${p} was allowed`)
        .toThrow(/level-2 user-intent slot/)
    }
  })

  it('CONTROL ON THE CONTROL: with the check satisfied the snapshot validates', () => {
    const s = projectBrandTruth(sources())
    expect(field(s, 'userIntent.goal').provenance).toBe('user_asserted')
    expect(() => validateBrandTruthSnapshot(s)).not.toThrow()
  })
})

describe('§2.3 step 5 — the snapshot is a frozen projection, not a live read', () => {
  it('mutating the source row after projection cannot change the snapshot', () => {
    const src = sources()
    const s = projectBrandTruth(src)
    const before = canonicalBrandTruth(s)
    ;(src.synthesized as Record<string, unknown>).tone = 'completely different'
    ;(src.selfReported as Record<string, unknown>).goal = 'something else'
    expect(canonicalBrandTruth(s)).toEqual(before)
  })
})
