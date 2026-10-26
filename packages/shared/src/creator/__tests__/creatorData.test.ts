import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  CREATOR_TYPES, loadCreatorTypeRules, validateCreatorTypeRules, rulesForCreator, creatorTypeRulesEnabled,
} from '../creatorTypeRules'
import { loadNichePack, validateNichePack, bannedClaimsIn, nichePacksEnabled } from '../nichePack'
import { loadAuditSetV2, extractPageFacts, deidentificationProblems, validateAuditSetV2Manifest } from '../auditSetV2'

const fx = join(__dirname, '..', 'fixtures')
const json = (p: string) => JSON.parse(readFileSync(join(fx, p), 'utf8'))
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

describe('creator type rules (W12.2)', () => {
  it('the shipped data file passes the schema check and covers every type', () => {
    const r = loadCreatorTypeRules()
    expect(Object.keys(r.types).sort()).toEqual([...CREATOR_TYPES].sort())
  })
  it('rejects a missing type, an unknown type and a bad cta', () => {
    const bad = clone(loadCreatorTypeRules()) as any
    delete bad.types.coach
    bad.types.wizard = bad.types.maker
    bad.types.maker = { ...bad.types.maker, cta_default: 'buy_now', rules: [] }
    const errs = validateCreatorTypeRules(bad)
    expect(errs).toContain('types.coach: missing')
    expect(errs).toContain('types.wizard: unknown creator type')
    expect(errs).toContain('types.maker.cta_default: invalid')
    expect(errs).toContain('types.maker.rules: non-empty string list required')
    expect(() => loadCreatorTypeRules(bad)).toThrow(/invalid/)
  })
  it('flag defaults OFF: no env, other values and unknown types all give null', () => {
    expect(creatorTypeRulesEnabled(undefined)).toBe(false)
    expect(creatorTypeRulesEnabled({ CREATOR_TYPE_RULES: 'true' })).toBe(false)
    expect(rulesForCreator('coach', {})).toBeNull()
    expect(rulesForCreator('wizard', { CREATOR_TYPE_RULES: 'on' })).toBeNull()
    expect(rulesForCreator(null, { CREATOR_TYPE_RULES: 'on' })).toBeNull()
  })
  it('flag on returns the data for that type', () => {
    expect(rulesForCreator('entertainer', { CREATOR_TYPE_RULES: 'on' })?.cta_default).toBe('none')
    expect(rulesForCreator('coach', { CREATOR_TYPE_RULES: 'on' })?.hook_families).toContain('list_promise')
  })
})

describe('niche pack', () => {
  const pack = json('nichePacks/fictional-hand-poured-candles.json')
  it('the fictional example pack is valid', () => {
    expect(validateNichePack(pack)).toEqual([])
    expect(loadNichePack(pack).fictional).toBe(true)
  })
  it('flags banned claims in a line', () => {
    const p = loadNichePack(pack)
    expect(bannedClaimsIn(p, 'This candle heals stress')).toEqual(['health claim'])
    expect(bannedClaimsIn(p, 'Poured in small batches')).toEqual([])
  })
  it('rejects a non-fictional pack, a dangling angle, a use/avoid clash and a hook that is a banned claim', () => {
    const bad = clone(pack)
    bad.fictional = false
    bad.question_bank[0].angle_id = 'nope'
    bad.vocabulary.use.push('Toxin-free')
    bad.example_hooks[0].text = 'The only non-toxic candle you need'
    const errs = validateNichePack(bad).join('\n')
    expect(errs).toMatch(/fictional: must be true/)
    expect(errs).toMatch(/unknown angle_id/)
    expect(errs).toMatch(/in both use and avoid/)
    expect(errs).toMatch(/matches a banned claim/)
  })
  it('flag defaults OFF', () => {
    expect(nichePacksEnabled(undefined)).toBe(false)
    expect(nichePacksEnabled({ NICHE_PACKS: 'on' })).toBe(true)
  })
})

describe('audit set v2', () => {
  const dir = join(fx, 'auditSetV2')
  const read = (f: string) => readFileSync(join(dir, f), 'utf8')
  const manifest = json('auditSetV2/manifest.json')

  it('loads every fictional page and its facts match the manifest', () => {
    const pages = loadAuditSetV2(manifest, read)
    expect(pages.map((p) => p.entry.id)).toEqual(['fictional-coach-landing', 'fictional-bakery-local'])
    expect(pages[0].facts.links).toContain('https://steady-start.example/book')
  })
  it('every fixture file is listed and de-identified', () => {
    const files = readdirSync(dir).filter((f: string) => f.endsWith('.html')).sort()
    expect(files).toEqual(manifest.entries.map((e: any) => e.file).sort())
    for (const f of files) expect(deidentificationProblems(read(f))).toEqual([])
  })
  it('refuses a page with real-looking contact data', () => {
    const leaky = '<html data-fictional="true"><a href="https://realshop.com">x</a> call +1 555 123 4567 or @someone, mail a@gmail.com</html>'
    const p = deidentificationProblems(leaky).join('\n')
    expect(p).toMatch(/non-example host: realshop.com/)
    expect(p).toMatch(/phone-like/)
    expect(p).toMatch(/social handle/)
    expect(p).toMatch(/email on non-example domain: gmail.com/)
    expect(deidentificationProblems('<html></html>')).toContain('missing data-fictional="true" marker')
  })
  it('refuses a manifest whose expected facts disagree with the page', () => {
    const m = clone(manifest)
    m.entries[0].expected.h1 = 'something else'
    expect(() => loadAuditSetV2(m, read)).toThrow(/h1 expected/)
  })
  it('validates the manifest shape', () => {
    expect(validateAuditSetV2Manifest({ schema_version: 1, entries: [] })).toEqual([
      'schema_version: must be 2', 'entries: non-empty list required',
    ])
  })
  it('extractor ignores scripts and decodes entities', () => {
    const f = extractPageFacts('<title>A &amp; B</title><script>"<h1>no</h1>"</script><h1>Yes</h1>')
    expect(f).toMatchObject({ title: 'A & B', h1: 'Yes' })
  })
})
