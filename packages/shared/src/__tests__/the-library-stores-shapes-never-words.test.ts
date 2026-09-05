import { describe, it, expect } from 'vitest'
import { projectShape, shapeStats } from '../shapeLibrary'
import { CONTAINER_TYPES, HOOK_MECHANISMS } from '../referenceContentProfile'

// ⚠️ A REAL STORED PROFILE, shape and all, from reference_content_profiles on
// 2026-09-05. The evidence strings are the creator's OWN SENTENCES and are
// exactly what must never reach the library.
const REAL = {
  referenceId: 'https://www.tiktok.com/@bernhardkalhammer/video/7234177452619189531',
  hook: {
    promise: {
      basis: 'observed',
      value: 'How to effectively sell a product on social media without direct pitching',
      evidence: 'was aber viel besser funktioniert, du zeigst etwas total spannendes, wo dein Produkt sichtbar ist, aber nicht im Vordergrund stattfindet.',
    },
    mechanism: {
      basis: 'observed', value: 'question',
      evidence: 'Du hast ein Produkt und du willst es über Social Media verkaufen?',
    },
  },
  topic: { basis: 'observed', value: 'Social Media Marketing', evidence: 'du willst es über Social Media verkaufen' },
  transfer: { structureTransferability: 'high', reasons: ['The formula of contrast applies across any product category.'] },
  structure: {
    containerType: { basis: 'observed', value: 'problem_solution', evidence: 'Was nicht funktioniert... was aber viel besser funktioniert' },
    payoffType: { basis: 'observed', value: 'summary', evidence: 'Bis dahin machst du nur Mehrwert getriebene Kommunikation' },
    ctaMechanism: { basis: 'observed', value: 'none', evidence: 'Und dann wirst du erfolgreich sein.' },
    beats: {
      basis: 'observed',
      evidence: 'Du hast ein Produkt... Ich gebe dir mal ein Beispiel...',
      value: [
        { role: 'hook', summary: 'Direct question addressing product sellers on social media.' },
        { role: 'setup', summary: 'Explains why direct product pitching fails due to ad fatigue.' },
        { role: 'turn', summary: 'Introduces the alternative approach.' },
        { role: 'item', summary: 'Illustrates using the example of cooking recipes with a frying pan.' },
        { role: 'payoff', summary: 'Summarizes the strategy.' },
      ],
    },
  },
  likelyGoals: { basis: 'observed', value: ['authority', 'education', 'growth'], evidence: 'was aber viel besser funktioniert' },
}

/** Every string anywhere in a value, however deep. */
function allStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => allStrings(x, out))
  return out
}

describe('the projection reads shape and leaves the words behind', () => {
  const row = projectShape(REAL)

  it('reads the structure', () => {
    expect(row).toMatchObject({
      container: 'problem_solution',
      hookMechanism: 'question',
      payoffType: 'summary',
      ctaMechanism: 'none',
      beatRoles: ['hook', 'setup', 'turn', 'item', 'payoff'],
      beatCount: 5,
      transferability: 'high',
      goals: ['authority', 'education', 'growth'],
    })
  })

  // ⚠️⚠️ THE TEST THAT MUST NEVER PASS, INVERTED INTO ONE THAT MUST. Not one
  // evidence string, beat summary, promise or transfer reason may survive.
  it('NO source sentence survives the projection', () => {
    const survived = allStrings(row)
    const forbidden = [
      'Du hast ein Produkt und du willst es über Social Media verkaufen?',
      'was aber viel besser funktioniert',
      'Was nicht funktioniert',
      'Bis dahin machst du nur Mehrwert getriebene Kommunikation',
      'Ich gebe dir mal ein Beispiel',
    ]
    for (const f of forbidden) {
      expect(survived.some((s) => s.includes(f)), `leaked: ${f}`).toBe(false)
    }
  })

  it('no beat SUMMARY survives — those are prose about the video', () => {
    const survived = allStrings(row).join(' ')
    expect(survived).not.toContain('Direct question addressing')
    expect(survived).not.toContain('frying pan')
    expect(survived).not.toContain('ad fatigue')
  })

  it('the hook PROMISE does not survive either, generated or not', () => {
    expect(allStrings(row).join(' ')).not.toContain('without direct pitching')
  })

  it('no transfer REASON survives', () => {
    expect(allStrings(row).join(' ')).not.toContain('applies across any product category')
  })

  // ⚖️ THE STRUCTURAL GUARANTEE, STATED AS A PROPERTY. Every string that comes
  // out is a short token from a closed vocabulary — nothing sentence-shaped.
  it('every surviving string is a short enum token, never a sentence', () => {
    for (const s of allStrings(row)) {
      expect(s.length, `too long to be an enum: ${s}`).toBeLessThanOrEqual(24)
      expect(s, `contains a space: ${s}`).not.toMatch(/\s/)
    }
  })
})

