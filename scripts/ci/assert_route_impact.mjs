#!/usr/bin/env node
// Turn the read-only route-impact probe into a DECISION, a candidate patch and a
// rollback — and refuse, loudly, whenever the evidence does not support one.
//
// THE QUESTION THIS ANSWERS
// -------------------------
// The pre-stop audit proved that a live route still reaches stylique-os. That is
// enough to block `stop` and not nearly enough to fix it: the remedy depends on
// whether the route serves ONLY stylique-os, or also fronts a container on the
// do-not-touch list. Those need opposite patches, and confusing them takes down
// something the founder explicitly protected.
//
// THREE OUTCOMES, AND ONLY ONE OF THEM IS A GO
// --------------------------------------------
//   route-exclusive  every upstream in the route is stylique-os. The whole route
//                    can be removed. Nothing else loses a backend.
//   upstream-shared  a reverse_proxy lists stylique-os ALONGSIDE a protected
//                    backend. Drop the one upstream entry; the handler keeps
//                    serving from the rest.
//   would-orphan     stylique-os is the ONLY upstream of its handler, but the
//                    route also carries a protected backend in a DIFFERENT
//                    handler. Removing the route would break the protected path;
//                    removing the handler would leave its path with no upstream
//                    at all. REFUSED — this needs a human decision about what
//                    that path should serve, not a mechanical patch.
//
// Anything undetermined — unreadable runtime config, no parser on the host, a
// route we cannot classify — blocks exactly as `would-orphan` does.
//
//   node scripts/ci/assert_route_impact.mjs route-impact.json
//   node scripts/ci/assert_route_impact.mjs --selftest
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import net from 'node:net'
import { pathToFileURL } from 'node:url'

export class RouteImpactError extends Error {}

const HEX64 = /^[0-9a-f]{64}$/

/** Split the probe's space-separated identity strings into a usable set. */
export function identities(s) {
  if (typeof s !== 'string') return []
  return s.split(/\s+/).filter((x) => x.length > 0)
}

/**
 * A real IPv4/IPv6 literal.
 *
 * DELEGATED, NOT HAND-ROLLED. The first version called itself strict and
 * accepted `1:2`, `1:2:3:4:5:6:7:8:9`, `12345::` and `1::2::3` — none of which
 * are addresses. IPv6 has too many rules (group count, exactly one compression,
 * hex width, embedded IPv4) for a regex written in passing to get right, and a
 * validator wrong in the PERMISSIVE direction is worse than none: it launders
 * junk into a matchable identity while reading as a safeguard. node:net's isIP
 * is the platform's own parser.
 */
export function isIp(s) {
  return typeof s === 'string' && net.isIP(s) !== 0
}

/** A plausible container name / network alias. */
export function isName(s) {
  return typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(s)
}

/**
 * Identities that are actually addresses.
 *
 * THE DEFECT THIS CLOSES. `docker inspect` prints the literal "invalid IP" when a
 * container has no current address, and an EXITED container has none. Split on
 * whitespace that became the identities "invalid" and "IP" — so a dial of
 * "IP:4100" would have MATCHED the target by name, and the report stated an
 * address the host does not have. An absent address is absent.
 */
export const ipIdentities = (s) => identities(s).filter(isIp)
export const nameIdentities = (s) => identities(s).filter(isName)

/** A usable TCP port. */
export const isPort = (p) => Number.isInteger(p) && p >= 1 && p <= 65535

/** The port half of a `host:port` dial, or null. */
export function dialPort(dial) {
  if (typeof dial !== 'string' || dial.length === 0) return null
  // A BARE IPv6 literal is all colons and no port: `fd00::5` must not be read as
  // host `fd00:` on port 5. Only a bracketed form carries a port for IPv6.
  if (dial.startsWith('[')) {
    const close = dial.indexOf(']')
    if (close < 0) return null
    const rest = dial.slice(close + 1)
    return /^:\d+$/.test(rest) ? Number(rest.slice(1)) : null
  }
  const i = dial.lastIndexOf(':')
  if (i < 0) return null
  if (dial.indexOf(':') !== i) return null          // more than one colon -> bare IPv6
  const p = dial.slice(i + 1)
  return /^\d+$/.test(p) ? Number(p) : null
}

/** The host half of a `host:port` dial, brackets stripped. */
export function dialHost(dial) {
  if (typeof dial !== 'string' || dial.length === 0) return null
  if (dial.startsWith('[')) {
    const close = dial.indexOf(']')
    return close < 0 ? null : dial.slice(1, close)
  }
  const i = dial.lastIndexOf(':')
  if (i < 0) return dial
  if (dial.indexOf(':') !== i) return dial          // bare IPv6, no port
  return dial.slice(0, i)
}

/**
 * Does this dial reach the target?
 *
 * A dial is `host:port`. The host half is matched against the container name,
 * its network aliases and its IPs. The PORT ALONE IS NEVER SUFFICIENT: two
 * containers can both listen on 4100, and treating the port as proof would
 * misattribute another service's upstream to stylique-os. The port is used only
 * to strengthen a host match that already holds.
 */
/**
 * Does this dial reach the TARGET?
 *
 * SEPARATE FROM dialMatches ON PURPOSE. Target attribution REQUIRES a port, and
 * an absent or malformed one must not silently degrade to host-wide matching —
 * which is what happened when `targetPort` was missing: it became null,
 * dialMatches read null as "no port restriction", and `stylique-os:9999` was
 * classified as the 4100 target again. An unusable port makes the dial
 * UNATTRIBUTABLE (null), which the classifier turns into `undetermined`, not
 * into a patch.
 */
export function dialMatchesTarget(dial, ids, port) {
  if (!isPort(port)) return null
  return dialMatches(dial, ids, port)
}

export function dialMatches(dial, ids, expectPort = null) {
  if (typeof dial !== 'string' || dial.length === 0) return null
  const bare = dialHost(dial)
  if (bare === null) return null
  const hostHit = ids.some((id) => id.length > 0 && (bare === id || bare.startsWith(`${id}.`)))
  if (!hostHit) return false
  // THE PORT IS PART OF THE IDENTITY OF A TARGET UPSTREAM. The comment above
  // claimed the port "strengthens a host match", and the code then ignored it —
  // so `stylique-os:9999` was classified as the 4100 target and would have been
  // proposed for removal. A container can serve several ports and only the one
  // the target actually listens on is this retirement's business.
  //
  // PROTECTED identities stay host-wide (expectPort null) on purpose: any port
  // of a protected backend must survive, so breadth is the safe direction there
  // while it is the unsafe direction for the target.
  if (expectPort === null) return true
  return dialPort(dial) === expectPort
}

/**
 * Classify one route AND each of its handlers.
 *
 * The per-handler classification is carried through to the patch. An earlier
 * revision summarised the route and dropped `handlers`, so the patch builder
 * fell back to the route-wide dial list. With two reverse_proxy handlers each
 * pairing the target with a DIFFERENT protected backend that produced ONE step
 * with a fused keep-list — `[stylique-dashboard:80, postiz:5000]` — aimed at
 * "the handler". Applying it would have cross-wired both. Nothing below may
 * aggregate dials across handlers.
 *
 * Returns null when it cannot be classified.
 */
/**
 * Caddy path-matcher semantics, as much of them as this tool will claim.
 *
 * Only three shapes are modelled: an exact path, a `prefix*` and a `*suffix`.
 * Anything else — internal wildcards, multiple wildcards, regex matchers — is
 * NOT modelled, and callers must treat it as unsupported rather than guessing.
 * Getting this wrong in the permissive direction would let a detach be declared
 * lossless when it silently re-points a public path.
 */
export function pathPatternSupported(pat) {
  return pathPatternRefusal(pat) === null
}

/**
 * WHY A PATTERN IS REFUSED, or null when it is inside the proven subset.
 *
 * RAW STRING ALGEBRA IS UNSOUND ONCE ESCAPES OR EMPTY SEGMENTS ARE IN PLAY, and
 * unsound in the direction that approves a deletion. Caddy matches a configured
 * `/foo/bar` against a request for `/foo%2Fbar`, and a configured `/foo%2Fbar`
 * against that same escaped request — so those two patterns SHARE requests while
 * comparing as different strings. Likewise `/foo` matches `//foo`, but `//foo`
 * matches only `//foo`: one contains the other, and string equality sees neither.
 * A false-disjoint is what lets a fall-through be reported as a clean detach.
 *
 * This tool does not implement Caddy's normalisation. So instead of comparing
 * shapes it cannot reason about, it REFUSES them, and the comparison below runs
 * only on the subset where the unescaped, single-slash, dot-segment-free form is
 * the pattern itself:
 *
 *   %       percent-encoding of any kind, `%*` included — the escaped and
 *           unescaped spellings denote overlapping request sets
 *   //      a repeated slash — `/foo` and `//foo` overlap without matching
 *   . / ..  a dot segment — resolves to a different path than it spells
 *
 * Multiple or interior wildcards are refused for the same reason they always
 * were: the set they denote is not one this model represents.
 */
export function pathPatternRefusal(pat) {
  if (typeof pat !== 'string' || pat.length === 0) return 'it is not a non-empty string'
  if (pat.includes('%')) {
    return 'it contains a percent-escape; Caddy matches escaped and unescaped spellings against '
      + 'overlapping request sets, and this model does not implement that normalisation'
  }
  if (pat.includes('//')) {
    return 'it contains a repeated slash; `/foo` matches `//foo` while `//foo` matches only `//foo`, '
      + 'so the two overlap without comparing equal'
  }
  if (pat.split('/').some((seg) => seg === '.' || seg === '..')) {
    return 'it contains a dot segment, which resolves to a different path than it spells'
  }
  const stars = (pat.match(/\*/g) || []).length
  if (stars === 0) return null
  if (stars > 1) return 'it has more than one wildcard'
  if (!pat.startsWith('*') && !pat.endsWith('*')) return 'its wildcard is interior'
  return null
}

export function pathMatcherMatches(pat, path) {
  if (!pathPatternSupported(pat)) return null
  // CASE-INSENSITIVE, per Caddy: path matches are exact but case-insensitive.
  const p = pat.toLowerCase()
  const q = String(path).toLowerCase()
  if (!p.includes('*')) return q === p
  if (p.endsWith('*')) return q.startsWith(p.slice(0, -1))
  return q.endsWith(p.slice(1))
}

/**
 * A pattern as a SET of request paths, which is the only form the questions
 * below can be answered in.
 */
export function parsePattern(pat) {
  if (!pathPatternSupported(pat)) return null
  // LOWERCASED, because Caddy's path matcher is case-insensitive. The RAW value
  // is carried for reporting and is what sibling fingerprints cover: re-casing a
  // path is an edit to the config even though it is not a change in routing.
  const lower = pat.toLowerCase()
  if (lower === '*') return { kind: 'all', raw: pat }
  if (!lower.includes('*')) return { kind: 'exact', v: lower, raw: pat }
  if (lower.endsWith('*')) return { kind: 'prefix', v: lower.slice(0, -1), raw: pat }
  return { kind: 'suffix', v: lower.slice(1), raw: pat }
}

/**
 * DO THESE TWO PATTERNS SHARE ANY REQUEST AT ALL?
 *
 * THE DEFECT THIS REPLACES. The previous revision synthesised ONE representative
 * path per removed matcher — `/os/*` became `/os/probe` — and asked which
 * sibling served it. That is sampling, and a sample cannot establish a universal
 * claim. With a later sibling matching `/os/admin/*`, the sample missed it
 * entirely: `/os/probe` matched nothing, the removal was declared isolated, and
 * every `/os/admin/…` URL in the retired set would have quietly reached that
 * sibling's backend. One path cannot prove non-overlap of two sets.
 *
 * So overlap is decided in the matcher language instead. `prefix*` and `*suffix`
 * always share a request — `prefix + suffix` is a witness — which is why this
 * returns true there rather than guessing.
 */
/**
 * PATH CASE IS SETTLED, AND FOLDED BEFORE COMPARISON.
 *
 * Caddy's path matcher is exact but CASE-INSENSITIVE. An earlier revision here
 * reported a case-only difference as undecidable, on the grounds that the
 * semantics had not been established. They have: `/os/*` and `/OS/admin`
 * overlap, and the authoritative answer is true, not a refusal. parsePattern
 * lowercases, so everything below compares folded values.
 *
 * Case is the only normalisation performed. Every other shape whose escaped or
 * cleaned form differs from its spelling — percent-escapes, repeated slashes,
 * dot segments — is refused by pathPatternRefusal before reaching here, because
 * this model does not implement Caddy's normalisation and guessing at it is the
 * unsafe direction.
 */
export function patternsIntersect(a, b) {
  if (!a || !b) return null
  if (a.kind === 'all' || b.kind === 'all') return true
  const pair = (x, y) => a.kind === x && b.kind === y
  if (pair('exact', 'exact')) return a.v === b.v
  if (pair('exact', 'prefix')) return a.v.startsWith(b.v)
  if (pair('prefix', 'exact')) return b.v.startsWith(a.v)
  if (pair('exact', 'suffix')) return a.v.endsWith(b.v)
  if (pair('suffix', 'exact')) return b.v.endsWith(a.v)
  if (pair('prefix', 'prefix')) return a.v.startsWith(b.v) || b.v.startsWith(a.v)
  if (pair('suffix', 'suffix')) return a.v.endsWith(b.v) || b.v.endsWith(a.v)
  // prefix vs suffix: `a.v + b.v` starts with one and ends with the other.
  return true
}

/** Does EVERY request matching `b` also match `a`? */
export function patternCovers(a, b) {
  if (!a || !b) return null
  if (a.kind === 'all') return true
  if (b.kind === 'all') return false
  if (a.kind === 'exact') return b.kind === 'exact' && a.v === b.v
  if (a.kind === 'prefix') {
    if (b.kind === 'exact') return b.v.startsWith(a.v)
    if (b.kind === 'prefix') return b.v.startsWith(a.v)
    return false // every string ending in s starts with p only when p is empty
  }
  if (b.kind === 'exact') return b.v.endsWith(a.v)
  if (b.kind === 'suffix') return b.v.endsWith(a.v)
  return false
}

/**
 * HANDLERS THAT PROVABLY END THE REQUEST.
 *
 * THE SECOND DEFECT THIS REPLACES. A sibling with no upstreams was read as
 * absorbing the request — "it matches, it proxies nowhere, nothing is exposed".
 * That is false for MIDDLEWARE. `headers` and `encode` decorate the request and
 * then CALL THE NEXT HANDLER, so a `/os/*` route holding only `headers` does not
 * stop anything: evaluation continues to the next matching sibling, and the
 * dashboard behind `/*` is reached exactly as if the middleware route were not
 * there. The old model reported that config as isolated.
 *
 * Only `static_response` is provable from a handler TYPE alone. `file_server`
 * calls the next handler when `pass_thru` is set, and the extractor emits types,
 * not per-handler options — so it is not on this list. Anything else, including
 * `subroute` and every third-party plugin, is unprovable and must fail closed.
 */
export const RESPONSE_ORIGINATING = ['static_response']

/**
 * Does evaluation of the sibling list STOP here?
 *
 * Two independent ways, and either is sufficient:
 *   terminal: true          Caddy stops evaluating sibling routes after this one
 *                           regardless of what its handlers do.
 *   a response originator   the handler answers instead of calling next.
 *
 * A sibling that reaches a backend never gets here — that is an exposure, and it
 * is decided before this is asked.
 */
export function stopsEvaluation(sib) {
  if (sib.terminal === true) return true
  const types = [...(sib.handlerTypes ?? [])]
  return types.some((t) => RESPONSE_ORIGINATING.includes(t))
}

/**
 * A host matcher as a set. Exact names, and `*.suffix` — where Caddy's `*`
 * stands for exactly ONE label. Anything else is unrepresentable here.
 */
export function parseHostPattern(h) {
  if (typeof h !== 'string' || h.length === 0) return null
  const stars = (h.match(/\*/g) || []).length
  // LOWERCASED, BECAUSE HOSTNAMES ARE. Caddy's host matcher is case-insensitive,
  // as DNS is. Comparing the raw strings made `EXAMPLE.com` and `example.com`
  // look DISJOINT, and a false-disjoint is the direction that approves a
  // fall-through: two routes that both serve the same site read as unrelated,
  // so deleting one is reported as touching nothing the other serves.
  //
  // The RAW value is still what sibling fingerprints cover. Normalising is about
  // what a request matches; a fingerprint answers "is this the same route object
  // I audited", and re-casing a hostname IS an edit to the config even though it
  // is not a change in routing.
  const lower = h.toLowerCase()
  if (stars === 0) return { kind: 'exact', v: lower, raw: h }
  if (stars === 1 && lower.startsWith('*.') && lower.length > 2 && !lower.slice(2).includes('*')) {
    return { kind: 'label', v: lower.slice(2), raw: h }
  }
  return null
}

/**
 * Is `name` exactly one label beneath `suffix`?
 *
 * EXPORTED so its case-insensitivity is provable on its own. parseHostPattern
 * normalises before calling it, so through that path this lowercase is
 * unreachable — a mutation of it fails nothing, and a guard no test can reach
 * is a guard that silently rots. It is kept because this is a general host
 * predicate that must not become case-sensitive if a future caller hands it a
 * raw value, and it is tested directly rather than assumed.
 */
export const oneLabelUnder = (nameIn, suffixIn) => {
  const name = String(nameIn).toLowerCase()
  const suffix = String(suffixIn).toLowerCase()
  if (!name.endsWith(`.${suffix}`)) return false
  const label = name.slice(0, -(suffix.length + 1))
  return label.length > 0 && !label.includes('.')
}

/** null means "cannot be decided", which callers must treat as a refusal. */
export function hostPatternsIntersect(a, b) {
  if (!a || !b) return null
  if (a.kind === 'exact' && b.kind === 'exact') return a.v === b.v
  if (a.kind === 'exact' && b.kind === 'label') return oneLabelUnder(a.v, b.v)
  if (a.kind === 'label' && b.kind === 'exact') return oneLabelUnder(b.v, a.v)
  // `*.a.com` against `*.b.com`: deciding this needs label arithmetic this model
  // does not do, and guessing "disjoint" is the direction that false-passes.
  return a.v === b.v ? true : null
}

export function hostPatternCovers(a, b) {
  if (!a || !b) return null
  if (a.kind === 'exact') return b.kind === 'exact' && a.v === b.v
  if (b.kind === 'exact') return oneLabelUnder(b.v, a.v)
  return a.v === b.v
}

/**
 * ONE MATCHER OBJECT = A CONJUNCTION. A `match` ARRAY = A DISJUNCTION OF THEM.
 *
 * THE DEFECT THIS EXISTS FOR. The extractor used to flatten every host value and
 * every path value of a route into two independent lists, and the algebra ran
 * over those. For
 *
 *     match: [{host:[A], path:[/x]}, {host:[B], path:[/y]}]
 *
 * that produced hosts=[A,B] × paths=[/x,/y] — a four-way cross-product, half of
 * which the config never expressed. An overlap test against it can report a
 * collision on A + /y, which is not a request this route ever serves, and can
 * equally miss the structure that matters. Sets are compared INTACT here.
 *
 * An absent key means "any": `{path:[/x]}` matches /x on every hostname.
 * `null` is returned whenever a decision cannot be made, and every caller
 * refuses on null.
 */
export function parseMatchSet(m) {
  if (!m || typeof m !== 'object') return { bad: 'a matcher set is not an object' }
  if ((m.unsupportedKeys ?? []).length > 0) {
    return { bad: `matcher set uses ${[...m.unsupportedKeys].join(', ')}, which this model does not represent` }
  }
  const hosts = []
  for (const h of m.host ?? []) {
    const q = parseHostPattern(h)
    if (!q) return { bad: `host matcher ${JSON.stringify(h)} is a shape this model does not represent` }
    hosts.push(q)
  }
  const paths = []
  for (const p of m.path ?? []) {
    const q = parsePattern(p)
    if (!q) {
      return { bad: `path matcher ${JSON.stringify(p)} is a shape this model does not represent: ${pathPatternRefusal(p)}` }
    }
    paths.push(q)
  }
  return { ok: { hosts, paths, text: matchSetText(m) } }
}

export const matchSetText = (m) => {
  const h = (m.host ?? []).length ? (m.host ?? []).join('|') : '*'
  const p = (m.path ?? []).length ? (m.path ?? []).join('|') : '*'
  return `{host ${h}, path ${p}}`
}

/** Any-vs-any dimension helper: an empty list means "every value". */
function dimIntersect(as, bs, f) {
  if (as.length === 0 || bs.length === 0) return true
  let sawNull = false
  for (const a of as) {
    for (const b of bs) {
      const r = f(a, b)
      if (r === true) return true
      if (r === null) sawNull = true
    }
  }
  return sawNull ? null : false
}

function dimCovers(as, bs, f) {
  if (as.length === 0) return true          // a matches every value
  if (bs.length === 0) return false         // b matches every value, a does not
  let sawNull = false
  for (const b of bs) {
    let covered = false
    for (const a of as) {
      const r = f(a, b)
      if (r === true) { covered = true; break }
      if (r === null) sawNull = true
    }
    if (!covered) return sawNull ? null : false
  }
  return true
}

export function matchSetsIntersect(a, b) {
  const h = dimIntersect(a.hosts, b.hosts, hostPatternsIntersect)
  if (h !== true) return h
  return dimIntersect(a.paths, b.paths, patternsIntersect)
}

export function matchSetCovers(a, b) {
  const h = dimCovers(a.hosts, b.hosts, hostPatternCovers)
  if (h !== true) return h
  return dimCovers(a.paths, b.paths, patternCovers)
}

/**
 * The ordered sibling routes sharing one parent `routes` array, with what each
 * one reaches and whether it stops evaluation.
 */
export function siblingModel(handlers, parentRoutesArrayPath) {
  const byIndex = new Map()
  // EVERY REPORTED COUNT, NOT THE LAST ONE. This was `declaredCount = c.…`,
  // so when two handlers under the same parent array reported different
  // lengths, whichever happened to be visited last silently won. Disagreement
  // means the evidence is internally inconsistent — a truncated artifact, a
  // config read mid-reload, an extractor bug — and picking a winner turns that
  // into a confident number the completeness check then validates against.
  const declaredCounts = new Set()
  for (const h of handlers) {
    const chain = h.matcherChain ?? []
    const at = chain.findIndex((x) => x?.parentRoutesArrayPath === parentRoutesArrayPath)
    if (at < 0) continue
    const c = chain[at]
    if (!Number.isInteger(c.routeIndexInParent)) continue
    if (Number.isInteger(c.parentRoutesCount)) declaredCounts.add(c.parentRoutesCount)
    // THE SHARED CONJUNCTION ABOVE THIS LEVEL. Two sibling routes are comparable
    // only under identical ancestry; this is what proves that, and it is built
    // from the ancestors' own structured matcher sets, never the flattened view.
    const ancestorKey = JSON.stringify(chain.slice(0, at).map((x) => ({
      routePath: x?.routePath ?? null, matchSets: x?.matchSets ?? null, terminal: x?.terminal ?? null,
    })))
    const e = byIndex.get(c.routeIndexInParent) ?? {
      index: c.routeIndexInParent, routePath: c.routePath,
      // STRUCTURED SETS ARE THE AUTHORITY. `pathMatchers`/`hostMatchers` are the
      // flattened projection and exist for display and fingerprints only — the
      // set algebra must never read them, because flattening invents matcher
      // combinations the config never expressed.
      matchSets: Array.isArray(c.matchSets) ? c.matchSets : null,
      pathMatchers: c.path ?? [], hostMatchers: c.host ?? [],
      terminal: c.terminal === true, hasGroup: c.hasGroup === true,
      ancestorKey,
      handlerTypes: new Set(c.handlerTypes ?? []),
      reachesTarget: false, reachesOther: false, otherDials: [],
    }
    if ((h.targetUpstreams?.length ?? 0) > 0) e.reachesTarget = true
    for (const u of h.keepUpstreams ?? []) { e.reachesOther = true; e.otherDials.push(u.dial) }
    for (const t of c.handlerTypes ?? []) e.handlerTypes.add(t)
    byIndex.set(c.routeIndexInParent, e)
  }
  const siblings = [...byIndex.values()].sort((a, b) => a.index - b.index)
  siblings.declaredCounts = [...declaredCounts].sort((a, b) => a - b)
  siblings.declaredCount = declaredCounts.size === 1 ? [...declaredCounts][0] : null
  return siblings
}

/**
 * A sibling's structural identity, so "the route at index 2" can be re-proved
 * to be the SAME route at apply time.
 *
 * Indices are positional. Any concurrent edit to the parent array — a route
 * added, a route removed, two reordered — re-points every index after it, and a
 * deletion aimed at index 2 would then remove a route nobody audited. The
 * fingerprint is what a later apply step compares against; without it the plan
 * is only as good as the assumption that nothing moved between reading and
 * writing.
 */
export function siblingFingerprint(s) {
  const canon = JSON.stringify({
    index: s.index,
    routePath: s.routePath,
    // STRUCTURED, NOT FLATTENED. A fingerprint over flattened lists cannot tell
    // {host A, path /x} OR {host B, path /y} apart from the swapped pairing
    // {host A, path /y} OR {host B, path /x} — they flatten identically, and
    // that is a different route.
    matchSets: (s.matchSets ?? null) === null ? null : s.matchSets.map((m) => ({
      host: [...(m.host ?? [])].sort(),
      path: [...(m.path ?? [])].sort(),
      unsupportedKeys: [...(m.unsupportedKeys ?? [])].sort(),
    })),
    terminal: s.terminal === true,
    hasGroup: s.hasGroup === true,
    handlerTypes: [...(s.handlerTypes ?? [])].sort(),
    dials: [...new Set(s.otherDials ?? [])].sort(),
    reachesTarget: s.reachesTarget === true,
  })
  return createHash('sha256').update(canon).digest('hex')
}

