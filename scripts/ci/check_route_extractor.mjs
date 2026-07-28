#!/usr/bin/env node
// Run the REAL route extractor over synthetic Caddy configs and check what it
// emits.
//
// WHY THIS FILE EXISTS
// --------------------
// assert_route_impact.mjs is thoroughly tested against FIXTURES — objects hand-
// written in JavaScript to look like the extractor's output. Every one of those
// tests passes whether or not the extractor actually produces that shape. The
// last two rejections of this work were both extractor defects, not classifier
// defects: matchers collected only from top-level routes, and three python
// programs terminated early by an apostrophe. Neither could have been caught by
// a fixture, because a fixture is a description of the output, not the output.
//
// So this harness pulls PROG_ROUTES out of the shell script by the same heredoc
// framing the shell uses, feeds it JSON on stdin exactly as the host does, and
// asserts on what comes back.
//
// It reads no host, contacts nothing, and mutates nothing.
//
//   node scripts/ci/check_route_extractor.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const SCRIPT = 'scripts/vps/route_impact_audit.sh'

/**
 * The program text, taken from the heredoc the shell itself reads.
 *
 * Anchored on `<<'PY_EOF'` — the QUOTED form. That quoting is what makes the
 * body literal, and it is the fix for the defect where a `'` inside a docstring
 * terminated `python3 -c '...'` mid-program. If someone reverts to the unquoted
 * form this anchor stops matching and the harness fails loudly rather than
 * silently testing nothing.
 */
export function extractProgram(source, name) {
  const re = new RegExp(`^${name}=\\$\\(cat <<'PY_EOF'\\n([\\s\\S]*?)\\nPY_EOF\\n\\)`, 'm')
  const m = re.exec(source)
  if (!m) throw new Error(`${name} is not defined as a quoted heredoc in ${SCRIPT}`)
  return m[1]
}

export function runProgram(prog, input) {
  const out = execFileSync('python3', ['-c', prog], {
    input: JSON.stringify(input), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  })
  return JSON.parse(out)
}

/** The shape on the host: outer host route -> subroute -> sibling nested routes. */
export function liveShapedConfig() {
  const proxy = (dial) => ({ handler: 'reverse_proxy', upstreams: [{ dial }] })
  return {
    apps: {
      http: {
        servers: {
          srv0: {
            listen: [':443'],
            routes: [{
              match: [{ host: ['138-201-119-239.sslip.io'] }],
              handle: [{
                handler: 'subroute',
                routes: [
                  { handle: [{ handler: 'headers' }, { handler: 'encode' }] },
                  {
                    match: [{ path: ['/os/*'] }],
                    handle: [{ handler: 'subroute', routes: [{ handle: [proxy('stylique-os:4100')] }] }],
                  },
                  {
                    match: [{ path: ['/*'] }],
                    handle: [{ handler: 'subroute', routes: [{ handle: [proxy('stylique-dashboard:80')] }] }],
                  },
                ],
              }],
              terminal: true,
            }],
          },
        },
      },
    },
  }
}

