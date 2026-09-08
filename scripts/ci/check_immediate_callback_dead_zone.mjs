#!/usr/bin/env node
// A DEAD ZONE THE COMPILER CANNOT SEE, AND NEITHER COULD THE GUARD.
//
// ⚠️ MEASURED, ON CODE I WROTE AND ALMOST SHIPPED (#746). A `const` was declared
// AFTER an `.forEach` callback that read it. Every request would have thrown
// `ReferenceError` on the first beat — and:
//
//   · `tsc` exits 0. TS2448 is not raised, because a callback COULD run later;
//     the compiler cannot prove `.forEach` invokes it immediately, so it stays
//     silent rather than being wrong.
//   · `check_edge_functions_parse` exits 0 too, for the same reason — it treats
//     TS2448 as fatal, and TS2448 never arrives.
//
// Proven with a minimal repro before this guard was written: tsc silent, Node
// throws. Two checks whose whole job is "this function can boot" both passed a
// function that could not.
//
// ── WHY THIS IS NARROW ON PURPOSE ─────────────────────────────────────────
//
// ⚖️ IT ONLY LOOKS AT CALLBACKS THAT ARE INVOKED IMMEDIATELY BY CONSTRUCTION —
// the array methods that run their callback during the call itself. A callback
// stored, awaited, or passed to a timer may legitimately run after the
// declaration, and flagging those would produce a guard people learn to ignore.
//
// ⚖️ AND IT REPORTS A REFERENCE ONLY WHERE THE DECLARATION IS IN AN ENCLOSING
// SCOPE AND LATER IN THE FILE. A same-name binding declared INSIDE the callback,
// a parameter, or an import is not a dead-zone read; resolving through the scope
// chain rather than by name is what keeps this from firing on ordinary shadowing.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** The array methods that invoke their callback before returning.
 *
 *  ⚠️ `map` AND `filter` ARE HERE FOR THE SAME REASON `forEach` IS: they all
 *  call the function during the call. `setTimeout`, `then`, `addEventListener`
 *  and friends are deliberately absent — a later call is a legitimate program. */
const IMMEDIATE = new Set([
  'forEach', 'map', 'filter', 'some', 'every', 'find', 'findIndex',
  'flatMap', 'reduce', 'reduceRight', 'sort',
])

/** Every `const`/`let` name a block declares, with the position it is declared at. */
function blockDeclarations(block) {
  const out = new Map()
  for (const stmt of block.statements ?? []) {
    if (!ts.isVariableStatement(stmt)) continue
    const flags = ts.getCombinedNodeFlags(stmt.declarationList)
    // ⚖️ `var` IS EXCLUDED, AND THAT IS NOT AN OVERSIGHT. A `var` is hoisted and
    // initialised to undefined — a bug of a different kind, and not the
    // ReferenceError this guard exists to prevent.
    if (!(flags & (ts.NodeFlags.Const | ts.NodeFlags.Let))) continue
    for (const d of stmt.declarationList.declarations) {
      if (ts.isIdentifier(d.name)) out.set(d.name.text, d.name.getStart())
    }
  }
  return out
}

/** Names bound INSIDE this node — parameters, its own declarations, catch
 *  clauses — which shadow anything outside and are never a dead-zone read. */
function boundInside(node) {
  const names = new Set()
  const visit = (n) => {
    if (ts.isParameter(n) && ts.isIdentifier(n.name)) names.add(n.name.text)
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) names.add(n.name.text)
    else if (ts.isFunctionDeclaration(n) && n.name) names.add(n.name.text)
    else if (ts.isBindingElement(n) && ts.isIdentifier(n.name)) names.add(n.name.text)
    ts.forEachChild(n, visit)
  }
  ts.forEachChild(node, visit)
  for (const p of node.parameters ?? []) if (ts.isIdentifier(p.name)) names.add(p.name.text)
  return names
}