/**
 * WHAT SERVES THE REMOVED ROUTE'S PATHS AFTERWARDS.
 *
 * THE DEFECT THIS EXISTS FOR. The nested shape read from the host is `/os/*`
 * (the target) followed by `/*` (the dashboard). Deleting the `/os/*` route does
 * not make `/os/…` stop working — it makes it reach the DASHBOARD. That is not a
 * detach; it silently converts a retired public path into a protected backend's
 * path, and nothing in the previous model would have noticed.
 *
 * EVIDENCE STATUS. Artifact 8677841138 proved the nesting and the path matchers.
 * It did NOT emit `terminal`, `group` or the parent array length — those fields
 * did not exist in the extractor at that head — so no claim here about the live
 * terminality of either route is artifact-backed yet. This code does not need
 * one: absent evidence is refused, not defaulted. `parentRoutesCount` missing is
 * a hard refusal, and terminality is used only in fingerprints and reporting.
 * The values become evidence when a fresh probe at this head emits them.
 *
 * Returns, per MATCHER in the removed set, what happens to every request that
 * matcher served. Not a sample of one — the whole set.
 */
export function fallThroughAfterRemoval(siblings, removedIndex) {
  const removed = siblings.find((sN) => sN.index === removedIndex)
  if (!removed) return { supported: false, reason: 'the removed route is not among its siblings' }

  // GROUPS ARE NOT MODELLED — DELIBERATELY. A route `group` changes which
  // siblings Caddy even considers once a member has matched. The exact rule is a
  // property of Caddy's route compiler, and the previous revision asserted from
  // reasoning alone that a group "never widens what a later route can serve".
  // That may well be true; it was not demonstrated, and an unproven premise
  // underneath a deletion is what this whole gate exists to prevent.
  const grouped = siblings.filter((s) => s.hasGroup === true)
  if (grouped.length > 0) {
    return {
      supported: false,
      // The group NAME is deliberately not reported: the caller needs only its
      // existence to refuse, so the name never leaves the host.
      reason: `sibling route(s) ${grouped.map((s) => s.routePath).join(', ')} belong to a route group; `
        + 'group evaluation order is not modelled here and is not assumed',
    }
  }

  // SIBLINGS MUST SHARE AN ANCESTRY. A handler is reached under the conjunction
  // of every ancestor route's matchers. Comparing two routes at one level is
  // sound only when everything above them is identical — then the shared
  // conjunction cancels on both sides. If the chains differ, the comparison is
  // between conditions that are not comparable.
  const anc = new Set(siblings.map((s) => s.ancestorKey ?? ' missing'))
  if (anc.has(' missing')) {
    return {
      supported: false,
      reason: 'a sibling carries no ancestor matcher context, so the shared conjunction above these routes cannot be established',
    }
  }
  if (anc.size > 1) {
    return {
      supported: false,
      reason: 'the siblings do not share an identical ancestor matcher chain, so their matchers are not directly comparable',
    }
  }

  const parseAll = (s) => {
    const raw = s.matchSets
    // An absent match ARRAY is "every request". An absent FIELD is missing
    // evidence. The two must not be confused.
    if (!Array.isArray(raw)) return { bad: `route ${s.routePath} reports no structured matcher sets` }
    if (raw.length === 0) return { ok: [{ hosts: [], paths: [], text: '{host *, path *}' }] }
    const out = []
    for (const m of raw) {
      const r = parseMatchSet(m)
      if (r.bad) return { bad: `route ${s.routePath}: ${r.bad}` }
      out.push(r.ok)
    }
    return { ok: out }
  }

  const removedSets = parseAll(removed)
  if (removedSets.bad) return { supported: false, reason: removedSets.bad }

  const later = []
  for (const s of siblings) {
    if (s.index <= removedIndex) continue
    const parsed = parseAll(s)
    if (parsed.bad) return { supported: false, reason: parsed.bad }
    later.push({ sib: s, sets: parsed.ok })
  }

  const results = []
  for (const rm of removedSets.ok) {
    let verdict = null
    // ONLY LATER SIBLINGS. Routes are evaluated in array order, so every route
    // BEFORE the removed one behaves exactly as it did — deleting something
    // after it cannot change whether it matches or terminates.
    for (const { sib, sets } of later) {
      const decisions = sets.map((x) => ({ x, r: matchSetsIntersect(rm, x) }))
      if (decisions.some((d) => d.r === null)) {
        verdict = {
          outcome: 'overlap-undecidable', sib, overlap: [],
          detail: `overlap with ${sib.routePath} could not be decided`,
        }
        break
      }
      const overlap = decisions.filter((d) => d.r === true).map((d) => d.x)
      if (overlap.length === 0) continue

      // SOME REQUEST in the removed set reaches this sibling. What it reaches
      // decides the outcome — and reaching a backend decides it immediately,
      // whether the overlap is the whole set or one URL inside it.
      if (sib.reachesTarget) { verdict = { outcome: 'still-reaches-target', sib, overlap }; break }
      if (sib.reachesOther) { verdict = { outcome: 'exposes-backend', sib, overlap }; break }

      // No backend here. Does evaluation STOP, or is this middleware that calls
      // the next handler? Middleware is not absorption.
      if (!stopsEvaluation(sib)) continue

      // It stops — but only for the requests it actually matches. Covering the
      // whole removed set accounts for it; covering part leaves a remainder this
      // matcher language cannot express as one set, which is refused rather than
      // approximated.
      const covers = sets.map((x) => matchSetCovers(x, rm))
      if (covers.some((r) => r === true)) { verdict = { outcome: 'absorbed-terminating', sib, overlap }; break }
      if (covers.some((r) => r === null)) {
        verdict = {
          outcome: 'overlap-undecidable', sib, overlap,
          detail: `coverage by ${sib.routePath} could not be decided`,
        }
        break
      }
      verdict = { outcome: 'partial-absorption-unmodelled', sib, overlap }; break
    }
    results.push({ pattern: rm.text, ...(verdict ?? { outcome: 'unserved', sib: null, overlap: [] }) })
  }
  return { supported: true, results }
}

/**
 * IS THE REMOVAL ACTUALLY A DETACH? — the mandatory post-edit gate.
 *
 * "The nested route reaches only the target" answers who is BEHIND the route. It
 * says nothing about what happens to the route's PATHS once the route is gone,
 * and on this host those are two different answers. `/os/*` (the target) is
 * followed by `/*` (the dashboard) and neither is terminal, so deleting the
 * first does not retire `/os/…` — it hands those requests to a protected
 * backend. The public path survives, pointed somewhere new, and every check
 * that only asks "does stylique-os still receive traffic?" reports success.
 *
 * Four outcomes per path the removed route served:
 *
 *   unserved                  nothing later matches. Caddy answers 404. This is
 *                             the only shape that is a detach on its own.
 *   absorbed-without-upstream a later sibling matches but proxies nowhere — an
 *                             explicit static_response, a file_server. The path
 *                             keeps answering, no backend is newly exposed.
 *   exposes-backend           a later sibling proxies somewhere. REFUSAL: this
 *                             is a routing change wearing a detach's clothes.
 *   still-reaches-target      a later sibling reaches the target anyway, so the
 *                             route was never exclusive. REFUSAL.
 *
 * This function decides NOTHING about what should happen instead. Choosing
 * between an explicit 404/410 and an intentional fallback is a statement about
 * what the product does at a public URL, and encoding either one here would ship
 * a production behaviour nobody asked for.
 */
export function postRemovalRouting(handlers, excl) {
  if (!excl || typeof excl.parentRoutesArrayPath !== 'string' || !Number.isInteger(excl.routeIndexInParent)) {
    return { supported: false, reason: 'the removable route has no addressable parent array and index' }
  }
  const siblings = siblingModel(handlers, excl.parentRoutesArrayPath)
  const fingerprints = siblings.map((s) => ({
    index: s.index, routePath: s.routePath,
    matchSets: s.matchSets,
    matchSetText: (s.matchSets ?? []).map(matchSetText).join(' OR ') || '(no match — every request)',
    hostMatchers: s.hostMatchers, pathMatchers: s.pathMatchers,
    terminal: s.terminal, hasGroup: s.hasGroup === true,
    handlerTypes: [...s.handlerTypes].sort(),
    sha256: siblingFingerprint(s),
  }))
  const base = { siblingFingerprints: fingerprints, parentRoutesArrayPath: excl.parentRoutesArrayPath, removedIndex: excl.routeIndexInParent }

  // A sibling route with no handlers leaves no trace in a model built from
  // handlers. Reasoning about "what matches next" over an incomplete list can
  // only ever be optimistic, so an incomplete list is a refusal.
  const counts = siblings.declaredCounts ?? []
  if (counts.length > 1) {
    return {
      ...base,
      supported: false,
      reason: `handlers under ${excl.parentRoutesArrayPath} report DIFFERENT lengths for that array `
        + `(${counts.join(', ')}); the evidence contradicts itself and no length may be chosen from it`,
    }
  }
  const declared = siblings.declaredCount
  if (!Number.isInteger(declared)) {
    return { ...base, supported: false, reason: 'the probe did not report how many routes the parent array holds, so the sibling list cannot be proven complete' }
  }
  if (siblings.length !== declared) {
    return {
      ...base,
      supported: false,
      reason: `the parent array holds ${declared} routes but only ${siblings.length} could be modelled `
        + '(a sibling with no handlers leaves no trace); what serves the removed paths cannot be established',
    }
  }

  const ft = fallThroughAfterRemoval(siblings, excl.routeIndexInParent)
  if (!ft.supported) return { ...base, supported: false, reason: ft.reason }

  const outcomes = ft.results.map(({ pattern, outcome, sib, overlap }) => ({
    pattern,
    outcome,
    // WHICH REQUESTS. Naming the overlapping matchers is what makes a partial
    // exposure legible: "/os/* falls through" and "/os/admin/* within /os/*
    // falls through" are different findings and need different remedies.
    overlappingMatchers: (overlap ?? []).map((x) => x.text),
    landedRoutePath: sib?.routePath ?? null,
    landedIndex: sib?.index ?? null,
    landedHandlerTypes: sib ? [...sib.handlerTypes].sort() : [],
    landedTerminal: sib ? sib.terminal === true : null,
    exposedDials: sib && outcome === 'exposes-backend' ? [...new Set(sib.otherDials)].sort() : [],
  }))
  const ISOLATING = ['unserved', 'absorbed-terminating']
  const isolated = outcomes.every((o) => ISOLATING.includes(o.outcome))
  return { ...base, supported: true, isolated, outcomes }
}

/**
 * The NESTED ROUTE that may be removed, if one exists.
 *
 * WHY A ROUTE AND NOT A HANDLER. The live configuration is one outer host route
 * whose subroute holds sibling nested routes — stylique-os under `/os/*`,
 * stylique-dashboard under `/*`. Removing the target's UPSTREAM would leave a
 * nested route that still matches `/os/*` and can no longer serve it; removing
 * the outer route would take the dashboard down with it. The correct unit is the
 * nested route object itself: delete it and its siblings are untouched.
 *
 * The unit chosen is the OUTERMOST ancestor whose entire subtree reaches only
 * the target — outermost, because deleting a deeper node would leave an empty
 * wrapper route still matching requests; only-the-target, because an ancestor
 * that also contains a protected backend is not removable at all.
 *
 * Returns null when no such ancestor exists, which is the shared-route case and
 * a refusal, not a smaller patch.
 */
export function targetExclusiveRoute(handlers) {
  const targetHandlers = handlers.filter((h) => (h.targetUpstreams?.length ?? 0) > 0)
  if (targetHandlers.length === 0) return null

  // Every ancestor route path that appears anywhere, with its context.
  const ctxByPath = new Map()
  for (const h of handlers) {
    for (const c of h.matcherChain ?? []) if (c?.routePath) ctxByPath.set(c.routePath, c)
  }
  const chainPaths = (h) => (h.matcherChain ?? []).map((c) => c?.routePath).filter(Boolean)

  // A candidate must (a) be an ancestor of a target handler, (b) contain NO
  // handler that serves anything other than the target.
  const candidates = []
  for (const path of ctxByPath.keys()) {
    const under = handlers.filter((h) => chainPaths(h).includes(path))
    if (under.length === 0) continue
    if (!under.some((h) => (h.targetUpstreams?.length ?? 0) > 0)) continue
    // Every handler beneath it must reach ONLY the target. A handler with no
    // upstreams at all (headers, encode) is inert and does not disqualify.
    const clean = under.every((h) => {
      const ups = h.upstreams?.length ?? 0
      if (ups === 0) return true
      return (h.keepUpstreams?.length ?? 0) === 0
    })
    if (clean) candidates.push(path)
  }
  if (candidates.length === 0) return null

  // Outermost = shortest admin path among the candidates that are ancestors of
  // one another. Paths nest by prefix, so the shortest is the outermost.
  candidates.sort((a, b) => a.length - b.length)
  const chosen = candidates[0]
  const ctx = ctxByPath.get(chosen)
  return {
    routePath: chosen,
    parentRoutesArrayPath: ctx?.parentRoutesArrayPath ?? null,
    routeIndexInParent: ctx?.routeIndexInParent ?? null,
    hostMatchers: ctx?.host ?? [],
    pathMatchers: ctx?.path ?? [],
  }
}

export function classifyRoute(route, targetIds, protectedIds, opts = {}) {
  const { targetPort = null, targetHasIp = true } = opts
  if (route === null || typeof route !== 'object') return null
  if (!Array.isArray(route.handlers)) return null

  const handlers = []
  let unknownDial = false

  for (const h of route.handlers) {
    // The INDEXED array is authoritative. `upstreamDials` is a convenience view
    // and must never be the thing a patch is built from: rebuilding an upstream
    // object from its dial alone discards every other field Caddy allows on it.
    const ups = Array.isArray(h?.upstreams)
      ? h.upstreams
      : (Array.isArray(h?.upstreamDials) ? h.upstreamDials.map((d, i) => ({ index: i, dial: d, extraKeyCount: 0 })) : [])
    const keep = []
    const targets = []
    for (const u of ups) {
      const d = u?.dial
      const t = dialMatchesTarget(d, targetIds, targetPort)
      const p = dialMatches(d, protectedIds)
      if (t === null || p === null || typeof u?.index !== 'number') { unknownDial = true; continue }
      if (t) { targets.push({ index: u.index, dial: d }); continue }
      // UNATTRIBUTABLE, NOT UNAFFECTED. If the target currently has no address —
      // it is exited — then a dial that is a LITERAL IP on the target's port
      // could be its stale address, and nothing here can prove otherwise. Name
      // matching cannot settle it, so the route is undetermined. Calling it
      // unaffected would be a claim the evidence does not support.
      if (!p && !targetHasIp && targetPort !== null
          && isIp(dialHost(d)) && dialPort(d) === targetPort) {
        unknownDial = true
      }
      // Protected OR unrecognised. An unrecognised backend is not the target, so
      // it must survive: stranding something we failed to identify is the same
      // mistake as stranding something we did.
      keep.push({ index: u.index, dial: d, extraKeyCount: u.extraKeyCount ?? 0 })
      void p
    }
    handlers.push({
      handlerPath: typeof h?.handlerPath === 'string' ? h.handlerPath : null,
      position: h?.position ?? null,
      handler: h?.handler ?? null,
      addressable: h?.addressable === true,
      upstreams: ups,
      upstreamDials: ups.map((u) => u?.dial).filter((d) => typeof d === 'string'),
      targetUpstreams: targets,
      keepUpstreams: keep,
      role: targets.length > 0 ? (keep.length > 0 ? 'shared' : 'target-only') : (keep.length > 0 ? 'other-only' : 'no-upstreams'),
      // Carried through, not dropped. The nested-route model is useless if the
      // classifier rebuilds handlers without the ancestor context the extractor
      // went to the trouble of producing.
      ownerRoutePath: typeof h?.ownerRoutePath === 'string' ? h.ownerRoutePath : null,
      nestingDepth: Number.isInteger(h?.nestingDepth) ? h.nestingDepth : null,
      matcherChain: Array.isArray(h?.matcherChain) ? h.matcherChain : [],
      unsupportedMatcherKeys: Array.isArray(h?.unsupportedMatcherKeys) ? h.unsupportedMatcherKeys : [],
    })
  }

  const base = {
    server: route.server, routeIndex: route.routeIndex,
    routePath: typeof route.routePath === 'string' ? route.routePath : null,
    hostMatchers: route.hostMatchers ?? [], pathMatchers: route.pathMatchers ?? [],
    handlerOrder: route.handlerOrder ?? [],
    upstreamDials: route.upstreamDials ?? [],
    handlers,
  }

  // A matcher shape this model does not represent changes WHICH REQUESTS a
  // route serves. Describing such a route would be a claim the evidence does
  // not support, so it refuses before any patch is considered.
  const unsupported = [...new Set(handlers.flatMap((h) => h.unsupportedMatcherKeys ?? []))]
  if (unsupported.length > 0) {
    return { ...base, verdict: 'undetermined', reason: `a route uses matcher shapes this model does not represent (${unsupported.join(', ')})` }
  }

  const impactedHandlers = handlers.filter((h) => h.role === 'shared' || h.role === 'target-only')
  const otherHandlers = handlers.filter((h) => h.role === 'other-only')

  if (unknownDial) return { ...base, verdict: 'undetermined', reason: 'a dial could not be parsed' }
  if (impactedHandlers.length === 0) return { ...base, verdict: 'unaffected', reason: 'no upstream reaches the target' }

  // An impacted handler we cannot name cannot be patched. Emitting a step for a
  // path we guessed at is worse than emitting nothing.
  const unaddressable = impactedHandlers.filter((h) => !h.addressable || !h.handlerPath)
  if (unaddressable.length > 0) {
    return { ...base, verdict: 'undetermined', reason: 'an impacted handler has no unambiguous configuration path (unrecognised nesting)' }
  }
  if (base.routePath === null) {
    return { ...base, verdict: 'undetermined', reason: 'the route has no configuration path' }
  }

  const targetOnly = impactedHandlers.filter((h) => h.role === 'target-only')
  if (targetOnly.length > 0 && (otherHandlers.length > 0 || impactedHandlers.some((h) => h.role === 'shared'))) {
    // BEFORE refusing: is there a NESTED ROUTE whose whole subtree is the
    // target's? If so the remedy is to remove that route, and the route as a
    // whole is not orphaned at all — its siblings keep serving.
    const excl = targetExclusiveRoute(handlers)
    if (excl !== null && excl.parentRoutesArrayPath !== null && Number.isInteger(excl.routeIndexInParent)
        && excl.routePath !== base.routePath) {
      return {
        ...base, verdict: 'nested-route-exclusive', exclusiveRoute: excl,
        // WHO IS BEHIND THE ROUTE and WHAT SERVES ITS PATHS AFTERWARDS are
        // separate questions. Answering only the first is how a fall-through
        // gets shipped as a detach.
        postRemoval: postRemovalRouting(handlers, excl),
        reason: `the target is reached only through nested route ${excl.routePath}`
          + `${excl.pathMatchers.length ? ` (path ${excl.pathMatchers.join(', ')})` : ''}`
          // NOT "so it is safe to remove". This verdict answers who is BEHIND
          // the route; whether removing it detaches anything is decided by the
          // post-removal analysis, which on this host says the opposite.
          + '. That identifies the removable unit — it does NOT establish that removing it is a detach; '
          + 'see the post-removal routing analysis',
      }
    }
    return { ...base, verdict: 'would-orphan', reason: 'the target is the sole upstream of a handler while the route also serves other backends, and no nested route is exclusively the target\'s' }
  }
  if (impactedHandlers.every((h) => h.role === 'shared')) {
    return { ...base, verdict: 'upstream-shared', reason: 'the target shares every impacted handler with other backends; drop only its upstream entries' }
  }
  return { ...base, verdict: 'route-exclusive', reason: 'every upstream in this route reaches only the target' }
}

/** Split "dev:inode:size:mtime:sha256" into parts, or null. */
export function fileId(v) {
  if (typeof v !== 'string' || v === 'absent' || v.length === 0) return null
  const p = v.split(':')
  if (p.length !== 5) return null
  return { dev: p[0], inode: p[1], size: p[2], mtime: p[3], sha256: p[4] }
}

/**
 * WHY do the host path and the container disagree? Naming the cause is the
 * point — each cause needs a DIFFERENT remedy, and "they differ" needs none of
 * them safely.
 *
 *   stale-file-bind   a FILE bind is pinned to an inode at container start. An
 *                     atomic host replace (write-temp + rename — what every
 *                     sane editor does) leaves the container reading the OLD
 *                     inode while the host path names a NEW one. Editing the
 *                     host file then changes nothing Caddy can see, and a
 *                     reload will not help: the bind must be re-established,
 *                     which means recreating the container.
 *   mount-layering    something is mounted over the target; the host path is
 *                     simply not the file in play.
 *   container-write   the container's own view differs from the host's view of
 *                     the container root — something writes inside.
 *
 * This function REPORTS. It does not choose a remedy: the audit was explicit
 * that a conclusion may not be encoded before the probe proves it.
 */
export function divergenceCause(a) {
  const host = fileId(a.fileIdHostSource)
  const proc = fileId(a.fileIdProcRoot)
  const ctr = fileId(a.fileIdContainer)

  if (host === null || proc === null) {
    return { cause: 'undetermined', detail: 'one of the three file views could not be stat-ed' }
  }
  // ORDER MATTERS. Checking host-vs-proc first and returning `consistent` on a
  // match hides a container-side write entirely: the host and the host's view of
  // the container root can agree perfectly while the container's OWN view has
  // been overwritten. All three views must agree before anything is consistent.
  if (ctr !== null && proc.sha256 !== ctr.sha256) {
    return {
      cause: 'container-write',
      detail: `the container's own view (${ctr.sha256.slice(0, 12)}) differs from the host's view of `
        + `the container root (${proc.sha256.slice(0, 12)}) — something writes inside the container`,
    }
  }
  if (host.sha256 === proc.sha256) {
    return { cause: 'consistent', detail: 'all available views of the boot file agree' }
  }
  const layered = typeof a.mountinfoRelevant === 'string'
    && a.mountinfoRelevant.split(';').filter((x) => x.trim().length > 0).length > 1
  if (layered) {
    return {
      cause: 'mount-layering',
      detail: `more than one mount covers ${a.caddyDiskConfigPath}; the host bind source is not the file in play`,
    }
  }
  if (host.inode !== proc.inode) {
    return {
      cause: 'stale-file-bind',
      detail: `the bind is pinned to inode ${proc.inode} but the host path now names inode ${host.inode} — `
        + 'the host file was replaced atomically after the container started, so the container still reads '
        + 'the original inode. A host-file edit is invisible to Caddy and a reload cannot rebind it.',
    }
  }
  return { cause: 'undetermined', detail: 'contents differ but inode, layering and container-write are all ruled out' }
}

/**
 * The closed set of parser outcomes the probe may report.
 *
 * A category, never parser output: stderr from a config parser can contain
 * configuration text, so the probe emits one of these four words and nothing
 * else. `program_failed` is the case that produced two wasted runs — the
 * extractor never executed, and the only signal was a generic `parsed=false`
 * indistinguishable from an unreadable config.
 */
export const PARSER_STATUSES = ['ok', 'data_invalid', 'program_failed', 'unavailable']

/**
 * The post-edit routing verdict, as refusals.
 *
 * Separate from the "no patch builder for this shape yet" blocker on purpose:
 * that one goes away the day the nested-route deletion patch exists, and this
 * one must not go with it. A lossless detach has to be proven every time, not
 * once while the remedy happened to be unimplemented.
 *
 * The owner-visible choice is NAMED and left open. There are exactly two
 * coherent answers and they are product decisions, not derivations:
 *   (a) the path is retired — replace the route with an explicit terminal
 *       static_response (404 or 410), which makes the detach real and visible;
 *   (b) the fallback is wanted — say so, and the route is removed knowing that
 *       the named backend now serves that path.
 */
export function postRemovalBlockers(c) {
  const at = `route ${c.server}#${c.routeIndex}`
  const pr = c.postRemoval
  if (!pr || typeof pr !== 'object') {
    return [`${at}: post-removal routing was never analysed — a removal cannot be called a detach without it`]
  }
  if (pr.supported !== true) {
    return [`${at}: post-removal routing could not be modelled (${pr.reason ?? 'no reason reported'}) — `
      + 'without it there is no evidence the removed paths stop reaching a backend']
  }
  const REFUSING = ['exposes-backend', 'still-reaches-target', 'partial-absorption-unmodelled']
  const bad = pr.outcomes.filter((o) => REFUSING.includes(o.outcome))
  const unit = `nested route ${c.exclusiveRoute.routePath} (index ${c.exclusiveRoute.routeIndexInParent} `
    + `of ${c.exclusiveRoute.parentRoutesArrayPath})`
  // Which requests, in matcher terms. A partial overlap is the case the previous
  // sampling model missed entirely, so naming the overlapping matcher rather
  // than "a path" is the whole point.
  const which = (o) => (o.overlappingMatchers.length
    ? `requests matching ${o.pattern} that also match ${o.overlappingMatchers.join(' or ')}`
    : `requests matching ${o.pattern}`)
  return bad.map((o) => {
    if (o.outcome === 'still-reaches-target') {
      return `${at}: removing ${unit} does NOT stop ${which(o)} reaching the target — `
        + `they would fall through to sibling route ${o.landedRoutePath} (index ${o.landedIndex}), which reaches the target too; `
        + 'the route was therefore never exclusively the target\'s and this analysis contradicts the verdict'
    }
    if (o.outcome === 'partial-absorption-unmodelled') {
      return `${at}: removing ${unit} leaves ${o.pattern} only PARTLY accounted for. `
        + `Sibling route ${o.landedRoutePath} (index ${o.landedIndex}) stops evaluation for `
        + `${o.overlappingMatchers.join(' or ')}, which overlaps ${o.pattern} without covering it. `
        + 'The remainder is a set this matcher language cannot express as one pattern, so what serves it '
        + 'is not established. REFUSED rather than approximated.'
    }
    return `${at}: removing ${unit} is NOT a lossless detach. `
      + `${which(o)} would FALL THROUGH to sibling route ${o.landedRoutePath} (index ${o.landedIndex}, `
      + `handlers ${o.landedHandlerTypes.join('+') || 'none'}, terminal ${String(o.landedTerminal)}) `
      + `and newly reach ${o.exposedDials.join(', ')}. `
      + 'Those retired public URLs would keep answering, served by a protected backend. '
      + 'OWNER DECISION REQUIRED, and this tool will not make it: '
      + `(a) RETIRE them — replace route ${c.exclusiveRoute.routePath} with an explicit terminal `
      + 'static_response (404 or 410) instead of deleting it, so those paths stop resolving to anything; or '
      + `(b) DECLARE the fallback intentional — accept that ${o.exposedDials.join(', ')} serves them from now on. `
      + 'Neither is encoded here.'
  })
}

