// Lets plain `node --experimental-strip-types` load the shared TypeScript
// sources, which import siblings as './x.js'. A relative '.js' specifier that
// does not exist is retried as '.ts'. Offline only; no network, no I/O.
//   node --experimental-strip-types --import ./scripts/quality/tsLoader.mjs <script>
import { register } from 'node:module'

const hook = `export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx) } catch (e) {
    if (/^\\.{1,2}\\//.test(spec) && spec.endsWith('.js')) return next(spec.slice(0, -3) + '.ts', ctx)
    throw e
  }
}`
register('data:text/javascript,' + encodeURIComponent(hook))