describe('a whitelist, so a new field cannot leak by default', () => {
  it('an unrecognised container is dropped, not passed through', () => {
    const row = projectShape({ ...REAL, structure: { ...REAL.structure,
      containerType: { value: 'a brand new shape nobody enumerated' } } })
    expect(row?.container).toBeNull()
  })

  // ⚠️ THE FIELD SOMEBODY ADDS NEXT MONTH. A blacklist would copy it; a
  // whitelist ignores it, so the failure is "missing", never "leaked".
  it('a newly added prose field does not appear anywhere', () => {
    const row = projectShape({ ...REAL,
      verbatimQuote: { value: 'Du hast ein Produkt und du willst es verkaufen?' },
      transcriptExcerpt: 'Was nicht funktioniert, das Produkt einfach nehmen',
    })
    const survived = allStrings(row).join(' ')
    expect(survived).not.toContain('Du hast ein Produkt')
    expect(survived).not.toContain('Was nicht funktioniert')
  })

  it('a goal that looks like a sentence is refused', () => {
    const row = projectShape({ ...REAL,
      likelyGoals: { value: ['authority', 'sell the thing without pitching it'] } })
    expect(row?.goals).toEqual(['authority'])
  })
})

describe('a profile with no structure yields nothing, not an empty shape', () => {
  it('returns null rather than a row of nulls', () => {
    expect(projectShape({ topic: { value: 'x' } })).toBeNull()
    expect(projectShape(null)).toBeNull()
    expect(projectShape('not an object')).toBeNull()
  })
})

describe('shapeStats ranks by what travels, not by what is common', () => {
  const rows = [
    ...Array.from({ length: 104 }, () => projectShape({ ...REAL,
      structure: { ...REAL.structure, containerType: { value: 'tutorial' } } })!),
    ...Array.from({ length: 260 }, (_, i) => projectShape({ ...REAL,
      transfer: { structureTransferability: i < 70 ? 'high' : 'low' },
      structure: { ...REAL.structure, containerType: { value: 'other' } } })!),
  ]

  // ⚠️ THE MEASURED SHAPE OF THE CORPUS: `other` is the biggest bucket (260)
  // and only 27% transferable; `tutorial` is 104 and 100%. Ranking on count
  // alone would recommend "other", which is not a shape at all.
  it('tutorial outranks the larger `other` bucket', () => {
    const stats = shapeStats(rows)
    expect(stats[0].container).toBe('tutorial')
    expect(stats[0].transferableHigh).toBe(104)
    const other = stats.find((s) => s.container === 'other')!
    expect(other.count).toBe(260)
    expect(other.transferableHigh).toBe(70)
  })

  it('reports a median beat count', () => {
    expect(shapeStats(rows)[0].medianBeats).toBe(5)
  })

  it('an empty corpus yields an empty library, not a throw', () => {
    expect(shapeStats([])).toEqual([])
  })
})

// ── THE WHITELIST MUST NOT DRIFT FROM THE ASSESSOR ────────────────────────
//
// ⚠️ THIS IS THE BUG THIS FILE'S FIRST DRAFT SHIPPED WITH. The containers were
// spelled out by hand and `before_after` was left off. Nothing failed: every
// before/after reference simply projected to `container: null` and disappeared,
// which reads exactly like "the corpus has no before/after videos". A whitelist
// that silently drops a legitimate value is worse than no whitelist, because the
// gap is invisible. So the vocabulary is imported, and this asserts it.
describe('the whitelist tracks the assessor rather than a copy of it', () => {
  it('projects EVERY container the assessor can emit — none silently dropped', () => {
    for (const container of CONTAINER_TYPES) {
      const row = projectShape({
        structure: { containerType: { value: container, evidence: 'a source sentence' } },
      })
      expect(row, `container ${container} did not survive projection`).not.toBeNull()
      expect(row!.container).toBe(container)
    }
  })

  it('projects EVERY hook mechanism the assessor can emit', () => {
    for (const mechanism of HOOK_MECHANISMS) {
      const row = projectShape({ hook: { mechanism: { value: mechanism, evidence: 'a line' } } })
      expect(row, `hook ${mechanism} did not survive projection`).not.toBeNull()
      expect(row!.hookMechanism).toBe(mechanism)
    }
  })

  it('still refuses a value the assessor could never emit', () => {
    const row = projectShape({
      structure: {
        containerType: { value: 'Du hast ein Produkt und du willst es verkaufen?' },
        payoffType: { value: 'whatever the model said' },
      },
      hook: { mechanism: { value: 'story' } }, // a real container, NOT a hook mechanism
    })
    expect(row).toBeNull()
  })

  // ⚖️ `not_checked` IS IN THE CANONICAL ENUM AND IS NOT A GRADE. Importing the
  // full list and testing membership would have let "never measured" be counted
  // as a transferability level — absence read as a value.
  it('does not treat not_checked as a transferability level', () => {
    const row = projectShape({
      structure: { containerType: { value: 'tutorial' } },
      transfer: { structureTransferability: 'not_checked' },
    })
    expect(row!.transferability).toBeNull()
    expect(shapeStats([row!])[0].transferableHigh).toBe(0)
  })
})