export function decide(a) {
  const blockers = []
  if (a === null || typeof a !== 'object') throw new RouteImpactError('probe output is not a JSON object')

  if (a.caddyRuntimeReadable !== true) blockers.push('the runtime Caddy configuration could not be read')
  if (a.parserAvailable !== true) blockers.push('no JSON parser on the host — the route structure is unavailable')
  // The category is validated before it is trusted: an unknown value is itself a
  // refusal, so a probe that grows a fifth outcome cannot be read as a pass.
  const ps = a.parserStatus
  // MANDATORY EVIDENCE, NOT OPTIONAL METADATA. This read
  // `ps !== undefined && !PARSER_STATUSES.includes(ps)`, so a probe that omitted
  // the field entirely skipped the closed enum and was treated as fine. A status
  // that is absent is not a status: an older probe, a truncated artifact and a
  // crashed extractor all present as "no field", and none of them is evidence
  // that the parser ran.
  if (!PARSER_STATUSES.includes(ps)) {
    blockers.push(
      `the probe did not report a valid parser status (got ${JSON.stringify(ps)}); `
      + `it must be one of ${PARSER_STATUSES.join(', ')}`,
    )
  } else if (ps === 'program_failed') {
    blockers.push('the route extractor FAILED TO RUN (parser_status=program_failed) — this is a probe defect, not a host finding; no conclusion about routing may be drawn from this run')
  } else if (ps === 'unavailable') {
    blockers.push('no parser was available on the host (parser_status=unavailable) — route structure was never attempted')
  } else if (ps === 'data_invalid') {
    blockers.push('the runtime configuration could not be read as routes (parser_status=data_invalid)')
  }
  if (a.parsed !== true) blockers.push('the runtime configuration could not be parsed into routes')
  if (typeof a.caddyRuntimeConfigSha256 !== 'string' || !HEX64.test(a.caddyRuntimeConfigSha256)) {
    blockers.push('the runtime configuration hash is missing or malformed')
  }

  const targetIds = [a.target, ...nameIdentities(a.targetAliases), ...ipIdentities(a.targetIps)].filter(Boolean)
  const protectedIds = nameIdentities(a.protectedIdentities)
  // targetPort is USED, not merely reported: it is what makes an unrecognised
  // literal-IP dial undetermined when the target has no address of its own.
  const targetHasIp = ipIdentities(a.targetIps).length > 0
  // A malformed port is a refusal, never a licence to match host-wide.
  const targetPort = a.targetPort
  if (!isPort(targetPort)) {
    blockers.push(
      `the probe did not report a usable target port (got ${JSON.stringify(targetPort)}); `
      + 'without it no upstream can be attributed to the target, and matching by host alone '
      + 'would propose deleting every port the container serves',
    )
  }

  const routes = Array.isArray(a.routes) ? a.routes : []
  const classified = routes.map((r) => classifyRoute(r, targetIds, protectedIds, { targetPort, targetHasIp }))
  if (classified.some((c) => c === null)) blockers.push('a route could not be classified')

  const impacted = classified.filter((c) => c && c.verdict !== 'unaffected')
  for (const c of impacted) {
    if (c.verdict === 'undetermined') blockers.push(`route ${c.server}#${c.routeIndex}: ${c.reason}`)
    if (c.verdict === 'would-orphan') blockers.push(`route ${c.server}#${c.routeIndex}: ${c.reason}`)
    // IDENTIFIED, NOT YET PATCHABLE. The nested route that reaches only the
    // target is now named exactly, but the patch builder below emits UPSTREAM
    // deletions — which for this shape would empty a handler and leave a route
    // matching requests it can no longer serve. Removing a nested route object
    // from its parent's `routes` array is a different edit, with different
    // preconditions (sibling route fingerprints, descending index deletion), and
    // it is not built yet. Naming the unit is progress; pretending the existing
    // patch fits it would not be.
    // THE UNIT IS THE ROUTE OBJECT. Deleting the target's upstream entry would
    // leave a route still matching its path with nothing behind it; deleting the
    // outer route would take its siblings down. A candidate is drafted only when
    // the post-edit simulation proves BOTH that the target becomes unreachable
    // and that no path it served starts reaching something else.
    if (c.verdict === 'nested-route-exclusive') {
      blockers.push(...postRemovalBlockers(c))
      const sim = simulateNestedRemoval(c, classified.filter(Boolean))
      c.simulation = sim
      // THE ROUTING BEING RIGHT IS NOT THE EDIT BEING PROVEN. The simulation
      // reasons about the adapted JSON; the thing that gets edited is the
      // Caddyfile, and nothing here maps a JSON pointer back to a source
      // directive. Without an adapt+validate equivalence proof the durable
      // change is undemonstrated, however clean the routing analysis is.
      const adapt = adaptEquivalence(a, [c.exclusiveRoute.routePath])
      c.adaptEquivalence = adapt
      if (!adapt.ok) {
        blockers.push(
          `route ${c.server}#${c.routeIndex}: the durable edit is UNPROVEN — ${adapt.reason}. `
          + `The runtime path ${c.exclusiveRoute.routePath} is what the adapter PRODUCED from the Caddyfile; `
          + 'it does not identify the source directive to change. Required: build the candidate from the real '
          + 'boot file, caddy adapt both, caddy validate the candidate, and prove the adapted JSON diff is '
          + `exactly [${c.exclusiveRoute.routePath}] — with a byte-exact backup of the pre-edit file.`,
        )
      }
      for (const r of sim.reasons) {
        // The fall-through reasons are already reported, in more detail, by
        // postRemovalBlockers. Do not say the same thing twice.
        if (/post-removal routing|newly reach another backend/.test(r)) continue
        blockers.push(`route ${c.server}#${c.routeIndex}: ${r}`)
      }
    }
  }
  // An unproven durable location blocks the whole patch. A remedy that cannot
  // be made durable would be reverted by the next container restart, silently
  // restoring a route to a stopped container.
  const dres = durableResolution(a)
  if (!dres.ok) blockers.push(`durable edit location unproven: ${dres.reason}`)

  // Naming the cause never authorises anything — it makes the refusal
  // actionable. Only `consistent` is compatible with a patch at all.
  const div = divergenceCause(a)
  if (div.cause !== 'consistent') {
    blockers.push(`host/container file divergence [${div.cause}]: ${div.detail}`)
  }

  // ZERO PARSED ROUTES IS NOT "NO ROUTES". Report the shape so an unfamiliar
  // config is diagnosable rather than silently empty.
  const shape = a.configKeyPaths ?? null
  if (a.parsed === true && Array.isArray(a.routes) && a.routes.length === 0) {
    blockers.push('the configuration parsed but yielded zero routes — that is an unrecognised shape, '
      + 'not evidence that nothing is routed; the pre-stop audit already proved an upstream exists')
  }

  if (blockers.length === 0 && impacted.length === 0) {
    blockers.push('no route reaches the target, yet the pre-stop audit said one does — the two probes disagree and that must be resolved before either is trusted')
  }

  return {
    // Reported so the run explains itself: a probe defect must never read as a
    // host finding, and "(not reported)" is itself information about the probe.
    parserStatus: a.parserStatus ?? null,
    runtimeSha256: a.caddyRuntimeConfigSha256 ?? null,
    diskConfigPath: a.caddyDiskConfigPath ?? null,
    diskConfigSha256: a.caddyDiskConfigSha256 ?? null,
    diskIsBootSource: a.caddyDiskConfigIsBootSource ?? null,
    mountRoot: a.caddyBootMountRoot ?? null,
    mountDest: a.caddyBootMountDest ?? null,
    mountType: a.caddyBootMountType ?? null,
    hostBootFile: dres.hostFile,
    hostBootFileSha256: a.caddyBootFileSha256 ?? null,
    divergence: div,
    configShape: shape,
    caddyArgv: a.caddyArgv ?? null,
    caddyEnvKeys: a.caddyEnvKeys ?? null,
    classified, impacted,
    patch: blockers.length === 0 ? candidatePatch(a, impacted, classified.filter(Boolean)) : null,
    patchable: blockers.length === 0,
    blockers,
  }
}

/**
 * SIMULATE THE EDIT, THEN ASK THE ORIGINAL QUESTION AGAIN.
 *
 * A patch is not proven by the reasoning that produced it. This re-derives the
 * two facts that actually matter FROM THE POST-EDIT WORLD:
 *
 *   1. is the target still reachable?  Removing one route detaches nothing if
 *      another route, or a handler elsewhere in the same route, still dials it.
 *   2. does any path the removed route served now reach something else?  That
 *      is `postRemoval`, above.
 *
 * Both must hold. Either one alone has a failure mode that looks like success:
 * (1) alone passes a config where `/os/*` now serves the dashboard, and (2)
 * alone passes a config where a second route still proxies to stylique-os.
 */
export function simulateNestedRemoval(c, allClassified) {
  const pr = c.postRemoval
  const removedPath = c.exclusiveRoute?.routePath ?? null
  const reasons = []

  // Another ROUTE still dialling the target.
  const stillReaching = (allClassified ?? [])
    .filter((x) => x && x !== c && (x.handlers ?? []).some((h) => (h.targetUpstreams?.length ?? 0) > 0))
    .map((x) => `${x.server}#${x.routeIndex}`)
  // A handler in THIS route that dials the target from outside the removed
  // subtree. The exclusivity test proved the subtree reaches only the target; it
  // never proved the target is reached only from that subtree.
  const outside = (c.handlers ?? [])
    .filter((h) => (h.targetUpstreams?.length ?? 0) > 0
      && !(h.matcherChain ?? []).some((x) => x?.routePath === removedPath))
    .map((h) => h.handlerPath)

  if (stillReaching.length > 0) {
    reasons.push(`the target is still reached by route${stillReaching.length > 1 ? 's' : ''} `
      + `${stillReaching.join(', ')} after this removal — removing this one route does not detach it`)
  }
  if (outside.length > 0) {
    reasons.push(`handler${outside.length > 1 ? 's' : ''} ${outside.join(', ')} dial the target from OUTSIDE `
      + `${removedPath}, so deleting that route leaves the target reachable`)
  }
  if (!pr || pr.supported !== true) reasons.push('post-removal routing was not modelled')
  else if (pr.isolated !== true) reasons.push('at least one removed matcher is not proven to stop reaching a backend')

  return {
    removedRoutePath: removedPath,
    routesStillReachingTarget: stillReaching,
    handlersOutsideRemovedSubtree: outside,
    patternsNewlyReachingOtherBackends: (pr?.outcomes ?? [])
      .filter((o) => o.outcome === 'exposes-backend')
      .map((o) => ({ pattern: o.pattern, overlap: o.overlappingMatchers, backend: o.exposedDials, via: o.landedRoutePath })),
    patternsLeftUnserved: (pr?.outcomes ?? []).filter((o) => o.outcome === 'unserved').map((o) => o.pattern),
    patternsAbsorbed: (pr?.outcomes ?? []).filter((o) => o.outcome === 'absorbed-terminating')
      .map((o) => ({ pattern: o.pattern, by: `${o.landedRoutePath} (${o.landedHandlerTypes.join('+') || 'no handlers'}, terminal ${String(o.landedTerminal)})` })),
    targetUnreachableAfter: stillReaching.length === 0 && outside.length === 0,
    isLosslessDetach: reasons.length === 0,
    reasons,
  }
}

/**
 * IS THE DURABLE EDIT PROVEN? — and it is not, by default.
 *
 * WHAT WAS OVERCLAIMED. The previous revision emitted a `durableEdit` string —
 * "edit the HOST FILE …: delete the nested route serving /os/* at index 1 of
 * apps/http/servers/…" — and an admin-API `DELETE` against a RUNTIME JSON path.
 * Neither is a proof about the Caddyfile. The runtime JSON is what the adapter
 * PRODUCED; the durable source is a Caddyfile, and the mapping from a JSON
 * pointer back to a source directive is not one this tool computes. Prose plus
 * a runtime DELETE described an edit; it did not demonstrate one.
 *
 * What would demonstrate it, and what this function requires:
 *   1. the candidate is built from the REAL boot file, whose digest matches the
 *      one this run recorded;
 *   2. `caddy adapt` is run on the untouched boot file AND on the candidate;
 *   3. `caddy validate` accepts the candidate;
 *   4. the DIFF between the two adapted JSON documents is EXACTLY the audited
 *      change — the one nested route removed at the audited path, and nothing
 *      else. Not "contains"; exactly.
 *   5. the pre-edit bytes are backed up and the backup's digest recorded.
 *
 * Until a probe carries that evidence this returns not-ok, and a nested removal
 * is never patchable. That is the honest state today: no probe emits it yet.
 */
export const ADAPT_PROOF_FIELDS = [
  'runtimeConfigSha256', 'bootFileSha256', 'candidateFileSha256', 'adaptedBeforeJsonSha256',
  'adaptedAfterJsonSha256', 'validateExitCode', 'jsonDiffPaths', 'backupSha256',
]

/**
 * SECRET-SAFE BY CONSTRUCTION, NOT BY REDACTION.
 *
 * Every field above is a digest, an exit code, or a configuration PATH. None of
 * them can carry configuration TEXT, which is the whole reason the proof is
 * shaped this way: an equivalence argument naturally wants to attach the diff
 * itself, and a Caddy diff can contain basicauth hashes, TLS material, header
 * values and internal hostnames. So the field set is CLOSED — an unexpected key
 * is a refusal, not an ignored extra — and diff entries must look like config
 * pointers and nothing else.
 *
 * The closed set is what stops a future probe from growing a `diffText` field
 * and quietly publishing config into an artifact.
 */
const CONFIG_PATH = /^apps\/http\/servers\/[A-Za-z0-9_.:@-]+(\/[A-Za-z0-9_.:@-]+)*$/

export function adaptEquivalence(a, expectedRemovals) {
  const proof = a?.adaptEquivalence ?? null
  if (proof === null || typeof proof !== 'object') {
    return {
      ok: false,
      reason: 'no caddy adapt/validate equivalence proof was supplied — the runtime JSON path does not '
        + 'establish the corresponding Caddyfile edit, and prose plus an admin DELETE is not that proof',
      required: ADAPT_PROOF_FIELDS,
    }
  }
  const missing = ADAPT_PROOF_FIELDS.filter((f) => proof[f] === undefined || proof[f] === null)
  if (missing.length > 0) return { ok: false, reason: `the equivalence proof is missing ${missing.join(', ')}`, required: ADAPT_PROOF_FIELDS }
  const extra = Object.keys(proof).filter((k) => !ADAPT_PROOF_FIELDS.includes(k))
  if (extra.length > 0) {
    return {
      ok: false,
      reason: `the equivalence proof carries unexpected field(s) ${extra.join(', ')}; the field set is closed `
        + 'because every permitted field is a digest, an exit code or a config path, and none of them can '
        + 'carry configuration text',
      required: ADAPT_PROOF_FIELDS,
    }
  }

  const hex = (v) => typeof v === 'string' && HEX64.test(v)
  // BOUND TO THIS RUN. A proof is about one configuration at one moment. Without
  // this it could be produced against any config and presented alongside any
  // probe — including a stale one taken before somebody reloaded Caddy.
  if (!hex(proof.runtimeConfigSha256)) return { ok: false, reason: 'the proof\'s runtime config digest is malformed' }
  if (typeof a.caddyRuntimeConfigSha256 === 'string' && proof.runtimeConfigSha256 !== a.caddyRuntimeConfigSha256) {
    return {
      ok: false,
      reason: `the proof is bound to runtime config ${proof.runtimeConfigSha256}, but this probe read `
        + `${a.caddyRuntimeConfigSha256} — the proof and the audit describe different configurations`,
    }
  }
  if (!hex(proof.bootFileSha256)) return { ok: false, reason: 'the proof\'s boot file digest is malformed' }
  // THE CANDIDATE MUST DESCEND FROM THE AUDITED BYTES. A proof built against a
  // different boot file proves something about a config nobody audited.
  if (typeof a.caddyBootFileSha256 === 'string' && proof.bootFileSha256 !== a.caddyBootFileSha256) {
    return {
      ok: false,
      reason: `the proof was built from boot file ${proof.bootFileSha256}, but this run audited `
        + `${a.caddyBootFileSha256} — the candidate does not descend from the bytes that were examined`,
    }
  }
  if (!hex(proof.candidateFileSha256) || !hex(proof.adaptedBeforeJsonSha256) || !hex(proof.adaptedAfterJsonSha256)) {
    return { ok: false, reason: 'a digest in the equivalence proof is malformed' }
  }
  if (!hex(proof.backupSha256)) return { ok: false, reason: 'the backup digest is missing or malformed' }
  if (proof.backupSha256 !== proof.bootFileSha256) {
    return { ok: false, reason: 'the backup does not hold the pre-edit bytes, so the rollback would not restore them' }
  }
  if (proof.candidateFileSha256 === proof.bootFileSha256) {
    return { ok: false, reason: 'the candidate file is byte-identical to the boot file — nothing was changed' }
  }
  if (proof.validateExitCode !== 0) {
    return { ok: false, reason: `caddy validate rejected the candidate (exit ${proof.validateExitCode})` }
  }
  if (proof.adaptedAfterJsonSha256 === proof.adaptedBeforeJsonSha256) {
    return { ok: false, reason: 'the adapted JSON is unchanged — the source edit did not produce the route removal' }
  }
  // EXACTLY THE AUDITED CHANGE. "Contains the removal" is not enough: an edit
  // that also reordered a sibling, dropped a header directive or re-indented a
  // block would pass a containment check and change routing anyway.
  const diff = Array.isArray(proof.jsonDiffPaths) ? [...proof.jsonDiffPaths].sort() : null
  if (diff === null) return { ok: false, reason: 'jsonDiffPaths is not a list' }
  const notPaths = diff.filter((d) => typeof d !== 'string' || !CONFIG_PATH.test(d))
  if (notPaths.length > 0) {
    return {
      ok: false,
      reason: `jsonDiffPaths contains ${notPaths.length} entr${notPaths.length === 1 ? 'y' : 'ies'} that `
        + 'are not configuration pointers; the diff is reported as PATHS so that configuration text cannot '
        + 'travel in it',
    }
  }
  const want = [...expectedRemovals].sort()
  if (canonList(diff) !== canonList(want)) {
    return {
      ok: false,
      reason: `the adapted JSON diff is ${JSON.stringify(diff)}, not exactly the audited change `
        + `${JSON.stringify(want)} — the source edit did more, or less, than the removal that was audited`,
    }
  }
  return {
    ok: true,
    proof,
    // NECESSARY, NOT SUFFICIENT. Everything above is arithmetic over values the
    // probe hands us. It establishes that the numbers are consistent with the
    // audited removal; it does not establish that they were produced on the
    // host, from the real boot file, by a real `caddy adapt`. Only a live
    // read-only probe emitting them does that, and until one has, a passing
    // proof is a passing TEST.
    evidenceNote: 'digest arithmetic only — this becomes evidence when a live read-only probe at the '
      + 'audited head produces these values on the host; a synthetic proof proves the checker, not the edit',
  }
}

const canonList = (xs) => JSON.stringify(xs)

/**
 * The exact nested-route deletion, with the exact rollback.
 *
 * Emitted ONLY when the simulation above proves losslessness. The unit is the
 * route object, not an upstream entry: emptying the handler's upstream list
 * would leave a route still matching `/os/*` with nothing behind it.
 *
 * THE PRECONDITIONS ARE THE POINT. An index is a position, and positions move.
 * Every sibling is pinned by structural fingerprint and the array length is
 * pinned too, so a config edited between this read and the apply fails the
 * check instead of deleting a route nobody audited.
 */
export function nestedRouteRemovalStep(a, c, sim) {
  const excl = c.exclusiveRoute
  const pr = c.postRemoval
  const fps = pr?.siblingFingerprints ?? []
  // The one and only change the adapted JSON is permitted to show.
  const expectedRemovals = [excl.routePath]
  const adapt = adaptEquivalence(a, expectedRemovals)
  return {
    where: `${c.server} route ${c.routeIndex}`
      + (c.hostMatchers.length ? ` (host ${c.hostMatchers.join(', ')})` : ' (no host matcher — catch-all)'),
    configPath: excl.routePath,
    action: 'remove the NESTED ROUTE OBJECT from its parent routes array',
    parentRoutesArrayPath: excl.parentRoutesArrayPath,
    routeIndexInParent: excl.routeIndexInParent,
    pathMatchers: excl.pathMatchers,
    siblingFingerprints: fps,
    simulation: sim,
    ordering: 'if more than one nested route is removed from the SAME array, apply in DESCENDING index order — '
      + 'deleting a lower index shifts every higher one down',
    preconditions: [
      `runtime config sha256 == ${a.caddyRuntimeConfigSha256}`,
      `disk config ${a.caddyDiskConfigPath ?? '<unknown>'} sha256 == ${a.caddyDiskConfigSha256 ?? '<unknown>'}`,
      `${excl.parentRoutesArrayPath} holds exactly ${fps.length} route${fps.length === 1 ? '' : 's'}`,
      ...fps.map((f) => `${excl.parentRoutesArrayPath}/${f.index} fingerprint sha256 == ${f.sha256}`
        + ` (matcher sets ${f.matchSetText}, terminal ${f.terminal},`
        + ` handlers ${f.handlerTypes.join('+') || 'none'})`),
      `${excl.routePath} matches exactly [${excl.pathMatchers.join(', ') || '(none)'}]`,
      'after the edit, no route in the configuration dials the target',
      ...sim.patternsLeftUnserved.map((p) => `after the edit, requests matching ${p} match no route and Caddy answers 404`),
      ...sim.patternsAbsorbed.map((x) => `after the edit, requests matching ${x.pattern} are answered by `
        + `${x.by} without reaching any backend`),
    ],
    // ADAPT-EQUIVALENCE IS THE DURABLE PROOF, AND IT IS SEPARATE FROM ROUTING.
    // The simulation proves the routing consequence of removing a route from the
    // adapted JSON. It says nothing about which Caddyfile bytes produce that
    // JSON, and this tool does not compute that mapping. So the durable edit is
    // reported as UNPROVEN with the procedure that would prove it, rather than
    // as an instruction that sounds like one.
    durableEditStatus: adapt.ok ? 'PROVEN by adapt-equivalence' : 'UNPROVEN',
    durableEditUnprovenReason: adapt.ok ? null : adapt.reason,
    durableEditProofProcedure: [
      `1. copy the boot file ${a.caddyBootFileHostPath ?? '<resolved host file>'} to a backup; `
      + `record its sha256 (this run read ${a.caddyBootFileSha256 ?? '<unknown>'})`,
      '2. build the CANDIDATE by editing that backup copy, never the live file',
      `3. caddy adapt the untouched boot file -> adaptedBefore.json`,
      '4. caddy adapt the candidate -> adaptedAfter.json, and caddy validate the candidate',
      `5. diff adaptedBefore.json against adaptedAfter.json and require the change to be EXACTLY `
      + `[${expectedRemovals.join(', ')}] — not "contains", exactly; an edit that also reordered a sibling `
      + 'or dropped a directive would pass a containment check and change routing anyway',
      '6. only then is the source edit known to produce the audited removal',
    ],
    adaptEquivalence: adapt,
    // A candidate config must be proven loadable before it is loaded. The
    // simulation proves the ROUTING is what we think; this proves Caddy agrees
    // the file is a config at all. Both, or neither.
    validate: [
      `caddy validate --config <candidate> --adapter ${a.caddyDiskConfigPath?.endsWith('.json') ? 'none (already JSON)' : 'caddyfile'}`,
      'the candidate must validate BEFORE any reload; a reload of an invalid config takes the whole proxy down, '
      + 'not just the route being removed',
    ],
    // A REHEARSAL, AND ONLY THAT. An admin-API DELETE edits the RUNTIME config.
    // It is lost on the next container restart, and it is not evidence about the
    // Caddyfile. It is listed so the routing consequence can be observed
    // reversibly — never as the durable change.
    rehearsalScope: 'RUNTIME ONLY — reverted by any restart, and no evidence about the durable source',
    rehearsal: `curl -s -X DELETE "${adminBase(a)}${excl.routePath}"`,
    // ROLLBACK IS A FILE, NOT A RECONSTRUCTION. The probe deliberately never
    // emits the route object's contents — it emits matchers, handler types and
    // dials under an allowlist, because a config may hold secrets. That is the
    // right trade, and it means the removed route cannot be rebuilt from this
    // report. The only honest rollback is the byte-for-byte config that was
    // there before, restored from a backup taken at apply time and verified by
    // digest.
    rollback: [
      `BEFORE the edit, copy ${a.caddyBootFileHostPath ?? '<boot file>'} to a backup and record its sha256 `
      + `(expected ${a.caddyBootFileSha256 ?? '<unknown>'})`,
      'to roll back: restore that backup, confirm the restored file\'s sha256 equals the recorded one, '
      + 'then reload',
      'this report CANNOT reconstruct the deleted route — it records matchers, handler types and dials only, '
      + 'never the route object — so the backup is the rollback, and an edit made without one is irreversible',
    ],
  }
}