export function findImmediateCallbackDeadZones(source, fileLabel = 'input.ts') {
  // ⚠️ A `.tsx` FILE PARSED AS `.ts` IS NOT THE SAME PROGRAM, and this cost a
  // false positive: JSX read as type assertions produced an AST where the
  // component's function boundary was invisible, so a module constant declared
  // below a render callback looked like a dead-zone read. The extension decides
  // the dialect — guessing it is how a guard reports on a file it never parsed.
  const kind = /\.tsx$/.test(fileLabel) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(fileLabel, source, ts.ScriptTarget.ES2022, true, kind)
  const findings = []

  const walk = (node, enclosingBlocks) => {
    let blocks = enclosingBlocks
    // ⚠️ A FUNCTION BOUNDARY RESETS THE SEARCH, AND THE FIRST VERSION OF THIS
    // GUARD DID NOT DO IT — so it reported THREE FALSE POSITIVES on working
    // code. `selectRelevantKnowledge` reads a module-level `STOPWORDS` inside a
    // `.filter`, and the constant is declared further down the file: perfectly
    // safe, because the function is CALLED at runtime, long after the module
    // finished evaluating and every top-level `const` was initialised.
    //
    // ⚖️ THE DEAD ZONE NEEDS BOTH HALVES: the callback runs immediately, AND the
    // declaration is in a scope that is still being evaluated. Only blocks
    // between the call site and the innermost enclosing function satisfy the
    // second half — anything beyond that boundary has already finished.
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)
      || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)
      || ts.isConstructorDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)) {
      blocks = []
    }
    if (ts.isBlock(node) || ts.isSourceFile(node)) {
      blocks = [...blocks, { node, decls: blockDeclarations(node) }]
    }

    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && IMMEDIATE.has(node.expression.name.text)) {
      for (const arg of node.arguments) {
        if (!ts.isArrowFunction(arg) && !ts.isFunctionExpression(arg)) continue
        const shadowed = boundInside(arg)
        const seen = new Set()
        const scan = (n) => {
          if (ts.isIdentifier(n)
            && !(n.parent && ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)
            && !(n.parent && ts.isPropertyAssignment(n.parent) && n.parent.name === n)
            && !shadowed.has(n.text)) {
            for (const b of blocks) {
              const declAt = b.decls.get(n.text)
              // ⚠️ LATER IN THE FILE IS THE WHOLE TEST. A reference BEFORE the
              // declaration inside an immediately-run callback is the dead zone;
              // the same reference after it is ordinary code.
              if (declAt !== undefined && declAt > n.getStart() && !seen.has(n.text)) {
                seen.add(n.text)
                findings.push({
                  name: n.text,
                  line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
                  declaredOnLine: sf.getLineAndCharacterOfPosition(declAt).line + 1,
                  method: node.expression.name.text,
                })
              }
            }
          }
          ts.forEachChild(n, scan)
        }
        ts.forEachChild(arg, scan)
      }
    }
    ts.forEachChild(node, (c) => walk(c, blocks))
  }
  walk(sf, [])
  return findings
}

