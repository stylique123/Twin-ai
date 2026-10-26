#!/usr/bin/env node
// AUDIT SET V2 — FIELD FILL BY PRODUCT KIND (plan v6.8 §34). NOT RUN YET.
//
// Reads saved product pages from a LOCAL directory and reports, per kind
// (physical, digital, software, service, course), how often each page fact
// (title, h1, meta_description, cta_texts, price) was filled.
//
// This script makes NO network call and fetches nothing. Real pages are fetched
// separately (about $0.02 of Apify) only after the owner turns paid calls back
// on. Keep them OUTSIDE the repo: the repo is public and must hold only the
// fictional fixtures. Print aggregate rates only, never page text.
//
//   node scripts/audit/field_fill_by_kind.mjs <dir>
//
// <dir> holds the HTML files plus manifest.json: { "pages": [{ "file", "kind" }] }.
// With no <dir> it runs on the committed FICTIONAL fixtures, as a smoke check.
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FIXTURES = join(REPO, 'packages/shared/src/creator/fixtures/auditSetV2')
const dir = process.argv[2] ?? FIXTURES

const out = mkdtempSync(join(tmpdir(), 'fill-by-kind-'))
try {
  const file = join(out, 'auditSetV2.mjs')
  await build({ entryPoints: [join(REPO, 'packages/shared/src/creator/auditSetV2.ts')], bundle: true, format: 'esm', platform: 'node', outfile: file, logLevel: 'silent' })
  const { extractPageFacts, fieldFillByKind, PRODUCT_KINDS } = await import(pathToFileURL(file).href)

  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  const list = manifest.pages ?? manifest.entries
  const pages = list.map((p) => {
    if (!PRODUCT_KINDS.includes(p.kind)) throw new Error(`unknown kind for ${p.file}`)
    return { kind: p.kind, facts: extractPageFacts(readFileSync(join(dir, p.file), 'utf8')) }
  })
  const report = fieldFillByKind(pages)
  console.log(`field fill by kind (${pages.length} pages, ${dir === FIXTURES ? 'fictional fixtures' : 'local dir'})`)
  for (const [kind, r] of Object.entries(report)) {
    console.log(`${kind.padEnd(9)} n=${r.pages}  ` + Object.entries(r.fill).map(([f, v]) => `${f}=${Math.round(v * 100)}%`).join('  '))
  }
} finally {
  rmSync(out, { recursive: true, force: true })
}