/**
 * The candidate patch. NOT APPLIED — this run reloads nothing and changes
 * nothing on the host. It is emitted so the change can be reviewed before it is
 * ever authorised.
 *
 * DURABILITY IS PART OF CORRECTNESS. If the container boots from a Caddyfile,
 * an admin-API edit is lost on the next restart and the config silently drifts
 * back to routing at a stopped container. So the durable patch is the file edit;
 * the admin API appears only as the reversible rehearsal.
 */
export function candidatePatch(a, impacted, allClassified) {
  const steps = []
  const durable = a.caddyDiskConfigIsBootSource === true && typeof a.caddyDiskConfigPath === 'string'

  // Shared by every step. Evidence goes stale: between this read-only run and
  // any future mutation the proxy may be reloaded, the file edited, or a
  // backend added. A step that does not re-verify what it was built from is a
  // patch aimed at a configuration that no longer exists.
  const commonPre = [
    `runtime config sha256 == ${a.caddyRuntimeConfigSha256}`,
    `disk config ${a.caddyDiskConfigPath ?? '<unknown>'} sha256 == ${a.caddyDiskConfigSha256 ?? '<unknown>'}`,
  ]

  for (const c of impacted) {
    const where = `${c.server} route ${c.routeIndex}`
      + (c.hostMatchers.length ? ` (host ${c.hostMatchers.join(', ')})` : ' (no host matcher — catch-all)')

    if (c.verdict === 'route-exclusive') {
      steps.push({
        where,
        configPath: c.routePath,
        action: 'remove the whole route',
        // Route indices SHIFT when an earlier route is deleted. Applying two
        // removals in ascending order silently targets the wrong route the
        // second time.
        ordering: 'if more than one route is removed, apply in DESCENDING routeIndex order, or make the durable file edit instead',
        preconditions: [
          ...commonPre,
          `${c.routePath} still exists`,
          `its host matchers are exactly [${c.hostMatchers.join(', ')}]`,
          `its full upstream list is exactly [${c.upstreamDials.join(', ')}]`,
        ],
        rehearsal: `curl -s -X DELETE "${adminBase(a)}${c.routePath}"`,
        durableEdit: durableEditFor(a, `delete the site block for ${c.hostMatchers.join(', ') || '(catch-all)'}`),
      })
      continue
    }

    if (c.verdict === 'nested-route-exclusive') {
      // Only ever reached with a lossless simulation: decide() blocks otherwise,
      // and a blocked run never calls this function at all. The guard is here
      // anyway, because "the caller checks" is how an unproven deletion ships.
      const sim = simulateNestedRemoval(c, allClassified)
      // BOTH GATES. The routing must be proven lossless AND the source edit must
      // be proven to be exactly that removal. Either alone drafts a change whose
      // effect is unestablished.
      const adapt = adaptEquivalence(a, [c.exclusiveRoute.routePath])
      if (sim.isLosslessDetach && adapt.ok) steps.push(nestedRouteRemovalStep(a, c, sim))
      continue
    }

    if (c.verdict !== 'upstream-shared') continue

    // ONE STEP PER IMPACTED HANDLER. Never a route-wide keep-list: two handlers
    // each pairing the target with a different protected backend must produce
    // two separate instructions with two separate address sets.
    for (const h of c.handlers) {
      if (h.role !== 'shared') continue

      // DELETE THE TARGET ENTRIES. DO NOT REBUILD THE ARRAY.
      //
      // The previous revision emitted `PUT <handler>/upstreams` with the keep
      // list re-serialised as `[{dial}, …]`. That is lossless only if a dial is
      // the ONLY field an upstream carries — and Caddy allows more
      // (`max_requests`, per-upstream health overrides, …). A protected backend
      // configured with any of them would have had it silently stripped by a
      // patch whose stated purpose was to leave it alone.
      //
      // Deleting the target entries by exact index touches nothing else. The
      // survivors are never read, re-encoded or written.
      //
      // DESCENDING ORDER IS NOT A STYLE CHOICE. Removing index 1 shifts index 2
      // down to 1; ascending deletion of [1,2] removes 1 and then whatever
      // moved into 2, which is a survivor.
      const targetsDesc = [...h.targetUpstreams].sort((a2, b2) => b2.index - a2.index)
      steps.push({
        where: `${where}, handler ${h.position} (${h.handler})`,
        configPath: `${h.handlerPath}/upstreams`,
        action: 'DELETE only the target upstream entries, by index, descending',
        targetUpstreams: targetsDesc,
        keepUpstreams: h.keepUpstreams.map((k) => k.dial),
        ordering: 'delete in DESCENDING index order — removing a lower index shifts every higher one down',
        deletePaths: targetsDesc.map((u) => `${h.handlerPath}/upstreams/${u.index}`),
        preconditions: [
          ...commonPre,
          `${h.handlerPath} is still a ${h.handler}`,
          `${h.handlerPath}/upstreams has exactly ${h.upstreams.length} entr`
            + `${h.upstreams.length === 1 ? 'y' : 'ies'}`,
          `${h.handlerPath}/upstreams in order is exactly `
            + JSON.stringify(h.upstreams.map((u) => ({ index: u.index, dial: u.dial }))),
          ...targetsDesc.map((u) => `${h.handlerPath}/upstreams/${u.index} has dial ${u.dial}`),
          `after deletion ${h.handlerPath}/upstreams must still contain exactly `
            + `[${h.keepUpstreams.map((k) => k.dial).join(', ')}] and must not be empty`,
        ],
        rehearsal: targetsDesc
          .map((u) => `curl -s -X DELETE "${adminBase(a)}${h.handlerPath}/upstreams/${u.index}"   # ${u.dial}`)
          .join('\n                    '),
        losslessness: `the ${h.keepUpstreams.length} surviving upstream object(s) are never rewritten; `
          + `${h.keepUpstreams.filter((k) => (k.extraKeyCount ?? 0) > 0).length} of them carry fields beyond \`dial\` `
          + 'which a whole-array PUT would have discarded',
        durableEdit: durableEditFor(a, `remove the ${a.target} "to" entry from THIS reverse_proxy only, leaving ${h.keepUpstreams.map((k) => k.dial).join(', ') || '(nothing — refuse)'}`),
      })
    }
  }

  // ROLLBACK RESTORES CADDY AND NOTHING ELSE.
  //
  // An earlier revision ended with `docker update --restart=unless-stopped
  // stylique-os`. Editing a proxy route does not change the container's restart
  // policy, so undoing the edit must not change it either — and that particular
  // command would have re-armed the crash loop that `disable-restart` was run to
  // stop. A rollback that alters state the change never touched is not a
  // rollback.
  const rollback = [
    `restore ${a.caddyDiskConfigPath ?? '<disk config>'} to sha256 ${a.caddyDiskConfigSha256 ?? '<unknown>'} (capture a copy BEFORE editing)`,
    'docker exec stylique-caddy caddy validate --config <restored file> --adapter caddyfile',
    'docker exec stylique-caddy caddy reload --config <restored file> --adapter caddyfile',
    `re-run this probe and require the runtime hash to return to ${a.caddyRuntimeConfigSha256}`,
    'SCOPE: Caddy configuration only. This rollback must not touch any container\'s restart policy, state or image — the route edit did not.',
  ]

  return {
    steps, rollback,
    fingerprints: fingerprintPlan(a, impacted, allClassified),
    validation: [
      'BEFORE: capture the disk config and its sha256, the runtime config sha256, and every fingerprint below.',
      'RE-VERIFY: immediately before applying, re-run this probe and require EVERY step precondition to still hold. Any mismatch refuses — the config moved under the patch.',
      'VALIDATE OFFLINE: `docker exec stylique-caddy caddy validate --config <edited file> --adapter caddyfile` — parses only, loads nothing.',
      'APPLY: `caddy reload` (graceful) — a separate, separately authorised step.',
      'AFTER: re-capture every fingerprint and diff. Protected fingerprints must be IDENTICAL; impacted ones must have changed in exactly the intended way.',
      'AFTER — TwinAI: re-run the worker health probe (status running, health healthy, ffprobe ok, model present, 0 errors).',
      'THEN AND ONLY THEN: re-run pre-stop-audit and require ROUTE: clear before `stop` is dispatched.',
    ],
  }
}

const adminBase = (a) => a.caddyAdminEndpoint ?? 'http://localhost:2019/config/'

/**
 * Resolve — and PROVE — where a durable edit would actually be written.
 *
 * A container path is not an edit location, and neither is a MOUNT ROOT. If
 * /etc/caddy is bind-mounted from /root/caddy and the boot file is
 * /etc/caddy/Caddyfile, the file to edit is /root/caddy/Caddyfile. An earlier
 * revision emitted the mount Source, so a directory mount sent a reviewer to a
 * DIRECTORY. Its positive test hid this by using an exact-file mount, where
 * Source happens to already end in Caddyfile.
 *
 * The mapping is not trusted on its shape. The host file's own sha256 must equal
 * the sha256 read from inside the container: if the two disagree, the mapping
 * resolved to a DIFFERENT FILE and every instruction built on it is aimed at the
 * wrong place. That single comparison catches a wrong mount, a stale path and a
 * symlink surprise at once.
 */
export function durableResolution(a) {
  const fail = (reason) => ({ ok: false, reason, hostFile: null })
  if (a.caddyDiskConfigIsBootSource !== true || typeof a.caddyDiskConfigPath !== 'string') {
    return fail('the loaded configuration is not booted from a file on disk; no durable edit location exists')
  }
  const host = a.caddyBootFileHostPath
  if (typeof host !== 'string' || host.length === 0) {
    return fail(`${a.caddyDiskConfigPath} could not be mapped through any container mount `
      + '(baked into the image, or an unresolved mapping) — no durable edit target exists')
  }
  if (!host.startsWith('/')) {
    return fail(`the resolved boot file ${JSON.stringify(host)} is not an absolute host path`)
  }
  // Naming a directory as "the file to edit" is the defect this exists to stop.
  if (typeof a.caddyBootMountRoot === 'string' && host === a.caddyBootMountRoot
      && typeof a.caddyBootMountDest === 'string' && a.caddyBootMountDest !== a.caddyDiskConfigPath) {
    return fail(`the resolution collapsed to the mount root ${host}, which is a directory, not the boot file`)
  }
  if (a.caddyBootFileIsRegular !== true) return fail(`${host} is not a regular file on the host`)
  if (a.caddyBootFileReadable !== true) return fail(`${host} is not readable on the host`)
  if (a.caddyBootFileWritable !== true) return fail(`${host} is not writable; a durable edit cannot be written there`)
  if (typeof a.caddyBootFileSha256 !== 'string' || !HEX64.test(a.caddyBootFileSha256)) {
    return fail(`${host} has no usable sha256, so the mapping cannot be proven`)
  }
  if (typeof a.caddyDiskConfigSha256 !== 'string' || !HEX64.test(a.caddyDiskConfigSha256)) {
    return fail('the container-read config sha256 is missing or malformed, so the mapping cannot be proven')
  }
  if (a.caddyBootFileSha256 !== a.caddyDiskConfigSha256) {
    return fail(`${host} hashes ${a.caddyBootFileSha256} but the container reads `
      + `${a.caddyDiskConfigSha256} at ${a.caddyDiskConfigPath} — the mapping resolved to a DIFFERENT file`)
  }
  return { ok: true, reason: null, hostFile: host, mountType: a.caddyBootMountType ?? null }
}

/**
 * Compose provenance, only when it is actually actionable.
 *
 * `com.docker.compose.project.config_files` is frequently RELATIVE to the
 * project working dir. Printing it as though it were a path sends people to a
 * file that does not exist from where they are standing, so an unresolved label
 * is reported as informational and never as a source path.
 */
export function composeProvenance(a) {
  const r = a.caddyComposeFileResolved
  if (typeof r === 'string' && r.startsWith('/')) return { resolved: r, informational: null }
  const label = a.caddyComposeFileLabel
  if (typeof label === 'string' && label.length > 0) {
    return { resolved: null, informational: `compose label ${JSON.stringify(label)} (UNRESOLVED — relative to an unknown working dir; not an edit path)` }
  }
  return { resolved: null, informational: null }
}

export function durableEditFor(a, what) {
  const d = durableResolution(a)
  if (!d.ok) return `REFUSED: ${d.reason}`
  const c = composeProvenance(a)
  // ONLY the resolved FILE is ever named. Never the mount directory.
  const suffix = c.resolved ? ` (compose source: ${c.resolved})`
    : (c.informational ? ` (${c.informational})` : '')
  const vol = d.mountType === 'volume'
    ? ' [NOTE: this is a named VOLUME, not a bind mount — editing it bypasses the volume\'s own lifecycle]' : ''
  return `edit the HOST FILE ${d.hostFile}${suffix}${vol}: ${what}`
}

/**
 * The exact before/after probes a future mutating stage must run.
 *
 * "Check the dashboard still works" is not a check. Each entry names a concrete
 * host+path and the three things to record, so before and after are comparable
 * mechanically rather than by impression.
 */
export function fingerprintPlan(a, impacted, allClassified) {
  const impactedKeys = new Set(impacted.map((c) => `${c.server}#${c.routeIndex}`))
  const out = []
  const add = (c, kind) => {
    const hosts = c.hostMatchers.length ? c.hostMatchers : ['(catch-all)']
    const paths = c.pathMatchers.length ? c.pathMatchers : ['/']
    // For a shared handler, "the endpoint still answers" is far too weak: it can
    // answer while a survivor has lost its metadata, or while the handler has
    // been emptied and Caddy is returning someone else's route. Bind the exact
    // surviving dial set, per handler, and require the handler to stay non-empty.
    const perHandler = (c.handlers ?? [])
      .filter((h) => h.role === 'shared')
      .map((h) => ({
        handlerPath: h.handlerPath,
        mustRemainExactly: h.keepUpstreams.map((k) => k.dial),
        mustNotBeEmpty: true,
        mustNotContain: h.targetUpstreams.map((t) => t.dial),
      }))
    for (const host of hosts) {
      for (const p of paths) {
        out.push({
          kind, host, path: p,
          expectation: kind === 'protected'
            ? 'IDENTICAL before and after'
            : 'must stop resolving to the target, and change in no other way',
          record: [
            `HTTP status for https://${host}${p.replace(/\*$/, '')}`,
            `response header fingerprint (server, content-type, content-length) for ${host}${p.replace(/\*$/, '')}`,
            `the upstream list at that route's handlers, read back from the admin API`,
          ],
          handlerAssertions: perHandler,
        })
      }
    }
  }
  for (const c of impacted) add(c, 'impacted')
  for (const c of allClassified) {
    if (!c || impactedKeys.has(`${c.server}#${c.routeIndex}`)) continue
    add(c, 'protected')
  }
  return out
}

export function render(d) {
  const L = []
  L.push('== route impact ==')
  L.push(`  runtime config sha256 : ${d.runtimeSha256}`)
  L.push(`  disk config           : ${d.diskConfigPath} (sha256 ${d.diskConfigSha256})`)
  L.push(`  disk is boot source   : ${String(d.diskIsBootSource)}`)
  L.push(`  mount                 : ${String(d.mountRoot)} -> ${String(d.mountDest)} (${String(d.mountType)})`)
  L.push(`  RESOLVED HOST FILE    : ${String(d.hostBootFile)} (sha256 ${String(d.hostBootFileSha256)})`)
  L.push(`  routes examined       : ${d.classified.length}, impacted: ${d.impacted.length}`)
  L.push(`  FILE DIVERGENCE       : ${d.divergence.cause}`)
  L.push(`      ${d.divergence.detail}`)
  L.push(`  caddy argv            : ${String(d.caddyArgv)}`)
  L.push(`  caddy env KEYS        : ${String(d.caddyEnvKeys)}`)
  if (d.configShape) {
    L.push(`  servers               : ${JSON.stringify(d.configShape.serverNames)} (${d.configShape.serverCount})`)
    L.push(`  routes per server     : ${JSON.stringify(d.configShape.routeCountByServer)}`)
    L.push('  config key paths (names + counts only):')
    for (const kp of (d.configShape.keyPaths ?? []).slice(0, 40)) L.push(`      ${kp}`)
  }
  for (const c of d.impacted) {
    L.push(`  -- ${c.server} route ${c.routeIndex} [${c.verdict}]`)
    L.push(`       host matchers   : ${c.hostMatchers.join(', ') || '(none — catch-all)'}`)
    L.push(`       path matchers   : ${c.pathMatchers.join(', ') || '(none — all paths)'}`)
    L.push(`       handler order   : ${c.handlerOrder.join(' -> ') || '(none)'}`)
    L.push(`       upstream dials  : ${c.upstreamDials.join(', ') || '(none)'}`)
    L.push(`       why             : ${c.reason}`)
    // THE EXACT MATCHER STACK. A handler is reached only under the conjunction
    // of every ancestor route's matchers. Printing the outer route's matchers
    // alone is what produced "path matchers: none — all paths" for a handler
    // that in fact serves exactly one nested path.
    for (const h of c.handlers) {
      if (h.role === 'no-upstreams') continue
      L.push(`       handler ${h.handlerPath} [${h.role}] -> ${h.upstreamDials.join(', ') || '(none)'}`)
      for (const [i, m] of (h.matcherChain ?? []).entries()) {
        L.push(`           ${'  '.repeat(i)}${m.routePath ?? '(unknown)'}`
          + `  host=${(m.host ?? []).join(',') || '*'}`
          + `  path=${(m.path ?? []).join(',') || '*'}`
          + `  terminal=${String(m.terminal ?? '(not reported)')}`
          + `${m.hasGroup ? '  IN A ROUTE GROUP' : ''}`)
      }
    }
    // THE FALL-THROUGH TABLE. A reviewer must be able to see, per path, what
    // serves it after the edit — not infer it from a verdict word.
    if (c.postRemoval) {
      const pr = c.postRemoval
      L.push(`       removable unit  : ${c.exclusiveRoute.routePath} `
        + `(index ${c.exclusiveRoute.routeIndexInParent} of ${c.exclusiveRoute.parentRoutesArrayPath})`)
      if (pr.supported !== true) {
        L.push(`       POST-REMOVAL    : NOT MODELLED — ${pr.reason}`)
      } else {
        L.push(`       POST-REMOVAL    : ${pr.isolated ? 'isolated (a real detach)' : 'NOT ISOLATED — falls through'}`)
        for (const o of pr.outcomes) {
          const to = {
            unserved: () => 'nothing matches -> Caddy 404',
            'absorbed-terminating': () => `${o.landedRoutePath} `
              + `(${o.landedHandlerTypes.join('+') || 'no handlers'}, terminal ${String(o.landedTerminal)}) `
              + '— ends the request, no backend',
            'exposes-backend': () => `${o.landedRoutePath} -> ${o.exposedDials.join(', ')}`,
            'still-reaches-target': () => `${o.landedRoutePath} -> the target`,
            'partial-absorption-unmodelled': () => `${o.landedRoutePath} covers only PART of it — remainder unmodelled`,
            'overlap-undecidable': () => `${o.landedRoutePath ?? '(a sibling)'} — overlap could not be decided`,
          }[o.outcome]?.() ?? '(unclassified)'
          L.push(`           ${o.pattern}  =>  [${o.outcome}] ${to}`)
          if (o.overlappingMatchers.length) {
            L.push(`               overlapping sets: ${o.overlappingMatchers.join(' , ')}`)
          }
        }
      }
      L.push('       sibling routes in that array (fingerprint pins the position):')
      for (const f of pr.siblingFingerprints ?? []) {
        L.push(`           [${f.index}] ${f.matchSetText}`
          + `  terminal=${f.terminal}  handlers=${f.handlerTypes.join('+') || 'none'}`
          + `${f.hasGroup ? '  IN A ROUTE GROUP' : ''}`)
        L.push(`               sha256 ${f.sha256}`)
      }
    }
    if (c.simulation && !c.simulation.isLosslessDetach) {
      L.push('       SIMULATION REFUSES:')
      for (const r of c.simulation.reasons) L.push(`           - ${r}`)
    }
  }
  if (d.patch) {
    L.push('  CANDIDATE PATCH (not applied; nothing was reloaded):')
    for (const s of d.patch.steps) {
      L.push(`    * ${s.where}`)
      L.push(`        config path : ${s.configPath}`)
      L.push(`        action      : ${s.action}`)
      if (s.keepUpstreams) L.push(`        keep        : ${s.keepUpstreams.join(', ') || '(none — would orphan)'}`)
      if (s.deletePaths) {
        L.push('        delete ONLY (descending index order):')
        for (const dp of s.deletePaths) L.push(`          ${dp}`)
      }
      if (s.losslessness) L.push(`        lossless    : ${s.losslessness}`)
      if (s.simulation) {
        L.push(`        SIMULATED   : target unreachable after = ${s.simulation.targetUnreachableAfter}; `
          + `matchers left unserved = ${s.simulation.patternsLeftUnserved.join(', ') || '(none)'}; `
          + `matchers absorbed by a terminating route = ${s.simulation.patternsAbsorbed.map((x) => x.pattern).join(', ') || '(none)'}; `
          + `matchers newly reaching another backend = ${s.simulation.patternsNewlyReachingOtherBackends.length}`)
      }
      if (s.durableEditStatus) {
        L.push(`        durable    : ${s.durableEditStatus}`)
        if (s.durableEditUnprovenReason) L.push(`              why : ${s.durableEditUnprovenReason}`)
        for (const q of s.durableEditProofProcedure ?? []) L.push(`              ${q}`)
      }
      if (s.rehearsalScope) L.push(`        rehearsal scope: ${s.rehearsalScope}`)
      if (s.validate) for (const v of s.validate) L.push(`        validate    : ${v}`)
      if (s.rollback) {
        L.push('        rollback:')
        for (const r of s.rollback) L.push(`          - ${r}`)
      }
      if (s.ordering) L.push(`        ordering    : ${s.ordering}`)
      L.push('        preconditions (all must hold immediately before applying):')
      for (const p of s.preconditions) L.push(`          - ${p}`)
      if (s.durableEdit) L.push(`        durable     : ${s.durableEdit}`)
      L.push(`        rehearsal   : ${s.rehearsal}`)
    }
    L.push('  ROLLBACK:')
    for (const r of d.patch.rollback) L.push(`    - ${r}`)
    L.push('  FINGERPRINTS to capture BEFORE and compare AFTER:')
    for (const f of d.patch.fingerprints) {
      L.push(`    [${f.kind}] ${f.host}${f.path}  -> ${f.expectation}`)
      for (const r of f.record) L.push(`        record: ${r}`)
      for (const ha of f.handlerAssertions ?? []) {
        L.push(`        AFTER ${ha.handlerPath}/upstreams must be exactly [${ha.mustRemainExactly.join(', ')}]`)
        L.push(`              and must be non-empty, and must NOT contain [${ha.mustNotContain.join(', ')}]`)
      }
    }
    L.push('  VALIDATION PLAN:')
    for (const v of d.patch.validation) L.push(`    ${v}`)
  }
  L.push(`  parser status         : ${d.parserStatus ?? '(not reported)'}`)
  L.push(`  PATCH MAY BE PREPARED : ${String(d.patchable)}`)
  for (const b of d.blockers) L.push(`    blocker: ${b}`)
  return L.join('\n')
}

// ------------------------------------------------------------------ selftest
const TARGET_IDS = ['stylique-os', '172.18.0.5']
const PROT_IDS = ['stylique-dashboard', 'twinai-worker', '172.18.0.9']

const RP = 'apps/http/servers/srv0/routes/0/handle'
/**
 * One handler, addressed the way the probe addresses it.
 * `dials` may be plain strings, or [dial, extraKeyCount] to model an upstream
 * carrying fields beyond `dial` (max_requests and friends).
 */
function hdl(position, dials, over = {}) {
  const ups = dials.map((d, i) => Array.isArray(d)
    ? { index: i, dial: d[0], extraKeyCount: d[1] }
    : { index: i, dial: d, extraKeyCount: 0 })
  return {
    handlerPath: `${RP}/${position}`, position, handler: 'reverse_proxy',
    upstreams: ups,
    upstreamDials: ups.map((u) => u.dial),
    upstreamCount: ups.length,
    addressable: true, ...over,
  }
}

function route(over = {}) {
  const handlers = over.handlers ?? [hdl(0, ['stylique-os:4100'])]
  return {
    server: 'srv0', routeIndex: 0, routePath: 'apps/http/servers/srv0/routes/0',
    hostMatchers: ['os.example.com'], pathMatchers: [],
    handlerOrder: handlers.map((h) => h.handler),
    upstreamDials: handlers.flatMap((h) => h.upstreamDials),
    ...over, handlers,
  }
}