// ── selftest ───────────────────────────────────────────────────────────────
function selftest() {
  let failed = 0
  const t = (label, fn) => {
    const ok = fn()
    if (!ok) { failed++; console.error(`  FAIL: ${label}`) } else console.log(`  ok: ${label}`)
  }

  // ⚠️ THE EXACT SHAPE I ALMOST SHIPPED, and the reason this file exists.
  t('the #746 shape is caught', () => findImmediateCallbackDeadZones(`
    function f(rows) {
      const out = rows.filter((r) => nameable.has(r.id))
      const nameable = new Set(['a'])
      return out
    }
  `).some((h) => h.name === 'nameable'))

  t('the same read AFTER the declaration is fine', () => findImmediateCallbackDeadZones(`
    function f(rows) {
      const nameable = new Set(['a'])
      const out = rows.filter((r) => nameable.has(r.id))
      return out
    }
  `).length === 0)

  t('a name declared inside the callback is not a dead zone', () => findImmediateCallbackDeadZones(`
    function f(rows) {
      const out = rows.map((r) => { const nameable = r.id; return nameable })
      const nameable = 1
      return out
    }
  `).length === 0)

  t('a parameter of the callback is not a dead zone', () => findImmediateCallbackDeadZones(`
    function f(rows) {
      const out = rows.map((nameable) => nameable + 1)
      const nameable = 1
      return out
    }
  `).length === 0)

  // ⚖️ THE LIMIT, ASSERTED RATHER THAN ASSUMED. A deferred callback may
  // legitimately run after the declaration.
  // ⚠️ THE THREE FALSE POSITIVES THE FIRST VERSION PRODUCED, pinned as passing.
  // A function called at RUNTIME may read a module constant declared below it:
  // by the time the call happens the module has finished evaluating. Reporting
  // that is how a guard gets switched off.
  t('a runtime function reading a module const declared later is FINE', () =>
    findImmediateCallbackDeadZones(`
      export function pick(words) {
        return words.filter((w) => !STOPWORDS.has(w))
      }
      const STOPWORDS = new Set(['this'])
    `).length === 0)

  t('and the same shape inside a component, with the const below it', () =>
    findImmediateCallbackDeadZones(`
      function Card(rows) {
        const cells = rows.map((r) => LABEL[r.kind])
        return cells
      }
      const LABEL = { a: 'A' }
    `).length === 0)

  // ⚠️ THE THIRD FALSE POSITIVE, AND ITS CAUSE WAS THE PARSER, NOT THE RULE.
  // `ScriptEditor.tsx` reads a module-level `sameWords` inside a render
  // `.map` — safe, because the component runs at render time. It was reported
  // only because the file was parsed as `.ts`, and JSX read as type assertions
  // hid the component's own function boundary.
  t('a .tsx render callback reading a module const is FINE', () =>
    findImmediateCallbackDeadZones(
      'export function Card({script}) {\n'
      + '  return (<div>{script.scenes.map((s) => sameWords(s.a, s.b) ? null : <p/>)}</div>)\n'
      + '}\n'
      + 'const sameWords = (a, b) => a === b\n',
      'Card.tsx',
    ).length === 0)

  t('and the SAME shape in a .tsx is still caught inside one function body', () =>
    findImmediateCallbackDeadZones(
      'export function Card({rows}) {\n'
      + '  const out = rows.map((r) => nameable.has(r.id))\n'
      + '  const nameable = new Set()\n'
      + '  return <p>{out.length}</p>\n'
      + '}\n',
      'Card.tsx',
    ).some((h) => h.name === 'nameable'))

  t('a deferred callback is NOT reported', () => findImmediateCallbackDeadZones(`
    function f() {
      setTimeout(() => later + 1, 0)
      const later = 1
      return later
    }
  `).length === 0)

  t('a property NAME that matches is not a reference', () => findImmediateCallbackDeadZones(`
    function f(rows) {
      const out = rows.map((r) => r.nameable)
      const nameable = 1
      return out
    }
  `).length === 0)

  t('var is not reported — hoisting is a different bug', () => findImmediateCallbackDeadZones(`
    function f(rows) {
      const out = rows.map((r) => hoisted);
      var hoisted = 1
      return out
    }
  `).length === 0)

  if (failed) { console.error(`immediate-callback dead-zone selftest: ${failed} failed`); process.exit(1) }
  console.log('immediate-callback dead-zone selftest: OK')
}

const SCAN_DIRS = ['supabase/functions', 'packages/shared/src', 'apps/web/src', 'worker/src']

function tsFiles(dir) {
  const out = []
  const walk = (d) => {
    let entries
    try { entries = readdirSync(d) } catch { return }
    for (const name of entries) {
      if (name === 'node_modules' || name === 'dist' || name === '__tests__') continue
      const p = join(d, name)
      if (statSync(p).isDirectory()) { walk(p); continue }
      if (!/\.(ts|tsx)$/.test(p) || /\.(test|spec)\.tsx?$/.test(p)) continue
      out.push(p)
    }
  }
  walk(dir)
  return out
}

// ⚠️ ONLY WHEN RUN DIRECTLY. Without this the scan executes on IMPORT, so the
// test that exercises `findImmediateCallbackDeadZones` would also run the whole
// repository scan and inherit its exit code — a test that fails for a reason
// that has nothing to do with the case it is asserting.
const RUN_DIRECTLY = process.argv[1] && process.argv[1].endsWith('check_immediate_callback_dead_zone.mjs')
if (!RUN_DIRECTLY) { /* imported for its function only */ }
else {

if (process.argv.includes('--selftest')) { selftest(); process.exit(0) }

selftest()
const problems = []
let scanned = 0
for (const rel of SCAN_DIRS) {
  for (const file of tsFiles(join(REPO, rel))) {
    scanned++
    const hits = findImmediateCallbackDeadZones(readFileSync(file, 'utf8'), file)
    for (const h of hits) {
      problems.push(`${relative(REPO, file)}:${h.line} reads \`${h.name}\` inside a .${h.method}() `
        + `callback, and \`${h.name}\` is declared on line ${h.declaredOnLine}. `
        + `The callback runs during the call, so this throws ReferenceError at runtime — `
        + `and tsc does not say so, because a callback COULD run later.`)
    }
  }
}

if (problems.length) {
  console.error('A DEAD ZONE THE COMPILER CANNOT SEE:\n')
  for (const p of problems) console.error(`  ${p}\n`)
  console.error('Move the declaration above its first read.')
  process.exit(1)
}
console.log(`immediate-callback dead-zone guard: OK (${scanned} files, no reads before declaration)`)

}
