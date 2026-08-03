// The OUTPUT half of the prompt-injection fix for generate-blueprint.
//
// WHY THIS EXISTS SEPARATELY FROM THE FENCE.
//
// Fencing the four untrusted inputs (creator DNA, derived structure, reference
// transcript, creator's note) tells the model where the data ends and our
// instructions begin. It is the right first move and it is not sufficient: a
// fence is an instruction, and an instruction is exactly the thing an injection
// is trying to beat. If it is ever beaten, the payload lands in the blueprint —
// and the blueprint does not sit in a log. Its `script[].line` is read ALOUD off
// a teleprompter by a real person on camera, and its `publish_plan[].caption` is
// posted under that person's name by social/index.ts.
//
// So the fence is the part that can fail, and this is the part that does not
// depend on the model having obeyed anything. It inspects the parsed output and
// removes what an injection would have to leave behind to be worth anything:
// a link, a handle, or a phone number pointing somewhere the creator never
// chose. An injection that cannot land a destination is mostly just noise.
//
// WHY IT STRIPS RATHER THAN REFUSES.
//
// Refusing the generation on a detected link would hand any attacker a free
// denial of service: publish a video with a URL in the spoken words, and every
// creator who references it gets a hard failure (and, on the wrong code path,
// a burned credit). Stripping degrades gracefully — the creator still gets
// their blueprint, minus a link that should not have been in a shooting brief
// in the first place. Every removal is RECORDED so the stripping is auditable
// rather than invisible.
//
// WHY IT WALKS EVERY STRING.
//
// The tempting version enumerates the dangerous paths: script lines, hooks,
// captions. That version is wrong the first time the blueprint schema grows a
// field, and it grows often. No field of a shooting brief legitimately carries
// a third-party URL, so the safe rule is the general one — walk every string,
// and let the allowlist decide what stays.

/** One thing removed, with enough context to audit it after the fact. */
export type LinkRemoval = {
  /** JSON path inside the blueprint, e.g. `script[2].line`. */
  path: string
  kind: 'url' | 'mention' | 'phone'
  /** The exact text removed. */
  value: string
}

export type LinkAllowlist = {
  /** Bare hostnames, lowercased, no scheme, no leading `www.`. */
  hosts: string[]
  /** Social handles, lowercased, no leading `@`. */
  handles: string[]
}

// Bare hostnames need a TLD list or the detector fires on ordinary prose:
// "3.5x", "Node.js", "index.html", "e.g." are all `label.label`. Anything with
// an explicit scheme is caught regardless of TLD by URL_SCHEME below, so this
// list only has to cover what people write WITHOUT `https://`. Missing an
// exotic TLD here means a bare `evil.zw` survives; that is the failure this
// trades for never mangling a normal sentence, and it is the right way round
// because the scheme-ful and `www.` forms — which is how a link that is meant
// to be followed is nearly always written — have no such gap.
const TLD = [
  'com', 'net', 'org', 'io', 'co', 'ai', 'app', 'me', 'tv', 'xyz', 'link', 'shop',
  'store', 'dev', 'gg', 'ly', 'so', 'site', 'online', 'info', 'biz', 'club',
  'live', 'page', 'bio', 'pro', 'cc', 'vip', 'top', 'icu', 'buzz', 'click',
  'life', 'world', 'space', 'fun', 'art', 'blog', 'news', 'press', 'agency',
  'studio', 'design', 'media', 'group', 'team', 'email', 'zone', 'today',
  'digital', 'cloud', 'host', 'website', 'tech', 'us', 'uk', 'ca', 'au', 'de',
  'fr', 'es', 'it', 'nl', 'in', 'br', 'mx', 'ru', 'cn', 'jp', 'kr', 'eu',
].join('|')

// Order matters inside the alternation: the longest, most specific form must
// come first or `https://evil.com/x` is matched as the bare domain `evil.com`
// and the path survives as loose text.
const URL_SCHEME = String.raw`https?:\/\/[^\s<>"'\)\]]+`
const URL_WWW = String.raw`www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s<>"'\)\]]*)?`
const URL_BARE = String.raw`[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.(?:${TLD})\b(?:\/[^\s<>"'\)\]]*)?`
const MENTION = String.raw`@[A-Za-z0-9._]{2,30}`
// Phone shapes deliberately EXCLUDE space-separated digit groups. Allowing them
// makes "2024 2025 2026" a phone number, and a script beat that lists years is
// far more common than one that reads a phone number aloud with spaces in it.
const PHONE = [
  String.raw`\+\d[\d().\-]{6,17}\d`,
  String.raw`\(\d{3}\)\s?\d{3}[.\-]?\d{4}`,
  String.raw`\b\d{3}[.\-]\d{3}[.\-]\d{4}\b`,
  String.raw`\b\d{7,15}\b`,
].join('|')