function probe(over = {}) {
  return {
    target: 'stylique-os', targetPort: 4100, targetPresent: true, restartPolicy: 'no',
    // Mandatory evidence: a probe without a valid parser status is refused.
    parserStatus: 'ok',
    targetIps: '172.18.0.5', targetAliases: '', protectedIdentities: PROT_IDS.join(' '),
    caddyPresent: true, caddyAdminEndpoint: 'http://localhost:2019/config/',
    caddyRuntimeReadable: true, caddyRuntimeConfigSha256: 'a'.repeat(64),
    caddyDiskConfigPath: '/etc/caddy/Caddyfile', caddyDiskConfigSha256: 'b'.repeat(64),
    caddyDiskConfigIsBootSource: true,
    // A DIRECTORY mount, deliberately: the previous fixture used an exact-file
    // mount, where Source already ends in Caddyfile, and that coincidence hid
    // the resolver defect entirely.
    caddyBootMountRoot: '/root/caddy', caddyBootMountDest: '/etc/caddy',
    caddyBootMountType: 'bind', caddyBootMountWritable: true,
    caddyBootFileHostPath: '/root/caddy/Caddyfile',
    caddyBootFileIsRegular: true, caddyBootFileReadable: true, caddyBootFileWritable: true,
    caddyBootFileSha256: 'b'.repeat(64),
    // Three consistent views: same inode, same bytes, no layering.
    caddyPid: '4242',
    fileIdHostSource: `2049:9001:812:1750000000:${'b'.repeat(64)}`,
    fileIdProcRoot: `2049:9001:812:1750000000:${'b'.repeat(64)}`,
    fileIdContainer: `2049:9001:812:1750000000:${'b'.repeat(64)}`,
    mountinfoRelevant: '/etc/caddy/Caddyfile /srv/caddy/Caddyfile ext4;',
    caddyArgv: 'caddy run --config /etc/caddy/Caddyfile --adapter caddyfile',
    caddyEnvKeys: 'PATH XDG_CONFIG_HOME XDG_DATA_HOME',
    configKeyPaths: { keyPaths: ['/apps{1}', '/apps/http{1}'], serverNames: ['srv0'], serverCount: 1, routeCountByServer: { srv0: 1 } },
    caddyComposeFileLabel: 'docker-compose.yml',
    caddyComposeDir: '/root/24_Backend/deploy',
    caddyComposeFileResolved: '/root/24_Backend/deploy/docker-compose.yml',
    parserAvailable: true, parsed: true,
    routes: [route()],
    ...over,
  }
}

