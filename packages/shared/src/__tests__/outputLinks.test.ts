// Output-side link validation for generate-blueprint — the half of the
// injection fix the fence cannot cover.
//
// The fence tells the model where untrusted data ends. That is an INSTRUCTION,
// and beating instructions is what an injection is for. These tests cover what
// happens when it is beaten: the payload is in the parsed blueprint, and the
// blueprint is read aloud on camera and posted under the creator's name.
//
// Predeclared controls, so a reader can check that what was promised is what
// runs:
//
//   NEGATIVE   ordinary prose ("3.5x", "Node.js", "2024 2025 2026") must pass
//              through byte-identical; mangling a script beat fails.
//   NEGATIVE   the creator's OWN domain and handle must survive; stripping
//              them fails.
//   MUTATION   emptying the allowlist must make the "own domain survives"
//              case fail — proving the allowlist is load-bearing and not
//              decoration on a detector that keeps everything.
//   MUTATION   an injected URL placed in a field NOT named by any test must
//              still be removed — proving the walk is general, not a list of
//              remembered paths.
import { describe, it, expect } from 'vitest'
import {
  buildLinkAllowlist, sanitizeBlueprintLinks, scrubText, normalizeHost,
  type LinkAllowlist,
} from '../../../../supabase/functions/_shared/outputLinks.ts'

const NONE: LinkAllowlist = { hosts: [], handles: [] }
const scrub = (s: string, allow: LinkAllowlist = NONE) => scrubText(s, allow, 'f').text

describe('an injection that lands still cannot deliver a destination', () => {
  it('removes a URL from a line the creator would read ALOUD', () => {
    const { text, removals } = scrubText(
      'Stop scrolling, then go to https://claim-your-prize.xyz/now to get it.',
      NONE, 'script[0].line',
    )
    expect(text).not.toContain('claim-your-prize')
    expect(text).not.toContain('https://')
    expect(removals).toHaveLength(1)
    expect(removals[0]).toMatchObject({ path: 'script[0].line', kind: 'url' })
  })

  it('takes the whole URL including its path, not just the host', () => {
    // Half-removing leaves "/now?ref=attacker" as loose text in the script,
    // which is both nonsense to read and still a legible instruction.
    expect(scrub('see https://evil.com/a/b?c=d#e now')).toBe('see now')
  })

  it('catches the www and bare forms, which is how links are actually written', () => {
    expect(scrub('visit www.evil.com/x')).not.toContain('evil')
    expect(scrub('just go to evil-site.shop and buy')).not.toContain('evil-site')
  })

  it('removes a foreign @mention', () => {
    const { text, removals } = scrubText('shout out to @totally_not_them', NONE, 'f')
    expect(text).not.toContain('@totally_not_them')
    expect(removals[0].kind).toBe('mention')
  })

  it('removes a phone number', () => {
    expect(scrub('call 555-123-4567 today')).not.toContain('555')
    expect(scrub('call +1 (555) 123-4567 today')).not.toContain('4567')
    expect(scrub('text 5551234567')).not.toContain('5551234567')
  })

  it('an email address is a destination too', () => {
    expect(scrub('mail me at ops@evil.com')).not.toContain('evil.com')
  })
})

describe('NEGATIVE: ordinary prose survives byte-identical', () => {
  // A sanitizer that quietly rewrites normal script beats is worse than no
  // sanitizer: it breaks every video to stop an attack that never happened.
  const untouched = [
    'This is 3.5x faster than last year.',
    'I rebuilt the whole thing in Node.js over a weekend.',
    'Open index.html and you will see it.',
    'Compare 2024 2025 2026 and the trend is obvious.',
    'It works, e.g. on a phone.',
    'Wait for it... the payoff is here.',
    'Three things: one, two, three.',
    'Follow for more.',
  ]
  for (const line of untouched) {
    it(`leaves alone: ${line}`, () => {
      const { text, removals } = scrubText(line, NONE, 'f')
      expect(text).toBe(line)
      expect(removals).toEqual([])
    })
  }

  it('a bare year or a view count is not a phone number', () => {
    expect(scrub('in 2026 I hit 250000 views')).toContain('2026')
  })
})