async function main() {
  let failed = 0
  const t = (name, got, exp) => {
    if (JSON.stringify(got) === JSON.stringify(exp)) console.log(`  ok: ${name}`)
    else { console.error(`SELFTEST FAIL: ${name} => ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); failed++ }
  }

  const src = readFileSync(SCRIPT, 'utf8')
  const PROG = extractProgram(src, 'PROG_ROUTES')

  // ---------------------------------------------------------------- the shape
  const out = runProgram(PROG, liveShapedConfig())
  t('one top-level route is reported', out.routes.length, 1)
  const r = out.routes[0]
  const hs = r.handlers

  // 7 = the outer subroute, headers, encode, two nested subroutes, two proxies.
  // Every handler in the tree, including the ones that proxy nowhere: an inert
  // sibling is what proves the "must contain a target handler" filter is doing
  // work rather than being satisfied by accident.
  t('every handler in the tree is reported, inert ones included', hs.length, 7)
  t('the outer route names its host', r.hostMatchers, ['138-201-119-239.sslip.io'])
  t('…and has no path matcher of its own', r.pathMatchers, [])

  const osH = hs.find((h) => h.upstreamDials.includes('stylique-os:4100'))
  const dashH = hs.find((h) => h.upstreamDials.includes('stylique-dashboard:80'))
  t('the target handler is found at its exact address',
    osH.handlerPath, 'apps/http/servers/srv0/routes/0/handle/0/routes/1/handle/0/routes/0/handle/0')
  t('…and it is addressable', osH.addressable, true)

  // THE FIRST REJECTED DEFECT: matchers taken only from the top-level route, so
  // every nested handler inherited "no path matcher — all paths".
  const osChain = osH.matcherChain
  t('the matcher chain is outermost-first and complete', osChain.length, 3)
  t('…the outer route contributes the host', osChain[0].host, ['138-201-119-239.sslip.io'])
  t('…the nested route contributes ITS OWN path', osChain[1].path, ['/os/*'])
  t('…and the innermost route contributes neither', [osChain[2].host, osChain[2].path], [[], []])
  t('the dashboard handler carries a DIFFERENT nested path', dashH.matcherChain[1].path, ['/*'])

  // ---------------------------------------------- the fields added at this head
  t('each nested route reports its index in the parent array', osChain[1].routeIndexInParent, 1)
  t('…and the exact array it belongs to',
    osChain[1].parentRoutesArrayPath, 'apps/http/servers/srv0/routes/0/handle/0/routes')
  t('…and its own exact path',
    osChain[1].routePath, 'apps/http/servers/srv0/routes/0/handle/0/routes/1')
  t('TERMINALITY is emitted for a route that does not set it', osChain[1].terminal, false)
  t('…and is TRUE where the config sets it', osChain[0].terminal, true)
  t('GROUP PRESENCE is emitted as false when absent', osChain[1].hasGroup, false)
  t('HANDLER TYPES are emitted for the route\'s own handle array', osChain[1].handlerTypes, ['subroute'])

  // THE DENOMINATOR. Without it a sibling route carrying no handlers leaves no
  // trace and the fall-through model reasons over an incomplete list.
  t('the parent array LENGTH is emitted', osChain[1].parentRoutesCount, 3)
  t('…and the top-level array length too', osChain[0].parentRoutesCount, 1)

  // A sibling with no handlers is exactly the case the count exists for: it
  // contributes nothing to the handler list, so length and modelled count differ.
  {
    const cfg = liveShapedConfig()
    cfg.apps.http.servers.srv0.routes[0].handle[0].routes.push({ match: [{ path: ['/ghost/*'] }], handle: [] })
    const o2 = runProgram(PROG, cfg)
    const chain = o2.routes[0].handlers.find((h) => h.upstreamDials.includes('stylique-os:4100')).matcherChain
    t('a handler-less sibling raises the declared count', chain[1].parentRoutesCount, 4)
    t('…while contributing no handler of its own',
      o2.routes[0].handlers.filter((h) => h.matcherChain.some((c) => /\/routes\/3$/.test(c.routePath ?? ''))).length, 0)
  }

  // GROUP, when set.
  {
    const cfg = liveShapedConfig()
    cfg.apps.http.servers.srv0.routes[0].handle[0].routes[1].group = 'g1'
    const o3 = runProgram(PROG, cfg)
    const chain = o3.routes[0].handlers.find((h) => h.upstreamDials.includes('stylique-os:4100')).matcherChain
    t('a route group is reported as PRESENT when the config sets one', chain[1].hasGroup, true)
    // A group NAME is author-chosen text and is not on the emitted-value
    // allowlist. The caller needs only its existence in order to refuse.
    t('…and its NAME never leaves the host', JSON.stringify(o3).includes('g1'), false)
  }

  // ------------------------------------------- matcher SET structure (OR/AND)
  // A `match` array is OR across objects and AND within one. Flattening it into
  // independent host and path lists invents a cross-product the config never
  // expressed, and any overlap test over that is unsound in both directions.
  {
    const cfg = liveShapedConfig()
    cfg.apps.http.servers.srv0.routes[0].handle[0].routes[1].match = [
      { host: ['a.example'], path: ['/x'] },
      { host: ['b.example'], path: ['/y'] },
    ]
    const o = runProgram(PROG, cfg)
    const chain = o.routes[0].handlers.find((h) => h.upstreamDials.includes('stylique-os:4100')).matcherChain
    const sets = chain[1].matchSets
    t('each matcher object is emitted as its own SET, in order', sets.length, 2)
    t('…with its own host and path kept together',
      sets.map((m) => `${m.host.join('|')}=>${m.path.join('|')}`), ['a.example=>/x', 'b.example=>/y'])
    t('…and the count is reported', chain[1].matchSetCount, 2)
    // The flattened view still exists for display, and is exactly the thing that
    // must never be used for algebra — proved here by showing it is lossy.
    t('the flattened view LOSES the pairing (which is why it is display-only)',
      [chain[1].host.slice().sort().join(','), chain[1].path.slice().sort().join(',')],
      ['a.example,b.example', '/x,/y'])
    // SWAPPED SET MUTATION: a different route that flattens identically.
    const cfg2 = liveShapedConfig()
    cfg2.apps.http.servers.srv0.routes[0].handle[0].routes[1].match = [
      { host: ['a.example'], path: ['/y'] },
      { host: ['b.example'], path: ['/x'] },
    ]
    const o2 = runProgram(PROG, cfg2)
    const chain2 = o2.routes[0].handlers.find((h) => h.upstreamDials.includes('stylique-os:4100')).matcherChain
    t('SWAPPED SETS: the flattened views are IDENTICAL',
      JSON.stringify([chain.host, chain.path]) === JSON.stringify([chain2.host, chain2.path]), true)
    t('…while the structured sets differ, which is the whole point',
      JSON.stringify(sets) === JSON.stringify(chain2[1].matchSets), false)
  }
  {
    // An unsupported key is reported PER SET, so a route with one modelled set
    // and one unmodelled set is not read as fully modelled.
    const cfg = liveShapedConfig()
    cfg.apps.http.servers.srv0.routes[0].handle[0].routes[1].match = [
      { path: ['/os/*'] },
      { method: ['POST'] },
    ]
    const o = runProgram(PROG, cfg)
    const chain = o.routes[0].handlers.find((h) => h.upstreamDials.includes('stylique-os:4100')).matcherChain
    t('an unsupported key is attributed to ITS set, not the whole route',
      chain[1].matchSets.map((m) => m.unsupportedKeys.join(',')), ['', 'method'])
    t('…and the route-level list still names it', chain[1].unsupportedMatcherKeys, ['method'])
  }
  {
    // No `match` at all means "every request" — an empty set list, not a
    // missing field.
    const cfg = liveShapedConfig()
    delete cfg.apps.http.servers.srv0.routes[0].handle[0].routes[1].match
    const o = runProgram(PROG, cfg)
    const chain = o.routes[0].handlers.find((h) => h.upstreamDials.includes('stylique-os:4100')).matcherChain
    t('a route with no match emits an EMPTY set list, not a missing field',
      Array.isArray(chain[1].matchSets) && chain[1].matchSets.length === 0, true)
  }

  // ------------------------------------------------------------ refusal shapes
  {
    const cfg = liveShapedConfig()
    cfg.apps.http.servers.srv0.routes[0].handle[0].routes[1].match = [{ header: { 'X-Secret-Token': ['hunter2'] } }]
    const o4 = runProgram(PROG, cfg)
    const h = o4.routes[0].handlers.find((x) => x.upstreamDials.includes('stylique-os:4100'))
    t('an unmodelled matcher is reported by KEY NAME', h.unsupportedMatcherKeys, ['header'])
    t('…and its VALUE never leaves the host', JSON.stringify(o4).includes('hunter2'), false)
    t('…nor does the header name it was keyed by', JSON.stringify(o4).includes('X-Secret-Token'), false)
  }
  {
    // A handler list under a key that is not `routes` cannot be addressed
    // without guessing, so the handler is marked unaddressable.
    const cfg = liveShapedConfig()
    cfg.apps.http.servers.srv0.routes[0].handle[0].routes[1].handle[0] = {
      handler: 'mystery', branches: [{ handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'x:1' }] }] }],
    }
    const o5 = runProgram(PROG, cfg)
    const h = o5.routes[0].handlers.find((x) => x.handler === 'mystery')
    t('an unrecognised nesting key makes the handler UNADDRESSABLE', h.addressable, false)
    t('…and the handlers hidden under it are not walked',
      JSON.stringify(o5).includes('x:1'), false)
  }
  {
    const out6 = execFileSync('python3', ['-c', PROG], { input: 'not json at all', encoding: 'utf8' })
    t('unparseable input yields a clean null, not a traceback', out6.trim(), 'null')
  }

  // -------------------------------------------------- upstream identity fidelity
  {
    const cfg = liveShapedConfig()
    cfg.apps.http.servers.srv0.routes[0].handle[0].routes[1].handle[0].routes[0].handle[0].upstreams = [
      { dial: 'stylique-os:4100' },
      { dial: 'other:80', max_requests: 3, lookup_srv: 'x' },
    ]
    const o7 = runProgram(PROG, cfg)
    const h = o7.routes[0].handlers.find((x) => x.upstreamDials.includes('stylique-os:4100'))
    t('upstreams keep their INDEX, so a patch can delete by position',
      h.upstreams.map((u) => u.index), [0, 1])
    t('…and extra per-upstream fields are COUNTED, never emitted',
      h.upstreams.map((u) => u.extraKeyCount), [0, 2])
    t('…with none of those field values leaving the host',
      JSON.stringify(o7).includes('lookup_srv'), false)
  }

  if (failed) { console.error(`route-extractor selftest: ${failed} failed`); process.exit(1) }
  console.log('route-extractor selftest: all cases passed')
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntry) await main()
