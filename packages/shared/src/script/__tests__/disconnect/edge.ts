// Test helper for the disconnect tests (plan v5.3 item V). Not runtime code.
//
// The edge (`supabase/functions/generate-blueprint/index.ts`) cannot be unit-run,
// so a disconnect test does two things:
//   1. runs the shared function the edge calls with its switch on and off on a
//      fixed fictional input, and shows the output changes;
//   2. reads the edge source to prove the call and the switch are still there,
//      and, for an inline switch, evaluates the edge's own gate expression
//      (TypeScript stripped by esbuild) with the env var set both ways.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..')
export const EDGE_PATH = 'supabase/functions/generate-blueprint/index.ts'
export const readRepo = (p: string): string => readFileSync(join(REPO, p), 'utf8')
export const EDGE = readRepo(EDGE_PATH)

const CONTINUES = /^\s*(&&|\|\||\?|:)/

/**
 * The right-hand side of the first `const NAME =` (or `NAME =`) statement in the
 * edge whose line contains `mustInclude`, joined across continuation lines.
 */
export function edgeExpr(name: string, mustInclude = '', src: string = EDGE): string {
  const lines = src.split('\n')
  const re = new RegExp(`^\\s*(?:const |let )?${name}(?::[^=]+)? = (.*)$`)
  const at = lines.findIndex((l) => re.test(l) && l.includes(mustInclude))
  if (at < 0) throw new Error(`edge has no assignment to ${name}`)
  let expr = re.exec(lines[at]!)![1]!
  for (let i = at + 1; i < lines.length && CONTINUES.test(lines[i]!); i++) expr += ` ${lines[i]!.trim()}`
  return expr
}

/** Evaluates an edge expression with fake `Deno.env` and the given scope. */
export function evalEdge(expr: string, scope: Record<string, unknown>, env: Record<string, string | undefined> = {}): unknown {
  const code = transformSync(`(${expr})`, { loader: 'ts' }).code.trim().replace(/;$/, '')
  const Deno = { env: { get: (k: string) => env[k] } }
  const names = Object.keys(scope)
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(...names, 'Deno', `return ${code}`)(...names.map((n) => scope[n]), Deno)
}

/** The edge gate `const NAME = ...`, evaluated. */
export const edgeGate = (name: string, scope: Record<string, unknown>, env: Record<string, string | undefined> = {}): unknown =>
  evalEdge(edgeExpr(name), scope, env)

/** The edge text from the first `marker` on, `len` characters long. */
export function edgeAfter(marker: string, len = 1500, src: string = EDGE): string {
  const i = src.indexOf(marker)
  if (i < 0) throw new Error(`edge has no "${marker}"`)
  return src.slice(i, i + len)
}