describe("NEGATIVE: the creator's own destinations survive", () => {
  const allow = buildLinkAllowlist({
    handle: '@theirhandle',
    ownDnaText: 'Sells a $49/mo app at https://theirsite.com — CTA: link in bio',
    userNote: 'make it point at theirshop.store',
  })

  it('learns their host from their own DNA and their own note', () => {
    expect(allow.hosts).toContain('theirsite.com')
    expect(allow.hosts).toContain('theirshop.store')
    expect(allow.handles).toContain('theirhandle')
  })

  it('keeps their own domain in a caption', () => {
    const line = 'Everything is at https://theirsite.com/pricing'
    expect(scrubText(line, allow, 'f').text).toBe(line)
  })

  it('keeps their own handle', () => {
    expect(scrubText('follow @theirhandle', allow, 'f').text).toBe('follow @theirhandle')
  })

  it('a subdomain of their host is still theirs', () => {
    expect(scrub('go to cdn.theirsite.com/x', allow)).toContain('theirsite.com')
  })

  it('but a lookalike is NOT — suffix matching must not be substring matching', () => {
    // `nottheirsite.com` ends with `theirsite.com` as a STRING. If the check
    // were endsWith() without the dot, this is the exact domain an attacker
    // registers.
    expect(scrub('go to nottheirsite.com', allow)).not.toContain('nottheirsite')
    expect(scrub('go to theirsite.com.evil.xyz', allow)).not.toContain('evil.xyz')
  })

  it('MUTATION: with an empty allowlist their own domain is stripped too', () => {
    // Proves the allowlist decides the outcome. Without this, every "own
    // domain survives" case above could be passing because the detector
    // silently keeps everything.
    const line = 'Everything is at https://theirsite.com/pricing'
    expect(scrubText(line, NONE, 'f').text).not.toContain('theirsite.com')
  })

  it('a phone number is never allowlisted, even from their own DNA', () => {
    const a = buildLinkAllowlist({ ownDnaText: 'posts get 5551234567 views' })
    expect(scrub('call 5551234567', a)).not.toContain('5551234567')
  })
})

describe('the walk is general, not a list of remembered paths', () => {
  const blueprint = {
    packaging: { title: 'The truth about evil.com', thumbnail: 'face + text' },
    hook_options: ['Go to https://evil.com now', 'A clean hook'],
    script: [
      { section: 'hook', line: 'Clean opening line.' },
      { section: 'body', line: 'Then visit evil.shop for the rest.' },
    ],
    publish_plan: [{ platform: 'tiktok', caption: 'link: https://evil.com', hashtags: ['#a'] }],
    shot_list: ['wide shot', 'insert of evil.com on screen'],
    a_field_no_test_names: { nested: { deeper: ['seriously go to https://evil.com'] } },
  }

  const { blueprint: clean, removals } = sanitizeBlueprintLinks(blueprint, NONE)
  const flat = JSON.stringify(clean)

  it('MUTATION: strips a URL from a field no test above names', () => {
    // The point: a blueprint schema that grows a field must be covered without
    // anyone remembering to add it here.
    expect(clean.a_field_no_test_names.nested.deeper[0]).not.toContain('evil.com')
  })

  it('leaves no occurrence anywhere in the document', () => {
    expect(flat).not.toContain('evil.com')
    expect(flat).not.toContain('evil.shop')
  })

  it('records every removal with a usable path', () => {
    expect(removals.length).toBeGreaterThanOrEqual(6)
    const paths = removals.map((r) => r.path)
    expect(paths).toContain('script[1].line')
    expect(paths).toContain('publish_plan[0].caption')
    expect(paths).toContain('hook_options[0]')
  })

  it('preserves shape, types and the clean strings', () => {
    expect(clean.script).toHaveLength(2)
    expect(clean.script[0].line).toBe('Clean opening line.')
    expect(clean.hook_options[1]).toBe('A clean hook')
    expect(clean.publish_plan[0].platform).toBe('tiktok')
    expect(clean.publish_plan[0].hashtags).toEqual(['#a'])
  })
})

describe('it cannot itself become a way to lose a paid generation', () => {
  it('handles nulls, numbers, booleans and empty objects', () => {
    const odd = { a: null, b: 3, c: true, d: {}, e: [], f: undefined }
    expect(() => sanitizeBlueprintLinks(odd, NONE)).not.toThrow()
    expect(sanitizeBlueprintLinks(odd, NONE).blueprint).toMatchObject({ a: null, b: 3, c: true })
  })

  it('handles a non-object blueprint', () => {
    expect(sanitizeBlueprintLinks('plain', NONE).blueprint).toBe('plain')
    expect(sanitizeBlueprintLinks(null, NONE).blueprint).toBe(null)
  })

  it('an empty allowlist build never throws on empty input', () => {
    expect(buildLinkAllowlist({})).toEqual({ hosts: [], handles: [] })
    expect(buildLinkAllowlist({ handle: null, ownDnaText: null, userNote: null }))
      .toEqual({ hosts: [], handles: [] })
  })
})

describe('normalizeHost folds the spellings of one host together', () => {
  const cases: Array<[string, string]> = [
    ['https://WWW.Foo.com/bar?x=1', 'foo.com'],
    ['www.foo.com', 'foo.com'],
    ['foo.com:8443/x', 'foo.com'],
    ['ops@foo.com', 'foo.com'],
    ['foo.com.', 'foo.com'],
  ]
  for (const [raw, want] of cases) {
    it(`${raw} -> ${want}`, () => expect(normalizeHost(raw)).toBe(want))
  }
})
