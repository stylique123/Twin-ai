#!/usr/bin/env node
// NO LOCAL NAME IS BOUND TWICE IN AN EDGE FUNCTION MODULE.
//
// ── THE RUN THIS EXISTS FOR ───────────────────────────────────────────────
//
// `generate-blueprint/index.ts` imported two different functions, both named
// `guardScript`, from two modules. Deno refused to boot the function with
// "Identifier 'guardScript' has already been declared" — a production outage.
// Nothing at PR time caught it, and `check_edge_functions_parse.mjs` did not
// either (its verdict denies specific diagnostic codes; a duplicate import
// binding is reported by the checker, not the parser). #1279 fixed the clash;
// this guard keeps it fixed.
//
// What it checks, per supabase/functions/**/index.ts and _shared/*.ts:
//   every import binding (default, namespace, named, `as` alias) plus every
//   top-level const/let/var/function/class/enum name. Any name bound twice
//   fails. `import type` bindings are skipped against each other only when
//   both sides are type-only (they erase); a type-only import colliding with a
//   value is still reported, since it is confusing at best.
//   Function overload signatures (no body) do not count as declarations.
//
// Uses the TypeScript compiler API (a declared devDependency), so it runs in
// the pr-checks job after `npm ci`.
//
//   node scripts/ci/check_edge_duplicate_imports.mjs [--selftest]

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = new URL("../../", import.meta.url).pathname;
const FN_DIR = join(ROOT, "supabase/functions");

export function findDuplicates(source, fileName = "x.ts") {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  /** @type {Map<string, {kind: string, typeOnly: boolean, line: number}[]>} */
  const seen = new Map();
  const add = (nameNode, kind, typeOnly) => {
    const name = nameNode.text;
    const line = sf.getLineAndCharacterOfPosition(nameNode.getStart(sf)).line + 1;
    if (!seen.has(name)) seen.set(name, []);
    seen.get(name).push({ kind, typeOnly, line });
  };
  const addBindingName = (n, kind) => {
    if (ts.isIdentifier(n)) add(n, kind, false);
    else for (const el of n.elements) if (!ts.isOmittedExpression(el)) addBindingName(el.name, kind);
  };
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && st.importClause) {
      const ic = st.importClause;
      const clauseType = !!ic.isTypeOnly;
      if (ic.name) add(ic.name, "import default", clauseType);
      const nb = ic.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) add(nb.name, "import * as", clauseType);
      if (nb && ts.isNamedImports(nb))
        for (const el of nb.elements) add(el.name, "import", clauseType || !!el.isTypeOnly);
    } else if (ts.isImportEqualsDeclaration(st)) {
      add(st.name, "import =", !!st.isTypeOnly);
    } else if (ts.isVariableStatement(st)) {
      const f = st.declarationList.flags;
      const kind = f & ts.NodeFlags.Const ? "const" : f & ts.NodeFlags.Let ? "let" : "var";
      for (const d of st.declarationList.declarations) addBindingName(d.name, kind);
    } else if (ts.isFunctionDeclaration(st) && st.name && st.body) {
      add(st.name, "function", false);
    } else if (ts.isClassDeclaration(st) && st.name) {
      add(st.name, "class", false);
    } else if (ts.isEnumDeclaration(st)) {
      add(st.name, "enum", false);
    }
  }
  const out = [];
  for (const [name, decls] of seen) {
    if (decls.length < 2) continue;
    if (decls.every((d) => d.typeOnly)) continue;
    out.push({ name, decls });
  }
  return out;
}

function listFiles() {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e === "index.ts") files.push(p);
    }
  };
  walk(FN_DIR);
  const shared = join(FN_DIR, "_shared");
  for (const e of readdirSync(shared)) if (e.endsWith(".ts")) files.push(join(shared, e));
  return [...new Set(files)].sort();
}

function selftest() {
  const cases = [
    ["the guardScript outage", `import { guardScript } from "./a.ts";\nimport { guardScript } from "../_shared/b.ts";\n`, ["guardScript"]],
    ["alias collides with named", `import { x as guardScript } from "./a.ts";\nimport { guardScript } from "./b.ts";\n`, ["guardScript"]],
    ["alias resolves the clash", `import { guardScript } from "./a.ts";\nimport { guardScript as guardScript2 } from "./b.ts";\n`, []],
    ["default vs named", `import guardScript from "./a.ts";\nimport { guardScript } from "./b.ts";\n`, ["guardScript"]],
    ["namespace vs const", `import * as ns from "./a.ts";\nconst ns = 1;\n`, ["ns"]],
    ["import vs function", `import { f } from "./a.ts";\nfunction f() {}\n`, ["f"]],
    ["import vs class", `import { C } from "./a.ts";\nclass C {}\n`, ["C"]],
    ["import vs destructured let", `import { a } from "./a.ts";\nlet { b, c: [a] } = o;\n`, ["a"]],
    ["inner scope shadowing is fine", `import { a } from "./a.ts";\nfunction g() { const a = 2; return a; }\n`, []],
    ["overloads are one function", `function f(a: string): void;\nfunction f(a: number): void;\nfunction f(a: unknown) {}\n`, []],
    ["type-only twins erase", `import type { T } from "./a.ts";\nimport type { T } from "./b.ts";\n`, []],
    ["multiline import block", `import {\n  a,\n  guardScript,\n} from "./a.ts";\nimport {\n  guardScript,\n} from "./b.ts";\n`, ["guardScript"]],
  ];
  let bad = 0;
  for (const [label, src, want] of cases) {
    const got = findDuplicates(src).map((d) => d.name).sort();
    const ok = JSON.stringify(got) === JSON.stringify([...want].sort());
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: got [${got}] want [${want}]`);
  }
  if (bad) { console.error(`selftest: ${bad} case(s) failed`); process.exit(1); }
  console.log("selftest: all cases pass");
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (!isMain) {
  // imported as a module
} else if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const files = listFiles();
  let failures = 0;
  for (const f of files) {
    for (const { name, decls } of findDuplicates(readFileSync(f, "utf8"), f)) {
      failures++;
      const where = decls.map((d) => `${d.kind} @ line ${d.line}`).join(", ");
      console.error(`::error file=${relative(ROOT, f)}::'${name}' is declared ${decls.length} times (${where}). Deno will refuse to boot with "Identifier '${name}' has already been declared".`);
    }
  }
  if (failures) { console.error(`\n${failures} duplicate binding(s) across ${files.length} files.`); process.exit(1); }
  console.log(`edge duplicate imports: ${files.length} files, no name bound twice.`);
}