const DETECT = new RegExp(
  `(${URL_SCHEME})|(${URL_WWW})|(${URL_BARE})|(${MENTION})|(${PHONE})`,
  'gi',
)

/** Lowercase, drop scheme/path/port/`www.`, so two spellings of one host compare equal. */
export function normalizeHost(raw: string): string {
  let h = (raw ?? '').trim().toLowerCase()
  h = h.replace(/^[a-z]+:\/\//, '')
  h = h.replace(/^[^@]*@/, '') // userinfo, and the local part of an email
  h = h.split(/[/?#]/)[0] ?? ''
  h = h.split(':')[0] ?? ''
  h = h.replace(/^www\./, '')
  return h.replace(/\.+$/, '')
}

/** `foo.com` covers `foo.com` and `cdn.foo.com`, but never `notfoo.com`. */
function hostAllowed(host: string, allowed: string[]): boolean {
  return allowed.some((a) => a === host || host.endsWith(`.${a}`))
}

/**
 * Build the set of destinations the creator has already vouched for.
 *
 * THE TRUST BOUNDARY, stated explicitly because it is the whole design:
 *
 *   TRUSTED — their confirmed handle, and any link appearing in their OWN
 *   stored DNA or in the note THEY typed. A domain in a creator's own captions
 *   is their domain; a note is authored by the person making the request.
 *
 *   NOT TRUSTED — the reference transcript and derived structure. Those are
 *   the words of an arbitrary video someone else published, which is precisely
 *   the surface an attacker controls. Nothing from them is ever allowlisted,
 *   which is why callers must not pass them in here.
 */
export function buildLinkAllowlist(trusted: {
  handle?: string | null
  ownDnaText?: string | null
  userNote?: string | null
}): LinkAllowlist {
  const hosts = new Set<string>()
  const handles = new Set<string>()

  const handle = (trusted.handle ?? '').trim().replace(/^@/, '').toLowerCase()
  if (handle) handles.add(handle)

  for (const text of [trusted.ownDnaText ?? '', trusted.userNote ?? '']) {
    if (!text) continue
    for (const m of text.matchAll(DETECT)) {
      const [, scheme, www, bare, mention] = m
      const hit = scheme ?? www ?? bare
      if (hit) {
        const host = normalizeHost(hit)
        if (host.includes('.')) hosts.add(host)
      } else if (mention) {
        handles.add(mention.slice(1).toLowerCase())
      }
      // Phone numbers are never allowlisted from free text: a 7-digit run in a
      // DNA summary is far more likely to be a view count than a number the
      // creator wants spoken on camera.
    }
  }
  return { hosts: [...hosts], handles: [...handles] }
}

/**
 * Remove every link/handle/phone in `text` that `allow` does not vouch for.
 * Returns the cleaned text plus what was taken out.
 */
export function scrubText(
  text: string,
  allow: LinkAllowlist,
  path: string,
): { text: string; removals: LinkRemoval[] } {
  const removals: LinkRemoval[] = []
  const cleaned = text.replace(DETECT, (match, scheme, www, bare, mention, phone) => {
    const url = scheme ?? www ?? bare
    if (url) {
      if (hostAllowed(normalizeHost(url), allow.hosts)) return match
      removals.push({ path, kind: 'url', value: match })
      return ''
    }
    if (mention) {
      if (allow.handles.includes(String(mention).slice(1).toLowerCase())) return match
      removals.push({ path, kind: 'mention', value: match })
      return ''
    }
    if (phone) {
      removals.push({ path, kind: 'phone', value: match })
      return ''
    }
    return match
  })
  if (!removals.length) return { text, removals }
  // Tidy the hole the removal left: doubled spaces, a space before punctuation,
  // and the dangling connectives ("go to", "visit") that now point at nothing
  // are not worth chasing — but leaving "  ." in a line a human reads aloud is.
  const tidy = cleaned
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.!?;:])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]+$/gm, '')
    .trim()
  return { text: tidy, removals }
}

/**
 * Walk every string in a parsed blueprint and scrub it.
 *
 * Never throws: a sanitizer that can fail is a new way to lose a generation the
 * creator already paid for, and the caller runs this after the credit spend.
 */
export function sanitizeBlueprintLinks<T>(
  blueprint: T,
  allow: LinkAllowlist,
): { blueprint: T; removals: LinkRemoval[] } {
  const removals: LinkRemoval[] = []
  const walk = (value: unknown, path: string): unknown => {
    if (typeof value === 'string') {
      const r = scrubText(value, allow, path)
      removals.push(...r.removals)
      return r.text
    }
    if (Array.isArray(value)) return value.map((v, i) => walk(v, `${path}[${i}]`))
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) out[k] = walk(v, path ? `${path}.${k}` : k)
      return out
    }
    return value
  }
  try {
    return { blueprint: walk(blueprint, '') as T, removals }
  } catch {
    return { blueprint, removals: [] }
  }
}