async function selftest() {
  let failed = 0
  const t = (name, got, exp) => {
    if (got === exp) console.log(`  ok: ${name}`)
    else { console.error(`SELFTEST FAIL: ${name} => ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); failed++ }
  }
  // targetPort is mandatory for target attribution, so every classification
  // test must supply it — a test that omits it is now testing the refusal.
  const v = (p) => classifyRoute(p, TARGET_IDS, PROT_IDS, { targetPort: 4100, targetHasIp: true }).verdict

  console.log('-- dial matching')
  console.log('-- IDENTITY VALIDATION (regression: run 30328203719)')
  // OLD HEAD: docker's "invalid IP" placeholder split into two identities, and
  // "IP" is a name a dial can match. This is the counterexample.
  const OLD_IDS = ['stylique-os', ...identities('invalid IP')]
  t('OLD HEAD: "invalid IP" produced the identities invalid,IP',
    identities('invalid IP').join(','), 'invalid,IP')
  t('OLD HEAD: a dial of IP:4100 FALSE-MATCHED the target', dialMatches('IP:4100', OLD_IDS), true)
  t('CORRECTED: "invalid IP" yields NO address identities', ipIdentities('invalid IP').length, 0)
  t('CORRECTED: "<no value>" yields none either', ipIdentities('<no value>').length, 0)
  t('CORRECTED: a real address survives', ipIdentities('172.18.0.5').join(','), '172.18.0.5')
  t('CONTROL: the corrected identity set no longer false-matches IP:4100',
    dialMatches('IP:4100', ['stylique-os', ...ipIdentities('invalid IP')]), false)
  // IPv6 STRICTNESS. The hand-rolled regex accepted every one of these. A
  // validator wrong in the permissive direction launders junk into a matchable
  // identity while reading as a safeguard, so node:net is the authority.
  t('IPv6 too SHORT is not an address', isIp('1:2'), false)
  t('IPv6 OVERLONG (9 groups) is not an address', isIp('1:2:3:4:5:6:7:8:9'), false)
  t('IPv6 with MULTIPLE compressions is not an address', isIp('1::2::3'), false)
  t('an overlong hex group is not an address', isIp('12345::'), false)
  t('a trailing-colon fragment is not an address', isIp('fd00:'), false)
  t('CONTROL: the unspecified address IS valid', isIp('::'), true)
  t('CONTROL: a full 8-group address IS valid', isIp('1:2:3:4:5:6:7:8'), true)
  t('CONTROL: an IPv4-mapped address IS valid', isIp('::ffff:10.0.0.1'), true)
  t('an octet above 255 is not an address', isIp('999.1.1.1'), false)
  t('a bare word is not an address', isIp('IP'), false)
  t('an ipv6 literal is an address', isIp('fd00::5'), true)
  t('nameIdentities rejects docker\'s placeholder but keeps names',
    nameIdentities('stylique-os <no value>').join(','), 'stylique-os')
  t('dialPort reads the port', dialPort('172.18.0.5:4100'), 4100)
  t('dialPort on a bracketed ipv6 dial', dialPort('[fd00::5]:4100'), 4100)
  t('dialHost strips brackets', dialHost('[fd00::5]:4100'), 'fd00::5')

  console.log('-- …AND THROUGH decide(), NOT ONLY THE HELPERS')
  // The helper tests above passed while decide() still used the UNFILTERED
  // identities: reverting the filter broke nothing, which means those tests
  // measured the helper and not the thing that uses it. These go through decide().
  t('OLD-HEAD PATH: an "invalid IP" placeholder + a dial of IP:4100 was attributed to the target', (() => {
    const bad = probe({ targetIps: 'invalid IP',
      routes: [route({ handlers: [hdl(0, ['IP:4100', 'stylique-dashboard:80'])] })] })
    const ids = [bad.target, ...identities(bad.targetAliases), ...identities(bad.targetIps)].filter(Boolean)
    return classifyRoute(bad.routes[0], ids, PROT_IDS, { targetPort: 4100, targetHasIp: true })
      .handlers[0].targetUpstreams.length
  })(), 1)
  t('CORRECTED PATH: decide() no longer attributes it', (() => {
    const good = probe({ targetIps: 'invalid IP',
      routes: [route({ handlers: [hdl(0, ['IP:4100', 'stylique-dashboard:80'])] })] })
    const d = decide(good)
    return d.classified[0].handlers[0].targetUpstreams.length
  })(), 0)
  t('CONTROL: a REAL address is still attributed through decide()', (() => {
    const good = probe({ targetIps: '172.18.0.5',
      routes: [route({ handlers: [hdl(0, ['172.18.0.5:4100', 'stylique-dashboard:80'])] })] })
    return decide(good).classified[0].handlers[0].targetUpstreams.length
  })(), 1)
  t('decide(): an EXITED target + unrecognised literal-IP dial on the target port BLOCKS', (() => {
    const exited = probe({ targetIps: '', targetPresent: true,
      routes: [route({ handlers: [hdl(0, ['172.18.0.77:4100'])] })] })
    const d = decide(exited)
    return d.classified[0].verdict === 'undetermined' && d.patchable === false
  })(), true)
  t('CONTROL: the same host with a REAL target address does not block', (() => {
    const live = probe({ targetIps: '172.18.0.5',
      routes: [route({ handlers: [hdl(0, ['172.18.0.77:4100'])] })] })
    return decide(live).classified[0].verdict
  })(), 'unaffected')

  // HONEST SCOPE NOTE. Filtering targetIps is load-bearing and proved above.
  // Filtering protectedIdentities is DEFENCE IN DEPTH with no demonstrated
  // exploit path: dialMatches already skips empty ids, and a token like "IP" is
  // a structurally valid name, so the filter only removes bracketed junk such as
  // "<no" / "value>". Reverting it breaks no test, and that is recorded here
  // rather than papered over with a contrived case.
  t('a bracketed placeholder cannot become a protected identity',
    nameIdentities('stylique-dashboard <no value>').join(','), 'stylique-dashboard')
  t('…though a bare word like "IP" IS a structurally valid name, and is kept',
    nameIdentities('IP').join(','), 'IP')

  console.log('-- AN EXITED TARGET MAKES A LITERAL-IP DIAL UNDETERMINED')
  const litRoute = {
    server: 'srv0', routeIndex: 0, hostMatchers: ['x'], pathMatchers: [],
    handlers: [{
      handlerPath: 'apps/http/servers/srv0/routes/0/handle/0', position: 0,
      handler: 'reverse_proxy', addressable: true,
      upstreams: [{ index: 0, dial: '172.18.0.77:4100', extraKeyCount: 0 }],
    }],
  }
  const NO_IP_IDS = ['stylique-os']
  t('target EXITED (no address) + literal-IP dial on the target port -> undetermined',
    classifyRoute(litRoute, NO_IP_IDS, PROT_IDS, { targetPort: 4100, targetHasIp: false }).verdict, 'undetermined')
  // NEGATIVE CONTROLS: the rule must not fire when it should not.
  t('CONTROL: a DIFFERENT port is not undetermined',
    classifyRoute(litRoute, NO_IP_IDS, PROT_IDS, { targetPort: 9999, targetHasIp: false }).verdict, 'unaffected')
  t('CONTROL: when the target HAS an address, name matching settles it',
    classifyRoute(litRoute, NO_IP_IDS, PROT_IDS, { targetPort: 4100, targetHasIp: true }).verdict, 'unaffected')
  t('CONTROL: a NAMED protected upstream on the target port is not undetermined', (() => {
    const r = JSON.parse(JSON.stringify(litRoute))
    r.handlers[0].upstreams = [{ index: 0, dial: 'stylique-dashboard:4100', extraKeyCount: 0 }]
    return classifyRoute(r, NO_IP_IDS, PROT_IDS, { targetPort: 4100, targetHasIp: false }).verdict
  })(), 'unaffected')
  // PREMISE INVERTED BY THE FAIL-CLOSED FIX. A null port used to mean "no port
  // restriction", so this asserted 'unaffected'. It now means the dial cannot be
  // attributed at all, which is the correct refusal.
  t('a null targetPort makes attribution IMPOSSIBLE, not permissive',
    classifyRoute(litRoute, NO_IP_IDS, PROT_IDS, { targetPort: null, targetHasIp: false }).verdict, 'undetermined')
  // A literal IP that IS a known protected backend is attributable, so the rule
  // must stay quiet. Found by a fixture collision: 172.18.0.9 is in PROT_IDS.
  t('CONTROL: a literal IP that is a KNOWN protected backend is not undetermined', (() => {
    const r = JSON.parse(JSON.stringify(litRoute))
    r.handlers[0].upstreams = [{ index: 0, dial: '172.18.0.9:4100', extraKeyCount: 0 }]
    return classifyRoute(r, NO_IP_IDS, PROT_IDS, { targetPort: 4100, targetHasIp: false }).verdict
  })(), 'unaffected')

  t('a dial by container name matches', dialMatches('stylique-os:4100', TARGET_IDS), true)
  t('a dial by ip matches', dialMatches('172.18.0.5:4100', TARGET_IDS), true)
  t('an unrelated dial does not match', dialMatches('postiz:5000', TARGET_IDS), false)
  // THE PORT IS NOT AN IDENTITY. Another container on 4100 must not be read as
  // the target, or the patch would remove somebody else's upstream.
  t('a DIFFERENT host on the target PORT does not match', dialMatches('other-svc:4100', TARGET_IDS), false)
  t('a host prefixed by the name does not false-match', dialMatches('stylique-os-staging:4100', TARGET_IDS), false)
  t('a dotted alias does match', dialMatches('stylique-os.styliquenet:4100', TARGET_IDS), true)

  console.log('-- route classification')
  t('a route serving only the target is route-exclusive', v(route()), 'route-exclusive')
  t('a route serving nothing of ours is unaffected',
    v(route({ handlers: [hdl(0, ['postiz:5000'])] })), 'unaffected')
  t('the target sharing ONE handler with a protected backend is upstream-shared',
    v(route({ handlers: [hdl(0, ['stylique-os:4100', 'stylique-dashboard:80'])] })), 'upstream-shared')
  t('the target alone in its handler beside a protected handler is would-orphan',
    v(route({ handlers: [hdl(0, ['stylique-os:4100']), hdl(1, ['stylique-dashboard:80'])] })), 'would-orphan')
  t('an UNRECOGNISED backend beside the target is treated as shared, not exclusive',
    v(route({ handlers: [hdl(0, ['stylique-os:4100', 'mystery:9000'])] })), 'upstream-shared')

  console.log('-- addressability')
  // A handler the probe could not address unambiguously cannot be patched.
  t('an impacted handler with unknown nesting is undetermined',
    v(route({ handlers: [hdl(0, ['stylique-os:4100', 'stylique-dashboard:80'], { addressable: false })] })), 'undetermined')
  t('an impacted handler with no config path is undetermined',
    v(route({ handlers: [hdl(0, ['stylique-os:4100', 'stylique-dashboard:80'], { handlerPath: null })] })), 'undetermined')
  t('CONTROL: an UNAFFECTED unaddressable handler does not block',
    v(route({ handlers: [hdl(0, ['stylique-os:4100', 'stylique-dashboard:80']), hdl(1, ['postiz:5000'], { addressable: false })] })), 'upstream-shared')
  // Nested subroute handlers ARE addressable, and their path is exact.
  {
    const nested = route({ handlers: [
      hdl(0, [], { handler: 'subroute' }),
      { handlerPath: `${RP}/0/routes/0/handle/0`, position: 0, handler: 'reverse_proxy',
        upstreamDials: ['stylique-os:4100', 'stylique-dashboard:80'], addressable: true },
    ] })
    t('a NESTED subroute handler is addressable and classifies', v(nested), 'upstream-shared')
    const st = decide(probe({ routes: [nested] })).patch.steps
    t('…and its step carries the nested path', st[0].configPath, `${RP}/0/routes/0/handle/0/upstreams`)
  }

  console.log('-- fail closed')
  t('unreadable runtime config blocks', decide(probe({ caddyRuntimeReadable: false })).patchable, false)
  t('no host parser blocks', decide(probe({ parserAvailable: false })).patchable, false)
  t('unparsed config blocks', decide(probe({ parsed: false, routes: null })).patchable, false)
  t('a malformed runtime hash blocks', decide(probe({ caddyRuntimeConfigSha256: 'nope' })).patchable, false)
  t('would-orphan blocks the patch',
    decide(probe({ routes: [route({ handlers: [hdl(0, ['stylique-os:4100']), hdl(1, ['stylique-dashboard:80'])] })] })).patchable, false)
  // Unaddressable shapes must fail closed at the DECIDE level too, not merely
  // classify to `undetermined` somewhere out of sight.
  t('an unaddressable impacted handler blocks the patch',
    decide(probe({ routes: [route({ handlers: [hdl(0, ['stylique-os:4100', 'stylique-dashboard:80'], { addressable: false })] })] })).patchable, false)
  t('a missing handler path blocks the patch',
    decide(probe({ routes: [route({ handlers: [hdl(0, ['stylique-os:4100', 'stylique-dashboard:80'], { handlerPath: null })] })] })).patchable, false)
  t('a route with no routePath blocks the patch',
    decide(probe({ routes: [route({ routePath: null })] })).patchable, false)
  t('finding NO impacted route blocks (the probes disagree)',
    decide(probe({ routes: [route({ handlers: [hdl(0, ['postiz:5000'])] })] })).patchable, false)

  console.log('-- THE TWO-SHARED-HANDLERS COUNTEREXAMPLE')
  // The defect that shipped at 9b384bd. Two reverse_proxy handlers, each pairing
  // the target with a DIFFERENT protected backend. The route-wide view produced
  // ONE step whose keep-list fused both — applying it would have put postiz into
  // the dashboard's handler and the dashboard into postiz's.
  {
    const twoShared = route({
      hostMatchers: ['multi.example.com'],
      handlers: [
        hdl(0, ['stylique-os:4100', 'stylique-dashboard:80']),
        hdl(1, ['stylique-os:4100', 'postiz:5000']),
      ],
    })
    const d = decide(probe({ routes: [twoShared], protectedIdentities: 'stylique-dashboard postiz twinai-worker' }))
    t('it is patchable', d.patchable, true)
    t('TWO impacted handlers produce TWO steps', d.patch.steps.length, 2)
    t('step 0 addresses handler 0 ONLY', d.patch.steps[0].configPath, `${RP}/0/upstreams`)
    t('step 1 addresses handler 1 ONLY', d.patch.steps[1].configPath, `${RP}/1/upstreams`)
    t('step 0 keeps ONLY its own backend',
      JSON.stringify(d.patch.steps[0].keepUpstreams), JSON.stringify(['stylique-dashboard:80']))
    t('step 1 keeps ONLY its own backend',
      JSON.stringify(d.patch.steps[1].keepUpstreams), JSON.stringify(['postiz:5000']))
    t('step 0 deletes ONLY its own target index', JSON.stringify(d.patch.steps[0].deletePaths), JSON.stringify([`${RP}/0/upstreams/0`]))
    t('step 1 deletes ONLY its own target index', JSON.stringify(d.patch.steps[1].deletePaths), JSON.stringify([`${RP}/1/upstreams/0`]))
    // Scoped to what would actually be RUN. The losslessness note mentions the
    // word PUT to explain what is no longer done; prose is not an instruction.
    t('no rehearsal issues a PUT or whole-array write',
      d.patch.steps.some((x) => /\bPUT\b|\bPATCH\b/.test(x.rehearsal ?? '')), false)
    t('every shared step rehearses DELETE only',
      d.patch.steps.every((x) => (x.rehearsal ?? '').includes('-X DELETE')), true)
    // The exact fusion that made the old output invalid.
    const fused = d.patch.steps.some((x) =>
      (x.keepUpstreams ?? []).includes('stylique-dashboard:80') && (x.keepUpstreams ?? []).includes('postiz:5000'))
    t('NO step fuses backends from different handlers', fused, false)
    t('each step names its OWN ordered index/dial list',
      d.patch.steps[0].preconditions.some((x) =>
        x.includes(`${RP}/0/upstreams`) && x.includes(JSON.stringify([
          { index: 0, dial: 'stylique-os:4100' }, { index: 1, dial: 'stylique-dashboard:80' }]))), true)
    t('…and step 1 names ITS own, not step 0\'s',
      d.patch.steps[1].preconditions.some((x) =>
        x.includes(`${RP}/1/upstreams`) && x.includes(JSON.stringify([
          { index: 0, dial: 'stylique-os:4100' }, { index: 1, dial: 'postiz:5000' }]))), true)
    t('each step binds each target index AND its dial',
      d.patch.steps[0].preconditions.some((x) => x.includes(`${RP}/0/upstreams/0 has dial stylique-os:4100`)), true)
    // The exact-path assertion must be exercised on SHARED-handler steps. Run
    // only against the route-exclusive fixture it was vacuous: that step's
    // configPath IS the route path, which its precondition trivially contains.
    t('every SHARED step binds its exact /upstreams path',
      d.patch.steps.every((x) => x.preconditions.some((pc) => pc.includes(x.configPath))), true)
  }

  console.log('-- positive controls: a single shared handler stays a single step')
  {
    const one = route({ handlers: [hdl(0, ['stylique-os:4100', 'stylique-dashboard:80'])] })
    const d = decide(probe({ routes: [one] }))
    t('one shared handler -> exactly one step', d.patch.steps.length, 1)
    t('…keeping only the protected backend',
      JSON.stringify(d.patch.steps[0].keepUpstreams), JSON.stringify(['stylique-dashboard:80']))
    t('…addressed at that handler, not the route', d.patch.steps[0].configPath, `${RP}/0/upstreams`)
  }

  console.log('-- LOSSLESSNESS: a protected upstream carrying extra metadata')
  // The 0a91974 defect. `stylique-dashboard` has max_requests (extraKeyCount 1).
  // The old rehearsal PUT the whole array rebuilt from {dial} only, silently
  // discarding it. The corrected plan must never write that object at all.
  {
    const meta = route({ handlers: [hdl(0, ['stylique-os:4100', ['stylique-dashboard:80', 1]])] })
    const d = decide(probe({ routes: [meta] }))
    t('it is patchable', d.patchable, true)
    const st = d.patch.steps[0]
    t('the step DELETES rather than replaces', st.action.startsWith('DELETE only'), true)
    t('it deletes exactly the target index', JSON.stringify(st.deletePaths), JSON.stringify([`${RP}/0/upstreams/0`]))
    // The decisive assertion: the protected entry's ADDRESS never appears in
    // anything the step would write.
    t('the protected upstream index is NEVER a write target',
      (st.deletePaths ?? []).some((x) => x.endsWith('/upstreams/1')), false)
    t('no serialised {dial} array is emitted for the survivors',
      /\{"dial":"stylique-dashboard:80"\}/.test(st.rehearsal ?? ''), false)
    t('the step states its losslessness and counts the metadata-bearing survivor',
      /1 of them carry fields beyond/.test(st.losslessness), true)
    t('a precondition requires the survivor to remain after deletion',
      st.preconditions.some((x) => x.includes('must still contain exactly [stylique-dashboard:80]')), true)
  }

  console.log('-- MULTIPLE target entries + index shift')
  {
    // BOTH target entries are on the TARGET PORT. This fixture used
    // `stylique-os:4101` as the second entry, which the port-blind matcher
    // happily attributed to the 4100 target — see the negative control below.
    const multi = route({ handlers: [hdl(0, [
      'stylique-os:4100', 'stylique-dashboard:80', 'stylique-os.styliquenet:4100', 'postiz:5000'])] })
    const d = decide(probe({ routes: [multi], protectedIdentities: 'stylique-dashboard postiz twinai-worker' }))
    const st = d.patch.steps[0]
    t('both target entries are deleted', st.deletePaths.length, 2)
    // 2 BEFORE 0. Ascending would delete 0, shifting index 2 down to 1, and the
    // second delete would then remove stylique-dashboard.
    t('deletes are ordered DESCENDING by index',
      JSON.stringify(st.deletePaths), JSON.stringify([`${RP}/0/upstreams/2`, `${RP}/0/upstreams/0`]))
    t('the ordering hazard is stated', /DESCENDING/.test(st.ordering), true)
    t('both survivors are kept', JSON.stringify(st.keepUpstreams), JSON.stringify(['stylique-dashboard:80', 'postiz:5000']))
    // MUTATION CONTROL: ascending order would strand a protected backend.
    const asc = [...st.deletePaths].sort()
    t('CONTROL: ascending order differs — it is not accidentally the same',
      JSON.stringify(asc) === JSON.stringify(st.deletePaths), false)
  }

  console.log('-- THE PORT IS PART OF TARGET IDENTITY (regression: head 9f8c7cf)')
  {
    // OLD HEAD: dialMatches ignored the port, so ANY port on the target host was
    // attributed to the 4100 target and proposed for deletion. A container can
    // serve several ports; only the one being retired is this stage's business.
    t('OLD-HEAD BEHAVIOUR: port-blind matching attributed :9999 to the target',
      dialMatches('stylique-os:9999', ['stylique-os']), true)
    t('CORRECTED: :9999 is NOT the 4100 target',
      dialMatches('stylique-os:9999', ['stylique-os'], 4100), false)
    t('CORRECTED: :4100 still is', dialMatches('stylique-os:4100', ['stylique-os'], 4100), true)

    // REAL PATH: a route serving only stylique-os:9999 must not be removable.
    const other = route({ handlers: [hdl(0, ['stylique-os:9999'])] })
    const d = decide(probe({ routes: [other] }))
    t('real path: a :9999 upstream is not classified as the target',
      d.classified[0].handlers[0].targetUpstreams.length, 0)
    t('…so nothing is proposed for deletion', d.classified[0].verdict, 'unaffected')

    // POSITIVE CONTROL: the same shape on 4100 IS removable.
    const onPort = route({ handlers: [hdl(0, ['stylique-os:4100', 'stylique-dashboard:80'])] })
    const d2 = decide(probe({ routes: [onPort] }))
    t('CONTROL: the same host on 4100 IS the target', d2.classified[0].handlers[0].targetUpstreams.length, 1)

    // MIXED: only the 4100 entry is deleted; the 9999 entry survives.
    const mixed = route({ handlers: [hdl(0, ['stylique-os:4100', 'stylique-os:9999', 'stylique-dashboard:80'])] })
    const d3 = decide(probe({ routes: [mixed] }))
    t('MIXED: exactly one upstream is targeted', d3.classified[0].handlers[0].targetUpstreams.length, 1)
    t('…and the :9999 entry is KEPT', d3.classified[0].handlers[0].keepUpstreams.some((u) => u.dial === 'stylique-os:9999'), true)

    // PROTECTED identities stay host-wide: any port of a protected backend survives.
    t('a protected backend matches host-wide, whatever its port',
      dialMatches('stylique-dashboard:8443', PROT_IDS), true)

    // Bracketed IPv6 carries a port; a bare IPv6 literal does not.
    t('bracketed IPv6 on the target port matches',
      dialMatches('[fd00::5]:4100', ['fd00::5'], 4100), true)
    t('bracketed IPv6 on another port does not',
      dialMatches('[fd00::5]:9999', ['fd00::5'], 4100), false)
    t('a BARE IPv6 literal is not read as host:port',
      dialPort('fd00::5'), null)
  }

  console.log('-- PARSER STATUS is a category, reported and consumed')
  {
    t('a program failure BLOCKS and names itself', (() => {
      const d = decide(probe({ parserStatus: 'program_failed', parsed: false, routes: [] }))
      return d.blockers.some((b) => /FAILED TO RUN/.test(b)) && d.patchable === false
    })(), true)
    t('…and is distinguishable from unparseable DATA', (() => {
      const d = decide(probe({ parserStatus: 'data_invalid', parsed: false, routes: [] }))
      return d.blockers.some((b) => /data_invalid/.test(b))
    })(), true)
    t('…and from no parser at all', (() => {
      const d = decide(probe({ parserStatus: 'unavailable', parsed: false, routes: [] }))
      return d.blockers.some((b) => /unavailable/.test(b))
    })(), true)
    // MANDATORY, NOT OPTIONAL. The check was `ps !== undefined && !includes(ps)`,
    // so a probe that omitted the field entirely skipped the enum. An absent
    // status is not a status: an older probe, a truncated artifact and a crashed
    // extractor all present as "no field".
    const noStatus = () => { const o = probe({ routes: [] }); delete o.parserStatus; return o }
    t('OLD HEAD: a MISSING status raised no enum blocker', (() => {
      const ps = noStatus().parserStatus
      return ps !== undefined && !PARSER_STATUSES.includes(ps)   // the old condition
    })(), false)
    t('CORRECTED: a MISSING status BLOCKS', (() => {
      const d = decide(noStatus())
      return d.blockers.some((b) => /did not report a valid parser status/.test(b)) && d.patchable === false
    })(), true)
    t('a NULL status blocks', (() => {
      const d = decide(probe({ parserStatus: null, routes: [] }))
      return d.blockers.some((b) => /did not report a valid parser status/.test(b)) && d.patchable === false
    })(), true)
    t('an UNKNOWN status blocks', (() => {
      const d = decide(probe({ parserStatus: 'fine', routes: [] }))
      return d.blockers.some((b) => /did not report a valid parser status/.test(b)) && d.patchable === false
    })(), true)
    t('a numeric status blocks', (() => {
      const d = decide(probe({ parserStatus: 0, routes: [] }))
      return d.blockers.some((b) => /did not report a valid parser status/.test(b))
    })(), true)
    t('POSITIVE: ok adds no status blocker', (() => {
      const d = decide(probe({ parserStatus: 'ok' }))
      return d.blockers.some((b) => /valid parser status/.test(b))
    })(), false)
    t('CONTROL: ok adds no parser blocker', (() => {
      const d = decide(probe({ parserStatus: 'ok' }))
      return d.blockers.some((b) => /parser/.test(b))
    })(), false)
    t('the status is carried onto the decision', decide(probe({ parserStatus: 'ok' })).parserStatus, 'ok')
    t('…and rendered in the report', /parser status/.test(render(decide(probe({ parserStatus: 'ok' })))), true)
  }

  console.log('-- THE TARGET PORT IS MANDATORY (a missing one is a refusal, not host-wide)')
  {
    // OLD HEAD: `Number.isInteger(a.targetPort) ? a.targetPort : null` meant a
    // missing port became null, dialMatches read null as "no port restriction",
    // and stylique-os:9999 was attributed to the 4100 target and made patchable.
    const nine = () => route({ handlers: [hdl(0, ['stylique-os:9999'])] })
    t('OLD-HEAD BEHAVIOUR: host-wide matching attributed :9999 with no port',
      dialMatches('stylique-os:9999', ['stylique-os'], null), true)
    t('CORRECTED: target attribution with no usable port is UNATTRIBUTABLE',
      dialMatchesTarget('stylique-os:9999', ['stylique-os'], null), null)

    const bad = (tp) => {
      const o = probe({ routes: [nine()] })
      if (tp === '__delete__') delete o.targetPort; else o.targetPort = tp
      return decide(o)
    }
    for (const [label, tp] of [
      ['missing', '__delete__'], ['null', null], ['a string', '4100'],
      ['zero', 0], ['negative', -1], ['above 65535', 70000], ['fractional', 41.5],
    ]) {
      const d = bad(tp)
      t(`targetPort ${label} -> blocks`, d.blockers.some((b) => /usable target port/.test(b)), true)
      t(`targetPort ${label} -> NO patch is produced`, d.patchable, false)
      t(`targetPort ${label} -> the route is undetermined, not classified`,
        d.classified[0].verdict, 'undetermined')
    }
    // POSITIVE + BOUNDARIES.
    t('CONTROL: a valid port classifies normally', decide(probe({ routes: [nine()] })).classified[0].verdict, 'unaffected')
    t('BOUNDARY: port 1 is usable', isPort(1), true)
    t('BOUNDARY: port 65535 is usable', isPort(65535), true)
    t('BOUNDARY: port 65536 is not', isPort(65536), false)
    // Protected matching stays host-wide by design.
    t('protected identities still match host-wide', dialMatches('stylique-dashboard:8443', PROT_IDS), true)
  }

  console.log('-- THE LIVE NESTED SHAPE (regression: run 30332344684)')
  {
    // Outer host route -> subroute -> sibling nested routes. stylique-os under
    // /os/*, stylique-dashboard under /*. This is the shape on the box.
    // NOT ALL OF THIS IS ARTIFACT-BACKED, AND THE FIXTURE SAYS WHICH.
    //   proven by artifact 8677841138 : the nesting, the route paths, the `/os/*`
    //                                   and `/*` matchers, the inert index-0
    //                                   route, the dials.
    //   NOT proven by that artifact    : `terminal`, `group`, `parentRoutesCount`
    //                                   — the extractor did not emit them at that
    //                                   head, so they are ASSUMPTIONS here.
    // `terminal: false` below is therefore a modelling assumption, not a live
    // reading. It is the conservative one: false means "evaluation continues",
    // which is the case that can expose a backend. A fresh probe at this head is
    // what turns it into evidence, and until then the tool refuses anyway —
    // `parentRoutesCount: null` in a real probe is a hard refusal.
    // matchSets mirrors what the extractor now emits: ONE entry per matcher
    // object, structure intact. host/path stay as the flattened display view,
    // exactly as on the host, so a test that accidentally reads them instead of
    // the sets fails the same way production would.
    const ctx = (routePath, host, path, idx, parent, over = {}) => ({
      routePath, host, path, unsupportedMatcherKeys: [],
      matchSets: (host.length || path.length) ? [{ host, path, unsupportedKeys: [] }] : [],
      routeIndexInParent: idx, parentRoutesArrayPath: parent,
      terminal: false, hasGroup: false, handlerTypes: [], parentRoutesCount: null,
      ...over,
    })
    const OUTER = 'apps/http/servers/srv0/routes/0'
    const SUBR = `${OUTER}/handle/0/routes`
    const outerCtx = ctx(OUTER, ['138-201-119-239.sslip.io'], [], 0, 'apps/http/servers/srv0/routes',
      { handlerTypes: ['subroute'], parentRoutesCount: 1 })
    // SIBS is the true length of the nested `routes` array in each fixture. The
    // model refuses when it cannot account for every entry, so fixtures must
    // declare it rather than let it be inferred from what happened to be seen.
    const nested = (i, pathMatch, dial, over = {}) => {
      const { siblingCount = 3, terminal = false, handler = 'reverse_proxy' } = over
      const rp = `${SUBR}/${i}`
      const inner = `${rp}/handle/0/routes/0`
      return {
        handlerPath: `${inner}/handle/0`, position: 0, handler, addressable: true,
        upstreams: [{ index: 0, dial, extraKeyCount: 0 }], upstreamDials: [dial], upstreamCount: 1,
        ownerRoutePath: inner, nestingDepth: 2,
        matcherChain: [
          outerCtx,
          ctx(rp, [], [pathMatch], i, SUBR, { terminal, handlerTypes: ['subroute'], parentRoutesCount: siblingCount }),
          ctx(inner, [], [], 0, `${rp}/handle/0/routes`, { handlerTypes: [handler], parentRoutesCount: 1 }),
        ],
        unsupportedMatcherKeys: [],
      }
    }
    // The live config also has an INERT nested route at index 0 — headers and
    // encode, no upstreams at all. It belongs in the fixture: without it the
    // "must contain a target handler" filter looks unnecessary, and with it,
    // dropping that filter makes the inert route a candidate and proposes
    // deleting the wrong sibling.
    const inert = (siblingCount = 3) => ({
      handlerPath: `${SUBR}/0/handle/0`, position: 0, handler: 'headers', addressable: true,
      upstreams: [], upstreamDials: [], upstreamCount: 0,
      ownerRoutePath: `${SUBR}/0`, nestingDepth: 1,
      matcherChain: [outerCtx, ctx(`${SUBR}/0`, [], [], 0, SUBR,
        { handlerTypes: ['headers', 'encode'], parentRoutesCount: siblingCount })],
      unsupportedMatcherKeys: [],
    })
    const live = (over = {}) => route({
      routePath: OUTER, hostMatchers: ['138-201-119-239.sslip.io'], pathMatchers: [],
      handlers: [inert(), nested(1, '/os/*', 'stylique-os:4100'), nested(2, '/*', 'stylique-dashboard:80')],
      ...over,
    })

    const c = classifyRoute(live(), TARGET_IDS, PROT_IDS, { targetPort: 4100, targetHasIp: true })
    // OLD HEAD: with no ancestor context this was would-orphan and unpatchable —
    // a correct refusal, but it could not name the thing to remove.
    t('OLD-HEAD VERDICT would have been would-orphan (no nested unit known)',
      targetExclusiveRoute(live().handlers.map((h) => ({ ...h, matcherChain: [] }))), null)
    t('CORRECTED: the verdict is nested-route-exclusive', c.verdict, 'nested-route-exclusive')
    t('…and it names the EXACT nested route to remove', c.exclusiveRoute.routePath, `${SUBR}/1`)
    t('…with its parent routes array', c.exclusiveRoute.parentRoutesArrayPath, SUBR)
    t('…and its index in that array', c.exclusiveRoute.routeIndexInParent, 1)
    t('…and the path it serves', c.exclusiveRoute.pathMatchers.join(','), '/os/*')
    t('…and it is NOT the outer host route', c.exclusiveRoute.routePath === OUTER, false)
    // The inert sibling (headers/encode, no upstreams) must never be chosen:
    // it contains no target handler, and deleting it would remove response
    // handling from every path this route serves.
    t('…and it is NOT the inert headers/encode sibling', c.exclusiveRoute.routePath === `${SUBR}/0`, false)

    // NEGATIVE CONTROL: swap which sibling holds the target.
    const swapped = route({
      routePath: OUTER, hostMatchers: ['138-201-119-239.sslip.io'], pathMatchers: [],
      handlers: [nested(1, '/os/*', 'stylique-dashboard:80'), nested(2, '/*', 'stylique-os:4100')],
    })
    const c2 = classifyRoute(swapped, TARGET_IDS, PROT_IDS, { targetPort: 4100, targetHasIp: true })
    t('SWAPPED: the OTHER nested route is named', c2.exclusiveRoute.routePath, `${SUBR}/2`)
    t('SWAPPED: index follows the target, not the fixture order', c2.exclusiveRoute.routeIndexInParent, 2)

    // NEGATIVE CONTROL: target and protected in the SAME nested route -> no
    // exclusive unit exists, and it must refuse rather than delete the route.
    const shared = route({
      routePath: OUTER, hostMatchers: ['h'], pathMatchers: [],
      handlers: [(() => {
        const h = nested(1, '/os/*', 'stylique-os:4100')
        h.upstreams.push({ index: 1, dial: 'stylique-dashboard:80', extraKeyCount: 0 })
        h.upstreamDials.push('stylique-dashboard:80'); h.upstreamCount = 2
        return h
      })()],
    })
    const c3 = classifyRoute(shared, TARGET_IDS, PROT_IDS, { targetPort: 4100, targetHasIp: true })
    t('SHARED nested route: not nested-route-exclusive', c3.verdict === 'nested-route-exclusive', false)
    t('…it is upstream-shared, dropping only the target entry', c3.verdict, 'upstream-shared')

    // NEGATIVE CONTROL: an unsupported matcher anywhere in the chain refuses.
    const weird = live()
    weird.handlers[0].unsupportedMatcherKeys = ['header']
    const c4 = classifyRoute(weird, TARGET_IDS, PROT_IDS, { targetPort: 4100, targetHasIp: true })
    t('an UNSUPPORTED matcher shape refuses', c4.verdict, 'undetermined')
    t('…and names the key, never its value', /header/.test(c4.reason) && !/=/.test(c4.reason), true)

    // targetExclusiveRoute consumes CLASSIFIED handlers (it needs keepUpstreams),
    // so it is fed the classifier's output, not the raw fixture.
    t('the outer route is NOT the unit while a sibling serves the dashboard',
      targetExclusiveRoute(c.handlers).routePath === OUTER, false)
    t('…and raw, unclassified handlers yield no unit at all (fail closed)',
      targetExclusiveRoute(live().handlers), null)
    // On the LIVE shape the verdict is identified and still not patchable —
    // because the removal is not a detach, not because the remedy is missing.
    t('the live nested shape is NOT patchable', decide(probe({ routes: [live()] })).patchable, false)
    t('…and the blocker names the exact nested route and its index', (() => {
      const d = decide(probe({ routes: [live()] }))
      return d.blockers.some((b) => b.includes(`${SUBR}/1`) && /index 1 of/.test(b))
    })(), true)
    t('…and no upstream-deletion step is drafted for it', (() => {
      const d = decide(probe({ routes: [live()] }))
      return d.patch === null
    })(), true)

    // ---------------------------------------------------------------------
    // POST-EDIT ROUTING SEMANTICS. "The route reaches only the target" is not
    // "removing it detaches the target". On this host it is the opposite.
    // ---------------------------------------------------------------------
    console.log('-- POST-REMOVAL ROUTING (fall-through gate)')
    {
      const pr = c.postRemoval
      t('the live shape is modellable', pr.supported, true)
      t('MUTATION CONTROL: removing /os/* is NOT isolated on the live shape', pr.isolated, false)
      t('the analysis is over the removed MATCHER SET, not a sampled path',
        pr.outcomes.map((o) => o.pattern).join(','), '{host *, path /os/*}')
      t('…and it FALLS THROUGH rather than 404ing', pr.outcomes[0].outcome, 'exposes-backend')
      t('…onto the exact sibling route that takes over', pr.outcomes[0].landedRoutePath, `${SUBR}/2`)
      t('…naming the backend that would newly serve the retired public path',
        pr.outcomes[0].exposedDials.join(','), 'stylique-dashboard:80')

      // Sibling fingerprints: an index is only meaningful if the route at that
      // index is provably the same route at apply time.
      t('every sibling in the parent array is fingerprinted', pr.siblingFingerprints.length, 3)
      t('…the fingerprint is a sha256', /^[0-9a-f]{64}$/.test(pr.siblingFingerprints[1].sha256), true)
      const fpOf = (matchSets, over = {}) => siblingFingerprint({
        index: 1, routePath: 'r', matchSets, hostMatchers: [], pathMatchers: [],
        terminal: false, handlerTypes: [], otherDials: [], ...over,
      })
      t('…and it changes when the route\'s matchers change',
        fpOf([{ host: [], path: ['/os/*'] }]) !== fpOf([{ host: [], path: ['/os2/*'] }]), true)
      // THE CROSS-PRODUCT COUNTEREXAMPLE, as a fingerprint. These two routes
      // flatten to the SAME host list and the SAME path list. A fingerprint over
      // the flattened view cannot tell them apart, yet they serve different
      // request sets — A//y and B//x are requests only the second one answers.
      t('…and SWAPPED matcher pairings fingerprint differently',
        fpOf([{ host: ['a.example'], path: ['/x'] }, { host: ['b.example'], path: ['/y'] }])
        !== fpOf([{ host: ['a.example'], path: ['/y'] }, { host: ['b.example'], path: ['/x'] }]), true)
      t('…and when terminality changes, because that changes what runs next', (() => {
        const a = siblingFingerprint({ index: 2, routePath: 'r', hostMatchers: [], pathMatchers: ['/*'], terminal: false, handlerTypes: [], otherDials: [] })
        const b = siblingFingerprint({ index: 2, routePath: 'r', hostMatchers: [], pathMatchers: ['/*'], terminal: true, handlerTypes: [], otherDials: [] })
        return a !== b
      })(), true)

      const d = decide(probe({ routes: [live()] }))
      const ft = d.blockers.filter((b) => /NOT a lossless detach/.test(b))
      t('decide() REFUSES on the fall-through, as a blocker of its own', ft.length, 1)
      t('…it names the exposed backend', /stylique-dashboard:80/.test(ft[0]), true)
      t('…it states the decision is the owner\'s', /OWNER DECISION REQUIRED/.test(ft[0]), true)
      t('…it offers the explicit-404/410 option', /static_response \(404 or 410\)/.test(ft[0]), true)
      t('…it offers the intentional-fallback option', /DECLARE the fallback intentional/.test(ft[0]), true)
      t('…and encodes NEITHER as a patch', d.patch, null)

      // OLD-HEAD COUNTEREXAMPLE. Before this gate the classification carried no
      // post-removal analysis at all, and the only thing standing between that
      // verdict and a fall-through was the patch builder not being written yet.
      // A missing analysis must refuse on its own terms.
      t('OLD HEAD: a classification with no post-removal analysis is REFUSED',
        postRemovalBlockers({ ...c, postRemoval: undefined })
          .some((b) => /never analysed/.test(b)), true)
      // The old extractor emitted neither `terminal` nor `parentRoutesCount`.
      // Fed that, the gate must fail closed, not read absence as "nothing else
      // matches".
      t('OLD HEAD: a chain with no parent route count fails CLOSED', (() => {
        const stripped = c.handlers.map((h) => ({
          ...h,
          matcherChain: h.matcherChain.map(({ parentRoutesCount, ...rest }) => rest),
        }))
        const r = postRemovalRouting(stripped, c.exclusiveRoute)
        return r.supported === false && /how many routes the parent array holds/.test(r.reason)
      })(), true)
      t('…and an incomplete sibling list fails CLOSED', (() => {
        const short = c.handlers.map((h) => ({
          ...h,
          matcherChain: h.matcherChain.map((x) => (x.parentRoutesArrayPath === SUBR ? { ...x, parentRoutesCount: 4 } : x)),
        }))
        const r = postRemovalRouting(short, c.exclusiveRoute)
        return r.supported === false && /only 3 could be modelled/.test(r.reason)
      })(), true)
      // CONTRADICTORY EVIDENCE IS NOT A NUMBER TO PICK FROM. Two handlers under
      // the same parent array reporting different lengths means the artifact is
      // internally inconsistent — truncated, read mid-reload, or produced by a
      // buggy extractor. The old code took whichever was visited last, which
      // turned that into a confident value the completeness check then happily
      // validated against.
      const disagreeing = () => {
        let n = 0
        return c.handlers.map((h) => ({
          ...h,
          matcherChain: h.matcherChain.map((x) => (x.parentRoutesArrayPath === SUBR
            // eslint-disable-next-line no-plusplus
            ? { ...x, parentRoutesCount: 3 + (n++ % 2) } : x)),
        }))
      }
      t('DISAGREEING parent-array lengths fail CLOSED', (() => {
        const r = postRemovalRouting(disagreeing(), c.exclusiveRoute)
        return r.supported === false && /report DIFFERENT lengths/.test(r.reason)
      })(), true)
      t('…and both reported lengths are named', (() => {
        const r = postRemovalRouting(disagreeing(), c.exclusiveRoute)
        return /\(3, 4\)/.test(r.reason)
      })(), true)
      t('…the model reports every count it saw, not just one',
        siblingModel(disagreeing(), SUBR).declaredCounts.join(','), '3,4')
      t('…and refuses to name a single one', siblingModel(disagreeing(), SUBR).declaredCount, null)
      t('CONTROL: consistent counts still yield the count',
        siblingModel(c.handlers, SUBR).declaredCount, 3)
      t('…and decide() surfaces the contradiction as a blocker', (() => {
        const contradictory = live()
        let n = 0
        contradictory.handlers = contradictory.handlers.map((h) => ({
          ...h,
          matcherChain: h.matcherChain.map((x) => (x.parentRoutesArrayPath === SUBR
            // eslint-disable-next-line no-plusplus
            ? { ...x, parentRoutesCount: 3 + (n++ % 2) } : x)),
        }))
        const d = decide(probe({ routes: [contradictory] }))
        return d.patchable === false && d.blockers.some((b) => /report DIFFERENT lengths/.test(b))
      })(), true)
      t('…and a path matcher shape the model does not represent fails CLOSED', (() => {
        const weirdPath = c.handlers.map((h) => ({
          ...h,
          matcherChain: h.matcherChain.map((x) => (x.routeIndexInParent === 1 && x.parentRoutesArrayPath === SUBR
            ? { ...x, matchSets: [{ host: [], path: ['/os/*/edit'], unsupportedKeys: [] }] } : x)),
        }))
        const r = postRemovalRouting(weirdPath, c.exclusiveRoute)
        return r.supported === false && /this model does not represent/.test(r.reason)
      })(), true)
      t('…as does an unmodelled matcher KEY inside a set', (() => {
        const hdr = c.handlers.map((h) => ({
          ...h,
          matcherChain: h.matcherChain.map((x) => (x.routeIndexInParent === 2 && x.parentRoutesArrayPath === SUBR
            ? { ...x, matchSets: [{ host: [], path: ['/*'], unsupportedKeys: ['header'] }] } : x)),
        }))
        const r = postRemovalRouting(hdr, c.exclusiveRoute)
        return r.supported === false && /header/.test(r.reason)
      })(), true)
      // GROUPS ARE NOT ASSUMED. Their evaluation rule is Caddy's, not ours.
      t('…and a route GROUP on any sibling fails CLOSED rather than being assumed', (() => {
        const g = c.handlers.map((h) => ({
          ...h,
          matcherChain: h.matcherChain.map((x) => (x.routeIndexInParent === 2 && x.parentRoutesArrayPath === SUBR
            ? { ...x, hasGroup: true } : x)),
        }))
        const r = postRemovalRouting(g, c.exclusiveRoute)
        return r.supported === false && /route group/.test(r.reason)
      })(), true)
      // Siblings must share an ancestry for their matchers to be comparable.
      t('…and siblings with different ancestor conjunctions fail CLOSED', (() => {
        const d = c.handlers.map((h) => ({
          ...h,
          matcherChain: h.matcherChain.map((x, i) => (i === 0 && h.matcherChain[1]?.routeIndexInParent === 2
            ? { ...x, matchSets: [{ host: ['other.example'], path: [], unsupportedKeys: [] }] } : x)),
        }))
        const r = postRemovalRouting(d, c.exclusiveRoute)
        return r.supported === false && /identical ancestor matcher chain/.test(r.reason)
      })(), true)
    }

    // ORDER PROOF. The analysis must read the parent array as an ORDERED list,
    // not a set: only siblings AFTER the removed index can take over, and the
    // FIRST of those that matches is the one that does.
    {
      const ordered = route({
        routePath: OUTER, hostMatchers: ['138-201-119-239.sslip.io'], pathMatchers: [],
        handlers: [
          inert(4),
          nested(1, '/os/*', 'stylique-os:4100', { siblingCount: 4 }),
          nested(2, '/os/legacy', 'postiz:5000', { siblingCount: 4 }),
          nested(3, '/*', 'stylique-dashboard:80', { siblingCount: 4 }),
        ],
      })
      const co = classifyRoute(ordered, TARGET_IDS, PROT_IDS, { targetPort: 4100, targetHasIp: true })
      const o = co.postRemoval.outcomes[0]
      // /os/legacy is INSIDE the removed /os/* set, so the first sibling that
      // shares a request with it is index 2 — not index 3. A sampled path
      // (`/os/probe`) misses it and names the dashboard instead, which is the
      // unsound answer this model replaced.
      t('ORDER: the first sibling sharing ANY request with the removed set is named', o.landedRoutePath, `${SUBR}/2`)
      t('…and the backend named is the one those requests reach', o.exposedDials.join(','), 'postiz:5000')
      t('…with the overlapping matcher set spelled out', o.overlappingMatchers.join(','), '{host *, path /os/legacy}')
      // ORDER, THE OTHER DIRECTION. Index 0 in the live shape is the inert
      // headers/encode route with NO path matchers, so it matches every request.
      // Reading the parent array as a SET rather than an ordered list would land
      // the probe there, report "no backend reached", and call a fall-through a
      // clean detach. Earlier siblings must never be candidates.
      t('ORDER: an EARLIER catch-all sibling is never what takes over',
        c.postRemoval.outcomes[0].landedRoutePath === `${SUBR}/0`, false)
      t('…and a set-shaped reading would have said the opposite', (() => {
        // Same siblings, same probe, ordering constraint removed by hand.
        const sibs = siblingModel(c.handlers, SUBR)
        const asSet = sibs.filter((s) => s.index !== 1)
        const first = asSet.find((s) => s.pathMatchers.length === 0
          || s.pathMatchers.some((p) => pathMatcherMatches(p, '/os/probe') === true))
        return first.index === 0 && first.reachesOther === false
      })(), true)
    }

    // POSITIVE CONTROL 1: the sibling after the target serves a DIFFERENT path.
    // Nothing matches the removed paths, Caddy answers 404, and the removal is
    // a genuine detach. Same code, same shape, opposite verdict — which is what
    // makes the refusal above a finding rather than a blanket "no".
    {
      const isolatedCfg = route({
        routePath: OUTER, hostMatchers: ['138-201-119-239.sslip.io'], pathMatchers: [],
        handlers: [
          inert(3),
          nested(1, '/os/*', 'stylique-os:4100'),
          nested(2, '/app/*', 'stylique-dashboard:80'),
        ],
      })
      const ci = classifyRoute(isolatedCfg, TARGET_IDS, PROT_IDS, { targetPort: 4100, targetHasIp: true })
      t('POSITIVE: with no later sibling matching /os/*, the removal IS isolated',
        ci.postRemoval.isolated, true)
      t('…the path is left unserved, which is what a detach means', ci.postRemoval.outcomes[0].outcome, 'unserved')
      t('…and NO fall-through blocker is raised', postRemovalBlockers(ci).length, 0)

      // WITHOUT AN ADAPT PROOF, CLEAN ROUTING IS STILL NOT A PROVEN EDIT.
      const bare = decide(probe({ routes: [isolatedCfg] }))
      t('…no blocker mentions a fall-through', bare.blockers.some((b) => /lossless detach/.test(b)), false)
      t('…but the run is NOT patchable, because the durable edit is unproven', bare.patchable, false)
      t('…and the blocker says exactly that',
        bare.blockers.some((b) => /the durable edit is UNPROVEN/.test(b)), true)
      t('…naming what the runtime path does and does not establish',
        bare.blockers.some((b) => /does not identify the source directive/.test(b)), true)
      t('…and no candidate is drafted on routing alone', bare.patch, null)

      // WITH the proof: built from the audited boot bytes, validated, and with
      // an adapted-JSON diff that is EXACTLY the audited removal.
      const PROOF = {
        // Bound to THIS probe's runtime config, not merely well-formed.
        runtimeConfigSha256: 'a'.repeat(64),
        bootFileSha256: 'b'.repeat(64),
        candidateFileSha256: 'c'.repeat(64),
        adaptedBeforeJsonSha256: 'd'.repeat(64),
        adaptedAfterJsonSha256: 'e'.repeat(64),
        validateExitCode: 0,
        jsonDiffPaths: [`${SUBR}/1`],
        backupSha256: 'b'.repeat(64),
      }
      const withProof = (over = {}) => probe({ routes: [isolatedCfg], adaptEquivalence: { ...PROOF, ...over } })
      const d = decide(withProof())
      t('…with a complete adapt-equivalence proof the run IS patchable', d.patchable, true)

      // THE EXACT CANDIDATE. One step, and it removes the ROUTE OBJECT — never
      // an upstream entry, which would leave /os/* matching with nothing behind
      // it.
      const step = d.patch.steps[0]
      t('…and the candidate removes the nested route object', step.action,
        'remove the NESTED ROUTE OBJECT from its parent routes array')
      t('…naming the exact route', step.configPath, `${SUBR}/1`)
      t('…its parent array', step.parentRoutesArrayPath, SUBR)
      t('…and its index', step.routeIndexInParent, 1)

      // The simulation is carried WITH the patch, not left in the reasoning.
      t('…the simulation proves the target unreachable afterwards', step.simulation.targetUnreachableAfter, true)
      t('…and that the removed matcher set is left unserved',
        step.simulation.patternsLeftUnserved.join(','), '{host *, path /os/*}')
      t('…and that nothing newly reaches another backend',
        step.simulation.patternsNewlyReachingOtherBackends.length, 0)

      // PRECONDITIONS PIN THE POSITION. An index is meaningless without proof
      // that the array is the one that was audited.
      t('…every sibling is pinned by fingerprint in the preconditions',
        step.preconditions.filter((p) => /fingerprint sha256 == [0-9a-f]{64}/.test(p)).length, 3)
      t('…and the array length is pinned too',
        step.preconditions.some((p) => /holds exactly 3 routes/.test(p)), true)
      t('…and the 404 outcome is stated as a precondition to verify',
        step.preconditions.some((p) => /matching \{host \*, path \/os\/\*\} match no route and Caddy answers 404/.test(p)), true)

      // VALIDATE BEFORE RELOAD. A bad config does not break one route, it drops
      // the proxy.
      t('…the candidate must be caddy-validated before any reload',
        step.validate.some((v) => /^caddy validate --config/.test(v)), true)

      // ROLLBACK IS A BACKUP FILE. The report cannot rebuild the route it
      // deleted, and it says so instead of implying otherwise.
      t('…rollback is a byte-for-byte restore, not a reconstruction',
        step.rollback.some((r) => /CANNOT reconstruct the deleted route/.test(r)), true)
      t('…and it names the digest the backup must match',
        step.rollback.some((r) => r.includes('b'.repeat(64))), true)

      // MUTATION CONTROLS ON THE PROOF ITSELF. Each one is a way the edit
      // could be real, plausible and still not the audited change.
      const gone = (over) => decide(withProof(over)).patch === null
      t('PROOF: a diff that changes MORE than the audited route is refused',
        gone({ jsonDiffPaths: [`${SUBR}/1`, `${SUBR}/2`] }), true)
      t('PROOF: a diff at a DIFFERENT route is refused', gone({ jsonDiffPaths: [`${SUBR}/2`] }), true)
      t('PROOF: an empty diff is refused', gone({ jsonDiffPaths: [] }), true)
      t('PROOF: caddy validate rejecting the candidate is refused', gone({ validateExitCode: 1 }), true)
      t('PROOF: a candidate byte-identical to the boot file is refused',
        gone({ candidateFileSha256: 'b'.repeat(64) }), true)
      t('PROOF: adapted JSON that did not change is refused',
        gone({ adaptedAfterJsonSha256: 'd'.repeat(64) }), true)
      t('PROOF: a backup that is not the pre-edit bytes is refused',
        gone({ backupSha256: 'f'.repeat(64) }), true)
      // THE PROVENANCE CHECK. A proof built from a different boot file proves
      // something about a config nobody looked at.
      t('PROOF: a proof built from a DIFFERENT boot file is refused',
        gone({ bootFileSha256: '9'.repeat(64), backupSha256: '9'.repeat(64) }), true)
      t('…and it says why', decide(withProof({ bootFileSha256: '9'.repeat(64), backupSha256: '9'.repeat(64) }))
        .blockers.some((b) => /does not descend from the bytes that were examined/.test(b)), true)
      for (const f of ADAPT_PROOF_FIELDS) {
        t(`PROOF: omitting ${f} is refused`, gone({ [f]: null }), true)
      }
      // BOUND TO THIS RUN. A proof about some other configuration, presented
      // alongside this probe, is not a proof about this configuration.
      t('PROOF: a proof bound to a DIFFERENT runtime config is refused',
        gone({ runtimeConfigSha256: '7'.repeat(64) }), true)
      t('…and it says the two describe different configurations',
        decide(withProof({ runtimeConfigSha256: '7'.repeat(64) }))
          .blockers.some((b) => /describe different configurations/.test(b)), true)
      // SECRET SAFETY IS THE FIELD SET, NOT A REDACTOR. Every permitted field is
      // a digest, an exit code or a config path; an extra field is the way
      // configuration text would travel, so the set is closed.
      t('PROOF: an unexpected field is REFUSED, not ignored',
        decide(probe({
          routes: [isolatedCfg],
          adaptEquivalence: { ...PROOF, diffText: 'basicauth admin JDJhJDE0JHc=' },
        })).patch, null)
      t('…and the refusal names the field without echoing its value', (() => {
        const b = decide(probe({
          routes: [isolatedCfg],
          adaptEquivalence: { ...PROOF, diffText: 'basicauth admin JDJhJDE0JHc=' },
        })).blockers.join('\n')
        return /unexpected field\(s\) diffText/.test(b) && !/JDJhJDE0JHc/.test(b)
      })(), true)
      // THE DIFF MUST BE POINTERS. A free-text entry is how a config line would
      // reach the artifact under the guise of a path.
      //
      // Tested by calling adaptEquivalence DIRECTLY with expectedRemovals equal
      // to the entry. Through decide() these cases are already caught by the
      // exact-equality check, so a `gone()` assertion would pass without the
      // shape check existing at all — a test that proves the wrong thing. Here
      // equality holds by construction and only the shape check can refuse.
      const shapeOnly = (entries) => adaptEquivalence(
        { adaptEquivalence: { ...PROOF, jsonDiffPaths: entries }, caddyRuntimeConfigSha256: 'a'.repeat(64), caddyBootFileSha256: 'b'.repeat(64) },
        entries,
      )
      t('PROOF: a diff entry that is not a config pointer is refused even when it is what was expected',
        shapeOnly(['reverse_proxy stylique-os:4100 # in /etc/caddy/Caddyfile']).ok, false)
      t('…with a reason naming the shape rule, not the content',
        /are not configuration pointers/.test(shapeOnly(['reverse_proxy stylique-os:4100']).reason), true)
      t('…including an entry that merely looks close',
        shapeOnly(['apps/http/servers/srv0/routes/0 and also the tls block']).ok, false)
      t('…and a non-string entry', shapeOnly([{ path: `${SUBR}/1` }]).ok, false)
      t('…while a real config pointer passes the shape rule',
        shapeOnly([`${SUBR}/1`]).ok, true)
      // NECESSARY, NOT SUFFICIENT — stated on the result itself so a passing
      // synthetic proof cannot be read as live evidence.
      t('a passing proof carries its own evidence caveat',
        /proves the checker, not the edit/.test(
          decide(withProof()).impacted[0].adaptEquivalence.evidenceNote), true)

      // MUTATION CONTROL: put the dashboard back on /*, and the same code
      // refuses and drafts nothing even WITH a valid proof.
      const exposedCfg = route({
        routePath: OUTER, hostMatchers: ['138-201-119-239.sslip.io'], pathMatchers: [],
        handlers: [inert(3), nested(1, '/os/*', 'stylique-os:4100'), nested(2, '/*', 'stylique-dashboard:80')],
      })
      const d2 = decide(probe({ routes: [exposedCfg], adaptEquivalence: PROOF }))
      t('MUTATION CONTROL: widen the sibling to /* and the candidate disappears', d2.patch, null)
      t('…even though the adapt proof is valid',
        d2.blockers.some((b) => /NOT a lossless detach/.test(b))
        && !d2.blockers.some((b) => /durable edit is UNPROVEN/.test(b)), true)
    }

    // A SECOND ROUTE STILL DIALLING THE TARGET. The subtree reaching only the
    // target never proved the target is reached only from that subtree.
    {
      const isolatedCfg = route({
        routePath: OUTER, hostMatchers: ['138-201-119-239.sslip.io'], pathMatchers: [],
        handlers: [inert(3), nested(1, '/os/*', 'stylique-os:4100'), nested(2, '/app/*', 'stylique-dashboard:80')],
      })
      const elsewhere = route({
        server: 'srv0', routeIndex: 1, routePath: 'apps/http/servers/srv0/routes/1',
        hostMatchers: ['admin.example'], pathMatchers: [],
        handlers: [{
          handlerPath: 'apps/http/servers/srv0/routes/1/handle/0', position: 0, handler: 'reverse_proxy',
          addressable: true, upstreams: [{ index: 0, dial: 'stylique-os:4100', extraKeyCount: 0 }],
          upstreamDials: ['stylique-os:4100'], upstreamCount: 1,
          ownerRoutePath: 'apps/http/servers/srv0/routes/1', nestingDepth: 0,
          matcherChain: [ctx('apps/http/servers/srv0/routes/1', ['admin.example'], [], 1,
            'apps/http/servers/srv0/routes', { parentRoutesCount: 2 })],
          unsupportedMatcherKeys: [],
        }],
      })
      const d = decide(probe({ routes: [isolatedCfg, elsewhere] }))
      t('a second route still dialling the target REFUSES the removal',
        d.blockers.some((b) => /still reached by route/.test(b)), true)
      t('…and no candidate is drafted', d.patch, null)
      const sim = d.impacted.find((x) => x.verdict === 'nested-route-exclusive').simulation
      t('…the simulation records the removal as NOT lossless', sim.isLosslessDetach, false)
      t('…and that the target stays reachable', sim.targetUnreachableAfter, false)
      t('…naming the route that keeps it reachable', sim.routesStillReachingTarget.join(','), 'srv0#1')
    }

    // THE PATCH BUILDER'S OWN GUARD. decide() refuses before candidatePatch is
    // ever called, so that guard is unreachable through the normal path — which
    // is exactly why it is tested directly. "The caller checks" is how an
    // unproven deletion ships the day someone adds a second caller.
    {
      const PROOF = {
        runtimeConfigSha256: 'a'.repeat(64),
        bootFileSha256: 'b'.repeat(64), candidateFileSha256: 'c'.repeat(64),
        adaptedBeforeJsonSha256: 'd'.repeat(64), adaptedAfterJsonSha256: 'e'.repeat(64),
        validateExitCode: 0, jsonDiffPaths: [`${SUBR}/1`], backupSha256: 'b'.repeat(64),
      }
      const p = probe({ routes: [live()], adaptEquivalence: PROOF })
      const cl = classifyRoute(live(), TARGET_IDS, PROT_IDS, { targetPort: 4100, targetHasIp: true })
      t('candidatePatch drafts NOTHING for a non-lossless nested removal, called directly',
        candidatePatch(p, [cl], [cl]).steps.length, 0)
      const clean = classifyRoute(route({
        routePath: OUTER, hostMatchers: ['138-201-119-239.sslip.io'], pathMatchers: [],
        handlers: [inert(3), nested(1, '/os/*', 'stylique-os:4100'), nested(2, '/app/*', 'stylique-dashboard:80')],
      }), TARGET_IDS, PROT_IDS, { targetPort: 4100, targetHasIp: true })
      t('…and DOES draft one when the simulation is lossless AND the edit is proven',
        candidatePatch(p, [clean], [clean]).steps.length, 1)
      t('…but NOT when the routing is clean and the edit is unproven',
        candidatePatch(probe({ routes: [live()] }), [clean], [clean]).steps.length, 0)
    }

    // THE REPORT A HUMAN READS. A refusal buried in a blockers array and absent
    // from the rendered page is a refusal nobody sees.
    {
      const txt = render(decide(probe({ routes: [live()] })))
      t('the report shows the fall-through verdict', /POST-REMOVAL    : NOT ISOLATED/.test(txt), true)
      t('…the per-matcher-set outcome table',
        /\{host \*, path \/os\/\*\}  =>  \[exposes-backend\]/.test(txt), true)
      t('…where the request would land', new RegExp(`${SUBR}/2 -> stylique-dashboard:80`).test(txt), true)
      t('…and every sibling with its terminality and fingerprint',
        (txt.match(/terminal=false  handlers=/g) ?? []).length, 3)
      // The exact matcher stack, outermost first, per impacted handler.
      t('…the report shows the full ancestor matcher stack',
        new RegExp(`${OUTER}  host=138-201-119-239\\.sslip\\.io  path=\\*`).test(txt), true)
      t('…including the nested route\'s own path matcher',
        new RegExp(`${SUBR}/1  host=\\*  path=/os/\\*`).test(txt), true)
      // ABSENT EVIDENCE READS AS ABSENT. A probe that never emitted `terminal`
      // must render "(not reported)", not a confident "false".
      t('…and a chain with no terminal field says so rather than assuming false', (() => {
        const stripped = live()
        stripped.handlers = stripped.handlers.map((h) => ({
          ...h, matcherChain: h.matcherChain.map(({ terminal, ...rest }) => rest),
        }))
        return /terminal=\(not reported\)/.test(render(decide(probe({ routes: [stripped] }))))
      })(), true)
      const ok = render(decide(probe({
        routes: [route({
          routePath: OUTER, hostMatchers: ['138-201-119-239.sslip.io'], pathMatchers: [],
          handlers: [inert(3), nested(1, '/os/*', 'stylique-os:4100'), nested(2, '/app/*', 'stylique-dashboard:80')],
        })],
      })))
      t('the isolated case renders as a real detach', /POST-REMOVAL    : isolated \(a real detach\)/.test(ok), true)
      // Without an adapt proof there is no candidate at all — the rendered
      // page must show the refusal, not a step.
      t('…and, unproven, shows no candidate patch', /CANDIDATE PATCH/.test(ok), false)
      const okProven = render(decide(probe({
        routes: [route({
          routePath: OUTER, hostMatchers: ['138-201-119-239.sslip.io'], pathMatchers: [],
          handlers: [inert(3), nested(1, '/os/*', 'stylique-os:4100'), nested(2, '/app/*', 'stylique-dashboard:80')],
        })],
        adaptEquivalence: {
          runtimeConfigSha256: 'a'.repeat(64),
          bootFileSha256: 'b'.repeat(64), candidateFileSha256: 'c'.repeat(64),
          adaptedBeforeJsonSha256: 'd'.repeat(64), adaptedAfterJsonSha256: 'e'.repeat(64),
          validateExitCode: 0, jsonDiffPaths: [`${SUBR}/1`], backupSha256: 'b'.repeat(64),
        },
      })))
      t('…and with the proof, carries the simulation and the rollback',
        /SIMULATED   : target unreachable after = true/.test(okProven)
        && /CANNOT reconstruct the deleted route/.test(okProven), true)
      t('…and marks the durable edit PROVEN only then',
        /durable    : PROVEN by adapt-equivalence/.test(okProven), true)
    }

    // POSITIVE CONTROL 2, AND THE MIDDLEWARE COUNTEREXAMPLE.
    //
    // A sibling with no upstreams was previously read as absorbing the request.
    // That is only true if it ENDS the request. `headers` and `encode` are
    // middleware: they decorate and then call the next handler, so a /os/*
    // route holding only `headers` stops nothing and the dashboard behind /*
    // is reached exactly as if it were not there.
    {
      const SIB = (over) => ({
        index: 0, routePath: 'r', matchSets: [{ host: [], path: ['/*'], unsupportedKeys: [] }],
        pathMatchers: ['/*'], hostMatchers: [], terminal: false, hasGroup: false,
        ancestorKey: 'SAME', handlerTypes: new Set(['reverse_proxy']),
        reachesTarget: false, reachesOther: false, otherDials: [], ...over,
      })
      const P = (path) => [{ host: [], path: [path], unsupportedKeys: [] }]
      const mk = (list) => { const a = list.slice(); a.declaredCount = list.length; return a }

      const target = SIB({ index: 1, routePath: 'R1', matchSets: P('/os/*'), reachesTarget: true })
      const dash = SIB({ index: 3, routePath: 'R3', matchSets: P('/*'), reachesOther: true, otherDials: ['stylique-dashboard:80'] })

      // (a) middleware in between: NOT absorption.
      const mw = SIB({ index: 2, routePath: 'R2', matchSets: P('/os/*'), handlerTypes: new Set(['headers']) })
      const viaMw = fallThroughAfterRemoval(mk([target, mw, dash]), 1)
      t('COUNTEREXAMPLE: a headers-only sibling does NOT absorb the request',
        viaMw.results[0].outcome, 'exposes-backend')
      t('…evaluation continues past it to the backend behind /*',
        viaMw.results[0].sib.routePath, 'R3')

      // (b) the same shape with an explicit terminal static_response: absorbed.
      const stat = SIB({
        index: 2, routePath: 'R2', matchSets: P('/os/*'), terminal: true,
        handlerTypes: new Set(['static_response']),
      })
      const viaStat = fallThroughAfterRemoval(mk([target, stat, dash]), 1)
      t('POSITIVE: an explicit terminal static_response DOES absorb it',
        viaStat.results[0].outcome, 'absorbed-terminating')
      t('…and the dashboard is never reached', viaStat.results[0].sib.routePath, 'R2')

      // (c) terminal alone stops sibling evaluation even with middleware only.
      const termMw = SIB({ index: 2, routePath: 'R2', matchSets: P('/os/*'), terminal: true, handlerTypes: new Set(['headers']) })
      t('a terminal route stops evaluation regardless of its handler types',
        fallThroughAfterRemoval(mk([target, termMw, dash]), 1).results[0].outcome, 'absorbed-terminating')

      // (d) file_server is NOT on the provable list: `pass_thru` makes it call
      // the next handler and the extractor emits types, not per-handler options.
      const fs = SIB({ index: 2, routePath: 'R2', matchSets: P('/os/*'), handlerTypes: new Set(['file_server']) })
      t('file_server is NOT treated as provably response-originating',
        fallThroughAfterRemoval(mk([target, fs, dash]), 1).results[0].outcome, 'exposes-backend')
      // …nor is a subroute, whose contents this level cannot see.
      const sub = SIB({ index: 2, routePath: 'R2', matchSets: P('/os/*'), handlerTypes: new Set(['subroute']) })
      t('…and neither is a subroute', stopsEvaluation(sub), false)

      // THE FOUNDER'S FIRST COUNTEREXAMPLE: a later sibling matching a SUBSET.
      // A representative path (/os/probe) misses /os/admin/* entirely and the
      // old model declared the removal isolated while /os/admin/… reached a
      // backend.
      const subset = SIB({
        index: 2, routePath: 'R2', matchSets: P('/os/admin/*'),
        reachesOther: true, otherDials: ['stylique-dashboard:80'],
      })
      const sampled = pathMatcherMatches('/os/admin/*', '/os/probe')
      t('OLD HEAD: the sampled path did not match the subset matcher', sampled, false)
      const viaSubset = fallThroughAfterRemoval(mk([target, subset]), 1)
      t('CORRECTED: a subset matcher IS an exposure, found by set intersection',
        viaSubset.results[0].outcome, 'exposes-backend')
      t('…and the overlapping set is named so the affected URLs are legible',
        viaSubset.results[0].overlap.map((x) => x.text).join(','), '{host *, path /os/admin/*}')
      t('…while a genuinely disjoint sibling is still not an exposure',
        fallThroughAfterRemoval(mk([target, SIB({ index: 2, routePath: 'R2', matchSets: P('/app/*'), reachesOther: true, otherDials: ['x:1'] })]), 1)
          .results[0].outcome, 'unserved')

      // THE CROSS-PRODUCT COUNTEREXAMPLE. Two matcher SETS, each a conjunction.
      // Flattened they read host=[a,b] path=[/x,/y]; intact they serve only
      // a+/x and b+/y. A removed route on a+/y must NOT be reported as
      // overlapping them.
      const crossed = SIB({
        index: 2, routePath: 'R2', reachesOther: true, otherDials: ['stylique-dashboard:80'],
        matchSets: [
          { host: ['a.example'], path: ['/x'], unsupportedKeys: [] },
          { host: ['b.example'], path: ['/y'], unsupportedKeys: [] },
        ],
      })
      const removedAY = SIB({
        index: 1, routePath: 'R1', reachesTarget: true,
        matchSets: [{ host: ['a.example'], path: ['/y'], unsupportedKeys: [] }],
      })
      t('CROSS-PRODUCT: a pairing the config never expressed is NOT an overlap',
        fallThroughAfterRemoval(mk([removedAY, crossed]), 1).results[0].outcome, 'unserved')
      // …and a pairing it DID express is.
      const removedAX = SIB({
        index: 1, routePath: 'R1', reachesTarget: true,
        matchSets: [{ host: ['a.example'], path: ['/x'], unsupportedKeys: [] }],
      })
      t('…while a pairing it DID express is an exposure',
        fallThroughAfterRemoval(mk([removedAX, crossed]), 1).results[0].outcome, 'exposes-backend')
      // SWAPPED SET MUTATION: swap the pairings and the answers swap with them.
      const swappedSets = SIB({
        index: 2, routePath: 'R2', reachesOther: true, otherDials: ['stylique-dashboard:80'],
        matchSets: [
          { host: ['a.example'], path: ['/y'], unsupportedKeys: [] },
          { host: ['b.example'], path: ['/x'], unsupportedKeys: [] },
        ],
      })
      t('SWAPPED SETS: the same flattened lists give the OPPOSITE answers',
        [fallThroughAfterRemoval(mk([removedAY, swappedSets]), 1).results[0].outcome,
          fallThroughAfterRemoval(mk([removedAX, swappedSets]), 1).results[0].outcome].join(','),
        'exposes-backend,unserved')

      // PARTIAL ABSORPTION: a terminating sibling that covers only part of the
      // removed set leaves a remainder this language cannot express.
      const partial = SIB({
        index: 2, routePath: 'R2', matchSets: P('/os/admin/*'), terminal: true,
        handlerTypes: new Set(['static_response']),
      })
      // The scan stops at the partial coverer and refuses there. The remainder
      // would go on to reach the dashboard, but naming a remainder this matcher
      // language cannot express would be inventing a set, so the refusal is the
      // finding — with or without a backend behind it.
      t('a terminating sibling covering only PART of the removed set is refused',
        fallThroughAfterRemoval(mk([target, partial, dash]), 1).results[0].outcome, 'partial-absorption-unmodelled')
      t('…and identically when nothing follows it',
        fallThroughAfterRemoval(mk([target, partial]), 1).results[0].outcome, 'partial-absorption-unmodelled')
      t('…and it is a REFUSING outcome, never an isolated one',
        postRemovalBlockers({
          server: 'srv0', routeIndex: 0, exclusiveRoute: { routePath: 'R1', routeIndexInParent: 1, parentRoutesArrayPath: 'P' },
          postRemoval: { supported: true, isolated: false, outcomes: fallThroughAfterRemoval(mk([target, partial]), 1).results.map((r) => ({ ...r, overlappingMatchers: r.overlap.map((x) => x.text), landedRoutePath: r.sib?.routePath ?? null, landedIndex: r.sib?.index ?? null, landedHandlerTypes: [], landedTerminal: null, exposedDials: [] })) },
        }).some((b) => /only PARTLY accounted for/.test(b)), true)

      // HOST ALGEBRA. `*.example.com` is one label in Caddy.
      t('a wildcard host covers a single label beneath it',
        hostPatternCovers(parseHostPattern('*.example.com'), parseHostPattern('a.example.com')), true)
      t('…but not two labels', hostPatternCovers(parseHostPattern('*.example.com'), parseHostPattern('a.b.example.com')), false)
      t('…nor the bare domain', hostPatternCovers(parseHostPattern('*.example.com'), parseHostPattern('example.com')), false)
      t('two different wildcard hosts are UNDECIDABLE, not disjoint',
        hostPatternsIntersect(parseHostPattern('*.a.com'), parseHostPattern('*.b.com')), null)
      t('…and an undecidable overlap refuses rather than passing', (() => {
        const a = SIB({ index: 1, routePath: 'R1', reachesTarget: true, matchSets: [{ host: ['*.a.com'], path: ['/os/*'], unsupportedKeys: [] }] })
        const b = SIB({ index: 2, routePath: 'R2', reachesOther: true, otherDials: ['x:1'], matchSets: [{ host: ['*.b.com'], path: ['/os/*'], unsupportedKeys: [] }] })
        return fallThroughAfterRemoval(mk([a, b]), 1).results[0].outcome
      })(), 'overlap-undecidable')
      t('an unparseable host matcher is refused', parseHostPattern('a.*.com'), null)
      // The label predicate, exercised DIRECTLY with raw mixed case. Through
      // parseHostPattern it never sees unnormalised input, so this is the only
      // place its own case-handling is actually proved.
      t('oneLabelUnder is case-insensitive on raw values',
        oneLabelUnder('A.EXAMPLE.com', 'example.COM'), true)
      t('…and still rejects two labels', oneLabelUnder('a.B.example.com', 'EXAMPLE.com'), false)
      t('…and still rejects the bare domain', oneLabelUnder('EXAMPLE.com', 'example.com'), false)
      t('…and an empty label', oneLabelUnder('.example.com', 'EXAMPLE.com'), false)

      // ------------------------------------------------------------------
      // HOSTNAMES ARE CASE-INSENSITIVE. Comparing raw strings made EXAMPLE.com
      // and example.com read as DISJOINT — and a false-disjoint approves a
      // fall-through, because two routes serving the same site look unrelated
      // and deleting one is reported as touching nothing the other serves.
      // ------------------------------------------------------------------
      const H = parseHostPattern
      t('OLD HEAD: the raw strings differ, which is what produced the defect',
        'EXAMPLE.com' === 'example.com', false)
      t('CORRECTED: mixed-case exact hosts INTERSECT',
        hostPatternsIntersect(H('EXAMPLE.com'), H('example.com')), true)
      t('…and cover each other', hostPatternCovers(H('EXAMPLE.com'), H('example.com')), true)
      t('…in both directions', hostPatternCovers(H('example.com'), H('EXAMPLE.com')), true)
      t('MIXED-CASE WILDCARD: a wildcard covers a differently-cased label beneath it',
        hostPatternCovers(H('*.EXAMPLE.com'), H('a.example.com')), true)
      t('…and a lowercase wildcard covers an uppercase name',
        hostPatternCovers(H('*.example.com'), H('A.EXAMPLE.COM')), true)
      t('…and two wildcards differing only in case are the same set',
        hostPatternsIntersect(H('*.Example.com'), H('*.eXaMpLe.CoM')), true)
      // NEGATIVE CONTROLS: normalisation must not make everything overlap.
      t('NEGATIVE: genuinely different hosts are still disjoint',
        hostPatternsIntersect(H('a.example'), H('b.example')), false)
      t('NEGATIVE: a wildcard still does not cover two labels',
        hostPatternCovers(H('*.EXAMPLE.com'), H('a.b.example.com')), false)
      t('NEGATIVE: a wildcard still does not cover the bare domain',
        hostPatternCovers(H('*.EXAMPLE.com'), H('example.com')), false)
      t('NEGATIVE: unrelated wildcards remain UNDECIDABLE, not overlapping',
        hostPatternsIntersect(H('*.A.com'), H('*.b.com')), null)

      // END TO END: the defect as a routing decision, not just a comparison.
      t('END TO END: a mixed-case host sibling IS an exposure', (() => {
        const rm = SIB({
          index: 1, routePath: 'R1', reachesTarget: true,
          matchSets: [{ host: ['EXAMPLE.com'], path: ['/os/*'], unsupportedKeys: [] }],
        })
        const later = SIB({
          index: 2, routePath: 'R2', reachesOther: true, otherDials: ['stylique-dashboard:80'],
          matchSets: [{ host: ['example.com'], path: ['/*'], unsupportedKeys: [] }],
        })
        return fallThroughAfterRemoval(mk([rm, later]), 1).results[0].outcome
      })(), 'exposes-backend')
      t('…while a genuinely different host is still not one', (() => {
        const rm = SIB({
          index: 1, routePath: 'R1', reachesTarget: true,
          matchSets: [{ host: ['EXAMPLE.com'], path: ['/os/*'], unsupportedKeys: [] }],
        })
        const later = SIB({
          index: 2, routePath: 'R2', reachesOther: true, otherDials: ['stylique-dashboard:80'],
          matchSets: [{ host: ['other.example'], path: ['/*'], unsupportedKeys: [] }],
        })
        return fallThroughAfterRemoval(mk([rm, later]), 1).results[0].outcome
      })(), 'unserved')

      // NORMALISATION IS FOR THE ALGEBRA, NOT THE FINGERPRINT. Re-casing a
      // hostname is an edit to the config even though it is not a change in
      // routing, and the fingerprint's job is "is this the same route object I
      // audited" — so it must still notice.
      t('the fingerprint still distinguishes a re-cased hostname', (() => {
        const f = (h) => siblingFingerprint({
          index: 1, routePath: 'r', matchSets: [{ host: [h], path: ['/os/*'] }],
          hostMatchers: [], pathMatchers: [], terminal: false, handlerTypes: [], otherDials: [],
        })
        return f('EXAMPLE.com') !== f('example.com')
      })(), true)
      t('…and the parsed pattern keeps the raw value for reporting',
        H('EXAMPLE.com').raw, 'EXAMPLE.com')

      // ------------------------------------------------------------------
      // PATH SEMANTICS. Caddy path matches are exact but CASE-INSENSITIVE, so
      // a case-only difference has an authoritative answer — true — and an
      // earlier revision that called it undecidable was refusing a question it
      // could answer.
      // ------------------------------------------------------------------
      t('PATHS: a case-only difference OVERLAPS, authoritatively',
        patternsIntersect(parsePattern('/os/*'), parsePattern('/OS/admin')), true)
      t('…and covers, authoritatively',
        patternCovers(parsePattern('/OS/*'), parsePattern('/os/admin')), true)
      t('…and an exact pair differing only in case is the same set',
        patternsIntersect(parsePattern('/OS/Admin'), parsePattern('/os/admin')), true)
      t('…while same-case answers are unaffected',
        [patternsIntersect(parsePattern('/os/*'), parsePattern('/os/admin')),
          patternsIntersect(parsePattern('/os/*'), parsePattern('/app/*'))].join(','), 'true,false')
      t('…and matching folds case too', pathMatcherMatches('/OS/*', '/os/admin'), true)
      t('END TO END: a case-only path difference is an EXPOSURE, not a refusal', (() => {
        const rm = SIB({ index: 1, routePath: 'R1', reachesTarget: true, matchSets: P('/os/*') })
        const later = SIB({ index: 2, routePath: 'R2', reachesOther: true, otherDials: ['x:1'], matchSets: P('/OS/admin') })
        return fallThroughAfterRemoval(mk([rm, later]), 1).results[0].outcome
      })(), 'exposes-backend')
      // Normalisation is for the algebra; the fingerprint still sees the edit.
      t('the fingerprint still distinguishes a re-cased path', (() => {
        const f = (pp) => siblingFingerprint({
          index: 1, routePath: 'r', matchSets: [{ host: [], path: [pp] }],
          hostMatchers: [], pathMatchers: [], terminal: false, handlerTypes: [], otherDials: [],
        })
        return f('/OS/*') !== f('/os/*')
      })(), true)
      t('…and the parsed pattern keeps the raw spelling', parsePattern('/OS/*').raw, '/OS/*')

      // ------------------------------------------------------------------
      // ESCAPES AND EMPTY SEGMENTS. Raw string algebra false-disjoints these,
      // which is the direction that approves a deletion.
      // ------------------------------------------------------------------
      // OLD-HEAD COUNTEREXAMPLE, stated as the comparison the old code made.
      // Caddy matches a configured /foo/bar against a request for /foo%2Fbar,
      // and a configured /foo%2Fbar against that same escaped request — so the
      // two share requests while comparing as different strings.
      const rawIntersect = (x, y) => {
        // exactly the old algebra: compare spellings, no normalisation
        const k = (v) => (v.endsWith('*') ? { p: v.slice(0, -1) } : { e: v })
        const a = k(x); const b = k(y)
        if (a.e !== undefined && b.e !== undefined) return a.e === b.e
        if (a.p !== undefined && b.e !== undefined) return b.e.startsWith(a.p)
        if (a.e !== undefined && b.p !== undefined) return a.e.startsWith(b.p)
        return a.p.startsWith(b.p) || b.p.startsWith(a.p)
      }
      t('OLD HEAD: raw algebra called /foo/bar and /foo%2Fbar DISJOINT',
        rawIntersect('/foo/bar', '/foo%2Fbar'), false)
      t('OLD HEAD: and /foo and //foo DISJOINT', rawIntersect('/foo', '//foo'), false)
      t('CORRECTED: /foo%2Fbar is refused rather than compared',
        pathPatternSupported('/foo%2Fbar'), false)
      t('…naming the escape as the reason',
        /percent-escape/.test(pathPatternRefusal('/foo%2Fbar')), true)
      t('CORRECTED: //foo is refused rather than compared', pathPatternSupported('//foo'), false)
      t('…naming the repeated slash as the reason',
        /repeated slash/.test(pathPatternRefusal('//foo')), true)
      t('CORRECTED: %* is refused', pathPatternSupported('%*'), false)
      t('CORRECTED: a dot segment is refused', pathPatternSupported('/foo/../bar'), false)
      t('…including a single-dot segment', pathPatternSupported('/foo/./bar'), false)
      t('…and a bare trailing dot segment', pathPatternSupported('/foo/..'), false)
      t('CONTROL: a dot INSIDE a segment is not a dot segment',
        pathPatternSupported('/foo.bar/baz'), true)
      t('CONTROL: multiple wildcards are still refused', pathPatternSupported('/a*b*'), false)
      t('CONTROL: an interior wildcard is still refused', pathPatternSupported('/a*b'), false)

      // The refusal must reach the ROUTING decision, not stop at the predicate.
      t('an escaped path matcher REFUSES the whole analysis', (() => {
        const rm = SIB({ index: 1, routePath: 'R1', reachesTarget: true, matchSets: P('/foo%2Fbar') })
        const later = SIB({ index: 2, routePath: 'R2', reachesOther: true, otherDials: ['x:1'], matchSets: P('/foo/bar') })
        const r = fallThroughAfterRemoval(mk([rm, later]), 1)
        return r.supported === false && /percent-escape/.test(r.reason)
      })(), true)
      t('…and so does one on a LATER sibling, which is where it would be missed', (() => {
        const rm = SIB({ index: 1, routePath: 'R1', reachesTarget: true, matchSets: P('/foo/bar') })
        const later = SIB({ index: 2, routePath: 'R2', reachesOther: true, otherDials: ['x:1'], matchSets: P('/foo%2Fbar') })
        const r = fallThroughAfterRemoval(mk([rm, later]), 1)
        return r.supported === false && /percent-escape/.test(r.reason)
      })(), true)
      t('…and a repeated slash on a later sibling refuses too', (() => {
        const rm = SIB({ index: 1, routePath: 'R1', reachesTarget: true, matchSets: P('/foo') })
        const later = SIB({ index: 2, routePath: 'R2', reachesOther: true, otherDials: ['x:1'], matchSets: P('//foo') })
        const r = fallThroughAfterRemoval(mk([rm, later]), 1)
        return r.supported === false && /repeated slash/.test(r.reason)
      })(), true)

      // THE LIVE SHAPE MUST STILL BE MODELLED. A fail-closed rule that also
      // refuses /os/* and /* would be safe and useless.
      t('LIVE BEHAVIOUR PRESERVED: /os/* and /* are both inside the subset',
        [pathPatternSupported('/os/*'), pathPatternSupported('/*')].join(','), 'true,true')
      t('…and still resolve to the same exposure', (() => {
        const rm = SIB({ index: 1, routePath: 'R1', reachesTarget: true, matchSets: P('/os/*') })
        const later = SIB({ index: 2, routePath: 'R2', reachesOther: true, otherDials: ['stylique-dashboard:80'], matchSets: P('/*') })
        return fallThroughAfterRemoval(mk([rm, later]), 1).results[0].outcome
      })(), 'exposes-backend')
    }

    // A later sibling that reaches the target too means the route was never
    // exclusively the target's, and the removal detaches nothing.
    {
      const chainFor = (idx) => [{
        routePath: `${SUBR}/${idx}`, parentRoutesArrayPath: SUBR, routeIndexInParent: idx,
        parentRoutesCount: 2, matchSets: [{ host: [], path: ['/os/*'], unsupportedKeys: [] }],
        path: ['/os/*'], host: [], terminal: false, hasGroup: false, handlerTypes: ['reverse_proxy'],
      }]
      const h = (idx) => ({
        handlerPath: `${SUBR}/${idx}/handle/0`, matcherChain: chainFor(idx),
        targetUpstreams: [{ index: 0, dial: 'stylique-os:4100' }], keepUpstreams: [], upstreams: [],
      })
      const r = postRemovalRouting([h(0), h(1)], { parentRoutesArrayPath: SUBR, routeIndexInParent: 0 })
      t('a later sibling reaching the target is reported, not ignored', r.outcomes[0].outcome, 'still-reaches-target')
      t('…and it is not isolated', r.isolated, false)
      t('…and it blocks with the contradiction named', postRemovalBlockers({
        server: 'srv0', routeIndex: 0,
        exclusiveRoute: { routePath: `${SUBR}/0`, routeIndexInParent: 0, parentRoutesArrayPath: SUBR },
        postRemoval: r,
      }).some((b) => /never exclusively the target/.test(b)), true)
    }

    // HONEST SCOPE NOTE: the `excl.routePath !== base.routePath` guard in the
    // would-orphan branch is defence in depth and is NOT provably load-bearing.
    // Reaching that branch requires a non-target handler in the route, which
    // already disqualifies the outer route as a candidate. Removing the guard
    // breaks no test; that is recorded rather than covered with a contrived case.
  }

  console.log('-- durable edit location: DIRECTORY-MOUNT resolution')
  // THE 8b98a24 DEFECT. /etc/caddy mounted from /root/caddy, boot file
  // /etc/caddy/Caddyfile. The old resolver emitted the mount Source —
  // /root/caddy — a DIRECTORY. The old positive test used an exact-file mount,
  // where Source already ends in Caddyfile, so it could never have caught this.
  {
    const d = decide(probe())
    t('a directory mount resolves to the FILE, not the mount root',
      d.patch.steps[0].durableEdit.includes('/root/caddy/Caddyfile'), true)
    t('the mount ROOT is never named as the thing to edit',
      /edit the HOST FILE \/root\/caddy(?!\/)/.test(d.patch.steps[0].durableEdit), false)
    t('the resolved file is reported alongside its hash', d.hostBootFile, '/root/caddy/Caddyfile')
  }
  // Control: an exact-file mount still works, and Source IS the file.
  t('an exact-file mount resolves to Source itself',
    decide(probe({ caddyBootMountDest: '/etc/caddy/Caddyfile', caddyBootMountRoot: '/root/deploy/Caddyfile',
      caddyBootFileHostPath: '/root/deploy/Caddyfile' })).patch.steps[0].durableEdit
      .includes('/root/deploy/Caddyfile'), true)
  // The collapse case, asserted directly.
  t('resolving to the mount root of a DIRECTORY mount is refused',
    durableResolution({ ...probe(), caddyBootFileHostPath: '/root/caddy' }).ok, false)

  console.log('-- durable edit location must be PROVEN or REFUSED')
  t('a READ-ONLY file refuses',
    decide(probe({ caddyBootFileWritable: false })).patchable, false)
  t('a non-regular file refuses',
    decide(probe({ caddyBootFileIsRegular: false })).patchable, false)
  t('an unreadable file refuses', decide(probe({ caddyBootFileReadable: false })).patchable, false)
  t('an unmapped path (baked into the image) refuses',
    decide(probe({ caddyBootFileHostPath: '' })).patchable, false)
  t('a relative resolved path refuses',
    decide(probe({ caddyBootFileHostPath: 'caddy_cfg/Caddyfile' })).patchable, false)
  t('a non-file-booted config refuses', decide(probe({ caddyDiskConfigIsBootSource: false })).patchable, false)
  // HASH MUTATION CONTROL: the host file and the container-read file must be
  // the same bytes, or the mapping found a different file.
  t('a host/container sha256 MISMATCH refuses',
    decide(probe({ caddyBootFileSha256: 'c'.repeat(64) })).patchable, false)
  t('…and says so explicitly',
    decide(probe({ caddyBootFileSha256: 'c'.repeat(64) })).blockers
      .some((b) => b.includes('DIFFERENT file')), true)
  t('CONTROL: matching hashes are patchable', decide(probe()).patchable, true)

  console.log('-- named volumes are resolvable but labelled')
  {
    const vol = probe({
      caddyBootMountType: 'volume', caddyBootMountRoot: '/var/lib/docker/volumes/caddy_cfg/_data',
      caddyBootFileHostPath: '/var/lib/docker/volumes/caddy_cfg/_data/Caddyfile',
    })
    const d = decide(vol)
    t('a named volume with a real host path IS patchable', d.patchable, true)
    t('…and is explicitly labelled a volume, not a bind',
      d.patch.steps[0].durableEdit.includes('named VOLUME'), true)
  }

  console.log('-- compose provenance is resolved or marked unresolved')
  t('an absolute resolved compose file is named',
    decide(probe()).patch.steps[0].durableEdit.includes('/root/24_Backend/deploy/docker-compose.yml'), true)
  t('an UNRESOLVED relative label is never presented as a path',
    decide(probe({ caddyComposeFileResolved: '' })).patch.steps[0].durableEdit.includes('UNRESOLVED'), true)
  t('…and the bare relative label is not offered as a source path',
    /compose source: docker-compose\.yml/.test(
      decide(probe({ caddyComposeFileResolved: '' })).patch.steps[0].durableEdit), false)

  console.log('-- fingerprints bind the exact surviving dial set')
  {
    const d = decide(probe({ routes: [route({ handlers: [hdl(0, ['stylique-os:4100', ['stylique-dashboard:80', 2]])] })] }))
    const fp = d.patch.fingerprints.find((f) => f.kind === 'impacted')
    t('an impacted fingerprint carries per-handler assertions', (fp.handlerAssertions ?? []).length, 1)
    t('…requiring the exact surviving dial set',
      JSON.stringify(fp.handlerAssertions[0].mustRemainExactly), JSON.stringify(['stylique-dashboard:80']))
    t('…requiring the handler to stay non-empty', fp.handlerAssertions[0].mustNotBeEmpty, true)
    t('…and requiring the target dial to be gone',
      JSON.stringify(fp.handlerAssertions[0].mustNotContain), JSON.stringify(['stylique-os:4100']))
  }

  console.log('-- the route-exclusive GO case')
  const go = decide(probe())
  t('a route-exclusive impact is patchable', go.patchable, true)
  t('…emits exactly one step', go.patch.steps.length, 1)
  t('…that removes the whole route', go.patch.steps[0].action, 'remove the whole route')
  t('…addressed at the ROUTE path', go.patch.steps[0].configPath, 'apps/http/servers/srv0/routes/0')
  t('…and warns about index shifting', go.patch.steps[0].ordering.includes('DESCENDING'), true)

  console.log('-- preconditions')
  t('every step carries the runtime hash precondition',
    go.patch.steps.every((x) => x.preconditions.some((p) => p.includes('runtime config sha256 == ' + 'a'.repeat(64)))), true)
  t('every step carries the disk hash precondition',
    go.patch.steps.every((x) => x.preconditions.some((p) => p.includes('disk config') && p.includes('b'.repeat(64)))), true)
  // This assertion used to strip `/upstreams` from configPath before looking
  // for it, so it passed while every precondition named only the parent object.
  // A test written to pass rather than to prove. It now requires the FULL path.
  t('every step binds its EXACT config path in a precondition',
    go.patch.steps.every((x) => x.preconditions.some((p) => p.includes(x.configPath))), true)

  console.log('-- rollback restores CADDY ONLY')
  // The removed line was `docker update --restart=unless-stopped stylique-os`.
  // Editing a route never changed that policy, and that command would re-arm the
  // crash loop `disable-restart` was run to stop.
  const rb = JSON.stringify(go.patch.rollback)
  t('rollback does not change any restart policy', /--restart/.test(rb), false)
  t('rollback does not mention docker update', /docker\s+update/.test(rb), false)
  t('rollback does restore the disk config', /restore .*Caddyfile/.test(rb), true)
  t('rollback validates before reloading', /caddy validate/.test(rb), true)

  console.log('-- fingerprints')
  {
    const d = decide(probe({ routes: [
      route(),
      { server: 'srv0', routeIndex: 1, routePath: 'apps/http/servers/srv0/routes/1',
        hostMatchers: ['dash.example.com'], pathMatchers: ['/admin/*'], handlerOrder: ['reverse_proxy'],
        handlers: [hdl(0, ['stylique-dashboard:80'])], upstreamDials: ['stylique-dashboard:80'] },
    ] }))
    const kinds = d.patch.fingerprints.map((f) => `${f.kind}:${f.host}`)
    t('the impacted host is fingerprinted', kinds.includes('impacted:os.example.com'), true)
    t('the PROTECTED host is fingerprinted too', kinds.includes('protected:dash.example.com'), true)
    t('protected fingerprints must be identical',
      d.patch.fingerprints.find((f) => f.kind === 'protected').expectation.includes('IDENTICAL'), true)
    t('each fingerprint records status, headers and upstreams',
      d.patch.fingerprints[0].record.length, 3)
  }

  console.log('-- durability')
  t('a non-file-booted config yields no patch at all',
    decide(probe({ caddyDiskConfigIsBootSource: false })).patch, null)

  console.log('-- FILE DIVERGENCE: naming the cause, not just refusing')
  const H = (inode, sha) => `2049:${inode}:812:1750000000:${sha}`
  t('CONTROL: three agreeing views are consistent', divergenceCause(probe()).cause, 'consistent')
  // THE LIVE CASE from run 30302057188: host and container hash differently.
  t('a stale FILE bind (inode moved, contents differ) is named',
    divergenceCause(probe({
      fileIdHostSource: H('9999', 'c'.repeat(64)),
      fileIdProcRoot: H('9001', 'b'.repeat(64)),
      fileIdContainer: H('9001', 'b'.repeat(64)),
    })).cause, 'stale-file-bind')
  t('…and says a reload cannot fix it',
    divergenceCause(probe({
      fileIdHostSource: H('9999', 'c'.repeat(64)), fileIdProcRoot: H('9001', 'b'.repeat(64)),
      fileIdContainer: H('9001', 'b'.repeat(64)),
    })).detail.includes('reload cannot rebind'), true)
  t('mount LAYERING is distinguished from a stale bind',
    divergenceCause(probe({
      fileIdHostSource: H('9999', 'c'.repeat(64)), fileIdProcRoot: H('9001', 'b'.repeat(64)),
      fileIdContainer: H('9001', 'b'.repeat(64)),
      mountinfoRelevant: '/etc/caddy /srv/caddy ext4;/etc/caddy/Caddyfile /other/src overlay;',
    })).cause, 'mount-layering')
  t('a CONTAINER-side write is distinguished from both',
    divergenceCause(probe({
      fileIdHostSource: H('9001', 'b'.repeat(64)), fileIdProcRoot: H('9001', 'b'.repeat(64)),
      fileIdContainer: H('9001', 'd'.repeat(64)),
    })).cause, 'container-write')
  t('an unstat-able view is undetermined, never guessed',
    divergenceCause(probe({ fileIdHostSource: 'absent' })).cause, 'undetermined')
  t('a malformed identity string is undetermined',
    divergenceCause(probe({ fileIdProcRoot: 'garbage' })).cause, 'undetermined')
  t('ANY non-consistent cause blocks the patch',
    decide(probe({ fileIdHostSource: H('9999', 'c'.repeat(64)) })).patchable, false)

  console.log('-- ZERO PARSED ROUTES IS NOT "NO ROUTES"')
  t('a parsed config with zero routes BLOCKS',
    decide(probe({ routes: [] })).patchable, false)
  t('…and says so as an unrecognised shape',
    decide(probe({ routes: [] })).blockers.some((b) => b.includes('unrecognised shape')), true)
  t('the config shape is reported for diagnosis',
    decide(probe({ routes: [] })).configShape.serverNames[0], 'srv0')
  t('caddy argv is surfaced so --config/--adapter are visible',
    /--adapter caddyfile/.test(decide(probe()).caddyArgv), true)
  t('env is KEY NAMES only — no values',
    /=/.test(decide(probe()).caddyEnvKeys ?? ''), false)

  console.log('-- NOTHING MUTATES')
  const all = JSON.stringify(decide(probe()).patch)
  t('the steps propose no reload of their own accord', /caddy reload/.test(JSON.stringify(go.patch.steps)), false)
  t('the patch contains no docker stop/rm', /docker\s+(stop|rm|rmi|kill)\b/.test(all), false)

  if (failed) { console.error(`route-impact selftest: ${failed} failed`); process.exit(1) }
  console.log('route-impact selftest: all cases passed'); process.exit(0)
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (!isEntry) { /* imported for its exports */ }
else if (process.argv.includes('--selftest')) await selftest()
else {
  const f = process.argv[2]
  if (!f) { console.error('usage: assert_route_impact.mjs <route-impact.json>'); process.exit(2) }
  let d
  try { d = decide(JSON.parse(readFileSync(f, 'utf8'))) }
  catch (e) { console.error(`::error::route impact could not be determined: ${e.message}`); process.exit(1) }
  console.log(render(d))
  if (!d.patchable) {
    console.error('::error::route impact did not yield a safe patch. No Caddy change may be prepared.')
    process.exit(1)
  }
}
